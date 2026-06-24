import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { mkdirSync } from 'fs'
import { runMigrations } from './migrations'

let db: Database.Database | null = null

/** %APPDATA%/Loci — local, rebuildable app-data dir (never synced). */
export function getDataDir(): string {
  const dir = join(app.getPath('appData'), 'Loci')
  mkdirSync(dir, { recursive: true })
  return dir
}

export function getDb(): Database.Database {
  if (db) return db
  const dbPath = join(getDataDir(), 'index.sqlite')
  const conn = new Database(dbPath)
  conn.pragma('journal_mode = WAL')
  conn.pragma('foreign_keys = ON')
  runMigrations(conn)
  db = conn
  return db
}

export function closeDb(): void {
  if (db) {
    db.close()
    db = null
  }
}
