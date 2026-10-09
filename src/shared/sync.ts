// Multi-device sync of bookmarks and saved tab groups: the record model and its merge rules.
// Shared by main (which stores records per device) and the renderer (which diffs its state into
// changes). Pure: no Node or DOM APIs.

/** What is synced as records. */
export type SyncKind = 'bookmarks' | 'tabGroups'

/** An item as the renderer sees it: an id plus its own fields. */
export type SyncItem = { id: string } & Record<string, unknown>

/**
 * One item's state as last written by one device. `updatedAt` is a Lamport-style clock (never
 * lower than anything the writer had seen, plus one), so a device whose clock runs slow still
 * orders its edits after the ones it saw. `deleted` marks a tombstone.
 */
export interface SyncRecord {
  id: string
  updatedAt: number
  deviceId: string
  deleted?: boolean
  [field: string]: unknown
}

/** What the renderer asks main to record: items it changed, and ids it removed. */
export interface SyncChanges {
  upserts: SyncItem[]
  deletes: string[]
}

/** One open tab, as published for "Tabs from other devices". */
export interface RemoteTab {
  title: string
  /** The tab's location (a TabContent). */
  location: { kind: string } & Record<string, unknown>
  groupName?: string
  groupColor?: string
}

/** A device's published open tabs. */
export interface DeviceTabs {
  deviceId: string
  deviceName: string
  updatedAt: number
  tabs: RemoteTab[]
}

/** What main pushes to the renderer: the merged view over every device's records. */
export interface SyncSnapshot {
  deviceId: string
  deviceName: string
  bookmarks: SyncItem[]
  tabGroups: SyncItem[]
  /** Other devices' open tabs, most recently updated first (stale devices left out). */
  devices: DeviceTabs[]
  /** The pre-sync tab-groups file (with tab histories), for seeding this device's local state. */
  legacyTabGroups: string | null
}

export const META_FIELDS = ['updatedAt', 'deviceId', 'deleted'] as const

/** Tombstones are kept this long, then pruned. */
export const TOMBSTONE_TTL_MS = 90 * 86_400_000

/** Devices whose open tabs were last published longer ago than this are hidden. */
export const DEVICE_STALE_MS = 30 * 86_400_000

/** True when `a` beats `b`: later clock, ties broken by device id so every device agrees. */
export function recordWins(a: SyncRecord, b: SyncRecord): boolean {
  if (a.updatedAt !== b.updatedAt) return a.updatedAt > b.updatedAt
  if (a.deviceId !== b.deviceId) return a.deviceId > b.deviceId
  // Same writer, same clock: prefer the tombstone, then the larger payload (deterministic).
  if (!!a.deleted !== !!b.deleted) return !!a.deleted
  return stableJson(a) > stableJson(b)
}

/** Per id, the winning record across every device's list. */
export function mergeRecords(lists: SyncRecord[][]): Map<string, SyncRecord> {
  const out = new Map<string, SyncRecord>()
  for (const list of lists) {
    for (const r of list) {
      const cur = out.get(r.id)
      if (!cur || recordWins(r, cur)) out.set(r.id, r)
    }
  }
  return out
}

/** The item a record carries (its fields without the sync metadata). */
export function recordItem(r: SyncRecord): SyncItem {
  const item: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(r)) {
    if (k === 'updatedAt' || k === 'deviceId' || k === 'deleted') continue
    item[k] = v
  }
  return item as SyncItem
}

/** The live items of a merged map (tombstones hidden), in id order for a stable result. */
export function liveItems(merged: Map<string, SyncRecord>): SyncItem[] {
  return [...merged.values()]
    .filter((r) => !r.deleted)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map(recordItem)
}

/** The next clock value: wall time, but never at or below what has been seen. */
export function nextStamp(now: number, maxSeen: number): number {
  return Math.max(Math.floor(now), Math.floor(maxSeen) + 1)
}

/** Highest clock in some lists of records (0 when empty). */
export function maxClock(lists: SyncRecord[][]): number {
  let m = 0
  for (const l of lists) for (const r of l) if (r.updatedAt > m) m = r.updatedAt
  return m
}

/**
 * Apply changes to one device's own records, each stamped with `stamp()` (called per record so
 * every write gets its own clock tick). Upserts replace the device's previous record for the id;
 * deletes leave a tombstone.
 */
export function applyChanges(
  own: SyncRecord[],
  changes: SyncChanges,
  deviceId: string,
  stamp: () => number
): SyncRecord[] {
  const byId = new Map(own.map((r) => [r.id, r]))
  for (const item of changes.upserts) {
    if (!item || typeof item.id !== 'string' || !item.id) continue
    const rec: SyncRecord = { ...stripMeta(item), id: item.id, updatedAt: stamp(), deviceId }
    byId.set(item.id, rec)
  }
  for (const id of changes.deletes) {
    if (typeof id !== 'string' || !id) continue
    byId.set(id, { id, updatedAt: stamp(), deviceId, deleted: true })
  }
  return [...byId.values()]
}

function stripMeta(item: SyncItem): SyncItem {
  const out = { ...item } as Record<string, unknown>
  for (const k of META_FIELDS) delete out[k]
  return out as SyncItem
}

/**
 * Tidy one device's own records before writing them: drop tombstones older than the TTL, and
 * drop records another device has superseded (that device's newer record carries the item now,
 * so an old live record here can't resurrect an item once the newer tombstone is pruned).
 */
export function compactOwn(
  own: SyncRecord[],
  merged: Map<string, SyncRecord>,
  now: number,
  ttlMs = TOMBSTONE_TTL_MS
): SyncRecord[] {
  return own.filter((r) => {
    if (r.deleted && now - r.updatedAt > ttlMs) return false
    const win = merged.get(r.id)
    return !win || !recordWins(win, r)
  })
}

/** Remove tombstones older than the TTL from a merged view (they hide nothing anymore). */
export function pruneTombstones(records: SyncRecord[], now: number, ttlMs = TOMBSTONE_TTL_MS): SyncRecord[] {
  return records.filter((r) => !(r.deleted && now - r.updatedAt > ttlMs))
}

/** Items whose content differs between two snapshots of a list, as changes. */
export function diffItems(prev: SyncItem[], next: SyncItem[]): SyncChanges {
  const before = new Map(prev.map((i) => [i.id, stableJson(i)]))
  const nextIds = new Set<string>()
  const upserts: SyncItem[] = []
  for (const item of next) {
    nextIds.add(item.id)
    if (before.get(item.id) !== stableJson(item)) upserts.push(item)
  }
  const deletes = prev.filter((i) => !nextIds.has(i.id)).map((i) => i.id)
  return { upserts, deletes }
}

export function isEmptyChanges(c: SyncChanges): boolean {
  return c.upserts.length === 0 && c.deletes.length === 0
}

/** JSON with object keys sorted at every depth and undefined fields left out. */
export function stableJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map((x) => (x === undefined ? 'null' : stableJson(x))).join(',')}]`
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    const parts = Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableJson(o[k])}`)
    return `{${parts.join(',')}}`
  }
  return JSON.stringify(v) ?? 'null'
}
