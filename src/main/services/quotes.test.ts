import Database from 'better-sqlite3'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runMigrations } from '../db/migrations'

let db: Database.Database
let dataDir: string

// quotes.ts only reaches the database/filesystem through these two (localVaultDir() is
// `getDataDir()/vault`) — swap them so these tests never touch Electron, same pattern as
// commentary.test.ts / boc.test.ts.
vi.mock('../db/connection', () => ({
  getDb: () => db,
  getDataDir: () => dataDir
}))

beforeEach(() => {
  db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
  dataDir = mkdtempSync(join(tmpdir(), 'loci-quotes-'))
})

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true })
})

// Imported after the mock is declared; vitest hoists vi.mock above this either way.
import * as boc from './boc'
import { addBocQuote, addBocCommentaryQuote, listAllQuotes } from './quotes'

describe('migration v19', () => {
  it('adds the BoC quote columns and reaches version 19', () => {
    expect(db.pragma('user_version', { simple: true })).toBe(19)
    const cols = (db.prepare('PRAGMA table_info(quotes)').all() as { name: string }[]).map((c) => c.name)
    for (const c of [
      'boc_source_id',
      'boc_commentary_source_id',
      'boc_ref',
      'boc_section_number',
      'boc_section_label',
      'boc_paragraph'
    ]) {
      expect(cols).toContain(c)
    }
  })
})

describe('addBocQuote', () => {
  it('creates a BoC quote row with boc_ref and a BoC citation', () => {
    const src = boc.createSource({
      displayName: "Reader's Edition",
      author: null,
      mdRelativePath: 're.md'
    })
    const q = addBocQuote({
      bocSourceId: src.id,
      documentCode: 'AC',
      sectionOrdinal: 6,
      sectionNumber: 'IV',
      sectionLabel: 'Justification',
      paragraph: 2,
      text: 'Our churches teach…'
    })

    expect(q.bookId).toBe('')
    expect(q.citation).toBe("AC IV, 2 (Reader's Edition)")

    const row = db
      .prepare('SELECT boc_source_id, boc_ref, book_id FROM quotes WHERE id = ?')
      .get(q.id) as { boc_source_id: string | null; boc_ref: string | null; book_id: string | null }
    expect(row.book_id).toBeNull()
    expect(row.boc_source_id).toBe(src.id)
    expect(row.boc_ref).toBe('AC:6')
  })

  it('cites an unnumbered section by label instead of number, and omits a null paragraph', () => {
    const src = boc.createSource({ displayName: 'Tappert', author: null, mdRelativePath: 'tap.md' })
    const q = addBocQuote({
      bocSourceId: src.id,
      documentCode: 'SC',
      sectionOrdinal: 1,
      sectionNumber: null,
      sectionLabel: 'Preface',
      paragraph: null,
      text: 'Martin Luther to all faithful…'
    })
    expect(q.citation).toBe('SC, Preface (Tappert)')
  })

  it('throws when the source does not exist', () => {
    expect(() =>
      addBocQuote({
        bocSourceId: 'missing',
        documentCode: 'AC',
        sectionOrdinal: 1,
        sectionNumber: 'I',
        sectionLabel: 'God',
        paragraph: null,
        text: 'x'
      })
    ).toThrow()
  })
})

describe('addBocCommentaryQuote', () => {
  it('creates a quote anchored to a BoC commentary source, not the primary-text source', () => {
    const src = boc.createCommentarySource({
      displayName: 'Concordia Commentary',
      author: 'Author',
      mdRelativePath: 'cc.md'
    })
    const q = addBocCommentaryQuote({
      bocSourceId: src.id,
      documentCode: 'AC',
      sectionOrdinal: 6,
      sectionNumber: 'IV',
      sectionLabel: 'Justification',
      paragraph: null,
      text: 'A note on justification.'
    })

    expect(q.bookId).toBe('')
    expect(q.citation).toBe('AC IV (Concordia Commentary)')

    const row = db
      .prepare('SELECT boc_source_id, boc_commentary_source_id, boc_ref FROM quotes WHERE id = ?')
      .get(q.id) as { boc_source_id: string | null; boc_commentary_source_id: string | null; boc_ref: string | null }
    expect(row.boc_source_id).toBeNull()
    expect(row.boc_commentary_source_id).toBe(src.id)
    expect(row.boc_ref).toBe('AC:6')
  })
})

describe('citationForRow BoC branch', () => {
  it('recomputes the same citation on a later independent read (e.g. listAllQuotes)', () => {
    const src = boc.createSource({ displayName: "Reader's Edition", author: null, mdRelativePath: 're2.md' })
    addBocQuote({
      bocSourceId: src.id,
      documentCode: 'AC',
      sectionOrdinal: 6,
      sectionNumber: 'IV',
      sectionLabel: 'Justification',
      paragraph: 2,
      text: 'Our churches teach…'
    })
    const found = listAllQuotes().find((x) => x.text === 'Our churches teach…')
    expect(found?.citation).toBe("AC IV, 2 (Reader's Edition)")
  })

  it('prefers a citation_override when one is set', () => {
    const src = boc.createSource({ displayName: "Reader's Edition", author: null, mdRelativePath: 're3.md' })
    const q = addBocQuote({
      bocSourceId: src.id,
      documentCode: 'AC',
      sectionOrdinal: 6,
      sectionNumber: 'IV',
      sectionLabel: 'Justification',
      paragraph: 2,
      text: 'Our churches teach…'
    })
    db.prepare('UPDATE quotes SET citation_override = ? WHERE id = ?').run('My custom citation', q.id)
    const found = listAllQuotes().find((x) => x.id === q.id)
    expect(found?.citation).toBe('My custom citation')
  })
})
