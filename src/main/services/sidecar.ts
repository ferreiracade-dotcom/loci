import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync
} from 'fs'
import { basename, dirname, extname, join } from 'path'
import { getDataDir, getDb } from '../db/connection'

// Loci keeps a metadata + cover sidecar beside each PDF — but in a *separate*
// folder tree so the PDFs themselves stay together and easy to browse. For a PDF
//   <root>/<pdfs>/Title - Author.pdf
// the sidecar lives in
//   <root>/Loci Metadata/Title - Author/{ metadata.json, cover.jpg }
// This makes the catalog rebuildable from the files and replaces Calibre's
// per-book metadata.opf / cover.jpg.

const META_ROOT = 'Loci Metadata'

interface SideRow {
  id: string
  title: string
  author: string | null
  series: string | null
  series_number: string | null
  series_abbr: string | null
  year: number | null
  publisher: string | null
  city: string | null
  status: string
  page_offset: number
  cover_path: string | null
  pdf_path: string | null
  local_path: string | null
}

export interface SidecarData {
  id?: string
  title?: string
  author?: string | null
  series?: string | null
  seriesNumber?: string | null
  seriesAbbr?: string | null
  year?: number | null
  publisher?: string | null
  city?: string | null
  status?: string
  pageOffset?: number
  tags?: string[]
  /** Absolute path to the sidecar cover image, if one exists. */
  coverPath: string | null
}

function pdfBase(pdfPath: string): string {
  return basename(pdfPath, extname(pdfPath))
}

function isCache(p: string): boolean {
  return p.startsWith(join(getDataDir(), 'pdf-cache'))
}

/** The per-book metadata folder, a sibling of the PDF's own folder. */
export function metaDirForPdf(pdfPath: string): string {
  return join(dirname(pdfPath), '..', META_ROOT, pdfBase(pdfPath))
}

/** Real, named PDF locations for a book (excludes the id-named app cache copy). */
function pdfLocations(local: string | null, pdf: string | null): string[] {
  const out: string[] = []
  for (const p of [local, pdf]) {
    if (p && existsSync(p) && !isCache(p) && !out.includes(p)) out.push(p)
  }
  return out
}

function tagsFor(id: string): string[] {
  return (
    getDb()
      .prepare(
        'SELECT t.name FROM book_tags bt JOIN tags t ON t.id = bt.tag_id WHERE bt.book_id = ? ORDER BY t.name'
      )
      .all(id) as { name: string }[]
  ).map((x) => x.name)
}

function findCover(dir: string): string | null {
  for (const n of ['cover.jpg', 'cover.jpeg', 'cover.png', 'cover.webp']) {
    const p = join(dir, n)
    if (existsSync(p)) return p
  }
  return null
}

/** Write (or refresh) the metadata.json + cover for one book, next to each PDF copy. */
export function writeSidecarForBook(id: string): void {
  const r = getDb()
    .prepare(
      `SELECT id, title, author, series, series_number, series_abbr, year, publisher, city,
              status, page_offset, cover_path, pdf_path, local_path
       FROM books WHERE id = ?`
    )
    .get(id) as SideRow | undefined
  if (!r) return
  const meta = {
    loci: 1,
    id: r.id,
    title: r.title,
    author: r.author,
    series: r.series,
    seriesNumber: r.series_number,
    seriesAbbr: r.series_abbr,
    year: r.year,
    publisher: r.publisher,
    city: r.city,
    status: r.status,
    pageOffset: r.page_offset,
    tags: tagsFor(r.id)
  }
  const json = JSON.stringify(meta, null, 2)
  const coverExt = r.cover_path ? extname(r.cover_path) || '.jpg' : '.jpg'
  for (const pdf of pdfLocations(r.local_path, r.pdf_path)) {
    try {
      const dir = metaDirForPdf(pdf)
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, 'metadata.json'), json, 'utf-8')
      if (r.cover_path && existsSync(r.cover_path)) {
        copyFileSync(r.cover_path, join(dir, `cover${coverExt}`))
      }
    } catch {
      /* best effort — a Drive copy may be offline */
    }
  }
}

/** Move a book's sidecar folder when its PDF is renamed (keeps the folder name in sync). */
export function moveSidecar(oldPdf: string | null, newPdf: string | null): void {
  if (!oldPdf || !newPdf || oldPdf === newPdf) return
  if (isCache(oldPdf) || isCache(newPdf)) return
  try {
    const oldDir = metaDirForPdf(oldPdf)
    const newDir = metaDirForPdf(newPdf)
    if (oldDir !== newDir && existsSync(oldDir) && !existsSync(newDir)) {
      mkdirSync(dirname(newDir), { recursive: true })
      renameSync(oldDir, newDir)
    }
  } catch {
    /* best effort */
  }
}

/** Remove a book's sidecar folders (used when the book is deleted from the library). */
export function removeSidecars(local: string | null, pdf: string | null): void {
  for (const p of [local, pdf]) {
    if (!p || isCache(p)) continue
    try {
      const dir = metaDirForPdf(p)
      if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })
    } catch {
      /* best effort */
    }
  }
}

/** Read a sidecar next to a PDF (used on import to restore metadata + cover). */
export function readSidecar(pdfPath: string): SidecarData | null {
  try {
    const dir = metaDirForPdf(pdfPath)
    const jsonPath = join(dir, 'metadata.json')
    if (!existsSync(jsonPath)) return null
    const m = JSON.parse(readFileSync(jsonPath, 'utf-8')) as Partial<SidecarData>
    return { ...m, coverPath: findCover(dir) }
  } catch {
    return null
  }
}

/** Write sidecars for every book — the one-time whole-library pass. */
export function rebuildAllSidecars(onProgress?: (done: number, total: number) => void): number {
  const ids = (getDb().prepare('SELECT id FROM books').all() as { id: string }[]).map((x) => x.id)
  let done = 0
  for (const id of ids) {
    writeSidecarForBook(id)
    done++
    if (onProgress && (done % 25 === 0 || done === ids.length)) onProgress(done, ids.length)
  }
  return done
}
