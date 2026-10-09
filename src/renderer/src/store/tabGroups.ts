import { openTab, pinnedCount, renumber, sortedTabs, stripUnits, tabHistory } from './workspace'
import type { Tab, Workspace } from './workspace'

/** Chrome's nine tab group colours (dark-theme shades). */
export const GROUP_COLORS = {
  grey: '#b8b0a2',
  blue: '#8ab4f8',
  red: '#f28b82',
  yellow: '#fdd663',
  green: '#81c995',
  pink: '#ff8bcb',
  purple: '#c58af9',
  cyan: '#78d9ec',
  orange: '#fcad70'
} as const

export type GroupColor = keyof typeof GROUP_COLORS

export const GROUP_COLOR_NAMES = Object.keys(GROUP_COLORS) as GroupColor[]

/**
 * A saved tab group (Chrome's saved groups: every group here is saved). While `open`, its tabs
 * are in the strip, carrying `groupId`. Closing it moves them into `savedTabs` (whole tabs, so
 * each keeps its back/forward history, and split pairs keep their `splitId`); reopening puts
 * them back.
 */
export interface TabGroup {
  id: string
  name: string
  color: GroupColor
  collapsed: boolean
  pinnedToBar: boolean
  open: boolean
  savedTabs: Tab[]
  /** Divider positions of the split pairs in `savedTabs`. */
  savedSplitRatios?: Record<string, number>
}

/** The workspace together with the groups: what every group operation works on. */
export interface GroupState {
  ws: Workspace
  groups: TabGroup[]
}

export function groupName(g: Pick<TabGroup, 'name'>): string {
  return g.name.trim() || 'Unnamed group'
}

function newId(): string {
  return crypto.randomUUID()
}

function withoutGroup(t: Tab): Tab {
  const { groupId: _g, ...rest } = t
  void _g
  return rest
}

function setGroup(t: Tab, groupId: string | null | undefined): Tab {
  if ((t.groupId ?? null) === (groupId ?? null)) return t
  return groupId ? { ...t, groupId } : withoutGroup(t)
}

/** A group's tabs in strip order. */
export function groupTabs(tabs: Tab[], groupId: string): Tab[] {
  return sortedTabs(tabs).filter((t) => t.groupId === groupId)
}

/** The tab plus its split partner, in strip order. */
function unitOf(sorted: Tab[], tabId: string): Tab[] {
  const tab = sorted.find((t) => t.id === tabId)
  if (!tab) return []
  return sorted.filter((t) => t.id === tabId || (!!tab.splitId && t.splitId === tab.splitId))
}

/** Keep only the split ids whose both halves are in `tabs`; and the matching ratios. */
function snapshot(tabs: Tab[], ratios: Record<string, number>): { savedTabs: Tab[]; savedSplitRatios: Record<string, number> } {
  const counts = new Map<string, number>()
  for (const t of tabs) if (t.splitId) counts.set(t.splitId, (counts.get(t.splitId) ?? 0) + 1)
  const savedSplitRatios: Record<string, number> = {}
  const savedTabs = sortedTabs(tabs).map((t, i) => {
    const h = tabHistory(t)
    let out: Tab = { ...t, order: i, history: h.entries, historyIndex: h.index }
    delete out.pinned
    if (out.splitId && counts.get(out.splitId) !== 2) {
      const { splitId: _s, ...rest } = out
      void _s
      out = rest
    } else if (out.splitId && typeof ratios[out.splitId] === 'number') {
      savedSplitRatios[out.splitId] = ratios[out.splitId]
    }
    return out
  })
  return { savedTabs, savedSplitRatios }
}

/** The tab to focus when `leaving` (a set of tab ids) goes away or is hidden: the nearest tab
 *  after them, else before. Null when nothing else is left. */
function focusOutside(sorted: Tab[], leaving: Set<string>): string | null {
  const first = sorted.findIndex((t) => leaving.has(t.id))
  const after = sorted.slice(Math.max(0, first)).find((t) => !leaving.has(t.id))
  if (after) return after.id
  const before = sorted.slice(0, Math.max(0, first)).reverse().find((t) => !leaving.has(t.id))
  return before?.id ?? null
}

function withoutRatios(ratios: Record<string, number>, tabs: Tab[]): Record<string, number> {
  const drop = new Set(tabs.map((t) => t.splitId).filter(Boolean) as string[])
  if (![...drop].some((id) => id in ratios)) return ratios
  const next = { ...ratios }
  for (const id of drop) delete next[id]
  return next
}

