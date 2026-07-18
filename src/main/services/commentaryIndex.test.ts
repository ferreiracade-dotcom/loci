import { describe, expect, it } from 'vitest'
import { pickProfilingSample, shouldReindex } from './commentaryIndex'
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

// Guards against the 2026-07-18 incident: 17 commentary sources sat at 0 excerpts forever
// because commentary-index-mtimes.json (outside the SQLite DB) still recorded them as indexed
// after a DB restore rolled their status back to 'unindexed' — the mtime match alone caused
// syncCommentaryFolder to skip re-indexing on every subsequent launch.
describe('shouldReindex', () => {
  it('skips when the mtime matches and the database confirms it was indexed', () => {
    expect(shouldReindex(1000, 1000, 'indexed')).toBe(false)
  })

  it('re-indexes when the mtime changed, regardless of status', () => {
    expect(shouldReindex(1000, 2000, 'indexed')).toBe(true)
  })

  it('re-indexes when never cached, even at status indexed (shouldn\'t happen, but not skipped)', () => {
    expect(shouldReindex(undefined, 1000, 'indexed')).toBe(true)
  })

  it('re-indexes when the mtime matches but the database says unindexed', () => {
    expect(shouldReindex(1000, 1000, 'unindexed')).toBe(true)
  })

  it('re-indexes when the mtime matches and status is needs_review (not unindexed, so skipped)', () => {
    expect(shouldReindex(1000, 1000, 'needs_review')).toBe(false)
  })
})
