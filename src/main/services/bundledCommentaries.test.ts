import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let dataDir: string
let shipped: string

vi.mock('../db/connection', () => ({ getDataDir: () => dataDir }))
vi.mock('electron', () => ({
  app: { isPackaged: false, getAppPath: () => '/nonexistent' },
  safeStorage: { isEncryptionAvailable: () => false }
}))

import { installBundledCommentaries } from './bundledCommentaries'

const vaultFile = (name: string): string => join(dataDir, 'vault', 'commentaries', name)

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'loci-bundled-'))
  shipped = join(dataDir, 'shipped')
  mkdirSync(shipped)
  writeFileSync(join(shipped, 'Philippi Romans.md'), '# Romans\n## 1:1\nPaul')
  writeFileSync(join(shipped, 'README.txt'), 'not a commentary')
})

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true })
})

describe('installBundledCommentaries', () => {
  it('copies each shipped commentary into the vault once', () => {
    expect(installBundledCommentaries(shipped)).toEqual(['Philippi Romans.md'])
    expect(readFileSync(vaultFile('Philippi Romans.md'), 'utf8')).toContain('## 1:1')
    expect(existsSync(vaultFile('README.txt'))).toBe(false)
    expect(installBundledCommentaries(shipped)).toEqual([])
  })

  it('does not bring back a commentary the user removed', () => {
    installBundledCommentaries(shipped)
    unlinkSync(vaultFile('Philippi Romans.md'))
    expect(installBundledCommentaries(shipped)).toEqual([])
    expect(existsSync(vaultFile('Philippi Romans.md'))).toBe(false)
  })

  it('leaves a copy the vault already has (synced from another device) untouched', () => {
    mkdirSync(join(dataDir, 'vault', 'commentaries'), { recursive: true })
    writeFileSync(vaultFile('Philippi Romans.md'), 'synced copy')
    expect(installBundledCommentaries(shipped)).toEqual([])
    expect(readFileSync(vaultFile('Philippi Romans.md'), 'utf8')).toBe('synced copy')
  })

  it('does nothing when there is no shipped folder', () => {
    expect(installBundledCommentaries(join(dataDir, 'missing'))).toEqual([])
  })
})
