import Database from 'better-sqlite3'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { runMigrations } from '../db/migrations'

let db: Database.Database
let dataDir: string
vi.mock('../db/connection', () => ({ getDb: () => db, getDataDir: () => dataDir }))

beforeEach(() => {
  db = new Database(':memory:'); db.pragma('foreign_keys = ON'); runMigrations(db)
  dataDir = mkdtempSync(join(tmpdir(), 'loci-boc-'))
})

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true })
})

describe('migration v18', () => {
  it('creates the four BoC tables and reaches version 18+', () => {
    expect(db.pragma('user_version', { simple: true })).toBeGreaterThanOrEqual(18)
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r: any) => r.name)
    for (const t of ['boc_sources','boc_texts','boc_commentary_sources','boc_commentary_excerpts'])
      expect(tables).toContain(t)
  })
})

import * as boc from './boc'

describe('boc service', () => {
  it('stores sections and reads one back with its display fields', () => {
    const src = boc.createSource({ displayName: "Reader's Edition", author: 'CPH', mdRelativePath: 're.md' })
    boc.replaceSections(src.id, [
      { documentCode: 'AC', ordinal: 1, number: null, label: 'Preface', part: null, text: 'Most invincible…' },
      { documentCode: 'AC', ordinal: 4, number: 'IV', label: 'Justification', part: 'Chief Articles of Faith', text: '[1] Our churches…' }
    ])
    expect(boc.getSection('AC', 4, src.id)).toEqual({
      ordinal: 4, number: 'IV', label: 'Justification', part: 'Chief Articles of Faith', text: '[1] Our churches…'
    })
    expect(boc.getSection('AC', 99, src.id)).toBeNull()
    expect(boc.listSections('AC', src.id).map((s) => s.ordinal)).toEqual([1, 4])
  })

  it('replaceSections is idempotent per source', () => {
    const src = boc.createSource({ displayName: 'T', author: null, mdRelativePath: 't.md' })
    boc.replaceSections(src.id, [{ documentCode: 'AC', ordinal: 1, number: 'I', label: 'God', part: null, text: 'first' }])
    boc.replaceSections(src.id, [{ documentCode: 'AC', ordinal: 1, number: 'I', label: 'God', part: null, text: 'second' }])
    expect(boc.getSection('AC', 1, src.id)?.text).toBe('second')
  })

  it('looks up commentary whose range covers a section, ordered by source sort_order', () => {
    const a = boc.createCommentarySource({ displayName: 'A', author: null, mdRelativePath: 'a.md', sortOrder: 1 })
    const b = boc.createCommentarySource({ displayName: 'B', author: null, mdRelativePath: 'b.md', sortOrder: 0 })
    boc.replaceCommentaryExcerpts(a.id, [{ documentCode: 'AC', sectionStart: 1, sectionEnd: 5, text: 'A on 1-5', headerRaw: '' }])
    boc.replaceCommentaryExcerpts(b.id, [{ documentCode: 'AC', sectionStart: 4, sectionEnd: 4, text: 'B on 4', headerRaw: '' }])
    expect(boc.lookupBocSection('AC', 4).map((m) => m.text)).toEqual(['B on 4', 'A on 1-5'])
    expect(boc.lookupBocSection('AC', 10)).toEqual([])
  })
})
