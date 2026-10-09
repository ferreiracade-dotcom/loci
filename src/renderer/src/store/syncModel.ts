import { stableJson } from '@shared/sync'
import type { SyncItem } from '@shared/sync'
import { normalizeBookmarks } from './bookmarks'
import type { Bookmark, BookmarkFolder, Bookmarks } from './bookmarks'
import { GROUP_COLOR_NAMES, groupTabs, reconcileGroups } from './tabGroups'
import type { GroupColor, GroupState, TabGroup } from './tabGroups'
import { migrateLocation, renumber, setTabContent, sortedTabs, tabContent } from './workspace'
import type { Tab, TabContent, Workspace } from './workspace'

/*
 * The renderer's side of multi-device sync: converting bookmarks and tab groups to and from the
 * items main stores as per-device records (see src/shared/sync.ts), and folding another device's
 * group changes into this device's tabs without losing their history.
 */

// --- Bookmarks ---

/** Bookmarks and folders as sync items (one per bookmark or folder). */
export function bookmarksToItems(b: Bookmarks): SyncItem[] {
  const clean = <T extends object>(x: T): T => JSON.parse(JSON.stringify(x)) as T
  return [
    ...b.folders.map((f) => clean({ ...f, type: 'folder' })),
    ...b.bookmarks.map((m) => clean({ ...m, type: 'bookmark' }))
  ]
}

/** The merged items back as bookmarks (malformed items dropped, the tree repaired). */
export function itemsToBookmarks(items: SyncItem[]): Bookmarks {
  const bookmarks: Bookmark[] = []
  const folders: BookmarkFolder[] = []
  for (const it of items) {
    if (!it || typeof it.id !== 'string' || typeof it.title !== 'string') continue
    const base = {
      id: it.id,
      title: it.title,
      ...(typeof it.parentId === 'string' ? { parentId: it.parentId } : {}),
      ...(typeof it.order === 'number' && Number.isFinite(it.order) ? { order: it.order } : {})
    }
    if (it.type === 'folder') folders.push(base)
    else if (it.type === 'bookmark') {
      const loc = it.location as TabContent | undefined
      if (!loc || typeof loc !== 'object' || typeof loc.kind !== 'string') continue
      bookmarks.push({ ...base, location: migrateLocation(loc) })
    }
  }
  return normalizeBookmarks({ bookmarks, folders })
}

// --- Tab groups ---

/** One tab of a synced group: where it is, and its split pairing. History is not synced. */
export interface SyncedTab {
  location: TabContent
  splitId?: string
}

/** What syncs about a group. Whether it is open (and collapsed) is this device's business. */
export interface GroupItem {
  id: string
  name: string
  color: GroupColor
  pinnedToBar: boolean
  createdAt: number
  tabs: SyncedTab[]
  splitRatios: Record<string, number>
}

const KNOWN_COLOR = new Set<string>(GROUP_COLOR_NAMES)

function newId(): string {
  return crypto.randomUUID()
}

/** Exact identity of a location (highlighted verses included). */
export function locationKey(loc: TabContent): string {
  return stableJson(loc)
}

/** A group's synced form: its tabs from the strip when open here, else its saved tabs. */
export function groupItem(g: TabGroup, ws: Workspace): GroupItem {
  const tabs = g.open ? groupTabs(ws.tabs, g.id) : sortedTabs(g.savedTabs)
  const ratios = g.open ? ws.splitRatios : (g.savedSplitRatios ?? {})
  const counts = new Map<string, number>()
  for (const t of tabs) if (t.splitId) counts.set(t.splitId, (counts.get(t.splitId) ?? 0) + 1)
  const splitRatios: Record<string, number> = {}
  const entries: SyncedTab[] = tabs.map((t) => {
    const location = JSON.parse(JSON.stringify(tabContent(t))) as TabContent
    if (t.splitId && counts.get(t.splitId) === 2) {
      if (typeof ratios[t.splitId] === 'number') splitRatios[t.splitId] = ratios[t.splitId]
      return { location, splitId: t.splitId }
    }
    return { location }
  })
  return {
    id: g.id,
    name: g.name,
    color: g.color,
    pinnedToBar: g.pinnedToBar,
    createdAt: g.createdAt ?? 0,
    tabs: entries,
    splitRatios
  }
}

export function groupItems(groups: TabGroup[], ws: Workspace): GroupItem[] {
  return groups.map((g) => groupItem(g, ws))
}

