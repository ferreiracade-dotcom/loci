import { describe, expect, it } from 'vitest'
import { parseBocMarkdown } from './bocMarkdown'

describe('parseBocMarkdown', () => {
  it('parses sections with ordinal/number/label/part and preserves [N] markers', () => {
    const md = [
      '# Augsburg Confession',
      '## 1 |  | Preface | ',
      '[1] Most invincible Emperor…',
      '## 4 | IV | Justification | Chief Articles of Faith',
      '[1] Our churches teach that people cannot be justified… [2] People are…'
    ].join('\n')
    expect(parseBocMarkdown(md)).toEqual([
      { documentCode: 'AC', ordinal: 1, number: null, label: 'Preface', part: null,
        text: '[1] Most invincible Emperor…', headerRaw: '1 |  | Preface | ' },
      { documentCode: 'AC', ordinal: 4, number: 'IV', label: 'Justification', part: 'Chief Articles of Faith',
        text: '[1] Our churches teach that people cannot be justified… [2] People are…',
        headerRaw: '4 | IV | Justification | Chief Articles of Faith' }
    ])
  })

  it('keeps the Apology dual-numbering verbatim in section_number', () => {
    const s = parseBocMarkdown('# Apology of the Augsburg Confession\n## 5 | II (I) | Original Sin | \nbody')
    expect(s[0]).toMatchObject({ documentCode: 'AP', ordinal: 5, number: 'II (I)', label: 'Original Sin' })
  })

  it('switches documents on a new level-1 heading', () => {
    const s = parseBocMarkdown('# Nicene Creed\n## 1 | I | First Article | \nA\n# Augsburg Confession\n## 1 | I | God | \nB')
    expect(s.map((x) => x.documentCode)).toEqual(['CR-NI', 'AC'])
  })

  it('drops content before any document and ignores non-contract headings', () => {
    expect(parseBocMarkdown('preamble\n## 4 | IV | Justification | \nno document set')).toEqual([])
    const s = parseBocMarkdown('# Augsburg Confession\n## 1 | I | God | \nA\n## Random Title\nstray\n## 2 | II | Original Sin | \nB')
    expect(s.map((x) => x.ordinal)).toEqual([1, 2])
    expect(s[0].text).toBe('A')
  })

  it('returns empty-body sections (ordinal alignment for the commentary file)', () => {
    const s = parseBocMarkdown('# Augsburg Confession\n## 3 | III | The Son of God | \n## 4 | IV | Justification | \nnote')
    expect(s.map((x) => ({ ord: x.ordinal, text: x.text }))).toEqual([
      { ord: 3, text: '' }, { ord: 4, text: 'note' }
    ])
  })
})
