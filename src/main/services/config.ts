import { safeStorage } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { getDataDir } from '../db/connection'
import type { AiMode, PublicConfig, RateCard } from '../../shared/ipc'

/** Full config persisted to %APPDATA%/Loci/config.json (includes secrets). */
export interface LociConfig {
  setupComplete: boolean
  vaultPath: string | null
  pdfSourcePath: string | null
  backupPath: string | null
  scriptureTranslation: string
  aiMode: AiMode
  rateCard: RateCard
  /** base64 of the safeStorage-encrypted API key; never sent to the renderer. */
  apiKeyEncrypted: string | null
}

const defaults: LociConfig = {
  setupComplete: false,
  vaultPath: null,
  pdfSourcePath: null,
  backupPath: null,
  scriptureTranslation: 'WEB',
  aiMode: 'copy-api',
  rateCard: { sonnetInput: 3, sonnetOutput: 15, haikuInput: 0.8, haikuOutput: 4 },
  apiKeyEncrypted: null
}

function configPath(): string {
  return join(getDataDir(), 'config.json')
}

export function readConfig(): LociConfig {
  const p = configPath()
  if (!existsSync(p)) return { ...defaults }
  try {
    const parsed = JSON.parse(readFileSync(p, 'utf-8')) as Partial<LociConfig>
    return { ...defaults, ...parsed, rateCard: { ...defaults.rateCard, ...parsed.rateCard } }
  } catch {
    return { ...defaults }
  }
}

export function writeConfig(patch: Partial<LociConfig>): LociConfig {
  const next: LociConfig = { ...readConfig(), ...patch }
  writeFileSync(configPath(), JSON.stringify(next, null, 2), 'utf-8')
  return next
}

/** Strip secrets before handing config to the renderer. */
export function toPublicConfig(cfg: LociConfig = readConfig()): PublicConfig {
  const { apiKeyEncrypted, ...rest } = cfg
  return { ...rest, hasApiKey: !!apiKeyEncrypted }
}

export function setApiKey(key: string): boolean {
  const trimmed = key.trim()
  if (!trimmed) {
    writeConfig({ apiKeyEncrypted: null })
    return true
  }
  if (safeStorage.isEncryptionAvailable()) {
    const enc = safeStorage.encryptString(trimmed)
    writeConfig({ apiKeyEncrypted: enc.toString('base64') })
  } else {
    // Fallback when OS encryption is unavailable (documented as weaker).
    writeConfig({ apiKeyEncrypted: Buffer.from(trimmed, 'utf-8').toString('base64') })
  }
  return true
}

export function hasApiKey(): boolean {
  return !!readConfig().apiKeyEncrypted
}
