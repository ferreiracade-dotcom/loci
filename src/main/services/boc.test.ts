import Database from 'better-sqlite3'
import { describe, expect, it, beforeEach } from 'vitest'
import { runMigrations } from '../db/migrations'

let db: Database.Database
beforeEach(() => {
  db = new Database(':memory:'); db.pragma('foreign_keys = ON'); runMigrations(db)
})

describe('migration v18', () => {
  it('creates the four BoC tables and reaches version 18+', () => {
    expect(db.pragma('user_version', { simple: true })).toBeGreaterThanOrEqual(18)
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r: any) => r.name)
    for (const t of ['boc_sources','boc_texts','boc_commentary_sources','boc_commentary_excerpts'])
      expect(tables).toContain(t)
  })
})
