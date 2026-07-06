import { describe, expect, it } from 'vitest'
import {
  chunkDocument,
  detectHeaders,
  detectRunningLines,
  groupIntoLines,
  matchesLearnedHeaderStyle,
  profileSource,
  stripRunningLines,
  type PositionedLine,
  type RawTextItem,
  type SourceProfile
} from './commentaryExtract'
import type { HeaderParseState } from '../../shared/scriptureRef'

function line(
  page: number,
  y: number,
  text: string,
  opts: Partial<Pick<PositionedLine, 'x' | 'fontSize' | 'bold' | 'multiFont'>> = {}
): PositionedLine {
  return {
    page,
    y,
    x: opts.x ?? 30,
    text,
    fontSize: opts.fontSize ?? 10,
    bold: opts.bold ?? false,
    multiFont: opts.multiFont ?? false
  }
}

describe('groupIntoLines', () => {
  it('groups items with close y-coordinates into one line, ordered by x', () => {
    const items: RawTextItem[] = [
      { str: 'World', transform: [1, 0, 0, 1, 50, 100], height: 10, fontName: 'F1' },
      { str: 'Hello ', transform: [1, 0, 0, 1, 20, 101], height: 10, fontName: 'F1' },
      { str: 'Second line', transform: [1, 0, 0, 1, 20, 80], height: 10, fontName: 'F1' }
    ]
    const lines = groupIntoLines(items, 1)
    expect(lines).toHaveLength(2)
    expect(lines[0].text).toBe('Hello World')
    expect(lines[1].text).toBe('Second line')
    expect(lines[0].multiFont).toBe(false)
  })

  it('flags a line that mixes more than one font as multiFont', () => {
    const items: RawTextItem[] = [
      { str: '[1] ', transform: [1, 0, 0, 1, 30, 100], height: 12, fontName: 'g_d0_f1' },
      { str: 'The Elder, To Gaius', transform: [1, 0, 0, 1, 50, 100], height: 12, fontName: 'g_d0_f2' }
    ]
    const lines = groupIntoLines(items, 1)
    expect(lines).toHaveLength(1)
    expect(lines[0].multiFont).toBe(true)
  })

  it('detects bold from the font name and drops whitespace-only lines', () => {
    const items: RawTextItem[] = [
      { str: 'Verse 11.', transform: [1, 0, 0, 1, 30, 100], height: 8, fontName: 'Times-Bold' },
      { str: '   ', transform: [1, 0, 0, 1, 30, 50], height: 8, fontName: 'Times' }
    ]
    const lines = groupIntoLines(items, 3)
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({ page: 3, bold: true, fontSize: 8 })
  })
})

describe('matchesLearnedHeaderStyle', () => {
  const profile: SourceProfile = {
    shape: 'word-label',
    bodyFontSize: 10,
    headerFontSize: 8,
    bodyMarginX: 30,
    headerMarginX: 30,
    headerMultiFontRate: 0,
    bodyMultiFontRate: 0
  }

  it('accepts a line matching the learned (smaller) header font size', () => {
    expect(matchesLearnedHeaderStyle(line(1, 100, 'Verse 11.', { fontSize: 8 }), profile)).toBe(true)
  })

  it('rejects a line at body font size', () => {
    expect(matchesLearnedHeaderStyle(line(1, 100, 'ordinary body text', { fontSize: 10 }), profile)).toBe(
      false
    )
  })

  it('falls back to a margin signal when font size does not distinguish header from body', () => {
    const marginProfile: SourceProfile = {
      shape: 'bare-range',
      bodyFontSize: 10,
      headerFontSize: 10,
      bodyMarginX: 30,
      headerMarginX: 60,
      headerMultiFontRate: 0,
      bodyMultiFontRate: 0
    }
    expect(matchesLearnedHeaderStyle(line(1, 100, '16.', { fontSize: 10, x: 60 }), marginProfile)).toBe(
      true
    )
    expect(
      matchesLearnedHeaderStyle(line(1, 100, 'body text', { fontSize: 10, x: 30 }), marginProfile)
    ).toBe(false)
  })

  it('falls back to a font-switch signal when neither size nor margin distinguishes header from body (real: Calov "[1] ... italic quote")', () => {
    const fontSwitchProfile: SourceProfile = {
      shape: 'bracket-number',
      bodyFontSize: 12,
      headerFontSize: 12,
      bodyMarginX: 72,
      headerMarginX: 72,
      headerMultiFontRate: 1,
      bodyMultiFontRate: 0
    }
    expect(
      matchesLearnedHeaderStyle(
        line(1, 100, '[1] The Elder, To the beloved Gaius', { fontSize: 12, x: 72, multiFont: true }),
        fontSwitchProfile
      )
    ).toBe(true)
    expect(
      matchesLearnedHeaderStyle(
        line(1, 100, 'ordinary continuation line', { fontSize: 12, x: 72, multiFont: false }),
        fontSwitchProfile
      )
    ).toBe(false)
  })
})

