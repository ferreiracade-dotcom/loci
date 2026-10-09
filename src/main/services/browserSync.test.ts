import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { BrowserSync, OPEN_TABS_FILE, SYNC_FILES } from './browserSync'

let root: string
let clock: number

/** A device sharing `appDir` (as if the vault mirror had already copied every folder). */
function device(id: string, appDir = join(root, 'app'), now = (): number => clock): BrowserSync {
  return new BrowserSync(appDir, () => ({ deviceId: id, deviceName: `PC ${id}` }), now)
}

const bm = (id: string, title: string, extra: Record<string, unknown> = {}) => ({
  id,
  type: 'bookmark',
  title,
  location: { kind: 'bible', book: 'JHN', chapter: 3 },
  ...extra
})

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'loci-browser-sync-'))
  clock = 1_700_000_000_000
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('per-device records', () => {
  it('each device writes only its own folder; the view is the union', () => {
    const a = device('A')
    const b = device('B')
    a.put('bookmarks', { upserts: [bm('m1', 'John 3')], deletes: [] })
    clock += 10
    b.put('bookmarks', { upserts: [bm('m2', 'Romans 3')], deletes: [] })
    expect(readdirSync(join(root, 'app', 'sync')).sort()).toEqual(['A', 'B'])
    const own = JSON.parse(readFileSync(join(root, 'app', 'sync', 'B', SYNC_FILES.bookmarks), 'utf8'))
    expect(own.records.map((r: { id: string }) => r.id)).toEqual(['m2'])
    expect(a.items('bookmarks').map((i) => i.id)).toEqual(['m1', 'm2'])
    expect(b.items('bookmarks')).toEqual(a.items('bookmarks'))
  })

  it('a concurrent edit of the same bookmark resolves the same way on both devices', () => {
    const a = device('A')
    const b = device('B')
    a.put('bookmarks', { upserts: [bm('m1', 'John 3')], deletes: [] })
    clock += 1
    a.put('bookmarks', { upserts: [bm('m1', 'Edited on A')], deletes: [] })
    b.put('bookmarks', { upserts: [bm('m1', 'Edited on B')], deletes: [] })
    // B saw A's records, so its edit is stamped after them, whatever its own clock says.
    expect(a.items('bookmarks')[0].title).toBe('Edited on B')
    expect(b.items('bookmarks')[0].title).toBe('Edited on B')
  })

  it('a device whose clock is far behind still lands its edit after the ones it saw', () => {
    const a = device('A')
    const slowB = device('B', join(root, 'app'), () => clock - 86_400_000)
    a.put('bookmarks', { upserts: [bm('m1', 'A')], deletes: [] })
    slowB.put('bookmarks', { upserts: [bm('m1', 'B after A')], deletes: [] })
    expect(a.items('bookmarks')[0].title).toBe('B after A')
  })

  it('delete vs edit: the later one wins', () => {
    const a = device('A')
    const b = device('B')
    a.put('bookmarks', { upserts: [bm('m1', 'x')], deletes: [] })
    b.put('bookmarks', { upserts: [], deletes: ['m1'] })
    expect(a.items('bookmarks')).toEqual([])
    a.put('bookmarks', { upserts: [bm('m1', 'restored')], deletes: [] })
    expect(b.items('bookmarks').map((i) => i.title)).toEqual(['restored'])
  })

  it("compaction drops a device's records another device superseded", () => {
    const a = device('A')
    const b = device('B')
    a.put('bookmarks', { upserts: [bm('m1', 'x'), bm('m2', 'y')], deletes: [] })
    b.put('bookmarks', { upserts: [], deletes: ['m1'] })
    expect(a.compact('bookmarks')).toBe(true)
    const own = JSON.parse(readFileSync(join(root, 'app', 'sync', 'A', SYNC_FILES.bookmarks), 'utf8'))
    expect(own.records.map((r: { id: string }) => r.id)).toEqual(['m2'])
    expect(a.compact('bookmarks')).toBe(false)
  })

  it('expired tombstones are pruned from the own file on the next write', () => {
    const a = device('A')
    a.put('bookmarks', { upserts: [], deletes: ['gone'] })
    clock += 91 * 86_400_000
    a.put('bookmarks', { upserts: [bm('m1', 'x')], deletes: [] })
    const own = JSON.parse(readFileSync(join(root, 'app', 'sync', 'A', SYNC_FILES.bookmarks), 'utf8'))
    expect(own.records.map((r: { id: string }) => r.id)).toEqual(['m1'])
  })
})

