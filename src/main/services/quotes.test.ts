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
    expect(db.pragma('user_version', { simple: true })).toBeGreaterThanOrEqual(19)
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

// ---------- Church Fathers quotes ----------
import { existsSync, readFileSync } from 'fs'
import { addFathersQuote, deleteQuote, listFathersQuotes, setQuoteCitation } from './quotes'

function seedFathers(): void {
  db.prepare(
    "INSERT INTO fathers_volumes (code, series, number, title, file_key, status) VALUES ('anf01','anf',1,'Apostolic Fathers','fathers/anf01.xml','indexed')"
  ).run()
  db.prepare(
    "INSERT INTO fathers_authors (id, name, sort_year, dates_label, bio) VALUES ('irenaeus','Irenaeus',202,'c. 130–c. 202','Bishop of Lyons.')"
  ).run()
  const sec = db.prepare(
    `INSERT INTO fathers_sections
       (volume_code, id, ordinal, depth, titles_json, short_title, author_id, work_title, editorial, start_page, html, text)
     VALUES ('anf01', ?, ?, 3, '[]', ?, ?, ?, 0, '415', '<p>x</p>', 'x')`
  )
  sec.run('ix.ii.i', 0, 'Preface.', 'irenaeus', 'Against Heresies: Book III')
  sec.run('ix.ii.ii', 1, 'Chapter III.—Apostolic succession.', 'irenaeus', 'Against Heresies: Book III')
  sec.run('x.i', 2, 'Chapter I.—Orphan.', null, 'Fragments')
}

function reinsertSuccessionSection(): void {
  db.prepare(
    `INSERT INTO fathers_sections
       (volume_code, id, ordinal, depth, titles_json, short_title, author_id, work_title, editorial, start_page, html, text)
     VALUES ('anf01', 'ix.ii.ii', 1, 3, '[]', 'Chapter III.—Apostolic succession.', 'irenaeus', 'Against Heresies: Book III', 0, '415', '<p>x</p>', 'x')`
  ).run()
}

