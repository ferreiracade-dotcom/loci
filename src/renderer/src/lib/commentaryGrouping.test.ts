import { describe, expect, it } from 'vitest'
import { excerptRangeLabel, groupMatchesBySource, shouldCollapseByDefault } from './commentaryGrouping'
import type { CommentaryMatch } from '@shared/ipc'

function match(patch: Partial<CommentaryMatch>): CommentaryMatch {
  return {
    excerptId: 'e1',
    sourceId: 's1',
    sourceDisplayName: 'Source One',
    sourceAuthor: null,
    sortOrder: 1,
    bookId: 'book-1',
    text: 'excerpt text',
    pageNumber: 10,
    chapterStart: 3,
    verseStart: 16,
    chapterEnd: 3,
    verseEnd: 16,
    ...patch
  }
}

describe('groupMatchesBySource', () => {
  it('groups matches by sourceId and orders groups by sortOrder', () => {
    const matches = [
      match({ excerptId: 'a', sourceId: 's2', sortOrder: 2 }),
      match({ excerptId: 'b', sourceId: 's1', sortOrder: 1 }),
      match({ excerptId: 'c', sourceId: 's1', sortOrder: 1 })
    ]
    const groups = groupMatchesBySource(matches)
    expect(groups.map((g) => g.sourceId)).toEqual(['s1', 's2'])
    expect(groups[0].matches.map((m) => m.excerptId)).toEqual(['b', 'c'])
  })
})

describe('shouldCollapseByDefault', () => {
  it('expands for 1 or 2 sources, collapses beyond that', () => {
    expect(shouldCollapseByDefault(1)).toBe(false)
    expect(shouldCollapseByDefault(2)).toBe(false)
    expect(shouldCollapseByDefault(3)).toBe(true)
  })
})

describe('excerptRangeLabel', () => {
  it('labels a single verse', () => {
    expect(excerptRangeLabel(match({ verseStart: 16, verseEnd: 16 }))).toBe('v. 16')
  })

  it('labels a single-chapter range', () => {
    expect(excerptRangeLabel(match({ verseStart: 16, verseEnd: 21 }))).toBe('vv. 16-21')
  })

  it('labels a cross-chapter range', () => {
    expect(
      excerptRangeLabel(match({ chapterStart: 3, verseStart: 25, chapterEnd: 4, verseEnd: 2 }))
    ).toBe('3:25-4:2')
  })
})