describe('unreadable files', () => {
  it("a corrupt peer file is skipped and left alone; the rest still merges", () => {
    const a = device('A')
    a.put('bookmarks', { upserts: [bm('m1', 'x')], deletes: [] })
    const peer = join(root, 'app', 'sync', 'B', SYNC_FILES.bookmarks)
    mkdirSync(join(root, 'app', 'sync', 'B'), { recursive: true })
    writeFileSync(peer, '{"records":[{"id":"m9"')
    expect(a.items('bookmarks').map((i) => i.id)).toEqual(['m1'])
    a.put('bookmarks', { upserts: [bm('m2', 'y')], deletes: [] })
    expect(readFileSync(peer, 'utf8')).toBe('{"records":[{"id":"m9"')
    expect(readdirSync(join(root, 'app', 'sync', 'B'))).toEqual([SYNC_FILES.bookmarks])
  })

  it('a corrupt own file is moved aside before it is rewritten', () => {
    const a = device('A')
    const own = join(root, 'app', 'sync', 'A', SYNC_FILES.bookmarks)
    mkdirSync(join(root, 'app', 'sync', 'A'), { recursive: true })
    writeFileSync(own, '{"records":[{"id":"m1"')
    a.put('bookmarks', { upserts: [bm('m2', 'y')], deletes: [] })
    const aside = readdirSync(join(root, 'app', 'sync', 'A')).filter((n) => n.includes('.corrupt-'))
    expect(aside).toHaveLength(1)
    expect(readFileSync(join(root, 'app', 'sync', 'A', aside[0]), 'utf8')).toBe('{"records":[{"id":"m1"')
    expect(a.items('bookmarks').map((i) => i.id)).toEqual(['m2'])
  })

  it('folders that are not device ids are ignored', () => {
    mkdirSync(join(root, 'app', 'sync', '..odd name'), { recursive: true })
    writeFileSync(join(root, 'app', 'sync', '..odd name', SYNC_FILES.bookmarks), JSON.stringify({ records: [{ id: 'z', updatedAt: 1, deviceId: 'Z' }] }))
    expect(device('A').items('bookmarks')).toEqual([])
  })
})

