import { describe, expect, it } from 'vitest'
import {
  TOMBSTONE_TTL_MS,
  applyChanges,
  compactOwn,
  diffItems,
  liveItems,
  mergeRecords,
  nextStamp,
  pruneTombstones,
  recordWins
} from './sync'
import type { SyncRecord } from './sync'

const rec = (id: string, updatedAt: number, deviceId: string, extra: Record<string, unknown> = {}): SyncRecord => ({
  id,
  updatedAt,
  deviceId,
  ...extra
})

describe('merge rules', () => {
  it('a concurrent edit of the same item: the later clock wins, everywhere', () => {
    const a = [rec('m1', 100, 'A', { title: 'From A' })]
    const b = [rec('m1', 105, 'B', { title: 'From B' })]
    expect(liveItems(mergeRecords([a, b]))).toEqual([{ id: 'm1', title: 'From B' }])
    expect(liveItems(mergeRecords([b, a]))).toEqual([{ id: 'm1', title: 'From B' }])
  })

  it('equal clocks are broken by device id the same way on every device', () => {
    const a = [rec('m1', 100, 'A', { title: 'From A' })]
    const b = [rec('m1', 100, 'B', { title: 'From B' })]
    expect(liveItems(mergeRecords([a, b]))[0].title).toBe('From B')
    expect(liveItems(mergeRecords([b, a]))[0].title).toBe('From B')
    expect(recordWins(b[0], a[0])).toBe(true)
  })

  it('delete vs edit: whichever happened later wins', () => {
    const del = [rec('m1', 200, 'A', { deleted: true })]
    const editBefore = [rec('m1', 150, 'B', { title: 'edited' })]
    const editAfter = [rec('m1', 250, 'B', { title: 'edited' })]
    expect(liveItems(mergeRecords([del, editBefore]))).toEqual([])
    expect(liveItems(mergeRecords([del, editAfter]))).toEqual([{ id: 'm1', title: 'edited' }])
  })

  it('items only one device knows are all kept (union)', () => {
    const merged = liveItems(mergeRecords([[rec('x', 1, 'A')], [rec('y', 1, 'B')], []]))
    expect(merged.map((i) => i.id)).toEqual(['x', 'y'])
  })

  it('a device with a slow clock still orders its edit after what it has seen', () => {
    // B's clock is an hour behind: it sees A's record stamped 10_000_000 and edits after it.
    const seen = 10_000_000
    const stamp = nextStamp(seen - 3_600_000, seen)
    expect(stamp).toBe(seen + 1)
    const a = [rec('m1', seen, 'A', { title: 'A' })]
    const b = applyChanges([], { upserts: [{ id: 'm1', title: 'B later' }], deletes: [] }, 'B', () => stamp)
    expect(liveItems(mergeRecords([a, b]))[0].title).toBe('B later')
  })

  it('records carry no stale metadata from the item sent', () => {
    const out = applyChanges([], { upserts: [{ id: 'm', updatedAt: 1e15, deviceId: 'Z', title: 't' }], deletes: [] }, 'A', () => 5)
    expect(out[0]).toEqual({ id: 'm', title: 't', updatedAt: 5, deviceId: 'A' })
  })
})

describe('tombstones', () => {
  const now = 1_000 * 86_400_000

  it('prunes tombstones after the TTL, keeping live records and fresh tombstones', () => {
    const recs = [
      rec('old', now - TOMBSTONE_TTL_MS - 1, 'A', { deleted: true }),
      rec('fresh', now - 1000, 'A', { deleted: true }),
      rec('live', now - TOMBSTONE_TTL_MS - 1, 'A')
    ]
    expect(pruneTombstones(recs, now).map((r) => r.id)).toEqual(['fresh', 'live'])
  })

  it('compaction drops own records another device superseded, so pruning cannot resurrect them', () => {
    const mine = [rec('m1', 100, 'A', { title: 'old' }), rec('m2', 100, 'A', { title: 'keep' })]
    const peer = [rec('m1', 200, 'B', { deleted: true })]
    const kept = compactOwn(mine, mergeRecords([mine, peer]), now)
    expect(kept.map((r) => r.id)).toEqual(['m2'])
    // Later B prunes its tombstone: m1 stays gone, since A no longer carries it.
    const bAfter = pruneTombstones(peer, 200 + TOMBSTONE_TTL_MS + 1)
    expect(liveItems(mergeRecords([kept, bAfter])).map((i) => i.id)).toEqual(['m2'])
  })

  it('compaction keeps own records that still win', () => {
    const mine = [rec('m1', 300, 'A', { title: 'newest' })]
    const peer = [rec('m1', 200, 'B', { title: 'older' })]
    expect(compactOwn(mine, mergeRecords([mine, peer]), now)).toEqual(mine)
  })
})

describe('diffItems', () => {
  it('finds changed, added and removed items, ignoring key order', () => {
    const prev = [
      { id: 'a', title: 'A', order: 1 },
      { id: 'b', title: 'B' },
      { id: 'c', title: 'C' }
    ]
    const next = [
      { order: 1, title: 'A', id: 'a' },
      { id: 'b', title: 'B2' },
      { id: 'd', title: 'D' }
    ]
    const d = diffItems(prev, next)
    expect(d.upserts.map((i) => i.id)).toEqual(['b', 'd'])
    expect(d.deletes).toEqual(['c'])
  })
})
