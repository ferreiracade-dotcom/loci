import { describe, expect, it } from 'vitest'
import {
  BOC_DOCUMENTS, bocDocument, documentCodeFromName, parseBocRef, formatBocRef
} from './bookOfConcord'

describe('BOC_DOCUMENTS', () => {
  it('lists all 13 documents in nav order with unique codes and 1..13 sortOrder', () => {
    expect(BOC_DOCUMENTS.map((d) => d.code)).toEqual([
      'PREF','CR','AC','AP','SA','TR','SC','LC','FC-EP','FC-SD','CT','BEC','SVA'
    ])
    expect(new Set(BOC_DOCUMENTS.map((d) => d.code)).size).toBe(13)
    expect(BOC_DOCUMENTS.map((d) => d.sortOrder)).toEqual([...Array(13)].map((_, i) => i + 1))
  })
  it('flags the documents the site presents as a single page', () => {
    expect(BOC_DOCUMENTS.filter((d) => d.singleSection).map((d) => d.code)).toEqual(['PREF', 'TR', 'CT', 'BEC'])
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
    expect(documentCodeFromName('Preface to the Book of Concord')).toBe('PREF')
    expect(documentCodeFromName('Preface to the Christian Book of Concord')).toBe('PREF')
    expect(documentCodeFromName('AC')).toBe('AC')
    expect(documentCodeFromName('The Augsburg Confession (1530)')).toBe('AC')
    expect(documentCodeFromName('The Three Universal or Ecumenical Creeds')).toBe('CR')
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