describe('detectHeaders', () => {
  it('requires both the regex match and the structural signal', () => {
    const profile: SourceProfile = {
      shape: 'word-label',
      bodyFontSize: 10,
      headerFontSize: 8,
      bodyMarginX: 30,
      headerMarginX: 30,
      headerMultiFontRate: 0,
      bodyMultiFontRate: 0
    }
    const state: HeaderParseState = { book: 'JHN', chapter: 3 }
    const lines = [
      line(1, 200, 'Verse 11.', { fontSize: 8 }), // regex + structural signal: accepted
      line(1, 190, 'see the note at v. 16 above', { fontSize: 10 }), // not header-shaped at all: rejected
      line(1, 180, 'Verse 12.', { fontSize: 10 }) // regex matches but font is body-sized: rejected
    ]
    const candidates = detectHeaders(lines, state, profile)
    expect(candidates).toHaveLength(1)
    expect(candidates[0].header.verseStart).toBe(11)
  })

  it('threads state forward so later bare headers resolve against the last confirmed header', () => {
    const profile: SourceProfile = {
      shape: 'bracket-number',
      bodyFontSize: 10,
      headerFontSize: 10,
      bodyMarginX: 30,
      headerMarginX: 60,
      headerMultiFontRate: 0,
      bodyMultiFontRate: 0
    }
    const state: HeaderParseState = { book: 'JHN', chapter: 3 }
    const lines = [
      line(1, 200, '[9]', { x: 60 }),
      line(1, 190, 'body text between headers', { x: 30 }),
      line(1, 180, '[10-11]', { x: 60 })
    ]
    const candidates = detectHeaders(lines, state, profile)
    expect(candidates.map((c) => c.header.verseStart)).toEqual([9, 10])
    expect(candidates[1].header.verseEnd).toBe(11)
  })
})

describe('profileSource', () => {
  it('infers the dominant header shape and learns body/header font sizes', () => {
    const pages: PositionedLine[][] = [
      [
        line(1, 700, 'Romans 3', { fontSize: 10 }),
        line(1, 690, 'Verse 16.', { fontSize: 8 }),
        line(1, 680, 'For I am not ashamed of the gospel, for it is the power of God.', { fontSize: 10 }),
        line(1, 670, 'Verse 17.', { fontSize: 8 }),
        line(1, 660, 'For in it the righteousness of God is revealed.', { fontSize: 10 })
      ],
      [
        line(2, 700, 'Verse 18.', { fontSize: 8 }),
        line(2, 690, 'For the wrath of God is revealed from heaven.', { fontSize: 10 }),
        line(2, 680, 'Verse 19.', { fontSize: 8 }),
        line(2, 670, 'For what can be known about God is plain to them.', { fontSize: 10 })
      ]
    ]
    const { profile, samples } = profileSource(pages)
    expect(profile.shape).toBe('word-label')
    expect(profile.headerFontSize).toBe(8)
    expect(profile.bodyFontSize).toBe(10)
    expect(samples.length).toBeGreaterThan(0)
    expect(samples[0].headerRaw).toMatch(/Verse \d+\./)
  })
})

