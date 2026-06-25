import { randomUUID } from 'crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { getDb } from '../db/connection'
import { readConfig } from './config'
import * as search from './search'
import type { Annotation, NewQuote, Quote } from '../../shared/ipc'

interface BookMetaRow {
  title: string
  title_sanitized: string
  author: string | null
}

interface QuoteRow {
  id: string
  book_id: string | null
  text: string
  page: number | null
  color: string
  note_path: string | null
  used_in: string
  created: number
  annotation: string
}

interface SidecarQuote {
  id: string
  text: string
  anchor: { page: number | null; offset: number | null }
  color: string
  tags: string[]
  annotations: Annotation[]
  source: { title: string; author: string | null; page: number | null }
  used_in: string[]
}

/** Parse the stored annotation column; tolerate a legacy single-string value. */
function parseAnnotations(raw: string): Annotation[] {
  if (!raw) return []
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v) ? (v as Annotation[]) : []
  } catch {
    return [{ id: randomUUID(), text: raw, createdAt: Date.now() }]
  }
}

function citationFor(b: BookMetaRow, page: number | null): string {
  const head = b.author ? `${b.author}, ${b.title}` : b.title
  return page ? `${head}, p. ${page}` : head
}

function bookMeta(bookId: string): BookMetaRow | undefined {
  return getDb()
    .prepare('SELECT title, title_sanitized, author FROM books WHERE id = ?')
    .get(bookId) as BookMetaRow | undefined
}

function noteRelPath(sanitized: string): string {
  return `notes/${sanitized}/${sanitized}.md`
}

function ensureNote(vault: string, b: BookMetaRow): string {
  const rel = noteRelPath(b.title_sanitized)
  const abs = join(vault, rel)
  if (!existsSync(abs)) {
    mkdirSync(dirname(abs), { recursive: true })
    const fm =
      `---\n` +
      `title: ${b.title.replace(/\r?\n/g, ' ')}\n` +
      `author: ${b.author ?? ''}\n` +
      `type: book-note\n` +
      `---\n\n# ${b.title}\n\n`
    writeFileSync(abs, fm, 'utf-8')
  }
  return rel
}

/** Markdown for one quote: the blockquote, its citation, then any annotations. */
function buildBlock(id: string, text: string, citation: string, annotations: Annotation[]): string {
  const quoted = text.replace(/\r?\n+/g, '\n> ')
  const body = annotations
    .map((a) => a.text.trim())
    .filter(Boolean)
    .join('\n\n')
  const ann = body ? `\n${body}\n` : '\n'
  return `<!-- quote:${id} -->\n> ${quoted}\n>\n> — ${citation}\n${ann}<!-- /quote:${id} -->`
}

/** Insert or replace a quote's block in the note, keyed on its id markers. */
function upsertQuoteBlock(vault: string, rel: string, id: string, block: string): void {
  const abs = join(vault, rel)
  let txt = existsSync(abs) ? readFileSync(abs, 'utf-8') : ''
  const re = new RegExp(`<!-- quote:${id} -->[\\s\\S]*?<!-- /quote:${id} -->`)
  if (re.test(txt)) {
    txt = txt.replace(re, block)
  } else {
    txt = `${txt}${txt.endsWith('\n') ? '' : '\n'}\n${block}\n`
  }
  writeFileSync(abs, txt, 'utf-8')
}

function removeQuoteBlock(vault: string, rel: string | null, id: string): void {
  if (!rel) return
  const abs = join(vault, rel)
  if (!existsSync(abs)) return
  const txt = readFileSync(abs, 'utf-8')
  const re = new RegExp(`\\n?<!-- quote:${id} -->[\\s\\S]*?<!-- /quote:${id} -->\\n?`)
  writeFileSync(abs, txt.replace(re, '\n'), 'utf-8')
}

function sidecarPath(vault: string, sanitized: string): string {
  return join(vault, 'highlights', `${sanitized}.highlights.json`)
}

function readSidecar(p: string): SidecarQuote[] {
  if (!existsSync(p)) return []
  try {
    return JSON.parse(readFileSync(p, 'utf-8')) as SidecarQuote[]
  } catch {
    return []
  }
}

function writeSidecar(p: string, list: SidecarQuote[]): void {
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(p, JSON.stringify(list, null, 2), 'utf-8')
}

function rowToQuote(r: QuoteRow): Quote {
  const b = r.book_id ? bookMeta(r.book_id) : undefined
  const tags = (
    getDb()
      .prepare(
        'SELECT t.name FROM quote_tags qt JOIN tags t ON t.id = qt.tag_id WHERE qt.quote_id = ? ORDER BY t.name'
      )
      .all(r.id) as { name: string }[]
  ).map((x) => x.name)
  let usedIn: string[] = []
  try {
    usedIn = JSON.parse(r.used_in || '[]') as string[]
  } catch {
    usedIn = []
  }
  return {
    id: r.id,
    bookId: r.book_id ?? '',
    text: r.text,
    page: r.page,
    color: r.color,
    tags,
    annotations: parseAnnotations(r.annotation ?? ''),
    citation: b ? citationFor(b, r.page) : '',
    notePath: r.note_path,
    usedIn,
    createdAt: r.created
  }
}

