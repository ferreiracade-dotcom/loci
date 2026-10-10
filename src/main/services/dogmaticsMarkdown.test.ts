import { describe, expect, it } from 'vitest'
import { parseDogmaticsMarkdown, splitNumber } from './dogmaticsMarkdown'

describe('splitNumber', () => {
  it('takes a leading number, with or without a section sign or stop', () => {
    expect(splitNumber('12 On the Church')).toEqual({ number: '12', title: 'On the Church' })
    expect(splitNumber('§ 5. Its necessity')).toEqual({ number: '5', title: 'Its necessity' })
    expect(splitNumber('7')).toEqual({ number: '7', title: '' })
    expect(splitNumber('12a Note')).toEqual({ number: '12a', title: 'Note' })
  })
  it('leaves an unnumbered heading whole', () => {
    expect(splitNumber('Preface')).toEqual({ number: null, title: 'Preface' })
    expect(splitNumber('1550 and after')).toEqual({ number: '1550', title: 'and after' })
  })
})

describe('parseDogmaticsMarkdown', () => {
  const md = [
    'Front matter is dropped.',
    '# Loci Theologici',
    '## 1 On Holy Scripture',
    'An introduction to the locus.',
    '### 1 Prooemium',
    'First section.',
    '',
    'Its second paragraph.',
    '### 2',
    'Second section.',
    '## 2 On God',
    '### 1 Whether God is',
    'Text.',
    '# Second Work',
    '## Preface',
    '### Reader',
    'Hello.'
  ].join('\n')

  it('shelves sections by work, book and order', () => {
    const s = parseDogmaticsMarkdown(md)
    expect(s.map((x) => [x.workOrdinal, x.bookOrdinal, x.sectionOrdinal, x.sectionNumber, x.sectionTitle])).toEqual([
      [1, 1, 1, null, ''],
      [1, 1, 2, '1', 'Prooemium'],
      [1, 1, 3, '2', ''],
      [1, 2, 1, '1', 'Whether God is'],
      [2, 1, 1, null, 'Reader']
    ])
    expect(s[1].text).toBe('First section.\n\nIts second paragraph.')
    expect(s[1]).toMatchObject({ workTitle: 'Loci Theologici', bookNumber: '1', bookTitle: 'On Holy Scripture' })
    expect(s[4]).toMatchObject({ workTitle: 'Second Work', bookNumber: null, bookTitle: 'Preface' })
  })

  it('gives no ordinal to a book with no introduction', () => {
    const s = parseDogmaticsMarkdown('# W\n## 1 B\n\n### 1\nText.')
    expect(s).toHaveLength(1)
    expect(s[0].sectionOrdinal).toBe(1)
  })

  it('treats a file with no work heading as one untitled work', () => {
    const s = parseDogmaticsMarkdown('## 1 B\n### 1\nText.')
    expect(s[0]).toMatchObject({ workOrdinal: 1, workTitle: '', bookOrdinal: 1 })
  })
})
