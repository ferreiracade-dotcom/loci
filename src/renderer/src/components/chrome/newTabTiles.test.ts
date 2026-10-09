import { describe, expect, it } from 'vitest'
import { TILE_LIMITS, buildTiles, hideTile, parseHiddenTiles, tileKey } from './newTabTiles'
import type { TileInput } from './newTabTiles'

const visit = (location: object, title: string, visitedAt: string) => ({
  title,
  location: JSON.stringify(location),
  visitedAt
})

const base: TileInput = {
  history: [
    visit({ kind: 'bible', book: 'ROM', chapter: 3, translation: 'BSB', highlight: [28] }, 'Romans 3', '2026-10-09T10:00:00Z'),
    visit({ kind: 'note', notePath: 'n1.md' }, 'Old title', '2026-10-09T09:30:00Z'),
    visit({ kind: 'boc', documentCode: 'AC', sectionOrdinal: 5, bocSourceId: 's1' }, 'AC IV', '2026-10-09T09:00:00Z'),
    visit({ kind: 'bible', book: 'ROM', chapter: 3, translation: 'KJV' }, 'Romans 3', '2026-10-09T08:00:00Z'),
    visit({ kind: 'pdf', bookId: 'gone' }, 'Deleted book', '2026-10-09T07:00:00Z'),
    visit({ kind: 'library' }, 'Library', '2026-10-09T06:30:00Z'),
    visit({ kind: 'bible', book: 'JHN', chapter: 1 }, 'John 1', '2026-10-09T06:00:00Z'),
    visit({ kind: 'note', notePath: 'deleted.md' }, 'Gone note', '2026-10-09T05:00:00Z'),
    visit({ kind: 'dashboard' }, 'Dashboard', '2026-10-09T04:00:00Z')
  ],
  books: [
    { id: 'b1', title: 'Christian Dogmatics I', lastPage: 120, lastOpened: 2000, pageOffset: 8, status: 'reading' },
    { id: 'b2', title: 'Unopened', lastPage: 1, lastOpened: null, pageOffset: 0, status: 'unread' },
    { id: 'b3', title: 'Done', lastPage: 300, lastOpened: 3000, pageOffset: 0, status: 'finished' },
    { id: 'b4', title: 'Loci Communes', lastPage: 40, lastOpened: 5000, pageOffset: 0, status: 'reading' }
  ],
  notes: [{ path: 'n1.md', title: 'Sermon notes' }],
  lastBible: { book: 'ROM', chapter: 3 },
  lastBoc: { documentCode: 'AC', ordinal: 5 },
  hidden: {}
}

describe('buildTiles', () => {
  it('continue reading: last Bible and Confessions places, then books in progress by last opened', () => {
    const { continueReading } = buildTiles(base)
    expect(continueReading.map((t) => t.title)).toEqual(['Romans 3', 'AC IV', 'Loci Communes', 'Christian Dogmatics I'])
    expect(continueReading[3].subtitle).toBe('p. 112')
    // The Confessions tile keeps the visited source edition.
    expect(continueReading[1].content).toMatchObject({ kind: 'boc', bocSourceId: 's1' })
  })

  it('recent: passages not already under Continue reading, de-duplicated, existing books only', () => {
    const { recent } = buildTiles(base)
    expect(recent.map((t) => t.title)).toEqual(['John 1'])
  })

  it('recent notes use the current title and skip deleted notes', () => {
    const { recentNotes } = buildTiles(base)
    expect(recentNotes.map((t) => t.title)).toEqual(['Sermon notes'])
  })

  it('a removed tile stays hidden until it is visited again', () => {
    const key = tileKey({ kind: 'bible', book: 'JHN', chapter: 1 })
    const removedAfter = buildTiles({ ...base, hidden: { [key]: Date.parse('2026-10-09T07:00:00Z') } })
    expect(removedAfter.recent).toEqual([])
    const removedBefore = buildTiles({ ...base, hidden: { [key]: Date.parse('2026-10-09T05:00:00Z') } })
    expect(removedBefore.recent.map((t) => t.title)).toEqual(['John 1'])
    // A book tile is keyed by its last opened time; a removed book lets the next one in.
    const book = buildTiles({ ...base, hidden: { [tileKey({ kind: 'pdf', bookId: 'b4' })]: 9999 } })
    expect(book.continueReading.map((t) => t.title)).toContain('Christian Dogmatics I')
    expect(book.continueReading.map((t) => t.title)).not.toContain('Loci Communes')
  })

  it('caps each row', () => {
    const history = Array.from({ length: 30 }, (_, i) =>
      visit({ kind: 'bible', book: 'PSA', chapter: i + 1 }, `Psalm ${i + 1}`, `2026-10-0${(i % 9) + 1}T00:00:00Z`)
    )
    const { recent } = buildTiles({ ...base, history, lastBible: null, lastBoc: null })
    expect(recent).toHaveLength(TILE_LIMITS.recent)
  })

  it('works with no history or last-read places', () => {
    const t = buildTiles({ ...base, history: [], lastBible: null, lastBoc: null, books: [] })
    expect(t).toEqual({ continueReading: [], recent: [], recentNotes: [] })
  })
})

describe('hidden tiles persistence', () => {
  it('parses defensively and keeps the newest 200', () => {
    expect(parseHiddenTiles(null)).toEqual({})
    expect(parseHiddenTiles('nope')).toEqual({})
    expect(parseHiddenTiles('[1]')).toEqual({})
    expect(parseHiddenTiles('{"a":1,"b":"x"}')).toEqual({ a: 1 })
    let h: Record<string, number> = {}
    for (let i = 0; i < 250; i++) h = hideTile(h, `k${i}`, i)
    expect(Object.keys(h)).toHaveLength(200)
    expect(h.k249).toBe(249)
    expect(h.k0).toBeUndefined()
  })
})
