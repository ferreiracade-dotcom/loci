import { describe, expect, it } from 'vitest'
import { vaultScanLooksIncomplete } from './library'

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
