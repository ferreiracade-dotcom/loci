// Scripture reference grammar — shared by the main process (passage lookup) and the
// renderer (note decoration + the reader's "go to reference" box). Pure, no I/O.
//
// Book codes are the 3-letter USFM/Paratext codes (GEN, EXO … REV), which is also what
// the Free Use Bible API and API.Bible use, so a parsed reference maps straight onto a
// provider request. Chapter counts are fixed across the 66-book Protestant canon, so the
// whole Bible can be navigated offline; only the verse text is fetched.

export interface ScriptureBookDef {
  /** USFM code, e.g. "ROM". */
  code: string
  name: string
  testament: 'OT' | 'NT'
  /** 1-66 canonical order. */
  order: number
  chapters: number
  /** Accepted abbreviations (besides the full name). Case-insensitive in parseReference. */
  abbr: string[]
}

// [code, name, chapters, abbreviations]. Deliberately omits the most ambiguous 2-letter
// forms (Is, Am, Ac, Re, Ho, Na, Ob) to avoid matching ordinary prose words.
const RAW: [string, string, number, string[]][] = [
  ['GEN', 'Genesis', 50, ['Gen', 'Ge', 'Gn']],
  ['EXO', 'Exodus', 40, ['Exod', 'Exo', 'Ex']],
  ['LEV', 'Leviticus', 27, ['Lev', 'Lv']],
  ['NUM', 'Numbers', 36, ['Num', 'Nm', 'Nu']],
  ['DEU', 'Deuteronomy', 34, ['Deut', 'Deu', 'Dt']],
  ['JOS', 'Joshua', 24, ['Josh', 'Jos', 'Jsh']],
  ['JDG', 'Judges', 21, ['Judg', 'Jdg', 'Jg']],
  ['RUT', 'Ruth', 4, ['Ruth', 'Rth', 'Ru']],
  ['1SA', '1 Samuel', 31, ['1 Sam', '1 Sa', '1Sam', '1Sa', 'I Samuel', 'I Sam', '1st Samuel', 'First Samuel']],
  ['2SA', '2 Samuel', 24, ['2 Sam', '2 Sa', '2Sam', '2Sa', 'II Samuel', 'II Sam', '2nd Samuel', 'Second Samuel']],
  ['1KI', '1 Kings', 22, ['1 Kgs', '1 Ki', '1Kgs', '1Ki', 'I Kings', '1st Kings', 'First Kings']],
  ['2KI', '2 Kings', 25, ['2 Kgs', '2 Ki', '2Kgs', '2Ki', 'II Kings', '2nd Kings', 'Second Kings']],
  ['1CH', '1 Chronicles', 29, ['1 Chron', '1 Chr', '1Chr', '1Ch', 'I Chronicles', 'First Chronicles']],
  ['2CH', '2 Chronicles', 36, ['2 Chron', '2 Chr', '2Chr', '2Ch', 'II Chronicles', 'Second Chronicles']],
  ['EZR', 'Ezra', 10, ['Ezra', 'Ezr']],
  ['NEH', 'Nehemiah', 13, ['Neh', 'Ne']],
  ['EST', 'Esther', 10, ['Esth', 'Est']],
  ['JOB', 'Job', 42, ['Job', 'Jb']],
  ['PSA', 'Psalms', 150, ['Psalm', 'Psalms', 'Pslm', 'Psa', 'Pss', 'Ps']],
  ['PRO', 'Proverbs', 31, ['Prov', 'Prv', 'Pro', 'Pr']],
  ['ECC', 'Ecclesiastes', 12, ['Eccl', 'Ecc', 'Qoh']],
  ['SNG', 'Song of Songs', 8, ['Song of Solomon', 'Song', 'Canticles', 'Cant', 'SoS']],
  ['ISA', 'Isaiah', 66, ['Isaiah', 'Isa']],
  ['JER', 'Jeremiah', 52, ['Jer', 'Je']],
  ['LAM', 'Lamentations', 5, ['Lam', 'La']],
  ['EZK', 'Ezekiel', 48, ['Ezek', 'Ezk', 'Eze']],
  ['DAN', 'Daniel', 12, ['Dan', 'Dn', 'Da']],
  ['HOS', 'Hosea', 14, ['Hos']],
  ['JOL', 'Joel', 3, ['Joel', 'Joe', 'Jl']],
  ['AMO', 'Amos', 9, ['Amos', 'Amo']],
  ['OBA', 'Obadiah', 1, ['Obad', 'Oba']],
  ['JON', 'Jonah', 4, ['Jonah', 'Jon', 'Jnh']],
  ['MIC', 'Micah', 7, ['Mic', 'Mc']],
  ['NAM', 'Nahum', 3, ['Nah', 'Nam']],
  ['HAB', 'Habakkuk', 3, ['Hab', 'Hb']],
  ['ZEP', 'Zephaniah', 3, ['Zeph', 'Zep', 'Zp']],
  ['HAG', 'Haggai', 2, ['Hag', 'Hg']],
  ['ZEC', 'Zechariah', 14, ['Zech', 'Zec', 'Zc']],
  ['MAL', 'Malachi', 4, ['Mal', 'Ml']],
  ['MAT', 'Matthew', 28, ['Matt', 'Mat', 'Mt']],
  ['MRK', 'Mark', 16, ['Mark', 'Mrk', 'Mk']],
  ['LUK', 'Luke', 24, ['Luke', 'Luk', 'Lk']],
  ['JHN', 'John', 21, ['John', 'Jhn', 'Joh', 'Jn']],
  ['ACT', 'Acts', 28, ['Acts', 'Act']],
  ['ROM', 'Romans', 16, ['Rom', 'Ro', 'Rm']],
  ['1CO', '1 Corinthians', 16, ['1 Cor', '1 Co', '1Cor', '1Co', 'I Corinthians', '1st Corinthians', 'First Corinthians']],
  ['2CO', '2 Corinthians', 13, ['2 Cor', '2 Co', '2Cor', '2Co', 'II Corinthians', '2nd Corinthians', 'Second Corinthians']],
  ['GAL', 'Galatians', 6, ['Gal', 'Ga']],
  ['EPH', 'Ephesians', 6, ['Eph', 'Ephes']],
  ['PHP', 'Philippians', 4, ['Phil', 'Php', 'Pp']],
  ['COL', 'Colossians', 4, ['Col', 'Cl']],
  ['1TH', '1 Thessalonians', 5, ['1 Thess', '1 Thes', '1Thess', '1Th', 'I Thessalonians', 'First Thessalonians']],
  ['2TH', '2 Thessalonians', 3, ['2 Thess', '2 Thes', '2Thess', '2Th', 'II Thessalonians', 'Second Thessalonians']],
  ['1TI', '1 Timothy', 6, ['1 Tim', '1 Ti', '1Tim', '1Ti', 'I Timothy', 'First Timothy']],
  ['2TI', '2 Timothy', 4, ['2 Tim', '2 Ti', '2Tim', '2Ti', 'II Timothy', 'Second Timothy']],
  ['TIT', 'Titus', 3, ['Titus', 'Tit']],
  ['PHM', 'Philemon', 1, ['Philem', 'Phlm', 'Phm']],
  ['HEB', 'Hebrews', 13, ['Heb', 'Hbr']],
  ['JAS', 'James', 5, ['James', 'Jas', 'Jms']],
  ['1PE', '1 Peter', 5, ['1 Pet', '1 Pe', '1Pet', '1Pe', 'I Peter', '1st Peter', 'First Peter']],
  ['2PE', '2 Peter', 3, ['2 Pet', '2 Pe', '2Pet', '2Pe', 'II Peter', '2nd Peter', 'Second Peter']],
  ['1JN', '1 John', 5, ['1 John', '1 Jn', '1John', '1Jn', 'I John', '1st John', 'First John']],
  ['2JN', '2 John', 1, ['2 John', '2 Jn', '2John', '2Jn', 'II John', '2nd John', 'Second John']],
  ['3JN', '3 John', 1, ['3 John', '3 Jn', '3John', '3Jn', 'III John', '3rd John', 'Third John']],
  ['JUD', 'Jude', 1, ['Jude', 'Jud', 'Jd']],
  ['REV', 'Revelation', 22, ['Rev', 'Apocalypse', 'Apoc']]
]