function sameTabs(a: Tab[], b: Tab[]): boolean {
  return a.length === b.length && a.every((t, i) => t === b[i])
}

/**
 * Enforce the group invariants after any workspace change (`prev` is the workspace before it):
 * - only tabs of open groups carry a groupId, and pinned tabs never do;
 * - the two halves of a split share the first half's group;
 * - an ungrouped tab dropped between two tabs of the same group joins it;
 * - each group's tabs are contiguous (stragglers move next to the group's first tab);
 * - an open group left with no tabs is closed, keeping the tabs just closed out of it, or
 *   deleted when its tabs were merely ungrouped;
 * - a collapsed group expands when one of its tabs gets focus.
 * Returns the same objects when nothing changed.
 */
export function reconcileGroups(prev: Workspace, ws: Workspace, groups: TabGroup[]): GroupState {
  const open = new Set(groups.filter((g) => g.open).map((g) => g.id))
  const sorted = sortedTabs(ws.tabs)
  let tabs = sorted.map((t) => (t.groupId && (t.pinned || !open.has(t.groupId)) ? withoutGroup(t) : t))

  let units = stripUnits(tabs)
  // Split halves share the first half's group.
  units = units.map((u) => (u.length === 2 && u[1].groupId !== u[0].groupId ? [u[0], setGroup(u[1], u[0].groupId)] : u))
  // Sandwiched ungrouped units join the group around them.
  units = units.map((u, i) => {
    if (u[0].groupId || u[0].pinned) return u
    const g = units[i - 1]?.[0].groupId
    if (!g || units[i + 1]?.[0].groupId !== g) return u
    return u.map((t) => setGroup(t, g))
  })
  // Contiguity.
  const seen = new Set<string>()
  const ordered: Tab[][] = []
  for (const u of units) {
    const g = u[0].groupId
    if (!g) ordered.push(u)
    else if (!seen.has(g)) {
      seen.add(g)
      ordered.push(...units.filter((x) => x[0].groupId === g))
    }
  }
  tabs = renumber(ordered.flat())
  const tabsChanged = !sameTabs(tabs, sortedTabs(ws.tabs)) || tabs.length !== ws.tabs.length
  const nextWs: Workspace = tabsChanged ? { ...ws, tabs } : ws

  // Groups.
  const present = new Set(tabs.map((t) => t.groupId).filter(Boolean) as string[])
  const live = new Set(tabs.map((t) => t.id))
  const active = tabs.find((t) => t.id === ws.activeTabId)
  let groupsChanged = false
  const nextGroups: TabGroup[] = []
  for (const g of groups) {
    let out = g
    if (g.open && !present.has(g.id)) {
      const had = prev.tabs.filter((t) => t.groupId === g.id)
      const gone = had.filter((t) => !live.has(t.id))
      if (had.length > 0 && gone.length === 0) {
        groupsChanged = true
        continue // its tabs were all taken out of the group: the group goes
      }
      const snap = gone.length ? snapshot(gone, prev.splitRatios) : null
      out = {
        ...g,
        open: false,
        collapsed: false,
        savedTabs: snap ? snap.savedTabs : g.savedTabs,
        savedSplitRatios: snap ? snap.savedSplitRatios : g.savedSplitRatios
      }
    }
    if (out.open && out.collapsed && active?.groupId === out.id) out = { ...out, collapsed: false }
    if (out !== g) groupsChanged = true
    nextGroups.push(out)
  }
  return { ws: nextWs, groups: groupsChanged ? nextGroups : groups }
}

/**
 * Put a tab (with its split partner) in a new open group, where it stands. Pinned tabs can't
 * be grouped. Returns the new group's id.
 */
export function createGroup(
  state: GroupState,
  tabId: string,
  opts: { id?: string; name?: string; color?: GroupColor } = {}
): GroupState & { groupId: string | null } {
  const sorted = sortedTabs(state.ws.tabs)
  const unit = unitOf(sorted, tabId)
  if (unit.length === 0 || unit[0].pinned) return { ...state, groupId: null }
  const id = opts.id ?? newId()
  const color = opts.color ?? GROUP_COLOR_NAMES[state.groups.length % GROUP_COLOR_NAMES.length]
  const group: TabGroup = {
    id,
    name: opts.name ?? '',
    color,
    collapsed: false,
    pinnedToBar: false,
    open: true,
    savedTabs: []
  }
  const ids = new Set(unit.map((t) => t.id))
  const tabs = sorted.map((t) => (ids.has(t.id) ? setGroup(t, id) : t))
  return { ws: { ...state.ws, tabs }, groups: [...state.groups, group], groupId: id }
}

