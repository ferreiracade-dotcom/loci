import { describe, expect, it } from 'vitest'
import { parseOsisRef } from './osis'

const ok = (osis: string) => {
  const r = parseOsisRef(osis)
  if (r.kind !== 'ok') throw new Error(`expected ok for ${osis}, got ${r.kind}`)
  return r.passages
}

describe('parseOsisRef', () => {
  it('parses a single verse', () => {
    expect(ok('Bible:John.3.16')).toEqual([
      { book: 'JHN', chapterStart: 3, verseStart: 16, chapterEnd: 3, verseEnd: 16 }
    ])
  })

  it('parses a same-chapter range', () => {
    expect(ok('Bible:1Pet.5.1-1Pet.5.5')).toEqual([
      { book: '1PE', chapterStart: 5, verseStart: 1, chapterEnd: 5, verseEnd: 5 }
    ])
  })

  it('parses a cross-chapter range', () => {
    expect(ok('Bible:Ps.23.1-Ps.24.10')).toEqual([
      { book: 'PSA', chapterStart: 23, verseStart: 1, chapterEnd: 24, verseEnd: 10 }
    ])
  })

  it('accepts the bare-verse and C.V range shorthands', () => {
    expect(ok('Bible:Matt.5.3-12')).toEqual([
      { book: 'MAT', chapterStart: 5, verseStart: 3, chapterEnd: 5, verseEnd: 12 }
    ])
    expect(ok('Bible:Matt.5.3-6.2')).toEqual([
      { book: 'MAT', chapterStart: 5, verseStart: 3, chapterEnd: 6, verseEnd: 2 }
    ])
  })

  it('parses chapter-only references with null verses', () => {
    expect(ok('Bible:Num.16')).toEqual([
      { book: 'NUM', chapterStart: 16, verseStart: null, chapterEnd: 16, verseEnd: null }
    ])
  })

  it('parses a book-only reference as the whole book', () => {
    expect(ok('Bible:Jude')).toEqual([
      { book: 'JUD', chapterStart: 1, verseStart: null, chapterEnd: 1, verseEnd: null }
    ])
    expect(ok('Bible:Ps')).toEqual([
      { book: 'PSA', chapterStart: 1, verseStart: null, chapterEnd: 150, verseEnd: null }
    ])
  })

  it('returns one passage per space-separated element', () => {
    expect(ok('Bible:Isa.64.4 Bible:1Cor.2.9')).toEqual([
      { book: 'ISA', chapterStart: 64, verseStart: 4, chapterEnd: 64, verseEnd: 4 },
      { book: '1CO', chapterStart: 2, verseStart: 9, chapterEnd: 2, verseEnd: 9 }
    ])
  })

  it('accepts the LXX prefix and variant book spellings', () => {
    expect(ok('Bible.lxx:Isa.7.9')[0].book).toBe('ISA')
    expect(ok('Bible:1Kings.1.1')[0].book).toBe('1KI')
    expect(ok('Bible:Jon.1.1')[0].book).toBe('JON')
    expect(ok('Bible:Phlm.1.5')[0].book).toBe('PHM')
  })

  it('maps the OSIS book ids of the 66-book canon', () => {
    const ids = [
      'Gen', 'Exod', 'Lev', 'Num', 'Deut', 'Josh', 'Judg', 'Ruth', '1Sam', '2Sam', '1Kgs', '2Kgs',
      '1Chr', '2Chr', 'Ezra', 'Neh', 'Esth', 'Job', 'Ps', 'Prov', 'Eccl', 'Song', 'Isa', 'Jer',
      'Lam', 'Ezek', 'Dan', 'Hos', 'Joel', 'Amos', 'Obad', 'Jonah', 'Mic', 'Nah', 'Hab', 'Zeph',
      'Hag', 'Zech', 'Mal', 'Matt', 'Mark', 'Luke', 'John', 'Acts', 'Rom', '1Cor', '2Cor', 'Gal',
      'Eph', 'Phil', 'Col', '1Thess', '2Thess', '1Tim', '2Tim', 'Titus', 'Phlm', 'Heb', 'Jas',
      '1Pet', '2Pet', '1John', '2John', '3John', 'Jude', 'Rev'
    ]
    expect(ids).toHaveLength(66)
    for (const id of ids) expect(parseOsisRef(`Bible:${id}.1.1`).kind).toBe('ok')
  })

  it('reports deuterocanonical books as non-canon', () => {
    expect(parseOsisRef('Bible:Sir.1.1')).toEqual({ kind: 'non-canon', book: 'Sir' })
    expect(parseOsisRef('Bible:Wis.3.1')).toEqual({ kind: 'non-canon', book: 'Wis' })
    expect(parseOsisRef('Bible:2Macc.7.28')).toEqual({ kind: 'non-canon', book: '2Macc' })
  })

  it('keeps the canonical elements of a mixed list', () => {
    expect(ok('Bible:Matt.1.1 Bible:Tob.1.1')).toHaveLength(1)
  })

  it('rejects garbage, unknown books, out-of-range chapters and reversed ranges', () => {
    for (const bad of [
      '',
      '   ',
      'garbage',
      'Bible:Foo.1.1',
      'Bible:John.99.1',
      'Bible:John.0.1',
      'Bible:John.3.16-John.3.1',
      'Bible:John.3-John.2',
      'Bible:John.3.1-Matt.5.1',
      'Bible:John.3.1-2-3'
    ]) {
      expect(parseOsisRef(bad)).toEqual({ kind: 'bad' })
    }
  })
})
