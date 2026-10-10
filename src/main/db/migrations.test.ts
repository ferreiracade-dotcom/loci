import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { runMigrations } from './migrations'

const LATEST = 24

function tables(db: Database.Database): string[] {
  return (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map((r) => r.name)
}
function quoteColumns(db: Database.Database): string[] {
  return (db.prepare('PRAGMA table_info(quotes)').all() as { name: string }[]).map((c) => c.name)
}
function expectComplete(db: Database.Database): void {
  expect(db.pragma('user_version', { simple: true })).toBe(LATEST)
  const t = tables(db)
  for (const name of ['history', 'dogmatics_sources', 'dogmatics_sections', 'fathers_volumes', 'fathers_sections']) {
    expect(t).toContain(name)
  }
  const cols = quoteColumns(db)
  for (const c of ['dogmatics_source_id', 'dogmatics_ref', 'dogmatics_label', 'fathers_volume', 'fathers_citation']) {
    expect(cols.filter((x) => x === c)).toHaveLength(1)
  }
}

/** The Chrome UI branch's own version 20: the history table. */
function branchHistory(db: Database.Database): void {
  db.exec(`
    CREATE TABLE history (
      id INTEGER PRIMARY KEY AUTOINCREMENT, visited_at TEXT NOT NULL, kind TEXT NOT NULL,
      title TEXT NOT NULL, location TEXT NOT NULL
    );
    CREATE INDEX idx_history_visited ON history(visited_at);
  `)
}

describe('migrations across main and the Chrome UI branch', () => {
  it('builds a fresh database to the latest version', () => {
    const db = new Database(':memory:')
    runMigrations(db)
    expectComplete(db)
    expect(() => runMigrations(db)).not.toThrow()
  })

  it("upgrades a database at main's latest version (22: dogmatics, Church Fathers)", () => {
    const db = new Database(':memory:')
    runMigrations(db, 22)
    expect(tables(db)).not.toContain('history')
    runMigrations(db)
    expectComplete(db)
  })

  it("upgrades a database at the branch's latest version (20: history, no dogmatics)", () => {
    const db = new Database(':memory:')
    runMigrations(db, 19)
    branchHistory(db)
    db.pragma('user_version = 20')
    db.prepare("INSERT INTO history (visited_at, kind, title, location) VALUES ('t', 'bible', 'John 3', '{}')").run()
    runMigrations(db)
    expectComplete(db)
    expect((db.prepare('SELECT COUNT(*) AS n FROM history').get() as { n: number }).n).toBe(1)
  })

  it('upgrades a database from the interim merge (22: dogmatics + history, no Church Fathers)', () => {
    const db = new Database(':memory:')
    runMigrations(db, 20)
    branchHistory(db)
    db.pragma('user_version = 22')
    runMigrations(db)
    expectComplete(db)
  })
})
