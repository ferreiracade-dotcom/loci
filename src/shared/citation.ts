// CMOS 18 (18th ed., Sept 2024) citation engine — pure, shared by main + renderer.
// Notes–bibliography style by default, with author–date as an alternate.
// Missing fields render as [bracketed] placeholders the UI highlights in amber.

import { FATHERS_SERIES_LABEL } from './fathers'
import type { FathersSeries } from './fathers'

export type SourceKind = 'book' | 'article' | 'video' | 'image'
export type CitationStyle = 'footnote' | 'short' | 'bibliography' | 'author-date'

export interface CitationSource {
  kind: SourceKind
  /** Full creator names in "First Last" order. */
  authors: string[]
  title: string
  publisher: string | null
  city: string | null
  year: number | null
  /** Video extras. */
  channel?: string | null
  url?: string | null
  /** Article extras. */
  journal?: string | null
  volume?: string | null
  issue?: string | null
  /** Page range text, e.g. "45–67". */
  pages?: string | null
}

const ph = (label: string): string => `[${label}]`

/** Split a single metadata string into individual author names. */
export function parseAuthors(s: string | null | undefined): string[] {
  if (!s) return []
  return s
    .split(/\s+and\s+|;|&/i)
    .map((x) => x.trim())
    .filter(Boolean)
}

function splitName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/)
  if (parts.length === 1) return { first: '', last: parts[0] }
  return { first: parts.slice(0, -1).join(' '), last: parts[parts.length - 1] }
}

const lastName = (full: string): string => splitName(full).last

/** Notes: list up to two authors, otherwise the first author + "et al." */
function authorsNote(authors: string[]): string {
  if (authors.length === 0) return ph('author')
  if (authors.length === 1) return authors[0]
  if (authors.length === 2) return `${authors[0]} and ${authors[1]}`
  return `${authors[0]} et al.`
}

