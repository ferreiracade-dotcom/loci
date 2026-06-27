import { randomUUID } from 'crypto'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  unlinkSync,
  writeFileSync
} from 'fs'
import { copyFile } from 'fs/promises'
import { basename, extname, isAbsolute, join, relative } from 'path'
import { getDataDir, getDb } from '../db/connection'
import { readConfig } from './config'
import { downloadCover, fetchBookMeta } from './metadata'
import * as search from './search'
import type {
  Book,
  BookUpdate,
  ImportProgress,
  ImportResult,
  PdfSource,
  ReadingStatus,
  Shelf,
  Tag
} from '../../shared/ipc'

interface BookRow {
  id: string
  title: string
  title_sanitized: string
  author: string | null
  series: string | null
  series_number: string | null
  series_abbr: string | null
  year: number | null
  publisher: string | null
  city: string | null
  genre: string | null
  status: string
  cover_path: string | null
  pdf_path: string | null
  local_path: string | null
  source_path: string | null
  page_offset: number
  quote_count: number
  last_page: number
  date_added: number
  last_opened: number | null
  indexed: number
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

/** True when `child` lives inside `parent` (so we reference it in place, not copy). */
function isInside(child: string, parent: string): boolean {
  const rel = relative(parent, child)
  return !!rel && !rel.startsWith('..') && !isAbsolute(rel)
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/** Where this book will be read from, without actually opening it. */
function bookPdfSource(localPath: string | null, pdfPath: string | null): PdfSource {
  if (localPath && existsSync(localPath)) return 'local'
  if (findInPrimary(pdfPath, localPath)) return 'local'
  if (pdfPath && existsSync(pdfPath)) return 'drive'
  return 'missing'
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
    series: r.series,
    seriesNumber: r.series_number,
    seriesAbbr: r.series_abbr,
    year: r.year,
    publisher: r.publisher,
    city: r.city,
    genre: r.genre,
    status: r.status as ReadingStatus,
    hasCover: !!r.cover_path && existsSync(r.cover_path),
    pdfSource: bookPdfSource(r.local_path, r.pdf_path),
    pageOffset: r.page_offset,
    quoteCount: r.quote_count,
    lastPage: r.last_page,
    dateAdded: r.date_added,
    lastOpened: r.last_opened,
    indexed: !!r.indexed,
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

/** Set a book's cover from a chosen image file; returns the new cover data URL. */
export function setBookCover(id: string, srcPath: string): string | null {
  if (!existsSync(srcPath)) return null
  const ext = extname(srcPath).toLowerCase() || '.jpg'
  const dest = join(coversDir(), `${id}${ext}`)
  const prev = getDb().prepare('SELECT cover_path FROM books WHERE id = ?').get(id) as
    | { cover_path: string | null }
    | undefined
  if (prev?.cover_path && prev.cover_path !== dest && existsSync(prev.cover_path)) {
    try {
      unlinkSync(prev.cover_path)
    } catch {
      /* best effort */
    }
  }
  copyFileSync(srcPath, dest)
  getDb().prepare('UPDATE books SET cover_path = ? WHERE id = ?').run(dest, id)
  return getCoverDataUrl(id)
}

// In-memory index of the primary library folder, keyed by normalized file name,
// so opening a book can find its local copy by name (portable across machines).
let primaryIndex: Map<string, string> | null = null
let primaryIndexRoot: string | null = null

function normName(file: string): string {
  return basename(file, extname(file))
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

function getPrimaryIndex(): Map<string, string> | null {
  const root = readConfig().primaryLibraryPath
  if (!root || !existsSync(root)) {
    primaryIndex = null
    primaryIndexRoot = null
    return null
  }
  if (primaryIndex && primaryIndexRoot === root) return primaryIndex
  const map = new Map<string, string>()
  for (const f of walkPdfs(root, '')) {
    const key = normName(f)
    if (!map.has(key)) map.set(key, f)
  }
  primaryIndex = map
  primaryIndexRoot = root
  return map
}

/** Locate a book's PDF in the primary library folder by (normalized) file name. */
function findInPrimary(pdfPath: string | null, localPath: string | null): string | null {
  const idx = getPrimaryIndex()
  if (!idx) return null
  const keys = [localPath, pdfPath].filter((c): c is string => !!c).map(normName)
  // 1. Exact normalized-name match.
  for (const k of keys) {
    const hit = idx.get(k)
    if (hit && existsSync(hit)) return hit
  }
  // 2. Prefix match — tolerates long file names truncated by the filesystem
  //    (the stored and on-disk names share a long common prefix). Min length
  //    guards against short, ambiguous names.
  let best: string | null = null
  let bestLen = 0
  for (const [ek, ep] of idx) {
    if (ek.length < 24) continue
    for (const k of keys) {
      if (k.length < 24) continue
      if ((k.startsWith(ek) || ek.startsWith(k)) && Math.min(k.length, ek.length) > bestLen) {
        bestLen = Math.min(k.length, ek.length)
        best = ep
      }
    }
  }
  return best && existsSync(best) ? best : null
}

export function getBookPdf(id: string): Uint8Array | null {
  const db = getDb()
  const r = db.prepare('SELECT local_path, pdf_path FROM books WHERE id = ?').get(id) as
    | { local_path: string | null; pdf_path: string | null }
    | undefined
  db.prepare('UPDATE books SET last_opened = ? WHERE id = ?').run(Date.now(), id)
  // 1. Fast path: a present local copy.
  if (r?.local_path && existsSync(r.local_path)) return readFileSync(r.local_path)
  // 2. Primary library folder (if set): find the file by name and adopt it as the
  //    local copy, so subsequent opens take the fast path above.
  const primary = findInPrimary(r?.pdf_path ?? null, r?.local_path ?? null)
  if (primary) {
    try {
      db.prepare('UPDATE books SET local_path = ? WHERE id = ?').run(primary, id)
    } catch {
      /* best effort */
    }
    return readFileSync(primary)
  }
  // 3. Fall back to the Drive/vault copy (and cache it locally on first open).
  if (!r?.pdf_path || !existsSync(r.pdf_path)) return null
  const bytes = readFileSync(r.pdf_path)
  // Cache-on-open: copy the (possibly cloud-streamed) file to a permanent local
  // cache so subsequent opens are instant and survive Drive cache eviction.
  try {
    const dir = join(getDataDir(), 'pdf-cache')
    mkdirSync(dir, { recursive: true })
    const dest = join(dir, `${id}.pdf`)
    writeFileSync(dest, bytes)
    db.prepare('UPDATE books SET local_path = ? WHERE id = ?').run(dest, id)
  } catch {
    /* best effort — still return the bytes we read */
  }
  return bytes
}

export function setBookLastPage(id: string, page: number): void {
  getDb()
    .prepare('UPDATE books SET last_page = ? WHERE id = ?')
    .run(Math.max(1, Math.round(page)), id)
}

// ---------- Import (fast, local-only) ----------

type ImportOutcome = 'imported' | 'skipped' | 'failed'

async function importOneLocal(sourcePath: string): Promise<ImportOutcome> {
  try {
    const cfg = readConfig()
    if (!cfg.vaultPath) return 'failed'
    if (extname(sourcePath).toLowerCase() !== '.pdf') return 'skipped'
    if (!existsSync(sourcePath)) return 'failed'

    const dupe = getDb()
      .prepare('SELECT id FROM books WHERE source_path = ? OR pdf_path = ?')
      .get(sourcePath, sourcePath)
    if (dupe) return 'skipped'

    const id = randomUUID()
    const title = titleFromFilename(sourcePath)
    const sanitized = sanitizeName(title)

    let pdfPath: string
    if (isInside(sourcePath, cfg.vaultPath)) {
      // Already in the vault — reference in place; never duplicate (or hydrate Drive).
      pdfPath = sourcePath
    } else {
      const cacheDir = join(cfg.vaultPath, 'pdfs', 'cache')
      mkdirSync(cacheDir, { recursive: true })
      let dest = join(cacheDir, `${sanitized}.pdf`)
      if (existsSync(dest)) dest = join(cacheDir, `${sanitized}-${id.slice(0, 8)}.pdf`)
      await copyFile(sourcePath, dest)
      pdfPath = dest
    }

    getDb()
      .prepare(
        `INSERT INTO books (id, title, title_sanitized, pdf_path, source_path, date_added, status)
         VALUES (?, ?, ?, ?, ?, ?, 'unread')`
      )
      .run(id, title, sanitized, pdfPath, sourcePath, Date.now())
    return 'imported'
  } catch {
    return 'failed'
  }
}

/** Phase A: copy/reference + insert records only (no network). Fast and responsive. */
export async function quickImport(
  paths: string[],
  onProgress: (p: ImportProgress) => void
): Promise<ImportResult> {
  const result: ImportResult = { imported: 0, skipped: 0, failed: 0, titles: [] }
  const total = paths.length
  for (let i = 0; i < total; i++) {
    const outcome = await importOneLocal(paths[i])
    result[outcome]++
    if (outcome === 'imported' && result.titles.length < 50) {
      result.titles.push(titleFromFilename(paths[i]))
    }
    if (i % 10 === 0 || i === total - 1) {
      onProgress({ phase: 'importing', done: i + 1, total })
    }
  }
  return result
}

function walkPdfs(dir: string, excludeDir: string): string[] {
  const out: string[] = []
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  for (const name of entries) {
    const full = join(dir, name)
    if (full === excludeDir) continue
    if (name.startsWith('.')) continue
    let isDir = false
    try {
      isDir = statSync(full).isDirectory()
    } catch {
      continue
    }
    if (isDir) {
      out.push(...walkPdfs(full, excludeDir))
    } else if (name.toLowerCase().endsWith('.pdf')) {
      out.push(full)
    }
  }
  return out
}

export function collectSourcePdfs(): string[] {
  const cfg = readConfig()
  if (!cfg.pdfSourcePath || !existsSync(cfg.pdfSourcePath)) return []
  const exclude = cfg.vaultPath ? join(cfg.vaultPath, 'pdfs', 'cache') : ''
  return walkPdfs(cfg.pdfSourcePath, exclude)
}

// ---------- Enrichment (slow, network, throttled, background) ----------

async function pool<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  let cursor = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor++]
      await worker(item)
    }
  })
  await Promise.all(runners)
}

