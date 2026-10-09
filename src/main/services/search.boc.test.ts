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
  db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
  dataDir = mkdtempSync(join(tmpdir(), 'loci-search-boc-'))
})

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true })
})

import * as boc from './boc'
import { indexBocForSearch, removeBocFromSearch, search } from './search'
import { parseBocRef } from '../../shared/bookOfConcord'

describe('BoC search indexing', () => {
  it('indexes BoC section text into search_fts under the confession kind', () => {
    const src = boc.createSource({ displayName: 'RE', author: null, mdRelativePath: 're.md' })
    boc.replaceSections(src.id, [
      { documentCode: 'AC', ordinal: 4, number: 'IV', label: 'Justification', part: null, text: 'Justification by faith alone' }
    ])
    indexBocForSearch(src.id)
    const rows = db
      .prepare("SELECT ref FROM search_fts WHERE kind='confession' AND search_fts MATCH 'justification'")
      .all()
    expect(rows).toContainEqual({ ref: 'AC:4' })
  })

  it('re-indexing a source replaces its previous rows rather than duplicating them', () => {
    const src = boc.createSource({ displayName: 'RE', author: null, mdRelativePath: 're.md' })
    boc.replaceSections(src.id, [
      { documentCode: 'AC', ordinal: 4, number: 'IV', label: 'Justification', part: null, text: 'Justification by faith alone' }
    ])
    indexBocForSearch(src.id)
    indexBocForSearch(src.id)
    const rows = db
      .prepare("SELECT ref FROM search_fts WHERE kind='confession' AND search_fts MATCH 'justification'")
      .all()
    expect(rows).toEqual([{ ref: 'AC:4' }])
  })

  it('skips blank section text', () => {
    const src = boc.createSource({ displayName: 'RE', author: null, mdRelativePath: 're.md' })
    boc.replaceSections(src.id, [
      { documentCode: 'AC', ordinal: 1, number: null, label: 'Preface', part: null, text: '   ' }
    ])
    indexBocForSearch(src.id)
    const rows = db.prepare("SELECT ref FROM search_fts WHERE kind='confession'").all()
    expect(rows).toEqual([])
  })

  it('removeBocFromSearch deletes only that source\'s confession rows', () => {
    const a = boc.createSource({ displayName: 'A', author: null, mdRelativePath: 'a.md' })
    const b = boc.createSource({ displayName: 'B', author: null, mdRelativePath: 'b.md' })
    boc.replaceSections(a.id, [
      { documentCode: 'AC', ordinal: 4, number: 'IV', label: 'Justification', part: null, text: 'Justification by faith alone' }
    ])
    boc.replaceSections(b.id, [
      { documentCode: 'SC', ordinal: 1, number: null, label: 'Ten Commandments', part: null, text: 'You shall have no other gods' }
    ])
    indexBocForSearch(a.id)
    indexBocForSearch(b.id)

    removeBocFromSearch(a.id)

    const remaining = db
      .prepare("SELECT ref FROM search_fts WHERE kind='confession'")
      .all()
    expect(remaining).toEqual([{ ref: 'SC:1' }])
  })
})

describe('BoC search hits', () => {
  it('returns confession hits whose ref round-trips to documentCode + section ordinal', () => {
    const src = boc.createSource({ displayName: 'RE', author: null, mdRelativePath: 're.md' })
    boc.replaceSections(src.id, [
      { documentCode: 'AC', ordinal: 4, number: 'IV', label: 'Justification', part: null, text: 'Justification by faith alone' }
    ])
    indexBocForSearch(src.id)
    const hits = search('justification', { kind: 'confession' })
    expect(hits).toHaveLength(1)
    expect(hits[0]).toMatchObject({ kind: 'confession', bookId: src.id, ref: 'AC:4', title: 'Justification' })
    expect(parseBocRef(hits[0].ref!)).toEqual({ code: 'AC', ordinal: 4 })
  })
})
