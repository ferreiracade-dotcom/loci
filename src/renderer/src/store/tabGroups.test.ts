import { describe, expect, it } from 'vitest'
import {
  EMPTY_WORKSPACE,
  closeTab,
  goHistory,
  openTab,
  setPinned,
  setTabContent,
  sortedTabs,
  splitTabs
} from './workspace'
import type { TabContent, Workspace } from './workspace'
import {
  addTabToGroup,
  closeGroup,
  createGroup,
  deleteGroup,
  groupTabs,
  moveGroup,
  moveTabTo,
  newTabInGroup,
  openGroup,
  parseGroups,
  reconcileGroups,
  removeTabFromGroup,
  serializeGroups,
  setGroupCollapsed,
  stripSegments,
  toggleGroupCollapsed,
  ungroup,
  updateGroup
} from './tabGroups'
import type { GroupState } from './tabGroups'

const pdf = (bookId: string): TabContent => ({ kind: 'pdf', bookId })

function strip(n: number): { ws: Workspace; ids: string[] } {
  let ws: Workspace = EMPTY_WORKSPACE
  const ids: string[] = []
  for (let i = 1; i <= n; i++) {
    const r = openTab(ws, pdf(`b${i}`), { after: null })
    ws = r.ws
    ids.push(r.tabId)
  }
  return { ws, ids }
}

const order = (ws: Workspace): string[] => sortedTabs(ws.tabs).map((t) => t.bookId ?? t.kind)

/** Apply an operation the way the store does: then reconcile against the state before it. */
function step(state: GroupState, op: (s: GroupState) => GroupState): GroupState {
  const next = op(state)
  return reconcileGroups(state.ws, next.ws, next.groups)
}

function grouped(n: number, members: number[]): { s: GroupState; ids: string[]; gid: string } {
  const { ws, ids } = strip(n)
  let s: GroupState = { ws, groups: [] }
  const created = createGroup(s, ids[members[0]], { id: 'g1', name: 'Romans', color: 'blue' })
  s = reconcileGroups(s.ws, created.ws, created.groups)
  for (const m of members.slice(1)) s = step(s, (x) => addTabToGroup(x, ids[m], 'g1'))
  return { s, ids, gid: 'g1' }
}

