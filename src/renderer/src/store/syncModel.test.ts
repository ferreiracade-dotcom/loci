import { describe, expect, it } from 'vitest'
import { diffItems, liveItems, mergeRecords, stableJson } from '@shared/sync'
import type { SyncRecord } from '@shared/sync'
import { EMPTY_BOOKMARKS, addBookmark, addFolder, childrenOf, moveNode } from './bookmarks'
import type { Bookmarks } from './bookmarks'
import { closeGroup, createGroup, openGroup } from './tabGroups'
import type { GroupState } from './tabGroups'
import { EMPTY_WORKSPACE, openTab, setTabContent, sortedTabs, tabContent, tabHistory } from './workspace'
import type { TabContent, Workspace } from './workspace'
import {
  bookmarksToItems,
  buildGroups,
  groupItem,
  itemsToBookmarks,
  matchTabs,
  mergeRemoteGroups,
  parseGroupItem,
  reconcileOpenGroup
} from './syncModel'
import type { GroupItem } from './syncModel'

const john3: TabContent = { kind: 'bible', book: 'JHN', chapter: 3 }
const rom3: TabContent = { kind: 'bible', book: 'ROM', chapter: 3 }
const gal2: TabContent = { kind: 'bible', book: 'GAL', chapter: 2 }
const note: TabContent = { kind: 'note', notePath: 'grace.md' }

/** Records a device would write for the items it changed (stamp per call). */
function records(items: ReturnType<typeof bookmarksToItems>, deviceId: string, at: number): SyncRecord[] {
  return items.map((i) => ({ ...i, updatedAt: at, deviceId }))
}

describe('bookmarks as sync items', () => {
  it('round-trips bookmarks and folders', () => {
    let b = addFolder(EMPTY_BOOKMARKS, 'Dogmatics', undefined, 'f1').bookmarks
    b = addBookmark(b, john3, 'John 3', 'm1', 'f1').bookmarks
    b = addBookmark(b, { kind: 'pdf', bookId: 'b1' }, 'Book', 'm2').bookmarks
    const back = itemsToBookmarks(bookmarksToItems(b))
    expect(stableJson(bookmarksToItems(back))).toBe(stableJson(bookmarksToItems(b)))
  })

  it('a move records one changed item, not a renumbered folder', () => {
    let b: Bookmarks = EMPTY_BOOKMARKS
    for (const [i, loc] of [john3, rom3, gal2, note].entries()) b = addBookmark(b, loc, `m${i}`, `m${i}`).bookmarks
    const moved = moveNode(b, 'm3', undefined, 1)
    expect(childrenOf(moved).map((n) => n.item.id)).toEqual(['m0', 'm3', 'm1', 'm2'])
    const d = diffItems(bookmarksToItems(b), bookmarksToItems(moved))
    expect(d.upserts.map((i) => i.id)).toEqual(['m3'])
  })

  it('two devices inserting at the same spot keep both, in the same order everywhere', () => {
    let base: Bookmarks = EMPTY_BOOKMARKS
    base = addBookmark(base, john3, 'x', 'x').bookmarks
    base = addBookmark(base, rom3, 'y', 'y').bookmarks
    const baseRecs = records(bookmarksToItems(base), 'A', 1)
    // Each device adds one bookmark and drags it between x and y, without seeing the other's.
    const onA = moveNode(addBookmark(base, gal2, 'from A', 'a-new').bookmarks, 'a-new', undefined, 1)
    const onB = moveNode(addBookmark(base, note, 'from B', 'b-new').bookmarks, 'b-new', undefined, 1)
    const aRecs = records(diffItems(bookmarksToItems(base), bookmarksToItems(onA)).upserts, 'A', 10)
    const bRecs = records(diffItems(bookmarksToItems(base), bookmarksToItems(onB)).upserts, 'B', 10)
    const merged1 = itemsToBookmarks(liveItems(mergeRecords([[...baseRecs.filter((r) => r.id !== 'zz'), ...aRecs], bRecs])))
    const merged2 = itemsToBookmarks(liveItems(mergeRecords([bRecs, [...baseRecs, ...aRecs]])))
    const order1 = childrenOf(merged1).map((n) => n.item.id)
    expect(order1).toEqual(['x', 'a-new', 'b-new', 'y'])
    expect(childrenOf(merged2).map((n) => n.item.id)).toEqual(order1)
    // And a further move between the tied pair still finds room.
    const again = moveNode(merged1, 'y', undefined, 2)
    expect(childrenOf(again).map((n) => n.item.id)).toEqual(['x', 'a-new', 'y', 'b-new'])
  })

  it('a bookmark whose folder was deleted elsewhere shows on the bar, keeping its parent stored', () => {
    const items = [{ id: 'm', type: 'bookmark', title: 't', location: john3, parentId: 'gone', order: 3 }]
    const b = itemsToBookmarks(items)
    expect(b.bookmarks[0].parentId).toBeUndefined()
    expect(childrenOf(b).map((n) => n.item.id)).toEqual(['m'])
  })
})

