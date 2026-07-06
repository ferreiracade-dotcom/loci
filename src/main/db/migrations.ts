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
  },
  {
    version: 4,
    name: 'quotes',
    up: (db) => {
      db.exec(`
        CREATE TABLE quotes (
          id         TEXT PRIMARY KEY,
          book_id    TEXT REFERENCES books(id) ON DELETE CASCADE,
          text       TEXT NOT NULL,
          page       INTEGER,
          color      TEXT NOT NULL DEFAULT 'amber',
          note_path  TEXT,
          used_in    TEXT NOT NULL DEFAULT '[]',
          created    INTEGER NOT NULL
        );
        CREATE TABLE quote_tags (
          quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
          tag_id   TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
          PRIMARY KEY (quote_id, tag_id)
        );
        CREATE INDEX idx_quotes_book ON quotes(book_id);
        CREATE INDEX idx_quote_tags_tag ON quote_tags(tag_id);
      `)
    }
  },
  {
    version: 5,
    name: 'quote-annotation',
    up: (db) => {
      db.exec(`ALTER TABLE quotes ADD COLUMN annotation TEXT NOT NULL DEFAULT '';`)
    }
  },
  {
    version: 6,
    name: 'search-fts',
    up: (db) => {
      db.exec(`
        ALTER TABLE books ADD COLUMN indexed INTEGER NOT NULL DEFAULT 0;

        CREATE VIRTUAL TABLE search_fts USING fts5(
          content,
          kind UNINDEXED,
          book_id UNINDEXED,
          ref UNINDEXED,
          page UNINDEXED,
          title UNINDEXED,
          tokenize = 'unicode61 remove_diacritics 2'
        );
      `)
    }
  },
  {
    version: 7,
    name: 'book-local-path',
    up: (db) => {
      // Optional fast local copy of the PDF, used in preference to pdf_path
      // (which may live on a streamed cloud drive).
      db.exec(`ALTER TABLE books ADD COLUMN local_path TEXT;`)
    }
  },
  {
    version: 8,
    name: 'book-series',
    up: (db) => {
      db.exec(`ALTER TABLE books ADD COLUMN series TEXT;`)
    }
  },
  {
    version: 9,
    name: 'series-number-abbr',
    up: (db) => {
      // Position within the series (e.g. "1") and a short abbreviation (e.g. "ANF"),
      // both searchable so "Ante-Nicene Fathers 1" and "ANF 1" find the same book.
      db.exec(`
        ALTER TABLE books ADD COLUMN series_number TEXT;
        ALTER TABLE books ADD COLUMN series_abbr TEXT;
      `)
    }
  },
  {
    version: 10,
    name: 'scripture-cache',
    up: (db) => {
      // Local cache of fetched Bible chapters, keyed by translation+book+chapter. Only
      // freely-licensed translations (public domain / CC) are written here; copyrighted
      // ones (NKJV/NASB via API.Bible, ESV via Crossway) are session-only per their terms.
      db.exec(`
        CREATE TABLE scripture_cache (
          translation TEXT    NOT NULL,
          book        TEXT    NOT NULL,
          chapter     INTEGER NOT NULL,
          json        TEXT    NOT NULL,
          fetched_at  INTEGER NOT NULL,
          PRIMARY KEY (translation, book, chapter)
        );
      `)
    }
  },
  {
    version: 11,
    name: 'scripture-cache-audio',
    up: (db) => {
      // The cached chapter JSON gained an { verses, audio } shape (chapter narrations).
      // Clear the cache once so existing bare-array entries re-fetch with their audio links.
      db.exec(`DELETE FROM scripture_cache;`)
    }
  },
  {
    version: 12,
    name: 'scripture-quotes',
    up: (db) => {
      // Scripture highlights are quotes with no book_id: they carry the canonical
      // reference (e.g. "JHN 3:16-18") and the translation (BSB/public-domain only).
      db.exec(`
        ALTER TABLE quotes ADD COLUMN scripture_ref TEXT;
        ALTER TABLE quotes ADD COLUMN scripture_translation TEXT;
      `)
    }
  },
  {
    version: 13,
    name: 'tags-sort-order',
    up: (db) => {
      // Custom manual ordering for tags, mirroring shelves.sort_order. All existing tags
      // default to 0 (falling back to alphabetical via the ORDER BY tiebreaker) until the
      // user reorders them.
      db.exec(`ALTER TABLE tags ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;`)
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
