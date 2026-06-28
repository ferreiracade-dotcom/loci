import { safeStorage } from 'electron'
import { extname, join } from 'path'
import { copyFileSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs'
import { getDataDir } from '../db/connection'
import { DEFAULT_THEME } from '../../shared/ipc'
import type { AiMode, PublicConfig, RateCard, ThemePalette } from '../../shared/ipc'

/** Full config persisted to %APPDATA%/Loci/config.json (includes secrets). */
export interface LociConfig {
  setupComplete: boolean
  vaultPath: string | null
  pdfSourcePath: string | null
  backupPath: string | null
  /** Optional local folder searched first when opening a book (fast local reads). */
  primaryLibraryPath: string | null
  scriptureTranslation: string
  aiMode: AiMode
  rateCard: RateCard
  theme: ThemePalette
  welcomeBackground: string | null
  /** base64 of the safeStorage-encrypted API key; never sent to the renderer. */
  apiKeyEncrypted: string | null
  /** safeStorage-encrypted API.Bible key (NKJV/NASB etc.); never sent to the renderer. */
  apiBibleKeyEncrypted: string | null
  /** safeStorage-encrypted Crossway ESV key; never sent to the renderer. */
  esvKeyEncrypted: string | null
}

const defaults: LociConfig = {
  setupComplete: false,
  vaultPath: null,
  pdfSourcePath: null,
  backupPath: null,
  primaryLibraryPath: null,
  scriptureTranslation: 'BSB',
  aiMode: 'copy-api',
  rateCard: { sonnetInput: 3, sonnetOutput: 15, haikuInput: 0.8, haikuOutput: 4 },
  theme: DEFAULT_THEME,
  welcomeBackground: null,
  apiKeyEncrypted: null,
  apiBibleKeyEncrypted: null,
  esvKeyEncrypted: null
}

function configPath(): string {
  return join(getDataDir(), 'config.json')
}

/**
 * Local working copy of the notes/highlights vault — always available offline, mirrored to
 * the Drive vault (config.vaultPath) by the sync routine. Notes/highlights are read and
 * written here first (local-first), the same way a book prefers its local PDF over Drive.
 */
export function localVaultDir(): string {
  return join(getDataDir(), 'vault')
}

export function readConfig(): LociConfig {
  const p = configPath()
  if (!existsSync(p)) return { ...defaults }
  try {
    const parsed = JSON.parse(readFileSync(p, 'utf-8')) as Partial<LociConfig> & {
      accentColor?: string
    }
    const theme: ThemePalette = {
      ...DEFAULT_THEME,
      ...(parsed.theme ?? {}),
      // Migrate a legacy single accent colour into the palette.
      ...(parsed.accentColor ? { accent: parsed.accentColor } : {})
    }
    return {
      ...defaults,
      ...parsed,
      rateCard: { ...defaults.rateCard, ...parsed.rateCard },
      theme
    }
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
  const { apiKeyEncrypted, apiBibleKeyEncrypted, esvKeyEncrypted, ...rest } = cfg
  return {
    ...rest,
    hasApiKey: !!apiKeyEncrypted,
    hasApiBibleKey: !!apiBibleKeyEncrypted,
    hasEsvKey: !!esvKeyEncrypted
  }
}

type SecretField = 'apiKeyEncrypted' | 'apiBibleKeyEncrypted' | 'esvKeyEncrypted'

/** Encrypt and store a secret (or clear it when blank). Reused by every API key. */
function setSecret(field: SecretField, key: string): boolean {
  const trimmed = key.trim()
  if (!trimmed) {
    writeConfig({ [field]: null })
    return true
  }
  if (safeStorage.isEncryptionAvailable()) {
    writeConfig({ [field]: safeStorage.encryptString(trimmed).toString('base64') })
  } else {
    // Fallback when OS encryption is unavailable (documented as weaker).
    writeConfig({ [field]: Buffer.from(trimmed, 'utf-8').toString('base64') })
  }
  return true
}

/** Decrypt a stored secret for use inside the main process only. */
function getSecret(field: SecretField): string | null {
  const enc = readConfig()[field]
  if (!enc) return null
  try {
    const buf = Buffer.from(enc, 'base64')
    return safeStorage.isEncryptionAvailable()
      ? safeStorage.decryptString(buf)
      : buf.toString('utf-8')
  } catch {
    return null
  }
}

export function setApiKey(key: string): boolean {
  return setSecret('apiKeyEncrypted', key)
}
export function hasApiKey(): boolean {
  return !!readConfig().apiKeyEncrypted
}

export function setApiBibleKey(key: string): boolean {
  return setSecret('apiBibleKeyEncrypted', key)
}
export function hasApiBibleKey(): boolean {
  return !!readConfig().apiBibleKeyEncrypted
}
export function getApiBibleKey(): string | null {
  return getSecret('apiBibleKeyEncrypted')
}

export function setEsvKey(key: string): boolean {
  return setSecret('esvKeyEncrypted', key)
}
export function hasEsvKey(): boolean {
  return !!readConfig().esvKeyEncrypted
}
export function getEsvKey(): string | null {
  return getSecret('esvKeyEncrypted')
}

function backgroundsDir(): string {
  const dir = join(getDataDir(), 'backgrounds')
  mkdirSync(dir, { recursive: true })
  return dir
}

/** Copy a chosen image into app-data and set it as the unlock background. */
export function setWelcomeBackgroundFromFile(srcPath: string): LociConfig {
  const ext = extname(srcPath).toLowerCase() || '.jpg'
  const dest = join(backgroundsDir(), `welcome${ext}`)
  const current = readConfig().welcomeBackground
  if (current && current !== dest && existsSync(current)) {
    try {
      unlinkSync(current)
    } catch {
      /* best effort */
    }
  }
  copyFileSync(srcPath, dest)
  return writeConfig({ welcomeBackground: dest })
}

export function resetWelcomeBackground(): LociConfig {
  const current = readConfig().welcomeBackground
  if (current && existsSync(current)) {
    try {
      unlinkSync(current)
    } catch {
      /* best effort */
    }
  }
  return writeConfig({ welcomeBackground: null })
}

export function getWelcomeBackgroundDataUrl(): string | null {
  const p = readConfig().welcomeBackground
  if (!p || !existsSync(p)) return null
  const buf = readFileSync(p)
  const ext = extname(p).toLowerCase()
  const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg'
  return `data:${mime};base64,${buf.toString('base64')}`
}
