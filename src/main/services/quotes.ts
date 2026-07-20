import { randomUUID } from 'crypto'
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { getDb } from '../db/connection'
import { localVaultDir } from './config'
import * as search from './search'
import {
  bocCitation,
  formatCitation,
  parseAuthors,
  scriptureCitation,
  type BocCiteRef,
  type CitationSource,
  type ScriptureCiteRef
} from '../../shared/citation'
import { bookByCode } from '../../shared/scriptureRef'
import { bocDocument, formatBocRef, parseBocRef, type BocDocumentCode } from '../../shared/bookOfConcord'
import { groupValuesById, sanitizeName } from './library'
import type {
  Annotation,
  BocQuoteInput,
  CommentaryQuoteInput,
  NewQuote,
  NewScriptureHighlight,
  Quote,
  QuoteGroups,
  ScriptureHighlight,
  ScriptureQuoteBook
} from '../../shared/ipc'

interface BookMetaRow {
  title: string
  title_sanitized: string
  author: string | null
  publisher: string | null
  city: string | null
  year: number | null
  page_offset: number
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
  scripture_ref: string | null
  scripture_translation: string | null
  commentary_source_id: string | null
  commentary_ref: string | null
  citation_override: string | null
  boc_source_id: string | null
  boc_commentary_source_id: string | null
  boc_ref: string | null
  boc_section_number: string | null
  boc_section_label: string | null
  boc_paragraph: number | null
}

/** Parse a stored canonical ref like "JHN 3:16-18" into its parts. */
function parseScriptureRef(
  ref: string,
  abbr: string
): ScriptureCiteRef | null {
  const m = ref.match(/^(\S+)\s+(\d+):(\d+)(?:-(\d+))?$/)
  if (!m) return null
  const def = bookByCode(m[1])
  return {
    bookName: def?.name ?? m[1],
    chapter: Number(m[2]),
    verseStart: Number(m[3]),
    verseEnd: m[4] ? Number(m[4]) : null,
    abbr
  }
}

/** Human ref label from parsed parts, e.g. "James 1:1" / "James 1:1-3". */
function refLabelOf(sref: ScriptureCiteRef): string {
  const end = sref.verseEnd && sref.verseEnd !== sref.verseStart ? `-${sref.verseEnd}` : ''
  return `${sref.bookName} ${sref.chapter}:${sref.verseStart}${end}`
}

/** The leading USFM book code from a stored ref like "JHN 3:16-18". */
function refBookCode(ref: string): string {
  return ref.split(' ')[0]
}

interface CommentarySourceRow {
  display_name: string
  author: string | null
}

function commentarySourceMeta(id: string): CommentarySourceRow | undefined {
  return getDb()
    .prepare('SELECT display_name, author FROM commentary_sources WHERE id = ?')
    .get(id) as CommentarySourceRow | undefined
}

interface BocSourceMetaRow {
  display_name: string
  author: string | null
}

function bocSourceMeta(id: string): BocSourceMetaRow | undefined {
  return getDb()
    .prepare('SELECT display_name, author FROM boc_sources WHERE id = ?')
    .get(id) as BocSourceMetaRow | undefined
}

function bocCommentarySourceMeta(id: string): BocSourceMetaRow | undefined {
  return getDb()
    .prepare('SELECT display_name, author FROM boc_commentary_sources WHERE id = ?')
    .get(id) as BocSourceMetaRow | undefined
}

/** Per-call lookup caches for the list paths, so mapping N quote rows doesn't run a tag query
 *  per row and re-fetch the same book/source metadata once per quote (it stalled the Quotes
 *  view — and thus IPC — the same way the library's per-book queries did). Omitted for
 *  single-quote calls, which just hit the database directly. */
interface QuoteListCtx {
  tagsByQuote: Map<string, string[]>
  bookMetaById: Map<string, BookMetaRow | undefined>
  sourceById: Map<string, CommentarySourceRow | undefined>
  bocSourceById: Map<string, BocSourceMetaRow | undefined>
  bocCommentarySourceById: Map<string, BocSourceMetaRow | undefined>
}

function metaBook(id: string, ctx?: QuoteListCtx): BookMetaRow | undefined {
  if (!ctx) return bookMeta(id)
  if (!ctx.bookMetaById.has(id)) ctx.bookMetaById.set(id, bookMeta(id))
  return ctx.bookMetaById.get(id)
}

function metaSource(id: string, ctx?: QuoteListCtx): CommentarySourceRow | undefined {
  if (!ctx) return commentarySourceMeta(id)
  if (!ctx.sourceById.has(id)) ctx.sourceById.set(id, commentarySourceMeta(id))
  return ctx.sourceById.get(id)
}

