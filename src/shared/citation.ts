// CMOS 18 (18th ed., Sept 2024) citation engine — pure, shared by main + renderer.
// Notes–bibliography style by default, with author–date as an alternate.
// Missing fields render as [bracketed] placeholders the UI highlights in amber.

export type SourceKind = 'book' | 'video' | 'image'
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
