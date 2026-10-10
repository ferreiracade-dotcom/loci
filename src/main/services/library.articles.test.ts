import Database from 'better-sqlite3'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runMigrations } from '../db/migrations'

let db: Database.Database
let root: string
let dataDir: string
let vault: string
let local: string
const cfg = { vaultPath: '' as string | null, primaryLibraryPath: null as string | null, keepLocalCopies: false }

// library.ts reaches the database, the app-data dir and the config only through these modules;
// swap them so the tests never touch Electron (same pattern as quotes.test.ts).
vi.mock('../db/connection', () => ({
  getDb: () => db,
  getDataDir: () => dataDir
}))
vi.mock('./config', () => ({
  readConfig: () => ({ ...cfg }),
  localVaultDir: () => join(dataDir, 'vault')
}))
vi.mock('fs', async (orig) => {
  const actual = await orig<typeof import('fs')>()
  return { ...actual, renameSync: vi.fn(actual.renameSync) }
})
vi.mock('./vaultsync', () => ({ removeFromDrive: () => undefined }))

beforeEach(() => {
  db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
  root = mkdtempSync(join(tmpdir(), 'loci-lib-'))
  dataDir = join(root, 'data')
  vault = join(root, 'vault')
  local = join(root, 'local')
  for (const d of [dataDir, vault, local]) mkdirSync(d, { recursive: true })
  cfg.vaultPath = vault
  cfg.primaryLibraryPath = null
  cfg.keepLocalCopies = false
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

// Imported after the mocks are declared; vitest hoists vi.mock above this either way.
import * as fs from 'fs'
import { backfillLocalCopies, listBooks, moveBook, quickImport, syncLibrary, updateBook } from './library'
import { addQuote } from './quotes'

function insertBook(id: string, title = id): void {
  db.prepare('INSERT INTO books (id, title, title_sanitized, date_added) VALUES (?, ?, ?, 0)').run(id, title, title)
}

/** Write a fake PDF (importOneLocal never parses the bytes); a distinct length per file keeps
 *  the byte-size duplicate check in syncLibrary from treating two files as the same book. */
function writePdf(path: string, size: number): void {
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, Buffer.alloc(size, 1))
}

const kindsByTitle = (): Record<string, string> => Object.fromEntries(listBooks().map((b) => [b.title, b.kind]))

describe('article fields', () => {
  it('lists an existing row as a book with empty article fields', () => {
    insertBook('b1')
    const [b] = listBooks()
    expect(b).toMatchObject({ kind: 'book', journal: null, volume: null, issue: null, pages: null, doi: null })
  })

  it('updateBook stores article details and listBooks returns them', () => {
    insertBook('b1')
    updateBook('b1', { journal: 'Concordia Journal', volume: '12', issue: '3', pages: '45–67', doi: '10.1000/xyz123' })
    const [b] = listBooks()
    expect(b).toMatchObject({
      journal: 'Concordia Journal',
      volume: '12',
      issue: '3',
      pages: '45–67',
      doi: '10.1000/xyz123'
    })
  })

  it('updateBook clears an article field with null', () => {
    insertBook('b1')
    updateBook('b1', { journal: 'CJ', issue: '3' })
    updateBook('b1', { issue: null })
    const [b] = listBooks()
    expect(b.journal).toBe('CJ')
    expect(b.issue).toBeNull()
  })
})

describe('syncLibrary assigns kind from the folder', () => {
  it('vault Books/Articles and local Articles/other are derived and local-only files are copied up', async () => {
    cfg.primaryLibraryPath = local
    writePdf(join(vault, 'pdfs', 'Books', 'Alpha - Bob.pdf'), 101)
    writePdf(join(vault, 'pdfs', 'Articles', 'Beta - Carl.pdf'), 102)
    writePdf(join(local, 'Articles', 'sub', 'Gamma - Dee.pdf'), 103)
    writePdf(join(local, 'Delta - Eve.pdf'), 104)

    await syncLibrary()

    expect(kindsByTitle()).toEqual({ Alpha: 'book', Beta: 'article', Gamma: 'article', Delta: 'book' })
    // Local-only files are uploaded into the vault folder matching their kind.
    expect(existsSync(join(vault, 'pdfs', 'Articles', 'Gamma - Dee.pdf'))).toBe(true)
    expect(existsSync(join(vault, 'pdfs', 'Books', 'Delta - Eve.pdf'))).toBe(true)
  })

  it('treats a local folder called ARTICLES (any case) as articles', async () => {
    cfg.primaryLibraryPath = local
    writePdf(join(local, 'ARTICLES', 'Zed - Yan.pdf'), 105)
    await syncLibrary()
    expect(kindsByTitle()).toEqual({ Zed: 'article' })
  })

  it('re-derives kind from the folder on every sync', async () => {
    writePdf(join(vault, 'pdfs', 'Articles', 'Beta - Carl.pdf'), 102)
    await syncLibrary()
    db.prepare("UPDATE books SET kind = 'book' WHERE title = 'Beta'").run()
    await syncLibrary()
    expect(kindsByTitle()).toEqual({ Beta: 'article' })
  })

  it('does not prune articles catalogued in pdfs/Articles when the scan comes back empty', async () => {
    writePdf(join(vault, 'pdfs', 'Articles', 'Beta - Carl.pdf'), 102)
    await syncLibrary()
    expect(listBooks()).toHaveLength(1)
    // The Articles folder vanishes (e.g. Drive not hydrated): zero files found, one catalogued.
    // The completeness guard must count the Articles rows too, or this row would be pruned.
    rmSync(join(vault, 'pdfs', 'Articles'), { recursive: true, force: true })
    const res = await syncLibrary()
    expect(res.removed).toBe(0)
    expect(listBooks()).toHaveLength(1)
  })
})

describe('quickImport copies into the chosen folder', () => {
  it('an article lands in pdfs/Articles', async () => {
    const src = join(root, 'ext', 'Zeta - Fay.pdf')
    writePdf(src, 201)
    const res = await quickImport([src], () => undefined, 'article')
    expect(res.imported).toBe(1)
    expect(existsSync(join(vault, 'pdfs', 'Articles', 'Zeta - Fay.pdf'))).toBe(true)
    expect(kindsByTitle()).toEqual({ Zeta: 'article' })
  })

  it('defaults to a book in pdfs/Books', async () => {
    const src = join(root, 'ext', 'Zeta - Fay.pdf')
    writePdf(src, 201)
    await quickImport([src], () => undefined)
    expect(existsSync(join(vault, 'pdfs', 'Books', 'Zeta - Fay.pdf'))).toBe(true)
    expect(kindsByTitle()).toEqual({ Zeta: 'book' })
  })

  it('a file already inside the vault keeps the kind its folder implies, whatever was asked', async () => {
    const src = join(vault, 'pdfs', 'Articles', 'Eta - Gus.pdf')
    writePdf(src, 202)
    await quickImport([src], () => undefined, 'book')
    expect(kindsByTitle()).toEqual({ Eta: 'article' })
  })
})

describe('restoring a book from its sidecar', () => {
  it('carries the article fields back; kind comes from the folder, not the sidecar', async () => {
    const pdf = join(vault, 'pdfs', 'Articles', 'Theta - Hal.pdf')
    writePdf(pdf, 301)
    const metaDir = join(vault, 'pdfs', 'Loci Metadata', 'Theta - Hal')
    mkdirSync(metaDir, { recursive: true })
    writeFileSync(
      join(metaDir, 'metadata.json'),
      JSON.stringify({
        id: 'side-1',
        title: 'Theta',
        kind: 'book',
        journal: 'Concordia Journal',
        volume: '12',
        issue: '3',
        pages: '45–67',
        doi: '10.1000/xyz123'
      })
    )
    await syncLibrary()
    expect(listBooks()[0]).toMatchObject({
      id: 'side-1',
      kind: 'article',
      journal: 'Concordia Journal',
      volume: '12',
      issue: '3',
      pages: '45–67',
      doi: '10.1000/xyz123'
    })
  })
})

describe('moveBook', () => {
  async function seedVaultBook(dir: 'Books' | 'Articles', name: string): Promise<string> {
    writePdf(join(vault, 'pdfs', dir, name), 300)
    await syncLibrary()
    return (db.prepare('SELECT id FROM books').get() as { id: string }).id
  }

  it('moves a vault book to Articles, keeps the id and the quotes, updates path and kind', async () => {
    const id = await seedVaultBook('Books', 'Alpha - Bob.pdf')
    db.prepare("INSERT INTO quotes (id, book_id, text, created) VALUES ('q1', ?, 'a quote', 1)").run(id)

    const moved = moveBook(id, 'article')

    expect(moved).not.toBeNull()
    expect(moved?.id).toBe(id)
    expect(moved?.kind).toBe('article')
    expect(existsSync(join(vault, 'pdfs', 'Articles', 'Alpha - Bob.pdf'))).toBe(true)
    expect(existsSync(join(vault, 'pdfs', 'Books', 'Alpha - Bob.pdf'))).toBe(false)
    const row = db.prepare('SELECT pdf_path, kind FROM books WHERE id = ?').get(id) as { pdf_path: string; kind: string }
    expect(row).toEqual({ pdf_path: join(vault, 'pdfs', 'Articles', 'Alpha - Bob.pdf'), kind: 'article' })
    expect((db.prepare('SELECT COUNT(*) n FROM quotes WHERE book_id = ?').get(id) as { n: number }).n).toBe(1)
  })

  it('a name collision gets the -<id8> suffix', async () => {
    const id = await seedVaultBook('Books', 'Alpha - Bob.pdf')
    writePdf(join(vault, 'pdfs', 'Articles', 'Alpha - Bob.pdf'), 999) // already taken by another file
    const moved = moveBook(id, 'article')
    expect(moved?.kind).toBe('article')
    const row = db.prepare('SELECT pdf_path FROM books WHERE id = ?').get(id) as { pdf_path: string }
    expect(row.pdf_path).toBe(join(vault, 'pdfs', 'Articles', `Alpha - Bob-${id.slice(0, 8)}.pdf`))
    expect(existsSync(row.pdf_path)).toBe(true)
    expect(existsSync(join(vault, 'pdfs', 'Articles', 'Alpha - Bob.pdf'))).toBe(true) // the other file untouched
  })

  it('moves back to Books, and the next sync keeps the kind', async () => {
    const id = await seedVaultBook('Articles', 'Beta - Carl.pdf')
    expect(moveBook(id, 'book')?.kind).toBe('book')
    expect(existsSync(join(vault, 'pdfs', 'Books', 'Beta - Carl.pdf'))).toBe(true)
    await syncLibrary()
    expect(listBooks().map((b) => b.kind)).toEqual(['book'])
    expect(listBooks()).toHaveLength(1) // not re-catalogued as a second row
  })

  it('moves the local library copy too (into / out of an Articles folder)', async () => {
    cfg.primaryLibraryPath = local
    const id = await seedVaultBook('Books', 'Alpha - Bob.pdf')
    const localFile = join(local, 'Alpha - Bob.pdf')
    writePdf(localFile, 300)
    db.prepare('UPDATE books SET local_path = ? WHERE id = ?').run(localFile, id)

    moveBook(id, 'article')
    expect(existsSync(join(local, 'Articles', 'Alpha - Bob.pdf'))).toBe(true)
    expect(existsSync(localFile)).toBe(false)
    expect((db.prepare('SELECT local_path FROM books WHERE id = ?').get(id) as { local_path: string }).local_path).toBe(
      join(local, 'Articles', 'Alpha - Bob.pdf')
    )

    moveBook(id, 'book')
    expect(existsSync(localFile)).toBe(true)
  })

  it('a locked file (EBUSY) is not copied: source intact, no dest, DB unchanged, null', async () => {
    const id = await seedVaultBook('Books', 'Alpha - Bob.pdf')
    const src = join(vault, 'pdfs', 'Books', 'Alpha - Bob.pdf')
    vi.mocked(fs.renameSync).mockImplementationOnce(() => {
      throw Object.assign(new Error('busy'), { code: 'EBUSY' })
    })
    expect(moveBook(id, 'article')).toBeNull()
    expect(existsSync(src)).toBe(true)
    expect(existsSync(join(vault, 'pdfs', 'Articles', 'Alpha - Bob.pdf'))).toBe(false)
    expect(db.prepare('SELECT kind, pdf_path FROM books WHERE id = ?').get(id)).toEqual({ kind: 'book', pdf_path: src })
  })

  it('EXDEV falls back to copy + unlink', async () => {
    const id = await seedVaultBook('Books', 'Alpha - Bob.pdf')
    vi.mocked(fs.renameSync).mockImplementationOnce(() => {
      throw Object.assign(new Error('xdev'), { code: 'EXDEV' })
    })
    expect(moveBook(id, 'article')?.kind).toBe('article')
    expect(existsSync(join(vault, 'pdfs', 'Articles', 'Alpha - Bob.pdf'))).toBe(true)
    expect(existsSync(join(vault, 'pdfs', 'Books', 'Alpha - Bob.pdf'))).toBe(false)
  })

  it('never overwrites when the -<id8> name is taken too', async () => {
    const id = await seedVaultBook('Books', 'Alpha - Bob.pdf')
    writePdf(join(vault, 'pdfs', 'Articles', 'Alpha - Bob.pdf'), 999)
    writePdf(join(vault, 'pdfs', 'Articles', `Alpha - Bob-${id.slice(0, 8)}.pdf`), 998)
    expect(moveBook(id, 'article')?.kind).toBe('article')
    const row = db.prepare('SELECT pdf_path FROM books WHERE id = ?').get(id) as { pdf_path: string }
    expect(row.pdf_path).toBe(join(vault, 'pdfs', 'Articles', `Alpha - Bob-${id.slice(0, 8)}-2.pdf`))
    expect(fs.statSync(join(vault, 'pdfs', 'Articles', 'Alpha - Bob.pdf')).size).toBe(999)
    expect(fs.statSync(join(vault, 'pdfs', 'Articles', `Alpha - Bob-${id.slice(0, 8)}.pdf`)).size).toBe(998)
  })

  it('a missing file under a root is a failure: null and kind unchanged', async () => {
    const id = await seedVaultBook('Books', 'Alpha - Bob.pdf')
    rmSync(join(vault, 'pdfs', 'Books', 'Alpha - Bob.pdf'))
    expect(moveBook(id, 'article')).toBeNull()
    expect((db.prepare('SELECT kind FROM books WHERE id = ?').get(id) as { kind: string }).kind).toBe('book')
  })

  it('returns null for an unknown id and is a no-op when the kind already matches', async () => {
    expect(moveBook('nope', 'article')).toBeNull()
    const id = await seedVaultBook('Books', 'Alpha - Bob.pdf')
    expect(moveBook(id, 'book')?.kind).toBe('book')
    expect(existsSync(join(vault, 'pdfs', 'Books', 'Alpha - Bob.pdf'))).toBe(true)
  })
})

describe('cross-device move heal', () => {
  it('a file moved by another device re-points the row: same id, new path, new kind, quotes kept', async () => {
    writePdf(join(vault, 'pdfs', 'Books', 'Mu - Ned.pdf'), 410)
    await syncLibrary()
    const id = (db.prepare('SELECT id FROM books').get() as { id: string }).id
    db.prepare("INSERT INTO quotes (id, book_id, text, created) VALUES ('q1', ?, 'a quote', 1)").run(id)
    // Another device moved it; Drive synced the file (the sidecar folder is keyed by name, not folder).
    mkdirSync(join(vault, 'pdfs', 'Articles'), { recursive: true })
    fs.renameSync(join(vault, 'pdfs', 'Books', 'Mu - Ned.pdf'), join(vault, 'pdfs', 'Articles', 'Mu - Ned.pdf'))

    await syncLibrary()

    const rows = db.prepare('SELECT id, pdf_path, source_path, kind FROM books').all() as {
      id: string
      pdf_path: string
      source_path: string
      kind: string
    }[]
    expect(rows).toHaveLength(1)
    expect(rows[0].id).toBe(id)
    expect(rows[0].pdf_path).toBe(join(vault, 'pdfs', 'Articles', 'Mu - Ned.pdf'))
    expect(rows[0].kind).toBe('article')
    expect((db.prepare('SELECT COUNT(*) n FROM quotes WHERE book_id = ?').get(id) as { n: number }).n).toBe(1)
  })
})

describe('backfillLocalCopies', () => {
  it('places an article offline copy under <library>/Articles', async () => {
    cfg.primaryLibraryPath = local
    cfg.keepLocalCopies = true
    writePdf(join(vault, 'pdfs', 'Articles', 'Nu - Oda.pdf'), 420)
    await syncLibrary()
    db.prepare('UPDATE books SET local_path = NULL').run()
    fs.rmSync(join(local, 'Articles'), { recursive: true, force: true })
    fs.rmSync(join(local, 'Nu - Oda.pdf'), { force: true })
    await backfillLocalCopies()
    const lp = (db.prepare('SELECT local_path FROM books').get() as { local_path: string }).local_path
    expect(lp).toBe(join(local, 'Articles', 'Nu - Oda.pdf'))
    expect(existsSync(lp)).toBe(true)
  })
})

describe('moveBook re-mirrors quote citations', () => {
  it('the vault block carries the article citation after a move', async () => {
    writePdf(join(vault, 'pdfs', 'Books', 'Xi - Pat.pdf'), 430)
    await syncLibrary()
    const id = (db.prepare('SELECT id FROM books').get() as { id: string }).id
    updateBook(id, { journal: 'Concordia Journal', volume: '12', pages: '45–67' })
    const q = addQuote({ bookId: id, text: 'hello world', page: 3 })
    const notePath = (db.prepare('SELECT note_path FROM quotes WHERE id = ?').get(q.id) as { note_path: string }).note_path
    const noteFile = join(dataDir, 'vault', notePath)
    expect(fs.readFileSync(noteFile, 'utf-8')).not.toContain('Concordia Journal')
    moveBook(id, 'article')
    expect(fs.readFileSync(noteFile, 'utf-8')).toContain('Concordia Journal')
  })
})
