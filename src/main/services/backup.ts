import { cpSync, existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { readConfig } from './config'

/**
 * Copy the entire vault to a single snapshot in the local backup folder, overwritten
 * each time (spec §2). This gives three copies at rest: working vault, Drive cloud
 * copy, and this local snapshot — so one bad sync or deletion can't wipe everything.
 */
export function backupSnapshot(): boolean {
  const cfg = readConfig()
  if (!cfg.vaultPath || !cfg.backupPath) return false
  if (!existsSync(cfg.vaultPath)) return false
  try {
    mkdirSync(cfg.backupPath, { recursive: true })
    const dest = join(cfg.backupPath, 'vault-snapshot')
    const tmp = join(cfg.backupPath, 'vault-snapshot.tmp')
    // Build the new snapshot alongside the old one and swap it in only once the copy has fully
    // succeeded. Deleting the old snapshot first (as this used to) meant any mid-copy failure —
    // Drive going offline, disk full, the app being killed — left no local snapshot at all, exactly
    // the safety copy the user is relying on.
    rmSync(tmp, { recursive: true, force: true })
    cpSync(cfg.vaultPath, tmp, { recursive: true })
    rmSync(dest, { recursive: true, force: true })
    renameSync(tmp, dest)
    writeFileSync(join(cfg.backupPath, 'last-backup.txt'), new Date().toISOString(), 'utf-8')
    return true
  } catch {
    return false
  }
}
