import { describe, expect, it } from 'vitest'
import {
  BOC_DOCUMENTS, bocDocument, documentCodeFromName, parseBocRef, formatBocRef
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
