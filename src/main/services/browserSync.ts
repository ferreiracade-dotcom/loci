import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'fs'
import { join } from 'path'
import {
  DEVICE_STALE_MS,
  applyChanges,
  compactOwn,
  liveItems,
  maxClock,
  mergeRecords,
  nextStamp,
  recordItem,
  stableJson
} from '../../shared/sync'
import type {
  DeviceTabs,
  RemoteTab,
  SyncChanges,
  SyncItem,
  SyncKind,
  SyncRecord,
  SyncSnapshot
} from '../../shared/sync'

/**
 * Chrome-style sync of bookmarks and saved tab groups between devices sharing one vault.
 *
 * Every device writes only its own folder, `app/sync/<deviceId>/`, so the vault's whole-file,
 * newer-wins mirror can never make one device's write overwrite another's. Each file holds the
 * device's records (one per item it last changed, or a tombstone for one it deleted); the view
 * is the union over every device folder, the record with the highest (clock, device id) winning
 * per item. `open-tabs.json` holds the device's open tabs for "Tabs from other devices".
 */

export interface DeviceInfo {
  deviceId: string
  deviceName: string
}

export const SYNC_FILES: Record<SyncKind, string> = {
  bookmarks: 'bookmarks.json',
  tabGroups: 'tab-groups.json'
}

export const OPEN_TABS_FILE = 'open-tabs.json'

/** Republish open tabs at least this often, so other devices can tell this one is alive. */
const TABS_HEARTBEAT_MS = 6 * 3_600_000

/** Refuse anything absurdly large (a runaway write must not fill the vault). */
const MAX_BYTES = 8 * 1024 * 1024

/** Device folder names are generated ids; anything else in `app/sync` is ignored. */
const DEVICE_DIR = /^[A-Za-z0-9_-]{1,64}$/

interface DeviceFile {
  version: 1
  deviceId: string
  deviceName: string
  updatedAt: number
  records: SyncRecord[]
}

function isRecord(r: unknown): r is SyncRecord {
  if (!r || typeof r !== 'object') return false
  const x = r as SyncRecord
  return typeof x.id === 'string' && !!x.id && typeof x.deviceId === 'string' && Number.isFinite(x.updatedAt)
}

function writeAtomic(p: string, text: string): void {
  if (text.length > MAX_BYTES) throw new Error('Sync data too large')
  const tmp = `${p}.tmp`
  writeFileSync(tmp, text, 'utf8')
  renameSync(tmp, p)
}

/** Move an unreadable file aside so the next write cannot destroy what may be recoverable. */
function setAside(p: string, now: number): void {
  try {
    renameSync(p, `${p}.corrupt-${now}`)
  } catch {
    /* best effort */
  }
}

/** A legacy (pre-sync) tab: its location is every field but the strip/history bookkeeping. */
function legacyTabEntry(t: Record<string, unknown>): { location: Record<string, unknown>; splitId?: string } {
  const { id: _i, order: _o, pinned: _p, splitId, groupId: _g, history: _h, historyIndex: _x, ...location } = t
  void [_i, _o, _p, _g, _h, _x]
  return typeof splitId === 'string' ? { location, splitId } : { location }
}

/** The legacy `bookmarks.json` as items. */
export function legacyBookmarkItems(json: unknown): SyncItem[] {
  const raw = (json ?? {}) as { bookmarks?: unknown; folders?: unknown }
  const out: SyncItem[] = []
  if (Array.isArray(raw.folders)) {
    for (const f of raw.folders as Record<string, unknown>[]) {
      if (!f || typeof f.id !== 'string' || typeof f.title !== 'string') continue
      out.push({ ...f, id: f.id, type: 'folder' })
    }
  }
  if (Array.isArray(raw.bookmarks)) {
    for (const m of raw.bookmarks as Record<string, unknown>[]) {
      if (!m || typeof m.id !== 'string' || typeof m.title !== 'string' || !m.location) continue
      out.push({ ...m, id: m.id, type: 'bookmark' })
    }
  }
  return out
}

/** The legacy `tab-groups.json` as synced group items (open/collapsed and tab history dropped). */
export function legacyGroupItems(json: unknown): SyncItem[] {
  const raw = (json ?? {}) as { groups?: unknown }
  if (!Array.isArray(raw.groups)) return []
  const out: SyncItem[] = []
  ;(raw.groups as Record<string, unknown>[]).forEach((g, index) => {
    if (!g || typeof g.id !== 'string') return
    const saved = Array.isArray(g.savedTabs)
      ? (g.savedTabs as Record<string, unknown>[]).filter((t) => t && typeof t.kind === 'string')
      : []
    saved.sort((a, b) => Number(a.order ?? 0) - Number(b.order ?? 0))
    const tabs = saved.map(legacyTabEntry)
    // Only complete split pairs keep their pairing.
    const counts = new Map<string, number>()
    for (const t of tabs) if (t.splitId) counts.set(t.splitId, (counts.get(t.splitId) ?? 0) + 1)
    for (const t of tabs) if (t.splitId && counts.get(t.splitId) !== 2) delete t.splitId
    const ratios: Record<string, number> = {}
    const savedRatios = (g.savedSplitRatios ?? {}) as Record<string, unknown>
    for (const [k, v] of Object.entries(savedRatios)) if (typeof v === 'number' && counts.get(k) === 2) ratios[k] = v
    out.push({
      id: g.id,
      name: typeof g.name === 'string' ? g.name : '',
      color: typeof g.color === 'string' ? g.color : 'grey',
      pinnedToBar: !!g.pinnedToBar,
      createdAt: index,
      tabs,
      splitRatios: ratios
    })
  })
  return out
}

