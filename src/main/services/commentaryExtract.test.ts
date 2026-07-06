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
