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
  },
  {
    version: 2,
    name: 'library',
    up: (db) => {
      db.exec(`
        CREATE TABLE books (
          id              TEXT PRIMARY KEY,
          title           TEXT NOT NULL,
          title_sanitized TEXT NOT NULL,
          author          TEXT,
          year            INTEGER,
          publisher       TEXT,
          city            TEXT,
          genre           TEXT,
          status          TEXT    NOT NULL DEFAULT 'unread',
          cover_path      TEXT,
          pdf_path        TEXT,
          source_path     TEXT,
          page_offset     INTEGER NOT NULL DEFAULT 0,
          quote_count     INTEGER NOT NULL DEFAULT 0,
          last_page       INTEGER NOT NULL DEFAULT 1,
          date_added      INTEGER NOT NULL DEFAULT 0,
          last_opened     INTEGER
        );

        CREATE TABLE shelves (
          id         TEXT PRIMARY KEY,
          name       TEXT NOT NULL UNIQUE,
          sort_order INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE book_shelves (
          book_id  TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
          shelf_id TEXT NOT NULL REFERENCES shelves(id) ON DELETE CASCADE,
          PRIMARY KEY (book_id, shelf_id)
        );

        CREATE TABLE tags (
          id   TEXT PRIMARY KEY,
          name TEXT NOT NULL UNIQUE
        );

        CREATE TABLE book_tags (
          book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
          tag_id  TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
          PRIMARY KEY (book_id, tag_id)
        );

        CREATE INDEX idx_books_status ON books(status);
        CREATE INDEX idx_books_author ON books(author);
        CREATE INDEX idx_book_shelves_shelf ON book_shelves(shelf_id);
        CREATE INDEX idx_book_tags_tag ON book_tags(tag_id);

        -- Default shelves (spec §5 step 9)
        INSERT INTO shelves (id, name, sort_order) VALUES
          ('shelf-lutheran-confessions', 'Lutheran Confessions', 1),
          ('shelf-church-fathers',       'Church Fathers',       2),
          ('shelf-currently-reading',    'Currently Reading',    3),
          ('shelf-reference',            'Reference',            4);

        -- Default tags (spec §5 step 10)
        INSERT INTO tags (id, name) VALUES
          ('tag-theology',     'theology'),
          ('tag-confessional', 'confessional'),
          ('tag-liturgy',      'liturgy'),
          ('tag-catechism',    'catechism'),
          ('tag-law-gospel',   'law-gospel'),
          ('tag-sacraments',   'sacraments'),
          ('tag-history',      'history'),
          ('tag-christology',  'christology');
      `)
    }
  },
  {
    version: 3,
    name: 'book-meta-fetched',
    up: (db) => {
      // Tracks whether a background metadata fetch has been attempted, so we never
      // re-hammer Google Books for titles that returned nothing.
      db.exec(`ALTER TABLE books ADD COLUMN meta_fetched INTEGER NOT NULL DEFAULT 0;`)
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
