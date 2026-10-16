import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, unlinkSync, writeFileSync } from 'fs'
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

import { BUNDLED_COMMENTARIES, installBundledCommentaries } from './bundledCommentaries'
import { readConfig, writeConfig } from './config'
import { catalogEntryForFile } from './sermonIndex'
import { parseCommentaryMarkdown } from './commentaryMarkdown'
import { validateSource } from './commentaryValidate'
import { VERSE_COUNTS } from '../../shared/versification'

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

  it('replaces the copy it installed with a newer shipped version', () => {
    installBundledCommentaries(shipped)
    writeFileSync(join(shipped, 'Philippi Romans.md'), '# Romans\n## 1:1\nPaul, a servant')
    expect(installBundledCommentaries(shipped)).toEqual(['Philippi Romans.md'])
    expect(readFileSync(vaultFile('Philippi Romans.md'), 'utf8')).toContain('a servant')
    expect(installBundledCommentaries(shipped)).toEqual([])
  })

  it('never replaces a copy the user changed', () => {
    installBundledCommentaries(shipped)
    writeFileSync(vaultFile('Philippi Romans.md'), 'my notes')
    writeFileSync(join(shipped, 'Philippi Romans.md'), '# Romans\n## 1:1\nPaul, a servant')
    expect(installBundledCommentaries(shipped)).toEqual([])
    expect(readFileSync(vaultFile('Philippi Romans.md'), 'utf8')).toBe('my notes')
  })

  it('does not bring back a removed commentary when a newer version ships', () => {
    installBundledCommentaries(shipped)
    unlinkSync(vaultFile('Philippi Romans.md'))
    writeFileSync(join(shipped, 'Philippi Romans.md'), '# Romans\n## 1:1\nPaul, a servant')
    expect(installBundledCommentaries(shipped)).toEqual([])
    expect(existsSync(vaultFile('Philippi Romans.md'))).toBe(false)
  })

  it('updates a copy installed before versions were recorded', () => {
    installBundledCommentaries(shipped)
    writeConfig({ bundledCommentaryHashes: null })
    writeFileSync(join(shipped, 'Philippi Romans.md'), '# Romans\n## 1:1\nPaul, a servant')
    expect(installBundledCommentaries(shipped)).toEqual(['Philippi Romans.md'])
  })

  it('copies and records shipped MyBible .SQLite3 modules like Markdown files', () => {
    writeFileSync(join(shipped, 'SI-LENSKI.commentaries.SQLite3'), 'module bytes')
    expect(installBundledCommentaries(shipped).sort()).toEqual(['Philippi Romans.md', 'SI-LENSKI.commentaries.SQLite3'])
    expect(readFileSync(vaultFile('SI-LENSKI.commentaries.SQLite3'), 'utf8')).toBe('module bytes')
    expect(readConfig().bundledCommentaries).toContain('SI-LENSKI.commentaries.SQLite3')
    expect(installBundledCommentaries(shipped)).toEqual([])
    writeFileSync(join(shipped, 'SI-LENSKI.commentaries.SQLite3'), 'module bytes v2')
    expect(installBundledCommentaries(shipped)).toEqual(['SI-LENSKI.commentaries.SQLite3'])
  })

  it('does not bring back a default SermonIndex module the user already removed', () => {
    writeFileSync(join(shipped, 'SI-LENSKI.commentaries.SQLite3'), 'module bytes')
    writeFileSync(join(shipped, 'SI-KD.commentaries.SQLite3'), 'kd bytes')
    writeConfig({ sermonIndexDefaults: ['lenski'] })
    expect(installBundledCommentaries(shipped).sort()).toEqual(['Philippi Romans.md', 'SI-KD.commentaries.SQLite3'])
    expect(existsSync(vaultFile('SI-LENSKI.commentaries.SQLite3'))).toBe(false)
    expect(readConfig().bundledCommentaries).toContain('SI-LENSKI.commentaries.SQLite3')
  })

  it('treats the legacy single flag as Lenski having been installed', () => {
    writeFileSync(join(shipped, 'SI-LENSKI.commentaries.SQLite3'), 'module bytes')
    writeConfig({ sermonIndexDefaultsInstalled: true })
    expect(installBundledCommentaries(shipped)).toEqual(['Philippi Romans.md'])
  })

  it('skips Kretzmann when the optional Popular module is already in the vault', () => {
    writeFileSync(join(shipped, 'Kretzmann Popular Commentary.md'), '# Genesis\n## 1:1\nx')
    mkdirSync(join(dataDir, 'vault', 'commentaries'), { recursive: true })
    writeFileSync(vaultFile('SI-POPULAR.commentaries.SQLite3'), 'popular')
    installBundledCommentaries(shipped)
    expect(existsSync(vaultFile('Kretzmann Popular Commentary.md'))).toBe(false)
    expect(readConfig().bundledCommentaries).toContain('Kretzmann Popular Commentary.md')
  })

  it('does nothing when there is no shipped folder', () => {
    expect(installBundledCommentaries(join(dataDir, 'missing'))).toEqual([])
  })
})

describe('the commentaries Loci ships', () => {
  const dir = join(__dirname, '..', '..', '..', 'resources', 'commentaries')
  const files = readdirSync(dir).filter((f) => /\.md$/i.test(f))

  it('ships Lenski and Keil & Delitzsch as MyBible modules named as the SermonIndex catalog expects', () => {
    for (const f of ['SI-LENSKI.commentaries.SQLite3', 'SI-KD.commentaries.SQLite3']) {
      expect(existsSync(join(dir, f)), f).toBe(true)
      expect(catalogEntryForFile(f), f).toBeDefined()
    }
  })

  it('has metadata for Kretzmann', () => {
    expect(BUNDLED_COMMENTARIES['Kretzmann Popular Commentary.md']).toEqual({
      title: 'The Popular Commentary of the Bible',
      author: 'Paul E. Kretzmann'
    })
  })

  it('each has a title and author', () => {
    for (const f of files) expect(BUNDLED_COMMENTARIES[f], f).toBeDefined()
  })

  it.each(files)('%s indexes without a flagged excerpt', (f) => {
    const chunks = parseCommentaryMarkdown(readFileSync(join(dir, f), 'utf8'))
    // Melanchthon on Daniel, treated chapter by chapter and by topics, is the shortest: 33 excerpts.
    expect(chunks.length).toBeGreaterThan(25)
    const flagged = validateSource(chunks, VERSE_COUNTS).chunks.filter((c) => c.flagged)
    expect(flagged.map((c) => `${c.book} ${c.headerRaw}: ${c.reasons[0]}`)).toEqual([])
  })
})
