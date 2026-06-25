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
  scriptureTranslation: string
  aiMode: AiMode
  rateCard: RateCard
  theme: ThemePalette
  welcomeBackground: string | null
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
  theme: DEFAULT_THEME,
  welcomeBackground: null,
  apiKeyEncrypted: null
}

function configPath(): string {
  return join(getDataDir(), 'config.json')
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
