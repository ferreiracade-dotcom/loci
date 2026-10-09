import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Two computers in one process: each has its own app-data dir (config with its own device id,
// local vault working copy); both point at one shared "Drive" vault folder.
let dataDir = ''
vi.mock('electron', () => ({ safeStorage: {}, app: {} }))
vi.mock('../db/connection', () => ({ getDataDir: () => dataDir }))

const { syncVault, syncDeviceFolders, onVaultSynced } = await import('./vaultsync')
const { syncInit, syncPut, syncPublishTabs, refreshSync, setSyncPush } = await import('./browserData')
const { stableJson } = await import('../../shared/sync')
type Snapshot = import('../../shared/sync').SyncSnapshot

let root: string
let drive: string
let pcA: string
let pcB: string

/** Run `fn` as the computer whose app data is `dir`. */
function on<T>(dir: string, fn: () => T): T {
  dataDir = dir
  return fn()
}

const bm = (id: string, title: string, order = 0) => ({
  id,
  type: 'bookmark',
  title,
  order,
  location: { kind: 'bible', book: 'JHN', chapter: order + 1 }
})

const view = (s: Snapshot): string => stableJson({ b: s.bookmarks, g: s.tabGroups })

beforeEach(() => {
  // A clock that moves a second per reading, so "later" is unambiguous.
  let now = 1_760_000_000_000
  vi.spyOn(Date, 'now').mockImplementation(() => (now += 1000))
  root = mkdtempSync(join(tmpdir(), 'loci-two-devices-'))
  drive = join(root, 'drive')
  pcA = join(root, 'pcA')
  pcB = join(root, 'pcB')
  for (const [dir, name] of [
    [pcA, 'Study PC'],
    [pcB, 'Laptop']
  ]) {
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'config.json'), JSON.stringify({ setupComplete: true, vaultPath: drive, deviceName: name }))
  }
  mkdirSync(drive, { recursive: true })
})

afterEach(() => {
  vi.restoreAllMocks()
  setSyncPush(null)
  rmSync(root, { recursive: true, force: true })
})

describe('two computers sharing one Drive vault', () => {
  it('interleaved changes on both converge to the same view, with nothing lost', () => {
    on(pcA, () => syncInit())
    on(pcB, () => syncInit())

    // A adds two bookmarks; B, not yet synced, adds one of its own and a group.
    on(pcA, () => syncPut('bookmarks', { upserts: [bm('a1', 'John 1'), bm('a2', 'John 2', 1)], deletes: [] }))
    on(pcB, () => {
      syncPut('bookmarks', { upserts: [bm('b1', 'John 3', 2)], deletes: [] })
      syncPut('tabGroups', {
        upserts: [{ id: 'g1', name: 'Study', color: 'blue', pinnedToBar: true, createdAt: 1, tabs: [], splitRatios: {} }],
        deletes: []
      })
    })
    on(pcA, () => syncVault())
    on(pcB, () => syncVault())
    on(pcA, () => syncVault())

    // Now both edit the same bookmark, A deletes another, B renames the group.
    on(pcA, () => syncPut('bookmarks', { upserts: [bm('b1', 'Renamed on A', 2)], deletes: ['a2'] }))
    on(pcB, () => {
      syncPut('bookmarks', { upserts: [bm('b1', 'Renamed on B', 2)], deletes: [] })
      syncPut('tabGroups', {
        upserts: [{ id: 'g1', name: 'Romans', color: 'blue', pinnedToBar: true, createdAt: 1, tabs: [], splitRatios: {} }],
        deletes: []
      })
    })
    for (let i = 0; i < 2; i++) {
      on(pcA, () => syncDeviceFolders())
      on(pcB, () => syncDeviceFolders())
    }

    const a = on(pcA, () => syncInit())
    const b = on(pcB, () => syncInit())
    expect(view(a)).toBe(view(b))
    expect(a.bookmarks.map((i) => [i.id, i.title])).toEqual([
      ['a1', 'John 1'],
      ['b1', 'Renamed on B'] // B's edit came after it had seen A's records
    ])
    expect(a.tabGroups.map((g) => g.name)).toEqual(['Romans'])
  })

  it('a change made within a second of the last copy still reaches the other computer', () => {
    on(pcA, () => syncPut('bookmarks', { upserts: [bm('a1', 'One')], deletes: [] }))
    on(pcA, () => syncDeviceFolders())
    on(pcA, () => syncPut('bookmarks', { upserts: [bm('a1', 'Two')], deletes: [] }))
    on(pcA, () => syncDeviceFolders())
    on(pcB, () => syncDeviceFolders())
    expect(on(pcB, () => syncInit()).bookmarks[0].title).toBe('Two')
  })

  it('pushes the merged view to the window after a sync pass brings changes, and only then', () => {
    const pushed: Snapshot[] = []
    onVaultSynced(refreshSync)
    on(pcB, () => syncInit())
    setSyncPush((s) => pushed.push(s))
    on(pcB, () => syncDeviceFolders())
    expect(pushed).toHaveLength(0) // nothing new
    on(pcA, () => {
      syncPut('bookmarks', { upserts: [bm('a1', 'From A')], deletes: [] })
      syncPublishTabs([{ title: 'John 3', location: { kind: 'bible', book: 'JHN', chapter: 3 } }])
      syncDeviceFolders()
    })
    pushed.length = 0
    on(pcB, () => syncDeviceFolders())
    expect(pushed).toHaveLength(1)
    expect(pushed[0].bookmarks.map((i) => i.title)).toEqual(['From A'])
    expect(pushed[0].devices.map((d) => [d.deviceName, d.tabs.length])).toEqual([['Study PC', 1]])
    on(pcB, () => syncDeviceFolders())
    expect(pushed).toHaveLength(1)
  })

  it('both computers migrating the same old bookmarks file end up with one copy of each', () => {
    // The pre-sync file, already on Drive (written by the old version).
    mkdirSync(join(drive, 'app'), { recursive: true })
    writeFileSync(
      join(drive, 'app', 'bookmarks.json'),
      JSON.stringify({
        version: 1,
        bookmarks: [
          { id: 'm1', title: 'John 3', location: { kind: 'bible', book: 'JHN', chapter: 3 }, order: 0 },
          { id: 'm2', title: 'Romans 3', location: { kind: 'bible', book: 'ROM', chapter: 3 }, order: 1 }
        ],
        folders: []
      })
    )
    on(pcA, () => syncVault())
    on(pcB, () => syncVault())
    on(pcA, () => syncInit()) // migrates on A
    on(pcA, () => syncPut('bookmarks', { upserts: [], deletes: ['m2'] })) // A deletes one afterwards
    on(pcA, () => syncVault())
    on(pcB, () => syncInit()) // B migrates its own copy later
    on(pcB, () => syncVault())
    on(pcA, () => syncVault())
    const a = on(pcA, () => syncInit())
    const b = on(pcB, () => syncInit())
    expect(view(a)).toBe(view(b))
    expect(a.bookmarks.map((i) => i.id)).toEqual(['m1'])
  })
})
