import { describe, expect, it } from 'vitest'
import { groupFathersSections, sectionLabel } from './fathersGrouping'
import type { FathersSectionSummary } from '../../../shared/ipc'

const sec = (id: string, ordinal: number, o: Partial<FathersSectionSummary> = {}): FathersSectionSummary => ({
  id, ordinal, depth: 2, titles: [id], shortTitle: id, authorId: null, authorName: null,
  workTitle: null, editorial: false, startPage: null, ...o
})

describe('groupFathersSections', () => {
  it('groups contiguous sections by author then work, preserving reading order', () => {
    const groups = groupFathersSections([
      sec('t', 0, { editorial: true }),
      sec('c1', 1, { authorId: 'clement_rome', authorName: 'Clement of Rome', workTitle: 'First Epistle' }),
      sec('c2', 2, { authorId: 'clement_rome', authorName: 'Clement of Rome', workTitle: 'First Epistle' }),
      sec('c3', 3, { authorId: 'clement_rome', authorName: 'Clement of Rome', workTitle: 'Second Epistle' }),
      sec('i1', 4, { authorId: 'irenaeus', authorName: 'Irenaeus of Lyons', workTitle: 'Against Heresies' })
    ])
    expect(groups.map((g) => g.authorName)).toEqual(['Unattributed', 'Clement of Rome', 'Irenaeus of Lyons'])
    expect(groups[1].works.map((w) => [w.workTitle, w.sections.map((s) => s.id)])).toEqual([
      ['First Epistle', ['c1', 'c2']],
      ['Second Epistle', ['c3']]
    ])
  })

  it('starts a new group when an author returns later, keeping the runs apart', () => {
    const a = { authorId: 'a', authorName: 'A', workTitle: 'W' }
    const groups = groupFathersSections([
      sec('1', 0, a),
      sec('2', 1, { authorId: 'b', authorName: 'B', workTitle: 'W' }),
      sec('3', 2, a)
    ])
    expect(groups.map((g) => g.authorId)).toEqual(['a', 'b', 'a'])
    expect(new Set(groups.map((g) => g.key)).size).toBe(3)
  })

  it('returns [] for an empty volume and gives a missing work title the empty string', () => {
    expect(groupFathersSections([])).toEqual([])
    expect(groupFathersSections([sec('x', 0)])[0].works[0].workTitle).toBe('')
  })
})

describe('sectionLabel', () => {
  it('prefers the short title, then the last ancestor title, then the id', () => {
    expect(sectionLabel({ shortTitle: 'Chapter I', titles: ['A', 'B'], id: 'x' })).toBe('Chapter I')
    expect(sectionLabel({ shortTitle: '', titles: ['A', 'B'], id: 'x' })).toBe('B')
    expect(sectionLabel({ shortTitle: '', titles: [], id: 'x' })).toBe('x')
  })
})
