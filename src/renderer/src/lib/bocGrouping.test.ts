import { describe, expect, it } from 'vitest'
import { groupBocMatchesBySource, bocSectionRangeLabel } from './bocGrouping'

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
})
