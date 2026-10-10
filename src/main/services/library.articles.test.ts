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
import { listBooks, quickImport, syncLibrary, updateBook } from './library'

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

  it('does not prune an article that is catalogued in pdfs/Articles', async () => {
    writePdf(join(vault, 'pdfs', 'Articles', 'Beta - Carl.pdf'), 102)
    await syncLibrary()
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
