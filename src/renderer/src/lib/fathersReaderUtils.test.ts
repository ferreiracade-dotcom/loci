import { describe, expect, it } from 'vitest'
import { passageFromOsis } from './fathersReaderUtils'

describe('passageFromOsis', () => {
  it('opens a single verse and highlights it', () => {
    expect(passageFromOsis('Bible:John.3.16')).toEqual({ book: 'JHN', chapter: 3, highlight: [16] })
  })

  it('highlights every verse of an in-chapter range', () => {
    expect(passageFromOsis('Bible:1Pet.5.1-1Pet.5.5')).toEqual({ book: '1PE', chapter: 5, highlight: [1, 2, 3, 4, 5] })
  })

  it('opens a chapter-only reference with no highlight', () => {
    expect(passageFromOsis('Bible:Num.16')).toEqual({ book: 'NUM', chapter: 16, highlight: [] })
  })

  it('opens a cross-chapter range at its first chapter without highlighting', () => {
    expect(passageFromOsis('Bible:Ps.23.1-Ps.24.10')).toEqual({ book: 'PSA', chapter: 23, highlight: [] })
  })

  it('uses the first passage of a list', () => {
    expect(passageFromOsis('Bible:Isa.64.4 Bible:1Cor.2.9')).toEqual({ book: 'ISA', chapter: 64, highlight: [4] })
  })

  it('returns null for deuterocanonical or unparseable values', () => {
    expect(passageFromOsis('Bible:Sir.1.1')).toBeNull()
    expect(passageFromOsis('garbage')).toBeNull()
    expect(passageFromOsis('')).toBeNull()
  })
})
