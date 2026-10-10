import { describe, expect, it } from 'vitest'
import {
  bocLabel,
  bocCitation,
  bookCitationSource,
  formatCitation,
  fathersCitation,
  fathersSectionLabel,
  romanToInt,
  type CitationSource
} from './citation'

describe('bocCitation', () => {
  const base = { abbreviation: 'AC', sectionNumber: 'IV', sectionLabel: 'Justification', sourceName: "Reader's Edition" }
  it('numbered section with paragraph', () => {
    expect(bocLabel({ ...base, paragraph: 2 })).toBe('AC IV, 2')
    expect(bocCitation({ ...base, paragraph: 2 })).toBe("AC IV, 2 (Reader's Edition)")
  })
  it('numbered section, no paragraph', () => {
    expect(bocLabel(base)).toBe('AC IV')
    expect(bocCitation(base)).toBe("AC IV (Reader's Edition)")
  })
  it('unnumbered section falls back to label', () => {
    const pref = { abbreviation: 'AC', sectionNumber: null, sectionLabel: 'Preface', sourceName: "Reader's Edition" }
    expect(bocLabel(pref)).toBe('AC, Preface')
    expect(bocCitation(pref)).toBe("AC, Preface (Reader's Edition)")
  })
})

describe('fathersCitation', () => {
  const base = {
    authorName: 'Irenaeus',
    workTitle: 'Against Heresies: Book III',
    shortTitle: 'Chapter III.—Apostolic succession.',
    series: 'anf' as const,
    volume: 1,
    page: '415'
  }

  it('cites author, italic work, book.chapter and series volume:page', () => {
    expect(fathersCitation(base)).toBe('Irenaeus, *Against Heresies* III.3 (ANF 1:415)')
  })

  it('uses the NPNF series labels', () => {
    expect(
      fathersCitation({
        authorName: 'Augustine of Hippo', workTitle: 'The Confessions', shortTitle: 'Chapter I.—Great art Thou.',
        series: 'npnf1', volume: 1, page: '45'
      })
    ).toBe('Augustine of Hippo, *The Confessions* 1 (NPNF¹ 1:45)')
    expect(
      fathersCitation({ ...base, series: 'npnf2', volume: 4, page: null, workTitle: 'On the Incarnation', shortTitle: 'Section 7.' })
    ).toBe('Irenaeus, *On the Incarnation* 7 (NPNF² 4)')
  })

  it('omits the author when unknown and the page when unknown', () => {
    expect(fathersCitation({ ...base, authorName: null, page: null })).toBe('*Against Heresies* III.3 (ANF 1)')
  })

  it('handles a work with no book number and a non-numbered section', () => {
    expect(
      fathersCitation({
        ...base, authorName: 'Clement of Rome', workTitle: 'First Epistle to the Corinthians',
        shortTitle: 'Chapter XLII.—The apostles.', page: '16'
      })
    ).toBe('Clement of Rome, *First Epistle to the Corinthians* 42 (ANF 1:16)')
    expect(fathersCitation({ ...base, shortTitle: 'Preface.', page: '414' })).toBe(
      'Irenaeus, *Against Heresies* III (ANF 1:414)'
    )
  })

  it('falls back to the first clause of the section title when it has no number, and drops it when it is the work', () => {
    expect(
      fathersCitation({ ...base, workTitle: 'Epistle of Barnabas', shortTitle: 'Introductory Note to the Epistle of Barnabas', page: '137' })
    ).toBe('Irenaeus, *Epistle of Barnabas* Introductory Note to the Epistle of… (ANF 1:137)')
    expect(fathersCitation({ ...base, workTitle: 'Epistle of Barnabas', shortTitle: 'Epistle of Barnabas', page: '137' })).toBe(
      'Irenaeus, *Epistle of Barnabas* (ANF 1:137)'
    )
  })
})

describe('fathersSectionLabel / romanToInt', () => {
  it('splits a "Book N" suffix off the work title', () => {
    expect(fathersSectionLabel('Against Heresies: Book III', 'Chapter III.—x')).toEqual({ work: 'Against Heresies', label: 'III.3' })
    expect(fathersSectionLabel('Stromata - Book 7', 'Chapter 12')).toEqual({ work: 'Stromata', label: '7.12' })
  })

  it('does not treat a bare "Book I" work as having an empty name', () => {
    expect(fathersSectionLabel('Book I', 'Chapter 2').work).toBe('Book I')
  })

  it('converts roman numerals', () => {
    expect(romanToInt('IV')).toBe(4)
    expect(romanToInt('XLII')).toBe(42)
    expect(romanToInt('MCMXC')).toBe(1990)
    expect(romanToInt('xii')).toBeNull()
    expect(romanToInt('')).toBeNull()
  })
})

