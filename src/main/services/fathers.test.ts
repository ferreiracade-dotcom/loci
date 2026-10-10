import Database from 'better-sqlite3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { runMigrations } from '../db/migrations'

let db: Database.Database
vi.mock('../db/connection', () => ({ getDb: () => db, getDataDir: () => '' }))

beforeEach(() => {
  db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
})

import {
  catena, citeMeta, getAuthor, getSection, humanizeAuthorId, listAuthors, listSections, listVolumes,
  pageAt, snippetAround
} from './fathers'

// ---- row helpers (raw SQL, so these tests do not depend on the parser) ----
function volume(code: string, series: string, number: number, status = 'indexed', error: string | null = null): void {
  db.prepare(
    'INSERT INTO fathers_volumes (code, series, number, title, file_key, status, error) VALUES (?,?,?,?,?,?,?)'
  ).run(code, series, number, `Volume ${code}`, `fathers/${code}.xml`, status, error)
}
function author(id: string, name: string, year: number | null, dates: string | null = null, bio: string | null = null): void {
  db.prepare('INSERT INTO fathers_authors (id, name, sort_year, dates_label, bio) VALUES (?,?,?,?,?)').run(
    id, name, year, dates, bio
  )
}
function section(
  vol: string, id: string, ordinal: number,
  o: { author?: string | null; work?: string | null; title?: string; editorial?: boolean; text?: string; startPage?: string | null; titles?: string[]; html?: string } = {}
): void {
  db.prepare(
    `INSERT INTO fathers_sections
       (volume_code, id, ordinal, depth, titles_json, short_title, author_id, work_title, editorial, start_page, html, text)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(
    vol, id, ordinal, 1, JSON.stringify(o.titles ?? [o.title ?? id]), o.title ?? id, o.author ?? null,
    o.work === undefined ? 'Work' : o.work, o.editorial ? 1 : 0, o.startPage ?? null,
    o.html ?? '<p>x</p>', o.text ?? 'some text'
  )
}
function ref(
  vol: string, sec: string,
  o: { book?: string; cs: number; vs: number | null; ce?: number; ve?: number | null; off?: number; passage?: string; inNote?: boolean }
): void {
  db.prepare(
    `INSERT INTO fathers_scripture_refs
       (volume_code, section_id, anchor, osis, passage, book, chapter_start, verse_start, chapter_end, verse_end, in_note, char_offset)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(
    vol, sec, `${sec}-r`, 'Bible:x', o.passage ?? 'p', o.book ?? 'JHN', o.cs, o.vs, o.ce ?? o.cs,
    o.ve === undefined ? o.vs : o.ve, o.inNote ? 1 : 0, o.off ?? 0
  )
}

describe('pure helpers', () => {
  it('humanizeAuthorId title-cases an id', () => {
    expect(humanizeAuthorId('clement_rome')).toBe('Clement Rome')
    expect(humanizeAuthorId('justin-martyr')).toBe('Justin Martyr')
    expect(humanizeAuthorId('hermas')).toBe('Hermas')
  })

  it('snippetAround returns the whole text when it is short', () => {
    expect(snippetAround('short text\nhere', 3)).toBe('short text here')
  })

  it('snippetAround windows long text on whole words with ellipses around the offset', () => {
    const text = Array.from({ length: 100 }, (_, i) => `w${String(i).padStart(3, '0')}`).join(' ')
    const s = snippetAround(text, text.indexOf('w050'))
    expect(s.startsWith('…')).toBe(true)
    expect(s.endsWith('…')).toBe(true)
    expect(s).toContain('w050')
    expect(s.slice(1)).toMatch(/^w\d{3} /) // no partial first word
    expect(s.length).toBeLessThanOrEqual(210)
  })

  it('snippetAround clamps an offset past the end', () => {
    expect(snippetAround('abc def', 999)).toBe('abc def')
  })

  it('pageAt picks the last page break at or before the offset, else the start page', () => {
    const pages = [{ n: '6', charOffset: 100 }, { n: '7', charOffset: 300 }]
    expect(pageAt(pages, 50, '5')).toBe('5')
    expect(pageAt(pages, 100, '5')).toBe('6')
    expect(pageAt(pages, 299, '5')).toBe('6')
    expect(pageAt(pages, 5000, '5')).toBe('7')
    expect(pageAt([], 10, null)).toBeNull()
  })
})

describe('listVolumes', () => {
  it('orders ANF, NPNF¹, NPNF² by number and counts sections', () => {
    volume('npnf201', 'npnf2', 1)
    volume('npnf102', 'npnf1', 2)
    volume('anf10', 'anf', 10)
    volume('anf02', 'anf', 2, 'error', 'bad xml')
    section('anf10', 'a', 0)
    section('anf10', 'b', 1)
    const v = listVolumes()
    expect(v.map((x) => x.code)).toEqual(['anf02', 'anf10', 'npnf102', 'npnf201'])
    expect(v[0]).toMatchObject({ status: 'error', error: 'bad xml', sectionCount: 0 })
    expect(v[1]).toMatchObject({ series: 'anf', number: 10, sectionCount: 2 })
  })
})

describe('listSections / getSection', () => {
  beforeEach(() => {
    volume('anf01', 'anf', 1)
    author('irenaeus', 'Irenaeus of Lyons', 202)
    section('anf01', 'a', 0, { author: 'irenaeus', work: 'Against Heresies: Book I', title: 'Preface', titles: ['IRENÆUS', 'Preface'], startPage: '414' })
    section('anf01', 'b', 1, { author: 'mystery_man', work: 'W', title: 'Chapter I', html: '<p>hello</p>' })
    section('anf01', 'c', 2, { author: null, title: 'Index', editorial: true })
    db.prepare("INSERT INTO fathers_notes VALUES ('anf01','b','n2','2','<p>second</p>')").run()
    db.prepare("INSERT INTO fathers_notes VALUES ('anf01','b','n1','1','<p>first</p>')").run()
  })

  it('lists sections in reading order with author names, falling back to a derived name', () => {
    const s = listSections('anf01')
    expect(s.map((x) => x.id)).toEqual(['a', 'b', 'c'])
    expect(s[0]).toMatchObject({
      authorId: 'irenaeus', authorName: 'Irenaeus of Lyons', titles: ['IRENÆUS', 'Preface'],
      shortTitle: 'Preface', startPage: '414', editorial: false
    })
    expect(s[1]).toMatchObject({ authorId: 'mystery_man', authorName: 'Mystery Man' })
    expect(s[2]).toMatchObject({ authorId: null, authorName: null, editorial: true })
    expect(listSections('nope')).toEqual([])
  })

  it('returns a full section with notes in order, volume info and prev/next ids', () => {
    const s = getSection('anf01', 'b')!
    expect(s).toMatchObject({
      id: 'b', volumeCode: 'anf01', series: 'anf', volumeNumber: 1, volumeTitle: 'Volume anf01',
      html: '<p>hello</p>', prevId: 'a', nextId: 'c'
    })
    expect(s.notes.map((n) => n.anchor)).toEqual(['n2', 'n1']) // insertion order, not alphabetical
    expect(getSection('anf01', 'a')!.prevId).toBeNull()
    expect(getSection('anf01', 'c')!.nextId).toBeNull()
  })

  it('returns null for an unknown section', () => {
    expect(getSection('anf01', 'zzz')).toBeNull()
    expect(getSection('nope', 'a')).toBeNull()
  })
})

describe('listAuthors / getAuthor', () => {
  beforeEach(() => {
    volume('anf01', 'anf', 1)
    volume('npnf101', 'npnf1', 1)
    author('irenaeus', 'Irenaeus of Lyons', 202, 'c. 130–c. 202', 'Bishop of Lyons.')
    author('augustine', 'Augustine of Hippo', 430, '354–430')
    section('anf01', 'i1', 0, { author: 'irenaeus', work: 'Against Heresies: Book I' })
    section('anf01', 'i2', 1, { author: 'irenaeus', work: 'Against Heresies: Book I' })
    section('anf01', 'i3', 2, { author: 'irenaeus', work: 'Against Heresies: Book II' })
    section('anf01', 'i4', 3, { author: 'irenaeus', work: 'Against Heresies: Book II', editorial: true })
    section('npnf101', 'a1', 0, { author: 'augustine', work: 'The Confessions' })
    section('npnf101', 'u1', 1, { author: 'unknown_one', work: 'Treatise' })
    section('npnf101', 'e1', 2, { author: 'only_editorial', work: 'Prolegomena', editorial: true })
  })

  it('lists authors oldest first, undated last, skipping authors with only editorial sections', () => {
    const a = listAuthors()
    expect(a.map((x) => x.id)).toEqual(['irenaeus', 'augustine', 'unknown_one'])
    expect(a[0]).toMatchObject({ name: 'Irenaeus of Lyons', datesLabel: 'c. 130–c. 202', sortYear: 202, workCount: 2, sectionCount: 3 })
    expect(a[2]).toMatchObject({ name: 'Unknown One', datesLabel: null, sortYear: null })
  })

  it('returns an author page with works across volumes and a link to each first section', () => {
    const a = getAuthor('irenaeus')!
    expect(a).toMatchObject({ name: 'Irenaeus of Lyons', bio: 'Bishop of Lyons.', datesLabel: 'c. 130–c. 202' })
    expect(a.works).toEqual([
      { volumeCode: 'anf01', series: 'anf', volumeNumber: 1, volumeTitle: 'Volume anf01', workTitle: 'Against Heresies: Book I', firstSectionId: 'i1', sectionCount: 2 },
      { volumeCode: 'anf01', series: 'anf', volumeNumber: 1, volumeTitle: 'Volume anf01', workTitle: 'Against Heresies: Book II', firstSectionId: 'i3', sectionCount: 1 }
    ])
  })

  it('builds a page for an author missing from the curated table, and null for one with nothing', () => {
    expect(getAuthor('unknown_one')).toMatchObject({ name: 'Unknown One', bio: null, datesLabel: null })
    expect(getAuthor('nobody')).toBeNull()
  })
})

describe('catena', () => {
  beforeEach(() => {
    volume('anf01', 'anf', 1)
    volume('npnf101', 'npnf1', 1)
    author('late', 'Late Father', 400, '–400')
    author('early', 'Early Father', 100)
    author('mid', 'Mid Father', 150)
    // The EARLY author lives in the volume that sorts LAST, so only date ordering puts it first.
    section('anf01', 'a1', 0, { author: 'late', title: 'A1', text: 'x '.repeat(100) + 'Jn 3:16 here' })
    section('npnf101', 'b1', 0, { author: 'early', title: 'B1' })
    section('anf01', 'a2', 1, { author: 'mid', title: 'A2' })
    section('anf01', 'a3', 2, { author: 'late', title: 'A3 editorial', editorial: true })
    section('anf01', 'a4', 3, { author: 'late', title: 'A4' })
    section('anf01', 'a5', 4, { author: null, title: 'A5 undated' })
    ref('anf01', 'a1', { cs: 3, vs: 16, off: 200, passage: 'John iii. 16' })
    ref('npnf101', 'b1', { cs: 3, vs: 14, ve: 17 }) // range 14–17 contains 16
    ref('anf01', 'a2', { cs: 3, vs: null }) // whole chapter
    ref('anf01', 'a3', { cs: 3, vs: 16 }) // editorial: excluded
    ref('anf01', 'a4', { cs: 4, vs: 1 }) // other chapter
    ref('anf01', 'a5', { cs: 3, vs: 16, inNote: true })
    ref('anf01', 'a1', { book: 'ROM', cs: 3, vs: 16 }) // other book
    db.prepare("INSERT INTO fathers_pages VALUES ('anf01','a1','9',50)").run()
    db.prepare("INSERT INTO fathers_pages VALUES ('anf01','a1','10',150)").run()
    db.prepare("UPDATE fathers_sections SET start_page = '8' WHERE volume_code='anf01' AND id='a1'").run()
  })

  it('returns one group for a verse: refs whose range contains it, earliest author first, undated last', () => {
    const g = catena('JHN', 3, 16)
    expect(g).toHaveLength(1)
    expect(g[0]).toMatchObject({ verse: 16, label: 'John 3:16' })
    expect(g[0].entries.map((e) => [e.sectionId, e.authorName])).toEqual([
      ['b1', 'Early Father'],
      ['a2', 'Mid Father'],
      ['a1', 'Late Father'],
      ['a5', null]
    ])
  })

  it('fills in snippet, printed page, passage and the footnote flag', () => {
    const e = catena('JHN', 3, 16)[0].entries
    const a1 = e.find((x) => x.sectionId === 'a1')!
    expect(a1).toMatchObject({ passage: 'John iii. 16', page: '10', inNote: false, volumeCode: 'anf01', series: 'anf', volumeNumber: 1 })
    expect(a1.snippet).toContain('Jn 3:16')
    expect(e.find((x) => x.sectionId === 'a5')!.inNote).toBe(true)
  })

  it('excludes editorial sections, other chapters and other books', () => {
    const ids = catena('JHN', 3, 16)[0].entries.map((e) => e.sectionId)
    expect(ids).not.toContain('a3')
    expect(ids).not.toContain('a4')
  })

  it('groups a chapter-level query by the verse each reference starts on, chapter-level group first', () => {
    const groups = catena('JHN', 3)
    expect(groups.map((g) => [g.verse, g.label])).toEqual([
      [null, 'John 3'],
      [14, 'John 3:14'],
      [16, 'John 3:16']
    ])
    expect(groups[0].entries.map((e) => e.sectionId)).toEqual(['a2'])
    expect(groups[2].entries.map((e) => e.sectionId)).toEqual(['a1', 'a5'])
  })

  it('keeps one entry per section within a group', () => {
    ref('anf01', 'a1', { cs: 3, vs: 16, off: 10 })
    ref('anf01', 'a1', { cs: 3, vs: 16, off: 20 })
    expect(catena('JHN', 3, 16)[0].entries.filter((e) => e.sectionId === 'a1')).toHaveLength(1)
  })

  it('matches a reference that spans chapters', () => {
    section('anf01', 'a6', 5, { author: 'mid', title: 'A6' })
    ref('anf01', 'a6', { cs: 2, vs: 20, ce: 4, ve: 3 })
    expect(catena('JHN', 3, 16)[0].entries.map((e) => e.sectionId)).toContain('a6')
    expect(catena('JHN', 5, 1)).toEqual([])
  })

  it('does not match same-chapter references that end before or start after the verse', () => {
    section('anf01', 'c1', 6, { author: 'mid', title: 'C1' })
    section('anf01', 'c2', 7, { author: 'mid', title: 'C2' })
    section('anf01', 'c3', 8, { author: 'mid', title: 'C3' })
    ref('anf01', 'c1', { cs: 3, vs: 10, ve: 15 })
    ref('anf01', 'c2', { cs: 3, vs: 18, ve: 20 })
    ref('anf01', 'c3', { cs: 2, vs: 20, ce: 3, ve: 3 })
    const at16 = catena('JHN', 3, 16)[0].entries.map((e) => e.sectionId)
    expect(at16).not.toContain('c1')
    expect(at16).not.toContain('c2')
    expect(catena('JHN', 3, 4).flatMap((g) => g.entries.map((e) => e.sectionId))).not.toContain('c3')
  })

  it('dedupes before limiting: many refs in one early section do not crowd out a later author', () => {
    author('zlate', 'Zlate Father', 900)
    section('anf01', 'big', 9, { author: 'early', title: 'Big' })
    section('anf01', 'z1', 10, { author: 'zlate', title: 'Z1' })
    const ins = db.prepare(
      `INSERT INTO fathers_scripture_refs
         (volume_code, section_id, anchor, osis, passage, book, chapter_start, verse_start, chapter_end, verse_end, in_note, char_offset)
       VALUES ('anf01','big',?, 'Bible:x','p','JHN',3,5,3,5,1,?)`
    )
    db.transaction(() => {
      for (let i = 0; i < 700; i++) ins.run(`big-${i}`, i)
    })()
    ref('anf01', 'z1', { cs: 3, vs: 5 })
    const entries = catena('JHN', 3).flatMap((g) => g.entries)
    expect(entries.filter((e) => e.sectionId === 'big')).toHaveLength(1)
    expect(entries.map((e) => e.sectionId)).toContain('z1')
  })

  it('returns nothing for a passage no Father cites', () => {
    expect(catena('REV', 22, 21)).toEqual([])
  })
})

describe('citeMeta', () => {
  it('returns what a citation needs, or null for an unknown section', () => {
    volume('anf01', 'anf', 1)
    author('irenaeus', 'Irenaeus of Lyons', 202)
    section('anf01', 's', 0, { author: 'irenaeus', work: 'Against Heresies: Book III', title: 'Chapter III.—Succession.' })
    expect(citeMeta('anf01', 's')).toEqual({
      authorName: 'Irenaeus of Lyons', workTitle: 'Against Heresies: Book III',
      shortTitle: 'Chapter III.—Succession.', series: 'anf', volume: 1
    })
    expect(citeMeta('anf01', 'zzz')).toBeNull()
  })
})