export class BrowserSync {
  constructor(
    private readonly appDir: string,
    private readonly device: () => DeviceInfo,
    private readonly now: () => number = () => Date.now()
  ) {}

  syncDir(): string {
    return join(this.appDir, 'sync')
  }

  ownDir(): string {
    return join(this.syncDir(), this.device().deviceId)
  }

  /** Device folders present (own included). */
  private deviceDirs(): string[] {
    try {
      return readdirSync(this.syncDir()).filter((n) => DEVICE_DIR.test(n))
    } catch {
      return []
    }
  }

  /**
   * One device file's records. An unreadable file is null: our own is moved aside first (the next
   * write would otherwise destroy it), a peer's is left alone (its owner will rewrite it, or the
   * next mirror pass will finish copying it).
   */
  private readFile(p: string, own: boolean): DeviceFile | null {
    if (!existsSync(p)) return null
    let text: string
    try {
      text = readFileSync(p, 'utf8')
    } catch {
      return null
    }
    try {
      const raw = JSON.parse(text) as Partial<DeviceFile>
      if (!raw || typeof raw !== 'object' || !Array.isArray(raw.records)) throw new Error('bad shape')
      return {
        version: 1,
        deviceId: typeof raw.deviceId === 'string' ? raw.deviceId : '',
        deviceName: typeof raw.deviceName === 'string' ? raw.deviceName : '',
        updatedAt: Number(raw.updatedAt) || 0,
        records: raw.records.filter(isRecord)
      }
    } catch {
      if (own) setAside(p, this.now())
      return null
    }
  }

  private read(kind: SyncKind): { own: SyncRecord[]; peers: SyncRecord[][] } {
    const me = this.device().deviceId
    let own: SyncRecord[] = []
    const peers: SyncRecord[][] = []
    for (const dir of this.deviceDirs()) {
      const isOwn = dir === me
      const f = this.readFile(join(this.syncDir(), dir, SYNC_FILES[kind]), isOwn)
      if (!f) continue
      if (isOwn) own = f.records
      else peers.push(f.records)
    }
    return { own, peers }
  }

  private writeOwn(kind: SyncKind, records: SyncRecord[]): void {
    const { deviceId, deviceName } = this.device()
    mkdirSync(this.ownDir(), { recursive: true })
    const sorted = [...records].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    const file: DeviceFile = { version: 1, deviceId, deviceName, updatedAt: this.now(), records: sorted }
    writeAtomic(join(this.ownDir(), SYNC_FILES[kind]), JSON.stringify(file))
  }

  /** The winning record per id across every device. */
  merged(kind: SyncKind): Map<string, SyncRecord> {
    const { own, peers } = this.read(kind)
    return mergeRecords([own, ...peers])
  }

  items(kind: SyncKind): SyncItem[] {
    return liveItems(this.merged(kind))
  }

  /** Record this device's changes (new clock values, this device's folder only). */
  put(kind: SyncKind, changes: SyncChanges): void {
    if (!changes || !Array.isArray(changes.upserts) || !Array.isArray(changes.deletes)) {
      throw new Error('Invalid sync changes')
    }
    if (changes.upserts.length === 0 && changes.deletes.length === 0) return
    const { own, peers } = this.read(kind)
    let clock = maxClock([own, ...peers])
    const stamp = (): number => (clock = nextStamp(this.now(), clock))
    const next = applyChanges(own, changes, this.device().deviceId, stamp)
    this.writeOwn(kind, compactOwn(next, mergeRecords([next, ...peers]), this.now()))
  }

  /** Drop own records other devices have superseded and expired tombstones. True if rewritten. */
  compact(kind: SyncKind): boolean {
    const { own, peers } = this.read(kind)
    if (own.length === 0) return false
    const kept = compactOwn(own, mergeRecords([own, ...peers]), this.now())
    if (kept.length === own.length) return false
    this.writeOwn(kind, kept)
    return true
  }