/**
 * Move a tab (with its split partner) to strip position `targetIndex` (an index into the strip
 * without the moved tabs) and set its group (null = none). This is a drag in the strip.
 */
export function moveTabTo(state: GroupState, tabId: string, targetIndex: number, groupId: string | null): GroupState {
  const sorted = sortedTabs(state.ws.tabs)
  const unit = unitOf(sorted, tabId)
  if (unit.length === 0) return state
  const rest = sorted.filter((t) => !unit.includes(t))
  const pins = pinnedCount(rest)
  let index = Math.max(0, Math.min(targetIndex, rest.length))
  index = unit[0].pinned ? Math.min(index, pins) : Math.max(index, pins)
  const before = rest[index - 1]
  if (before?.splitId && rest[index]?.splitId === before.splitId) index += 1
  const g = unit[0].pinned || !groupId || !state.groups.some((x) => x.id === groupId && x.open) ? null : groupId
  const moved = unit.map((t) => setGroup(t, g))
  const tabs = renumber([...rest.slice(0, index), ...moved, ...rest.slice(index)])
  return { ...state, ws: { ...state.ws, tabs } }
}

/** Index just past a group's last tab in `rest`. */
function groupEnd(rest: Tab[], groupId: string): number {
  let end = -1
  rest.forEach((t, i) => {
    if (t.groupId === groupId) end = i
  })
  return end + 1
}

/** "Add tab to group" → an existing open group: the tab moves to the group's end. */
export function addTabToGroup(state: GroupState, tabId: string, groupId: string): GroupState {
  const g = state.groups.find((x) => x.id === groupId)
  if (!g?.open) return state
  const sorted = sortedTabs(state.ws.tabs)
  const unit = unitOf(sorted, tabId)
  if (unit.length === 0 || unit[0].pinned) return state
  const rest = sorted.filter((t) => !unit.includes(t))
  const end = groupEnd(rest, groupId)
  return moveTabTo(state, tabId, end || rest.length, groupId)
}

/** "Remove from group": the tab moves just past the group's end, ungrouped. */
export function removeTabFromGroup(state: GroupState, tabId: string): GroupState {
  const sorted = sortedTabs(state.ws.tabs)
  const tab = sorted.find((t) => t.id === tabId)
  if (!tab?.groupId) return state
  const unit = unitOf(sorted, tabId)
  const rest = sorted.filter((t) => !unit.includes(t))
  const end = groupEnd(rest, tab.groupId)
  const index = end || rest.findIndex((t) => t.order > tab.order)
  return moveTabTo(state, tabId, index < 0 ? rest.length : index, null)
}

export function updateGroup(
  groups: TabGroup[],
  id: string,
  patch: Partial<Pick<TabGroup, 'name' | 'color' | 'pinnedToBar'>>
): TabGroup[] {
  const g = groups.find((x) => x.id === id)
  if (!g) return groups
  if (Object.entries(patch).every(([k, v]) => g[k as keyof TabGroup] === v)) return groups
  return groups.map((x) => (x.id === id ? { ...x, ...patch } : x))
}

/**
 * Collapse or expand an open group. Collapsing moves focus out of it (to the next tab, else
 * the previous one, else a new tab), as Chrome does.
 */
export function setGroupCollapsed(state: GroupState, id: string, collapsed: boolean): GroupState {
  const g = state.groups.find((x) => x.id === id)
  if (!g?.open || g.collapsed === collapsed) return state
  const groups = state.groups.map((x) => (x.id === id ? { ...x, collapsed } : x))
  let ws = state.ws
  if (collapsed) {
    const sorted = sortedTabs(ws.tabs)
    const members = new Set(sorted.filter((t) => t.groupId === id).map((t) => t.id))
    if (ws.activeTabId && members.has(ws.activeTabId)) {
      const focus = focusOutside(sorted, members)
      ws = focus ? { ...ws, activeTabId: focus } : openTab(ws, { kind: 'newtab' }, { after: null }).ws
    }
  }
  return { ws, groups }
}

export function toggleGroupCollapsed(state: GroupState, id: string): GroupState {
  const g = state.groups.find((x) => x.id === id)
  return g ? setGroupCollapsed(state, id, !g.collapsed) : state
}

