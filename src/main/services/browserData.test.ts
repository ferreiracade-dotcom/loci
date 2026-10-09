import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, mkdirSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let dataDir: string

vi.mock('electron', () => ({ safeStorage: {}, app: {} }))
vi.mock('../db/connection', () => ({
  getDataDir: () => dataDir
}))

import { getVaultData, setVaultData, vaultAppDir } from './browserData'

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'loci-browser-data-'))
})

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true })
})

describe('browserData', () => {
  it('returns null before anything is written', () => {
    expect(getVaultData('bookmarks')).toBeNull()
    expect(getVaultData('tabGroups')).toBeNull()
  })

  it('round-trips each key into the vault app folder', () => {
    setVaultData('bookmarks', '{"version":1,"bookmarks":[],"folders":[]}')
    setVaultData('tabGroups', '{"version":1,"groups":[]}')
    expect(vaultAppDir()).toBe(join(dataDir, 'vault', 'app'))
    expect(JSON.parse(readFileSync(join(vaultAppDir(), 'bookmarks.json'), 'utf8')).version).toBe(1)
    expect(getVaultData('tabGroups')).toBe('{"version":1,"groups":[]}')
    expect(existsSync(join(vaultAppDir(), 'bookmarks.json.tmp'))).toBe(false)
  })

  it('rejects malformed JSON and keeps the previous file', () => {
    setVaultData('bookmarks', '{"a":1}')
    expect(() => setVaultData('bookmarks', '{nope')).toThrow()
    expect(() => setVaultData('bookmarks', '42')).toThrow()
    expect(getVaultData('bookmarks')).toBe('{"a":1}')
  })

  it('treats an unreadable file as missing', () => {
    mkdirSync(vaultAppDir(), { recursive: true })
    writeFileSync(join(vaultAppDir(), 'tab-groups.json'), '{truncated')
    expect(getVaultData('tabGroups')).toBeNull()
  })

  it('keeps an unreadable file aside so the next write does not destroy it', () => {
    mkdirSync(vaultAppDir(), { recursive: true })
    writeFileSync(join(vaultAppDir(), 'bookmarks.json'), '{"bookmarks":[{"id":"m1"')
    expect(getVaultData('bookmarks')).toBeNull()
    setVaultData('bookmarks', '{"bookmarks":[]}')
    const aside = readdirSync(vaultAppDir()).filter((n) => n.startsWith('bookmarks.json.corrupt-'))
    expect(aside).toHaveLength(1)
    expect(readFileSync(join(vaultAppDir(), aside[0]), 'utf8')).toBe('{"bookmarks":[{"id":"m1"')
  })

  it('refuses unknown keys', () => {
    expect(() => getVaultData('../../etc' as never)).toThrow()
    expect(() => getVaultData('constructor' as never)).toThrow('Unknown vault data key')
    expect(() => setVaultData('__proto__' as never, '{}')).toThrow('Unknown vault data key')
  })
})
