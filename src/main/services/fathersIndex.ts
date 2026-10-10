import { existsSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'fs'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { getDataDir, getDb } from '../db/connection'
import { fathersVaultDir } from './config'
import { shouldReindex } from './commentaryIndex'
import { indexFathersForSearch } from './search'
import { parseThml } from './thml'
import type { ThmlVolume, ThmlWarning } from './thml'
import { correctedAuthor, seedFathersAuthors } from '../data/fathersAuthors'
import { parseFathersCode } from '../../shared/fathers'
import type { FathersSeries } from '../../shared/fathers'

export interface FathersVolumeInfo {
  code: string
  series: FathersSeries
  number: number
}

/** 'anf01.xml' -> { code: 'anf01', series: 'anf', number: 1 }; null for any other file name. */
export function parseVolumeFile(fileName: string): FathersVolumeInfo | null {
  const m = /^(.+)\.xml$/i.exec(fileName)
  if (!m) return null
  const code = m[1].toLowerCase()
  const parsed = parseFathersCode(code)
  return parsed ? { code, ...parsed } : null
}

/**
 * The work a section belongs to, always non-null so the Authors view can group on it. A
 * contained-work head's title wins. Without one: ANF groups by author at div1 so the work is the
 * div2 title; NPNF div1s are the works themselves.
 */
export function deriveWorkTitle(series: FathersSeries, workTitle: string | null, titles: string[]): string {
  if (workTitle) return workTitle
  if (series === 'anf') return titles[1] ?? titles[0] ?? ''
  return titles[0] ?? ''
}

export interface FathersIndexSummary {
  sections: number
  warnings: ThmlWarning[]
}

/** Replace one volume's rows (sections, refs, notes, pages) in a single transaction, update its
 *  volume row, and rewrite its search rows. */
export function writeFathersVolume(
  info: FathersVolumeInfo,
  volume: ThmlVolume,
  mtime: number
): void {
  const db = getDb()
  db.transaction(() => {
    for (const t of ['fathers_scripture_refs', 'fathers_notes', 'fathers_pages', 'fathers_sections']) {
      db.prepare(`DELETE FROM ${t} WHERE volume_code = ?`).run(info.code)
    }
    const insSection = db.prepare(
      `INSERT INTO fathers_sections
         (volume_code, id, ordinal, depth, titles_json, short_title, author_id, work_title, editorial,
          start_page, html, text)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
    )
    const insRef = db.prepare(
      `INSERT INTO fathers_scripture_refs
         (volume_code, section_id, anchor, osis, passage, book, chapter_start, verse_start,
          chapter_end, verse_end, in_note, char_offset)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
    )
    const insNote = db.prepare(
      'INSERT INTO fathers_notes (volume_code, section_id, anchor, n, html) VALUES (?,?,?,?,?)'
    )
    const insPage = db.prepare(
      'INSERT INTO fathers_pages (volume_code, section_id, n, char_offset) VALUES (?,?,?,?)'
    )
    for (const s of volume.sections) {
      insSection.run(
        info.code, s.id, s.ordinal, s.depth, JSON.stringify(s.titles), s.shortTitle,
        correctedAuthor(info.code, s.id, s.authorId),
        deriveWorkTitle(info.series, s.workTitle, s.titles),
        s.editorial ? 1 : 0, s.startPage, s.html, s.text
      )
      for (const r of s.refs) {
        insRef.run(
          info.code, s.id, r.anchor, r.osis, r.passage, r.book, r.chapterStart, r.verseStart,
          r.chapterEnd, r.verseEnd, r.inNote ? 1 : 0, r.charOffset
        )
      }
      for (const n of s.notes) insNote.run(info.code, s.id, n.anchor, n.n, n.html)
      for (const p of s.pages) insPage.run(info.code, s.id, p.n, p.charOffset)
    }
    db.prepare(
      `UPDATE fathers_volumes
       SET title = ?, mtime = ?, status = 'indexed', error = NULL, indexed_at = ? WHERE code = ?`
    ).run(volume.title, mtime, new Date().toISOString(), info.code)
    indexFathersForSearch(info.code)
  })()
}

/** Parse and index one volume file. Throws on unreadable / non-ThML input (the caller records
 *  that as the volume's error status). */
export async function indexFathersVolume(
  info: FathersVolumeInfo,
  absPath: string,
  mtime: number
): Promise<FathersIndexSummary> {
  const xml = await readFile(absPath, 'utf8')
  const { volume, warnings } = parseThml(xml, info.code)
  writeFathersVolume(info, volume, mtime)
  return { sections: volume.sections.length, warnings }
}

function ensureVolumeRow(info: FathersVolumeInfo, fileKey: string): { status: string } {
  const db = getDb()
  db.prepare(
    `INSERT OR IGNORE INTO fathers_volumes (code, series, number, title, file_key, status)
     VALUES (?, ?, ?, ?, ?, 'unindexed')`
  ).run(info.code, info.series, info.number, info.code, fileKey)
  return db.prepare('SELECT status FROM fathers_volumes WHERE code = ?').get(info.code) as { status: string }
}

function markVolumeError(code: string, mtime: number, message: string): void {
  getDb()
    .prepare(
      `UPDATE fathers_volumes SET status = 'error', error = ?, mtime = ?, indexed_at = ? WHERE code = ?`
    )
    .run(message.slice(0, 500), mtime, new Date().toISOString(), code)
}

/** Local, rebuildable record of the mtime (whole seconds) each volume file had when last indexed
 *  on THIS device — same rationale and format as boc-index-mtimes.json in bocIndex.ts. */
function indexMtimesPath(): string {
  return join(getDataDir(), 'fathers-index-mtimes.json')
}
function loadIndexMtimes(): Record<string, number> {
  try {
    return JSON.parse(readFileSync(indexMtimesPath(), 'utf8')) as Record<string, number>
  } catch {
    return {}
  }
}
function saveIndexMtimes(mtimes: Record<string, number>): void {
  const path = indexMtimesPath()
  const tmp = `${path}.tmp`
  writeFileSync(tmp, JSON.stringify(mtimes, null, 2))
  renameSync(tmp, path)
}

/**
 * Discover and index the ThML volumes in the vault's `fathers/` folder. Called at startup, after
 * the Confessions sync, and mirrors `syncBocFolder` (bocIndex.ts): new files register as volumes,
 * a volume is (re)indexed when its file's mtime changed or the database says it never indexed
 * (`shouldReindex`, shared with commentary sync), and failures are best-effort. Unlike the
 * Markdown corpora, a failure is recorded on the volume (`status='error'` + message, shown in the
 * Fathers drawer) so one bad file neither blocks the others nor fails silently. An errored volume
 * is not retried until its file changes.
 */
export async function syncFathersFolder(): Promise<void> {
  seedFathersAuthors(getDb())
  const folder = fathersVaultDir()
  if (!existsSync(folder)) return
  let files: string[]
  try {
    files = readdirSync(folder).sort()
  } catch {
    return
  }
  const mtimes = loadIndexMtimes()
  // Register every volume first, so the drawer lists them all ("indexing…") while they are parsed
  // one by one below.
  for (const fileName of files) {
    const info = parseVolumeFile(fileName)
    if (info) ensureVolumeRow(info, `fathers/${fileName}`)
  }
  for (const fileName of files) {
    const info = parseVolumeFile(fileName)
    if (!info) continue
    const abs = join(folder, fileName)
    let mtime: number
    try {
      mtime = Math.floor(statSync(abs).mtimeMs / 1000)
    } catch {
      continue // vanished between listing and stat — skip this pass
    }
    const key = `fathers/${fileName}`
    const row = ensureVolumeRow(info, key)
    if (!shouldReindex(mtimes[key], mtime, row.status)) continue
    try {
      await indexFathersVolume(info, abs, mtime)
    } catch (e) {
      markVolumeError(
        info.code,
        mtime,
        e instanceof Error ? e.message : String(e)
      )
    }
    mtimes[key] = mtime
    saveIndexMtimes(mtimes)
    // Parsing a 5 MB volume is synchronous; yield between volumes so the window stays responsive.
    await new Promise<void>((resolve) => setImmediate(resolve))
  }
}
