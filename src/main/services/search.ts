import { getDb } from '../db/connection'
import type { SearchHit, SearchScope } from '../../shared/ipc'
import { formatBocRef, type BocDocumentCode } from '../../shared/bookOfConcord'

/** Turn a user query into a safe FTS5 MATCH string: unicode tokens, each prefix-matched. */
function ftsQuery(raw: string): string {
  const tokens = raw.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []
  return tokens.map((t) => `${t}*`).join(' ')
}

interface HitRow {
  kind: 'page' | 'quote' | 'note' | 'scripture'
  bookId: string | null
  ref: string | null
  page: number | null
  title: string
  snippet: string
  usedIn: string | null
}

export function search(query: string, scope: SearchScope): SearchHit[] {
  const match = ftsQuery(query)
  if (!match) return []

  const where: string[] = ['search_fts MATCH @q']
  const params: Record<string, string> = { q: match }
  if (scope.kind && scope.kind !== 'all') {
    where.push('search_fts.kind = @kind')
    params.kind = scope.kind
  }
  if (scope.bookId) {
    where.push('search_fts.book_id = @bookId')
    params.bookId = scope.bookId
  }
  if (scope.shelfId) {
    where.push('search_fts.book_id IN (SELECT book_id FROM book_shelves WHERE shelf_id = @shelfId)')
    params.shelfId = scope.shelfId
  }
  if (scope.tag) {
    where.push(
      'search_fts.book_id IN (SELECT bt.book_id FROM book_tags bt JOIN tags t ON t.id = bt.tag_id WHERE t.name = @tag)'
    )
    params.tag = scope.tag
  }
  if (scope.items) {
    // Restrict to exactly this set of sources (a project's collection). Books match on
    // book_id (covers both indexed pages and quotes saved from that book); notes and scripture
    // chapters match on ref. An items scope with nothing indexable in it matches no rows.
    const bookIds = scope.items.filter((i) => i.kind === 'book').map((i) => i.id)
    const notePaths = scope.items.filter((i) => i.kind === 'note').map((i) => i.path)
    const scriptureRefs = scope.items
      .filter((i) => i.kind === 'scripture')
      .map((i) => `${i.book}:${i.chapter}`)
    const parts: string[] = []
    bookIds.forEach((id, i) => (params[`bid${i}`] = id))
    if (bookIds.length) {
      parts.push(`search_fts.book_id IN (${bookIds.map((_, i) => `@bid${i}`).join(',')})`)
    }
    notePaths.forEach((p, i) => (params[`np${i}`] = p))
    if (notePaths.length) {
      parts.push(
        `(search_fts.kind = 'note' AND search_fts.ref IN (${notePaths.map((_, i) => `@np${i}`).join(',')}))`
      )
    }
    scriptureRefs.forEach((r, i) => (params[`sr${i}`] = r))
    if (scriptureRefs.length) {
      parts.push(
        `(search_fts.kind = 'scripture' AND search_fts.ref IN (${scriptureRefs.map((_, i) => `@sr${i}`).join(',')}))`
      )
    }
    where.push(parts.length ? `(${parts.join(' OR ')})` : '0')
  }

  const rows = getDb()
    .prepare(
      `SELECT search_fts.kind AS kind, search_fts.book_id AS bookId, search_fts.ref AS ref,
              search_fts.page AS page, search_fts.title AS title,
              snippet(search_fts, 0, '⟦', '⟧', '…', 14) AS snippet,
              quotes.used_in AS usedIn
       FROM search_fts
       LEFT JOIN quotes ON quotes.id = search_fts.ref
       WHERE ${where.join(' AND ')}
       ORDER BY rank
       LIMIT 200`
    )
    .all(params) as HitRow[]

  return rows.map((r) => {
    let usedInCount = 0
    if (r.kind === 'quote' && r.usedIn) {
      try {
        const arr = JSON.parse(r.usedIn) as string[]
        usedInCount = Array.isArray(arr) ? arr.length : 0
      } catch {
        usedInCount = 0
      }
    }
    return {
      kind: r.kind,
      bookId: r.bookId,
      ref: r.ref,
      page: r.page,
      title: r.title,
      snippet: r.snippet,
      usedInCount
    }
  })
}

// ---------- Index maintenance ----------

