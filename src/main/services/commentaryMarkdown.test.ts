import { describe, expect, it } from 'vitest'
import { parseCommentaryMarkdown } from './commentaryMarkdown'

describe('parseCommentaryMarkdown', () => {
  it('parses book heading + verse headings into verse-keyed chunks', () => {
    const md = [
      '# 1 Timothy',
      '',
      '## 1:1',
      'Comment on verse one.',
      '',
      '## 1:2',
      'Comment on verse two.',
      ''
    ].join('\n')
    const chunks = parseCommentaryMarkdown(md)
    expect(chunks).toHaveLength(2)
    expect(chunks[0]).toMatchObject({
      book: '1TI',
      chapterStart: 1,
      verseStart: 1,
      chapterEnd: 1,
      verseEnd: 1,
      text: 'Comment on verse one.'
    })
    expect(chunks[1]).toMatchObject({ book: '1TI', verseStart: 2, text: 'Comment on verse two.' })
  })

  it('switches book on a new level-1 heading', () => {
    const md = '# 1 Timothy\n## 1:1\nfirst\n# 2 Timothy\n## 1:1\nsecond'
    const chunks = parseCommentaryMarkdown(md)
    expect(chunks).toHaveLength(2)
    expect(chunks[0]).toMatchObject({ book: '1TI', text: 'first' })
    expect(chunks[1]).toMatchObject({ book: '2TI', text: 'second' })
  })

  it('parses single-chapter verse ranges and cross-chapter ranges', () => {
    const md = '# Romans\n## 3:1-2\nrange\n## 3:25-4:2\ncross'
    const chunks = parseCommentaryMarkdown(md)
    expect(chunks[0]).toMatchObject({ chapterStart: 3, verseStart: 1, chapterEnd: 3, verseEnd: 2 })
    expect(chunks[1]).toMatchObject({ chapterStart: 3, verseStart: 25, chapterEnd: 4, verseEnd: 2 })
  })

  it('ignores a trailing title after the reference', () => {
    const chunks = parseCommentaryMarkdown('# Matthew\n## 1:1 The Genealogy\nbody')
    expect(chunks[0]).toMatchObject({ book: 'MAT', verseStart: 1, text: 'body' })
  })

  it('accepts a full "Book chap:verse" heading that also switches book', () => {
    const chunks = parseCommentaryMarkdown('# 1 Timothy\n## 1:1\nfirst\n## 2 Timothy 1:3\nsecond')
    expect(chunks).toHaveLength(2)
    expect(chunks[1]).toMatchObject({ book: '2TI', chapterStart: 1, verseStart: 3, text: 'second' })
  })

  it('resolves book-name abbreviations/variants ("Song of Solomon" -> SNG)', () => {
    const chunks = parseCommentaryMarkdown('# Song of Solomon\n## 1:1\nbody')
    expect(chunks[0]).toMatchObject({ book: 'SNG', chapterStart: 1, verseStart: 1 })
  })

  it('drops front matter before the first verse heading and preserves multi-paragraph bodies', () => {
    const md = ['# John', 'Some introduction nobody should attribute to a verse.', '', '## 1:1', 'para one', '', 'para two'].join('\n')
    const chunks = parseCommentaryMarkdown(md)
    expect(chunks).toHaveLength(1)
    expect(chunks[0].text).toBe('para one\n\npara two')
    expect(chunks[0].text).not.toContain('introduction')
  })

  it('does not let a stray non-reference section heading leak into the previous excerpt', () => {
    const md = '# John\n## 1:1\nbody one\n### Some Section Title\n## 1:2\nbody two'
    const chunks = parseCommentaryMarkdown(md)
    expect(chunks).toHaveLength(2)
    expect(chunks[0].text).toBe('body one')
    expect(chunks[0].text).not.toContain('Section Title')
    expect(chunks[1]).toMatchObject({ verseStart: 2, text: 'body two' })
  })
})