/** A strip of tabs with the given locations; returns the workspace and tab ids. */
function strip(locs: TabContent[]): { ws: Workspace; ids: string[] } {
  let ws = EMPTY_WORKSPACE
  const ids: string[] = []
  for (const l of locs) {
    const r = openTab(ws, l, { after: ids[ids.length - 1] ?? null })
    ws = r.ws
    ids.push(r.tabId)
  }
  return { ws, ids }
}

function withGroup(locs: TabContent[], members: number[]): { s: GroupState; ids: string[] } {
  const { ws, ids } = strip(locs)
  let s: GroupState = { ws, groups: [] }
  s = createGroup(s, ids[members[0]], { id: 'g1', name: 'Study', color: 'blue', createdAt: 5 })
  for (const i of members.slice(1)) {
    s = { ...s, ws: { ...s.ws, tabs: s.ws.tabs.map((t) => (t.id === ids[i] ? { ...t, groupId: 'g1' } : t)) } }
  }
  return { s, ids }
}

const locs = (ws: Workspace, groupId?: string): TabContent[] =>
  sortedTabs(ws.tabs)
    .filter((t) => (groupId ? t.groupId === groupId : true))
    .map((t) => JSON.parse(JSON.stringify(tabContent(t))) as TabContent)

describe('open group follows its synced tab list', () => {
  it('adds, removes and reorders tabs, keeping the history of tabs whose location is unchanged', () => {
    const { s, ids } = withGroup([note, john3, rom3], [1, 2])
    // John 3's tab has some history on this device.
    let ws = setTabContent(s.ws, ids[1], gal2)
    ws = setTabContent(ws, ids[1], john3)
    const before = ws.tabs.find((t) => t.id === ids[1])!
    expect(tabHistory(before).entries).toHaveLength(3)
    ws = { ...ws, activeTabId: ids[1] }
    // Another device: Romans 3 first, then John 3, then a new note; nothing removed here yet.
    const next = reconcileOpenGroup(ws, 'g1', [{ location: rom3 }, { location: john3 }, { location: gal2 }], {})
    expect(locs(next)).toEqual([note, rom3, john3, gal2])
    const kept = next.tabs.find((t) => t.id === ids[1])!
    expect(tabHistory(kept).entries).toHaveLength(3)
    expect(next.tabs.find((t) => t.id === ids[2])).toBeDefined()
    expect(next.activeTabId).toBe(ids[1]) // focus stays put
    // Then John 3 is closed there.
    const fewer = reconcileOpenGroup(next, 'g1', [{ location: rom3 }, { location: gal2 }], {})
    expect(locs(fewer, 'g1')).toEqual([rom3, gal2])
    expect(fewer.tabs.some((t) => t.id === ids[1])).toBe(false)
    expect(fewer.activeTabId && fewer.tabs.find((t) => t.id === fewer.activeTabId)!.groupId).toBe('g1')
  })

  it('is a no-op (same object) when the list already matches', () => {
    const { s } = withGroup([john3, rom3], [0, 1])
    const item = groupItem(s.groups[0], s.ws)
    expect(reconcileOpenGroup(s.ws, 'g1', item.tabs, item.splitRatios)).toBe(s.ws)
  })

  it('a tab navigated elsewhere is followed in place, its history growing', () => {
    const { s, ids } = withGroup([john3, rom3], [0, 1])
    const next = reconcileOpenGroup(s.ws, 'g1', [{ location: john3 }, { location: gal2 }], {})
    const t = next.tabs.find((x) => x.id === ids[1])!
    expect(tabContent(t)).toMatchObject(gal2)
    expect(tabHistory(t).entries.map((e) => (e as { book?: string }).book)).toEqual(['ROM', 'GAL'])
  })

  it('takes split pairs from the synced list', () => {
    const { s } = withGroup([john3, rom3], [0, 1])
    const next = reconcileOpenGroup(s.ws, 'g1', [{ location: john3, splitId: 'sp' }, { location: rom3, splitId: 'sp' }], { sp: 0.3 })
    expect(sortedTabs(next.tabs).map((t) => t.splitId)).toEqual(['sp', 'sp'])
    expect(next.splitRatios.sp).toBe(0.3)
  })
})

