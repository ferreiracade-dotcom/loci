import { describe, expect, it } from 'vitest'
import { bocLabel, bocCitation, fathersCitation, fathersSectionLabel, romanToInt } from './citation'

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
