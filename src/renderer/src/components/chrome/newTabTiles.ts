import { bookByCode } from '@shared/scriptureRef'
import { bocDocument } from '@shared/bookOfConcord'
import { KIND_LABEL } from '@shared/libraryKind'
import type { BookKind } from '@shared/ipc'
import { contentKey, migrateLocation } from '../../store/workspace'
import type { TabContent, TabKind } from '../../store/workspace'

/** One shortcut tile on the New Tab page. */
export interface Tile {
  /** Identity for de-duplication and "Remove from tiles". */
  key: string
  content: TabContent
  title: string
  /** Small second line ("Bible", "p. 112", "Note"). */
  subtitle: string
  /** Which tab kind's icon to show. */
  kind: TabKind
  /** When it was last visited (ms), if known. */
  at: number | null
}

export interface TileSections {
  /** The Bible and Confessions where you left off, then books in progress. */
  continueReading: Tile[]
  /** Recently visited passages and locations (not already under Continue reading). */
  recent: Tile[]
  recentNotes: Tile[]
}

export interface TileInput {
  /** History entries, newest first (as `api.listHistory` returns them). */
  history: { title: string; location: string; visitedAt: string }[]
  books: {
    id: string
    title: string
    lastPage: number
    lastOpened: number | null
    pageOffset: number
    status: string
    kind?: BookKind
  }[]
  notes: { path: string; title: string }[]
  /** Where the Bible / Confessions were last read (session state), if ever. */
  lastBible: { book: string; chapter: number } | null
  lastBoc: { documentCode: string; ordinal: number } | null
  /** Tiles the owner removed: key -> when (ms). A tile visited again after that comes back. */
  hidden: Record<string, number>
}

export const TILE_LIMITS = { books: 4, recent: 8, notes: 6 }

/** Kinds that count as a "passage or location" for the Recent row. */
const RECENT_SUBTITLES: Record<string, string> = {
  bible: 'Bible',
  boc: 'Confessions',
  commentary: 'Commentary',
  dogmatics: 'Dogmatics',
  fathers: 'Church Fathers',
  pdf: 'Library',
  quotes: 'Quotes'
}
const RECENT_KINDS = new Set<string>(Object.keys(RECENT_SUBTITLES))

/**
 * A tile's identity: where it points, ignoring view details that don't make it a different
 * place (the Bible translation and highlighted verses, the Confessions source edition).
 */
export function tileKey(c: TabContent): string {
  if (c.kind === 'bible') return `bible:${c.book}:${c.chapter}`
  if (c.kind === 'boc') return `boc:${c.documentCode}:${c.sectionOrdinal}`
  return contentKey(c)
}

function parse(location: string): TabContent | null {
  try {
    const c = JSON.parse(location) as TabContent
    return c && typeof c === 'object' && typeof c.kind === 'string' ? migrateLocation(c) : null
  } catch {
    return null
  }
}

function isHidden(t: Tile, hidden: Record<string, number>): boolean {
  const when = hidden[t.key]
  return when != null && (t.at == null || t.at <= when)
}

