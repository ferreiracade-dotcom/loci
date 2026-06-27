import { getDb } from '../db/connection'
import { getApiBibleKey, getEsvKey } from './config'
import { bookByCode, parseReference, refLabel } from '../../shared/scriptureRef'
import type {
  ScriptureProvider,
  ScripturePassage,
  ScriptureTranslation,
  ScriptureVerse
} from '../../shared/ipc'

// Bible reader data layer. Translations are resolved through a small registry; each routes
// to a provider adapter. Public-domain/CC chapters are cached in SQLite (offline-capable);
// copyrighted ones (added in 8c via API.Bible / ESV keys) are session-only per their terms.

interface RegEntry {
  id: string
  name: string
  abbr: string
  provider: ScriptureProvider
  /** Translation/version id at the provider (Free-Use code; resolved bibleId; '' for ESV). */
  providerId: string
  cachePolicy: 'full' | 'session'
  copyright: string | null
}

const FREE_USE: RegEntry[] = [
  {
    id: 'BSB',
    name: 'Berean Standard Bible',
    abbr: 'BSB',
    provider: 'free-use',
    providerId: 'BSB',
    cachePolicy: 'full',
    copyright: 'Berean Standard Bible (BSB). Public domain. berean.bible'
  }
]

// Copyrighted translations we try to light up from an API.Bible key. The bibleId is
// resolved from the account's catalog at runtime (the key's Starter plan picks decide
// what is actually available), matched by abbreviation/name.
const API_BIBLE_WANTED: { id: string; name: string; abbr: string; match: RegExp }[] = [
  { id: 'NKJV', name: 'New King James Version', abbr: 'NKJV', match: /nkjv|new king james/i },
  { id: 'NASB', name: 'New American Standard Bible', abbr: 'NASB', match: /nasb|new american standard/i }
]

const ESV_ENTRY: RegEntry = {
  id: 'ESV',
  name: 'English Standard Version',
  abbr: 'ESV',
  provider: 'esv',
  providerId: '',
  cachePolicy: 'session',
  copyright:
    'Scripture quotations are from the ESV® Bible (The Holy Bible, English Standard Version®), © Crossway. Used by permission. All rights reserved.'
}

// Resolved registry is cached and rebuilt only when the set of configured keys changes.
let resolvedRegistry: RegEntry[] | null = null
let resolvedSig = ''

/** Invalidate the cached registry (call when a Scripture API key changes). */
export function invalidateRegistry(): void {
  resolvedRegistry = null
}

async function getRegistry(): Promise<RegEntry[]> {
  const apiBibleKey = getApiBibleKey()
  const esvKey = getEsvKey()
  const sig = `${apiBibleKey ? '1' : '0'}:${esvKey ? '1' : '0'}`
  if (resolvedRegistry && resolvedSig === sig) return resolvedRegistry
  const out: RegEntry[] = [...FREE_USE]
  if (apiBibleKey) out.push(...(await resolveApiBible(apiBibleKey)))
  if (esvKey) out.push(ESV_ENTRY)
  resolvedRegistry = out
  resolvedSig = sig
  return out
}

function toPublic(e: RegEntry): ScriptureTranslation {
  return { id: e.id, name: e.name, abbr: e.abbr, provider: e.provider, copyright: e.copyright }
}

export async function listTranslations(): Promise<ScriptureTranslation[]> {
  return (await getRegistry()).map(toPublic)
}

// ---- Free Use Bible API (bible.helloao.org) — no key, fully cacheable ----

const FU_BASE = 'https://bible.helloao.org'

interface FuBook {
  id: string
  order: number
}
interface FuBooksResponse {
  books?: FuBook[]
}
type FuVerseContent = string | { text?: string }
interface FuContentItem {
  type?: string
  number?: number
  content?: FuVerseContent[]
}
interface FuChapterResponse {
  chapter?: { content?: FuContentItem[] }
}

// Map our canonical 1-66 order to the provider's book id, per translation (cached in memory).
const fuBooksCache = new Map<string, Map<number, string>>()