/** Validate a merged item as a group (null when malformed). Split pairs must be adjacent. */
export function parseGroupItem(it: SyncItem): GroupItem | null {
  if (!it || typeof it.id !== 'string') return null
  const rawTabs = Array.isArray(it.tabs) ? (it.tabs as Partial<SyncedTab>[]) : []
  const tabs: SyncedTab[] = rawTabs
    .filter((t) => !!t && !!t.location && typeof t.location === 'object' && typeof t.location.kind === 'string')
    .map((t) => {
      const location = migrateLocation(t.location as TabContent)
      return typeof t.splitId === 'string' ? { location, splitId: t.splitId } : { location }
    })
  for (let i = 0; i < tabs.length; i++) {
    const id = tabs[i].splitId
    if (!id) continue
    const pairedNext = tabs[i + 1]?.splitId === id && tabs[i + 2]?.splitId !== id
    const pairedPrev = tabs[i - 1]?.splitId === id && tabs[i - 2]?.splitId !== id
    if (!pairedNext && !pairedPrev) delete tabs[i].splitId
  }
  const raw = (it.splitRatios ?? {}) as Record<string, unknown>
  const splitRatios: Record<string, number> = {}
  for (const [k, v] of Object.entries(raw)) if (typeof v === 'number' && Number.isFinite(v)) splitRatios[k] = v
  return {
    id: it.id,
    name: typeof it.name === 'string' ? it.name : '',
    color: KNOWN_COLOR.has(it.color as string) ? (it.color as GroupColor) : 'grey',
    pinnedToBar: !!it.pinnedToBar,
    createdAt: typeof it.createdAt === 'number' ? it.createdAt : 0,
    tabs,
    splitRatios
  }
}

