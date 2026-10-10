import { app } from 'electron'
import { randomUUID } from 'crypto'
import { existsSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'fs'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { getDataDir, getDb } from '../db/connection'
import { dogmaticsVaultDir } from './config'
import { installBundled } from './bundledCommentaries'
import { shouldReindex } from './commentaryIndex'
import { parseDogmaticsMarkdown, type DogmaticsSection } from './dogmaticsMarkdown'
import type { DogmaticsOutlineWork, DogmaticsSectionRow, DogmaticsSource } from '../../shared/ipc'

// Dogmatic works, read like a commentary: the work in the Bible book's place, its books in the
// chapters' and its sections in the verses'. Each Markdown file in the vault's dogmatics/ folder
// is one source (see dogmaticsMarkdown.ts for the format); like the commentaries, the ones Loci
// ships are copied in from resources/dogmatics on first launch and travel with the vault.

/** Title and author for each shipped file (a Markdown file carries only its name). */
export const BUNDLED_DOGMATICS: Record<string, { title: string; author: string }> = {}

interface SourceRow {
  id: string
  display_name: string
  author: string | null
  md_relative_path: string
  sort_order: number
  status: string
  indexed_at: string | null
}

const toSource = (r: SourceRow): DogmaticsSource => ({
  id: r.id,
  displayName: r.display_name,
  author: r.author,
  mdRelativePath: r.md_relative_path,
  sortOrder: r.sort_order,
  status: r.status,
  indexedAt: r.indexed_at
})

export function createSource(input: {
  displayName: string
  author: string | null
  mdRelativePath: string
  sortOrder?: number
}): DogmaticsSource {
  const id = randomUUID()
  getDb()
    .prepare(
      'INSERT INTO dogmatics_sources (id, display_name, author, md_relative_path, sort_order) VALUES (?,?,?,?,?)'
    )
    .run(id, input.displayName, input.author, input.mdRelativePath, input.sortOrder ?? 0)
  return getSource(id)!
}

export function getSource(id: string): DogmaticsSource | null {
  const r = getDb().prepare('SELECT * FROM dogmatics_sources WHERE id = ?').get(id) as SourceRow | undefined
  return r ? toSource(r) : null
}

function findSourceByPath(mdRelativePath: string): DogmaticsSource | null {
  const r = getDb()
    .prepare('SELECT * FROM dogmatics_sources WHERE md_relative_path = ?')
    .get(mdRelativePath) as SourceRow | undefined
  return r ? toSource(r) : null
}

/** Sources that have something to read, shipped and user-added alike, in the user's order. */
export function listSources(): DogmaticsSource[] {
  return (
    getDb().prepare('SELECT * FROM dogmatics_sources ORDER BY sort_order, display_name').all() as SourceRow[]
  ).map(toSource)
}

export function replaceSections(sourceId: string, sections: DogmaticsSection[]): void {
  const db = getDb()
  db.transaction(() => {
    db.prepare('DELETE FROM dogmatics_sections WHERE source_id = ?').run(sourceId)
    const ins = db.prepare(`INSERT INTO dogmatics_sections
      (id, source_id, work_ordinal, work_title, book_ordinal, book_number, book_title,
       section_ordinal, section_number, section_title, text)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    for (const s of sections)
      ins.run(
        randomUUID(),
        sourceId,
        s.workOrdinal,
        s.workTitle,
        s.bookOrdinal,
        s.bookNumber,
        s.bookTitle,
        s.sectionOrdinal,
        s.sectionNumber,
        s.sectionTitle,
        s.text
      )
    db.prepare('UPDATE dogmatics_sources SET status = ?, indexed_at = ? WHERE id = ?').run(
      sections.length > 0 ? 'indexed' : 'unindexed',
      new Date().toISOString(),
      sourceId
    )
  })()
}

/** A source's works and their books, for the reader's navigation list. */
export function listOutline(sourceId: string): DogmaticsOutlineWork[] {
  const rows = getDb()
    .prepare(
      `SELECT work_ordinal, work_title, book_ordinal, book_number, book_title, COUNT(*) AS sections
       FROM dogmatics_sections WHERE source_id = ?
       GROUP BY work_ordinal, book_ordinal ORDER BY work_ordinal, book_ordinal`
    )
    .all(sourceId) as {
    work_ordinal: number
    work_title: string
    book_ordinal: number
    book_number: string | null
    book_title: string
    sections: number
  }[]
  const works: DogmaticsOutlineWork[] = []
  for (const r of rows) {
    let work = works[works.length - 1]
    if (!work || work.ordinal !== r.work_ordinal) {
      work = { ordinal: r.work_ordinal, title: r.work_title, books: [] }
      works.push(work)
    }
    work.books.push({ ordinal: r.book_ordinal, number: r.book_number, title: r.book_title, sections: r.sections })
  }
  return works
}

/** Every section of one book of one work, in order. */
export function listBook(sourceId: string, workOrdinal: number, bookOrdinal: number): DogmaticsSectionRow[] {
  return (
    getDb()
      .prepare(
        `SELECT section_ordinal, section_number, section_title, text FROM dogmatics_sections
         WHERE source_id = ? AND work_ordinal = ? AND book_ordinal = ? ORDER BY section_ordinal`
      )
      .all(sourceId, workOrdinal, bookOrdinal) as {
      section_ordinal: number
      section_number: string | null
      section_title: string
      text: string
    }[]
  ).map((r) => ({ ordinal: r.section_ordinal, number: r.section_number, title: r.section_title, text: r.text }))
}

export async function indexSource(sourceId: string, absPath: string): Promise<number> {
  const sections = parseDogmaticsMarkdown(await readFile(absPath, 'utf8'))
  replaceSections(sourceId, sections)
  return sections.length
}

/** Local record of the mtime each dogmatics file had when last indexed on this device — the
 *  same rationale as the commentary and Book of Concord caches. */
function indexMtimesPath(): string {
  return join(getDataDir(), 'dogmatics-index-mtimes.json')
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
  writeFileSync(`${path}.tmp`, JSON.stringify(mtimes, null, 2))
  renameSync(`${path}.tmp`, path)
}

/** Register and index the Markdown files in the vault's dogmatics/ folder: new files become
 *  sources (named from the shipped registry, else the file name) and changed ones re-index.
 *  Returns how many files were indexed. Mirrors syncBocFolder. */
export async function syncDogmaticsFolder(folder: string = dogmaticsVaultDir()): Promise<number> {
  if (!existsSync(folder)) return 0
  const mtimes = loadIndexMtimes()
  let indexed = 0
  let files: string[]
  try {
    files = readdirSync(folder).filter((f) => /\.md$/i.test(f))
  } catch {
    return 0
  }
  const order = Object.keys(BUNDLED_DOGMATICS)
  for (const fileName of files) {
    const storedPath = `dogmatics/${fileName}`
    let mtime: number
    try {
      mtime = Math.floor(statSync(join(folder, fileName)).mtimeMs / 1000)
    } catch {
      continue
    }
    const shipped = BUNDLED_DOGMATICS[fileName]
    const source =
      findSourceByPath(storedPath) ??
      createSource({
        displayName: shipped?.title ?? fileName.replace(/\.md$/i, ''),
        author: shipped?.author ?? null,
        mdRelativePath: storedPath,
        sortOrder: shipped ? order.indexOf(fileName) : order.length
      })
    if (!shouldReindex(mtimes[storedPath], mtime, source.status)) continue
    try {
      await indexSource(source.id, join(folder, fileName))
      mtimes[storedPath] = mtime
      indexed++
    } catch {
      /* best effort — a malformed file just won't produce sections */
    }
  }
  if (indexed) saveIndexMtimes(mtimes)
  return indexed
}

/** Where the shipped dogmatics are: the installer's resources, or the repository. */
export function bundledDogmaticsDir(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'dogmatics')
    : join(app.getAppPath(), 'resources', 'dogmatics')
}

/** Copy the shipped dogmatics into the vault, once each, updating them while untouched. */
export function installBundledDogmatics(sourceDir: string = bundledDogmaticsDir()): string[] {
  return installBundled(sourceDir, dogmaticsVaultDir(), 'bundledDogmatics', 'bundledDogmaticsHashes')
}
