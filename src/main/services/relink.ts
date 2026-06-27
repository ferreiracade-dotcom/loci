import { existsSync, readFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { getDataDir, getDb } from '../db/connection'

interface RelinkEntry {
  id: string
  localPath?: string | null
  author?: string | null
  publisher?: string | null
  year?: number | null
  city?: string | null
  coverPath?: string | null
}

/**
 * One-time: apply a relink map (%APPDATA%/Loci/relink.json) written by the
 * library-consolidation script — sets each book's local copy path and, where
 * available, refreshes author/publisher/year/city/cover from local metadata.
 * Runs through better-sqlite3 so the FTS index is untouched. Deletes the map.
 */
export function applyRelinkMap(): void {
  const file = join(getDataDir(), 'relink.json')
  if (!existsSync(file)) return
  let entries: RelinkEntry[]
  try {
    entries = JSON.parse(readFileSync(file, 'utf-8')) as RelinkEntry[]
  } catch {
    return
  }
  const db = getDb()
  const stmt = db.prepare(`
    UPDATE books SET
      local_path = COALESCE(@localPath, local_path),
      author     = COALESCE(@author, author),
      publisher  = COALESCE(@publisher, publisher),
      year       = COALESCE(@year, year),
      city       = COALESCE(@city, city),
      cover_path = COALESCE(@coverPath, cover_path)
    WHERE id = @id
  `)
  const tx = db.transaction((rows: RelinkEntry[]) => {
    for (const r of rows) {
      stmt.run({
        id: r.id,
        localPath: r.localPath ?? null,
        author: r.author ?? null,
        publisher: r.publisher ?? null,
        year: r.year ?? null,
        city: r.city ?? null,
        coverPath: r.coverPath ?? null
      })
    }
  })
  tx(entries)
  try {
    unlinkSync(file)
  } catch {
    /* best effort */
  }
  console.log(`[relink] applied ${entries.length} book relink entries`)
}

interface TitleCleanEntry {
  id: string
  title: string
}

/**
 * One-time: apply a title-clean map (%APPDATA%/Loci/title-clean.json) that strips
 * the trailing author from each book's title. Writes title directly (no file
 * rename), keeping the author field and on-disk "Title - Author.pdf" intact.
 */
export function applyTitleClean(): void {
  const file = join(getDataDir(), 'title-clean.json')
  if (!existsSync(file)) return
  let entries: TitleCleanEntry[]
  try {
    entries = JSON.parse(readFileSync(file, 'utf-8')) as TitleCleanEntry[]
  } catch {
    return
  }
  const db = getDb()
  const stmt = db.prepare('UPDATE books SET title = @title WHERE id = @id')
  const tx = db.transaction((rows: TitleCleanEntry[]) => {
    for (const r of rows) if (r.id && r.title) stmt.run({ id: r.id, title: r.title })
  })
  tx(entries)
  try {
    unlinkSync(file)
  } catch {
    /* best effort */
  }
  console.log(`[title-clean] cleaned ${entries.length} titles`)
}
