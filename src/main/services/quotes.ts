import { randomUUID } from 'crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { getDb } from '../db/connection'
import { readConfig } from './config'
import * as search from './search'
import {
  formatCitation,
  parseAuthors,
  scriptureCitation,
  type CitationSource,
  type ScriptureCiteRef
} from '../../shared/citation'
import { bookByCode } from '../../shared/scriptureRef'
import { sanitizeName } from './library'
import type {
  Annotation,
  NewQuote,
  NewScriptureHighlight,
  Quote,
  ScriptureHighlight,
  ScriptureQuoteBook
} from '../../shared/ipc'

interface BookMetaRow {
  title: string
  title_sanitized: string
  author: string | null
  publisher: string | null
  city: string | null
  year: number | null
  page_offset: number
}

interface QuoteRow {
  id: string
  book_id: string | null
  text: string
  page: number | null
  color: string
  note_path: string | null
  used_in: string
  created: number
  annotation: string
  scripture_ref: string | null
  scripture_translation: string | null
}

/** Parse a stored canonical ref like "JHN 3:16-18" into its parts. */
function parseScriptureRef(
  ref: string,
  abbr: string
): ScriptureCiteRef | null {
  const m = ref.match(/^(\S+)\s+(\d+):(\d+)(?:-(\d+))?$/)
  if (!m) return null
  const def = bookByCode(m[1])
  return {
    bookName: def?.name ?? m[1],
    chapter: Number(m[2]),
    verseStart: Number(m[3]),
    verseEnd: m[4] ? Number(m[4]) : null,
    abbr
  }
}

interface SidecarQuote {
  id: string
  text: string
  anchor: { page: number | null; offset: number | null }
  color: string
  tags: string[]
  annotations: Annotation[]
  source: { title: string; author: string | null; page: number | null }
  used_in: string[]
}

/** Parse the stored annotation column; tolerate a legacy single-string value. */
function parseAnnotations(raw: string): Annotation[] {
  if (!raw) return []
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v) ? (v as Annotation[]) : []
  } catch {
    return [{ id: randomUUID(), text: raw, createdAt: Date.now() }]
  }
}

function sourceFor(b: BookMetaRow): CitationSource {
  return {
    kind: 'book',
    authors: parseAuthors(b.author),
    title: b.title,
    publisher: b.publisher,
    city: b.city,
    year: b.year
  }
}

/** Printed page = stored (PDF) page minus the book's front-matter offset. */
function printedPage(b: BookMetaRow, page: number | null): number | null {
  if (page == null) return null
  return page - (b.page_offset ?? 0)
}

function citationFor(b: BookMetaRow, page: number | null): string {
  return formatCitation(sourceFor(b), 'footnote', printedPage(b, page))
}

/** CMOS 18 bibliography entries for every book that has at least one quote. */
export function buildBibliography(): { entry: string; quotes: number }[] {
  const rows = getDb()
    .prepare(
      `SELECT b.title, b.author, b.publisher, b.city, b.year,
              (SELECT COUNT(*) FROM quotes q WHERE q.book_id = b.id) AS qn
       FROM books b
       WHERE EXISTS (SELECT 1 FROM quotes q WHERE q.book_id = b.id)`
    )
    .all() as {
    title: string
    author: string | null
    publisher: string | null
    city: string | null
    year: number | null
    qn: number
  }[]
  const items = rows.map((r) => {
    const authors = parseAuthors(r.author)
    const src: CitationSource = {
      kind: 'book',
      authors,
      title: r.title,
      publisher: r.publisher,
      city: r.city,
      year: r.year
    }
    const sortKey = (authors[0]?.trim().split(/\s+/).pop() || r.title).toLowerCase()
    return { entry: formatCitation(src, 'bibliography', null), quotes: r.qn, sortKey }
  })
  items.sort((a, b) => a.sortKey.localeCompare(b.sortKey))
  return items.map((x) => ({ entry: x.entry, quotes: x.quotes }))
}

function bookMeta(bookId: string): BookMetaRow | undefined {
  return getDb()
    .prepare(
      'SELECT title, title_sanitized, author, publisher, city, year, page_offset FROM books WHERE id = ?'
    )
    .get(bookId) as BookMetaRow | undefined
}

