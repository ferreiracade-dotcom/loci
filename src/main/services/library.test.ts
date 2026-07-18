import { describe, expect, it } from 'vitest'
import { groupValuesById, shouldPruneBook, vaultScanLooksIncomplete } from './library'

describe('groupValuesById', () => {
  it('buckets multiple values under one id, preserving input order', () => {
    const rows = [
      { id: 'a', v: 'x' },
      { id: 'a', v: 'y' },
      { id: 'b', v: 'z' }
    ]
    const map = groupValuesById(
      rows,
      (r) => r.id,
      (r) => r.v
    )
    expect(map.get('a')).toEqual(['x', 'y'])
    expect(map.get('b')).toEqual(['z'])
  })

  it('returns an empty map for no rows', () => {
    expect(groupValuesById([], String, String).size).toBe(0)
  })

  it('has no entry for an id that never appears', () => {
    const map = groupValuesById([{ id: 'a', v: 'x' }], (r) => r.id, (r) => r.v)
    expect(map.get('missing')).toBeUndefined()
  })
})

// Guards the stale-row prune in syncLibrary: when a Google Drive mount hasn't finished
// hydrating, walkPdfs returns far fewer files than the catalog expects, and pruning would
// delete real books (cascading to their quotes/notes/highlights). The scan is "incomplete"
// whenever we found nothing but expected something, or found well under what we expected.
describe('vaultScanLooksIncomplete', () => {
  it('flags a small library whose Drive mount returned zero files', () => {
    // The bug: a <=20 book library used to fall through and prune everything here.
    expect(vaultScanLooksIncomplete(0, 15)).toBe(true)
  })

  it('flags a large library whose Drive mount returned zero files', () => {
    expect(vaultScanLooksIncomplete(0, 100)).toBe(true)
  })

  it('flags a large library scanned only partially', () => {
    expect(vaultScanLooksIncomplete(50, 100)).toBe(true)
  })

  it('allows pruning when the scan is complete', () => {
    expect(vaultScanLooksIncomplete(15, 15)).toBe(false)
  })

  it('allows pruning after a genuine deletion in a large library', () => {
    expect(vaultScanLooksIncomplete(90, 100)).toBe(false)
  })

  it('does not treat an empty catalog as incomplete', () => {
    expect(vaultScanLooksIncomplete(0, 0)).toBe(false)
  })
})

// Second, independent guard on top of vaultScanLooksIncomplete: a near-miss scan (e.g. 391/462,
// ~85%) still clears the 80% completeness bar while mismeasuring a handful of files, usually
// because Drive hadn't finished re-listing them yet. This is the incident that actually happened
// (2026-07-18): 71 books with live local copies got pruned because their Drive existsSync()
// briefly read false. Pruning should require the local copy to be gone too.
describe('shouldPruneBook', () => {
  it('does not prune when the Drive file is missing but a local copy exists at local_path', () => {
    expect(shouldPruneBook(false, true, false)).toBe(false)
  })

  it('does not prune when the Drive file is missing but a local copy is found by name', () => {
    expect(shouldPruneBook(false, false, true)).toBe(false)
  })

  it('prunes only when Drive, local_path, and the primary library all agree the file is gone', () => {
    expect(shouldPruneBook(false, false, false)).toBe(true)
  })
})
