import Database from 'better-sqlite3'
import { mkdirSync, mkdtempSync, rmSync } from 'fs'
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
import { listBooks, updateBook } from './library'

function insertBook(id: string, title = id): void {
  db.prepare('INSERT INTO books (id, title, title_sanitized, date_added) VALUES (?, ?, ?, 0)').run(id, title, title)
}

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