function noteRelPath(sanitized: string): string {
  return `notes/${sanitized}/${sanitized}.md`
}

function ensureNote(vault: string, b: BookMetaRow): string {
  const rel = noteRelPath(b.title_sanitized)
  const abs = join(vault, rel)
  if (!existsSync(abs)) {
    mkdirSync(dirname(abs), { recursive: true })
    const fm =
      `---\n` +
      `title: ${b.title.replace(/\r?\n/g, ' ')}\n` +
      `author: ${b.author ?? ''}\n` +
      `type: book-note\n` +
      `---\n\n# ${b.title}\n\n`
    writeFileSync(abs, fm, 'utf-8')
  }
  return rel
}

/** Markdown for one quote: the blockquote, its citation, then any annotations. */
function buildBlock(id: string, text: string, citation: string, annotations: Annotation[]): string {
  const quoted = text.replace(/\r?\n+/g, '\n> ')
  const body = annotations
    .map((a) => a.text.trim())
    .filter(Boolean)
    .join('\n\n')
  const ann = body ? `\n${body}\n` : '\n'
  return `<!-- quote:${id} -->\n> ${quoted}\n>\n> — ${citation}\n${ann}<!-- /quote:${id} -->`
}

/** Insert or replace a quote's block in the note, keyed on its id markers. */
function upsertQuoteBlock(vault: string, rel: string, id: string, block: string): void {
  const abs = join(vault, rel)
  let txt = existsSync(abs) ? readFileSync(abs, 'utf-8') : ''
  const re = new RegExp(`<!-- quote:${id} -->[\\s\\S]*?<!-- /quote:${id} -->`)
  if (re.test(txt)) {
    txt = txt.replace(re, block)
  } else {
    txt = `${txt}${txt.endsWith('\n') ? '' : '\n'}\n${block}\n`
  }
  writeFileSync(abs, txt, 'utf-8')
}

function removeQuoteBlock(vault: string, rel: string | null, id: string): void {
  if (!rel) return
  const abs = join(vault, rel)
  if (!existsSync(abs)) return
  const txt = readFileSync(abs, 'utf-8')
  const re = new RegExp(`\\n?<!-- quote:${id} -->[\\s\\S]*?<!-- /quote:${id} -->\\n?`)
  writeFileSync(abs, txt.replace(re, '\n'), 'utf-8')
}

function sidecarPath(vault: string, sanitized: string): string {
  return join(vault, 'highlights', `${sanitized}.highlights.json`)
}

function readSidecar(p: string): SidecarQuote[] {
  if (!existsSync(p)) return []
  try {
    return JSON.parse(readFileSync(p, 'utf-8')) as SidecarQuote[]
  } catch {
    return []
  }
}

function writeSidecar(p: string, list: SidecarQuote[]): void {
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(p, JSON.stringify(list, null, 2), 'utf-8')
}

function rowToQuote(r: QuoteRow): Quote {
  const b = r.book_id ? bookMeta(r.book_id) : undefined
  const tags = (
    getDb()
      .prepare(
        'SELECT t.name FROM quote_tags qt JOIN tags t ON t.id = qt.tag_id WHERE qt.quote_id = ? ORDER BY t.name'
      )
      .all(r.id) as { name: string }[]
  ).map((x) => x.name)
  let usedIn: string[] = []
  try {
    usedIn = JSON.parse(r.used_in || '[]') as string[]
  } catch {
    usedIn = []
  }
  let citation = b ? citationFor(b, r.page) : ''
  let scriptureChapter: number | undefined
  if (r.scripture_ref) {
    const sref = parseScriptureRef(r.scripture_ref, r.scripture_translation ?? '')
    if (sref) {
      citation = scriptureCitation(sref)
      scriptureChapter = sref.chapter
    }
  }
  return {
    id: r.id,
    bookId: r.book_id ?? '',
    text: r.text,
    page: r.page,
    color: r.color,
    tags,
    annotations: parseAnnotations(r.annotation ?? ''),
    citation,
    notePath: r.note_path,
    usedIn,
    createdAt: r.created,
    scriptureChapter
  }
}