describe('tab groups', () => {
  it('creates a group around a tab and its split partner', () => {
    const { ws, ids } = strip(3)
    const split = splitTabs(ws, ids[0], ids[1])
    const r = createGroup({ ws: split, groups: [] }, ids[1], { id: 'g' })
    expect(r.groupId).toBe('g')
    expect(groupTabs(r.ws.tabs, 'g').map((t) => t.id)).toEqual([ids[0], ids[1]])
    expect(r.groups[0]).toMatchObject({ open: true, collapsed: false, pinnedToBar: false, name: '' })
  })

  it('refuses to group a pinned tab', () => {
    const { ws, ids } = strip(2)
    const pinned = setPinned(ws, ids[1], true)
    expect(createGroup({ ws: pinned, groups: [] }, ids[1]).groupId).toBeNull()
  })

  it('adds tabs to the end of a group and keeps the group contiguous', () => {
    const { s, ids } = grouped(4, [0, 3])
    expect(order(s.ws)).toEqual(['b1', 'b4', 'b2', 'b3'])
    expect(groupTabs(s.ws.tabs, 'g1').map((t) => t.id)).toEqual([ids[0], ids[3]])
  })

  it('moves a whole split pair into a group as one unit', () => {
    const { ws, ids } = strip(4)
    let s: GroupState = { ws: splitTabs(ws, ids[2], ids[3]), groups: [] }
    s = step(s, (x) => createGroup(x, ids[0], { id: 'g1' }))
    s = step(s, (x) => addTabToGroup(x, ids[3], 'g1'))
    expect(order(s.ws)).toEqual(['b1', 'b3', 'b4', 'b2'])
    expect(groupTabs(s.ws.tabs, 'g1').map((t) => t.bookId)).toEqual(['b1', 'b3', 'b4'])
  })

  it('a split formed with a grouped tab joins its group', () => {
    const { s, ids } = grouped(3, [0])
    const next = step(s, (x) => ({ ...x, ws: splitTabs(x.ws, ids[0], ids[2]) }))
    expect(groupTabs(next.ws.tabs, 'g1').map((t) => t.bookId)).toEqual(['b1', 'b3'])
  })

  it('an ungrouped tab dropped inside a group joins it; dragging out leaves it', () => {
    const { s, ids } = grouped(4, [0, 1])
    // b3 dragged between b1 and b2.
    let next = step(s, (x) => moveTabTo(x, ids[2], 1, null))
    expect(groupTabs(next.ws.tabs, 'g1').map((t) => t.bookId)).toEqual(['b1', 'b3', 'b2'])
    next = step(next, (x) => moveTabTo(x, ids[2], 3, null))
    expect(groupTabs(next.ws.tabs, 'g1').map((t) => t.bookId)).toEqual(['b1', 'b2'])
    expect(order(next.ws)).toEqual(['b1', 'b2', 'b4', 'b3'])
  })

  it('remove from group moves the tab past the group; removing the last one deletes the group', () => {
    const { s, ids } = grouped(3, [0, 1])
    let next = step(s, (x) => removeTabFromGroup(x, ids[0]))
    expect(order(next.ws)).toEqual(['b2', 'b1', 'b3'])
    expect(groupTabs(next.ws.tabs, 'g1').map((t) => t.bookId)).toEqual(['b2'])
    next = step(next, (x) => removeTabFromGroup(x, ids[1]))
    expect(next.groups).toHaveLength(0)
    expect(next.ws.tabs.every((t) => !t.groupId)).toBe(true)
  })

  it('renames, recolours and pins to the bar', () => {
    const { s } = grouped(1, [0])
    const groups = updateGroup(s.groups, 'g1', { name: 'Baptism', color: 'green', pinnedToBar: true })
    expect(groups[0]).toMatchObject({ name: 'Baptism', color: 'green', pinnedToBar: true })
    expect(updateGroup(groups, 'g1', { name: 'Baptism' })).toBe(groups)
  })

  it('collapsing moves focus out of the group; focusing a tab inside expands it', () => {
    const { s, ids } = grouped(3, [0, 1])
    const focused = { ...s, ws: { ...s.ws, activeTabId: ids[1] } }
    const collapsed = step(focused, (x) => setGroupCollapsed(x, 'g1', true))
    expect(collapsed.groups[0].collapsed).toBe(true)
    expect(collapsed.ws.activeTabId).toBe(ids[2])
    const refocused = step(collapsed, (x) => ({ ...x, ws: { ...x.ws, activeTabId: ids[0] } }))
    expect(refocused.groups[0].collapsed).toBe(false)
    expect(step(refocused, (x) => toggleGroupCollapsed(x, 'g1')).groups[0].collapsed).toBe(true)
  })

  it('collapsing the only tabs opens a New Tab page to focus', () => {
    const { s } = grouped(1, [0])
    const collapsed = step(s, (x) => setGroupCollapsed(x, 'g1', true))
    expect(collapsed.ws.tabs).toHaveLength(2)
    expect(collapsed.ws.tabs.find((t) => t.id === collapsed.ws.activeTabId)?.kind).toBe('newtab')
  })

  it('close hides the tabs with history and split pairs; reopen restores them', () => {
    const { ws, ids } = strip(4)
    let s: GroupState = { ws, groups: [] }
    // b2 navigates twice and goes back once: history [b2, n1, n2] at index 1.
    s = { ...s, ws: setTabContent(s.ws, ids[1], { kind: 'note', notePath: 'n1.md' }) }
    s = { ...s, ws: setTabContent(s.ws, ids[1], { kind: 'note', notePath: 'n2.md' }) }
    s = { ...s, ws: goHistory(s.ws, ids[1], -1) }
    s = { ...s, ws: splitTabs(s.ws, ids[1], ids[2]) }
    const splitId = s.ws.tabs.find((t) => t.id === ids[1])!.splitId!
    s = { ...s, ws: { ...s.ws, splitRatios: { [splitId]: 0.3 } } }
    s = step(s, (x) => createGroup(x, ids[1], { id: 'g1' }))
    s = { ...s, ws: { ...s.ws, activeTabId: ids[2] } }

    const closed = step(s, (x) => closeGroup(x, 'g1'))
    expect(order(closed.ws)).toEqual(['b1', 'b4'])
    expect(closed.ws.activeTabId).toBe(ids[3])
    expect(closed.ws.splitRatios).toEqual({})
    const g = closed.groups[0]
    expect(g.open).toBe(false)
    expect(g.savedTabs).toHaveLength(2)
    expect(g.savedSplitRatios).toEqual({ [splitId]: 0.3 })

    const reopened = step(closed, (x) => openGroup(x, 'g1'))
    expect(reopened.groups[0].open).toBe(true)
    const back = groupTabs(reopened.ws.tabs, 'g1')
    expect(back.map((t) => t.kind)).toEqual(['note', 'pdf'])
    expect(back[0].notePath).toBe('n1.md')
    expect(back[0].history?.map((h) => (h.kind === 'note' ? h.notePath : h.kind))).toEqual(['pdf', 'n1.md', 'n2.md'])
    expect(back[0].historyIndex).toBe(1)
    expect(back[0].splitId).toBeDefined()
    expect(back[0].splitId).toBe(back[1].splitId)
    expect(reopened.ws.splitRatios[back[0].splitId!]).toBe(0.3)
    expect(reopened.ws.activeTabId).toBe(back[0].id)
    // Forward still works after the round trip.
    const fwd = goHistory(reopened.ws, back[0].id, 1)
    expect(fwd.tabs.find((t) => t.id === back[0].id)?.notePath).toBe('n2.md')
  })

  it('opening an open group switches to it and expands it', () => {
    const { s, ids } = grouped(3, [1])
    const collapsed = step({ ...s, ws: { ...s.ws, activeTabId: ids[0] } }, (x) => setGroupCollapsed(x, 'g1', true))
    const opened = step(collapsed, (x) => openGroup(x, 'g1'))
    expect(opened.ws.activeTabId).toBe(ids[1])
    expect(opened.groups[0].collapsed).toBe(false)
    expect(opened.ws.tabs).toHaveLength(3)
  })

  it('closing the last tab strip-wide leaves a New Tab page', () => {
    const { s } = grouped(1, [0])
    const closed = step(s, (x) => closeGroup(x, 'g1'))
    expect(closed.ws.tabs.map((t) => t.kind)).toEqual(['newtab'])
  })

  it('closing every tab of a group closes the group, keeping them', () => {
    const { s, ids } = grouped(3, [0])
    const next = step(s, (x) => ({ ...x, ws: closeTab(x.ws, ids[0]) }))
    expect(next.groups[0].open).toBe(false)
    expect(next.groups[0].savedTabs.map((t) => t.bookId)).toEqual(['b1'])
  })

  it('delete removes the tabs and the group for good', () => {
    const { s } = grouped(3, [0, 1])
    const next = step(s, (x) => deleteGroup(x, 'g1'))
    expect(next.groups).toHaveLength(0)
    expect(order(next.ws)).toEqual(['b3'])
    // Deleting a closed group just forgets it.
    const closed = step(s, (x) => closeGroup(x, 'g1'))
    const gone = step(closed, (x) => deleteGroup(x, 'g1'))
    expect(gone.groups).toHaveLength(0)
    expect(order(gone.ws)).toEqual(['b3'])
  })

  it('ungroup keeps the tabs and drops the group', () => {
    const { s } = grouped(3, [0, 1])
    const next = step(s, (x) => ungroup(x, 'g1'))
    expect(next.groups).toHaveLength(0)
    expect(order(next.ws)).toEqual(['b1', 'b2', 'b3'])
  })

  it('dragging the label moves the whole group, never into another group', () => {
    const { s, ids } = grouped(5, [0, 1])
    let next = step(s, (x) => moveGroup(x, 'g1', 3))
    expect(order(next.ws)).toEqual(['b3', 'b4', 'b5', 'b1', 'b2'])
    next = step(next, (x) => createGroup(x, ids[2], { id: 'g2' }))
    next = step(next, (x) => addTabToGroup(x, ids[3], 'g2'))
    // Dropped between b3 and b4 (both g2): lands after g2 instead.
    next = step(next, (x) => moveGroup(x, 'g1', 1))
    expect(order(next.ws)).toEqual(['b3', 'b4', 'b1', 'b2', 'b5'])
  })

  it('new tab in group lands at its end, in the group', () => {
    const { s } = grouped(3, [0, 1])
    const r = newTabInGroup(s, 'g1')
    const next = reconcileGroups(s.ws, r.ws, r.groups)
    expect(groupTabs(next.ws.tabs, 'g1').map((t) => t.kind)).toEqual(['pdf', 'pdf', 'newtab'])
    expect(next.ws.activeTabId).toBe(r.tabId)
  })

  it('pinning a grouped tab takes it out of the group', () => {
    const { s, ids } = grouped(3, [0, 1])
    const next = step(s, (x) => ({ ...x, ws: setPinned(x.ws, ids[1], true) }))
    expect(groupTabs(next.ws.tabs, 'g1').map((t) => t.bookId)).toEqual(['b1'])
  })

  it('segments the strip by group for rendering', () => {
    const { s } = grouped(3, [1, 2])
    const segs = stripSegments(s.ws.tabs, s.groups)
    expect(segs.map((x) => [x.group?.id ?? null, x.units.length])).toEqual([
      [null, 1],
      ['g1', 2]
    ])
  })

  it('round-trips through the vault, snapshotting open groups', () => {
    const { s } = grouped(3, [0, 1])
    const pinned = { ...s, groups: updateGroup(s.groups, 'g1', { pinnedToBar: true, name: 'Study' }) }
    const parsed = parseGroups(serializeGroups(pinned.groups, pinned.ws))
    expect(parsed[0]).toMatchObject({ id: 'g1', name: 'Study', pinnedToBar: true, open: true })
    expect(parsed[0].savedTabs.map((t) => t.bookId)).toEqual(['b1', 'b2'])
    // A session without the group's tabs (another device): the group comes back closed.
    const elsewhere = reconcileGroups(EMPTY_WORKSPACE, EMPTY_WORKSPACE, parsed)
    expect(elsewhere.groups[0].open).toBe(false)
    expect(elsewhere.groups[0].savedTabs).toHaveLength(2)
    // Garbage in, nothing out.
    expect(parseGroups('nope')).toEqual([])
    expect(parseGroups('{"groups":[{"id":3},{"id":"a","color":"mauve"}]}')[0].color).toBe('grey')
  })

  it('drops group ids that point at no open group', () => {
    const { ws, ids } = strip(2)
    const stray = { ...ws, tabs: ws.tabs.map((t) => (t.id === ids[0] ? { ...t, groupId: 'zzz' } : t)) }
    const r = reconcileGroups(stray, stray, [])
    expect(r.ws.tabs.every((t) => !t.groupId)).toBe(true)
    // And leaves a consistent state untouched (same objects).
    const again = reconcileGroups(r.ws, r.ws, r.groups)
    expect(again.ws).toBe(r.ws)
    expect(again.groups).toBe(r.groups)
  })
})

describe('retired kinds in saved groups', () => {
  it('a closed group keeps a dashboard tab as a New Tab page', () => {
    const groups = parseGroups(
      JSON.stringify({
        groups: [
          {
            id: 'g',
            name: 'G',
            color: 'blue',
            open: false,
            savedTabs: [{ id: 't', order: 0, kind: 'dashboard', history: [{ kind: 'dashboard' }], historyIndex: 0 }]
          }
        ]
      })
    )
    expect(groups[0].savedTabs[0].kind).toBe('newtab')
    expect(groups[0].savedTabs[0].history).toEqual([{ kind: 'newtab' }])
  })
})