describe('article citations', () => {
  const art: CitationSource = {
    kind: 'article',
    authors: ['Jane Smith'],
    title: 'On Grace',
    publisher: null,
    city: null,
    year: 1998,
    journal: 'Concordia Journal',
    volume: '12',
    issue: '3',
    pages: '45–67'
  }

  it('footnote: full form with the quoted page last', () => {
    expect(formatCitation(art, 'footnote', 52)).toBe(
      'Jane Smith, "On Grace," *Concordia Journal* 12, no. 3 (1998): 45–67, 52.'
    )
  })
  it('footnote: no quoted page', () => {
    expect(formatCitation(art, 'footnote', null)).toBe(
      'Jane Smith, "On Grace," *Concordia Journal* 12, no. 3 (1998): 45–67.'
    )
  })
  it('footnote: omits "no." without an issue', () => {
    expect(formatCitation({ ...art, issue: null }, 'footnote', 52)).toBe(
      'Jane Smith, "On Grace," *Concordia Journal* 12 (1998): 45–67, 52.'
    )
  })
  it('footnote: omits ": pages" without a range but still ends with the quoted page', () => {
    expect(formatCitation({ ...art, pages: null }, 'footnote', 52)).toBe(
      'Jane Smith, "On Grace," *Concordia Journal* 12, no. 3 (1998), 52.'
    )
  })
  it('footnote: omits the volume and year cleanly', () => {
    expect(formatCitation({ ...art, volume: null, issue: null, year: null, pages: null }, 'footnote', null)).toBe(
      'Jane Smith, "On Grace," *Concordia Journal*.'
    )
  })
  it('footnote: only a title and author', () => {
    const bare: CitationSource = { kind: 'article', authors: ['Jane Smith'], title: 'On Grace', publisher: null, city: null, year: null }
    expect(formatCitation(bare, 'footnote', null)).toBe('Jane Smith, "On Grace."')
  })
  it('footnote: two authors and a missing author placeholder', () => {
    expect(formatCitation({ ...art, authors: ['Jane Smith', 'John Doe'] }, 'footnote', null)).toBe(
      'Jane Smith and John Doe, "On Grace," *Concordia Journal* 12, no. 3 (1998): 45–67.'
    )
    expect(formatCitation({ ...art, authors: [] }, 'footnote', null)).toContain('[author], "On Grace,"')
  })
  it('short note, author-date and bibliography', () => {
    expect(formatCitation(art, 'short', 52)).toBe('Smith, "On Grace," 52.')
    expect(formatCitation(art, 'short', null)).toBe('Smith, "On Grace."')
    expect(formatCitation(art, 'author-date', 52)).toBe('(Smith 1998, 52)')
    expect(formatCitation(art, 'bibliography', 52)).toBe(
      'Smith, Jane. "On Grace." *Concordia Journal* 12, no. 3 (1998): 45–67.'
    )
  })
  it('book citations are unchanged', () => {
    const book: CitationSource = {
      kind: 'book',
      authors: ['Martin Chemnitz'],
      title: 'Examination of the Council of Trent',
      publisher: 'Concordia',
      city: 'St. Louis',
      year: 1971
    }
    expect(formatCitation(book, 'footnote', 12)).toBe(
      'Martin Chemnitz, *Examination of the Council of Trent* (Concordia, 1971), 12.'
    )
  })
})

describe('bookCitationSource', () => {
  it('builds a book source by default', () => {
    expect(
      bookCitationSource({ author: 'A B', title: 'T', publisher: 'P', city: 'C', year: 1900 })
    ).toEqual({ kind: 'book', authors: ['A B'], title: 'T', publisher: 'P', city: 'C', year: 1900 })
  })
  it('builds an article source from kind = article', () => {
    const s = bookCitationSource({
      kind: 'article',
      author: 'A B & C D',
      title: 'T',
      publisher: null,
      city: null,
      year: 2001,
      journal: 'J',
      volume: '1',
      issue: null,
      pages: '2–3'
    })
    expect(s).toMatchObject({ kind: 'article', authors: ['A B', 'C D'], journal: 'J', volume: '1', issue: null, pages: '2–3' })
  })
})
