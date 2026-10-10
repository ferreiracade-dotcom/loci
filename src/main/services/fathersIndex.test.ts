import Database from 'better-sqlite3'
import { existsSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runMigrations } from '../db/migrations'
import { FATHERS_AUTHORS } from '../data/fathersAuthors'
import { ANF_MINI, NPNF_MINI } from './__fixtures__/thmlSamples'

let db: Database.Database
let dataDir: string
vi.mock('../db/connection', () => ({ getDb: () => db, getDataDir: () => dataDir }))

beforeEach(() => {
  db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
  dataDir = mkdtempSync(join(tmpdir(), 'loci-fathers-index-'))
})

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true })
})

import { deriveWorkTitle, parseVolumeFile, syncFathersFolder } from './fathersIndex'
import { search } from './search'

const fathersDir = (): string => join(dataDir, 'vault', 'fathers')
function writeVolume(fileName: string, xml: string): string {
  mkdirSync(fathersDir(), { recursive: true })
  const p = join(fathersDir(), fileName)
  writeFileSync(p, xml)
  return p
}
const count = (sql: string, ...args: unknown[]): number =>
  (db.prepare(sql).get(...args) as { n: number }).n

describe('parseVolumeFile', () => {
  it('accepts CCEL volume file names and decodes series and number', () => {
    expect(parseVolumeFile('anf01.xml')).toEqual({ code: 'anf01', series: 'anf', number: 1 })
    expect(parseVolumeFile('NPNF105.XML')).toEqual({ code: 'npnf105', series: 'npnf1', number: 5 })
    expect(parseVolumeFile('npnf214.xml')).toEqual({ code: 'npnf214', series: 'npnf2', number: 14 })
  })
  it('rejects anything else', () => {
    for (const f of ['readme.xml', 'anf1.xml', 'anf01.html', 'anf01', 'npnf301.xml', '_author_ids.json']) {
      expect(parseVolumeFile(f)).toBeNull()
    }
  })
})

describe('deriveWorkTitle', () => {
  it('prefers a contained-work head title', () => {
    expect(deriveWorkTitle('anf', 'Against Heresies: Book III', ['IRENÆUS', 'x'])).toBe('Against Heresies: Book III')
  })
  it('falls back to the div2 title in ANF and the div1 title in NPNF', () => {
    expect(deriveWorkTitle('anf', null, ['IRENÆUS', 'Introductory Note'])).toBe('Introductory Note')
    expect(deriveWorkTitle('anf', null, ['Title Page'])).toBe('Title Page')
    expect(deriveWorkTitle('npnf1', null, ['The Confessions', 'Book I', 'Chapter I'])).toBe('The Confessions')
  })
})

