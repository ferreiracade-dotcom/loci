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
import {
  addBocQuote,
  addBocCommentaryQuote,
  listAllQuotes,
  listBocQuotes,
  listBocQuotesForDocument,
  listQuoteGroups
} from './quotes'

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

// Regression: BoC quotes were written correctly but had no read path — listQuoteGroups emitted
// no BoC group and QuoteGroupPane's boc branch stubbed to [], so saved quotes were unreachable
// in the Quotes view. Confirmed against the live DB (4 orphaned rows) before this was fixed.
describe('BoC quote read path', () => {
  const seed = (): { primary: string; commentary: string } => {
    const primary = boc.createSource({
      displayName: "Reader's Edition",
      author: null,
      mdRelativePath: 'read.md'
    })
    const commentary = boc.createCommentarySource({
      displayName: "Reader's Edition Notes",
      author: 'Ed.',
      mdRelativePath: 'read-notes.md'
    })
    addBocQuote({
      bocSourceId: primary.id,
      documentCode: 'AC',
      sectionOrdinal: 6,
      sectionNumber: 'IV',
      sectionLabel: 'Justification',
      paragraph: 2,
      text: 'Primary text quote.'
    })
    addBocCommentaryQuote({
      bocSourceId: commentary.id,
      documentCode: 'AC',
      sectionOrdinal: 6,
      sectionNumber: 'IV',
      sectionLabel: 'Justification',
      paragraph: null,
      text: 'Commentary note quote.'
    })
    return { primary: primary.id, commentary: commentary.id }
  }

  it('surfaces a group per (source, document) with a count', () => {
    const { primary, commentary } = seed()
    const groups = listQuoteGroups('BSB').boc
    expect(groups).toHaveLength(2)

    const p = groups.find((g) => g.bocSourceId === primary)
    expect(p).toMatchObject({ documentCode: 'AC', count: 1 })
    expect(p?.name).toContain('Augsburg Confession')

    // The commentary source lives in a different table but must still group.
    expect(groups.find((g) => g.bocSourceId === commentary)).toMatchObject({
      documentCode: 'AC',
      count: 1
    })
  })

  it('lists the quotes for a group, keeping primary and commentary sources apart', () => {
    const { primary, commentary } = seed()

    const fromPrimary = listBocQuotes(primary, 'AC')
    expect(fromPrimary.map((q) => q.text)).toEqual(['Primary text quote.'])
    expect(fromPrimary[0].citation).toBe("AC IV, 2 (Reader's Edition)")

    const fromCommentary = listBocQuotes(commentary, 'AC')
    expect(fromCommentary.map((q) => q.text)).toEqual(['Commentary note quote.'])
  })

  it('scopes a group to its own document', () => {
    const { primary } = seed()
    addBocQuote({
      bocSourceId: primary,
      documentCode: 'SC',
      sectionOrdinal: 1,
      sectionNumber: null,
      sectionLabel: 'Preface',
      paragraph: null,
      text: 'Small Catechism quote.'
    })

    expect(listBocQuotes(primary, 'AC').map((q) => q.text)).toEqual(['Primary text quote.'])
    expect(listBocQuotes(primary, 'SC').map((q) => q.text)).toEqual(['Small Catechism quote.'])
    expect(listQuoteGroups('BSB').boc.filter((g) => g.bocSourceId === primary)).toHaveLength(2)
  })

  it('emits no BoC groups when nothing has been quoted', () => {
    expect(listQuoteGroups('BSB').boc).toEqual([])
  })
})

// Regression: BocQuotesPanel only ever fetched from the primary-text source (listBocQuotes with
// a single bocSourceId), so quotes anchored to a commentary source (boc_commentary_source_id)
// never appeared in the panel. listBocQuotesForDocument is a document-scoped query that returns
// every quote for a document regardless of which source column it's anchored to.
describe('listBocQuotesForDocument', () => {
  it('returns both primary-text and commentary-anchored quotes for a document, ordered by section ordinal', () => {
    const primary = boc.createSource({
      displayName: "Reader's Edition",
      author: null,
      mdRelativePath: 'ap-primary.md'
    })
    const commentary = boc.createCommentarySource({
      displayName: "Reader's Edition Notes",
      author: 'Ed.',
      mdRelativePath: 'ap-notes.md'
    })

    // Commentary quote first, at a later section ordinal, to prove the result is sorted rather
    // than merely returned in insertion order.
    addBocCommentaryQuote({
      bocSourceId: commentary.id,
      documentCode: 'AP',
      sectionOrdinal: 10,
      sectionNumber: 'IV',
      sectionLabel: 'Justification',
      paragraph: null,
      text: 'A note on justification.'
    })
    addBocQuote({
      bocSourceId: primary.id,
      documentCode: 'AP',
      sectionOrdinal: 2,
      sectionNumber: 'II',
      sectionLabel: 'Original Sin',
      paragraph: 1,
      text: 'Also they teach that since the fall of Adam…'
    })

    const found = listBocQuotesForDocument('AP')
    expect(found.map((q) => q.text)).toEqual([
      'Also they teach that since the fall of Adam…',
      'A note on justification.'
    ])
  })

  it('excludes quotes from a different document', () => {
    const primary = boc.createSource({
      displayName: "Reader's Edition",
      author: null,
      mdRelativePath: 'ap-primary2.md'
    })
    addBocQuote({
      bocSourceId: primary.id,
      documentCode: 'SC',
      sectionOrdinal: 1,
      sectionNumber: null,
      sectionLabel: 'Preface',
      paragraph: null,
      text: 'Small Catechism quote.'
    })

    expect(listBocQuotesForDocument('AP')).toEqual([])
  })
})
