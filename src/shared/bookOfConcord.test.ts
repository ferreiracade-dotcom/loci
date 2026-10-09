import { describe, expect, it } from 'vitest'
import {
  BOC_DOCUMENTS, bocDocument, documentCodeFromName, parseBocRef, formatBocRef,
  bocSectionMatches, fromRoman, parseBocQuery, toRoman
} from './bookOfConcord'

describe('BOC_DOCUMENTS', () => {
  it('lists all 14 documents in nav order with unique codes and 1..14 sortOrder', () => {
    expect(BOC_DOCUMENTS.map((d) => d.code)).toEqual([
      'CR-AP','CR-NI','CR-ATH','AC','AP','SA','TR','SC','LC','FC-EP','FC-SD','CT','BEC','SVA'
    ])
    expect(new Set(BOC_DOCUMENTS.map((d) => d.code)).size).toBe(14)
    expect(BOC_DOCUMENTS.map((d) => d.sortOrder)).toEqual([...Array(14)].map((_, i) => i + 1))
  })
  it('puts the three appendices last', () => {
    expect(BOC_DOCUMENTS.slice(-3).map((d) => d.code)).toEqual(['CT','BEC','SVA'])
  })
})

describe('helpers', () => {
  it('looks up a document definition by code', () => {
    expect(bocDocument('AC')?.title).toBe('Augsburg Confession')
    expect(bocDocument('ZZ')).toBeUndefined()
  })
  it('resolves a document by title, abbreviation, code, or Reader\'s Edition heading spelling', () => {
    expect(documentCodeFromName('Augsburg Confession')).toBe('AC')
    expect(documentCodeFromName('augsburg confession')).toBe('AC')
    expect(documentCodeFromName('AC')).toBe('AC')
    expect(documentCodeFromName('The Augsburg Confession (1530)')).toBe('AC')
    expect(documentCodeFromName('The Creed of Athanasius')).toBe('CR-ATH')
    expect(documentCodeFromName('Catalog of Testimonies')).toBe('CT')
    expect(documentCodeFromName('nonsense')).toBeUndefined()
  })
  it('round-trips a ref string', () => {
    expect(formatBocRef('AC', 4)).toBe('AC:4')
    expect(parseBocRef('AC:4')).toEqual({ code: 'AC', ordinal: 4 })
    expect(parseBocRef('AC:0')).toBeNull()
    expect(parseBocRef('ZZ:4')).toBeNull()
    expect(parseBocRef('garbage')).toBeNull()
  })
})

describe('parseBocQuery (omnibox)', () => {
  it.each([
    ['AC IV', [{ code: 'AC', article: 'IV' }]],
    ['ac iv', [{ code: 'AC', article: 'IV' }]],
    ['ac 4', [{ code: 'AC', article: 'IV' }]],
    ['AC art. 28', [{ code: 'AC', article: 'XXVIII' }]],
    ['Augsburg Confession 4', [{ code: 'AC', article: 'IV' }]],
    ['apol iv', [{ code: 'AP', article: 'IV' }]],
    ['Ap. IV', [{ code: 'AP', article: 'IV' }]],
    ['sa', [{ code: 'SA' }]],
    ['lc', [{ code: 'LC' }]],
    ['sc', [{ code: 'SC' }]],
    ['tr', [{ code: 'TR' }]],
    ['fc sd x', [{ code: 'FC-SD', article: 'X' }]],
    ['FC-SD 10', [{ code: 'FC-SD', article: 'X' }]],
    ['fc ep iii', [{ code: 'FC-EP', article: 'III' }]],
    ['fc x', [{ code: 'FC-EP', article: 'X' }, { code: 'FC-SD', article: 'X' }]],
    ['nicene', [{ code: 'CR-NI' }]]
  ])('%s', (q, expected) => {
    expect(parseBocQuery(q)).toEqual(expected)
  })

  it.each(['', 'acts 4', 'rom 3:28', 'ac iiii', 'ac 0', 'justification', 'ac 4:2'])('rejects %s', (q) => {
    expect(parseBocQuery(q)).toEqual([])
  })
})

describe('roman numerals', () => {
  it('converts both ways', () => {
    expect(toRoman(4)).toBe('IV')
    expect(toRoman(28)).toBe('XXVIII')
    expect(fromRoman('xxviii')).toBe(28)
    expect(fromRoman('IIII')).toBeNull()
    expect(fromRoman('abc')).toBeNull()
  })
})

describe('bocSectionMatches', () => {
  it('matches verbatim section numbers, including dual numbering and arabic', () => {
    expect(bocSectionMatches('IV', 'IV')).toBe(true)
    expect(bocSectionMatches('II (I)', 'II')).toBe(true)
    expect(bocSectionMatches('4', 'IV')).toBe(true)
    expect(bocSectionMatches('IV', 'V')).toBe(false)
    expect(bocSectionMatches(null, 'I')).toBe(false)
  })
})