describe('syncFathersFolder', () => {
  it('does nothing (and does not throw) when the vault has no fathers folder', async () => {
    await syncFathersFolder()
    expect(count('SELECT COUNT(*) AS n FROM fathers_volumes')).toBe(0)
  })

  it('indexes volumes: sections, refs, notes, pages, authors and the volume rows', async () => {
    writeVolume('anf01.xml', ANF_MINI)
    writeVolume('npnf101.xml', NPNF_MINI)
    writeVolume('readme.xml', '<x/>') // ignored
    await syncFathersFolder()

    expect(db.prepare('SELECT code, series, number, title, status, error FROM fathers_volumes ORDER BY code').all()).toEqual([
      {
        code: 'anf01', series: 'anf', number: 1,
        title: 'The Apostolic Fathers with Justin Martyr and Irenaeus', status: 'indexed', error: null
      },
      {
        code: 'npnf101', series: 'npnf1', number: 1,
        title: 'The Confessions and Letters of St. Augustine, with a Sketch of his Life and Work',
        status: 'indexed', error: null
      }
    ])
    expect(count("SELECT COUNT(*) AS n FROM fathers_sections WHERE volume_code='anf01'")).toBe(11)
    expect(count("SELECT COUNT(*) AS n FROM fathers_sections WHERE volume_code='npnf101'")).toBe(2)
    expect(count("SELECT COUNT(*) AS n FROM fathers_scripture_refs WHERE volume_code='anf01'")).toBe(6)
    expect(count("SELECT COUNT(*) AS n FROM fathers_scripture_refs WHERE volume_code='npnf101' AND in_note=1")).toBe(1)
    expect(count("SELECT COUNT(*) AS n FROM fathers_notes WHERE volume_code='anf01'")).toBe(2)
    expect(count("SELECT COUNT(*) AS n FROM fathers_pages WHERE volume_code='anf01'")).toBe(5)
    expect(count('SELECT COUNT(*) AS n FROM fathers_authors')).toBe(FATHERS_AUTHORS.length)
    expect(existsSync(join(dataDir, 'fathers-index-mtimes.json'))).toBe(true)
  })

  it('stores structured refs and the editorial / start-page columns', async () => {
    writeVolume('anf01.xml', ANF_MINI)
    await syncFathersFolder()
    expect(
      db
        .prepare(
          `SELECT book, chapter_start AS cs, verse_start AS vs, chapter_end AS ce, verse_end AS ve, in_note AS inNote
           FROM fathers_scripture_refs WHERE section_id = 'ix.ii.ii' ORDER BY char_offset, book`
        )
        .all()
    ).toEqual([
      { book: 'ROM', cs: 16, vs: 3, ce: 16, ve: 4, inNote: 0 },
      { book: '1CO', cs: 2, vs: 9, ce: 2, ve: 9, inNote: 0 },
      { book: 'ISA', cs: 64, vs: 4, ce: 64, ve: 4, inNote: 0 }
    ])
    const sec = db
      .prepare("SELECT editorial, start_page AS sp, work_title AS wt FROM fathers_sections WHERE id = 'ix.i'")
      .get()
    expect(sec).toEqual({ editorial: 1, sp: '6', wt: 'Introductory Note to Irenæus Against Heresies' })
  })

  it('applies the curated author override over a wrong CCEL head (Barnabas -> barnabas)', async () => {
    writeVolume('anf01.xml', ANF_MINI)
    await syncFathersFolder()
    const authorOf = (id: string): string | null =>
      (db.prepare("SELECT author_id AS a FROM fathers_sections WHERE volume_code='anf01' AND id=?").get(id) as { a: string | null }).a
    expect(authorOf('vi.ii')).toBe('barnabas')
    expect(authorOf('ii.ii.i')).toBe('clement_rome')
    expect(authorOf('ix.ii.ii')).toBe('irenaeus')
    expect(authorOf('i')).toBeNull()
  })

  it('writes father rows into search_fts with volume, section, start page and title', async () => {
    writeVolume('anf01.xml', ANF_MINI)
    await syncFathersFolder()
    expect(count("SELECT COUNT(*) AS n FROM search_fts WHERE kind='father' AND book_id='anf01'")).toBe(11)
    expect(
      db
        .prepare("SELECT ref, page, title FROM search_fts WHERE kind='father' AND search_fts MATCH 'succession*'")
        .all()
    ).toEqual([{ ref: 'ix.ii.ii', page: 415, title: 'Chapter III.—Apostolic succession.' }])
    // A roman-numeral start page cannot be a numeric hit page.
    expect(
      (db.prepare("SELECT page FROM search_fts WHERE kind='father' AND ref='i.i'").get() as { page: unknown }).page
    ).toBeNull()
  })

  it('surfaces father hits through search(), scoped by kind', async () => {
    writeVolume('anf01.xml', ANF_MINI)
    await syncFathersFolder()
    const hits = search('tradition succession', { kind: 'father' })
    expect(hits).toHaveLength(1)
    expect(hits[0]).toMatchObject({
      kind: 'father', bookId: 'anf01', ref: 'ix.ii.ii', page: 415, title: 'Chapter III.—Apostolic succession.'
    })
    expect(hits[0].snippet).toContain('⟦')
    expect(search('tradition succession', { kind: 'page' })).toEqual([])
    expect(search('tradition succession', { kind: 'all' })).toHaveLength(1)
  })

  it('skips an unchanged file and re-indexes it (replacing, not duplicating) when its mtime changes', async () => {
    const p = writeVolume('anf01.xml', ANF_MINI)
    await syncFathersFolder()
    db.prepare("DELETE FROM fathers_sections WHERE volume_code='anf01' AND id='ii'").run()

    await syncFathersFolder() // unchanged mtime, status indexed: skipped
    expect(count("SELECT COUNT(*) AS n FROM fathers_sections WHERE volume_code='anf01'")).toBe(10)

    const later = new Date(Date.now() + 10_000)
    utimesSync(p, later, later)
    await syncFathersFolder()
    expect(count("SELECT COUNT(*) AS n FROM fathers_sections WHERE volume_code='anf01'")).toBe(11)
    expect(count("SELECT COUNT(*) AS n FROM fathers_scripture_refs WHERE volume_code='anf01'")).toBe(6)
    expect(count("SELECT COUNT(*) AS n FROM search_fts WHERE kind='father' AND book_id='anf01'")).toBe(11)
  })

  it('re-indexes a volume the database says is unindexed even when the mtime cache matches', async () => {
    writeVolume('anf01.xml', ANF_MINI)
    await syncFathersFolder()
    db.prepare("DELETE FROM fathers_sections WHERE volume_code='anf01'").run()
    db.prepare("UPDATE fathers_volumes SET status='unindexed' WHERE code='anf01'").run()
    await syncFathersFolder()
    expect(count("SELECT COUNT(*) AS n FROM fathers_sections WHERE volume_code='anf01'")).toBe(11)
  })

  it('records a malformed volume as status=error with a message and still indexes the others', async () => {
    writeVolume('anf01.xml', ANF_MINI)
    const bad = writeVolume('anf02.xml', 'this is definitely not xml')
    await syncFathersFolder()
    const rows = db.prepare('SELECT code, status, error FROM fathers_volumes ORDER BY code').all() as {
      code: string; status: string; error: string | null
    }[]
    expect(rows.map((r) => [r.code, r.status])).toEqual([['anf01', 'indexed'], ['anf02', 'error']])
    expect(rows[1].error).toMatch(/ThML/)
    expect(count("SELECT COUNT(*) AS n FROM fathers_sections WHERE volume_code='anf02'")).toBe(0)

    // Not retried while the file is unchanged ...
    await syncFathersFolder()
    expect((db.prepare("SELECT status FROM fathers_volumes WHERE code='anf02'").get() as { status: string }).status).toBe('error')

    // ... but picked up once the file is replaced.
    writeFileSync(bad, ANF_MINI)
    const later = new Date(Date.now() + 20_000)
    utimesSync(bad, later, later)
    await syncFathersFolder()
    expect(
      db.prepare("SELECT status, error FROM fathers_volumes WHERE code='anf02'").get()
    ).toEqual({ status: 'indexed', error: null })
  })
})