async function fuBookId(translationId: string, code: string): Promise<string> {
  const def = bookByCode(code)
  if (!def) return code
  let map = fuBooksCache.get(translationId)
  if (!map) {
    map = new Map<number, string>()
    try {
      const res = await fetch(`${FU_BASE}/api/${translationId}/books.json`)
      if (res.ok) {
        const data = (await res.json()) as FuBooksResponse | FuBook[]
        const arr = Array.isArray(data) ? data : (data.books ?? [])
        for (const b of arr) if (typeof b.order === 'number' && b.id) map.set(b.order, b.id)
      }
    } catch {
      /* fall back to the USFM code below */
    }
    fuBooksCache.set(translationId, map)
  }
  return map.get(def.order) ?? code
}

function flattenVerse(content: FuVerseContent[] | undefined): string {
  if (!content) return ''
  const parts: string[] = []
  for (const c of content) {
    if (typeof c === 'string') parts.push(c)
    else if (c && typeof c.text === 'string') parts.push(c.text)
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim()
}

async function fuChapter(translationId: string, code: string, chapter: number): Promise<ScriptureVerse[]> {
  const bookId = await fuBookId(translationId, code)
  const res = await fetch(`${FU_BASE}/api/${translationId}/${bookId}/${chapter}.json`)
  if (!res.ok) throw new Error(`Free Use Bible API ${res.status}`)
  const data = (await res.json()) as FuChapterResponse
  const verses: ScriptureVerse[] = []
  for (const item of data.chapter?.content ?? []) {
    if (item?.type === 'verse' && typeof item.number === 'number') {
      const text = flattenVerse(item.content)
      if (text) verses.push({ verse: item.number, text })
    }
  }
  return verses
}

// API.Bible and ESV text endpoints return a chapter as plain text with inline verse
// markers like "[1] In the beginning…[2]…". Split on those markers into verses.
function parseBracketVerses(text: string): ScriptureVerse[] {
  const verses: ScriptureVerse[] = []
  const re = /\[(\d+)\]\s*/g
  let m: RegExpExecArray | null
  let last: { verse: number; start: number } | null = null
  while ((m = re.exec(text))) {
    if (last) {
      verses.push({ verse: last.verse, text: text.slice(last.start, m.index).replace(/\s+/g, ' ').trim() })
    }
    last = { verse: Number(m[1]), start: m.index + m[0].length }
  }
  if (last) verses.push({ verse: last.verse, text: text.slice(last.start).replace(/\s+/g, ' ').trim() })
  return verses.filter((v) => v.text)
}

// ---- API.Bible (scripture.api.bible) — NKJV/NASB via the user's Starter key ----

const AB_BASE = 'https://api.scripture.api.bible/v1'

interface AbBible {
  id: string
  abbreviation?: string
  abbreviationLocal?: string
  name?: string
  copyright?: string
}
interface AbBiblesResponse {
  data?: AbBible[]
}
interface AbChapterResponse {
  data?: { content?: string; copyright?: string }
}

async function resolveApiBible(key: string): Promise<RegEntry[]> {
  let bibles: AbBible[] = []
  try {
    const res = await fetch(`${AB_BASE}/bibles?language=eng`, { headers: { 'api-key': key } })
    if (res.ok) bibles = ((await res.json()) as AbBiblesResponse).data ?? []
  } catch {
    return []
  }
  const out: RegEntry[] = []
  for (const want of API_BIBLE_WANTED) {
    const hit = bibles.find((b) =>
      [b.abbreviation, b.abbreviationLocal, b.name].some((s) => s && want.match.test(s))
    )
    if (hit) {
      out.push({
        id: want.id,
        name: want.name,
        abbr: want.abbr,
        provider: 'api-bible',
        providerId: hit.id,
        cachePolicy: 'session',
        copyright: hit.copyright ?? `${want.name} — used by permission.`
      })
    }
  }
  return out
}

async function apiBibleChapter(bibleId: string, code: string, chapter: number): Promise<ScriptureVerse[]> {
  const key = getApiBibleKey()
  if (!key) throw new Error('API.Bible key missing')
  const params =
    'content-type=text&include-verse-numbers=true&include-notes=false&include-titles=false' +
    '&include-chapter-numbers=false&include-verse-spans=false'
  const res = await fetch(`${AB_BASE}/bibles/${bibleId}/chapters/${code}.${chapter}?${params}`, {
    headers: { 'api-key': key }
  })
  if (!res.ok) throw new Error(`API.Bible ${res.status}`)
  const data = (await res.json()) as AbChapterResponse
  return parseBracketVerses(data.data?.content ?? '')
}

// ---- Crossway ESV API (api.esv.org) — session-only per their caching terms ----

interface EsvResponse {
  passages?: string[]
}

async function esvChapter(code: string, chapter: number): Promise<ScriptureVerse[]> {
  const key = getEsvKey()
  if (!key) throw new Error('ESV key missing')
  const def = bookByCode(code)
  const q = encodeURIComponent(`${def?.name ?? code} ${chapter}`)
  const params =
    `q=${q}&include-passage-references=false&include-verse-numbers=true&include-footnotes=false` +
    '&include-headings=false&include-short-copyright=false&include-passage-horizontal-lines=false' +
    '&include-heading-horizontal-lines=false&indent-paragraphs=0&indent-poetry=false'
  const res = await fetch(`https://api.esv.org/v3/passage/text/?${params}`, {
    headers: { Authorization: `Token ${key}` }
  })
  if (!res.ok) throw new Error(`ESV API ${res.status}`)
  const data = (await res.json()) as EsvResponse
  return parseBracketVerses((data.passages ?? []).join('\n'))
}

async function fetchChapter(entry: RegEntry, code: string, chapter: number): Promise<ScriptureVerse[]> {
  switch (entry.provider) {
    case 'free-use':
      return fuChapter(entry.providerId, code, chapter)
    case 'api-bible':
      return apiBibleChapter(entry.providerId, code, chapter)
    case 'esv':
      return esvChapter(code, chapter)
  }
}

// ---- caching ----

function readCache(translation: string, book: string, chapter: number): ScriptureVerse[] | null {
  const row = getDb()
    .prepare('SELECT json FROM scripture_cache WHERE translation = ? AND book = ? AND chapter = ?')
    .get(translation, book, chapter) as { json: string } | undefined
  if (!row) return null
  try {
    return JSON.parse(row.json) as ScriptureVerse[]
  } catch {
    return null
  }
}

function writeCache(translation: string, book: string, chapter: number, verses: ScriptureVerse[]): void {
  getDb()
    .prepare(
      `INSERT OR REPLACE INTO scripture_cache (translation, book, chapter, json, fetched_at)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(translation, book, chapter, JSON.stringify(verses), Date.now())
}

// Session-only cache for copyrighted translations (never persisted, per ABS/Crossway terms).
const sessionCache = new Map<string, ScriptureVerse[]>()

async function loadChapter(entry: RegEntry, code: string, chapter: number): Promise<ScriptureVerse[]> {
  const key = `${entry.id}:${code}:${chapter}`
  if (entry.cachePolicy === 'full') {
    const cached = readCache(entry.id, code, chapter)
    if (cached) return cached
  } else {
    const s = sessionCache.get(key)
    if (s) return s
  }
  const verses = await fetchChapter(entry, code, chapter)
  if (entry.cachePolicy === 'full') writeCache(entry.id, code, chapter, verses)
  else sessionCache.set(key, verses)
  return verses
}

// ---- public API ----

/** A whole chapter for the reader (all verses, no highlight). */
export async function getChapter(
  translation: string,
  book: string,
  chapter: number
): Promise<ScripturePassage | null> {
  const reg = await getRegistry()
  const entry = reg.find((r) => r.id === translation) ?? reg[0]
  const def = bookByCode(book)
  if (!entry || !def) return null
  if (chapter < 1 || chapter > def.chapters) return null
  const verses = await loadChapter(entry, def.code, chapter)
  return {
    translation: entry.id,
    translationName: entry.name,
    reference: `${def.name} ${chapter}`,
    book: def.code,
    bookName: def.name,
    chapter,
    verses,
    highlight: [],
    copyright: entry.copyright
  }
}

/** Resolve a reference string (e.g. "Rom 3:28") to just its verse(s), for hover/click. */
export async function getPassage(
  translation: string,
  ref: string
): Promise<ScripturePassage | null> {
  const parsed = parseReference(ref)
  if (!parsed) return null
  const chap = await getChapter(translation, parsed.book, parsed.chapter)
  if (!chap) return null
  const start = parsed.verseStart
  if (start == null) return chap
  const end = parsed.verseEnd ?? start
  const verses = chap.verses.filter((v) => v.verse >= start && v.verse <= end)
  return { ...chap, reference: refLabel(parsed), verses, highlight: verses.map((v) => v.verse) }
}
