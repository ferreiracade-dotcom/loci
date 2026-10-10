// Read-side queries for the Church Fathers corpus (volumes, sections, authors, the Scripture
// catena). Pure SQL over the tables fathersIndex.ts fills; nothing here touches the filesystem.
import { getDb } from '../db/connection'
import { bookByCode } from '../../shared/scriptureRef'
import type { FathersSeries } from '../../shared/fathers'
import type {
  FathersAuthor,
  FathersAuthorSummary,
  FathersCatenaEntry,
  FathersCatenaGroup,
  FathersCatenaResult,
  FathersNote,
  FathersSection,
  FathersSectionSummary,
  FathersVolume,
  FathersWork
} from '../../shared/ipc'

/** ANF, then NPNF¹, then NPNF², each by volume number. */
const SERIES_ORDER_SQL = "CASE v.series WHEN 'anf' THEN 0 WHEN 'npnf1' THEN 1 ELSE 2 END"

/** 'clement_rome' -> 'Clement Rome': the display name for an author missing from the curated table. */
export function humanizeAuthorId(id: string): string {
  return id
    .split(/[_-]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ')
}

/** About `size` characters of `text` around `offset`, trimmed to whole words with ellipses. */
export function snippetAround(text: string, offset: number, size = 200): string {
  const flat = text.replace(/\n/g, ' ') // same length as `text`, so offsets stay valid
  const start = Math.max(0, Math.min(offset, flat.length) - Math.floor(size * 0.4))
  const end = Math.min(flat.length, start + size)
  let s = flat.slice(start, end)
  if (start > 0) s = s.replace(/^\S*\s/, '')
  if (end < flat.length) s = s.replace(/\s\S*$/, '')
  return `${start > 0 ? '…' : ''}${s.trim()}${end < flat.length ? '…' : ''}`
}

/** The printed page in force at `offset`: the last page break at or before it, else the page the
 *  section started on. `pages` must be ascending by charOffset. */
export function pageAt(
  pages: { n: string; charOffset: number }[],
  offset: number,
  startPage: string | null
): string | null {
  let current = startPage
  for (const p of pages) {
    if (p.charOffset <= offset) current = p.n
    else break
  }
  return current
}

// ---------- volumes and sections ----------

export function listVolumes(): FathersVolume[] {
  const rows = getDb()
    .prepare(
      `SELECT v.code, v.series, v.number, v.title, v.status, v.error,
              (SELECT COUNT(*) FROM fathers_sections s WHERE s.volume_code = v.code) AS sectionCount
       FROM fathers_volumes v ORDER BY ${SERIES_ORDER_SQL}, v.number`
    )
    .all() as {
    code: string
    series: FathersSeries
    number: number
    title: string
    status: FathersVolume['status']
    error: string | null
    sectionCount: number
  }[]
  return rows
}

interface SummaryRow {
  id: string
  ordinal: number
  depth: number
  titles_json: string
  short_title: string
  author_id: string | null
  author_name: string | null
  work_title: string | null
  editorial: number
  start_page: string | null
}

function rowToSummary(r: SummaryRow): FathersSectionSummary {
  let titles: string[] = []
  try {
    titles = JSON.parse(r.titles_json) as string[]
  } catch {
    titles = []
  }
  return {
    id: r.id,
    ordinal: r.ordinal,
    depth: r.depth,
    titles,
    shortTitle: r.short_title,
    authorId: r.author_id,
    authorName: r.author_id ? (r.author_name ?? humanizeAuthorId(r.author_id)) : null,
    workTitle: r.work_title,
    editorial: r.editorial === 1,
    startPage: r.start_page
  }
}

/** Every section of one volume in reading order, without the (large) html / text. */
export function listSections(volumeCode: string): FathersSectionSummary[] {
  const rows = getDb()
    .prepare(
      `SELECT s.id, s.ordinal, s.depth, s.titles_json, s.short_title, s.author_id, a.name AS author_name,
              s.work_title, s.editorial, s.start_page
       FROM fathers_sections s LEFT JOIN fathers_authors a ON a.id = s.author_id
       WHERE s.volume_code = ? ORDER BY s.ordinal`
    )
    .all(volumeCode) as SummaryRow[]
  return rows.map(rowToSummary)
}

export function getSection(volumeCode: string, sectionId: string): FathersSection | null {
  const db = getDb()
  const r = db
    .prepare(
      `SELECT s.id, s.ordinal, s.depth, s.titles_json, s.short_title, s.author_id, a.name AS author_name,
              s.work_title, s.editorial, s.start_page, s.html,
              v.series, v.number AS volumeNumber, v.title AS volumeTitle
       FROM fathers_sections s
       JOIN fathers_volumes v ON v.code = s.volume_code
       LEFT JOIN fathers_authors a ON a.id = s.author_id
       WHERE s.volume_code = ? AND s.id = ?`
    )
    .get(volumeCode, sectionId) as
    | (SummaryRow & { html: string; series: FathersSeries; volumeNumber: number; volumeTitle: string })
    | undefined
  if (!r) return null
  const notes = db
    .prepare('SELECT anchor, n, html FROM fathers_notes WHERE volume_code = ? AND section_id = ? ORDER BY rowid')
    .all(volumeCode, sectionId) as FathersNote[]
  const prev = db
    .prepare(
      'SELECT id FROM fathers_sections WHERE volume_code = ? AND ordinal < ? ORDER BY ordinal DESC LIMIT 1'
    )
    .get(volumeCode, r.ordinal) as { id: string } | undefined
  const next = db
    .prepare('SELECT id FROM fathers_sections WHERE volume_code = ? AND ordinal > ? ORDER BY ordinal LIMIT 1')
    .get(volumeCode, r.ordinal) as { id: string } | undefined
  return {
    ...rowToSummary(r),
    volumeCode,
    series: r.series,
    volumeNumber: r.volumeNumber,
    volumeTitle: r.volumeTitle,
    html: r.html,
    notes,
    prevId: prev?.id ?? null,
    nextId: next?.id ?? null
  }
}

// ---------- authors ----------

/** Authors with indexed (non-editorial) sections, oldest first; undated authors sort last. An
 *  author the files mention but the curated table lacks is included under a derived name. */
export function listAuthors(): FathersAuthorSummary[] {
  const rows = getDb()
    .prepare(
      `SELECT s.author_id AS id, a.name, a.dates_label AS datesLabel, a.sort_year AS sortYear,
              COUNT(DISTINCT s.volume_code || '|' || COALESCE(s.work_title, '')) AS workCount, COUNT(*) AS sectionCount
       FROM fathers_sections s LEFT JOIN fathers_authors a ON a.id = s.author_id
       WHERE s.author_id IS NOT NULL AND s.editorial = 0
       GROUP BY s.author_id
       ORDER BY (a.sort_year IS NULL), a.sort_year, COALESCE(a.name, s.author_id)`
    )
    .all() as {
    id: string
    name: string | null
    datesLabel: string | null
    sortYear: number | null
    workCount: number
    sectionCount: number
  }[]
  return rows.map((r) => ({ ...r, name: r.name ?? humanizeAuthorId(r.id) }))
}

export function getAuthor(authorId: string): FathersAuthor | null {
  const db = getDb()
  const a = db
    .prepare('SELECT id, name, sort_year AS sortYear, dates_label AS datesLabel, bio FROM fathers_authors WHERE id = ?')
    .get(authorId) as
    | { id: string; name: string; sortYear: number | null; datesLabel: string | null; bio: string | null }
    | undefined
  const rows = db
    .prepare(
      `SELECT s.volume_code AS volumeCode, v.series, v.number AS volumeNumber, v.title AS volumeTitle,
              s.work_title AS workTitle, MIN(s.ordinal) AS firstOrdinal, COUNT(*) AS sectionCount
       FROM fathers_sections s JOIN fathers_volumes v ON v.code = s.volume_code
       WHERE s.author_id = ? AND s.editorial = 0
       GROUP BY s.volume_code, s.work_title
       ORDER BY ${SERIES_ORDER_SQL}, v.number, firstOrdinal`
    )
    .all(authorId) as (Omit<FathersWork, 'firstSectionId' | 'workTitle'> & {
    workTitle: string | null
    firstOrdinal: number
  })[]
  if (!a && rows.length === 0) return null
  const firstId = db.prepare('SELECT id FROM fathers_sections WHERE volume_code = ? AND ordinal = ?')
  const works: FathersWork[] = rows.map((r) => ({
    volumeCode: r.volumeCode,
    series: r.series,
    volumeNumber: r.volumeNumber,
    volumeTitle: r.volumeTitle,
    workTitle: r.workTitle ?? '',
    firstSectionId: (firstId.get(r.volumeCode, r.firstOrdinal) as { id: string }).id,
    sectionCount: r.sectionCount
  }))
  return {
    id: authorId,
    name: a?.name ?? humanizeAuthorId(authorId),
    sortYear: a?.sortYear ?? null,
    datesLabel: a?.datesLabel ?? null,
    bio: a?.bio ?? null,
    works
  }
}

// ---------- the Scripture catena ----------

const CATENA_LIMIT = 600

/**
 * The Fathers on a Bible passage: every indexed reference whose range contains the given verse
 * (or, with no verse, overlaps the chapter), grouped by the verse it starts on and ordered by
 * author date (undated last), then volume and reading order. Editorial sections are excluded.
 * One entry per (section, verse group) — the earliest reference in it. Footnote references (the
 * editors' cross-references, which is most of them) are included, flagged `inNote`.
 */
export function catena(book: string, chapter: number, verse?: number | null): FathersCatenaGroup[] {
  return catenaResult(book, chapter, verse).groups
}

/** `catena` plus whether the result was cut at `limit` rows (the panel then says so). */
export function catenaResult(
  book: string,
  chapter: number,
  verse?: number | null,
  limit: number = CATENA_LIMIT
): FathersCatenaResult {
  const db = getDb()
  const v = verse ?? null
  // Dedupe in SQL (one row per verse-group, section: the earliest reference) BEFORE limiting, so
  // the many footnote refs of one early section cannot crowd later-dated Fathers out of the limit.
  const rows = db
    .prepare(
      `WITH m AS (
         SELECT r.volume_code, r.section_id, r.passage, r.in_note, r.chapter_start, r.verse_start, r.char_offset,
                CASE WHEN @v IS NOT NULL THEN @v WHEN r.chapter_start = @ch THEN r.verse_start END AS gv
         FROM fathers_scripture_refs r
         JOIN fathers_sections s ON s.volume_code = r.volume_code AND s.id = r.section_id
         WHERE r.book = @book AND s.editorial = 0
           AND (r.chapter_start < @ch OR (r.chapter_start = @ch AND (@v IS NULL OR COALESCE(r.verse_start, 0) <= @v)))
           AND (r.chapter_end > @ch OR (r.chapter_end = @ch AND (@v IS NULL OR COALESCE(r.verse_end, 9999) >= @v)))
       ), f AS (
         SELECT m.*, ROW_NUMBER() OVER (PARTITION BY m.gv, m.volume_code, m.section_id ORDER BY m.char_offset) AS rn
         FROM m
       )
       SELECT f.volume_code AS volumeCode, f.section_id AS sectionId, f.passage, f.in_note AS inNote,
              f.chapter_start AS cs, f.verse_start AS vs, f.char_offset AS off,
              s.short_title AS sectionTitle, s.work_title AS workTitle, s.author_id AS authorId,
              s.text, s.start_page AS startPage,
              v.series, v.number AS volumeNumber, a.name AS authorName, a.dates_label AS datesLabel
       FROM f
       JOIN fathers_sections s ON s.volume_code = f.volume_code AND s.id = f.section_id
       JOIN fathers_volumes v ON v.code = f.volume_code
       LEFT JOIN fathers_authors a ON a.id = s.author_id
       WHERE f.rn = 1
       ORDER BY (a.sort_year IS NULL), a.sort_year, f.volume_code, s.ordinal, f.char_offset
       LIMIT ${limit + 1}`
    )
    .all({ book, ch: chapter, v }) as {
    volumeCode: string
    sectionId: string
    passage: string
    inNote: number
    cs: number
    vs: number | null
    off: number
    sectionTitle: string
    workTitle: string | null
    authorId: string | null
    text: string
    startPage: string | null
    series: FathersSeries
    volumeNumber: number
    authorName: string | null
    datesLabel: string | null
  }[]

  const truncated = rows.length > limit
  if (truncated) rows.length = limit

  const pageStmt = db.prepare(
    'SELECT n, char_offset AS charOffset FROM fathers_pages WHERE volume_code = ? AND section_id = ? ORDER BY char_offset'
  )
  const pageCache = new Map<string, { n: string; charOffset: number }[]>()
  const pagesFor = (volumeCode: string, sectionId: string): { n: string; charOffset: number }[] => {
    const key = `${volumeCode}|${sectionId}`
    let p = pageCache.get(key)
    if (!p) {
      p = pageStmt.all(volumeCode, sectionId) as { n: string; charOffset: number }[]
      pageCache.set(key, p)
    }
    return p
  }

  const bookName = bookByCode(book)?.name ?? book
  const groups = new Map<number | null, FathersCatenaGroup>()
  const seen = new Set<string>()
  for (const r of rows) {
    // A reference that starts in an earlier chapter belongs to the chapter-level group.
    const groupVerse = v !== null ? v : r.cs === chapter ? r.vs : null
    const dedupe = `${groupVerse}|${r.volumeCode}|${r.sectionId}`
    if (seen.has(dedupe)) continue
    seen.add(dedupe)
    let g = groups.get(groupVerse)
    if (!g) {
      g = {
        verse: groupVerse,
        label: groupVerse === null ? `${bookName} ${chapter}` : `${bookName} ${chapter}:${groupVerse}`,
        entries: []
      }
      groups.set(groupVerse, g)
    }
    const entry: FathersCatenaEntry = {
      volumeCode: r.volumeCode,
      series: r.series,
      volumeNumber: r.volumeNumber,
      sectionId: r.sectionId,
      sectionTitle: r.sectionTitle,
      workTitle: r.workTitle ?? '',
      authorId: r.authorId,
      authorName: r.authorId ? (r.authorName ?? humanizeAuthorId(r.authorId)) : null,
      datesLabel: r.datesLabel,
      passage: r.passage,
      inNote: r.inNote === 1,
      page: pageAt(pagesFor(r.volumeCode, r.sectionId), r.off, r.startPage),
      snippet: snippetAround(r.text, r.off)
    }
    g.entries.push(entry)
  }
  return {
    groups: [...groups.values()].sort((a, b) => (a.verse ?? -1) - (b.verse ?? -1)),
    truncated,
    limit
  }
}

// ---------- citation metadata (used by quotes.ts) ----------

export interface FathersCiteMeta {
  authorName: string | null
  workTitle: string | null
  shortTitle: string
  series: FathersSeries
  volume: number
}

/** What a Fathers citation needs about a section, or null if the section is not indexed. */
export function citeMeta(volumeCode: string, sectionId: string): FathersCiteMeta | null {
  const r = getDb()
    .prepare(
      `SELECT s.author_id AS authorId, a.name AS authorName, s.work_title AS workTitle,
              s.short_title AS shortTitle, v.series, v.number AS volume
       FROM fathers_sections s
       JOIN fathers_volumes v ON v.code = s.volume_code
       LEFT JOIN fathers_authors a ON a.id = s.author_id
       WHERE s.volume_code = ? AND s.id = ?`
    )
    .get(volumeCode, sectionId) as
    | {
        authorId: string | null
        authorName: string | null
        workTitle: string | null
        shortTitle: string
        series: FathersSeries
        volume: number
      }
    | undefined
  if (!r) return null
  return {
    authorName: r.authorId ? (r.authorName ?? humanizeAuthorId(r.authorId)) : null,
    workTitle: r.workTitle,
    shortTitle: r.shortTitle,
    series: r.series,
    volume: r.volume
  }
}
