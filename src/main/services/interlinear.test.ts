import { mkdtempSync, mkdirSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it, vi } from 'vitest'

const dir = mkdtempSync(join(tmpdir(), 'interlinear-'))
mkdirSync(join(dir, 'interlinear'))
const w = (o: string, e: string) => ({ o, t: 't', s: 'H1', p: 'N', e })
writeFileSync(
  join(dir, 'interlinear', 'GEN.json'),
  JSON.stringify({ '1': { '10': [w('b', 'ten')], '2': [w('a', 'two'), w('c', 'x')], '1': [w('r', 'one')] } })
)

vi.mock('./scripture', () => ({ bundledScriptureDir: () => dir }))

import { getInterlinearChapter } from './interlinear'

describe('getInterlinearChapter', () => {
  it('groups words by verse in numeric verse order', () => {
    const ch = getInterlinearChapter('GEN', 1)!
    expect(ch.book).toBe('GEN')
    expect(ch.verses.map((v) => v.verse)).toEqual([1, 2, 10])
    expect(ch.verses[1].words.map((x) => x.e)).toEqual(['two', 'x'])
  })
  it('accepts lowercase codes', () => {
    expect(getInterlinearChapter('gen', 1)?.book).toBe('GEN')
  })
  it('returns empty verses for an in-range chapter or book file with no data', () => {
    expect(getInterlinearChapter('GEN', 2)?.verses).toEqual([])
    expect(getInterlinearChapter('EXO', 1)?.verses).toEqual([])
  })
  it('returns null for unknown book or bad chapter', () => {
    expect(getInterlinearChapter('ZZZ', 1)).toBeNull()
    expect(getInterlinearChapter('GEN', 0)).toBeNull()
    expect(getInterlinearChapter('GEN', 99)).toBeNull()
    expect(getInterlinearChapter('GEN', 1.5)).toBeNull()
  })
})
