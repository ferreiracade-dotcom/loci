import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync, utimesSync } from 'fs'
import { dirname, join } from 'path'
import { localVaultDir, readConfig } from './config'

// Notes + highlights are mirrored between the local working copy and the Drive vault. PDFs,
// covers and other large assets are NOT synced here — they stay on Drive (streamed) and use
// the library's own local-first resolution.
const SUBDIRS = ['notes', 'highlights', 'commentaries']

/** Copy newer files from src into dst (recursive). Never deletes; preserves mtime so a
 *  round-trip doesn't ping-pong. ~1s slack absorbs coarse cloud-filesystem timestamps. */
function mirrorDir(src: string, dst: string): void {
  if (!existsSync(src)) return
  let entries: string[]
  try {
    entries = readdirSync(src)
  } catch {
    return
  }
  for (const name of entries) {
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
    mirrorDir(join(drive, sub), join(local, sub)) // restore Drive -> local (seed / other devices)
    mirrorDir(join(local, sub), join(drive, sub)) // back up local -> Drive
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
