import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { join } from 'path'
import { localVaultDir } from './config'
import type { VaultDataKey } from '../../shared/ipc'

/**
 * Browser-style data that travels with the vault: bookmarks (and their folders) and saved tab
 * groups. Each is one JSON document under the vault's `app/` folder, which the vault sync
 * mirrors to Drive like notes and highlights.
 */
const FILES: Record<VaultDataKey, string> = {
  bookmarks: 'bookmarks.json',
  tabGroups: 'tab-groups.json'
}

/** Refuse anything absurdly large (a runaway write must not fill the vault). */
const MAX_BYTES = 8 * 1024 * 1024

export function vaultAppDir(): string {
  return join(localVaultDir(), 'app')
}

function pathFor(key: VaultDataKey): string {
  const name = Object.prototype.hasOwnProperty.call(FILES, key) ? FILES[key] : undefined
  if (typeof name !== 'string') throw new Error(`Unknown vault data key: ${String(key)}`)
  return join(vaultAppDir(), name)
}

/**
 * The stored JSON for `key`, or null when it has never been written (or is unreadable). An
 * unreadable file (say, truncated by an interrupted copy) is moved aside to `<name>.corrupt-<time>`
 * first, so the next write cannot destroy what may still be recoverable from it.
 */
export function getVaultData(key: VaultDataKey): string | null {
  const p = pathFor(key)
  if (!existsSync(p)) return null
  let text: string
  try {
    text = readFileSync(p, 'utf8')
  } catch {
    return null
  }
  try {
    JSON.parse(text) // only hand back well-formed JSON
    return text
  } catch {
    try {
      renameSync(p, `${p}.corrupt-${Date.now()}`)
    } catch {
      /* best effort */
    }
    return null
  }
}

/**
 * Replace the stored JSON for `key`. Written to a temp file and renamed over the real one, so
 * a crash mid-write can never leave a truncated file (which would read as "no bookmarks").
 */
export function setVaultData(key: VaultDataKey, json: string): void {
  const p = pathFor(key)
  if (typeof json !== 'string' || json.length > MAX_BYTES) throw new Error('Invalid vault data')
  const parsed = JSON.parse(json) as unknown
  if (!parsed || typeof parsed !== 'object') throw new Error('Vault data must be a JSON object')
  mkdirSync(vaultAppDir(), { recursive: true })
  const tmp = `${p}.tmp`
  writeFileSync(tmp, json, 'utf8')
  renameSync(tmp, p)
}
