import { describe, expect, it } from 'vitest'
import { parseNote } from './noteFrontmatter'

describe('parseNote', () => {
  it('parses LF frontmatter', () => {
    const { fm, body } = parseNote('---\ntitle: My Note\ntype: topic\ntags: [a, b]\n---\n\nBody here')
    expect(fm.title).toBe('My Note')
    expect(fm.type).toBe('topic')
    expect(fm.tags).toEqual(['a', 'b'])
    expect(body).toBe('Body here')
  })

  it('parses CRLF frontmatter (Windows / external editors)', () => {
    const { fm, body } = parseNote(
      '---\r\ntitle: My Note\r\ntype: topic\r\ntags: [a, b]\r\n---\r\n\r\nBody here'
    )
    expect(fm.title).toBe('My Note')
    expect(fm.type).toBe('topic')
    expect(fm.tags).toEqual(['a', 'b'])
    expect(body).toBe('Body here')
  })
})
