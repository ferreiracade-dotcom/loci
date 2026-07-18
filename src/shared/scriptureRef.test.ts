import { describe, expect, it } from 'vitest'
import { findReferences, parseCommentaryHeader, type HeaderParseState } from './scriptureRef'

describe('findReferences (regression: case-sensitive scan must still match real prose)', () => {
  it('matches a capitalized reference embedded in a sentence', () => {
    const refs = findReferences('As it is written in Romans 3:16, all have sinned.')
    expect(refs).toHaveLength(1)
    expect(refs[0]).toMatchObject({ book: 'ROM', chapter: 3, verseStart: 16 })
  })

  it('does not match a lowercase look-alike ("mark 3 items")', () => {
    expect(findReferences('please mark 3 items for review')).toHaveLength(0)
  })

  it('matches an abbreviated book name', () => {
    const refs = findReferences('See Rom 8:28 for encouragement.')
    expect(refs).toHaveLength(1)
    expect(refs[0]).toMatchObject({ book: 'ROM', chapter: 8, verseStart: 28 })
  })
})

describe('parseCommentaryHeader — book-chapter-verse', () => {
  it('parses a full reference and resets context', () => {
    const state: HeaderParseState = { book: null, chapter: null }
    const h = parseCommentaryHeader('Romans 3:16', state, 'book-chapter-verse')
    expect(h).toMatchObject({ book: 'ROM', chapterStart: 3, verseStart: 16, verseEnd: 16 })
    expect(h?.contextual).toBe(false)
  })

  it('does not match text with a leading offset (not at line start)', () => {
    const state: HeaderParseState = { book: null, chapter: null }
    expect(parseCommentaryHeader('see Romans 3:16 above', state, 'book-chapter-verse')).toBeNull()
  })
})

describe('parseCommentaryHeader — chapter-verse (real: Armstrong-style "1:9 exaltation.")', () => {
  it('parses chapter:verse and sets chapter context', () => {
    const state: HeaderParseState = { book: 'JAS', chapter: null }
    const h = parseCommentaryHeader('1:9 exaltation. God exalts the humble...', state, 'chapter-verse')
    expect(h).toMatchObject({ book: 'JAS', chapterStart: 1, verseStart: 9, chapterEnd: 1, verseEnd: 9 })
  })

  it('parses a single-chapter range', () => {
    const state: HeaderParseState = { book: 'ROM', chapter: null }
    const h = parseCommentaryHeader('3:16-21', state, 'chapter-verse')
    expect(h).toMatchObject({ chapterStart: 3, verseStart: 16, chapterEnd: 3, verseEnd: 21 })
  })

  it('parses a cross-chapter range', () => {
    const state: HeaderParseState = { book: 'ROM', chapter: null }
    const h = parseCommentaryHeader('3:25-4:2', state, 'chapter-verse')
    expect(h).toMatchObject({ chapterStart: 3, verseStart: 25, chapterEnd: 4, verseEnd: 2 })
  })

  it('requires state.book', () => {
    const state: HeaderParseState = { book: null, chapter: null }
    expect(parseCommentaryHeader('3:16', state, 'chapter-verse')).toBeNull()
  })
})

describe('parseCommentaryHeader — contextual state machine over a document stream', () => {
  it('carries book forward across bare chapter:verse headers, and resets on a full reference', () => {
    const state: HeaderParseState = { book: null, chapter: null }

    let h = parseCommentaryHeader('Romans 3:16', state, 'book-chapter-verse')
    expect(h).toMatchObject({ book: 'ROM', chapterStart: 3, verseStart: 16 })
    state.book = h!.book
    state.chapter = h!.chapterEnd

    h = parseCommentaryHeader('3:17', state, 'chapter-verse')
    expect(h).toMatchObject({ book: 'ROM', chapterStart: 3, verseStart: 17 })

    h = parseCommentaryHeader('4:1', state, 'chapter-verse')
    expect(h).toMatchObject({ book: 'ROM', chapterStart: 4, verseStart: 1 })

    // A fresh full reference resets book/chapter for subsequent bare headers.
    h = parseCommentaryHeader('1 Corinthians 5:1', state, 'book-chapter-verse')
    expect(h).toMatchObject({ book: '1CO', chapterStart: 5, verseStart: 1 })
    state.book = h!.book
    state.chapter = h!.chapterEnd

    h = parseCommentaryHeader('5:2', state, 'chapter-verse')
    expect(h).toMatchObject({ book: '1CO', chapterStart: 5, verseStart: 2 })
  })
})