export function indexBookText(
  bookId: string,
  title: string,
  pages: { page: number; text: string }[]
): void {
  const db = getDb()
  db.transaction(() => {
    db.prepare("DELETE FROM search_fts WHERE kind = 'page' AND book_id = ?").run(bookId)
    const ins = db.prepare(
      "INSERT INTO search_fts (content, kind, book_id, ref, page, title) VALUES (?, 'page', ?, NULL, ?, ?)"
    )
    for (const p of pages) {
      if (p.text.trim()) ins.run(p.text, bookId, p.page, title)
    }
    db.prepare('UPDATE books SET indexed = 1 WHERE id = ?').run(bookId)
  })()
}

export function indexQuote(p: {
  id: string
  bookId: string | null
  content: string
  page: number | null
  title: string
}): void {
  const db = getDb()
  db.prepare("DELETE FROM search_fts WHERE kind = 'quote' AND ref = ?").run(p.id)
  db.prepare(
    "INSERT INTO search_fts (content, kind, book_id, ref, page, title) VALUES (?, 'quote', ?, ?, ?, ?)"
  ).run(p.content, p.bookId, p.id, p.page, p.title)
}

export function removeQuote(id: string): void {
  getDb().prepare("DELETE FROM search_fts WHERE kind = 'quote' AND ref = ?").run(id)
}

export function indexNote(path: string, title: string, content: string): void {
  const db = getDb()
  db.prepare("DELETE FROM search_fts WHERE kind = 'note' AND ref = ?").run(path)
  if (content.trim()) {
    db.prepare(
      "INSERT INTO search_fts (content, kind, book_id, ref, page, title) VALUES (?, 'note', NULL, ?, NULL, ?)"
    ).run(content, path, title)
  }
}

export function removeNote(path: string): void {
  getDb().prepare("DELETE FROM search_fts WHERE kind = 'note' AND ref = ?").run(path)
}

export function removeBook(bookId: string): void {
  getDb()
    .prepare("DELETE FROM search_fts WHERE book_id = ? AND kind IN ('page', 'quote')")
    .run(bookId)
}

/**
 * Index a Bible chapter's verses for search — BSB only, hard-guarded here (not just by caller
 * discipline), since copyrighted translations (NKJV/NASB/ESV) must never be persisted to disk.
 * `ref` is "<USFM code>:<chapter>" (e.g. "JHN:3"), matching how project scripture items and
 * SearchScope.items build their scripture refs.
 */
export function indexScriptureChapter(
  translation: string,
  book: string,
  chapter: number,
  title: string,
  verses: { verse: number; text: string }[]
): void {
  if (translation !== 'BSB') return
  const db = getDb()
  const ref = `${book}:${chapter}`
  db.prepare("DELETE FROM search_fts WHERE kind = 'scripture' AND ref = ?").run(ref)
  const ins = db.prepare(
    "INSERT INTO search_fts (content, kind, book_id, ref, page, title) VALUES (?, 'scripture', NULL, ?, ?, ?)"
  )
  for (const v of verses) {
    if (v.text.trim()) ins.run(v.text, ref, v.verse, title)
  }
}

/**
 * Index a Book of Concord source's sections for search — one `search_fts` row per
 * `boc_texts` row belonging to `sourceId`. `book_id` (a generic id column, not FK'd to
 * `books`) holds the BoC source id so re-indexing/removal can scope by source the same
 * way `indexBookText`/`removeBook` scope by book, and `ref` is the citable
 * "<document code>:<ordinal>" produced by `formatBocRef` (e.g. "AC:4").
 */
export function indexBocForSearch(sourceId: string): void {
  const db = getDb()
  const rows = db
    .prepare(
      `SELECT document_code AS documentCode, section_ordinal AS ordinal, section_label AS label, text
       FROM boc_texts WHERE source_id = ? ORDER BY document_code, section_ordinal`
    )
    .all(sourceId) as { documentCode: BocDocumentCode; ordinal: number; label: string; text: string }[]
  db.transaction(() => {
    db.prepare("DELETE FROM search_fts WHERE kind = 'confession' AND book_id = ?").run(sourceId)
    const ins = db.prepare(
      "INSERT INTO search_fts (content, kind, book_id, ref, page, title) VALUES (?, 'confession', ?, ?, NULL, ?)"
    )
    for (const r of rows) {
      if (!r.text.trim()) continue
      ins.run(r.text, sourceId, formatBocRef(r.documentCode, r.ordinal), r.label)
    }
  })()
}

export function removeBocFromSearch(sourceId: string): void {
  getDb().prepare("DELETE FROM search_fts WHERE kind = 'confession' AND book_id = ?").run(sourceId)
}

export function unindexedBooks(): { id: string; title: string }[] {
  return getDb()
    .prepare('SELECT id, title FROM books WHERE indexed = 0 AND pdf_path IS NOT NULL')
    .all() as { id: string; title: string }[]
}