async function enrichOne(id: string, title: string, force = false): Promise<void> {
  const meta = await fetchBookMeta(title)
  let coverPath: string | null = null
  if (meta?.coverUrl) {
    const dest = join(coversDir(), `${id}.jpg`)
    if (await downloadCover(meta.coverUrl, dest)) coverPath = dest
  }
  if (meta) {
    const setExpr = force
      ? 'author=@author, year=@year, publisher=@publisher, genre=@genre'
      : 'author=COALESCE(author,@author), year=COALESCE(year,@year), publisher=COALESCE(publisher,@publisher), genre=COALESCE(genre,@genre)'
    getDb()
      .prepare(
        `UPDATE books SET ${setExpr}, cover_path=COALESCE(@cover, cover_path), meta_fetched=1 WHERE id=@id`
      )
      .run({
        id,
        author: meta.author ?? null,
        year: meta.year ?? null,
        publisher: meta.publisher ?? null,
        genre: meta.genre ?? null,
        cover: coverPath
      })
  } else {
    getDb().prepare('UPDATE books SET meta_fetched=1 WHERE id=@id').run({ id })
  }
}

let enriching = false

/** Phase B: enrich books that haven't been attempted yet, throttled, in the background. */
export async function enrichPending(
  onProgress: (p: ImportProgress) => void,
  onChanged: () => void
): Promise<void> {
  if (enriching) return
  enriching = true
  try {
    for (;;) {
      const pending = getDb()
        .prepare('SELECT id, title FROM books WHERE meta_fetched = 0')
        .all() as { id: string; title: string }[]
      if (pending.length === 0) break
      const total = pending.length
      let done = 0
      await pool(pending, 2, async (b) => {
        await enrichOne(b.id, b.title)
        await sleep(300) // be gentle on the unauthenticated Google Books rate limit
        done++
        onProgress({ phase: 'enriching', done, total })
        if (done % 5 === 0) onChanged()
      })
      onChanged()
    }
  } finally {
    enriching = false
    onProgress({ phase: 'done', done: 0, total: 0 })
    onChanged()
  }
}