export const BOOKS: ScriptureBookDef[] = RAW.map(([code, name, chapters, abbr], i) => ({
  code,
  name,
  chapters,
  abbr,
  order: i + 1,
  testament: i < 39 ? 'OT' : 'NT'
}))

const BY_CODE = new Map(BOOKS.map((b) => [b.code, b]))
const BY_ORDER = new Map(BOOKS.map((b) => [b.order, b]))

export function bookByCode(code: string): ScriptureBookDef | undefined {
  return BY_CODE.get(code.toUpperCase())
}
export function bookByOrder(order: number): ScriptureBookDef | undefined {
  return BY_ORDER.get(order)
}

// spelling (lowercased) -> code, for resolving whatever case a scan/parse actually matched.
// The alternation itself is built from the ORIGINAL casing (below) — SCAN_RE relies on
// that casing to distinguish "Mark 3" from "mark 3 items"; lowercasing it here would make
// every alternative unmatchable against real (capitalized) text without also accepting
// lowercase prose, defeating the point.
const SPELLING_TO_CODE = new Map<string, string>()
const RAW_SPELLINGS: string[] = []
// Unambiguous full-word book names only ("Second Corinthians", "Genesis") — no cryptic
// abbreviations ("Mt", "Jn", "Rm"). Used for matchBareBookName below, which (unlike SCAN_RE)
// isn't anchored to a chapter number, so a short abbreviation would readily collide with an
// ordinary footnote/cross-reference citation ("cf. Jn 5:22") rather than a genuine running
// header restating the book.
const FULL_NAME_SPELLINGS: string[] = []
for (const b of BOOKS) {
  FULL_NAME_SPELLINGS.push(b.name)
  for (const s of [b.name, ...b.abbr]) {
    SPELLING_TO_CODE.set(s.toLowerCase(), b.code)
    // Ordinal-word spellings ("First Corinthians") are deliberately kept OUT of
    // RAW_SPELLINGS/ALTERNATION (the free-text reference scanner and the profiler's
    // 'book-chapter-verse' shape-matching both draw from it): recognizing them there made
    // the profiler massively over-count 'book-chapter-verse' matches in real data (Lenski's
    // Corinthians commentary uses "First/Second Corinthians" in its own running header, and
    // once that shape recognized it, EVERY abbreviated footnote citation elsewhere in the
    // document — already-recognized short forms like "Gal.", "Matt." — tipped the shape
    // selection away from the source's real verse-header shape, 'paren-number', entirely).
    // They're only ever needed for matchBareBookName's own separate, narrower alternation.
    if (/^(First|Second|Third)\s/.test(s)) {
      FULL_NAME_SPELLINGS.push(s)
      continue
    }
    RAW_SPELLINGS.push(s)
  }
}
const ESC = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
// Ordered longest-first so multi-word and numbered names ("1 John", "Song of Songs") win
// over their shorter substrings.
const ALTERNATION = RAW_SPELLINGS.sort((a, b) => b.length - a.length)
  .map((s) => ESC(s))
  .join('|')
