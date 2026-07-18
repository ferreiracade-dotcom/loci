import { describe, expect, it } from 'vitest'
import { validateChunk, validateSource } from './commentaryValidate'
import type { ExtractedChunk } from './commentaryMarkdown'
import type { VersificationTable } from '../../shared/versification'

// Synthetic table: ROM ch.1 has 32 verses, ch.2 has 29; JHN ch.3 has 36.
const VERSIFICATION: VersificationTable = { ROM: [32, 29], JHN: [25, 25, 36] }

function chunk(patch: Partial<ExtractedChunk>): ExtractedChunk {
  return {
    headerRaw: 'v. 1',
    book: 'ROM',
    chapterStart: 1,
    verseStart: 1,
    chapterEnd: 1,
    verseEnd: 1,
    text: 'a reasonably normal excerpt with plenty of words in it to avoid the size check',
    page: 1,
    ...patch
  }
}

describe('validateChunk — sequence check', () => {
  it('does not flag the first chunk (no predecessor)', () => {
    const result = validateChunk(chunk({}), null, VERSIFICATION, 10)
    expect(result.flagged).toBe(false)
  })

  it('does not flag a legitimate forward jump', () => {
    const prev = chunk({ chapterStart: 1, verseStart: 5, chapterEnd: 1, verseEnd: 5 })
    const cur = chunk({ chapterStart: 1, verseStart: 6, chapterEnd: 1, verseEnd: 6 })
    expect(validateChunk(cur, prev, VERSIFICATION, 10).flagged).toBe(false)
  })

  it('does not flag a legitimate chapter advance', () => {
    const prev = chunk({ chapterStart: 1, verseStart: 32, chapterEnd: 1, verseEnd: 32 })
    const cur = chunk({ chapterStart: 2, verseStart: 1, chapterEnd: 2, verseEnd: 1 })
    expect(validateChunk(cur, prev, VERSIFICATION, 10).flagged).toBe(false)
  })

  it('flags an out-of-order chunk within the same book (real: 16, 3, 44 pattern)', () => {
    const prev = chunk({ chapterStart: 1, verseStart: 16, chapterEnd: 1, verseEnd: 16 })
    const cur = chunk({ chapterStart: 1, verseStart: 3, chapterEnd: 1, verseEnd: 3 })
    const result = validateChunk(cur, prev, VERSIFICATION, 10)
    expect(result.flagged).toBe(true)
    expect(result.reasons.some((r) => /sequence/i.test(r))).toBe(true)
  })

  it('does not compare across a book change', () => {
    const prev = chunk({ book: 'JHN', chapterStart: 3, verseStart: 30, chapterEnd: 3, verseEnd: 30 })
    const cur = chunk({ book: 'ROM', chapterStart: 1, verseStart: 1, chapterEnd: 1, verseEnd: 1 })
    expect(validateChunk(cur, prev, VERSIFICATION, 10).flagged).toBe(false)
  })
})

describe('validateChunk — bounds check', () => {
  it('flags a verse beyond the chapter max', () => {
    const cur = chunk({ chapterStart: 1, verseStart: 45, chapterEnd: 1, verseEnd: 45 })
    const result = validateChunk(cur, null, VERSIFICATION, 10)
    expect(result.flagged).toBe(true)
    expect(result.reasons.some((r) => /exceeds/i.test(r))).toBe(true)
  })

  it('does not flag the legitimate last verse of a chapter', () => {
    const cur = chunk({ chapterStart: 1, verseStart: 32, chapterEnd: 1, verseEnd: 32 })
    expect(validateChunk(cur, null, VERSIFICATION, 10).flagged).toBe(false)
  })

  it('checks the end chapter of a cross-chapter range', () => {
    const cur = chunk({ chapterStart: 1, verseStart: 30, chapterEnd: 2, verseEnd: 99 })
    const result = validateChunk(cur, null, VERSIFICATION, 10)
    expect(result.flagged).toBe(true)
  })

  it('does not flag when the book/chapter is absent from the table (no evidence, no flag)', () => {
    const cur = chunk({ book: 'REV', chapterStart: 1, verseStart: 999, chapterEnd: 1, verseEnd: 999 })
    expect(validateChunk(cur, null, VERSIFICATION, 10).flagged).toBe(false)
  })
})

describe('validateChunk — size check', () => {
  it('lowers confidence but does not flag a short chunk', () => {
    const cur = chunk({ text: 'too short' })
    const result = validateChunk(cur, null, VERSIFICATION, 50)
    expect(result.flagged).toBe(false)
    expect(result.confidence).toBeLessThan(1)
  })

  it('does not penalize a merely-short-of-median chunk', () => {
    const words = Array(25).fill('word').join(' ')
    const result = validateChunk(chunk({ text: words }), null, VERSIFICATION, 30)
    expect(result.confidence).toBe(1)
  })

  it('lowers confidence for an outlier 10x the source median', () => {
    const longText = Array(500).fill('word').join(' ')
    const result = validateChunk(chunk({ text: longText }), null, VERSIFICATION, 30)
    expect(result.confidence).toBeLessThan(1)
    expect(result.flagged).toBe(false)
  })
})

describe('validateChunk — composed flagging', () => {
  it('accumulates reasons when multiple checks fail', () => {
    const prev = chunk({ chapterStart: 1, verseStart: 16, chapterEnd: 1, verseEnd: 16 })
    const cur = chunk({ chapterStart: 1, verseStart: 3, chapterEnd: 1, verseEnd: 45 })
    const result = validateChunk(cur, prev, VERSIFICATION, 10)
    expect(result.flagged).toBe(true)
    expect(result.reasons.length).toBeGreaterThanOrEqual(2)
  })
})

describe('validateSource', () => {
  it('computes coverage and flags counts across a whole source', () => {
    const chunks: ExtractedChunk[] = [
      chunk({ chapterStart: 1, verseStart: 1, chapterEnd: 1, verseEnd: 1 }),
      chunk({ chapterStart: 1, verseStart: 2, chapterEnd: 1, verseEnd: 2 }),
      // chapter 2 is skipped entirely
      chunk({ chapterStart: 3, verseStart: 1, chapterEnd: 3, verseEnd: 1, book: 'ROM' })
    ]
    // ROM only has 2 chapters in this synthetic table — extend it for this test via a
    // book-local table so chapter 3 doesn't spuriously bounds-fail.
    const table: VersificationTable = { ROM: [32, 29, 20] }
    const { chunks: validated, coverage } = validateSource(chunks, table)
    expect(validated).toHaveLength(3)
    expect(coverage.booksCovered).toEqual(['ROM'])
    expect(coverage.totalCount).toBe(3)
    expect(coverage.chaptersWithNoCoverage).toEqual([{ book: 'ROM', chapter: 2 }])
  })

  it('counts flagged chunks from the composed per-chunk validation', () => {
    const chunks: ExtractedChunk[] = [
      chunk({ chapterStart: 1, verseStart: 1, chapterEnd: 1, verseEnd: 1 }),
      chunk({ chapterStart: 1, verseStart: 999, chapterEnd: 1, verseEnd: 999 }) // out of bounds
    ]
    const { coverage } = validateSource(chunks, VERSIFICATION)
    expect(coverage.flaggedCount).toBe(1)
  })
})