/** Refresh the FTS row for a quote (text + annotations + tags). */
function reindexQuote(quoteId: string): void {
  const row = getDb().prepare('SELECT * FROM quotes WHERE id = ?').get(quoteId) as QuoteRow | undefined
  if (!row) return
  const q = rowToQuote(row)
  const b = row.book_id ? bookMeta(row.book_id) : undefined
  const content = [q.text, ...q.annotations.map((a) => a.text), q.tags.map((t) => `#${t}`).join(' ')]
    .filter(Boolean)
    .join('\n')
  search.indexQuote({ id: q.id, bookId: q.bookId || null, content, page: q.page, title: b?.title ?? '' })
}

export function addQuote(input: NewQuote): Quote {
  const vault = readConfig().vaultPath
  const b = bookMeta(input.bookId)
  if (!vault || !b) throw new Error('Book or vault not found')

  const id = randomUUID()
  const color = input.color ?? 'amber'
  const page = input.page ?? null
  const citation = citationFor(b, page)

  const rel = ensureNote(vault, b)
  upsertQuoteBlock(vault, rel, id, buildBlock(id, input.text, citation, []))

  const sp = sidecarPath(vault, b.title_sanitized)
  const list = readSidecar(sp)
  list.push({
    id,
    text: input.text,
    anchor: { page, offset: null },
    color,
    tags: [],
    annotations: [],
    source: { title: b.title, author: b.author, page },
    used_in: [rel]
  })
  writeSidecar(sp, list)

  getDb()
    .prepare(
      `INSERT INTO quotes (id, book_id, text, page, color, note_path, used_in, created)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(id, input.bookId, input.text, page, color, rel, JSON.stringify([rel]), Date.now())
  getDb().prepare('UPDATE books SET quote_count = quote_count + 1 WHERE id = ?').run(input.bookId)

  reindexQuote(id)
  const row = getDb().prepare('SELECT * FROM quotes WHERE id = ?').get(id) as QuoteRow
  return rowToQuote(row)
}

export function listQuotes(bookId: string): Quote[] {
  const rows = getDb()
    .prepare('SELECT * FROM quotes WHERE book_id = ? ORDER BY page IS NULL, page, created')
    .all(bookId) as QuoteRow[]
  return rows.map(rowToQuote)
}

function updateSidecarTags(quoteId: string, bookId: string | null, tags: string[]): void {
  const vault = readConfig().vaultPath
  if (!vault || !bookId) return
  const b = bookMeta(bookId)
  if (!b) return
  const sp = sidecarPath(vault, b.title_sanitized)
  const list = readSidecar(sp)
  const entry = list.find((q) => q.id === quoteId)
  if (entry) {
    entry.tags = tags
    writeSidecar(sp, list)
  }
}

export function setQuoteTags(quoteId: string, tagNames: string[]): void {
  const db = getDb()
  const cleaned = tagNames.map((t) => t.trim().replace(/^#/, '').toLowerCase()).filter(Boolean)
  const bookId = (db.prepare('SELECT book_id FROM quotes WHERE id = ?').get(quoteId) as
    | { book_id: string | null }
    | undefined)?.book_id ?? null
  db.transaction(() => {
    db.prepare('DELETE FROM quote_tags WHERE quote_id = ?').run(quoteId)
    const getTag = db.prepare('SELECT id FROM tags WHERE name = ?')
    const insTag = db.prepare('INSERT INTO tags (id, name) VALUES (?, ?)')
    const insJoin = db.prepare('INSERT OR IGNORE INTO quote_tags (quote_id, tag_id) VALUES (?, ?)')
    for (const name of cleaned) {
      const existing = getTag.get(name) as { id: string } | undefined
      const tagId = existing ? existing.id : randomUUID()
      if (!existing) insTag.run(tagId, name)
      insJoin.run(quoteId, tagId)
    }
  })()
  updateSidecarTags(quoteId, bookId, cleaned)
  reindexQuote(quoteId)
}

export function setQuoteAnnotations(quoteId: string, annotations: Annotation[]): void {
  const vault = readConfig().vaultPath
  const r = getDb().prepare('SELECT * FROM quotes WHERE id = ?').get(quoteId) as QuoteRow | undefined
  if (!r) return
  getDb()
    .prepare('UPDATE quotes SET annotation = ? WHERE id = ?')
    .run(JSON.stringify(annotations), quoteId)
  if (!vault || !r.book_id) return
  const b = bookMeta(r.book_id)
  if (!b) return
  const sp = sidecarPath(vault, b.title_sanitized)
  const list = readSidecar(sp)
  const entry = list.find((q) => q.id === quoteId)
  if (entry) {
    entry.annotations = annotations
    writeSidecar(sp, list)
  }
  if (r.note_path) {
    upsertQuoteBlock(
      vault,
      r.note_path,
      quoteId,
      buildBlock(quoteId, r.text, citationFor(b, r.page), annotations)
    )
  }
  reindexQuote(quoteId)
}

export function deleteQuote(quoteId: string): void {
  const vault = readConfig().vaultPath
  const r = getDb().prepare('SELECT * FROM quotes WHERE id = ?').get(quoteId) as QuoteRow | undefined
  if (!r) return
  if (vault) {
    removeQuoteBlock(vault, r.note_path, quoteId)
    if (r.book_id) {
      const b = bookMeta(r.book_id)
      if (b) {
        const sp = sidecarPath(vault, b.title_sanitized)
        writeSidecar(
          sp,
          readSidecar(sp).filter((q) => q.id !== quoteId)
        )
      }
    }
  }
  getDb().prepare('DELETE FROM quotes WHERE id = ?').run(quoteId)
  search.removeQuote(quoteId)
  if (r.book_id) {
    getDb()
      .prepare('UPDATE books SET quote_count = MAX(0, quote_count - 1) WHERE id = ?')
      .run(r.book_id)
  }
}