describe('detectRunningLines / stripRunningLines', () => {
  it('detects a recurring top-of-page running header and strips it', () => {
    const pages: PositionedLine[][] = [
      [line(1, 800, 'COMMENTARY ON ROMANS'), line(1, 700, 'body one')],
      [line(2, 800, 'COMMENTARY ON ROMANS'), line(2, 700, 'body two')],
      [line(3, 800, 'COMMENTARY ON ROMANS'), line(3, 700, 'body three')]
    ]
    const specs = detectRunningLines(pages)
    expect(specs).toContainEqual({ edge: 'top', normalizedText: 'COMMENTARY ON ROMANS' })

    const stripped = stripRunningLines(pages[0], specs)
    expect(stripped.map((l) => l.text)).toEqual(['body one'])
  })

  it('treats page numbers as part of the running pattern (digits normalized)', () => {
    const pages: PositionedLine[][] = [
      [line(1, 800, 'ROMANS 3 · 12'), line(1, 700, 'body')],
      [line(2, 800, 'ROMANS 3 · 13'), line(2, 700, 'body')],
      [line(3, 800, 'ROMANS 3 · 14'), line(3, 700, 'body')]
    ]
    const specs = detectRunningLines(pages)
    expect(specs).toContainEqual({ edge: 'top', normalizedText: 'ROMANS # · #' })
  })

  it('does not flag a one-off heading that does not recur', () => {
    const pages: PositionedLine[][] = [
      [line(1, 800, 'Introduction'), line(1, 700, 'body one')],
      [line(2, 800, 'body two')],
      [line(3, 800, 'body three')]
    ]
    expect(detectRunningLines(pages)).toEqual([])
  })
})

