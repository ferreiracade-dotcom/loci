import { randomUUID } from 'crypto'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  unlinkSync
} from 'fs'
import { basename, extname, join } from 'path'
import { getDataDir, getDb } from '../db/connection'
import { readConfig } from './config'
import { downloadCover, fetchBookMeta } from './metadata'
import type { Book, BookUpdate, ImportResult, ReadingStatus, Shelf, Tag } from '../../shared/ipc'

interface BookRow {
  id: string
  title: string
  title_sanitized: string
  author: string | null
  year: number | null
  publisher: string | null
  city: string | null
  genre: string | null
  status: string
  cover_path: string | null
  pdf_path: string | null
  source_path: string | null
  page_offset: number
  quote_count: number
  last_page: number
  date_added: number
  last_opened: number | null
}

const INVALID_FILENAME = /[:/\\?*"<>|]/g

/** Windows-safe folder/file name from a title (spec §2). */
export function sanitizeName(name: string): string {
  const cleaned = name.replace(INVALID_FILENAME, '-').replace(/\s+/g, ' ').trim().slice(0, 180)
  return cleaned || 'untitled'
}

function titleFromFilename(file: string): string {
  return basename(file, extname(file)).replace(/_+/g, ' ').replace(/\s+/g, ' ').trim()
}

function coversDir(): string {
  const dir = join(getDataDir(), 'covers')
  mkdirSync(dir, { recursive: true })
  return dir
}

function rowToBook(r: BookRow): Book {
  const db = getDb()
  const shelfIds = (
    db.prepare('SELECT shelf_id FROM book_shelves WHERE book_id = ?').all(r.id) as {
      shelf_id: string
    }[]
  ).map((x) => x.shelf_id)
  const tags = (
    db
      .prepare(
        'SELECT t.name FROM book_tags bt JOIN tags t ON t.id = bt.tag_id WHERE bt.book_id = ? ORDER BY t.name'
      )
      .all(r.id) as { name: string }[]
  ).map((x) => x.name)
  return {
    id: r.id,
    title: r.title,
    author: r.author,
    year: r.year,
    publisher: r.publisher,
    city: r.city,
    genre: r.genre,
    status: r.status as ReadingStatus,
    hasCover: !!r.cover_path && existsSync(r.cover_path),
    pageOffset: r.page_offset,
    quoteCount: r.quote_count,
    lastPage: r.last_page,
    dateAdded: r.date_added,
    lastOpened: r.last_opened,
    shelfIds,
    tags
  }
}

export function listBooks(): Book[] {
  const rows = getDb()
    .prepare('SELECT * FROM books ORDER BY title COLLATE NOCASE')
    .all() as BookRow[]
  return rows.map(rowToBook)
}

export function getCoverDataUrl(id: string): string | null {
  const r = getDb().prepare('SELECT cover_path FROM books WHERE id = ?').get(id) as
    | { cover_path: string | null }
    | undefined
  if (!r?.cover_path || !existsSync(r.cover_path)) return null
  const buf = readFileSync(r.cover_path)
  const mime = extname(r.cover_path).toLowerCase() === '.png' ? 'image/png' : 'image/jpeg'
  return `data:${mime};base64,${buf.toString('base64')}`
}

async function enrichBook(id: string, title: string, force = false): Promise<void> {
  const meta = await fetchBookMeta(title)
  if (!meta) return
  let coverPath: string | null = null
  if (meta.coverUrl) {
    const dest = join(coversDir(), `${id}.jpg`)
    if (await downloadCover(meta.coverUrl, dest)) coverPath = dest
  }
  const setExpr = force
    ? 'author=@author, year=@year, publisher=@publisher, genre=@genre'
    : 'author=COALESCE(author,@author), year=COALESCE(year,@year), publisher=COALESCE(publisher,@publisher), genre=COALESCE(genre,@genre)'
  getDb()
    .prepare(`UPDATE books SET ${setExpr}, cover_path=COALESCE(@cover, cover_path) WHERE id=@id`)
    .run({
      id,
      author: meta.author ?? null,
      year: meta.year ?? null,
      publisher: meta.publisher ?? null,
      genre: meta.genre ?? null,
      cover: coverPath
    })
}

type ImportOutcome = 'imported' | 'skipped' | 'failed'

async function importOne(sourcePath: string): Promise<ImportOutcome> {
  try {
    const cfg = readConfig()
    if (!cfg.vaultPath) return 'failed'
    if (extname(sourcePath).toLowerCase() !== '.pdf') return 'skipped'
    if (!existsSync(sourcePath)) return 'failed'

    const already = getDb().prepare('SELECT id FROM books WHERE source_path = ?').get(sourcePath)
    if (already) return 'skipped'

    const id = randomUUID()
    const title = titleFromFilename(sourcePath)
    const sanitized = sanitizeName(title)
    const cacheDir = join(cfg.vaultPath, 'pdfs', 'cache')
    mkdirSync(cacheDir, { recursive: true })
    let dest = join(cacheDir, `${sanitized}.pdf`)
    if (existsSync(dest)) dest = join(cacheDir, `${sanitized}-${id.slice(0, 8)}.pdf`)
    copyFileSync(sourcePath, dest)

    getDb()
      .prepare(
        `INSERT INTO books (id, title, title_sanitized, pdf_path, source_path, date_added, status)
         VALUES (?, ?, ?, ?, ?, ?, 'unread')`
      )
      .run(id, title, sanitized, dest, sourcePath, Date.now())

    await enrichBook(id, title)
    return 'imported'
  } catch {
    return 'failed'
  }
}

async function runImport(paths: string[]): Promise<ImportResult> {
  const result: ImportResult = { imported: 0, skipped: 0, failed: 0, titles: [] }
  for (const p of paths) {
    const outcome = await importOne(p)
    result[outcome]++
    if (outcome === 'imported') result.titles.push(titleFromFilename(p))
  }
  return result
}

export async function importFromSource(): Promise<ImportResult> {
  const cfg = readConfig()
  if (!cfg.pdfSourcePath || !existsSync(cfg.pdfSourcePath)) {
    return { imported: 0, skipped: 0, failed: 0, titles: [] }
  }
  const files = readdirSync(cfg.pdfSourcePath)
    .filter((f) => f.toLowerCase().endsWith('.pdf'))
    .map((f) => join(cfg.pdfSourcePath as string, f))
  return runImport(files)
}

export function importPaths(paths: string[]): Promise<ImportResult> {
  return runImport(paths)
}

export function updateBook(id: string, patch: BookUpdate): void {
  const columns: Record<keyof BookUpdate, string> = {
    title: 'title',
    author: 'author',
    year: 'year',
    publisher: 'publisher',
    city: 'city',
    genre: 'genre',
    status: 'status',
    pageOffset: 'page_offset'
  }
  const sets: string[] = []
  const params: Record<string, string | number | null> = { id }
  for (const key of Object.keys(patch) as (keyof BookUpdate)[]) {
    sets.push(`${columns[key]} = @${key}`)
    params[key] = patch[key] ?? null
  }
  if (sets.length === 0) return
  getDb()
    .prepare(`UPDATE books SET ${sets.join(', ')} WHERE id = @id`)
    .run(params)
}

export function deleteBook(id: string): void {
  const r = getDb().prepare('SELECT cover_path, pdf_path FROM books WHERE id = ?').get(id) as
    | { cover_path: string | null; pdf_path: string | null }
    | undefined
  getDb().prepare('DELETE FROM books WHERE id = ?').run(id)
  for (const p of [r?.cover_path, r?.pdf_path]) {
    if (p && existsSync(p)) {
      try {
        unlinkSync(p)
      } catch {
        /* best effort */
      }
    }
  }
}

export function setBookShelves(id: string, shelfIds: string[]): void {
  const db = getDb()
  db.transaction(() => {
    db.prepare('DELETE FROM book_shelves WHERE book_id = ?').run(id)
    const ins = db.prepare('INSERT OR IGNORE INTO book_shelves (book_id, shelf_id) VALUES (?, ?)')
    for (const sid of shelfIds) ins.run(id, sid)
  })()
}

export function setBookTags(id: string, tagNames: string[]): void {
  const db = getDb()
  db.transaction(() => {
    db.prepare('DELETE FROM book_tags WHERE book_id = ?').run(id)
    const getTag = db.prepare('SELECT id FROM tags WHERE name = ?')
    const insTag = db.prepare('INSERT INTO tags (id, name) VALUES (?, ?)')
    const insJoin = db.prepare('INSERT OR IGNORE INTO book_tags (book_id, tag_id) VALUES (?, ?)')
    for (const raw of tagNames) {
      const name = raw.trim().replace(/^#/, '').toLowerCase()
      if (!name) continue
      const existing = getTag.get(name) as { id: string } | undefined
      let tagId: string
      if (existing) {
        tagId = existing.id
      } else {
        tagId = randomUUID()
        insTag.run(tagId, name)
      }
      insJoin.run(id, tagId)
    }
  })()
}

export async function refetchMetadata(id: string): Promise<Book | null> {
  const r = getDb().prepare('SELECT title FROM books WHERE id = ?').get(id) as
    | { title: string }
    | undefined
  if (!r) return null
  await enrichBook(id, r.title, true)
  const row = getDb().prepare('SELECT * FROM books WHERE id = ?').get(id) as BookRow | undefined
  return row ? rowToBook(row) : null
}

export function listShelves(): Shelf[] {
  const rows = getDb()
    .prepare(
      `SELECT s.id, s.name, s.sort_order AS sortOrder, COUNT(bs.book_id) AS count
       FROM shelves s LEFT JOIN book_shelves bs ON bs.shelf_id = s.id
       GROUP BY s.id ORDER BY s.sort_order, s.name COLLATE NOCASE`
    )
    .all() as Shelf[]
  return rows
}

export function createShelf(name: string): Shelf {
  const clean = name.trim()
  const existing = getDb().prepare('SELECT id, name, sort_order AS sortOrder FROM shelves WHERE name = ?').get(clean) as
    | { id: string; name: string; sortOrder: number }
    | undefined
  if (existing) return { ...existing, count: 0 }
  const id = randomUUID()
  const max =
    (getDb().prepare('SELECT MAX(sort_order) AS m FROM shelves').get() as { m: number | null }).m ?? 0
  getDb().prepare('INSERT INTO shelves (id, name, sort_order) VALUES (?, ?, ?)').run(id, clean, max + 1)
  return { id, name: clean, sortOrder: max + 1, count: 0 }
}

export function listTags(): Tag[] {
  return getDb().prepare('SELECT id, name FROM tags ORDER BY name').all() as Tag[]
}
