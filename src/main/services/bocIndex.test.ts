import Database from 'better-sqlite3'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { runMigrations } from '../db/migrations'

let db: Database.Database
let dataDir: string
vi.mock('../db/connection', () => ({ getDb: () => db, getDataDir: () => dataDir }))

beforeEach(() => {
  db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
  dataDir = mkdtempSync(join(tmpdir(), 'loci-boc-index-'))
})

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true })
})

import * as boc from './boc'
import { indexBocSections, indexBocCommentary, syncBocFolder } from './bocIndex'

describe('bocIndex', () => {
  it('indexes primary-text sections', async () => {
    const src = boc.createSource({ displayName: 'RE', author: null, mdRelativePath: 'confessions/re.md' })
    const p = join(dataDir, 're.md')
    writeFileSync(p, '# Augsburg Confession\n## 4 | IV | Justification | \n[1] Our churches teach…')
    expect((await indexBocSections(src.id, p)).sections).toBe(1)
    expect(boc.getSection('AC', 4, src.id)?.label).toBe('Justification')
  })

  it('indexes commentary, skipping note-less sections', async () => {
    const src = boc.createCommentarySource({
      displayName: 'RE-notes',
      author: null,
      mdRelativePath: 'confessions-commentary/re.md'
    })
    const p = join(dataDir, 're-notes.md')
    writeFileSync(
      p,
      '# Augsburg Confession\n## 3 | III | The Son of God | \n## 4 | IV | Justification | \nNote: the church stands or falls…'
    )
    expect((await indexBocCommentary(src.id, p)).excerpts).toBe(1)
    expect(boc.lookupBocSection('AC', 4)[0].text).toContain('stands or falls')
    expect(boc.lookupBocSection('AC', 3)).toEqual([])
  })
})

describe('syncBocFolder', () => {
  it('registers unseen files as sources and indexes their sections/excerpts', async () => {
    const primaryDir = join(dataDir, 'vault', 'confessions')
    const commentaryDir = join(dataDir, 'vault', 'confessions-commentary')
    mkdirSync(primaryDir, { recursive: true })
    mkdirSync(commentaryDir, { recursive: true })

    writeFileSync(
      join(primaryDir, 're.md'),
      '# Augsburg Confession\n## 4 | IV | Justification | \n[1] Our churches teach…'
    )
    writeFileSync(
      join(commentaryDir, 're.md'),
      '# Augsburg Confession\n## 4 | IV | Justification | \nNote: the church stands or falls…'
    )

    await syncBocFolder()

    const sources = boc.listSources()
    expect(sources).toHaveLength(1)
    expect(sources[0].mdRelativePath).toBe('confessions/re.md')
    expect(sources[0].status).toBe('indexed')
    expect(boc.getSection('AC', 4, sources[0].id)?.label).toBe('Justification')

    const commentarySources = boc.listCommentarySources()
    expect(commentarySources).toHaveLength(1)
    expect(commentarySources[0].mdRelativePath).toBe('confessions-commentary/re.md')
    expect(commentarySources[0].status).toBe('indexed')
    expect(boc.lookupBocSection('AC', 4)[0].text).toContain('stands or falls')
  })

  it('skips re-indexing on a second pass when nothing changed', async () => {
    const primaryDir = join(dataDir, 'vault', 'confessions')
    mkdirSync(primaryDir, { recursive: true })
    writeFileSync(
      join(primaryDir, 're.md'),
      '# Augsburg Confession\n## 4 | IV | Justification | \n[1] Our churches teach…'
    )

    await syncBocFolder()
    const firstPassSources = boc.listSources()
    expect(firstPassSources).toHaveLength(1)

    await syncBocFolder()
    const secondPassSources = boc.listSources()
    expect(secondPassSources).toHaveLength(1)
    expect(secondPassSources[0].id).toBe(firstPassSources[0].id)
    expect(boc.getSection('AC', 4, secondPassSources[0].id)?.label).toBe('Justification')
  })

  it('does nothing when the vault folders do not exist', async () => {
    await expect(syncBocFolder()).resolves.toBeUndefined()
    expect(boc.listSources()).toEqual([])
    expect(boc.listCommentarySources()).toEqual([])
  })
})