/** The New Tab page's tiles, derived from history, the library and the last-read places. */
export function buildTiles(input: TileInput): TileSections {
  const bookById = new Map(input.books.map((b) => [b.id, b]))
  const noteByPath = new Map(input.notes.map((n) => [n.path, n]))

  // Latest visit (and its title) per key, newest first.
  const visits = new Map<string, { content: TabContent; title: string; at: number }>()
  for (const e of input.history) {
    const c = parse(e.location)
    if (!c) continue
    const key = tileKey(c)
    if (visits.has(key)) continue
    const at = Date.parse(e.visitedAt)
    visits.set(key, { content: c, title: e.title, at: Number.isNaN(at) ? 0 : at })
  }

  const continueReading: Tile[] = []
  if (input.lastBible) {
    const content: TabContent = { kind: 'bible', book: input.lastBible.book, chapter: input.lastBible.chapter }
    const key = tileKey(content)
    const name = bookByCode(input.lastBible.book)?.name ?? input.lastBible.book
    continueReading.push({
      key,
      content,
      title: `${name} ${input.lastBible.chapter}`,
      subtitle: 'Bible',
      kind: 'bible',
      at: visits.get(key)?.at ?? null
    })
  }
  if (input.lastBoc) {
    const content: TabContent = {
      kind: 'boc',
      documentCode: input.lastBoc.documentCode,
      sectionOrdinal: input.lastBoc.ordinal
    }
    const key = tileKey(content)
    const visit = visits.get(key)
    const doc = bocDocument(input.lastBoc.documentCode)
    continueReading.push({
      key,
      content: visit?.content ?? content,
      title: visit?.title ?? `${doc?.abbreviation ?? input.lastBoc.documentCode} §${input.lastBoc.ordinal}`,
      subtitle: 'Confessions',
      kind: 'boc',
      at: visit?.at ?? null
    })
  }
  const inProgress = input.books
    .filter((b) => b.lastPage > 1 && b.status !== 'finished')
    .sort((a, b) => (b.lastOpened ?? 0) - (a.lastOpened ?? 0))
  let books = 0
  for (const b of inProgress) {
    if (books >= TILE_LIMITS.books) break
    const content: TabContent = { kind: 'pdf', bookId: b.id }
    const tile: Tile = {
      key: tileKey(content),
      content,
      title: b.title,
      subtitle: `p. ${Math.max(1, b.lastPage - b.pageOffset)}`,
      kind: 'pdf',
      at: b.lastOpened
    }
    if (isHidden(tile, input.hidden)) continue
    continueReading.push(tile)
    books++
  }

  const taken = new Set(continueReading.map((t) => t.key))
  const recent: Tile[] = []
  const recentNotes: Tile[] = []
  for (const [key, v] of visits) {
    const c = v.content
    let tile: Tile | null = null
    if (c.kind === 'note') {
      const note = noteByPath.get(c.notePath)
      if (!note || recentNotes.length >= TILE_LIMITS.notes) continue
      tile = { key, content: c, title: note.title, subtitle: 'Note', kind: 'note', at: v.at }
      if (!isHidden(tile, input.hidden)) recentNotes.push(tile)
      continue
    }
    if (!RECENT_KINDS.has(c.kind) || taken.has(key) || recent.length >= TILE_LIMITS.recent) continue
    if (c.kind === 'pdf' && !bookById.has(c.bookId)) continue
    const title = c.kind === 'pdf' ? (bookById.get(c.bookId)?.title ?? v.title) : v.title
    const bookKind = c.kind === 'pdf' ? bookById.get(c.bookId)?.kind : undefined
    const subtitle = bookKind ? KIND_LABEL[bookKind] : (RECENT_SUBTITLES[c.kind] ?? 'Quotes')
    tile = { key, content: c, title, subtitle, kind: c.kind, at: v.at }
    if (!isHidden(tile, input.hidden)) recent.push(tile)
  }

  return {
    continueReading: continueReading.filter((t) => !isHidden(t, input.hidden)),
    recent,
    recentNotes
  }
}

/** Parse the persisted removed-tiles map. Never throws. */
export function parseHiddenTiles(json: string | null): Record<string, number> {
  if (!json) return {}
  try {
    const raw = JSON.parse(json) as unknown
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
    const out: Record<string, number> = {}
    for (const [k, v] of Object.entries(raw)) if (typeof v === 'number') out[k] = v
    return out
  } catch {
    return {}
  }
}

/** Mark a tile removed now, keeping the map to its newest 200 entries. */
export function hideTile(hidden: Record<string, number>, key: string, now = Date.now()): Record<string, number> {
  const entries = Object.entries({ ...hidden, [key]: now }).sort((a, b) => b[1] - a[1])
  return Object.fromEntries(entries.slice(0, 200))
}
