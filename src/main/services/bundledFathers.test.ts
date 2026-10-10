import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let dataDir: string
let shipped: string

vi.mock('../db/connection', () => ({ getDb: () => null, getDataDir: () => dataDir }))
vi.mock('electron', () => ({
  app: { isPackaged: false, getAppPath: () => '/nonexistent' },
  safeStorage: { isEncryptionAvailable: () => false }
}))

import { installBundledFathers } from './fathersIndex'

const vaultFile = (name: string): string => join(dataDir, 'vault', 'fathers', name)

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'loci-bundled-fathers-'))
  shipped = join(dataDir, 'shipped')
  mkdirSync(shipped)
  writeFileSync(join(shipped, 'anf01.xml'), '<ThML>one</ThML>')
  writeFileSync(join(shipped, 'README.txt'), 'not a volume')
})

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true })
})

describe('installBundledFathers', () => {
  it('copies each shipped .xml volume into the fathers vault folder once', () => {
    expect(installBundledFathers(shipped)).toEqual(['anf01.xml'])
    expect(readFileSync(vaultFile('anf01.xml'), 'utf8')).toBe('<ThML>one</ThML>')
    expect(existsSync(vaultFile('README.txt'))).toBe(false)
    expect(installBundledFathers(shipped)).toEqual([])
  })

  it('does not overwrite a copy the user changed', () => {
    installBundledFathers(shipped)
    writeFileSync(vaultFile('anf01.xml'), 'mine')
    writeFileSync(join(shipped, 'anf01.xml'), '<ThML>newer</ThML>')
    expect(installBundledFathers(shipped)).toEqual([])
    expect(readFileSync(vaultFile('anf01.xml'), 'utf8')).toBe('mine')
  })

  it('updates an untouched copy when a newer version ships', () => {
    installBundledFathers(shipped)
    writeFileSync(join(shipped, 'anf01.xml'), '<ThML>newer</ThML>')
    expect(installBundledFathers(shipped)).toEqual(['anf01.xml'])
    expect(readFileSync(vaultFile('anf01.xml'), 'utf8')).toBe('<ThML>newer</ThML>')
  })

  it('does not bring back a volume the user removed', () => {
    installBundledFathers(shipped)
    unlinkSync(vaultFile('anf01.xml'))
    expect(installBundledFathers(shipped)).toEqual([])
    expect(existsSync(vaultFile('anf01.xml'))).toBe(false)
  })

})
