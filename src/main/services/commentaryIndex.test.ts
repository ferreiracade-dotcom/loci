import { describe, expect, it } from 'vitest'
import { pickProfilingSample } from './commentaryIndex'
import type { PositionedLine } from './commentaryExtract'

function page(n: number): PositionedLine[] {
  return [{ page: n, y: 700, x: 30, text: `page ${n}`, fontSize: 10, bold: false, multiFont: false }]
}

describe('pickProfilingSample', () => {
  it('uses the whole document when it is short (<=40 pages)', () => {
    const pages = Array.from({ length: 30 }, (_, i) => page(i + 1))
    expect(pickProfilingSample(pages)).toHaveLength(30)
  })

  it('skips the front ~10% and caps at 40 pages for a long document', () => {
    const pages = Array.from({ length: 400 }, (_, i) => page(i + 1))
    const sample = pickProfilingSample(pages)
    expect(sample.length).toBeLessThanOrEqual(40)
    expect(sample.length).toBeGreaterThan(0)
    // The first ~40 pages (front matter) should be skipped entirely.
    expect(sample[0][0].page).toBeGreaterThan(40)
  })
})
