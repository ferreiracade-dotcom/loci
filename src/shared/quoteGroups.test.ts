import { describe, expect, it } from 'vitest'
import { normalizeQuoteGroups } from './ipc'

// Regression: the renderer hot-reloads during development but the main process does not, so a
// reloaded renderer can briefly talk to an older main that predates a group kind. Reading
// `.length` off the absent field threw and took down the entire renderer — the Confessions
// reader stopped loading too, because the whole React tree unmounted.
describe('normalizeQuoteGroups', () => {
  it('fills in a group kind an older main process never sent', () => {
    const fromOldMain = { books: [], scripture: [], commentary: [] }
    expect(normalizeQuoteGroups(fromOldMain).boc).toEqual([])
  })

  it('survives a null or undefined payload', () => {
    for (const bad of [null, undefined]) {
      const g = normalizeQuoteGroups(bad)
      expect(g.books).toEqual([])
      expect(g.boc).toEqual([])
    }
  })

  it('preserves everything a current main process sends', () => {
    const full = {
      books: [{ bookId: 'b', title: 'T', count: 1 }],
      scripture: [{ book: 'JHN', chapter: 3, name: 'John', count: 2 }],
      commentary: [{ sourceId: 's', displayName: 'D', author: null, count: 3 }],
      boc: [{ bocSourceId: 'x', documentCode: 'AC', name: 'Augsburg Confession', sourceName: 'RE', count: 4 }]
    }
    expect(normalizeQuoteGroups(full)).toEqual(full)
  })
})
