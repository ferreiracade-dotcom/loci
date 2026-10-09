import { join } from 'path'
import { deviceIdentity, localVaultDir, readConfig, writeConfig } from './config'
import { BrowserSync } from './browserSync'
import { stableJson } from '../../shared/sync'
import type { RemoteTab, SyncChanges, SyncKind, SyncSnapshot } from '../../shared/sync'

/**
 * Bookmarks (with their folders), saved tab groups and this device's open tabs, synced through
 * the vault's per-device folders (see browserSync.ts). This module binds the sync store to the
 * app: the local vault, this installation's device identity, and pushes to the renderer.
 */

export function vaultAppDir(): string {
  return join(localVaultDir(), 'app')
}

let store: BrowserSync | null = null
let storeDir: string | null = null

function sync(): BrowserSync {
  const dir = vaultAppDir()
  if (!store || storeDir !== dir) {
    store = new BrowserSync(dir, deviceIdentity)
    storeDir = dir
  }
  return store
}

const KINDS: SyncKind[] = ['bookmarks', 'tabGroups']

function assertKind(kind: SyncKind): void {
  if (!KINDS.includes(kind)) throw new Error(`Unknown sync kind: ${String(kind)}`)
}

/** Import pre-sync files once per version of them (marks kept in this device's config). */
function importLegacy(): void {
  const marks = readConfig().legacyImported ?? {}
  const next = sync().importLegacy(marks)
  if (stableJson(next) !== stableJson(marks)) writeConfig({ legacyImported: next })
}

let lastPushed: string | null = null
let push: ((s: SyncSnapshot) => void) | null = null
let afterWrite: (() => void) | null = null

function fingerprint(s: SyncSnapshot): string {
  return stableJson({ b: s.bookmarks, g: s.tabGroups, d: s.devices, n: s.deviceName })
}

/** Where merged changes go (the window's renderer). */
export function setSyncPush(fn: ((s: SyncSnapshot) => void) | null): void {
  push = fn
}

/** Called after this device writes its records (to schedule a quick Drive copy). */
export function setAfterSyncWrite(fn: (() => void) | null): void {
  afterWrite = fn
}

/** The renderer's first read: imports legacy files if needed, then the merged state. */
export function syncInit(): SyncSnapshot {
  try {
    importLegacy()
  } catch (e) {
    console.error('[sync] legacy import failed', e)
  }
  const s = sync().snapshot(true)
  lastPushed = fingerprint(s)
  return s
}

/** Record changes made on this device. */
export function syncPut(kind: SyncKind, changes: SyncChanges): void {
  assertKind(kind)
  sync().put(kind, changes)
  afterWrite?.()
}

let lastTabs: RemoteTab[] | null = null

/** Publish this device's open tabs for the other devices' History page. */
export function syncPublishTabs(tabs: RemoteTab[]): void {
  lastTabs = tabs
  if (sync().publishTabs(tabs)) afterWrite?.()
}

/**
 * Re-read every device folder (after a mirror pass, or on focus) and push the merged state to
 * the renderer when it changed.
 */
export function refreshSync(): void {
  if (!readConfig().setupComplete) return
  try {
    importLegacy()
    let wrote = false
    for (const k of KINDS) wrote = sync().compact(k) || wrote
    if (wrote) afterWrite?.()
  } catch (e) {
    console.error('[sync] refresh failed', e)
  }
  const s = sync().snapshot(false)
  const fp = fingerprint(s)
  if (fp === lastPushed) return
  lastPushed = fp
  push?.(s)
}

/** The device name changed: republish so other devices show the new one. */
export function deviceRenamed(): void {
  lastPushed = null
  if (lastTabs) syncPublishTabs(lastTabs)
}
