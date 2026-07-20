import { describe, expect, it } from 'vitest'
import { bocLabel, bocCitation } from './citation'

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