export function parseGroupItems(items: SyncItem[]): GroupItem[] {
  return items
    .map(parseGroupItem)
    .filter((g): g is GroupItem => !!g)
    .sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

function freshTab(loc: TabContent): Tab {
  return { id: newId(), order: 0, ...loc, history: [loc], historyIndex: 0 } as Tab
}

/**
 * This device's tabs for a group's synced tab list. A tab whose location is unchanged is kept
 * as it is (id, back/forward history); a tab left over is navigated to a leftover location in
 * order (its history grows, as if the user had followed a link); only what is still missing is
 * created. Orders run from `firstOrder`, split pairs follow the synced list. Unchanged tabs keep their
 * object identity.
 */
export function matchTabs(existing: Tab[], entries: SyncedTab[], groupId?: string, firstOrder = 0): Tab[] {
  const pool = sortedTabs(existing)
  const used = new Set<string>()
  const slots: (Tab | null)[] = entries.map((e) => {
    const key = locationKey(e.location)
    const hit = pool.find((t) => !used.has(t.id) && locationKey(tabContent(t)) === key)
    if (!hit) return null
    used.add(hit.id)
    return hit
  })
  const leftovers = pool.filter((t) => !used.has(t.id))
  return slots.map((hit, i) => {
    const e = entries[i]
    let tab: Tab
    if (hit) tab = hit
    else {
      const reuse = leftovers.shift()
      tab = reuse ? setTabContent({ tabs: [reuse], activeTabId: null, splitRatios: {}, closed: [] }, reuse.id, e.location).tabs[0] : freshTab(e.location)
    }
    const want = { order: firstOrder + i, splitId: e.splitId, groupId }
    if (tab.order === want.order && tab.splitId === want.splitId && tab.groupId === want.groupId) return tab
    const out: Tab = { ...tab, order: want.order }
    delete out.splitId
    delete out.groupId
    delete out.pinned
    if (e.splitId) out.splitId = e.splitId
    if (groupId) out.groupId = groupId
    return out
  })
}

/**
 * An open group's tabs brought in line with its synced tab list (another device changed it):
 * tabs are added, removed or reordered in place, keeping the history of every tab whose location
 * is unchanged. Focus stays where it is unless the focused tab went away. Returns `ws` itself
 * when nothing changed.
 */
export function reconcileOpenGroup(
  ws: Workspace,
  groupId: string,
  entries: SyncedTab[],
  ratios: Record<string, number>
): Workspace {
  const sorted = sortedTabs(ws.tabs)
  const members = sorted.filter((t) => t.groupId === groupId)
  if (members.length === 0 || entries.length === 0) return ws
  // A split id another tab in the strip already uses gets a fresh one.
  const outside = new Set(sorted.filter((t) => t.groupId !== groupId && t.splitId).map((t) => t.splitId!))
  const remap = new Map<string, string>()
  const safeEntries = entries.map((e) => {
    if (!e.splitId || !outside.has(e.splitId)) return e
    if (!remap.has(e.splitId)) remap.set(e.splitId, newId())
    return { ...e, splitId: remap.get(e.splitId) }
  })
  const first = sorted.findIndex((t) => t.groupId === groupId)
  const next = matchTabs(members, safeEntries, groupId, first)
  const rest = sorted.filter((t) => t.groupId !== groupId)
  const tabs = renumber([...rest.slice(0, first), ...next, ...rest.slice(first)])
  const same = tabs.length === sorted.length && tabs.every((t, i) => t === sorted[i])
  const splitRatios = { ...ws.splitRatios }
  for (const t of members) if (t.splitId) delete splitRatios[t.splitId]
  for (const [k, v] of Object.entries(ratios)) splitRatios[remap.get(k) ?? k] = v
  const ratiosSame = stableJson(splitRatios) === stableJson(ws.splitRatios)
  if (same && ratiosSame) return ws
  let activeTabId = ws.activeTabId
  if (activeTabId && !tabs.some((t) => t.id === activeTabId)) {
    const was = members.findIndex((t) => t.id === activeTabId)
    activeTabId = was >= 0 ? next[Math.min(was, next.length - 1)].id : (tabs[0]?.id ?? null)
  }
  return { ...ws, tabs, activeTabId, splitRatios }
}

function closedGroupFrom(item: GroupItem, local?: TabGroup): TabGroup {
  return {
    id: item.id,
    name: item.name,
    color: item.color,
    pinnedToBar: item.pinnedToBar,
    createdAt: item.createdAt,
    collapsed: false,
    open: false,
    savedTabs: matchTabs(local?.savedTabs ?? [], item.tabs),
    savedSplitRatios: { ...item.splitRatios }
  }
}

/**
 * The groups at startup: every synced group, open here when this device's strip still has its
 * tabs (brought in line with the synced list), closed otherwise (its saved tabs keep their
 * histories from this device's last session where the location is unchanged). Groups this
 * device made but never got to record (`unsynced`) are kept too.
 */
export function buildGroups(items: GroupItem[], local: TabGroup[], ws: Workspace, unsynced: Set<string>): GroupState {
  const localById = new Map(local.map((g) => [g.id, g]))
  const groups: TabGroup[] = []
  let next = ws
  for (const item of items) {
    const l = localById.get(item.id)
    const open = next.tabs.some((t) => t.groupId === item.id && !t.pinned)
    if (open) {
      next = reconcileOpenGroup(next, item.id, item.tabs, item.splitRatios)
      groups.push({
        id: item.id,
        name: item.name,
        color: item.color,
        pinnedToBar: item.pinnedToBar,
        createdAt: item.createdAt,
        collapsed: l?.collapsed ?? false,
        open: true,
        savedTabs: [],
        savedSplitRatios: {}
      })
    } else groups.push(closedGroupFrom(item, l))
  }
  const known = new Set(items.map((i) => i.id))
  for (const g of local) if (!known.has(g.id) && unsynced.has(g.id)) groups.push(g)
  return reconcileGroups(next, next, groups)
}

/**
 * Fold another device's group changes into this device's state. `synced` is the last form of
 * each group this device sent or received; only groups whose merged form differs from it are
 * touched, and `pending` ones (changed here, not yet recorded) are left alone. A group that was
 * synced and is gone from the merged list was deleted elsewhere: its tabs stay open, ungrouped.
 */
export function mergeRemoteGroups(
  state: GroupState,
  items: GroupItem[],
  synced: Map<string, string>,
  pending: Set<string>
): { state: GroupState; synced: Map<string, string> } {
  let ws = state.ws
  let groups = state.groups
  const nextSynced = new Map(synced)
  const byId = new Map(items.map((i) => [i.id, i]))
  for (const g of state.groups) {
    if (byId.has(g.id) || pending.has(g.id) || !synced.has(g.id)) continue
    nextSynced.delete(g.id)
    groups = groups.filter((x) => x.id !== g.id)
    if (g.open) ws = { ...ws, tabs: ws.tabs.map((t) => (t.groupId === g.id ? stripGroup(t) : t)) }
  }
  for (const item of items) {
    if (pending.has(item.id)) continue
    const json = stableJson(item)
    if (synced.get(item.id) === json) continue
    nextSynced.set(item.id, json)
    const g = groups.find((x) => x.id === item.id)
    if (!g) {
      groups = [...groups, closedGroupFrom(item)]
      continue
    }
    const fields = { name: item.name, color: item.color, pinnedToBar: item.pinnedToBar, createdAt: item.createdAt }
    if (g.open) {
      ws = reconcileOpenGroup(ws, g.id, item.tabs, item.splitRatios)
      groups = groups.map((x) => (x.id === g.id ? { ...x, ...fields } : x))
    } else {
      groups = groups.map((x) =>
        x.id === g.id
          ? { ...x, ...fields, savedTabs: matchTabs(x.savedTabs, item.tabs), savedSplitRatios: { ...item.splitRatios } }
          : x
      )
    }
  }
  if (ws === state.ws && groups === state.groups) return { state, synced: nextSynced }
  return { state: { ws, groups }, synced: nextSynced }
}

function stripGroup(t: Tab): Tab {
  const { groupId: _g, ...rest } = t
  void _g
  return rest
}