const FULL_NAME_ALTERNATION = FULL_NAME_SPELLINGS.sort((a, b) => b.length - a.length)
  .map((s) => ESC(s))
  .join('|')

// chapter, then optional :verse(-verse). Case-SENSITIVE for prose scanning (references in
// notes are capitalized), which keeps "Mark 3" a match but "mark 3 items" not.
const CORE = `(${ALTERNATION})\\b\\.?\\s+(\\d{1,3})(?::(\\d{1,3})(?:\\s*[-–]\\s*(\\d{1,3}))?)?`
const SCAN_RE = new RegExp(`\\b${CORE}`, 'g')
const ONE_RE = new RegExp(`^\\s*${CORE}\\s*$`, 'i')
// Anchored to the END of the text, not just a bare word-boundary match anywhere in it — a
// genuine "book restated with no reference" running header trails the book name at the very
// end ("Interpretation of Second Corinthians"), whereas an ordinary discursive cross-reference
// ("as Paul says in Romans 8, we...") is virtually never the last thing on its line, since
// prose keeps going after naming the book. Full names alone weren't enough of a restriction —
// real evidence (Lenski's Corinthians commentary) shows spelled-out cross-references to other
// books ("Genesis", "Matthew", "Romans", ...) recurring near page edges in ordinary prose
// often enough to hijack book tracking without this positional anchor too.
const BARE_BOOK_NAME_RE = new RegExp(`\\b(${FULL_NAME_ALTERNATION})\\s*$`)