describe('groups across devices', () => {
  it('opening a group open on another device opens this device’s view of it, once', () => {
    // Device A has the group open with three tabs.
    const a = withGroup([note, john3, rom3, gal2], [1, 2, 3])
    const item = groupItem(a.s.groups[0], a.s.ws)
    expect(item.tabs).toHaveLength(3)
    // Device B: its own strip, no local state for the group.
    const b = strip([note])
    let sb = buildGroups([parseGroupItem(item as never)!], [], b.ws, new Set())
    expect(sb.groups[0]).toMatchObject({ id: 'g1', open: false, name: 'Study' })
    sb = openGroup(sb, 'g1')
    expect(locs(sb.ws, 'g1')).toEqual([john3, rom3, gal2])
    // Opening again (from the bookmarks bar) focuses it; nothing is duplicated.
    sb = openGroup(sb, 'g1')
    expect(sb.ws.tabs).toHaveLength(4)
    // And B's synced form is the same as A's: opening sends no change.
    expect(stableJson(groupItem(sb.groups[0], sb.ws))).toBe(stableJson(item))
  })

  it('a group open in this device’s restored strip stays open and follows the synced list', () => {
    const { s, ids } = withGroup([note, john3], [1])
    const ws = setTabContent(s.ws, ids[1], rom3)
    const item: GroupItem = { ...groupItem(s.groups[0], s.ws), tabs: [{ location: rom3 }, { location: gal2 }] }
    const built = buildGroups([item], s.groups, ws, new Set())
    expect(built.groups[0].open).toBe(true)
    expect(locs(built.ws, 'g1')).toEqual([rom3, gal2])
    expect(tabHistory(built.ws.tabs.find((t) => t.id === ids[1])!).entries).toHaveLength(2)
  })

  it('a closed group keeps the histories of its saved tabs whose location is unchanged', () => {
    const { s, ids } = withGroup([note, john3, rom3], [1, 2])
    const ws = setTabContent(setTabContent(s.ws, ids[1], gal2), ids[1], john3)
    const closed = closeGroup({ ws, groups: s.groups }, 'g1')
    const item: GroupItem = { ...groupItem(closed.groups[0], closed.ws), tabs: [{ location: john3 }, { location: note }] }
    const built = buildGroups([item], closed.groups, closed.ws, new Set())
    const saved = built.groups[0].savedTabs
    expect(saved.map((t) => t.kind)).toEqual(['bible', 'note'])
    expect(tabHistory(saved[0]).entries).toHaveLength(3)
  })

  it('merging remote changes: new groups arrive closed, deleted ones release their tabs, pending ones wait', () => {
    const { s } = withGroup([note, john3], [1])
    const mine = groupItem(s.groups[0], s.ws)
    const synced = new Map([['g1', stableJson(mine)]])
    const other: GroupItem = { id: 'g2', name: 'Other', color: 'red', pinnedToBar: true, createdAt: 9, tabs: [{ location: gal2 }], splitRatios: {} }
    // g2 added elsewhere, g1 deleted elsewhere.
    const r = mergeRemoteGroups(s, [other], synced, new Set())
    expect(r.state.groups.map((g) => [g.id, g.open])).toEqual([['g2', false]])
    expect(r.state.ws.tabs.every((t) => !t.groupId)).toBe(true)
    expect(r.state.ws.tabs).toHaveLength(2) // the tabs stay open
    expect([...r.synced.keys()]).toEqual(['g2'])
    // While g1 has a change of ours in flight, the merged view can't delete or revert it.
    const held = mergeRemoteGroups(s, [{ ...mine, name: 'Old name' }], synced, new Set(['g1']))
    expect(held.state).toBe(s)
    // An unchanged merged view changes nothing.
    expect(mergeRemoteGroups(s, [mine], synced, new Set()).state).toBe(s)
  })

  it('a rename elsewhere renames the open group without touching its tabs', () => {
    const { s } = withGroup([note, john3], [1])
    const mine = groupItem(s.groups[0], s.ws)
    const r = mergeRemoteGroups(s, [{ ...mine, name: 'Renamed', color: 'green' }], new Map([['g1', stableJson(mine)]]), new Set())
    expect(r.state.groups[0]).toMatchObject({ name: 'Renamed', color: 'green', open: true })
    expect(r.state.ws).toBe(s.ws)
  })

  it('matchTabs leaves unchanged saved tabs as the same objects', () => {
    const { ws } = strip([john3, rom3])
    const tabs = sortedTabs(ws.tabs)
    const out = matchTabs(tabs, [{ location: john3 }, { location: rom3 }])
    expect(out[0]).toBe(tabs[0])
    expect(out[1]).toBe(tabs[1])
  })
})
