import { existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { readConfig } from './config'

/** Vault subfolder skeleton per the build spec (§2 Storage Architecture). */
const VAULT_DIRS = [
  'notes',
  'notes/standalone',
  'notes/Images',
  'media/images',
  'pages/authors',
  'pages/denominations',
  'pages/topics',
  'highlights',
  'pdfs/cache'
]

export function scaffoldVault(vaultPath: string): void {
  for (const dir of VAULT_DIRS) {
    mkdirSync(join(vaultPath, dir), { recursive: true })
  }
}

export function vaultExists(): boolean {
  const { vaultPath } = readConfig()
  return vaultPath ? existsSync(vaultPath) : false
}
