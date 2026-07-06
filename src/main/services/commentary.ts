import { randomUUID } from 'crypto'
import { getDb } from '../db/connection'
import type {
  CommentaryExcerpt,
  CommentaryExcerptReassign,
  CommentaryMatch,
  CommentarySource,
  CommentarySourceUpdate,
  NewCommentarySource
} from '../../shared/ipc'

interface SourceRow {
  id: string
  book_id: string | null
  display_name: string
  author: string | null
  pdf_relative_path: string
  sort_order: number
  parser_config: string | null
  indexed_at: string | null
  status: string
}

function toSource(r: SourceRow): CommentarySource {
  return {
    id: r.id,
    bookId: r.book_id,
    displayName: r.display_name,
    author: r.author,
    pdfRelativePath: r.pdf_relative_path,
    sortOrder: r.sort_order,
    parserConfig: r.parser_config,
    indexedAt: r.indexed_at,
    status: r.status as CommentarySource['status']
  }
}

export function listSources(): CommentarySource[] {
  return (
    getDb()
      .prepare('SELECT * FROM commentary_sources ORDER BY sort_order, display_name COLLATE NOCASE')
      .all() as SourceRow[]
  ).map(toSource)
}

export function createSource(input: NewCommentarySource): CommentarySource {
  const db = getDb()
  const id = randomUUID()
  const max =
    (db.prepare('SELECT MAX(sort_order) AS m FROM commentary_sources').get() as { m: number | null })
      .m ?? 0
  db.prepare(
    `INSERT INTO commentary_sources (id, book_id, display_name, author, pdf_relative_path, sort_order)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, input.bookId, input.displayName, input.author, input.pdfRelativePath, max + 1)
  return toSource(
    db.prepare('SELECT * FROM commentary_sources WHERE id = ?').get(id) as SourceRow
  )
}

const UPDATABLE_COLUMNS: Record<keyof CommentarySourceUpdate, string> = {
  displayName: 'display_name',
  author: 'author',
  sortOrder: 'sort_order',
  status: 'status',
  parserConfig: 'parser_config',
  indexedAt: 'indexed_at'
}

export function updateSource(id: string, patch: CommentarySourceUpdate): void {
  const entries = Object.entries(patch).filter(([, v]) => v !== undefined) as [
    keyof CommentarySourceUpdate,
    unknown
  ][]
  if (entries.length === 0) return
  const setClause = entries.map(([k]) => `${UPDATABLE_COLUMNS[k]} = ?`).join(', ')
  const values = entries.map(([, v]) => v)
  getDb()
    .prepare(`UPDATE commentary_sources SET ${setClause} WHERE id = ?`)
    .run(...values, id)
}

export function deleteSource(id: string): void {
  // commentary_excerpts rows cascade via the foreign key.
  getDb().prepare('DELETE FROM commentary_sources WHERE id = ?').run(id)
}

/** Persist a manual display order for sources — `orderedIds` is the full list, in order. */
export function reorderSources(orderedIds: string[]): void {
  const db = getDb()
  const upd = db.prepare('UPDATE commentary_sources SET sort_order = ? WHERE id = ?')
  db.transaction(() => {
    orderedIds.forEach((id, i) => upd.run(i + 1, id))
  })()
}

export interface NewCommentaryExcerpt {
  book: string
  chapterStart: number
  verseStart: number
  chapterEnd: number
  verseEnd: number
  text: string
  pageNumber: number
  headerRaw: string | null
  confidence: number
  flagged: boolean
}

/** Replace every excerpt for a source in one transaction (full re-index or first ingest). */
export function replaceExcerptsForSource(sourceId: string, excerpts: NewCommentaryExcerpt[]): void {
  const db = getDb()
  const del = db.prepare('DELETE FROM commentary_excerpts WHERE source_id = ?')
  const ins = db.prepare(
    `INSERT INTO commentary_excerpts
       (id, source_id, book, chapter_start, verse_start, chapter_end, verse_end, text,
        page_number, header_raw, confidence, flagged)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
  db.transaction(() => {
    del.run(sourceId)
    for (const e of excerpts) {
      ins.run(
        randomUUID(),
        sourceId,
        e.book,
        e.chapterStart,
        e.verseStart,
        e.chapterEnd,
        e.verseEnd,
        e.text,
        e.pageNumber,
        e.headerRaw,
        e.confidence,
        e.flagged ? 1 : 0
      )
    }
  })()
}

interface MatchRow {
  id: string
  source_id: string
  display_name: string
  author: string | null
  sort_order: number
  book_id: string | null
  text: string
  page_number: number
  chapter_start: number
  verse_start: number
  chapter_end: number
  verse_end: number
}

/** Every non-flagged excerpt whose range covers (book, chapter, verse), grouped by source
 *  in the returned order (sort_order, then the excerpt's own start ref). */
export function lookupVerse(book: string, chapter: number, verse: number): CommentaryMatch[] {
  const rows = getDb()
    .prepare(
      `SELECT e.id, e.source_id, s.display_name, s.author, s.sort_order, s.book_id,
              e.text, e.page_number, e.chapter_start, e.verse_start, e.chapter_end, e.verse_end
       FROM commentary_excerpts e
       JOIN commentary_sources s ON s.id = e.source_id
       WHERE e.book = :book
         AND (e.chapter_start < :chapter OR (e.chapter_start = :chapter AND e.verse_start <= :verse))
         AND (e.chapter_end > :chapter OR (e.chapter_end = :chapter AND e.verse_end >= :verse))
         AND e.flagged = 0
       ORDER BY s.sort_order, e.chapter_start, e.verse_start`
    )
    .all({ book, chapter, verse }) as MatchRow[]

  return rows.map((r) => ({
    excerptId: r.id,
    sourceId: r.source_id,
    sourceDisplayName: r.display_name,
    sourceAuthor: r.author,
    sortOrder: r.sort_order,
    bookId: r.book_id,
    text: r.text,
    pageNumber: r.page_number,
    chapterStart: r.chapter_start,
    verseStart: r.verse_start,
    chapterEnd: r.chapter_end,
    verseEnd: r.verse_end
  }))
}

interface ExcerptRow {
  id: string
  source_id: string
  book: string
  chapter_start: number
  verse_start: number
  chapter_end: number
  verse_end: number
  text: string
  page_number: number
  header_raw: string | null
  confidence: number
  flagged: number
}

function toExcerpt(r: ExcerptRow): CommentaryExcerpt {
  return {
    id: r.id,
    sourceId: r.source_id,
    book: r.book,
    chapterStart: r.chapter_start,
    verseStart: r.verse_start,
    chapterEnd: r.chapter_end,
    verseEnd: r.verse_end,
    text: r.text,
    pageNumber: r.page_number,
    headerRaw: r.header_raw,
    confidence: r.confidence,
    flagged: r.flagged === 1
  }
}

export function listFlagged(sourceId?: string): CommentaryExcerpt[] {
  const db = getDb()
  const rows = sourceId
    ? (db
        .prepare('SELECT * FROM commentary_excerpts WHERE flagged = 1 AND source_id = ?')
        .all(sourceId) as ExcerptRow[])
    : (db.prepare('SELECT * FROM commentary_excerpts WHERE flagged = 1').all() as ExcerptRow[])
  return rows.map(toExcerpt)
}

export function setExcerptFlag(id: string, flagged: boolean): void {
  getDb()
    .prepare('UPDATE commentary_excerpts SET flagged = ? WHERE id = ?')
    .run(flagged ? 1 : 0, id)
}

export function reassignExcerpt(id: string, patch: CommentaryExcerptReassign): void {
  getDb()
    .prepare(
      `UPDATE commentary_excerpts
       SET book = ?, chapter_start = ?, verse_start = ?, chapter_end = ?, verse_end = ?, flagged = 0
       WHERE id = ?`
    )
    .run(patch.book, patch.chapterStart, patch.verseStart, patch.chapterEnd, patch.verseEnd, id)
}
