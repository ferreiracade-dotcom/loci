import Database from 'better-sqlite3'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runMigrations } from '../db/migrations'

let db: Database.Database
let dataDir: string
vi.mock('../db/connection', () => ({ getDb: () => db, getDataDir: () => dataDir }))
vi.mock('electron', () => ({
  app: { isPackaged: false, getAppPath: () => '/nonexistent' },
  safeStorage: { isEncryptionAvailable: () => false }
}))

import * as dogmatics from './dogmatics'
import { addDogmaticsQuote, listDogmaticsQuotes, listQuoteGroups, dogmaticsLabel } from './quotes'
import { dogmaticsVaultDir } from './config'
import { parseDogmaticsMarkdown } from './dogmaticsMarkdown'

const MD = [
  '# Loci Theologici',
  '## 1 On Holy Scripture',
  '### 1 Prooemium',
  'Scripture is the Word of God.',
  '',
  'Latin:',
  '',
  'Scriptura est verbum Dei.',
  '### 2',
  'Second.',
  '## 2 On God',
  '### 1',
  'God is.'
].join('\n')

beforeEach(() => {
  db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
  dataDir = mkdtempSync(join(tmpdir(), 'loci-dogmatics-'))
  mkdirSync(dogmaticsVaultDir(), { recursive: true })
  writeFileSync(join(dogmaticsVaultDir(), 'Gerhard Loci.md'), MD)
})

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true })
})

describe('dogmatics folder sync', () => {
  it('registers and indexes each file, then leaves unchanged ones alone', async () => {
    expect(await dogmatics.syncDogmaticsFolder()).toBe(1)
    const [src] = dogmatics.listSources()
    expect(src).toMatchObject({ displayName: 'Gerhard Loci', status: 'indexed', mdRelativePath: 'dogmatics/Gerhard Loci.md' })
    expect(dogmatics.listOutline(src.id)).toEqual([
      {
        ordinal: 1,
        title: 'Loci Theologici',
        books: [
          { ordinal: 1, number: '1', title: 'On Holy Scripture', sections: 2 },
          { ordinal: 2, number: '2', title: 'On God', sections: 1 }
        ]
      }
    ])
    expect(dogmatics.listBook(src.id, 1, 1).map((s) => [s.ordinal, s.number, s.title])).toEqual([
      [1, '1', 'Prooemium'],
      [2, '2', '']
    ])
    expect(await dogmatics.syncDogmaticsFolder()).toBe(0)
  })
})

describe('dogmatics quotes', () => {
  it('cites the place, homes the quote in a note, and groups it', async () => {
    await dogmatics.syncDogmaticsFolder()
    const [src] = dogmatics.listSources()
    db.prepare('UPDATE dogmatics_sources SET author = ? WHERE id = ?').run('Johann Gerhard', src.id)
    const q = addDogmaticsQuote({ sourceId: src.id, workOrdinal: 1, bookOrdinal: 1, sectionOrdinal: 1, text: 'Scripture is the Word of God.' })
    expect(q.citation).toBe('Johann Gerhard, *Gerhard Loci*, Loci Theologici, On Holy Scripture, § 1')
    expect(q).toMatchObject({ dogmaticsSourceId: src.id, dogmaticsRef: '1.1.1', dogmaticsAuthor: 'Johann Gerhard' })
    const note = join(dataDir, 'vault', 'notes', 'dogmatics', 'Gerhard Loci.md')
    expect(existsSync(note)).toBe(true)
    expect(readFileSync(note, 'utf8')).toContain('Scripture is the Word of God.')
    addDogmaticsQuote({ sourceId: src.id, workOrdinal: 1, bookOrdinal: 2, sectionOrdinal: 1, text: 'God is.' })
    expect(listDogmaticsQuotes(src.id).map((x) => x.dogmaticsRef)).toEqual(['1.1.1', '1.2.1'])
    expect(listQuoteGroups('BSB').dogmatics).toEqual([
      { sourceId: src.id, displayName: 'Gerhard Loci', author: 'Johann Gerhard', count: 2 }
    ])
  })

  it('leaves the work out of the place when the source is named for it', () => {
    const base = { workTitle: 'Loci Theologici', multiWork: false, bookNumber: '1', bookTitle: 'On Holy Scripture' }
    expect(dogmaticsLabel('Loci Theologici', { ...base, sectionNumber: '5', sectionTitle: '' })).toBe(
      'On Holy Scripture, § 5'
    )
    expect(dogmaticsLabel('Loci Theologici', { ...base, sectionNumber: null, sectionTitle: 'Preface' })).toBe(
      'On Holy Scripture, Preface'
    )
    expect(
      dogmaticsLabel('Loci Theologici', { ...base, multiWork: true, bookTitle: '', sectionNumber: '2', sectionTitle: '' })
    ).toBe('Loci Theologici, bk. 1, § 2')
  })
})