function metaBocSource(id: string, ctx?: QuoteListCtx): BocSourceMetaRow | undefined {
  if (!ctx) return bocSourceMeta(id)
  if (!ctx.bocSourceById.has(id)) ctx.bocSourceById.set(id, bocSourceMeta(id))
  return ctx.bocSourceById.get(id)
}

function metaBocCommentarySource(id: string, ctx?: QuoteListCtx): BocSourceMetaRow | undefined {
  if (!ctx) return bocCommentarySourceMeta(id)
  if (!ctx.bocCommentarySourceById.has(id)) ctx.bocCommentarySourceById.set(id, bocCommentarySourceMeta(id))
  return ctx.bocCommentarySourceById.get(id)
}

/** One grouped tag query for a whole listing, plus empty metadata caches to fill lazily. */
function buildQuoteListCtx(): QuoteListCtx {
  const tagRows = getDb()
    .prepare('SELECT qt.quote_id, t.name FROM quote_tags qt JOIN tags t ON t.id = qt.tag_id ORDER BY t.name')
    .all() as { quote_id: string; name: string }[]
  return {
    tagsByQuote: groupValuesById(tagRows, (r) => r.quote_id, (r) => r.name),
    bookMetaById: new Map(),
    sourceById: new Map(),
    bocSourceById: new Map(),
    bocCommentarySourceById: new Map()
  }
}

/** Citation for a commentary quote: "Author, *Source*, James 1:1" (author omitted if absent). */
function commentaryCitationOf(src: CommentarySourceRow, ref: string | null): string {
  const sref = ref ? parseScriptureRef(ref, '') : null
  const parts = [src.author?.trim() || '', `*${src.display_name}*`, sref ? refLabelOf(sref) : '']
  return parts.filter(Boolean).join(', ')
}

/** Citation for a Book of Concord quote (primary-text or commentary): "AC IV, 2 (Reader's
 *  Edition)". `abbreviation` comes from the document registry; everything else is whatever
 *  was captured on the row at quote time (see migration 19's rationale). */
