import { describe, expect, it } from 'vitest'
import { BOOKS } from './scriptureRef'
import { VERSE_COUNTS } from './versification'

describe('VERSE_COUNTS', () => {
  it('has an entry for every canonical book', () => {
    for (const b of BOOKS) expect(VERSE_COUNTS[b.code], `missing ${b.code}`).toBeDefined()
    expect(Object.keys(VERSE_COUNTS)).toHaveLength(BOOKS.length)
  })

  it('has one verse-count entry per chapter, matching scriptureRef.ts chapter counts', () => {
    for (const b of BOOKS) {
      expect(VERSE_COUNTS[b.code], b.code).toHaveLength(b.chapters)
    }
  })

  it('has only positive integer verse counts', () => {
    for (const [code, counts] of Object.entries(VERSE_COUNTS)) {
      for (const n of counts) {
        expect(Number.isInteger(n), `${code}: ${n}`).toBe(true)
        expect(n, `${code}: ${n}`).toBeGreaterThan(0)
      }
    }
  })
})