describe('migration from the pre-sync files', () => {
  const legacyBookmarks = {
    version: 1,
    bookmarks: [
      { id: 'm1', title: 'John 3', location: { kind: 'bible', book: 'JHN', chapter: 3 }, order: 0 },
      { id: 'm2', title: 'In folder', location: { kind: 'pdf', bookId: 'b1' }, parentId: 'f1', order: 0 }
    ],
    folders: [{ id: 'f1', title: 'Dogmatics', order: 1 }]
  }
  const legacyGroups = {
    version: 1,
    groups: [
      {
        id: 'g1',
        name: 'Study',
        color: 'blue',
        pinnedToBar: true,
        open: true,
        collapsed: true,
        savedTabs: [
          { id: 't2', order: 1, kind: 'note', notePath: 'n.md', splitId: 's1', history: [{ kind: 'newtab' }], historyIndex: 0 },
          { id: 't1', order: 0, kind: 'bible', book: 'ROM', chapter: 3, splitId: 's1' },
          { id: 't3', order: 2, kind: 'pdf', bookId: 'b1', splitId: 'lonely' }
        ],
        savedSplitRatios: { s1: 0.3 }
      }
    ]
  }

  function writeLegacy(appDir: string, mtime: number): void {
    mkdirSync(appDir, { recursive: true })
    writeFileSync(join(appDir, 'bookmarks.json'), JSON.stringify(legacyBookmarks))
    writeFileSync(join(appDir, 'tab-groups.json'), JSON.stringify(legacyGroups))
    const t = new Date(mtime)
    utimesSync(join(appDir, 'bookmarks.json'), t, t)
    utimesSync(join(appDir, 'tab-groups.json'), t, t)
  }

  it('imports both files once into this device, renames them, and keeps the groups file for histories', () => {
    const appDir = join(root, 'app')
    writeLegacy(appDir, clock - 60_000)
    const a = device('A')
    const marks = a.importLegacy({})
    expect(marks.bookmarks).toBe(clock - 60_000)
    expect(existsSync(join(appDir, 'bookmarks.json'))).toBe(false)
    expect(existsSync(join(appDir, 'bookmarks.json.migrated'))).toBe(true)
    const items = a.items('bookmarks')
    expect(items.map((i) => [i.id, i.type])).toEqual([
      ['f1', 'folder'],
      ['m1', 'bookmark'],
      ['m2', 'bookmark']
    ])
    const [g] = a.items('tabGroups')
    expect(g).toMatchObject({ id: 'g1', name: 'Study', color: 'blue', pinnedToBar: true, createdAt: 0 })
    // Strip order, split pairs kept only when complete, no history or open state.
    expect(g.tabs).toEqual([
      { location: { kind: 'bible', book: 'ROM', chapter: 3 }, splitId: 's1' },
      { location: { kind: 'note', notePath: 'n.md' }, splitId: 's1' },
      { location: { kind: 'pdf', bookId: 'b1' } }
    ])
    expect(g.splitRatios).toEqual({ s1: 0.3 })
    expect(g.open).toBeUndefined()
    expect(JSON.parse(a.legacyTabGroups()!).groups[0].savedTabs).toHaveLength(3)
    // The same file again (say, copied back down from Drive) is not imported twice.
    writeLegacy(appDir, clock - 60_000)
    a.put('bookmarks', { upserts: [bm('m1', 'Renamed')], deletes: [] })
    expect(a.importLegacy(marks)).toEqual(marks)
    expect(a.items('bookmarks').find((i) => i.id === 'm1')!.title).toBe('Renamed')
  })

  it('two devices migrating the same file end up with one copy of each item', () => {
    const mtime = clock - 60_000
    const a = device('A', join(root, 'app'))
    const b = device('B', join(root, 'app'))
    writeLegacy(join(root, 'app'), mtime)
    a.importLegacy({})
    writeLegacy(join(root, 'app'), mtime) // B's own copy of the file
    clock += 5000
    b.importLegacy({})
    expect(a.items('bookmarks')).toHaveLength(3)
    expect(a.items('tabGroups')).toHaveLength(1)
    expect(b.items('bookmarks')).toEqual(a.items('bookmarks'))
  })

  it("a device migrating later can't undo edits made since on another device", () => {
    const mtime = clock - 60_000
    const a = device('A')
    const b = device('B')
    writeLegacy(join(root, 'app'), mtime)
    a.importLegacy({})
    a.put('bookmarks', { upserts: [bm('m1', 'Edited after migrating')], deletes: ['m2'] })
    writeLegacy(join(root, 'app'), mtime)
    clock += 86_400_000
    b.importLegacy({})
    const items = b.items('bookmarks')
    expect(items.find((i) => i.id === 'm1')!.title).toBe('Edited after migrating')
    expect(items.some((i) => i.id === 'm2')).toBe(false)
  })

  it('a legacy file another (older) version rewrote later is imported again, newest wins', () => {
    const a = device('A')
    writeLegacy(join(root, 'app'), clock - 60_000)
    const marks = a.importLegacy({})
    const newer = { ...legacyBookmarks, bookmarks: [{ ...legacyBookmarks.bookmarks[0], title: 'From old version' }] }
    writeFileSync(join(root, 'app', 'bookmarks.json'), JSON.stringify(newer))
    const t = new Date(clock - 1000)
    utimesSync(join(root, 'app', 'bookmarks.json'), t, t)
    const next = a.importLegacy(marks)
    expect(next.bookmarks).toBe(clock - 1000)
    expect(a.items('bookmarks').find((i) => i.id === 'm1')!.title).toBe('From old version')
    expect(a.items('bookmarks')).toHaveLength(3) // absent from the file is not a delete
  })

  it('an unreadable legacy file is set aside, not imported', () => {
    mkdirSync(join(root, 'app'), { recursive: true })
    writeFileSync(join(root, 'app', 'bookmarks.json'), '{"bookmarks":[{"id":"m1"')
    const a = device('A')
    expect(a.importLegacy({}).bookmarks).toBeUndefined()
    expect(readdirSync(join(root, 'app')).some((n) => n.startsWith('bookmarks.json.corrupt-'))).toBe(true)
    expect(a.items('bookmarks')).toEqual([])
  })
})

describe('open tabs of other devices', () => {
  const tab = (title: string) => ({ title, location: { kind: 'bible', book: 'JHN', chapter: 3 } })

  it('lists other devices with their tabs, newest first, hiding ones not seen for 30 days', () => {
    const a = device('A')
    const b = device('B')
    const c = device('C')
    c.publishTabs([tab('Old')])
    clock += 31 * 86_400_000
    a.publishTabs([tab('Mine')])
    b.publishTabs([tab('John 3')])
    const seen = a.devices()
    expect(seen.map((d) => [d.deviceId, d.deviceName, d.tabs.map((t) => t.title)])).toEqual([['B', 'PC B', ['John 3']]])
  })

  it('skips rewriting unchanged tabs until the heartbeat is due', () => {
    const a = device('A')
    expect(a.publishTabs([tab('x')])).toBe(true)
    expect(a.publishTabs([tab('x')])).toBe(false)
    expect(a.publishTabs([tab('y')])).toBe(true)
    clock += 7 * 3_600_000
    expect(a.publishTabs([tab('y')])).toBe(true)
    expect(existsSync(join(root, 'app', 'sync', 'A', OPEN_TABS_FILE))).toBe(true)
  })
})