/** Refresh the FTS row for a quote (text + annotations + tags). */
function reindexQuote(quoteId: string): void {
  const row = getDb().prepare('SELECT * FROM quotes WHERE id = ?').get(quoteId) as QuoteRow | undefined
  if (!row) return
  const q = rowToQuote(row)
  const b = row.book_id ? bookMeta(row.book_id) : undefined
  const content = [q.text, ...q.annotations.map((a) => a.text), q.tags.map((t) => `#${t}`).join(' ')]
    .filter(Boolean)
    .join('\n')
  const title = b?.title ?? (row.scripture_ref ? q.citation : '')
  search.indexQuote({ id: q.id, bookId: q.bookId || null, content, page: q.page, title })
}

export function addQuote(input: NewQuote): Quote {
  const vault = readConfig().vaultPath
  const b = bookMeta(input.bookId)
  if (!vault || !b) throw new Error('Book or vault not found')

  const id = randomUUID()
  const color = input.color ?? 'amber'
  const page = input.page ?? null
  const citation = citationFor(b, page)

  const rel = ensureNote(vault, b)
  upsertQuoteBlock(vault, rel, id, buildBlock(id, input.text, citation, []))

  const sp = sidecarPath(vault, b.title_sanitized)
  const list = readSidecar(sp)
  list.push({
    id,
    text: input.text,
    anchor: { page, offset: null },
    color,
    tags: [],
    annotations: [],
    source: { title: b.title, author: b.author, page },
    used_in: [rel]
  })
  writeSidecar(sp, list)

  getDb()
    .prepare(
      `INSERT INTO quotes (id, book_id, text, page, color, note_path, used_in, created)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(id, input.bookId, input.text, page, color, rel, JSON.stringify([rel]), Date.now())
  getDb().prepare('UPDATE books SET quote_count = quote_count + 1 WHERE id = ?').run(input.bookId)

  reindexQuote(id)
  const row = getDb().prepare('SELECT * FROM quotes WHERE id = ?').get(id) as QuoteRow
  return rowToQuote(row)
}

export function listQuotes(bookId: string): Quote[] {
  const rows = getDb()
    .prepare('SELECT * FROM quotes WHERE book_id = ? ORDER BY page IS NULL, page, created')
    .all(bookId) as QuoteRow[]
  return rows.map(rowToQuote)
}

// Scripture highlights live in one note per translation+book, with `## Chapter N` sections —
// the location-anchored analog of a book's auto-note.
function scriptureNoteRel(translation: string, bookName: string): string {
  return `notes/scripture/${sanitizeName(translation)}/${sanitizeName(bookName)}.md`
}

function ensureScriptureNote(vault: string, translation: string, bookName: string): string {
  const rel = scriptureNoteRel(translation, bookName)
  const abs = join(vault, rel)
  if (!existsSync(abs)) {
    mkdirSync(dirname(abs), { recursive: true })
    const fm =
      `---\n` +
      `title: ${translation} — ${bookName}\n` +
      `type: scripture-note\n` +
      `translation: ${translation}\n` +
      `---\n\n# ${translation} — ${bookName}\n`
    writeFileSync(abs, fm, 'utf-8')
  }
  return rel
}

/** Insert (or replace) a quote block under its `## Chapter N` section, keeping chapters ordered. */
function upsertScriptureBlock(
  vault: string,
  rel: string,
  chapter: number,
  id: string,
  block: string
): void {
  const abs = join(vault, rel)
  let txt = existsSync(abs) ? readFileSync(abs, 'utf-8') : ''
  // Replace in place if this quote already has a block anywhere in the note.
  const reBlock = new RegExp(`<!-- quote:${id} -->[\\s\\S]*?<!-- /quote:${id} -->`)
  if (reBlock.test(txt)) {
    writeFileSync(abs, txt.replace(reBlock, block), 'utf-8')
    return
  }
  const lines = txt.split('\n')
  const heads: { idx: number; n: number }[] = []
  lines.forEach((ln, i) => {
    const m = ln.match(/^##\s+Chapter\s+(\d+)\s*$/)
    if (m) heads.push({ idx: i, n: Number(m[1]) })
  })
  const section = heads.find((h) => h.n === chapter)
  if (section) {
    // Append at the end of this chapter's section (before the next `## ` or EOF).
    const laterIdxs = heads.filter((h) => h.idx > section.idx).map((h) => h.idx)
    const end = laterIdxs.length ? Math.min(...laterIdxs) : lines.length
    lines.splice(end, 0, '', block, '')
  } else {
    // New chapter heading, inserted in numeric order.
    const after = heads.find((h) => h.n > chapter)
    const chunk = ['', `## Chapter ${chapter}`, '', block, '']
    if (after) lines.splice(after.idx, 0, ...chunk)
    else lines.push(...chunk)
  }
  writeFileSync(abs, lines.join('\n'), 'utf-8')
}

/**
 * Save a verse-range highlight as a citeable Scripture quote (no book_id). The verse text is
 * stored and auto-homed into the per-book scripture note under its chapter section — the
 * location-anchored analog of a PDF highlight. Restricted by the caller to public-domain
 * translations (BSB), so storing the text is licence-safe.
 */
export function addScriptureQuote(input: NewScriptureHighlight): Quote {
  const vault = readConfig().vaultPath
  if (!vault) throw new Error('No vault')
  const def = bookByCode(input.book)
  const bookName = def?.name ?? input.book
  const id = randomUUID()
  const color = input.color ?? 'amber'
  const end = input.verseEnd && input.verseEnd !== input.verseStart ? input.verseEnd : null
  const ref = `${input.book} ${input.chapter}:${input.verseStart}${end ? `-${end}` : ''}`
  const citation = scriptureCitation({
    bookName,
    chapter: input.chapter,
    verseStart: input.verseStart,
    verseEnd: end,
    abbr: input.translation
  })

  const rel = ensureScriptureNote(vault, input.translation, bookName)
  upsertScriptureBlock(vault, rel, input.chapter, id, buildBlock(id, input.text, citation, []))

  getDb()
    .prepare(
      `INSERT INTO quotes
         (id, book_id, text, page, color, note_path, used_in, created, scripture_ref, scripture_translation)
       VALUES (?, NULL, ?, NULL, ?, ?, ?, ?, ?, ?)`
    )
    .run(id, input.text, color, rel, JSON.stringify([rel]), Date.now(), ref, input.translation)

  reindexQuote(id)
  const row = getDb().prepare('SELECT * FROM quotes WHERE id = ?').get(id) as QuoteRow
  return rowToQuote(row)
}

/** All saved Scripture quotes for a book, ordered by chapter then verse (for the panel). */
export function listScriptureQuotes(translation: string, book: string): Quote[] {
  const rows = getDb()
    .prepare('SELECT * FROM quotes WHERE scripture_translation = ? AND scripture_ref LIKE ?')
    .all(translation, `${book} %`) as QuoteRow[]
  const keyed = rows.map((r) => {
    const m = (r.scripture_ref ?? '').match(/\s(\d+):(\d+)/)
    return { r, ch: m ? Number(m[1]) : 0, vs: m ? Number(m[2]) : 0 }
  })
  keyed.sort((a, b) => a.ch - b.ch || a.vs - b.vs || a.r.created - b.r.created)
  return keyed.map((x) => rowToQuote(x.r))
}

/** Books (for a translation) that have at least one saved Scripture quote. */
export function listScriptureQuoteBooks(translation: string): ScriptureQuoteBook[] {
  const rows = getDb()
    .prepare('SELECT scripture_ref FROM quotes WHERE scripture_translation = ? AND scripture_ref IS NOT NULL')
    .all(translation) as { scripture_ref: string }[]
  const counts = new Map<string, number>()
  for (const r of rows) {
    const code = r.scripture_ref.split(' ')[0]
    if (code) counts.set(code, (counts.get(code) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([book, count]) => ({ book, name: bookByCode(book)?.name ?? book, count }))
    .sort((a, b) => (bookByCode(a.book)?.order ?? 0) - (bookByCode(b.book)?.order ?? 0))
}

/** Existing scripture highlights for a chapter, so the reader can re-mark verses. */
export function listScriptureHighlights(
  translation: string,
  book: string,
  chapter: number
): ScriptureHighlight[] {
  const rows = getDb()
    .prepare(
      `SELECT id, color, scripture_ref FROM quotes
       WHERE scripture_translation = ? AND scripture_ref LIKE ?`
    )
    .all(translation, `${book} ${chapter}:%`) as {
    id: string
    color: string
    scripture_ref: string
  }[]
  const out: ScriptureHighlight[] = []
  for (const r of rows) {
    const m = r.scripture_ref.match(/:(\d+)(?:-(\d+))?$/)
    if (!m) continue
    const verseStart = Number(m[1])
    out.push({ id: r.id, verseStart, verseEnd: m[2] ? Number(m[2]) : verseStart, color: r.color })
  }
  return out
}

function updateSidecarTags(quoteId: string, bookId: string | null, tags: string[]): void {
  const vault = readConfig().vaultPath
  if (!vault || !bookId) return
  const b = bookMeta(bookId)
  if (!b) return
  const sp = sidecarPath(vault, b.title_sanitized)
  const list = readSidecar(sp)
  const entry = list.find((q) => q.id === quoteId)
  if (entry) {
    entry.tags = tags
    writeSidecar(sp, list)
  }
}

export function setQuoteTags(quoteId: string, tagNames: string[]): void {
  const db = getDb()
  const cleaned = tagNames.map((t) => t.trim().replace(/^#/, '').toLowerCase()).filter(Boolean)
  const bookId = (db.prepare('SELECT book_id FROM quotes WHERE id = ?').get(quoteId) as
    | { book_id: string | null }
    | undefined)?.book_id ?? null
  db.transaction(() => {
    db.prepare('DELETE FROM quote_tags WHERE quote_id = ?').run(quoteId)
    const getTag = db.prepare('SELECT id FROM tags WHERE name = ?')
    const insTag = db.prepare('INSERT INTO tags (id, name) VALUES (?, ?)')
    const insJoin = db.prepare('INSERT OR IGNORE INTO quote_tags (quote_id, tag_id) VALUES (?, ?)')
    for (const name of cleaned) {
      const existing = getTag.get(name) as { id: string } | undefined
      const tagId = existing ? existing.id : randomUUID()
      if (!existing) insTag.run(tagId, name)
      insJoin.run(quoteId, tagId)
    }
  })()
  updateSidecarTags(quoteId, bookId, cleaned)
  reindexQuote(quoteId)
}

export function setQuoteAnnotations(quoteId: string, annotations: Annotation[]): void {
  const vault = readConfig().vaultPath
  const r = getDb().prepare('SELECT * FROM quotes WHERE id = ?').get(quoteId) as QuoteRow | undefined
  if (!r) return
  getDb()
    .prepare('UPDATE quotes SET annotation = ? WHERE id = ?')
    .run(JSON.stringify(annotations), quoteId)
  if (!vault || !r.book_id) return
  const b = bookMeta(r.book_id)
  if (!b) return
  const sp = sidecarPath(vault, b.title_sanitized)
  const list = readSidecar(sp)
  const entry = list.find((q) => q.id === quoteId)
  if (entry) {
    entry.annotations = annotations
    writeSidecar(sp, list)
  }
  if (r.note_path) {
    upsertQuoteBlock(
      vault,
      r.note_path,
      quoteId,
      buildBlock(quoteId, r.text, citationFor(b, r.page), annotations)
    )
  }
  reindexQuote(quoteId)
}

export function deleteQuote(quoteId: string): void {
  const vault = readConfig().vaultPath
  const r = getDb().prepare('SELECT * FROM quotes WHERE id = ?').get(quoteId) as QuoteRow | undefined
  if (!r) return
  if (vault) {
    removeQuoteBlock(vault, r.note_path, quoteId)
    if (r.book_id) {
      const b = bookMeta(r.book_id)
      if (b) {
        const sp = sidecarPath(vault, b.title_sanitized)
        writeSidecar(
          sp,
          readSidecar(sp).filter((q) => q.id !== quoteId)
        )
      }
    }
  }
  getDb().prepare('DELETE FROM quotes WHERE id = ?').run(quoteId)
  search.removeQuote(quoteId)
  if (r.book_id) {
    getDb()
      .prepare('UPDATE books SET quote_count = MAX(0, quote_count - 1) WHERE id = ?')
      .run(r.book_id)
  }
}