// ---------- Mutations ----------

export function updateBook(id: string, patch: BookUpdate): void {
  const columns: Record<keyof BookUpdate, string> = {
    title: 'title',
    author: 'author',
    series: 'series',
    seriesNumber: 'series_number',
    seriesAbbr: 'series_abbr',
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
  const r = getDb().prepare('SELECT cover_path, pdf_path, source_path FROM books WHERE id = ?').get(id) as
    | { cover_path: string | null; pdf_path: string | null; source_path: string | null }
    | undefined
  getDb().prepare('DELETE FROM books WHERE id = ?').run(id)
  search.removeBook(id)
  // Remove the cover, and the cached PDF — but never the user's in-place source file.
  if (r?.cover_path && existsSync(r.cover_path)) {
    try {
      unlinkSync(r.cover_path)
    } catch {
      /* best effort */
    }
  }
  if (r?.pdf_path && r.pdf_path !== r.source_path && existsSync(r.pdf_path)) {
    try {
      unlinkSync(r.pdf_path)
    } catch {
      /* best effort */
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
  await enrichOne(id, r.title, true)
  const row = getDb().prepare('SELECT * FROM books WHERE id = ?').get(id) as BookRow | undefined
  return row ? rowToBook(row) : null
}

export function listShelves(): Shelf[] {
  return getDb()
    .prepare(
      `SELECT s.id, s.name, s.sort_order AS sortOrder, COUNT(bs.book_id) AS count
       FROM shelves s LEFT JOIN book_shelves bs ON bs.shelf_id = s.id
       GROUP BY s.id ORDER BY s.sort_order, s.name COLLATE NOCASE`
    )
    .all() as Shelf[]
}

export function createShelf(name: string): Shelf {
  const clean = name.trim()
  const existing = getDb()
    .prepare('SELECT id, name, sort_order AS sortOrder FROM shelves WHERE name = ?')
    .get(clean) as { id: string; name: string; sortOrder: number } | undefined
  if (existing) return { ...existing, count: 0 }
  const id = randomUUID()
  const max =
    (getDb().prepare('SELECT MAX(sort_order) AS m FROM shelves').get() as { m: number | null }).m ?? 0
  getDb().prepare('INSERT INTO shelves (id, name, sort_order) VALUES (?, ?, ?)').run(id, clean, max + 1)
  return { id, name: clean, sortOrder: max + 1, count: 0 }
}

export function renameShelf(id: string, name: string): void {
  const clean = name.trim()
  if (!clean) return
  try {
    getDb().prepare('UPDATE shelves SET name = ? WHERE id = ?').run(clean, id)
  } catch {
    /* name already taken — ignore */
  }
}

export function deleteShelf(id: string): void {
  // book_shelves rows cascade via the foreign key.
  getDb().prepare('DELETE FROM shelves WHERE id = ?').run(id)
}

export function listTags(): Tag[] {
  return getDb().prepare('SELECT id, name FROM tags ORDER BY name').all() as Tag[]
}
