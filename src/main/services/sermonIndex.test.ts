import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { deflateRawSync } from 'zlib'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let dataDir: string
const fetched: string[] = []
let online = true

vi.mock('../db/connection', () => ({ getDataDir: () => dataDir }))
vi.mock('electron', () => ({
  safeStorage: { isEncryptionAvailable: () => false },
  net: {
    fetch: async (url: string) => {
      if (!online) throw new Error('offline')
      fetched.push(url)
      const body = zipOf(url.replace(/.*\/(SI-[A-Z]+)\.commentaries\.zip$/, '$1.commentaries.SQLite3'))
      return new Response(body, { status: 200, headers: { 'content-length': String(body.length) } })
    }
  }
}))

/** A one-entry stored zip, like the module archives SermonIndex serves. */
function zipOf(name: string): Buffer {
  const data = deflateRawSync(Buffer.from('SQLite format 3\0'))
  const n = Buffer.from(name)
  const local = Buffer.alloc(30)
  local.writeUInt32LE(0x04034b50, 0)
  local.writeUInt16LE(8, 8)
  local.writeUInt32LE(data.length, 18)
  local.writeUInt16LE(n.length, 26)
  const central = Buffer.alloc(46)
  central.writeUInt32LE(0x02014b50, 0)
  central.writeUInt16LE(8, 10)
  central.writeUInt32LE(data.length, 20)
  central.writeUInt16LE(n.length, 28)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(1, 10)
  eocd.writeUInt32LE(local.length + n.length + data.length, 16)
  return Buffer.concat([local, n, data, central, n, eocd])
}

import { installDefaultModules } from './sermonIndex'

const vaultModule = (code: string): string => join(dataDir, 'vault', 'commentaries', `${code}.commentaries.SQLite3`)
const config = (): Record<string, unknown> => JSON.parse(readFileSync(join(dataDir, 'config.json'), 'utf8'))

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'loci-sermonindex-'))
  fetched.length = 0
  online = true
})

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true })
})

describe('installDefaultModules', () => {
  it('downloads every default once and records each', async () => {
    const installed = await installDefaultModules()
    expect(installed).toEqual([
      'commentaries/SI-LENSKI.commentaries.SQLite3',
      'commentaries/SI-KD.commentaries.SQLite3'
    ])
    expect(existsSync(vaultModule('SI-KD'))).toBe(true)
    expect(config().sermonIndexDefaults).toEqual(['lenski', 'keildelitzsch'])
    expect(await installDefaultModules()).toEqual([])
    expect(fetched).toHaveLength(2)
  })

  it('installs only the new default after an upgrade from the single legacy flag', async () => {
    writeFileSync(join(dataDir, 'config.json'), JSON.stringify({ sermonIndexDefaultsInstalled: true }))
    expect(await installDefaultModules()).toEqual(['commentaries/SI-KD.commentaries.SQLite3'])
    expect(fetched).toEqual([expect.stringContaining('SI-KD')])
  })

  it('skips a module the vault already has (synced from another device)', async () => {
    mkdirSync(join(dataDir, 'vault', 'commentaries'), { recursive: true })
    writeFileSync(vaultModule('SI-LENSKI'), 'synced')
    await installDefaultModules()
    expect(fetched).toEqual([expect.stringContaining('SI-KD')])
    expect(readFileSync(vaultModule('SI-LENSKI'), 'utf8')).toBe('synced')
  })

  it('leaves a failed download unrecorded so the next launch retries it', async () => {
    online = false
    expect(await installDefaultModules()).toEqual([])
    expect(existsSync(join(dataDir, 'config.json'))).toBe(false)
    online = true
    expect(await installDefaultModules()).toHaveLength(2)
  })
})