/** Remove a group's tabs from the strip, focusing elsewhere (a new tab if nothing is left). */
function removeGroupTabs(ws: Workspace, id: string): Workspace {
  const sorted = sortedTabs(ws.tabs)
  const members = sorted.filter((t) => t.groupId === id)
  if (members.length === 0) return ws
  const leaving = new Set(members.map((t) => t.id))
  const rest = sorted.filter((t) => !leaving.has(t.id))
  const activeTabId =
    ws.activeTabId && !leaving.has(ws.activeTabId) ? ws.activeTabId : focusOutside(sorted, leaving)
  let next: Workspace = {
    ...ws,
    tabs: renumber(rest),
    activeTabId,
    splitRatios: withoutRatios(ws.splitRatios, members)
  }
  if (rest.length === 0) next = openTab(next, { kind: 'newtab' }).ws
  return next
}

/**
 * Close group = hide it: its tabs (each with its history and split pairing) are snapshotted
 * into the group and leave the strip; the group stays saved, listed in the ⊞ menu.
 */
export function closeGroup(state: GroupState, id: string): GroupState {
  const g = state.groups.find((x) => x.id === id)
  if (!g?.open) return state
  const members = groupTabs(state.ws.tabs, id)
  const snap = snapshot(members, state.ws.splitRatios)
  return {
    ws: removeGroupTabs(state.ws, id),
    groups: state.groups.map((x) =>
      x.id === id
        ? { ...x, open: false, collapsed: false, savedTabs: snap.savedTabs, savedSplitRatios: snap.savedSplitRatios }
        : x
    )
  }
}

/**
 * Open a group from the ⊞ menu or a bookmarks-bar chip: an open group is expanded and focused
 * (its focused tab if it has one, else its first); a closed one gets its saved tabs back at the
 * end of the strip, with their histories and split pairs, and its first tab is focused.
 */
export function openGroup(state: GroupState, id: string): GroupState {
  const g = state.groups.find((x) => x.id === id)
  if (!g) return state
  const sorted = sortedTabs(state.ws.tabs)
  if (g.open) {
    const members = sorted.filter((t) => t.groupId === id)
    const focus = members.find((t) => t.id === state.ws.activeTabId) ?? members[0]
    return {
      ws: focus ? { ...state.ws, activeTabId: focus.id } : state.ws,
      groups: g.collapsed ? state.groups.map((x) => (x.id === id ? { ...x, collapsed: false } : x)) : state.groups
    }
  }
  let restored: Tab[] = sortedTabs(g.savedTabs).map((t) => {
    const out: Tab = { ...t, id: newId(), groupId: id }
    delete out.pinned
    return out
  })
  // A split id already in use in the strip (a reopened duplicate) gets a fresh one.
  const used = new Set(sorted.map((t) => t.splitId).filter(Boolean) as string[])
  const remap = new Map<string, string>()
  restored = restored.map((t) => {
    if (!t.splitId || !used.has(t.splitId)) return t
    if (!remap.has(t.splitId)) remap.set(t.splitId, newId())
    return { ...t, splitId: remap.get(t.splitId) }
  })
  if (restored.length === 0) {
    restored = [{ id: newId(), order: 0, kind: 'newtab', groupId: id, history: [{ kind: 'newtab' }], historyIndex: 0 }]
  }
  const ratios = { ...state.ws.splitRatios }
  for (const [k, v] of Object.entries(g.savedSplitRatios ?? {})) ratios[remap.get(k) ?? k] = v
  return {
    ws: {
      ...state.ws,
      tabs: renumber([...sorted, ...restored]),
      activeTabId: restored[0].id,
      splitRatios: ratios
    },
    groups: state.groups.map((x) =>
      x.id === id ? { ...x, open: true, collapsed: false, savedTabs: [], savedSplitRatios: {} } : x
    )
  }
}

/** Delete group = its tabs close and the group is gone for good (the caller confirms). */
export function deleteGroup(state: GroupState, id: string): GroupState {
  if (!state.groups.some((x) => x.id === id)) return state
  return { ws: removeGroupTabs(state.ws, id), groups: state.groups.filter((x) => x.id !== id) }
}

/** Ungroup: the tabs stay where they are, ungrouped; the group is removed. */
export function ungroup(state: GroupState, id: string): GroupState {
  if (!state.groups.some((x) => x.id === id)) return state
  return {
    ws: { ...state.ws, tabs: state.ws.tabs.map((t) => (t.groupId === id ? withoutGroup(t) : t)) },
    groups: state.groups.filter((x) => x.id !== id)
  }
}

