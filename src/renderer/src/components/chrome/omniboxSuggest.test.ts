import { describe, expect, it } from 'vitest'
import { buildSuggestions, matchScore } from './omniboxSuggest'
import type { OmniData } from './omniboxSuggest'

const data: OmniData = {
  tabs: [
    { id: 't1', kind: 'bible', title: 'Romans 3' },
    { id: 't2', kind: 'pdf', title: 'Christian Dogmatics I' },
    { id: 't3', kind: 'note', title: 'Justification outline' }
  ],
  currentTabId: 't1',
  bookmarks: [{ title: 'AC IV on justification', location: { kind: 'boc', documentCode: 'AC', sectionOrdinal: 5 } }],
  books: [
    { id: 'b1', title: 'Christian Dogmatics I' },
    { id: 'b2', title: 'Loci Communes 1543' },
    { id: 'b3', title: 'The Doctrine of Justification' }
  ],
  notes: [{ path: 'n1.md', title: 'Justification outline' }],
  translation: 'BSB'
}

const kinds = (q: string): string[] => buildSuggestions(q, data).map((s) => `${s.action.type}:${s.label}`)

describe('buildSuggestions', () => {
  it('is empty for a blank query', () => {
    expect(buildSuggestions('   ', data)).toEqual([])
  })

  it('puts a parsed Bible reference first and the search row last', () => {
    const s = buildSuggestions('rom 3:28', data)
    expect(s[0]).toMatchObject({
      label: 'Romans 3:28',
      hint: 'Bible',
      action: { type: 'open', content: { kind: 'bible', book: 'ROM', chapter: 3, highlight: [28], translation: 'BSB' } }
    })
    expect(s[s.length - 1].action).toEqual({ type: 'search', query: 'rom 3:28' })
  })

  it('ranks a Confessions article above a book-name prefix match ("ac 4" is not Acts first)', () => {
    const k = kinds('ac 4')
    expect(k[0]).toBe('boc:The Augsburg Confession, Article IV')
    expect(k[1]).toBe('open:Acts 4')
  })

  it('parses Confessions abbreviations', () => {
    expect(buildSuggestions('apol iv', data)[0].action).toEqual({ type: 'boc', code: 'AP', article: 'IV' })
    expect(buildSuggestions('fc sd x', data)[0].action).toEqual({ type: 'boc', code: 'FC-SD', article: 'X' })
    expect(buildSuggestions('lc', data)[0].action).toEqual({ type: 'boc', code: 'LC' })
  })

  it('orders title matches: open tabs, bookmarks, then books and notes, then search', () => {
    const k = kinds('justification')
    expect(k).toEqual([
      'switch:Justification outline',
      'open:AC IV on justification',
      'open:Justification outline',
      'open:The Doctrine of Justification',
      'search:Search Loci for “justification”'
    ])
    const hints = buildSuggestions('justification', data).map((s) => s.hint)
    expect(hints.slice(0, 4)).toEqual(['Switch to this tab', 'Bookmark', 'Note', 'Library'])
  })

  it('never offers to switch to the current tab', () => {
    expect(kinds('romans 3').filter((k) => k.startsWith('switch'))).toEqual([])
  })

  it('offers views by name', () => {
    expect(kinds('libr')).toContain('open:Library')
    expect(buildSuggestions('bible', data).some((s) => s.action.type === 'view')).toBe(true)
  })

  it('hints a book or an article by its kind', () => {
    const withKinds: OmniData = {
      ...data,
      tabs: [],
      bookmarks: [],
      notes: [],
      books: [
        { id: 'a1', title: 'On Grace', kind: 'article' },
        { id: 'b9', title: 'On Grace and Free Will', kind: 'book' }
      ]
    }
    const hints = Object.fromEntries(buildSuggestions('on grace', withKinds).map((s) => [s.label, s.hint]))
    expect(hints['On Grace']).toBe('Article')
    expect(hints['On Grace and Free Will']).toBe('Book')
  })

  it('needs two characters for title matches', () => {
    expect(kinds('c')).toEqual(['search:Search Loci for “c”'])
  })
})

describe('matchScore', () => {
  it('prefers prefix, then word start, then substring, then all words', () => {
    expect(matchScore('Loci Communes', 'loci')).toBe(0)
    expect(matchScore('Loci Communes', 'comm')).toBe(1)
    expect(matchScore('Loci Communes', 'mune')).toBe(2)
    expect(matchScore('Loci Communes 1543', 'communes loci')).toBe(3)
    expect(matchScore('Loci Communes', 'xyz')).toBeNull()
  })
})

describe('buildSuggestions for the New Tab page (searchFirst)', () => {
  it('puts "Search Loci for" first for a plain query', () => {
    const s = buildSuggestions('justification', data, { searchFirst: true })
    expect(s[0].action).toEqual({ type: 'search', query: 'justification' })
    expect(s.length).toBeGreaterThan(1)
  })

  it('keeps an exact reference first', () => {
    const s = buildSuggestions('rom 3:28', data, { searchFirst: true })
    expect(s[0].action.type).toBe('open')
    expect(s[s.length - 1].action.type).toBe('search')
  })

  it('no longer offers the retired Dashboard', () => {
    expect(buildSuggestions('dashboard', data).map((x) => x.label)).not.toContain('Dashboard')
  })
})