/** Find a bare book-name mention at the end of `text`, with no chapter/verse required — for
 *  running headers that restate only the book ("Interpretation of Second Corinthians") with
 *  no page-guide reference at all (real: Lenski's Corinthians commentary never restates a
 *  chapter:verse in its running header, unlike Gerhard's "2 TIMOTHY 1:2-3" style). Same
 *  case-sensitivity rationale as the free-text scanner above. Returns the matched name's
 *  USFM code, or null. */
export function matchBareBookName(text: string): string | null {
  const m = BARE_BOOK_NAME_RE.exec(text.trim())
  if (!m) return null
  return SPELLING_TO_CODE.get(m[1].toLowerCase()) ?? null
}

/** Resolve a full book name or abbreviation (the *entire* string, any recognized spelling —
 *  "Matthew", "Song of Solomon", "1 Timothy", "1 Cor") to its USFM code, or null. Unlike
 *  matchBareBookName this requires the whole string to be exactly a book name, so it's for
 *  contexts where that's already known — e.g. a Markdown "# Book" heading. */
export function bookCodeFromName(name: string): string | null {
  return SPELLING_TO_CODE.get(name.trim().toLowerCase()) ?? null
}

export interface ParsedRef {
  /** The exact matched text, e.g. "Rom 3:28". */
  raw: string
  /** Offset of the match within the scanned text (for decoration). */
  index: number
  length: number
  book: string
  bookName: string
  chapter: number
  verseStart?: number
  verseEnd?: number
}

function build(
  spelling: string,
  chapter: string,
  vs: string | undefined,
  ve: string | undefined,
  raw: string,
  index: number
): ParsedRef | null {
  const code = SPELLING_TO_CODE.get(spelling.toLowerCase())
  const def = code ? BY_CODE.get(code) : undefined
  if (!def) return null
  const ch = Number(chapter)
  if (ch < 1 || ch > def.chapters) return null
  const verseStart = vs ? Number(vs) : undefined
  const verseEnd = ve ? Number(ve) : verseStart
  return {
    raw,
    index,
    length: raw.length,
    book: def.code,
    bookName: def.name,
    chapter: ch,
    verseStart,
    verseEnd
  }
}

/** Find every Scripture reference in free text (for note highlighting). */
export function findReferences(text: string): ParsedRef[] {
  const out: ParsedRef[] = []
  SCAN_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = SCAN_RE.exec(text))) {
    const ref = build(m[1], m[2], m[3], m[4], m[0], m.index)
    if (ref) out.push(ref)
  }
  return out
}

/** Parse a single, explicit reference string (the "go to reference" box). Lenient on case. */
export function parseReference(s: string): ParsedRef | null {
  const m = ONE_RE.exec(s)
  if (!m) return null
  return build(m[1], m[2], m[3], m[4], s.trim(), 0)
}