/**
 * Drag a group's label: the whole group moves to strip position `targetIndex` (an index into
 * the strip without the group's tabs), never into the pinned region, another group or a split.
 */
export function moveGroup(state: GroupState, id: string, targetIndex: number): GroupState {
  const sorted = sortedTabs(state.ws.tabs)
  const members = sorted.filter((t) => t.groupId === id)
  if (members.length === 0) return state
  const rest = sorted.filter((t) => t.groupId !== id)
  let index = Math.max(pinnedCount(rest), Math.min(targetIndex, rest.length))
  const before = rest[index - 1]
  const after = rest[index]
  if (before?.groupId && after?.groupId === before.groupId) index = groupEnd(rest, before.groupId)
  else if (before?.splitId && rest[index]?.splitId === before.splitId) index += 1
  const tabs = renumber([...rest.slice(0, index), ...members, ...rest.slice(index)])
  return { ...state, ws: { ...state.ws, tabs } }
}

/** "New tab in group": a New Tab page at the group's end, focused. */
export function newTabInGroup(state: GroupState, id: string): GroupState & { tabId: string | null } {
  const members = groupTabs(state.ws.tabs, id)
  const g = state.groups.find((x) => x.id === id)
  if (!g?.open || members.length === 0) return { ...state, tabId: null }
  const { ws, tabId } = openTab(state.ws, { kind: 'newtab' }, { after: members[members.length - 1].id })
  return {
    ws: { ...ws, tabs: ws.tabs.map((t) => (t.id === tabId ? { ...t, groupId: id } : t)) },
    groups: g.collapsed ? state.groups.map((x) => (x.id === id ? { ...x, collapsed: false } : x)) : state.groups,
    tabId
  }
}

/** The strip as segments: a run of one group's units (with the group), or one ungrouped unit. */
export function stripSegments(tabs: Tab[], groups: TabGroup[]): { group: TabGroup | null; units: Tab[][] }[] {
  const out: { group: TabGroup | null; units: Tab[][] }[] = []
  for (const u of stripUnits(tabs)) {
    const g = u[0].groupId ? groups.find((x) => x.id === u[0].groupId) ?? null : null
    const last = out[out.length - 1]
    if (g && last?.group?.id === g.id) last.units.push(u)
    else out.push({ group: g, units: [u] })
  }
  return out
}

/**
 * What goes to the vault. An open group's tabs are snapshotted too, so the group can still be
 * reopened from another device (or if the session's workspace is lost).
 */
export function serializeGroups(groups: TabGroup[], ws: Workspace): string {
  const out = groups.map((g) => {
    if (!g.open) return g
    const snap = snapshot(groupTabs(ws.tabs, g.id), ws.splitRatios)
    return { ...g, savedTabs: snap.savedTabs, savedSplitRatios: snap.savedSplitRatios }
  })
  return JSON.stringify({ version: 1, groups: out })
}

const KNOWN_COLOR = new Set<string>(GROUP_COLOR_NAMES)

/** Parse the vault's groups. Never throws; drops malformed entries. */
export function parseGroups(json: string | null): TabGroup[] {
  if (!json) return []
  try {
    const raw = JSON.parse(json) as { groups?: unknown }
    if (!Array.isArray(raw.groups)) return []
    const seen = new Set<string>()
    const out: TabGroup[] = []
    for (const g of raw.groups as Partial<TabGroup>[]) {
      if (!g || typeof g.id !== 'string' || seen.has(g.id)) continue
      seen.add(g.id)
      const savedTabs = Array.isArray(g.savedTabs)
        ? g.savedTabs.filter((t): t is Tab => !!t && typeof t.id === 'string' && typeof t.kind === 'string')
        : []
      out.push({
        id: g.id,
        name: typeof g.name === 'string' ? g.name : '',
        color: KNOWN_COLOR.has(g.color as string) ? (g.color as GroupColor) : 'grey',
        collapsed: !!g.collapsed,
        pinnedToBar: !!g.pinnedToBar,
        open: !!g.open,
        savedTabs,
        savedSplitRatios:
          g.savedSplitRatios && typeof g.savedSplitRatios === 'object' ? { ...g.savedSplitRatios } : {}
      })
    }
    return out
  } catch {
    return []
  }
}
