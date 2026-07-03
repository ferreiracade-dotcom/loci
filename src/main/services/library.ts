import { randomUUID } from 'crypto'
import {
  appendFileSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync
} from 'fs'
import { copyFile } from 'fs/promises'
import { basename, dirname, extname, isAbsolute, join, relative } from 'path'
import { getDataDir, getDb } from '../db/connection'
import { readConfig } from './config'
import * as search from './search'
import {
  moveSidecar,
  readSidecar,
  removeSidecars,
  writeSidecarForBook,
  type SidecarData
} from './sidecar'
import type {
  Book,
  BookUpdate,
  ImportProgress,
  ImportResult,
  PdfSource,
  ReadingStatus,
  Shelf,
  SyncResult,
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

/** Build the on-disk file base ("Title (Series N) - Author") from a book's metadata. */
function fileBaseFor(
  title: string,
  author: string | null,
  series?: string | null,
  seriesNumber?: string | null
): string {
  const t = title.trim()
  const a = (author ?? '').trim()
  const s = (series ?? '').trim()
  const n = (seriesNumber ?? '').trim()
  const withSeries = s ? `${t} (${s}${n ? ` ${n}` : ''})` : t
  if (!a) return sanitizeName(withSeries)
  const norm = (x: string): string => x.toLowerCase().replace(/[^a-z0-9]/g, '')
  // Don't double up when the title already ends with the author name.
  if (norm(withSeries).endsWith(norm(a))) return sanitizeName(withSeries)
  return sanitizeName(`${withSeries} - ${a}`)
}

/** Authors are stored as one string joined with " & " (see renderer's lib/authors.ts);
 *  tolerate "&", ";", or " and " from the file name and normalize to that canonical form
 *  so a multi-author book still groups/searches as separate authors. */
function normalizeAuthors(raw: string): string {
  return raw
    .split(/\s*[&;]\s*|\s+and\s+/i)
    .map((a) => a.trim())
    .filter(Boolean)
    .join(' & ')
}

export interface ParsedFilenameMeta {
  title: string
  author: string | null
  series: string | null
  seriesNumber: string | null
}

/** A handful of pre-existing excerpt files are named "Quenstedt - Topic" (author first, the
 *  reverse of the Title - Author convention) — recognized and left unsplit rather than
 *  mis-parsed as title "Quenstedt", author "Topic". */
const REVERSED_AUTHOR_PREFIX = /^quenstedt$/i

/**
 * Parse "Title (Series N) - Author" from a PDF's file name (no extension), per the user's
 * fixed local naming convention: the *last* " - " separates the author (possibly more than
 * one, joined by "&"/"and"/";"); a trailing "(Series N)" bracket on the title names its series
 * and volume number. Files outside the convention (no " - ", or the reversed exception above)
 * are left as-is: the whole name becomes the title, author/series stay null.
 */
export function parseFilenameMeta(base: string): ParsedFilenameMeta {
  const cleaned = base.replace(/_+/g, ' ').replace(/\s+/g, ' ').trim()
  const sepIdx = cleaned.lastIndexOf(' - ')
  if (sepIdx === -1) return { title: cleaned, author: null, series: null, seriesNumber: null }
  if (REVERSED_AUTHOR_PREFIX.test(cleaned.slice(0, sepIdx).trim())) {
    return { title: cleaned, author: null, series: null, seriesNumber: null }
  }
  const authorRaw = cleaned.slice(sepIdx + 3).trim()
  const author = authorRaw ? normalizeAuthors(authorRaw) : null
  let titlePart = cleaned.slice(0, sepIdx).trim()
  let series: string | null = null
  let seriesNumber: string | null = null
  // Series is only recognized as a trailing "(Name N)" bracket — a bare "(Note)" with no
  // volume number is left alone, since it isn't necessarily series info.
  const bracketMatch = titlePart.match(/^(.*?)\s*\(([^()]*?)\s+(\d+(?:\.\d+)?)\)\s*$/)
  if (bracketMatch) {
    titlePart = bracketMatch[1].trim()
    series = bracketMatch[2].trim() || null
    seriesNumber = bracketMatch[3]
  }
  return { title: titlePart || cleaned, author, series, seriesNumber }
}

/** Rename a file to <base><ext> in its own directory; returns the resulting path. */
function renameFileToBase(oldPath: string | null, base: string): string | null {
  if (!oldPath || !existsSync(oldPath)) return oldPath
  try {
    const ext = extname(oldPath) || '.pdf'
    const dest = join(dirname(oldPath), `${base}${ext}`)
    if (dest === oldPath) return oldPath
    if (existsSync(dest)) return oldPath // never clobber a different file
    renameSync(oldPath, dest)
    return dest
  } catch {
    return oldPath
  }
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

/** Append a line to the import log so skipped/failed files are diagnosable after the fact. */
function logImport(line: string): void {
  try {
    appendFileSync(join(getDataDir(), 'import-log.txt'), `${new Date().toISOString()} ${line}\n`)
  } catch {
    /* best effort */
  }
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
  writeSidecarForBook(id)
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

function invalidatePrimaryIndex(): void {
  primaryIndex = null
  primaryIndexRoot = null
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
  for (const f of walkPdfs(root, NO_EXCLUDES)) {
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

/**
 * Make the whole library offline-ready: for every book without a present local copy, adopt an
 * existing copy from the local library folder (matched by name OR byte size, so a book already
 * on disk under a different name is never re-downloaded as a second copy) or, only when it's
 * genuinely not local, copy the Drive vault copy down — into the local library folder when one
 * is set (so it becomes your single complete offline library) else the app's private cache.
 * Reading a Drive (Stream) placeholder hydrates it, so this pulls cloud-only books down. Books
 * whose file can't be located (moved/deleted, or Drive offline) are reported as `missing` and
 * can be reconnected one-by-one with relinkBookToFile. Slow (network) and yields between books,
 * so it's safe to run in the background.
 */
export async function backfillLocalCopies(onChanged?: () => void): Promise<{
  connected: number
  alreadyLocal: number
  missing: number
}> {
  const db = getDb()
  const cfg = readConfig()
  const rows = db.prepare('SELECT id, pdf_path, local_path FROM books').all() as {
    id: string
    pdf_path: string | null
    local_path: string | null
  }[]
  const res = { connected: 0, alreadyLocal: 0, missing: 0 }
  const libraryDir =
    cfg.primaryLibraryPath && existsSync(cfg.primaryLibraryPath) ? cfg.primaryLibraryPath : null
  const cacheDir = join(getDataDir(), 'pdf-cache')
  mkdirSync(cacheDir, { recursive: true })

  // Index the local library by byte size so a book already present under a different name than
  // the vault's canonical one is adopted, not downloaded again. (Name matching: findInPrimary.)
  const bySize = new Map<number, string>()
  if (libraryDir) {
    for (const f of walkPdfs(libraryDir, NO_EXCLUDES)) {
      try {
        const s = statSync(f).size
        if (!bySize.has(s)) bySize.set(s, f)
      } catch {
        /* skip unreadable */
      }
    }
  }

  const setLocal = db.prepare('UPDATE books SET local_path = ? WHERE id = ?')
  let done = 0
  for (const r of rows) {
    if (r.local_path && existsSync(r.local_path)) {
      res.alreadyLocal++
    } else {
      let adopt = findInPrimary(r.pdf_path, r.local_path)
      if (!adopt && libraryDir && r.pdf_path && existsSync(r.pdf_path)) {
        try {
          const hit = bySize.get(statSync(r.pdf_path).size) // vault placeholder size, no download
          if (hit && existsSync(hit)) adopt = hit
        } catch {
          /* skip */
        }
      }
      if (adopt) {
        try {
          setLocal.run(adopt, r.id)
        } catch {
          /* best effort */
        }
        res.alreadyLocal++
      } else if (r.pdf_path && existsSync(r.pdf_path)) {
        try {
          const dest = libraryDir
            ? join(libraryDir, basename(r.pdf_path))
            : join(cacheDir, `${r.id}.pdf`)
          if (!existsSync(dest)) await copyFile(r.pdf_path, dest)
          setLocal.run(dest, r.id)
          res.connected++
        } catch {
          res.missing++
        }
      } else {
        res.missing++
      }
    }
    if (++done % 5 === 0) {
      onChanged?.()
      await yieldToLoop() // keep the app responsive during the slow background download
    }
  }
  invalidatePrimaryIndex()
  onChanged?.()
  return res
}

/** Reconnect a book to a chosen PDF on disk: copy it into the local cache and set local_path. */
export function relinkBookToFile(id: string, srcPath: string): Book | null {
  if (!existsSync(srcPath)) return null
  const db = getDb()
  const r = db.prepare('SELECT pdf_path FROM books WHERE id = ?').get(id) as
    | { pdf_path: string | null }
    | undefined
  if (!r) return null
  const localDir = join(getDataDir(), 'pdf-cache')
  mkdirSync(localDir, { recursive: true })
  const dest = join(localDir, `${id}.pdf`)
  try {
    copyFileSync(srcPath, dest)
  } catch {
    return null
  }
  // Record the local copy; if the book had no usable Drive copy, remember the chosen source too.
  if (r.pdf_path && existsSync(r.pdf_path)) {
    db.prepare('UPDATE books SET local_path = ? WHERE id = ?').run(dest, id)
  } else {
    db.prepare('UPDATE books SET local_path = ?, source_path = COALESCE(source_path, ?) WHERE id = ?').run(
      dest,
      srcPath,
      id
    )
  }
  writeSidecarForBook(id)
  const row = db.prepare('SELECT * FROM books WHERE id = ?').get(id) as BookRow | undefined
  return row ? rowToBook(row) : null
}

// ---------- Import (fast, local-only) ----------

type ImportOutcome = 'imported' | 'skipped' | 'failed'

async function importOneLocal(
  sourcePath: string,
  opts?: { skipDownload?: boolean }
): Promise<ImportOutcome> {
  try {
    const cfg = readConfig()
    if (!cfg.vaultPath) {
      logImport(`FAIL ${sourcePath} :: no vault configured`)
      return 'failed'
    }
    if (extname(sourcePath).toLowerCase() !== '.pdf') return 'skipped'
    if (!existsSync(sourcePath)) {
      logImport(`FAIL ${sourcePath} :: file not found`)
      return 'failed'
    }

    const dupe = getDb()
      .prepare('SELECT id FROM books WHERE source_path = ? OR pdf_path = ?')
      .get(sourcePath, sourcePath)
    if (dupe) return 'skipped'

    // A Loci sidecar beside the PDF makes the catalog rebuildable: reuse its id
    // (so notes/quotes stay linked across machines) and its saved metadata.
    const side: SidecarData | null = readSidecar(sourcePath)

    let id: string = randomUUID()
    if (side?.id && typeof side.id === 'string') {
      // Same book already catalogued (a copy in both the vault and the local library,
      // or in pdfs/Books and pdfs/cache) — adopt its id once, never duplicate it.
      if (getDb().prepare('SELECT 1 FROM books WHERE id = ?').get(side.id)) {
        logImport(`skip (already catalogued, id ${side.id}) ${sourcePath}`)
        return 'skipped'
      }
      id = side.id
    }
    // The file name is the source of truth for title/author/series ("Title (Series N) -
    // Author"); a sidecar's saved values (from prior manual edits) take priority when present.
    const parsed = parseFilenameMeta(titleFromFilename(sourcePath))
    const title = side?.title?.trim() || parsed.title
    const author = side?.author ?? parsed.author
    const series = side?.series ?? parsed.series
    const seriesNumber = side?.seriesNumber ?? parsed.seriesNumber
    const sanitized = sanitizeName(title)

    let pdfPath: string
    if (isInside(sourcePath, cfg.vaultPath)) {
      // Already in the vault — reference in place; never duplicate (or hydrate Drive).
      pdfPath = sourcePath
    } else {
      // A book added from outside the vault (e.g. dropped in the local library folder): copy it
      // up to the Drive vault's Books folder under a canonical "Title (Series N) - Author" name,
      // so the two folders stay mirrored and the book is rebuildable from its sidecar.
      const booksDir = join(cfg.vaultPath, 'pdfs', 'Books')
      mkdirSync(booksDir, { recursive: true })
      const base = fileBaseFor(title, author, series, seriesNumber)
      let dest = join(booksDir, `${base}.pdf`)
      if (existsSync(dest)) dest = join(booksDir, `${base}-${id.slice(0, 8)}.pdf`)
      await copyFile(sourcePath, dest)
      pdfPath = dest
    }

    // When "keep a local copy" is on, make the book available offline — but reuse a copy that
    // already exists in the local library folder (e.g. D:\Theology\PDF) instead of re-downloading
    // from Drive. Only genuinely Drive-only books are pulled down, into the local library folder
    // when one is set (so it stays your single offline library), else the app's private cache.
    // During the startup reconcile (skipDownload) we adopt an existing local copy but never
    // download inline — that heavy backfill runs in the background so the catalog builds fast.
    // Best effort — a failure here just falls back to cache-on-open.
    let localPath: string | null = null
    if (cfg.keepLocalCopies) {
      const existing = findInPrimary(pdfPath, sourcePath)
      if (existing) {
        localPath = existing
      } else if (!opts?.skipDownload) {
        try {
          const intoLibrary = !!cfg.primaryLibraryPath && existsSync(cfg.primaryLibraryPath)
          const dir = intoLibrary
            ? (cfg.primaryLibraryPath as string)
            : join(getDataDir(), 'pdf-cache')
          mkdirSync(dir, { recursive: true })
          const dest = intoLibrary ? join(dir, basename(sourcePath)) : join(dir, `${id}.pdf`)
          if (!existsSync(dest)) await copyFile(sourcePath, dest)
          localPath = dest
        } catch {
          /* fall back to cache-on-open */
        }
      }
    }

    const status =
      side?.status === 'reading' || side?.status === 'finished' ? side.status : 'unread'
    getDb()
      .prepare(
        `INSERT INTO books
           (id, title, title_sanitized, author, series, series_number, series_abbr, year,
            publisher, city, page_offset, pdf_path, local_path, source_path, date_added, status,
            meta_fetched)
         VALUES
           (@id, @title, @san, @author, @series, @num, @abbr, @year, @publisher, @city,
            @offset, @pdf, @local, @source, @added, @status, @fetched)`
      )
      .run({
        id,
        title,
        san: sanitized,
        author,
        series,
        num: seriesNumber,
        abbr: side?.seriesAbbr ?? null,
        year: side?.year ?? null,
        publisher: side?.publisher ?? null,
        city: side?.city ?? null,
        offset: side?.pageOffset ?? 0,
        pdf: pdfPath,
        local: localPath,
        source: sourcePath,
        added: Date.now(),
        status,
        // Title/author/series are already parsed from the file name above — nothing left
        // to enrich in the background.
        fetched: 1
      })

    if (side) {
      if (side.tags?.length) setBookTags(id, side.tags)
      if (side.coverPath && existsSync(side.coverPath)) setBookCover(id, side.coverPath)
    }
    // Ensure a metadata sidecar sits beside the PDF so the catalog stays rebuildable and a book
    // uploaded from the local folder gets its metadata home on Drive.
    writeSidecarForBook(id)
    return 'imported'
  } catch (e) {
    logImport(`FAIL ${sourcePath} :: ${(e as Error)?.message ?? String(e)}`)
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

const NO_EXCLUDES: ReadonlySet<string> = new Set()

/**
 * Yield the main-process event loop so a long reconcile (hundreds of synchronous stat/DB/file
 * ops) never blocks IPC — otherwise the window stops pumping and Windows marks it "Not
 * Responding" while the catalog is rebuilt on startup.
 */
function yieldToLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve))
}

function walkPdfs(dir: string, excludes: ReadonlySet<string>): string[] {
  const out: string[] = []
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  for (const name of entries) {
    const full = join(dir, name)
    if (excludes.has(full)) continue
    if (name.startsWith('.')) continue
    let isDir = false
    try {
      isDir = statSync(full).isDirectory()
    } catch {
      continue
    }
    if (isDir) {
      out.push(...walkPdfs(full, excludes))
    } else if (name.toLowerCase().endsWith('.pdf')) {
      out.push(full)
    }
  }
  return out
}

/**
 * Every PDF the library should be (re)built from: the vault's own named PDF folders
 * (`<vault>/pdfs/**`), minus the import `cache` (duplicate working copies) and the
 * `Loci Metadata` sidecar tree. Each book carries a sidecar with its original id + metadata,
 * so the catalog is rebuildable with notes/quotes still linked. Books are referenced in place;
 * "keep local copies" then pulls each down to the local cache for offline reading. Importing
 * from a separate local folder is intentionally *not* done here — matching the same book across
 * differently-named local/Drive copies is unreliable and is what created duplicates before.
 */
export function collectSourcePdfs(): string[] {
  const cfg = readConfig()
  if (!cfg.vaultPath) return []
  const root = join(cfg.vaultPath, 'pdfs')
  if (!existsSync(root)) return []
  const excludes = new Set([join(root, 'cache'), join(root, 'Loci Metadata')])
  return walkPdfs(root, excludes)
}

/**
 * Reconcile the catalog with the two book folders — the Drive vault's `pdfs/Books` and the local
 * library folder — so books added to either place show up automatically and the folders mirror
 * each other:
 *  - Pass A: every Drive book is catalogued (source of truth; carries the sidecar id) and its
 *    local copy is resolved local-first (reuse the local file, download only what's Drive-only).
 *  - Pass B: a local file with no same-size copy on Drive is a new local book — it's uploaded to
 *    the vault and catalogued. Matching is by byte size (identical copies share a size, read from
 *    a Drive placeholder without downloading), so the same book is never catalogued twice.
 *  - Pass C: catalog rows whose Drive PDF has gone missing are pruned (stale/quarantined entries),
 *    but only while the vault is mounted, so an offline Drive can never trigger a mass delete.
 */
export async function syncLibrary(
  onProgress?: (p: ImportProgress) => void,
  onChanged?: () => void
): Promise<SyncResult> {
  const cfg = readConfig()
  const titles: string[] = []
  let removed = 0
  if (!cfg.vaultPath) return { added: 0, removed: 0, total: listBooks().length, titles }

  const booksDir = join(cfg.vaultPath, 'pdfs', 'Books')
  const vaultFiles = existsSync(booksDir) ? walkPdfs(booksDir, NO_EXCLUDES) : []
  const localFiles =
    cfg.primaryLibraryPath && existsSync(cfg.primaryLibraryPath)
      ? walkPdfs(cfg.primaryLibraryPath, NO_EXCLUDES)
      : []

  // Byte sizes already on Drive — to tell whether a local file is a copy of a book the vault
  // already has (so we never upload a duplicate). A local file is a copy of a book the vault
  // already holds if it matches by byte size OR by normalized name — the local library mirrors
  // the vault under the same "Title - Author.pdf" names, but a file that was re-saved differs in
  // size while keeping its name, and a renamed copy keeps its size; either signal alone misses
  // real duplicates, so we treat a match on *either* as "already on Drive". statSync reads size
  // from a Drive placeholder without downloading.
  const vaultSizes = new Set<number>()
  const vaultNames = new Set<string>()
  for (let i = 0; i < vaultFiles.length; i++) {
    vaultNames.add(normName(vaultFiles[i]))
    try {
      vaultSizes.add(statSync(vaultFiles[i]).size)
    } catch {
      /* skip unreadable */
    }
    if (i % 20 === 0) await yieldToLoop()
  }

  // Local files that are genuinely new (match the vault by neither name nor size) — only these
  // get uploaded. The local library mirrors the vault under the same "Title - Author.pdf" names,
  // so a re-saved copy (same name, different bytes) and a renamed copy (same bytes) are both still
  // recognized as existing books and read in place locally (findInPrimary), never re-uploaded.
  // Filtering here (not mid-loop) keeps the progress total honest: it counts books actually being
  // added, not every file scanned.
  const newLocalFiles: string[] = []
  for (let i = 0; i < localFiles.length; i++) {
    const lf = localFiles[i]
    if (vaultNames.has(normName(lf))) continue
    try {
      if (vaultSizes.has(statSync(lf).size)) continue
    } catch {
      continue // unreadable — don't catalog a file we can't even stat
    }
    newLocalFiles.push(lf)
    if (i % 20 === 0) await yieldToLoop()
  }

  const total = vaultFiles.length + newLocalFiles.length
  let done = 0
  const tick = (): void => {
    if (++done % 5 === 0) {
      onProgress?.({ phase: 'importing', done, total })
      onChanged?.()
    }
  }

  // Pass A — every Drive book (referenced in place, local-first copy). Downloads for offline use
  // are skipped here and done by the background backfill so the catalog builds fast.
  for (let i = 0; i < vaultFiles.length; i++) {
    if ((await importOneLocal(vaultFiles[i], { skipDownload: true })) === 'imported') {
      titles.push(titleFromFilename(vaultFiles[i]))
    }
    tick()
    if (i % 8 === 0) await yieldToLoop() // keep IPC responsive during the rebuild
  }
  // Pass B — genuinely-new local books → uploaded to the vault + catalogued.
  for (let i = 0; i < newLocalFiles.length; i++) {
    if ((await importOneLocal(newLocalFiles[i], { skipDownload: true })) === 'imported') {
      titles.push(titleFromFilename(newLocalFiles[i]))
    }
    tick()
    if (i % 8 === 0) await yieldToLoop()
  }
  // Pass C — prune entries whose Drive PDF is gone (vault-mounted only). Delete just the catalog
  // row + search index; never the sidecar files (those can be shared by same-named books).
  // Guard: a Drive-desktop mount that hasn't finished hydrating yet (e.g. right after login/
  // wake, or Loci launching before Drive) makes `walkPdfs` silently return an incomplete list
  // (readdirSync failures are swallowed there) while `existsSync(cfg.vaultPath)` still passes
  // because the mount point itself resolves. Without this check that reads as "these books'
  // files are gone" and prunes rows that are actually still safely on Drive — losing their id
  // (and anything linked to it: notes, quotes, highlights, shelves/tags) the moment they get
  // re-catalogued as "new" on a later launch. If this scan found far fewer vault files than the
  // catalog expects, treat it as an incomplete scan and skip pruning rather than risk that.
  if (existsSync(cfg.vaultPath)) {
    const catalogedInVault = (
      getDb()
        .prepare('SELECT COUNT(*) c FROM books WHERE pdf_path LIKE ?')
        .get(`${booksDir}%`) as { c: number }
    ).c
    if (catalogedInVault > 20 && vaultFiles.length < catalogedInVault * 0.8) {
      console.warn(
        `[sync] skipping stale-row prune: scan found ${vaultFiles.length} vault files but ` +
          `${catalogedInVault} are catalogued — Drive may still be mounting`
      )
    } else {
      const rows = getDb().prepare('SELECT id, pdf_path FROM books').all() as {
        id: string
        pdf_path: string | null
      }[]
      const del = getDb().prepare('DELETE FROM books WHERE id = ?')
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i]
        if (r.pdf_path && !existsSync(r.pdf_path)) {
          del.run(r.id)
          search.removeBook(r.id)
          removed++
        }
        if (i % 50 === 0) await yieldToLoop()
      }
    }
  }

  onProgress?.({ phase: 'done', done: 0, total: 0 })
  onChanged?.()
  return { added: titles.length, removed, total: listBooks().length, titles }
}

// ---------- Enrichment (fast, filename-only, background) ----------

/** Re-derive title/author/series/volume from a book's PDF file name — the source of truth. */
/** Returns true when a genuine title/author split was found and the row was updated. */
function enrichOne(id: string): boolean {
  const row = getDb()
    .prepare('SELECT pdf_path, series, series_number FROM books WHERE id = ?')
    .get(id) as
    | { pdf_path: string | null; series: string | null; series_number: string | null }
    | undefined
  if (!row?.pdf_path) {
    getDb().prepare('UPDATE books SET meta_fetched=1 WHERE id=@id').run({ id })
    return false
  }
  const parsed = parseFilenameMeta(titleFromFilename(row.pdf_path))
  // Only a genuine "Title - Author" split (parsed.author present) overwrites the row — a file
  // that doesn't match the convention is left exactly as it is, just marked processed.
  if (!parsed.author) {
    getDb().prepare('UPDATE books SET meta_fetched=1 WHERE id=@id').run({ id })
    return false
  }
  getDb()
    .prepare(
      `UPDATE books SET title=@title, title_sanitized=@san, author=@author, series=@series,
         series_number=@num, meta_fetched=1 WHERE id=@id`
    )
    .run({
      id,
      title: parsed.title,
      san: sanitizeName(parsed.title),
      author: parsed.author,
      // A file with no "(Series N)" bracket carries no series signal — keep whatever the book
      // already had rather than blanking out series data that came from elsewhere (a sidecar,
      // a prior curation pass, or a manual edit).
      series: parsed.series ?? row.series,
      num: parsed.seriesNumber ?? row.series_number
    })
  return true
}

let enriching = false

/** Phase B: re-parse books not yet processed by the current file-name convention. */
export async function enrichPending(
  onProgress: (p: ImportProgress) => void,
  onChanged: () => void
): Promise<void> {
  if (enriching) return
  enriching = true
  try {
    const pending = getDb().prepare('SELECT id FROM books WHERE meta_fetched = 0').all() as {
      id: string
    }[]
    const total = pending.length
    let done = 0
    for (const b of pending) {
      enrichOne(b.id)
      done++
      if (done % 10 === 0) {
        onProgress({ phase: 'enriching', done, total })
        onChanged()
        await yieldToLoop()
      }
    }
    if (total > 0) onChanged()
  } finally {
    enriching = false
    onProgress({ phase: 'done', done: 0, total: 0 })
    onChanged()
  }
}

/**
 * One-time: for books that predate file-name-based enrichment and never got a real author
 * (from a sidecar or the old Google Books lookup), re-derive title/author/series from the PDF
 * file name. Scoped to `author IS NULL` only — those rows have nothing to lose, so this can
 * only add data, never overwrite an existing curated title/author/series with a worse guess.
 * Triggered by a flag file (in-process, single connection — safe for a bulk update, unlike an
 * external script against a live WAL database), and runs once.
 */
export function applyFilenameAuthorMigration(): void {
  const flag = join(getDataDir(), 'filename-author-migration.flag')
  if (!existsSync(flag)) return
  const rows = getDb()
    .prepare('SELECT id FROM books WHERE author IS NULL')
    .all() as { id: string }[]
  let updated = 0
  for (const r of rows) {
    if (enrichOne(r.id)) updated++
  }
  try {
    unlinkSync(flag)
  } catch {
    /* best effort */
  }
  console.log(`[filename-author] derived an author for ${updated}/${rows.length} books`)
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

  const db = getDb()

  // When the title, author, or series changes, rename the underlying files (local + Drive)
  // to "Title (Series N) - Author" so the file name reflects the metadata and stays easy to
  // locate across machines. Best-effort: never deletes or clobbers another file.
  if ('title' in patch || 'author' in patch || 'series' in patch || 'seriesNumber' in patch) {
    const before = db
      .prepare(
        'SELECT title, author, series, series_number, pdf_path, local_path, source_path FROM books WHERE id = ?'
      )
      .get(id) as
      | {
          title: string
          author: string | null
          series: string | null
          series_number: string | null
          pdf_path: string | null
          local_path: string | null
          source_path: string | null
        }
      | undefined
    if (before) {
      const newTitle = ('title' in patch ? patch.title : before.title) || before.title
      const newAuthor = 'author' in patch ? patch.author ?? null : before.author
      const newSeries = 'series' in patch ? patch.series ?? null : before.series
      const newSeriesNumber =
        'seriesNumber' in patch ? patch.seriesNumber ?? null : before.series_number
      const base = fileBaseFor(newTitle, newAuthor, newSeries, newSeriesNumber)
      const cacheDir = join(getDataDir(), 'pdf-cache')
      // Leave the id-named cache copy alone; rename real, named files in place.
      const rn = (p: string | null): string | null =>
        p && !isInside(p, cacheDir) ? renameFileToBase(p, base) : p
      const newPdf = rn(before.pdf_path)
      const newLocal = rn(before.local_path)
      const newSource =
        before.source_path && before.source_path === before.pdf_path
          ? newPdf
          : before.source_path && before.source_path === before.local_path
            ? newLocal
            : rn(before.source_path)
      if (
        newPdf !== before.pdf_path ||
        newLocal !== before.local_path ||
        newSource !== before.source_path
      ) {
        sets.push(
          'pdf_path = @__pdf',
          'local_path = @__local',
          'source_path = @__source',
          'title_sanitized = @__san'
        )
        params.__pdf = newPdf
        params.__local = newLocal
        params.__source = newSource
        params.__san = base
        invalidatePrimaryIndex()
        // Keep the sidecar folders' names in step with the renamed PDFs.
        moveSidecar(before.pdf_path, newPdf)
        moveSidecar(before.local_path, newLocal)
      }
    }
  }

  if (sets.length === 0) return
  db.prepare(`UPDATE books SET ${sets.join(', ')} WHERE id = @id`).run(params)
  // Refresh the metadata sidecar to reflect the change.
  writeSidecarForBook(id)
}

export function deleteBook(id: string): void {
  const r = getDb()
    .prepare('SELECT cover_path, pdf_path, local_path, source_path FROM books WHERE id = ?')
    .get(id) as
    | {
        cover_path: string | null
        pdf_path: string | null
        local_path: string | null
        source_path: string | null
      }
    | undefined
  getDb().prepare('DELETE FROM books WHERE id = ?').run(id)
  search.removeBook(id)
  if (r) removeSidecars(r.local_path, r.pdf_path)
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
  writeSidecarForBook(id)
}

/** Re-parse a single book's title/author/series from its file name (see enrichOne). */
export function refetchMetadata(id: string): Book | null {
  enrichOne(id)
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
