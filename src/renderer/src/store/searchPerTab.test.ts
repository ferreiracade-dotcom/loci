import { describe, expect, it, vi } from 'vitest'
import type { SearchHit, SearchScope } from '@shared/ipc'

// Search answers with one hit naming the query; "slow" queries answer after the others.
vi.mock('../lib/api', () => ({
  api: new Proxy(
    {},
    {
      get: (_t, prop) =>
        prop === 'search'
          ? (query: string) =>
              new Promise<SearchHit[]>((resolve) =>
                setTimeout(
                  () => resolve([{ kind: 'note', title: query, snippet: '', ref: query } as unknown as SearchHit]),
                  query.startsWith('slow') ? 30 : 1
                )
              )
          : () => Promise.resolve(null)
    }
  )
}))
vi.mock('../lib/pdfIndex', () => ({ extractAndIndexBook: () => Promise.resolve() }))
vi.mock('../lib/theme', () => ({ applyTheme: () => undefined }))

const { useStore, searchKey, withSearch } = await import('./useStore')

const scope: SearchScope = { kind: 'all', shelfId: null, tag: null }
const titles = (query: string): string[] =>
  (useStore.getState().searches[searchKey(query, scope)]?.results ?? []).map((h) => h.title)

describe('search results per tab', () => {
  it('two Search tabs open at once keep their own results', async () => {
    const run = useStore.getState().runSearch
    // The left tab's search is slower and finishes last: it must not replace the right one's.
    await Promise.all([run('slow grace', scope), run('faith', scope)])
    expect(titles('slow grace')).toEqual(['slow grace'])
    expect(titles('faith')).toEqual(['faith'])
  })

  it('opening a hit marks it in that search only', async () => {
    const st = useStore.getState()
    await st.runSearch('law', scope)
    await st.runSearch('gospel', scope)
    st.setActiveHit(searchKey('law', scope), 0, 'law')
    const s = useStore.getState().searches
    expect(s[searchKey('law', scope)].activeHit).toBe(0)
    expect(s[searchKey('gospel', scope)].activeHit).toBeNull()
    expect(useStore.getState().searchTerms).toEqual(['law'])
  })

  it('the same query in another scope is a different search', () => {
    expect(searchKey('x', scope)).not.toBe(searchKey('x', { ...scope, kind: 'note' }))
    expect(searchKey(' x ', scope)).toBe(searchKey('x', scope))
  })

  it('keeps only the most recent searches', () => {
    let s = {}
    for (let i = 0; i < 25; i++) s = withSearch(s, `k${i}`, { results: [], activeHit: null })
    expect(Object.keys(s)).toHaveLength(20)
    expect(Object.keys(s)[0]).toBe('k5')
    s = withSearch(s, 'k5', { results: [], activeHit: 1 })
    expect(Object.keys(s).at(-1)).toBe('k5')
  })
})