describe('addFathersQuote', () => {
  it('creates a Fathers quote cited "Author, *Work* III.3 (ANF 1:415)" and files it under notes/fathers/<author>.md', () => {
    seedFathers()
    const q = addFathersQuote({
      volumeCode: 'anf01', sectionId: 'ix.ii.ii', page: '415', paragraph: 2,
      text: 'the tradition of the apostles'
    })
    expect(q.bookId).toBe('')
    expect(q.citation).toBe('Irenaeus, *Against Heresies* III.3 (ANF 1:415)')
    expect(q.notePath).toBe('notes/fathers/Irenaeus.md')

    const row = db
      .prepare('SELECT book_id, fathers_volume, fathers_section_id, fathers_page, fathers_paragraph FROM quotes WHERE id = ?')
      .get(q.id)
    expect(row).toEqual({
      book_id: null, fathers_volume: 'anf01', fathers_section_id: 'ix.ii.ii', fathers_page: '415', fathers_paragraph: 2
    })

    const note = readFileSync(join(dataDir, 'vault', 'notes', 'fathers', 'Irenaeus.md'), 'utf-8')
    expect(note).toContain('type: fathers-note')
    expect(note).toContain('> the tradition of the apostles')
    expect(note).toContain('— Irenaeus, *Against Heresies* III.3 (ANF 1:415)')
  })

  it('omits the page from the citation when the reader could not tell', () => {
    seedFathers()
    const q = addFathersQuote({ volumeCode: 'anf01', sectionId: 'ix.ii.ii', page: null, paragraph: null, text: 'x' })
    expect(q.citation).toBe('Irenaeus, *Against Heresies* III.3 (ANF 1)')
  })

  it('files a section with no author under "Unattributed" and omits the author from the citation', () => {
    seedFathers()
    const q = addFathersQuote({ volumeCode: 'anf01', sectionId: 'x.i', page: '9', paragraph: 1, text: 'orphan text' })
    expect(q.notePath).toBe('notes/fathers/Unattributed.md')
    expect(q.citation).toBe('*Fragments* 1 (ANF 1:9)')
  })

  it('throws for a section that is not indexed', () => {
    seedFathers()
    expect(() =>
      addFathersQuote({ volumeCode: 'anf01', sectionId: 'nope', page: null, paragraph: null, text: 'x' })
    ).toThrow(/not found/)
  })

  it('recomputes the citation on a later independent read and honours a hand-edited override', () => {
    seedFathers()
    const q = addFathersQuote({ volumeCode: 'anf01', sectionId: 'ix.ii.ii', page: '415', paragraph: 1, text: 'x' })
    expect(listAllQuotes().find((x) => x.id === q.id)?.citation).toBe('Irenaeus, *Against Heresies* III.3 (ANF 1:415)')
    setQuoteCitation(q.id, 'My own citation')
    expect(listAllQuotes().find((x) => x.id === q.id)?.citation).toBe('My own citation')
  })

  it('survives re-indexing: deleting and re-inserting the volume sections keeps the quote', () => {
    seedFathers()
    const q = addFathersQuote({ volumeCode: 'anf01', sectionId: 'ix.ii.ii', page: '415', paragraph: 1, text: 'x' })
    db.prepare("DELETE FROM fathers_sections WHERE volume_code = 'anf01'").run()
    expect((db.prepare('SELECT COUNT(*) AS n FROM quotes').get() as { n: number }).n).toBe(1)
    // With the section gone the citation degrades to empty rather than throwing ...
    expect(listAllQuotes().find((x) => x.id === q.id)?.citation).toBe('')
    // ... and comes back once the volume is indexed again.
    reinsertSuccessionSection()
    expect(listAllQuotes().find((x) => x.id === q.id)?.citation).toBe('Irenaeus, *Against Heresies* III.3 (ANF 1:415)')
  })

  it('deleting the quote removes its block, prunes the empty note file and drops the row', () => {
    seedFathers()
    const q = addFathersQuote({ volumeCode: 'anf01', sectionId: 'ix.ii.ii', page: '415', paragraph: 1, text: 'x' })
    deleteQuote(q.id)
    expect(existsSync(join(dataDir, 'vault', 'notes', 'fathers', 'Irenaeus.md'))).toBe(false)
    expect((db.prepare('SELECT COUNT(*) AS n FROM quotes').get() as { n: number }).n).toBe(0)
  })

  it('indexes the quote text for search', () => {
    seedFathers()
    addFathersQuote({ volumeCode: 'anf01', sectionId: 'ix.ii.ii', page: '415', paragraph: 1, text: 'unmistakable phrase' })
    const hits = db.prepare("SELECT ref FROM search_fts WHERE kind='quote' AND search_fts MATCH 'unmistakable'").all()
    expect(hits).toHaveLength(1)
  })
})

describe('listFathersQuotes', () => {
  it('returns one volume quotes in reading order, then oldest first, excluding other volumes', () => {
    seedFathers()
    db.prepare(
      "INSERT INTO fathers_volumes (code, series, number, title, file_key, status) VALUES ('anf02','anf',2,'Second','fathers/anf02.xml','indexed')"
    ).run()
    db.prepare(
      `INSERT INTO fathers_sections (volume_code, id, ordinal, depth, titles_json, short_title, author_id, work_title, editorial, html, text)
       VALUES ('anf02', 'z', 0, 1, '[]', 'Z', 'irenaeus', 'W', 0, '', 'x')`
    ).run()
    const later = addFathersQuote({ volumeCode: 'anf01', sectionId: 'ix.ii.ii', page: '415', paragraph: 1, text: 'later section' })
    const earlier = addFathersQuote({ volumeCode: 'anf01', sectionId: 'ix.ii.i', page: '414', paragraph: 1, text: 'earlier section' })
    addFathersQuote({ volumeCode: 'anf02', sectionId: 'z', page: '1', paragraph: 1, text: 'other volume' })
    expect(listFathersQuotes('anf01').map((q) => q.id)).toEqual([earlier.id, later.id])
    expect(listFathersQuotes('anf02')).toHaveLength(1)
    expect(listFathersQuotes('npnf101')).toEqual([])
  })
})
