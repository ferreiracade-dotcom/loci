import type Database from 'better-sqlite3'

interface Migration {
  version: number
  name: string
  up: (db: Database.Database) => void
}

// Append new migrations here; never edit a shipped one. The index is rebuildable
// from the vault, so destructive forward migrations are acceptable when needed.
const migrations: Migration[] = [
  {
    version: 1,
    name: 'init',
    up: (db) => {
      db.exec(`
        CREATE TABLE settings (
          key   TEXT PRIMARY KEY,
          value TEXT
        );

        CREATE TABLE session_state (
          key   TEXT PRIMARY KEY,
          value TEXT
        );

        CREATE TABLE panel_layout (
          id               INTEGER PRIMARY KEY CHECK (id = 1),
          left_width       INTEGER NOT NULL DEFAULT 240,
          notes_width      INTEGER NOT NULL DEFAULT 320,
          results_width    INTEGER NOT NULL DEFAULT 280,
          left_collapsed   INTEGER NOT NULL DEFAULT 0,
          notes_collapsed  INTEGER NOT NULL DEFAULT 0,
          active_left_view TEXT    NOT NULL DEFAULT 'library',
          active_right_tab TEXT    NOT NULL DEFAULT 'book-notes',
          cover_size       INTEGER NOT NULL DEFAULT 140,
          library_view     TEXT    NOT NULL DEFAULT 'grid'
        );
        INSERT INTO panel_layout (id) VALUES (1);

        CREATE TABLE auth (
          id            INTEGER PRIMARY KEY CHECK (id = 1),
          password_hash TEXT
        );
        INSERT INTO auth (id, password_hash) VALUES (1, NULL);
      `)
    }
  }
]

export function runMigrations(db: Database.Database): void {
  const current = db.pragma('user_version', { simple: true }) as number
  for (const m of migrations) {
    if (m.version > current) {
      const tx = db.transaction(() => {
        m.up(db)
        db.pragma(`user_version = ${m.version}`)
      })
      tx()
    }
  }
}