/** Bibliography: first author inverted; up to six listed, else first three + "et al." */
function authorsBib(authors: string[]): string {
  if (authors.length === 0) return ph('author')
  const invert = (full: string): string => {
    const { first, last } = splitName(full)
    return first ? `${last}, ${first}` : last
  }
  if (authors.length === 1) return invert(authors[0])
  if (authors.length > 6) {
    const three = authors.slice(0, 3).map((n, i) => (i === 0 ? invert(n) : n))
    return `${three.join(', ')}, et al.`
  }
  const parts = authors.map((n, i) => (i === 0 ? invert(n) : n))
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`
  return `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`
}

/** Author–date / short-note: last names only. */
function authorsShort(authors: string[]): string {
  if (authors.length === 0) return ph('author')
  if (authors.length === 1) return lastName(authors[0])
  if (authors.length === 2) return `${lastName(authors[0])} and ${lastName(authors[1])}`
  return `${lastName(authors[0])} et al.`
}

function yearStr(src: CitationSource): string {
  return src.year != null ? String(src.year) : ph('year')
}

/** "(Publisher, Year)" for ≥1900; "(City: Publisher, Year)" before 1900 (CMOS 18). */
function pubParen(src: CitationSource): string {
  const pub = src.publisher || ph('publisher')
  const year = yearStr(src)
  if (src.year != null && src.year < 1900) {
    return `(${src.city || ph('city')}: ${pub}, ${year})`
  }
  return `(${pub}, ${year})`
}

/** Same as pubParen but without the surrounding parentheses (bibliography). */
function pubPlain(src: CitationSource): string {
  const pub = src.publisher || ph('publisher')
  const year = yearStr(src)
  if (src.year != null && src.year < 1900) {
    return `${src.city || ph('city')}: ${pub}, ${year}`
  }
  return `${pub}, ${year}`
}

function title(src: CitationSource): string {
  return src.title?.trim() || ph('title')
}

/** First few words of the title, for shortened notes. */
function shortTitle(src: CitationSource): string {
  const t = title(src)
  const words = t.split(/\s+/)
  return words.length <= 4 ? t : words.slice(0, 4).join(' ')
}

const clean = (s: string | null | undefined): string => (s ?? '').trim()

/** `*Journal* 12, no. 3 (1998)` — each part only when present. */
function journalPart(src: CitationSource): string {
  const journal = clean(src.journal)
  const volume = clean(src.volume)
  const issue = clean(src.issue)
  let s = journal ? `*${journal}*` : ''
  if (volume) s = s ? `${s} ${volume}` : volume
  if (issue) s = s ? `${s}, no. ${issue}` : `no. ${issue}`
  if (src.year != null) s = s ? `${s} (${src.year})` : `(${src.year})`
  return s
}

/** `*Journal* 12, no. 3 (1998): 45–67, 52` — the page range and the quoted page are optional. */
function articleTail(src: CitationSource, page: number | null): string {
  let s = journalPart(src)
  const pages = clean(src.pages)
  if (pages) s += s ? `: ${pages}` : pages
  if (page != null) s += s ? `, ${page}` : String(page)
  return s
}

function formatArticle(src: CitationSource, style: CitationStyle, page: number | null): string {
  const name = title(src)
  switch (style) {
    case 'footnote': {
      const tail = articleTail(src, page)
      const who = authorsNote(src.authors)
      return tail ? `${who}, "${name}," ${tail}.` : `${who}, "${name}."`
    }
    case 'short': {
      const who = authorsShort(src.authors)
      return page != null ? `${who}, "${shortTitle(src)}," ${page}.` : `${who}, "${shortTitle(src)}."`
    }
    case 'author-date':
      return `(${authorsShort(src.authors)} ${yearStr(src)}${pagePart(page)})`
    case 'bibliography': {
      const tail = articleTail(src, null)
      const who = authorsBib(src.authors)
      return tail ? `${who}. "${name}." ${tail}.` : `${who}. "${name}."`
    }
  }
}

/** What a library item needs to be cited: the subset of a `books` row / `Book` used here. */
export interface BookLike {
  kind?: 'book' | 'article'
  author: string | null
  title: string
  publisher: string | null
  city: string | null
  year: number | null
  journal?: string | null
  volume?: string | null
  issue?: string | null
  pages?: string | null
}

/** The citation source for a library item — an article when its kind says so, else a book. */
export function bookCitationSource(b: BookLike): CitationSource {
  const base = {
    authors: parseAuthors(b.author),
    title: b.title,
    publisher: b.publisher,
    city: b.city,
    year: b.year
  }
  if (b.kind === 'article') {
    return {
      kind: 'article',
      ...base,
      journal: b.journal ?? null,
      volume: b.volume ?? null,
      issue: b.issue ?? null,
      pages: b.pages ?? null
    }
  }
  return { kind: 'book', ...base }
}

const pagePart = (page: number | null): string => (page != null ? `, ${page}` : '')

export function formatCitation(
  src: CitationSource,
  style: CitationStyle,
  page: number | null
): string {
  if (src.kind === 'video') {
    const who = style === 'bibliography' ? authorsBib(src.authors) : authorsNote(src.authors)
    const chan = src.channel || ph('channel')
    const tail = src.url ? `, ${src.url}` : ''
    if (style === 'author-date') return `(${authorsShort(src.authors)} ${yearStr(src)})`
    return `${who}, "${title(src)}," video, ${chan}, ${yearStr(src)}${tail}.`
  }
  if (src.kind === 'article') return formatArticle(src, style, page)

  switch (style) {
    case 'footnote':
      return `${authorsNote(src.authors)}, *${title(src)}* ${pubParen(src)}${pagePart(page)}.`
    case 'short':
      return `${authorsShort(src.authors)}, *${shortTitle(src)}*${pagePart(page)}.`
    case 'author-date':
      return `(${authorsShort(src.authors)} ${yearStr(src)}${pagePart(page)})`
    case 'bibliography':
      return `${authorsBib(src.authors)}. *${title(src)}*. ${pubPlain(src)}.`
  }
}

/** True if the citation still contains placeholder fields. */
export function hasPlaceholders(citation: string): boolean {
  return /\[[^\]]+\]/.test(citation)
}

// ---------- Scripture references ----------
// CMOS 18 cites Scripture in the notes / in text (e.g. "John 3:16 (ESV)") and does not
// list Bible editions in the bibliography, so these are kept separate from the book engine.

export interface ScriptureCiteRef {
  bookName: string
  chapter: number
  verseStart: number
  verseEnd?: number | null
  /** Translation abbreviation, e.g. "BSB". */
  abbr: string
}

/** "John 3:16" or "John 3:16–18". */
export function scriptureLabel(r: ScriptureCiteRef): string {
  const v =
    r.verseEnd != null && r.verseEnd !== r.verseStart
      ? `${r.verseStart}–${r.verseEnd}`
      : `${r.verseStart}`
  return `${r.bookName} ${r.chapter}:${v}`
}

/** "John 3:16 (BSB)" — the attribution shown under a scripture quote. */
export function scriptureCitation(r: ScriptureCiteRef): string {
  return `${scriptureLabel(r)} (${r.abbr})`
}

// ---------- Book of Concord references ----------
// Confessional citations follow the "AC IV, 2 (Reader's Edition)" convention: abbreviation +
// section number (or label, for unnumbered sections like a Preface) + optional paragraph.

export interface BocCiteRef {
  abbreviation: string
  sectionNumber: string | null
  sectionLabel: string
  paragraph?: number | null
  sourceName: string
}

/** "AC IV, 2" / "AC IV" / "AC, Preface". */
export function bocLabel(r: BocCiteRef): string {
  const head = r.sectionNumber ? `${r.abbreviation} ${r.sectionNumber}` : `${r.abbreviation}, ${r.sectionLabel}`
  return r.paragraph != null ? `${head}, ${r.paragraph}` : head
}

/** "AC IV, 2 (Reader's Edition)" — the attribution shown under a confessional quote. */
export function bocCitation(r: BocCiteRef): string {
  return `${bocLabel(r)} (${r.sourceName})`
}

// ---------- Church Fathers references ----------
// "Irenaeus, *Against Heresies* III.3 (ANF 1:415)": author, italicised work, the section's
// book/chapter numbers when it has them, then the series, volume and printed page.

export interface FathersCiteRef {
  authorName: string | null
  /** The work as CCEL titles it, e.g. "Against Heresies: Book III". */
  workTitle: string | null
  /** The section's short title, e.g. "Chapter III.—Apostolic succession." */
  shortTitle: string
  series: FathersSeries
  volume: number
  /** Printed page ('415', 'xiv'), if known. */
  page: string | null
}

/** Roman numeral -> integer; null if `s` is not a well-formed uppercase numeral. */
export function romanToInt(s: string): number | null {
  if (!/^[IVXLCDM]+$/.test(s)) return null
  const v: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 }
  let total = 0
  for (let i = 0; i < s.length; i++) {
    const cur = v[s[i]]
    const next = i + 1 < s.length ? v[s[i + 1]] : 0
    total += cur < next ? -cur : cur
  }
  return total
}

const WORK_BOOK_RE = /^(.*?)[\s:,—–-]*\b[Bb]ook\s+([IVXLCDM]+|\d+)\s*$/
const SECTION_NUMBER_RE =
  /^(?:[Cc]hapter|[Cc]hap\.|[Ss]ection|[Aa]rticle|[Ll]etter|[Ee]pistle|[Hh]omily|[Ss]ermon|[Bb]ook|[Pp]art)\s+([IVXLCDM]+|\d+)(?![A-Za-z])/

/** Split a CCEL work title and section title into the cited work name and a locator:
 *  ("Against Heresies: Book III", "Chapter III.—Apostolic succession.") -> ("Against Heresies", "III.3").
 *  The locator is the book numeral as printed, then the chapter as an arabic number; with neither
 *  it falls back to the section title's first clause ("Preface"), or "" if that is the work itself. */
export function fathersSectionLabel(
  workTitle: string | null,
  shortTitle: string
): { work: string; label: string } {
  let work = (workTitle ?? shortTitle).trim()
  let book = ''
  const wb = WORK_BOOK_RE.exec(work)
  if (wb && wb[1].trim()) {
    work = wb[1].trim()
    book = wb[2]
  }
  let chapter = ''
  const sn = SECTION_NUMBER_RE.exec(shortTitle.trim())
  if (sn) chapter = /^\d+$/.test(sn[1]) ? sn[1] : String(romanToInt(sn[1]) ?? sn[1])
  let label = [book, chapter].filter(Boolean).join('.')
  if (!label) {
    const head = shortTitle.split(/[.—–:]/)[0].trim()
    const short = head.length > 40 ? `${head.slice(0, 40).replace(/\s+\S*$/, '')}…` : head
    label = head.toLowerCase() === work.toLowerCase() ? '' : short
  }
  return { work, label }
}

/** "Irenaeus, *Against Heresies* III.3 (ANF 1:415)". */
export function fathersCitation(r: FathersCiteRef): string {
  const { work, label } = fathersSectionLabel(r.workTitle, r.shortTitle)
  const who = r.authorName ? `${r.authorName}, ` : ''
  const where = `${FATHERS_SERIES_LABEL[r.series]} ${r.volume}${r.page ? `:${r.page}` : ''}`
  return `${who}*${work}*${label ? ` ${label}` : ''} (${where})`
}