describe('chunkDocument', () => {
  const profile: SourceProfile = {
    shape: 'bare-range',
    bodyFontSize: 10,
    headerFontSize: 10,
    bodyMarginX: 30,
    headerMarginX: 60,
    headerMultiFontRate: 0,
    bodyMultiFontRate: 0
  }

  it('produces chunks tagged with each header page, stripping running lines, carrying state across pages', () => {
    const pages: PositionedLine[][] = [
      [
        line(1, 800, 'COMMENTARY', { x: 30 }), // running header, gets stripped
        line(1, 700, '16.', { x: 60 }), // header — chapter 3 (seeded)
        line(1, 690, 'first excerpt line'),
        line(1, 680, 'continues onto the next page below')
      ],
      [
        line(2, 800, 'COMMENTARY', { x: 30 }), // running header
        line(2, 700, 'more text for the same excerpt, still page 1 header'),
        line(2, 690, '17-18.', { x: 60 }), // next header, on page 2
        line(2, 680, 'second excerpt text')
      ],
      [line(3, 800, 'COMMENTARY', { x: 30 }), line(3, 700, 'trailing body with no more headers')]
    ]
    const chunks = chunkDocument(pages, profile, { book: 'ROM', chapter: 3 })
    expect(chunks).toHaveLength(2)
    expect(chunks[0]).toMatchObject({ verseStart: 16, verseEnd: 16, page: 1 })
    expect(chunks[0].text).toContain('first excerpt line')
    expect(chunks[0].text).toContain('more text for the same excerpt') // continued onto page 2
    expect(chunks[1]).toMatchObject({ verseStart: 17, verseEnd: 18, page: 2 })
    expect(chunks[1].text).toContain('second excerpt text')
    expect(chunks[1].text).toContain('trailing body with no more headers') // no header after it
    for (const c of chunks) expect(c.text).not.toContain('COMMENTARY')
  })

  it('re-anchors the book from a running page header when the source covers two books (real: Gerhard "1&2 Timothy")', () => {
    const wordLabelProfile: SourceProfile = {
      shape: 'word-label',
      bodyFontSize: 10,
      headerFontSize: 8,
      bodyMarginX: 30,
      headerMarginX: 30,
      headerMultiFontRate: 0,
      bodyMultiFontRate: 0
    }
    const pages: PositionedLine[][] = [
      // Still 1 Timothy — running header says so, in a page-guide style, recurring across
      // several pages (a genuine running header, not a one-off).
      [line(1, 800, '1 TIMOTHY 1:1-2'), line(1, 700, 'Verse 1.', { fontSize: 8 }), line(1, 690, 'body one')],
      [line(2, 800, '1 TIMOTHY 1:3-4'), line(2, 700, 'Verse 3.', { fontSize: 8 }), line(2, 690, 'body two')],
      // The book changes; the excerpt headers themselves ("Verse N.") never say so — only
      // the running header does, likewise recurring for several pages.
      [line(3, 800, '2 TIMOTHY 1:2-3'), line(3, 700, 'Verse 2.', { fontSize: 8 }), line(3, 690, 'body three')],
      [line(4, 800, '2 TIMOTHY 1:4-5'), line(4, 700, 'Verse 4.', { fontSize: 8 }), line(4, 690, 'body four')],
      [line(5, 800, '2 TIMOTHY 1:6-7'), line(5, 700, 'Verse 6.', { fontSize: 8 }), line(5, 690, 'body five')]
    ]
    const chunks = chunkDocument(pages, wordLabelProfile, { book: '1TI', chapter: 1 })
    expect(chunks).toHaveLength(5)
    expect(chunks[0]).toMatchObject({ book: '1TI', verseStart: 1 })
    expect(chunks[1]).toMatchObject({ book: '1TI', verseStart: 3 })
    expect(chunks[2]).toMatchObject({ book: '2TI', verseStart: 2 })
    expect(chunks[3]).toMatchObject({ book: '2TI', verseStart: 4 })
    expect(chunks[4]).toMatchObject({ book: '2TI', verseStart: 6 })
  })

  it('does not re-anchor the book from a one-off body-text line that happens to sit at a page edge (real: Lenski\'s Corinthians commentary has a footnote "Gal. 3:1: ..." as a page\'s last line)', () => {
    const wordLabelProfile: SourceProfile = {
      shape: 'word-label',
      bodyFontSize: 10,
      headerFontSize: 8,
      bodyMarginX: 30,
      headerMarginX: 30,
      headerMultiFontRate: 0,
      bodyMultiFontRate: 0
    }
    const pages: PositionedLine[][] = [
      [line(1, 800, 'First Corinthians 2:16 89'), line(1, 700, 'Verse 16.', { fontSize: 8 }), line(1, 690, 'body one')],
      [
        line(2, 800, 'First Corinthians 2:16 90'),
        line(2, 700, 'Verse 17.', { fontSize: 8 }),
        line(2, 690, 'body two'),
        // A footnote citing an entirely different book, landing as this page's last line —
        // not a running header, must not hijack state.book.
        line(2, 50, 'Gal. 3:1: "before whose eyes Jesus Christ was openly"')
      ],
      [line(3, 800, 'First Corinthians 2:16 91'), line(3, 700, 'Verse 18.', { fontSize: 8 }), line(3, 690, 'body three')]
    ]
    const chunks = chunkDocument(pages, wordLabelProfile, { book: '1CO', chapter: 2 })
    expect(chunks).toHaveLength(3)
    for (const c of chunks) expect(c.book).toBe('1CO')
  })

  it('re-anchors the book from a bare running-header book name with no chapter:verse guide at all (real: Lenski\'s Corinthians commentary — "Interpretation of Second Corinthians", never a reference)', () => {
    const parenNumberProfile: SourceProfile = {
      shape: 'paren-number',
      bodyFontSize: 10,
      headerFontSize: 10,
      bodyMarginX: 49,
      headerMarginX: 66,
      headerMultiFontRate: 0,
      bodyMultiFontRate: 0
    }
    const pages: PositionedLine[][] = [
      [
        line(1, 800, '900 Interpretation of First Corinthians'),
        line(1, 700, '15)', { x: 66 }),
        line(1, 690, 'body one')
      ],
      [
        line(2, 800, '901 Interpretation of First Corinthians'),
        line(2, 700, '16)', { x: 66 }),
        line(2, 690, 'body two')
      ],
      // The book changes to 2 Corinthians — the running header restates only the book name,
      // never a chapter:verse reference.
      [
        line(3, 800, '902 Interpretation of Second Corinthians'),
        line(3, 700, '1)', { x: 66 }),
        line(3, 690, 'body three')
      ],
      [
        line(4, 800, '903 Interpretation of Second Corinthians'),
        line(4, 700, '2)', { x: 66 }),
        line(4, 690, 'body four')
      ],
      // A couple more pages of the new book, so the running header actually recurs enough
      // for the real (non-toy) recurrence window to confirm it isn't a one-off.
      [
        line(5, 800, '904 Interpretation of Second Corinthians'),
        line(5, 700, '3)', { x: 66 }),
        line(5, 690, 'body five')
      ],
      [
        line(6, 800, '905 Interpretation of Second Corinthians'),
        line(6, 700, '4)', { x: 66 }),
        line(6, 690, 'body six')
      ]
    ]
    const chunks = chunkDocument(pages, parenNumberProfile, { book: '1CO', chapter: 16 })
    expect(chunks).toHaveLength(6)
    expect(chunks[0]).toMatchObject({ book: '1CO', chapterStart: 16, verseStart: 15 })
    expect(chunks[1]).toMatchObject({ book: '1CO', chapterStart: 16, verseStart: 16 })
    expect(chunks[2]).toMatchObject({ book: '2CO', chapterStart: 1, verseStart: 1 })
    expect(chunks[3]).toMatchObject({ book: '2CO', chapterStart: 1, verseStart: 2 })
    expect(chunks[4]).toMatchObject({ book: '2CO', chapterStart: 1, verseStart: 3 })
    expect(chunks[5]).toMatchObject({ book: '2CO', chapterStart: 1, verseStart: 4 })
  })

  it('does not advance past a book\'s own opening chapter title right after a book transition, even though a chunk already exists from the *previous* book (real: Gerhard\'s "CHAPTER |" opening 2 Timothy chapter 1, right after 1 Timothy ends)', () => {
    const wordLabelProfile: SourceProfile = {
      shape: 'word-label',
      bodyFontSize: 9.5,
      headerFontSize: 8.6,
      bodyMarginX: 30,
      headerMarginX: 30,
      headerMultiFontRate: 0,
      bodyMultiFontRate: 0
    }
    const pages: PositionedLine[][] = [
      // Still 1 Timothy — plenty of real chunks already exist by the time the book changes.
      [line(1, 420, 'Verse 20.', { fontSize: 8.6 }), line(1, 410, 'last comment on 1 Timothy 6:20')],
      // The book changes to 2 Timothy — bare book-name mention only, no chapter:verse guide,
      // recurring across a few introduction pages (a genuine running header, not a one-off).
      [line(2, 800, '112 COMMENTARY ON 2 TIMOTHY'), line(2, 700, 'introduction body text one')],
      [line(3, 800, '113 COMMENTARY ON 2 TIMOTHY'), line(3, 700, 'introduction body text two')],
      [line(4, 800, '114 COMMENTARY ON 2 TIMOTHY'), line(4, 700, 'introduction body text three')],
      [line(5, 800, '115 COMMENTARY ON 2 TIMOTHY'), line(5, 700, 'introduction body text four')],
      [line(6, 800, '116 COMMENTARY ON 2 TIMOTHY'), line(6, 700, 'introduction body text five')],
      // 2 Timothy's OWN opening chapter title — restates chapter 1 (the reset value), not a
      // transition past it, even though `current` already holds a chunk from 1 Timothy.
      [line(7, 475, 'CHAPTER |', { fontSize: 15.6 }), line(7, 400, 'Summary of the chapter.')],
      [line(8, 265, 'Verse lL.', { fontSize: 8.6 }), line(8, 250, 'first comment on 2 Timothy 1:1')]
    ]
    const chunks = chunkDocument(pages, wordLabelProfile, { book: '1TI', chapter: 6 })
    expect(chunks).toHaveLength(2)
    expect(chunks[0]).toMatchObject({ book: '1TI', chapterStart: 6, verseStart: 20 })
    expect(chunks[1]).toMatchObject({ book: '2TI', chapterStart: 1, verseStart: 1 })
  })

  it('advances state.chapter from a "CHAPTER II" title page even though it looks nothing like the learned verse-header style (real: Gerhard 1 Timothy)', () => {
    const wordLabelProfile: SourceProfile = {
      shape: 'word-label',
      bodyFontSize: 9.5,
      headerFontSize: 8.6,
      bodyMarginX: 30,
      headerMarginX: 30,
      headerMultiFontRate: 0,
      bodyMultiFontRate: 0
    }
    const pages: PositionedLine[][] = [
      [
        line(1, 590, '28 COMMENTARY ON 1 TIMOTHY'), // running header, gets stripped
        line(1, 420, 'Verse 20.', { fontSize: 8.6 }),
        line(1, 410, 'last comment on chapter 1 verse 20')
      ],
      // Chapter title page — big display headline, nothing like the 8.6pt verse-header style.
      [
        line(2, 590, '29 COMMENTARY ON 1 TIMOTHY'),
        line(2, 475, 'CHAPTER II', { fontSize: 15.6 }),
        line(2, 400, 'Summary of the chapter.')
      ],
      [
        line(3, 590, '30 COMMENTARY ON 1 TIMOTHY'),
        line(3, 265, 'Verse 1.', { fontSize: 8.6 }),
        line(3, 250, 'first comment on chapter 2 verse 1'),
        line(3, 200, 'Verse 2.', { fontSize: 8.6 }),
        line(3, 190, 'second comment on chapter 2 verse 2')
      ]
    ]
    const chunks = chunkDocument(pages, wordLabelProfile, { book: '1TI', chapter: 1 })
    expect(chunks).toHaveLength(3)
    expect(chunks[0]).toMatchObject({ book: '1TI', chapterStart: 1, verseStart: 20 })
    expect(chunks[1]).toMatchObject({ book: '1TI', chapterStart: 2, verseStart: 1 })
    expect(chunks[2]).toMatchObject({ book: '1TI', chapterStart: 2, verseStart: 2 })
  })

  it('advances state.chapter from a glyph-mangled chapter title it cannot cleanly decode (real: Gerhard "CHAPTER |" for "CHAPTER I")', () => {
    const wordLabelProfile: SourceProfile = {
      shape: 'word-label',
      bodyFontSize: 9.5,
      headerFontSize: 8.6,
      bodyMarginX: 30,
      headerMarginX: 30,
      headerMultiFontRate: 0,
      bodyMultiFontRate: 0
    }
    const pages: PositionedLine[][] = [
      [
        line(1, 590, '160 COMMENTARY ON 2 TIMOTHY'),
        line(1, 420, 'Verse 21.', { fontSize: 8.6 }),
        line(1, 410, 'last comment on chapter 1 verse 21')
      ],
      // Chapter title, glyph-mangled — "CHAPTER |" for "CHAPTER I" — can't decode the
      // numeral itself, only recognize this as a chapter title at all.
      [line(2, 475, 'CHAPTER |', { fontSize: 15.6 }), line(2, 400, 'Summary of the chapter.')],
      [line(3, 265, 'Verse lL.', { fontSize: 8.6 }), line(3, 250, 'first comment on chapter 2 verse 1')]
    ]
    const chunks = chunkDocument(pages, wordLabelProfile, { book: '2TI', chapter: 1 })
    expect(chunks).toHaveLength(2)
    expect(chunks[0]).toMatchObject({ book: '2TI', chapterStart: 1, verseStart: 21 })
    expect(chunks[1]).toMatchObject({ book: '2TI', chapterStart: 2, verseStart: 1 })
  })

  it('resolves a glyph-mangled mid-chapter verse number from the previous chunk, not by guessing (real: Gerhard "Verse LI." is genuinely verse 11, following verse 10)', () => {
    const wordLabelProfile: SourceProfile = {
      shape: 'word-label',
      bodyFontSize: 9.5,
      headerFontSize: 8.6,
      bodyMarginX: 30,
      headerMarginX: 30,
      headerMultiFontRate: 0,
      bodyMultiFontRate: 0
    }
    const pages: PositionedLine[][] = [
      [
        line(1, 590, '35 COMMENTARY ON 1 TIMOTHY'),
        line(1, 225, 'Verse 10.', { fontSize: 8.6 }),
        line(1, 210, 'comment on verse 10'),
        line(1, 190, 'Verse LI.', { fontSize: 8.6 }), // glyph-mangled "Verse 11."
        line(1, 175, 'comment on verse 11')
      ]
    ]
    const chunks = chunkDocument(pages, wordLabelProfile, { book: '1TI', chapter: 2 })
    expect(chunks).toHaveLength(2)
    expect(chunks[0]).toMatchObject({ verseStart: 10 })
    expect(chunks[1]).toMatchObject({ verseStart: 11 })
  })

  it('resolves a glyph-mangled first verse of a fresh chapter as verse 1, not a continuation (real: Gerhard "Verse lL." right after a chapter transition)', () => {
    const wordLabelProfile: SourceProfile = {
      shape: 'word-label',
      bodyFontSize: 9.5,
      headerFontSize: 8.6,
      bodyMarginX: 30,
      headerMarginX: 30,
      headerMultiFontRate: 0,
      bodyMultiFontRate: 0
    }
    const pages: PositionedLine[][] = [
      [
        line(1, 420, 'Verse 21.', { fontSize: 8.6 }),
        line(1, 410, 'last comment on chapter 1 verse 21')
      ],
      [
        line(2, 475, 'CHAPTER |', { fontSize: 15.6 }), // glyph-mangled "CHAPTER I"
        line(2, 400, 'Summary of the chapter.')
      ],
      [line(3, 265, 'Verse lL.', { fontSize: 8.6 }), line(3, 250, 'first comment on chapter 2 verse 1')]
    ]
    const chunks = chunkDocument(pages, wordLabelProfile, { book: '2TI', chapter: 1 })
    expect(chunks).toHaveLength(2)
    expect(chunks[0]).toMatchObject({ chapterStart: 1, verseStart: 21 })
    expect(chunks[1]).toMatchObject({ chapterStart: 2, verseStart: 1 })
  })

  it('drops text before the first header as front matter rather than mis-tagging it', () => {
    const pages: PositionedLine[][] = [
      [
        line(1, 700, 'Preface text nobody should attribute to a verse'),
        line(1, 690, '5.', { x: 60 }),
        line(1, 680, 'actual excerpt text')
      ]
    ]
    const chunks = chunkDocument(pages, profile, { book: 'ROM', chapter: 3 })
    expect(chunks).toHaveLength(1)
    expect(chunks[0].text).not.toContain('Preface')
  })
})
