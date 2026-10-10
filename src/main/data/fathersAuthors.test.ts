import Database from 'better-sqlite3'
import { beforeEach, describe, expect, it } from 'vitest'
import { runMigrations } from '../db/migrations'
import {
  correctedAuthor,
  FATHERS_AUTHORS,
  FATHERS_AUTHOR_OVERRIDES,
  FATHERS_NON_AUTHOR_IDS,
  seedFathersAuthors
} from './fathersAuthors'

let db: Database.Database
beforeEach(() => {
  db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
})

describe('migration: church-fathers', () => {
  it('creates the fathers tables and the quote columns', () => {
    expect(db.pragma('user_version', { simple: true })).toBeGreaterThanOrEqual(21)
    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map(
      (r) => r.name
    )
    for (const t of [
      'fathers_volumes', 'fathers_sections', 'fathers_scripture_refs', 'fathers_notes',
      'fathers_pages', 'fathers_authors'
    ]) {
      expect(tables).toContain(t)
    }
    const cols = (db.prepare('PRAGMA table_info(quotes)').all() as { name: string }[]).map((c) => c.name)
    for (const c of ['fathers_volume', 'fathers_section_id', 'fathers_page', 'fathers_paragraph']) {
      expect(cols).toContain(c)
    }
    const refCols = (db.prepare('PRAGMA table_info(fathers_scripture_refs)').all() as { name: string }[]).map(
      (c) => c.name
    )
    expect(refCols).toEqual(
      expect.arrayContaining(['in_note', 'char_offset', 'chapter_start', 'verse_end', 'book'])
    )
  })

  it('cascades section deletion to refs, notes and pages', () => {
    db.prepare("INSERT INTO fathers_volumes (code, series, number, file_key) VALUES ('anf01','anf',1,'k')").run()
    db.prepare(
      `INSERT INTO fathers_sections (volume_code, id, ordinal, depth, titles_json, short_title, html, text)
       VALUES ('anf01','a',0,1,'[]','A','<p>x</p>','x')`
    ).run()
    db.prepare(
      `INSERT INTO fathers_scripture_refs (volume_code, section_id, anchor, osis, passage, book, chapter_start, chapter_end)
       VALUES ('anf01','a','r1','Bible:Gen.1.1','Gen. i. 1','GEN',1,1)`
    ).run()
    db.prepare("INSERT INTO fathers_notes VALUES ('anf01','a','n1','1','<p>n</p>')").run()
    db.prepare("INSERT INTO fathers_pages VALUES ('anf01','a','5',0)").run()
    db.prepare("DELETE FROM fathers_sections WHERE volume_code='anf01'").run()
    for (const t of ['fathers_scripture_refs', 'fathers_notes', 'fathers_pages']) {
      expect((db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n).toBe(0)
    }
  })

  it('is idempotent: re-running it over existing fathers tables and quote columns does not throw', () => {
    db.pragma('user_version = 20')
    expect(() => runMigrations(db)).not.toThrow()
    expect(db.pragma('user_version', { simple: true })).toBeGreaterThanOrEqual(21)
    const cols = (db.prepare('PRAGMA table_info(quotes)').all() as { name: string }[]).map((c) => c.name)
    expect(cols.filter((c) => c === 'fathers_volume')).toHaveLength(1)
  })
})

describe('FATHERS_AUTHORS', () => {
  it('has unique snake_case ids and complete entries', () => {
    const ids = FATHERS_AUTHORS.map((a) => a.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const a of FATHERS_AUTHORS) {
      expect(a.id).toMatch(/^[a-z][a-z0-9_]*$/)
      expect(a.name.trim()).not.toBe('')
      expect(a.datesLabel.trim()).not.toBe('')
      expect(a.bio.trim()).not.toBe('')
      expect(Number.isInteger(a.sortYear)).toBe(true)
      expect(a.sortYear).toBeGreaterThan(0)
      expect(a.sortYear).toBeLessThan(900)
    }
  })

  it('is sorted ascending by sortYear, then name', () => {
    const sorted = [...FATHERS_AUTHORS].sort((a, b) => a.sortYear - b.sortYear || a.name.localeCompare(b.name))
    expect(FATHERS_AUTHORS.map((a) => a.id)).toEqual(sorted.map((a) => a.id))
  })

  it('author overrides use volume:div1-id keys and point at known authors (or null = unattributed)', () => {
    const ids = new Set(FATHERS_AUTHORS.map((a) => a.id))
    for (const [key, authorId] of Object.entries(FATHERS_AUTHOR_OVERRIDES)) {
      expect(key).toMatch(/^(?:anf\d{2}|npnf[12]\d{2}):[a-z0-9]+$/)
      if (authorId !== null) expect(ids.has(authorId)).toBe(true)
    }
  })

  it('keeps non-author ids out of the curated table', () => {
    for (const a of FATHERS_AUTHORS) expect(FATHERS_NON_AUTHOR_IDS.has(a.id)).toBe(false)
  })
})

describe('correctedAuthor', () => {
  it('applies a per-div1 override to every section under that div1, including duplicate-id sections', () => {
    expect(correctedAuthor('anf01', 'vi.ii.x', 'ignatius')).toBe('barnabas')
    expect(correctedAuthor('anf01', 'vi', 'ignatius')).toBe('barnabas')
    expect(correctedAuthor('anf01', 'vi~2', 'ignatius')).toBe('barnabas')
  })
  it('turns CCEL pseudo-authors into null and leaves real ones alone', () => {
    expect(correctedAuthor('anf03', 'i', 'title_page')).toBeNull()
    expect(correctedAuthor('anf07', 'x.i', 'anonymous')).toBeNull()
    expect(correctedAuthor('anf01', 'ii.ii', 'clement_rome')).toBe('clement_rome')
    expect(correctedAuthor('anf01', 'i', null)).toBeNull()
  })
})

describe('seedFathersAuthors', () => {
  it('inserts every curated author', () => {
    seedFathersAuthors(db)
    const n = (db.prepare('SELECT COUNT(*) AS n FROM fathers_authors').get() as { n: number }).n
    expect(n).toBe(FATHERS_AUTHORS.length)
    expect(db.prepare("SELECT name, sort_year FROM fathers_authors WHERE id='irenaeus'").get()).toEqual({
      name: 'Irenaeus',
      sort_year: 202
    })
  })

  it('is idempotent and overwrites edited rows', () => {
    seedFathersAuthors(db)
    db.prepare("UPDATE fathers_authors SET name = 'stale' WHERE id = 'irenaeus'").run()
    seedFathersAuthors(db)
    const n = (db.prepare('SELECT COUNT(*) AS n FROM fathers_authors').get() as { n: number }).n
    expect(n).toBe(FATHERS_AUTHORS.length)
    expect((db.prepare("SELECT name FROM fathers_authors WHERE id='irenaeus'").get() as { name: string }).name).toBe(
      'Irenaeus'
    )
  })
})