  /**
   * Import a pre-sync `app/<file>` into this device's records, once per version of that file:
   * `marks[kind]` is the mtime last imported. Records are stamped with the file's mtime, so any
   * edit made since (on any device) still wins, and two devices importing the same file write
   * identical records. The file is renamed to `<file>.migrated` afterwards. Returns the new marks.
   */
  importLegacy(marks: Partial<Record<SyncKind, number>>): Partial<Record<SyncKind, number>> {
    const out = { ...marks }
    for (const kind of Object.keys(SYNC_FILES) as SyncKind[]) {
      const p = join(this.appDir, SYNC_FILES[kind])
      if (!existsSync(p)) continue
      let mtime: number
      try {
        mtime = Math.floor(statSync(p).mtimeMs)
      } catch {
        continue
      }
      if (mtime <= (marks[kind] ?? 0)) continue
      let parsed: unknown
      try {
        parsed = JSON.parse(readFileSync(p, 'utf8'))
      } catch {
        setAside(p, this.now())
        continue
      }
      const items = kind === 'bookmarks' ? legacyBookmarkItems(parsed) : legacyGroupItems(parsed)
      const stampAt = Math.min(mtime, this.now())
      const { own, peers } = this.read(kind)
      const merged = mergeRecords([own, ...peers])
      const fresh = items.filter((item) => {
        const w = merged.get(item.id)
        if (!w) return true
        if (w.updatedAt >= stampAt) return false
        return w.deleted || stableJson(recordItem(w)) !== stableJson(item)
      })
      if (fresh.length) {
        const next = applyChanges(own, { upserts: fresh, deletes: [] }, this.device().deviceId, () => stampAt)
        this.writeOwn(kind, next)
      }
      try {
        renameSync(p, `${p}.migrated`)
      } catch {
        /* best effort: the mark still stops a second import */
      }
      out[kind] = mtime
    }
    return out
  }

  /** The pre-sync groups file (kept as `.migrated`), for seeding local tab histories. */
  legacyTabGroups(): string | null {
    const p = join(this.appDir, `${SYNC_FILES.tabGroups}.migrated`)
    try {
      return existsSync(p) ? readFileSync(p, 'utf8') : null
    } catch {
      return null
    }
  }

  /** Publish this device's open tabs (skipped when unchanged and recently published). */
  publishTabs(tabs: RemoteTab[]): boolean {
    if (!Array.isArray(tabs)) throw new Error('Invalid tabs')
    const { deviceId, deviceName } = this.device()
    const p = join(this.ownDir(), OPEN_TABS_FILE)
    const clean = tabs
      .filter((t) => t && typeof t.title === 'string' && t.location && typeof t.location.kind === 'string')
      .slice(0, 500)
    const prev = this.readTabs(p)
    const now = this.now()
    if (
      prev &&
      prev.deviceName === deviceName &&
      stableJson(prev.tabs) === stableJson(clean) &&
      now - prev.updatedAt < TABS_HEARTBEAT_MS
    ) {
      return false
    }
    mkdirSync(this.ownDir(), { recursive: true })
    const file: DeviceTabs & { version: 1 } = { version: 1, deviceId, deviceName, updatedAt: now, tabs: clean }
    writeAtomic(p, JSON.stringify(file))
    return true
  }

  private readTabs(p: string): DeviceTabs | null {
    try {
      if (!existsSync(p)) return null
      const raw = JSON.parse(readFileSync(p, 'utf8')) as Partial<DeviceTabs>
      if (!raw || !Array.isArray(raw.tabs)) return null
      return {
        deviceId: typeof raw.deviceId === 'string' ? raw.deviceId : '',
        deviceName: typeof raw.deviceName === 'string' ? raw.deviceName : '',
        updatedAt: Number(raw.updatedAt) || 0,
        tabs: raw.tabs.filter(
          (t): t is RemoteTab => !!t && typeof t.title === 'string' && !!t.location && typeof t.location.kind === 'string'
        )
      }
    } catch {
      return null
    }
  }

  /** Other devices' open tabs, freshest first; devices not seen for 30 days are left out. */
  devices(): DeviceTabs[] {
    const me = this.device().deviceId
    const now = this.now()
    const out: DeviceTabs[] = []
    for (const dir of this.deviceDirs()) {
      if (dir === me) continue
      const t = this.readTabs(join(this.syncDir(), dir, OPEN_TABS_FILE))
      if (!t || now - t.updatedAt > DEVICE_STALE_MS) continue
      out.push({ ...t, deviceId: dir, deviceName: t.deviceName.trim() || 'Another computer' })
    }
    return out.sort((a, b) => b.updatedAt - a.updatedAt)
  }

  snapshot(withLegacy = false): SyncSnapshot {
    const { deviceId, deviceName } = this.device()
    return {
      deviceId,
      deviceName,
      bookmarks: this.items('bookmarks'),
      tabGroups: this.items('tabGroups'),
      devices: this.devices(),
      legacyTabGroups: withLegacy ? this.legacyTabGroups() : null
    }
  }
}
