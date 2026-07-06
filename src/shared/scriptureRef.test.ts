import { describe, expect, it } from 'vitest'
import {
  findReferences,
  parseChapterOnlyHeader,
  parseCommentaryHeader,
  romanToInt,
  type HeaderParseState
} from './scriptureRef'

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

describe('romanToInt', () => {
  it('parses standard numerals', () => {
    expect(romanToInt('I')).toBe(1)
    expect(romanToInt('iv')).toBe(4)
    expect(romanToInt('IX')).toBe(9)
    expect(romanToInt('XIV')).toBe(14)
    expect(romanToInt('XIX')).toBe(19)
    expect(romanToInt('XL')).toBe(40)
    expect(romanToInt('L')).toBe(50)
    expect(romanToInt('XCIX')).toBe(99)
  })

  it('returns null for non-numerals', () => {
    expect(romanToInt('')).toBeNull()
    expect(romanToInt('verse')).toBeNull()
    expect(romanToInt('16')).toBeNull()
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

describe('parseCommentaryHeader — chapter-verse-roman (real: Spaeth-style "(i. 15-18)")', () => {
  it('parses a parenthetical roman chapter + range', () => {
    const state: HeaderParseState = { book: 'JHN', chapter: null }
    const h = parseCommentaryHeader('(i. 15-18)', state, 'chapter-verse-roman')
    expect(h).toMatchObject({ chapterStart: 1, verseStart: 15, chapterEnd: 1, verseEnd: 18 })
  })

  it('parses "Cap. III, v. 5" (spec example)', () => {
    const state: HeaderParseState = { book: 'ROM', chapter: null }
    const h = parseCommentaryHeader('Cap. III, v. 5', state, 'chapter-verse-roman')
    expect(h).toMatchObject({ chapterStart: 3, verseStart: 5, chapterEnd: 3, verseEnd: 5 })
  })

  it('returns null when no verse number is present (chapter-only, not an excerpt boundary)', () => {
    const state: HeaderParseState = { book: 'ROM', chapter: null }
    expect(parseCommentaryHeader('Cap. III', state, 'chapter-verse-roman')).toBeNull()
  })
})

describe('parseCommentaryHeader — bare shapes requiring carried context', () => {
  const withContext: HeaderParseState = { book: 'JHN', chapter: 3 }

  it('bracket-number (real: Calov "[9]")', () => {
    expect(parseCommentaryHeader('[9]', withContext, 'bracket-number')).toMatchObject({
      book: 'JHN',
      chapterStart: 3,
      verseStart: 9,
      verseEnd: 9,
      contextual: true
    })
    expect(parseCommentaryHeader('[9-11]', withContext, 'bracket-number')).toMatchObject({
      verseStart: 9,
      verseEnd: 11
    })
  })

  it('paren-number (real: Lenski "20)")', () => {
    expect(parseCommentaryHeader('20)', withContext, 'paren-number')).toMatchObject({
      verseStart: 20,
      verseEnd: 20
    })
  })

  it('word-label (real: Gerhard "Verse 11.")', () => {
    expect(parseCommentaryHeader('Verse 11.', withContext, 'word-label')).toMatchObject({
      verseStart: 11,
      verseEnd: 11
    })
    expect(parseCommentaryHeader('Verses 16-18.', withContext, 'word-label')).toMatchObject({
      verseStart: 16,
      verseEnd: 18
    })
    expect(parseCommentaryHeader('Vv. 16-18', withContext, 'word-label')).toMatchObject({
      verseStart: 16,
      verseEnd: 18
    })
    expect(parseCommentaryHeader('Vers. 16', withContext, 'word-label')).toMatchObject({
      verseStart: 16
    })
  })

  it('phrase-label (real: Kretzmann "False discipleship: V. 21.")', () => {
    expect(
      parseCommentaryHeader('False discipleship: V. 21.', withContext, 'phrase-label')
    ).toMatchObject({ verseStart: 21, verseEnd: 21 })
  })

  it('bare-range (real: Spaeth "15-18.")', () => {
    expect(parseCommentaryHeader('15-18.', withContext, 'bare-range')).toMatchObject({
      verseStart: 15,
      verseEnd: 18
    })
    expect(parseCommentaryHeader('19-28.', withContext, 'bare-range')).toMatchObject({
      verseStart: 19,
      verseEnd: 28
    })
  })

  it('returns null without carried book/chapter', () => {
    const empty: HeaderParseState = { book: null, chapter: null }
    expect(parseCommentaryHeader('[9]', empty, 'bracket-number')).toBeNull()
    expect(parseCommentaryHeader('20)', empty, 'paren-number')).toBeNull()
    expect(parseCommentaryHeader('Verse 11.', empty, 'word-label')).toBeNull()
    expect(parseCommentaryHeader('15-18.', empty, 'bare-range')).toBeNull()
  })

  it('does not match an inline cross-reference mid-sentence (regex is anchored at line start)', () => {
    // 2b's structural-signal gate is what actually protects prose in practice — this just
    // confirms the pure regex doesn't accidentally match text with a leading offset.
    expect(
      parseCommentaryHeader('see the note at v. 16 above', withContext, 'word-label')
    ).toBeNull()
  })
})

describe('parseCommentaryHeader — contextual state machine over a document stream', () => {
  it('carries book/chapter forward across bare headers, and resets on a full reference', () => {
    const state: HeaderParseState = { book: null, chapter: null }

    let h = parseCommentaryHeader('Romans 3', state, 'book-chapter-verse')
    expect(h).toMatchObject({ book: 'ROM', chapterStart: 3 })
    state.book = h!.book
    state.chapter = h!.chapterEnd

    h = parseCommentaryHeader('16.', state, 'bare-range')
    expect(h).toMatchObject({ book: 'ROM', chapterStart: 3, verseStart: 16 })

    h = parseCommentaryHeader('17-18.', state, 'bare-range')
    expect(h).toMatchObject({ book: 'ROM', chapterStart: 3, verseStart: 17, verseEnd: 18 })

    // A fresh full reference resets book/chapter for subsequent bare headers.
    h = parseCommentaryHeader('1 Corinthians 5:1', state, 'book-chapter-verse')
    expect(h).toMatchObject({ book: '1CO', chapterStart: 5, verseStart: 1 })
    state.book = h!.book
    state.chapter = h!.chapterEnd

    h = parseCommentaryHeader('2.', state, 'bare-range')
    expect(h).toMatchObject({ book: '1CO', chapterStart: 5, verseStart: 2 })
  })
})

describe('parseChapterOnlyHeader', () => {
  it('parses "Chapter III" / "Cap. III" as a chapter-only context update', () => {
    expect(parseChapterOnlyHeader('Chapter III')).toEqual({ chapter: 3 })
    expect(parseChapterOnlyHeader('Cap. III')).toEqual({ chapter: 3 })
    expect(parseChapterOnlyHeader('Chap. IV')).toEqual({ chapter: 4 })
  })

  it('returns null for non-chapter-heading lines', () => {
    expect(parseChapterOnlyHeader('Verse 11.')).toBeNull()
    expect(parseChapterOnlyHeader('This is just prose.')).toBeNull()
  })
})
