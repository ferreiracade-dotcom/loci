import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, utimesSync } from 'fs'
import { dirname, join } from 'path'
import { deviceIdentity, localVaultDir, readConfig } from './config'

// Notes + highlights (and the `app` folder: bookmarks, saved tab groups) are mirrored between the local working copy and the Drive vault. PDFs,
// covers and other large assets are NOT synced here — they stay on Drive (streamed) and use
// the library's own local-first resolution.
const SUBDIRS = ['notes', 'highlights', 'commentaries', 'dogmatics', 'app']

/** Per-device sync folders under `app/` (see browserSync.ts); mirrored by `syncDeviceFolders`. */
const DEVICE_SYNC_DIR = 'sync'

/** Copy newer files from src into dst (recursive). Never deletes; preserves mtime so a
 *  round-trip doesn't ping-pong. ~1s slack absorbs coarse cloud-filesystem timestamps.
 *  `skip` names top-level entries of src to leave alone. */
function mirrorDir(src: string, dst: string, skip: string[] = []): void {
  if (!existsSync(src)) return
  let entries: string[]
  try {
    entries = readdirSync(src)
  } catch {
    return
  }
  for (const name of entries) {
    if (skip.includes(name)) continue
    const s = join(src, name)
    const d = join(dst, name)
    let st: ReturnType<typeof statSync>
    try {
      st = statSync(s)
    } catch {
      continue
    }
    if (st.isDirectory()) {
      mirrorDir(s, d)
      continue
    }
    let copy = true
    if (existsSync(d)) {
      try {
        copy = st.mtimeMs > statSync(d).mtimeMs + 1000
      } catch {
        copy = true
      }
    }
    if (copy) {
      try {
        mkdirSync(dirname(d), { recursive: true })
        copyFileSync(s, d)
        utimesSync(d, st.atime, st.mtime) // keep timestamps equal so it won't re-copy
      } catch {
        /* best effort — a locked/streamed file just retries next sync */
      }
    }
  }
}

/**
 * Two-way mirror of notes + highlights between the local vault (the working copy used by the
 * app, always available offline) and the Drive vault (synced backup / other devices).
 * Copy-only, newer-mtime-wins. A no-op when Drive isn't reachable, so offline edits stay
 * local and get backed up the next time Drive returns.
 */
export function syncVault(): void {
  const drive = readConfig().vaultPath
  if (!drive || !existsSync(drive)) return
  const local = localVaultDir()
  for (const sub of SUBDIRS) {
    const skip = sub === 'app' ? [DEVICE_SYNC_DIR] : []
    mirrorDir(join(drive, sub), join(local, sub), skip) // restore Drive -> local (seed / other devices)
    mirrorDir(join(local, sub), join(drive, sub), skip) // back up local -> Drive
  }
  mirrorDeviceFolders(drive, local)
  notifySynced()
}

/** Make `dst` an exact copy of `src` when they differ (size, mtime beyond slack, or content). */
function copyIfDifferent(s: string, d: string): void {
  let st: ReturnType<typeof statSync>
  try {
    st = statSync(s)
  } catch {
    return
  }
  if (!st.isFile()) return
  if (existsSync(d)) {
    try {
      const dt = statSync(d)
      if (dt.size === st.size && dt.mtimeMs === st.mtimeMs) return
      // A filesystem that rounds timestamps never matches exactly: compare the bytes then.
      if (dt.size === st.size && Math.abs(dt.mtimeMs - st.mtimeMs) <= 2000 && readFileSync(s).equals(readFileSync(d))) {
        return
      }
    } catch {
      /* copy */
    }
  }
  try {
    mkdirSync(dirname(d), { recursive: true })
    copyFileSync(s, d)
    utimesSync(d, st.atime, st.mtime)
  } catch {
    /* best effort: a locked/streamed file just retries next sync */
  }
}

/** Copy every file of `src` (one level of device folder) over `dst` where they differ. */
function copyFolder(src: string, dst: string): void {
  let names: string[]
  try {
    names = readdirSync(src)
  } catch {
    return
  }
  for (const n of names) {
    if (n.endsWith('.tmp')) continue
    copyIfDifferent(join(src, n), join(dst, n))
  }
}

/**
 * The per-device folders `app/sync/<deviceId>/` each have exactly one writer, so no timestamp
 * guessing is needed: this device's folder goes local -> Drive, every other one Drive -> local,
 * whenever the copies differ at all. (The general mirror's one-second slack could otherwise
 * drop a second write made within a second of the last copy.)
 */
function mirrorDeviceFolders(drive: string, local: string): void {
  const me = deviceIdentity().deviceId
  const driveSync = join(drive, 'app', DEVICE_SYNC_DIR)
  const localSync = join(local, 'app', DEVICE_SYNC_DIR)
  copyFolder(join(localSync, me), join(driveSync, me))
  let peers: string[] = []
  try {
    peers = readdirSync(driveSync).filter((n) => n !== me)
  } catch {
    /* none yet */
  }
  for (const id of peers) {
    try {
      if (!statSync(join(driveSync, id)).isDirectory()) continue
    } catch {
      continue
    }
    copyFolder(join(driveSync, id), join(localSync, id))
  }
}

/**
 * Just the bookmarks/tab-groups device folders: cheap (a few small files), so it runs often,
 * shortly after a local change and whenever the window gets focus.
 */
export function syncDeviceFolders(): void {
  const drive = readConfig().vaultPath
  if (!drive || !existsSync(drive)) {
    notifySynced() // still pick up local changes (e.g. a migration) for the renderer
    return
  }
  mirrorDeviceFolders(drive, localVaultDir())
  notifySynced()
}

const syncedListeners: (() => void)[] = []

/** Run `fn` after every sync pass (used to refresh the merged bookmarks and tab groups). */
export function onVaultSynced(fn: () => void): void {
  syncedListeners.push(fn)
}

function notifySynced(): void {
  for (const fn of syncedListeners) {
    try {
      fn()
    } catch (e) {
      console.error('[sync] listener failed', e)
    }
  }
}

/**
 * Delete a vault file's Drive copy too, so an app-initiated delete isn't resurrected by the
 * next mirror pass. Best-effort: a no-op when Drive is offline.
 */
export function removeFromDrive(relPath: string): void {
  const drive = readConfig().vaultPath
  if (!drive || !existsSync(drive)) return
  const p = join(drive, relPath)
  try {
    if (existsSync(p)) unlinkSync(p)
  } catch {
    /* best effort */
  }
}