/** Human label, e.g. "Romans 3:28" or "Romans 3:28-30" or "Romans 3". */
export function refLabel(ref: {
  bookName: string
  chapter: number
  verseStart?: number
  verseEnd?: number
}): string {
  let s = `${ref.bookName} ${ref.chapter}`
  if (ref.verseStart != null) {
    s += `:${ref.verseStart}`
    if (ref.verseEnd != null && ref.verseEnd !== ref.verseStart) s += `-${ref.verseEnd}`
  }
  return s
}

// --- Commentary header parsing ---------------------------------------------------------
//
// A distinct grammar from the free-text reference scanner above: a canonical commentary-
// Markdown heading is either a full "Book chap:verse" reference or a bare "chap:verse"
// relying on the current book (see commentaryMarkdown.ts). Parsing here is stateful: the
// caller tracks which book/chapter is "current" and this module only supplies the per-line
// grammar. (A wider PDF-sourced header grammar — bracketed/roman/word-label verse markers,
// glyph-mangled numerals, chapter-title tracking — used to live here too; it moved to
// tools/pdf-to-md.mjs, a standalone converter that emits this same canonical Markdown rather
// than indexing a PDF's heuristically-detected headers directly. See that file for the
// fuller grammar if you're maintaining it.)

export interface HeaderParseState {
  /** USFM code of the book currently being commented on, or null before the first header. */
  book: string | null
  /** Chapter currently being commented on, or null before the first header. */
  chapter: number | null
}

/** A commentary excerpt boundary, resolved against (and possibly updating) parser state. */
export interface ParsedHeader {
  /** The exact matched text. */
  raw: string
  book: string
  chapterStart: number
  verseStart: number
  chapterEnd: number
  verseEnd: number
  /** True when this header only gave a bare verse/range and relied on carried-over state
   *  for book/chapter (as opposed to restating them itself). */
  contextual: boolean
}

/** The two heading conventions a canonical commentary-Markdown file uses. */
export type HeaderShape =
  | 'book-chapter-verse' // "Romans 3:16", "Rom. 3:16-21" — resets book and chapter
  | 'chapter-verse' // "3:16", "3:16-18", "3:25-4:2" — needs state.book; sets state.chapter

const N = '\\d{1,3}'
const DASH = '[-–—]'

const CHAPTER_VERSE_RE = new RegExp(`^\\(?(${N})\\s*:\\s*(${N})(?:\\s*${DASH}\\s*(?:(${N})\\s*:\\s*)?(${N}))?\\)?`)

/** Parse one candidate header line against carried context. Returns null if `line` doesn't
 *  match `shape` (or the shape needs context that hasn't been established yet). Does not
 *  mutate `state` — the caller applies the returned header's book/chapterEnd back onto its
 *  own state before parsing the next line. */
export function parseCommentaryHeader(
  line: string,
  state: HeaderParseState,
  shape: HeaderShape
): ParsedHeader | null {
  const trimmed = line.trim()
  if (!trimmed) return null

  if (shape === 'book-chapter-verse') {
    const refs = findReferences(trimmed)
    const ref = refs[0]
    if (!ref || ref.index !== 0) return null
    return {
      raw: ref.raw,
      book: ref.book,
      chapterStart: ref.chapter,
      verseStart: ref.verseStart ?? 1,
      chapterEnd: ref.chapter,
      verseEnd: ref.verseEnd ?? ref.verseStart ?? 1,
      contextual: false
    }
  }

  // shape === 'chapter-verse'
  if (!state.book) return null
  const m = CHAPTER_VERSE_RE.exec(trimmed)
  if (!m) return null
  const chapterStart = Number(m[1])
  const verseStart = Number(m[2])
  const chapterEnd = m[3] ? Number(m[3]) : chapterStart
  const verseEnd = m[4] ? Number(m[4]) : verseStart
  return {
    raw: m[0],
    book: state.book,
    chapterStart,
    verseStart,
    chapterEnd,
    verseEnd,
    contextual: false
  }
}