describe('shipped dogmatics', () => {
  it('copies each into the vault once and keeps a removed one removed', () => {
    const shipped = join(dataDir, 'shipped')
    mkdirSync(shipped)
    writeFileSync(join(shipped, 'Schmid.md'), '# Doctrinal Theology\n## 1 Prolegomena\n### 1\nText.')
    expect(dogmatics.installBundledDogmatics(shipped)).toEqual(['Schmid.md'])
    const dest = join(dogmaticsVaultDir(), 'Schmid.md')
    expect(existsSync(dest)).toBe(true)
    rmSync(dest)
    expect(dogmatics.installBundledDogmatics(shipped)).toEqual([])
    expect(existsSync(dest)).toBe(false)
  })
})

describe('the dogmatics Loci ships', () => {
  const dir = join(__dirname, '..', '..', '..', 'resources', 'dogmatics')
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.md')) : []
  it('are all registered', () => {
    expect(files.filter((f) => !dogmatics.BUNDLED_DOGMATICS[f])).toEqual([])
  })
  it.each(files)('%s parses into books and sections', (f) => {
    const sections = parseDogmaticsMarkdown(readFileSync(join(dir, f), 'utf8'))
    expect(sections.length).toBeGreaterThan(25)
    expect(sections.every((s) => s.bookTitle || s.bookNumber)).toBe(true)
  })
})

describe('dogmatics topics', () => {
  it('finds whole books and stray sections on a topic across every work', async () => {
    writeFileSync(
      join(dogmaticsVaultDir(), 'Pieper.md'),
      [
        '# Christian Dogmatics',
        '## 1 The Means of Grace',
        '### 1 The Word',
        'Text.',
        '### 2 Holy Baptism',
        'Text.',
        '### 3 The Lord’s Supper',
        'Text.',
        '## 2 Of Baptism and Faith',
        '### 1',
        'Text.'
      ].join('\n')
    )
    writeFileSync(join(dogmaticsVaultDir(), 'Gerhard Loci.md'), MD + '\n## 3 De Baptismo\n### 1\nBaptismus.')
    await dogmatics.syncDogmaticsFolder()
    const baptism = dogmatics.listTopic('baptism')
    expect(baptism.map((t) => [t.sourceName, t.bookTitle, t.matched.map((m) => m.title)])).toEqual([
      ['Gerhard Loci', 'De Baptismo', []],
      ['Pieper', 'The Means of Grace', ['Holy Baptism']],
      ['Pieper', 'Of Baptism and Faith', []]
    ])
    expect(dogmatics.listTopics().find((t) => t.id === 'baptism')).toMatchObject({ treatments: 3, works: 2 })
    // A re-index drops the cached index.
    writeFileSync(join(dogmaticsVaultDir(), 'Pieper.md'), '# Christian Dogmatics\n## 1 On God\n### 1\nText.')
    const [pieper] = dogmatics.listSources().filter((s) => s.displayName === 'Pieper')
    await dogmatics.indexSource(pieper.id, join(dogmaticsVaultDir(), 'Pieper.md'))
    expect(dogmatics.listTopic('baptism').map((t) => t.sourceName)).toEqual(['Gerhard Loci'])
  })
})
