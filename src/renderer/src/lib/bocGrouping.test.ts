import { describe, expect, it } from 'vitest'
import { groupBocMatchesBySource, bocSectionRangeLabel, bocSectionLabel, groupByPart } from './bocGrouping'

const m = (over: Partial<any> = {}): any => ({
  excerptId: 'e', sourceId: 's1', sourceDisplayName: 'A', sourceAuthor: null,
  sortOrder: 0, text: 't', sectionStart: 4, sectionEnd: 4, ...over
})

describe('bocGrouping', () => {
  it('groups by source, ordered by sortOrder', () => {
    const g = groupBocMatchesBySource([
      m({ sourceId: 's1', sortOrder: 1, excerptId: 'a' }),
      m({ sourceId: 's2', sortOrder: 0, sourceDisplayName: 'B', excerptId: 'b' }),
      m({ sourceId: 's1', sortOrder: 1, excerptId: 'c' })
    ])
    expect(g.map((x) => x.sourceId)).toEqual(['s2', 's1'])
    expect(g[1].matches.map((x) => x.excerptId)).toEqual(['a', 'c'])
  })
  it('formats a section range label', () => {
    expect(bocSectionRangeLabel({ sectionStart: 4, sectionEnd: 4 })).toBe('§4')
    expect(bocSectionRangeLabel({ sectionStart: 4, sectionEnd: 6 })).toBe('§4–6')
  })
  it('formats a section list label as the site menu does, falling back to the bare label when unnumbered', () => {
    expect(bocSectionLabel({ number: 'IV', label: 'Justification' })).toBe('Article IV. Justification')
    expect(bocSectionLabel({ number: 'VII and VIII (IV)', label: 'The Church' })).toBe('Articles VII and VIII (IV). The Church')
    expect(bocSectionLabel({ number: null, label: 'Preface' })).toBe('Preface')
  })
  it('makes a section that is its own part\'s page the group head, not a separate row', () => {
    const row = (ordinal: number, label: string, part: string | null): any => ({ ordinal, number: null, label, part })
    const groups = groupByPart([
      row(1, 'Preface', null),
      row(2, 'A Review of the Abuses', null),
      row(3, 'Both Kinds', 'A Review of the Abuses'),
      row(4, 'Conclusion', 'A Review of the Abuses'),
      row(5, 'The First Commandment', 'Part 1')
    ])
    expect(groups.map((g) => [g.part, g.head?.ordinal ?? null, g.rows.map((r) => r.ordinal)])).toEqual([
      [null, null, [1]],
      ['A Review of the Abuses', 2, [3, 4]],
      ['Part 1', null, [5]]
    ])
  })
})