function bocCitationOf(
  abbreviation: string,
  sectionNumber: string | null,
  sectionLabel: string | null,
  paragraph: number | null,
  src: BocSourceMetaRow
): string {
  const ref: BocCiteRef = {
    abbreviation,
    sectionNumber,
    sectionLabel: sectionLabel ?? '',
    paragraph,
    sourceName: src.display_name
  }
  return bocCitation(ref)
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

function sourceFor(b: BookMetaRow): CitationSource {
  return {
    kind: 'book',
    authors: parseAuthors(b.author),
    title: b.title,
    publisher: b.publisher,
    city: b.city,
    year: b.year
  }
}

/** Printed page = stored (PDF) page minus the book's front-matter offset. */
function printedPage(b: BookMetaRow, page: number | null): number | null {
  if (page == null) return null
  return page - (b.page_offset ?? 0)
}

function citationFor(b: BookMetaRow, page: number | null): string {
  return formatCitation(sourceFor(b), 'footnote', printedPage(b, page))
}

/** CMOS 18 bibliography entries for every book that has at least one quote. */
export function buildBibliography(): { entry: string; quotes: number }[] {
  const rows = getDb()
    .prepare(
      `SELECT b.title, b.author, b.publisher, b.city, b.year,
              (SELECT COUNT(*) FROM quotes q WHERE q.book_id = b.id) AS qn
       FROM books b
       WHERE EXISTS (SELECT 1 FROM quotes q WHERE q.book_id = b.id)`
    )
    .all() as {
    title: string
    author: string | null
    publisher: string | null
    city: string | null
    year: number | null
    qn: number
  }[]
  const items = rows.map((r) => {
    const authors = parseAuthors(r.author)
    const src: CitationSource = {
      kind: 'book',
      authors,
      title: r.title,
      publisher: r.publisher,
      city: r.city,
      year: r.year
    }
    const sortKey = (authors[0]?.trim().split(/\s+/).pop() || r.title).toLowerCase()
    return { entry: formatCitation(src, 'bibliography', null), quotes: r.qn, sortKey }
  })
  items.sort((a, b) => a.sortKey.localeCompare(b.sortKey))
  return items.map((x) => ({ entry: x.entry, quotes: x.quotes }))
}

function bookMeta(bookId: string): BookMetaRow | undefined {
  return getDb()
    .prepare(
      'SELECT title, title_sanitized, author, publisher, city, year, page_offset FROM books WHERE id = ?'
    )
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

/**
 * These per-book/scripture/commentary note files exist solely to hold quote blocks. Once the
 * last quote is removed, the file is just frontmatter + a heading — dead weight that still syncs
 * to Drive. Delete it entirely rather than leave an empty husk (it's recreated on demand the next
 * time a quote is captured for that book/passage/source).
 */
function pruneNoteIfEmpty(vault: string, rel: string | null): void {
  if (!rel) return
  const abs = join(vault, rel)
  if (!existsSync(abs)) return
  const txt = readFileSync(abs, 'utf-8')
  if (txt.includes('<!-- quote:')) return
  unlinkSync(abs)
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

/**
 * The citation for a quote's row: the user's hand-edited override if set, else auto-generated
 * from whichever source the quote is anchored to (book, Scripture ref, or commentary source).
 * Centralized so every mirror-writing call site (and the frontend, for non-book quotes) agrees.
 */
function citationForRow(r: QuoteRow, ctx?: QuoteListCtx): string {
  if (r.citation_override) return r.citation_override
  if (r.book_id) {
    const b = metaBook(r.book_id, ctx)
    if (b) return citationFor(b, r.page)
  }
  if (r.scripture_ref) {
    const sref = parseScriptureRef(r.scripture_ref, r.scripture_translation ?? '')
    if (sref) return scriptureCitation(sref)
  }
  if (r.commentary_source_id) {
    const src = metaSource(r.commentary_source_id, ctx)
    if (src) return commentaryCitationOf(src, r.commentary_ref)
  }
  if (r.boc_ref && (r.boc_source_id || r.boc_commentary_source_id)) {
    const parsed = parseBocRef(r.boc_ref)
    const doc = parsed ? bocDocument(parsed.code) : undefined
    const src = r.boc_source_id
      ? metaBocSource(r.boc_source_id, ctx)
      : metaBocCommentarySource(r.boc_commentary_source_id as string, ctx)
    if (doc && src) {
      return bocCitationOf(doc.abbreviation, r.boc_section_number, r.boc_section_label, r.boc_paragraph, src)
    }
  }
  return ''
}

function rowToQuote(r: QuoteRow, ctx?: QuoteListCtx): Quote {
  const tags = ctx
    ? (ctx.tagsByQuote.get(r.id) ?? [])
    : (
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
  let scriptureChapter: number | undefined
  let scriptureBook: string | undefined
  let verseStart: number | undefined
  let verseEnd: number | undefined
  if (r.scripture_ref) {
    const sref = parseScriptureRef(r.scripture_ref, r.scripture_translation ?? '')
    if (sref) {
      scriptureChapter = sref.chapter
      scriptureBook = refBookCode(r.scripture_ref)
      verseStart = sref.verseStart
      verseEnd = sref.verseEnd ?? sref.verseStart
    }
  }
  let commentarySource: string | undefined
  let commentaryAuthor: string | undefined
  let commentaryRef: string | undefined
  if (r.commentary_source_id) {
    const src = metaSource(r.commentary_source_id, ctx)
    const sref = r.commentary_ref ? parseScriptureRef(r.commentary_ref, '') : null
    if (src) {
      commentarySource = src.display_name
      commentaryAuthor = src.author ?? undefined
      commentaryRef = sref ? refLabelOf(sref) : (r.commentary_ref ?? undefined)
      if (sref && r.commentary_ref) {
        scriptureChapter = sref.chapter
        scriptureBook = refBookCode(r.commentary_ref)
        verseStart = sref.verseStart
        verseEnd = sref.verseEnd ?? sref.verseStart
      }
    }
  }
  return {
    id: r.id,
    bookId: r.book_id ?? '',
    text: r.text,
    page: r.page,
    color: r.color,
    tags,
    annotations: parseAnnotations(r.annotation ?? ''),
    citation: citationForRow(r, ctx),
    citationOverride: r.citation_override ?? undefined,
    notePath: r.note_path,
    usedIn,
    createdAt: r.created,
    scriptureChapter,
    commentarySource,
    commentaryAuthor,
    commentaryRef,
    scriptureBook,
    verseStart,
    verseEnd
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
  const title = b?.title ?? q.citation
  search.indexQuote({ id: q.id, bookId: q.bookId || null, content, page: q.page, title })
}

export function addQuote(input: NewQuote): Quote {
  const vault = localVaultDir()
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
  const ctx = buildQuoteListCtx()
  return rows.map((r) => rowToQuote(r, ctx))
}

// Scripture highlights live in one note per translation+book, with `## Chapter N` sections —
// the location-anchored analog of a book's auto-note.
function scriptureNoteRel(translation: string, bookName: string): string {
  return `notes/scripture/${sanitizeName(translation)}/${sanitizeName(bookName)}.md`
}

function ensureScriptureNote(vault: string, translation: string, bookName: string): string {
  const rel = scriptureNoteRel(translation, bookName)
  const abs = join(vault, rel)
  if (!existsSync(abs)) {
    mkdirSync(dirname(abs), { recursive: true })
    const fm =
      `---\n` +
      `title: ${translation} — ${bookName}\n` +
      `type: scripture-note\n` +
      `translation: ${translation}\n` +
      `---\n\n# ${translation} — ${bookName}\n`
    writeFileSync(abs, fm, 'utf-8')
  }
  return rel
}

/** Insert (or replace) a quote block under its `## Chapter N` section, keeping chapters ordered. */
function upsertScriptureBlock(
  vault: string,
  rel: string,
  chapter: number,
  id: string,
  block: string
): void {
  const abs = join(vault, rel)
  let txt = existsSync(abs) ? readFileSync(abs, 'utf-8') : ''
  // Replace in place if this quote already has a block anywhere in the note.
  const reBlock = new RegExp(`<!-- quote:${id} -->[\\s\\S]*?<!-- /quote:${id} -->`)
  if (reBlock.test(txt)) {
    writeFileSync(abs, txt.replace(reBlock, block), 'utf-8')
    return
  }
  const lines = txt.split('\n')
  const heads: { idx: number; n: number }[] = []
  lines.forEach((ln, i) => {
    const m = ln.match(/^##\s+Chapter\s+(\d+)\s*$/)
    if (m) heads.push({ idx: i, n: Number(m[1]) })
  })
  const section = heads.find((h) => h.n === chapter)
  if (section) {
    // Append at the end of this chapter's section (before the next `## ` or EOF).
    const laterIdxs = heads.filter((h) => h.idx > section.idx).map((h) => h.idx)
    const end = laterIdxs.length ? Math.min(...laterIdxs) : lines.length
    lines.splice(end, 0, '', block, '')
  } else {
    // New chapter heading, inserted in numeric order.
    const after = heads.find((h) => h.n > chapter)
    const chunk = ['', `## Chapter ${chapter}`, '', block, '']
    if (after) lines.splice(after.idx, 0, ...chunk)
    else lines.push(...chunk)
  }
  writeFileSync(abs, lines.join('\n'), 'utf-8')
}

/**
 * Save a verse-range highlight as a citeable Scripture quote (no book_id). The verse text is
 * stored and auto-homed into the per-book scripture note under its chapter section — the
 * location-anchored analog of a PDF highlight. Restricted by the caller to public-domain
 * translations (BSB), so storing the text is licence-safe.
 */
export function addScriptureQuote(input: NewScriptureHighlight): Quote {
  const vault = localVaultDir()
  if (!vault) throw new Error('No vault')
  const def = bookByCode(input.book)
  const bookName = def?.name ?? input.book
  const id = randomUUID()
  const color = input.color ?? 'amber'
  const end = input.verseEnd && input.verseEnd !== input.verseStart ? input.verseEnd : null
  const ref = `${input.book} ${input.chapter}:${input.verseStart}${end ? `-${end}` : ''}`
  const citation = scriptureCitation({
    bookName,
    chapter: input.chapter,
    verseStart: input.verseStart,
    verseEnd: end,
    abbr: input.translation
  })

  const rel = ensureScriptureNote(vault, input.translation, bookName)
  upsertScriptureBlock(vault, rel, input.chapter, id, buildBlock(id, input.text, citation, []))

  getDb()
    .prepare(
      `INSERT INTO quotes
         (id, book_id, text, page, color, note_path, used_in, created, scripture_ref, scripture_translation)
       VALUES (?, NULL, ?, NULL, ?, ?, ?, ?, ?, ?)`
    )
    .run(id, input.text, color, rel, JSON.stringify([rel]), Date.now(), ref, input.translation)

  reindexQuote(id)
  const row = getDb().prepare('SELECT * FROM quotes WHERE id = ?').get(id) as QuoteRow
  return rowToQuote(row)
}

/** All saved Scripture quotes for a book, ordered by chapter then verse (for the panel). */
export function listScriptureQuotes(translation: string, book: string): Quote[] {
  const rows = getDb()
    .prepare('SELECT * FROM quotes WHERE scripture_translation = ? AND scripture_ref LIKE ?')
    .all(translation, `${book} %`) as QuoteRow[]
  const keyed = rows.map((r) => {
    const m = (r.scripture_ref ?? '').match(/\s(\d+):(\d+)/)
    return { r, ch: m ? Number(m[1]) : 0, vs: m ? Number(m[2]) : 0 }
  })
  keyed.sort((a, b) => a.ch - b.ch || a.vs - b.vs || a.r.created - b.r.created)
  const ctx = buildQuoteListCtx()
  return keyed.map((x) => rowToQuote(x.r, ctx))
}

/** Books (for a translation) that have at least one saved Scripture quote. */
export function listScriptureQuoteBooks(translation: string): ScriptureQuoteBook[] {
  const rows = getDb()
    .prepare('SELECT scripture_ref FROM quotes WHERE scripture_translation = ? AND scripture_ref IS NOT NULL')
    .all(translation) as { scripture_ref: string }[]
  const counts = new Map<string, number>()
  for (const r of rows) {
    const code = r.scripture_ref.split(' ')[0]
    if (code) counts.set(code, (counts.get(code) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([book, count]) => ({ book, name: bookByCode(book)?.name ?? book, count }))
    .sort((a, b) => (bookByCode(a.book)?.order ?? 0) - (bookByCode(b.book)?.order ?? 0))
}

/** Existing scripture highlights for a chapter, so the reader can re-mark verses. */
export function listScriptureHighlights(
  translation: string,
  book: string,
  chapter: number
): ScriptureHighlight[] {
  const rows = getDb()
    .prepare(
      `SELECT id, color, scripture_ref FROM quotes
       WHERE scripture_translation = ? AND scripture_ref LIKE ?`
    )
    .all(translation, `${book} ${chapter}:%`) as {
    id: string
    color: string
    scripture_ref: string
  }[]
  const out: ScriptureHighlight[] = []
  for (const r of rows) {
    const m = r.scripture_ref.match(/:(\d+)(?:-(\d+))?$/)
    if (!m) continue
    const verseStart = Number(m[1])
    out.push({ id: r.id, verseStart, verseEnd: m[2] ? Number(m[2]) : verseStart, color: r.color })
  }
  return out
}

function updateSidecarTags(quoteId: string, bookId: string | null, tags: string[]): void {
  const vault = localVaultDir()
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
  const vault = localVaultDir()
  const r = getDb().prepare('SELECT * FROM quotes WHERE id = ?').get(quoteId) as QuoteRow | undefined
  if (!r) return
  getDb()
    .prepare('UPDATE quotes SET annotation = ? WHERE id = ?')
    .run(JSON.stringify(annotations), quoteId)

  // Mirror into whichever note the quote lives in — book note, per-book Scripture note, or
  // per-source commentary note. This previously bailed for non-book quotes (book_id null), so
  // annotations on Scripture/commentary quotes never reached the vault file or the search index,
  // unlike setQuoteText. Route through remirrorQuoteBlock so each type lands in the right place.
  if (vault && r.note_path) {
    remirrorQuoteBlock(vault, r, r.text, citationForRow(r), annotations)
    // Book quotes also carry annotations in the PDF highlights sidecar.
    if (r.book_id) {
      const b = bookMeta(r.book_id)
      if (b) {
        const sp = sidecarPath(vault, b.title_sanitized)
        const list = readSidecar(sp)
        const entry = list.find((q) => q.id === quoteId)
        if (entry) {
          entry.annotations = annotations
          writeSidecar(sp, list)
        }
      }
    }
  }
  reindexQuote(quoteId)
}

/** Re-mirror a quote's block wherever it lives — the flat mirror for book/commentary quotes, or
 *  the chaptered mirror for Scripture quotes. */
function remirrorQuoteBlock(
  vault: string,
  r: QuoteRow,
  text: string,
  citation: string,
  annotations: Annotation[]
): void {
  if (!r.note_path) return
  if (r.scripture_ref) {
    const sref = parseScriptureRef(r.scripture_ref, r.scripture_translation ?? '')
    upsertScriptureBlock(
      vault,
      r.note_path,
      sref?.chapter ?? 0,
      r.id,
      buildBlock(r.id, text, citation, annotations)
    )
  } else {
    upsertQuoteBlock(vault, r.note_path, r.id, buildBlock(r.id, text, citation, annotations))
  }
}

/**
 * Replace a quote's body text (markdown, so inline bold/italic survive), and re-mirror it into
 * whichever note/sidecar the quote lives in — book note + highlights sidecar, per-book scripture
 * note, or per-source commentary note. Annotations and citation are recomputed from the row.
 */
export function setQuoteText(quoteId: string, text: string): void {
  const vault = localVaultDir()
  const r = getDb().prepare('SELECT * FROM quotes WHERE id = ?').get(quoteId) as QuoteRow | undefined
  if (!r) return
  getDb().prepare('UPDATE quotes SET text = ? WHERE id = ?').run(text, quoteId)

  if (vault && r.note_path) {
    const annotations = parseAnnotations(r.annotation ?? '')
    remirrorQuoteBlock(vault, r, text, citationForRow(r), annotations)
    // Book quotes also carry the text in the PDF highlights sidecar.
    if (r.book_id) {
      const b = bookMeta(r.book_id)
      if (b) {
        const sp = sidecarPath(vault, b.title_sanitized)
        const list = readSidecar(sp)
        const entry = list.find((x) => x.id === quoteId)
        if (entry) {
          entry.text = text
          writeSidecar(sp, list)
        }
      }
    }
  }
  reindexQuote(quoteId)
}

/**
 * Hand-edit a quote's citation (fix a typo, adjust wording) instead of always taking the
 * auto-generated one. Pass null (or an empty string) to reset back to auto-generation.
 */
export function setQuoteCitation(quoteId: string, citation: string | null): void {
  const vault = localVaultDir()
  const r = getDb().prepare('SELECT * FROM quotes WHERE id = ?').get(quoteId) as QuoteRow | undefined
  if (!r) return
  const trimmed = citation?.trim() || null
  getDb().prepare('UPDATE quotes SET citation_override = ? WHERE id = ?').run(trimmed, quoteId)

  if (vault && r.note_path) {
    const annotations = parseAnnotations(r.annotation ?? '')
    const finalCitation = trimmed ?? citationForRow({ ...r, citation_override: null })
    remirrorQuoteBlock(vault, r, r.text, finalCitation, annotations)
  }
  reindexQuote(quoteId)
}

export function deleteQuote(quoteId: string): void {
  const vault = localVaultDir()
  const r = getDb().prepare('SELECT * FROM quotes WHERE id = ?').get(quoteId) as QuoteRow | undefined
  if (!r) return
  if (vault) {
    removeQuoteBlock(vault, r.note_path, quoteId)
    pruneNoteIfEmpty(vault, r.note_path)
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

// Commentary quotes live in one note per source, mirroring the book-note / scripture-note pattern
// — a location-anchored home so a captured excerpt survives outside the DB (personal use; the text
// is copyrighted but stays local, like the commentary vault it's drawn from).
function commentaryNoteRel(displayName: string): string {
  return `notes/commentary/${sanitizeName(displayName)}.md`
}

function ensureCommentaryNote(vault: string, displayName: string): string {
  const rel = commentaryNoteRel(displayName)
  const abs = join(vault, rel)
  if (!existsSync(abs)) {
    mkdirSync(dirname(abs), { recursive: true })
    const fm =
      `---\n` +
      `title: ${displayName.replace(/\r?\n/g, ' ')}\n` +
      `type: commentary-note\n` +
      `---\n\n# ${displayName}\n`
    writeFileSync(abs, fm, 'utf-8')
  }
  return rel
}

/**
 * Capture a commentary excerpt (or a selected portion of one) as a quote. Anchored to a verse
 * ref and its source; auto-homed into the per-source commentary note. Full parity with book /
 * Scripture quotes.
 */
export function addCommentaryQuote(input: CommentaryQuoteInput): Quote {
  const vault = localVaultDir()
  if (!vault) throw new Error('No vault')
  const src = commentarySourceMeta(input.sourceId)
  if (!src) throw new Error('Commentary source not found')

  const id = randomUUID()
  const color = input.color ?? 'amber'
  const end = input.verseEnd && input.verseEnd !== input.verseStart ? input.verseEnd : null
  const ref = `${input.book} ${input.chapter}:${input.verseStart}${end ? `-${end}` : ''}`
  const citation = commentaryCitationOf(src, ref)

  const rel = ensureCommentaryNote(vault, src.display_name)
  upsertQuoteBlock(vault, rel, id, buildBlock(id, input.text, citation, []))

  getDb()
    .prepare(
      `INSERT INTO quotes
         (id, book_id, text, page, color, note_path, used_in, created, commentary_source_id, commentary_ref)
       VALUES (?, NULL, ?, NULL, ?, ?, ?, ?, ?, ?)`
    )
    .run(id, input.text, color, rel, JSON.stringify([rel]), Date.now(), input.sourceId, ref)

  reindexQuote(id)
  const row = getDb().prepare('SELECT * FROM quotes WHERE id = ?').get(id) as QuoteRow
  return rowToQuote(row)
}

// Book of Concord quotes live in one note per source (primary-text edition or commentary
// source alike), mirroring the commentary-note pattern above.
function bocNoteRel(displayName: string): string {
  return `notes/confessions/${sanitizeName(displayName)}.md`
}

function ensureBocNote(vault: string, displayName: string): string {
  const rel = bocNoteRel(displayName)
  const abs = join(vault, rel)
  if (!existsSync(abs)) {
    mkdirSync(dirname(abs), { recursive: true })
    const fm =
      `---\n` +
      `title: ${displayName.replace(/\r?\n/g, ' ')}\n` +
      `type: boc-note\n` +
      `---\n\n# ${displayName}\n`
    writeFileSync(abs, fm, 'utf-8')
  }
  return rel
}

/**
 * Capture a Book of Concord section excerpt (or a selected portion of one) as a quote.
 * Anchored to the primary-text source (`boc_source_id`) it was read from; auto-homed into the
 * per-source confessions note. Full parity with book / Scripture / commentary quotes.
 */
export function addBocQuote(input: BocQuoteInput): Quote {
  const vault = localVaultDir()
  if (!vault) throw new Error('No vault')
  const src = bocSourceMeta(input.bocSourceId)
  if (!src) throw new Error('Book of Concord source not found')

  const id = randomUUID()
  const color = input.color ?? 'amber'
  const doc = bocDocument(input.documentCode)
  const ref = formatBocRef(input.documentCode as BocDocumentCode, input.sectionOrdinal)
  const citation = bocCitationOf(
    doc?.abbreviation ?? input.documentCode,
    input.sectionNumber,
    input.sectionLabel,
    input.paragraph,
    src
  )

  const rel = ensureBocNote(vault, src.display_name)
  upsertQuoteBlock(vault, rel, id, buildBlock(id, input.text, citation, []))

  getDb()
    .prepare(
      `INSERT INTO quotes
         (id, book_id, text, page, color, note_path, used_in, created,
          boc_source_id, boc_ref, boc_section_number, boc_section_label, boc_paragraph)
       VALUES (?, NULL, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      input.text,
      color,
      rel,
      JSON.stringify([rel]),
      Date.now(),
      input.bocSourceId,
      ref,
      input.sectionNumber,
      input.sectionLabel,
      input.paragraph
    )

  reindexQuote(id)
  const row = getDb().prepare('SELECT * FROM quotes WHERE id = ?').get(id) as QuoteRow
  return rowToQuote(row)
}

/**
 * Capture a Book of Concord commentary excerpt as a quote. Same shape as `addBocQuote`, but
 * anchored to the commentary source (`boc_commentary_source_id`) instead of the primary-text
 * source, since `boc_commentary_sources` is a separate table (migration 18).
 */
export function addBocCommentaryQuote(input: BocQuoteInput): Quote {
  const vault = localVaultDir()
  if (!vault) throw new Error('No vault')
  const src = bocCommentarySourceMeta(input.bocSourceId)
  if (!src) throw new Error('Book of Concord commentary source not found')

  const id = randomUUID()
  const color = input.color ?? 'amber'
  const doc = bocDocument(input.documentCode)
  const ref = formatBocRef(input.documentCode as BocDocumentCode, input.sectionOrdinal)
  const citation = bocCitationOf(
    doc?.abbreviation ?? input.documentCode,
    input.sectionNumber,
    input.sectionLabel,
    input.paragraph,
    src
  )

  const rel = ensureBocNote(vault, src.display_name)
  upsertQuoteBlock(vault, rel, id, buildBlock(id, input.text, citation, []))

  getDb()
    .prepare(
      `INSERT INTO quotes
         (id, book_id, text, page, color, note_path, used_in, created,
          boc_commentary_source_id, boc_ref, boc_section_number, boc_section_label, boc_paragraph)
       VALUES (?, NULL, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      input.text,
      color,
      rel,
      JSON.stringify([rel]),
      Date.now(),
      input.bocSourceId,
      ref,
      input.sectionNumber,
      input.sectionLabel,
      input.paragraph
    )

  reindexQuote(id)
  const row = getDb().prepare('SELECT * FROM quotes WHERE id = ?').get(id) as QuoteRow
  return rowToQuote(row)
}

/** All saved commentary quotes for a source, ordered by chapter then verse (for the panel). */
export function listCommentaryQuotes(sourceId: string): Quote[] {
  const rows = getDb()
    .prepare('SELECT * FROM quotes WHERE commentary_source_id = ?')
    .all(sourceId) as QuoteRow[]
  const keyed = rows.map((r) => {
    const m = (r.commentary_ref ?? '').match(/\s(\d+):(\d+)/)
    return { r, ch: m ? Number(m[1]) : 0, vs: m ? Number(m[2]) : 0 }
  })
  keyed.sort((a, b) => a.ch - b.ch || a.vs - b.vs || a.r.created - b.r.created)
  const ctx = buildQuoteListCtx()
  return keyed.map((x) => rowToQuote(x.r, ctx))
}

/** Every saved quote, for cross-cutting groupings (by author, by tag) that span book/Scripture/
 *  commentary quotes alike rather than being scoped to one book/source. */
export function listAllQuotes(): Quote[] {
  const rows = getDb().prepare('SELECT * FROM quotes ORDER BY created').all() as QuoteRow[]
  const ctx = buildQuoteListCtx()
  return rows.map((r) => rowToQuote(r, ctx))
}

/** Everything with saved quotes, for the Quotes nav section (books, Bible chapters, commentary). */
export function listQuoteGroups(translation: string): QuoteGroups {
  const db = getDb()
  const books = db
    .prepare('SELECT id AS bookId, title, quote_count AS count FROM books WHERE quote_count > 0 ORDER BY title')
    .all() as QuoteGroups['books']

  // Bible chapters: group this translation's saved scripture quotes by book + chapter.
  const scriptureRows = db
    .prepare('SELECT scripture_ref FROM quotes WHERE scripture_translation = ? AND scripture_ref IS NOT NULL')
    .all(translation) as { scripture_ref: string }[]
  const chapterCounts = new Map<string, number>()
  for (const row of scriptureRows) {
    const m = row.scripture_ref.match(/^(\S+)\s+(\d+):/)
    if (!m) continue
    chapterCounts.set(`${m[1]}|${m[2]}`, (chapterCounts.get(`${m[1]}|${m[2]}`) ?? 0) + 1)
  }
  const scripture = [...chapterCounts.entries()]
    .map(([key, count]) => {
      const [book, ch] = key.split('|')
      return { book, chapter: Number(ch), name: bookByCode(book)?.name ?? book, count }
    })
    .sort(
      (a, b) => (bookByCode(a.book)?.order ?? 0) - (bookByCode(b.book)?.order ?? 0) || a.chapter - b.chapter
    )

  const commentary = db
    .prepare(
      `SELECT q.commentary_source_id AS sourceId, s.display_name AS displayName, s.author AS author,
              COUNT(*) AS count
       FROM quotes q JOIN commentary_sources s ON s.id = q.commentary_source_id
       WHERE q.commentary_source_id IS NOT NULL
       GROUP BY q.commentary_source_id
       ORDER BY s.sort_order, s.display_name`
    )
    .all() as QuoteGroups['commentary']

  // Book of Concord: one group per (source, document). A quote's source is in boc_source_id for
  // primary text and boc_commentary_source_id for notes — different tables, so resolve the
  // display name from whichever matched rather than joining one of them.
  const bocRows = db
    .prepare(
      `SELECT COALESCE(boc_source_id, boc_commentary_source_id) AS bocSourceId,
              substr(boc_ref, 1, instr(boc_ref, ':') - 1) AS documentCode,
              COUNT(*) AS count
       FROM quotes
       WHERE boc_ref IS NOT NULL AND instr(boc_ref, ':') > 0
       GROUP BY bocSourceId, documentCode`
    )
    .all() as { bocSourceId: string; documentCode: string; count: number }[]

  const bocSourceNames = new Map<string, string>()
  for (const table of ['boc_sources', 'boc_commentary_sources']) {
    for (const r of db.prepare(`SELECT id, display_name FROM ${table}`).all() as {
      id: string
      display_name: string
    }[]) {
      bocSourceNames.set(r.id, r.display_name)
    }
  }

  const boc = bocRows
    .map((r) => ({
      bocSourceId: r.bocSourceId,
      documentCode: r.documentCode,
      name: bocDocument(r.documentCode)?.title ?? r.documentCode,
      sourceName: bocSourceNames.get(r.bocSourceId) ?? 'Unknown source',
      count: r.count
    }))
    .sort(
      (a, b) =>
        (bocDocument(a.documentCode)?.sortOrder ?? 0) - (bocDocument(b.documentCode)?.sortOrder ?? 0) ||
        a.sourceName.localeCompare(b.sourceName)
    )

  return { books, scripture, commentary, boc }
}

/** Every quote captured from one BoC source within one document, in section order. Mirrors
 *  listCommentaryQuotes; `bocSourceId` may be a primary-text or a commentary source id. */
export function listBocQuotes(bocSourceId: string, documentCode: string): Quote[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM quotes
       WHERE (boc_source_id = @src OR boc_commentary_source_id = @src)
         AND boc_ref LIKE @prefix`
    )
    .all({ src: bocSourceId, prefix: `${documentCode}:%` }) as QuoteRow[]
  const ordinalOf = (r: QuoteRow): number => Number((r.boc_ref ?? '').split(':')[1] ?? 0)
  rows.sort((a, b) => ordinalOf(a) - ordinalOf(b) || (a.boc_paragraph ?? 0) - (b.boc_paragraph ?? 0) || a.created - b.created)
  const ctx = buildQuoteListCtx()
  return rows.map((r) => rowToQuote(r, ctx))
}
