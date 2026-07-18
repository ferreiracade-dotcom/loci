import { describe, expect, it } from 'vitest'
import { shouldReindex } from './commentaryIndex'

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
