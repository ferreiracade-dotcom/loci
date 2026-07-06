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
  ['1SA', '1 Samuel', 31, ['1 Sam', '1 Sa', '1Sam', '1Sa', 'I Samuel', 'I Sam', '1st Samuel']],
  ['2SA', '2 Samuel', 24, ['2 Sam', '2 Sa', '2Sam', '2Sa', 'II Samuel', 'II Sam', '2nd Samuel']],
  ['1KI', '1 Kings', 22, ['1 Kgs', '1 Ki', '1Kgs', '1Ki', 'I Kings', '1st Kings']],
  ['2KI', '2 Kings', 25, ['2 Kgs', '2 Ki', '2Kgs', '2Ki', 'II Kings', '2nd Kings']],
  ['1CH', '1 Chronicles', 29, ['1 Chron', '1 Chr', '1Chr', '1Ch', 'I Chronicles']],
  ['2CH', '2 Chronicles', 36, ['2 Chron', '2 Chr', '2Chr', '2Ch', 'II Chronicles']],
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
  ['1CO', '1 Corinthians', 16, ['1 Cor', '1 Co', '1Cor', '1Co', 'I Corinthians', '1st Corinthians']],
  ['2CO', '2 Corinthians', 13, ['2 Cor', '2 Co', '2Cor', '2Co', 'II Corinthians', '2nd Corinthians']],
  ['GAL', 'Galatians', 6, ['Gal', 'Ga']],
  ['EPH', 'Ephesians', 6, ['Eph', 'Ephes']],
  ['PHP', 'Philippians', 4, ['Phil', 'Php', 'Pp']],
  ['COL', 'Colossians', 4, ['Col', 'Cl']],
  ['1TH', '1 Thessalonians', 5, ['1 Thess', '1 Thes', '1Thess', '1Th', 'I Thessalonians']],
  ['2TH', '2 Thessalonians', 3, ['2 Thess', '2 Thes', '2Thess', '2Th', 'II Thessalonians']],
  ['1TI', '1 Timothy', 6, ['1 Tim', '1 Ti', '1Tim', '1Ti', 'I Timothy']],
  ['2TI', '2 Timothy', 4, ['2 Tim', '2 Ti', '2Tim', '2Ti', 'II Timothy']],
  ['TIT', 'Titus', 3, ['Titus', 'Tit']],
  ['PHM', 'Philemon', 1, ['Philem', 'Phlm', 'Phm']],
  ['HEB', 'Hebrews', 13, ['Heb', 'Hbr']],
  ['JAS', 'James', 5, ['James', 'Jas', 'Jms']],
  ['1PE', '1 Peter', 5, ['1 Pet', '1 Pe', '1Pet', '1Pe', 'I Peter', '1st Peter']],
  ['2PE', '2 Peter', 3, ['2 Pet', '2 Pe', '2Pet', '2Pe', 'II Peter', '2nd Peter']],
  ['1JN', '1 John', 5, ['1 John', '1 Jn', '1John', '1Jn', 'I John', '1st John']],
  ['2JN', '2 John', 1, ['2 John', '2 Jn', '2John', '2Jn', 'II John', '2nd John']],
  ['3JN', '3 John', 1, ['3 John', '3 Jn', '3John', '3Jn', 'III John', '3rd John']],
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
for (const b of BOOKS) {
  for (const s of [b.name, ...b.abbr]) {
    SPELLING_TO_CODE.set(s.toLowerCase(), b.code)
    RAW_SPELLINGS.push(s)
  }
}
const ESC = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
// Ordered longest-first so multi-word and numbered names ("1 John", "Song of Songs") win
// over their shorter substrings.
const ALTERNATION = RAW_SPELLINGS.sort((a, b) => b.length - a.length)
  .map((s) => ESC(s))
  .join('|')

// chapter, then optional :verse(-verse). Case-SENSITIVE for prose scanning (references in
// notes are capitalized), which keeps "Mark 3" a match but "mark 3 items" not.
const CORE = `(${ALTERNATION})\\b\\.?\\s+(\\d{1,3})(?::(\\d{1,3})(?:\\s*[-–]\\s*(\\d{1,3}))?)?`
const SCAN_RE = new RegExp(`\\b${CORE}`, 'g')
const ONE_RE = new RegExp(`^\\s*${CORE}\\s*$`, 'i')

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

// --- Commentary header parsing (Phase 2a) --------------------------------------------
//
// A distinct grammar from the free-text reference scanner above: commentary PDFs mark
// excerpt boundaries with a huge variety of bare verse/range headers ("[16]", "Verse 16.",
// "16)", "3:16", "15-18.", "False discipleship: V. 21.") that a real corpus survey turned
// up — none of which name the book, and several of which don't even restate the chapter.
// So parsing here is stateful: the caller (the per-source chunker in Phase 2d) tracks
// which book/chapter is "current" and this module only supplies the per-line grammar.

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

/** The header conventions observed across real commentary PDFs (spec Phase 2c: a source's
 *  shape is inferred by profiling, confirmed by the user, then applied strictly). */
export type HeaderShape =
  | 'book-chapter-verse' // "Romans 3:16", "Rom. 3:16-21" — resets book and chapter
  | 'chapter-verse' // "3:16", "3:16-18", "3:25-4:2" — needs state.book; sets state.chapter
  | 'chapter-verse-roman' // "i. 15-18", "(i. 15-18)", "Cap. III, v. 5" — needs state.book
  | 'bracket-number' // "[16]", "[16-18]" — needs state.book + state.chapter
  | 'paren-number' // "16)", "16-18)" — needs state.book + state.chapter
  | 'word-label' // "Verse 16.", "Verses 16-18.", "V. 16.", "Vv. 16-18.", "Vers. 16."
  | 'phrase-label' // "False discipleship: V. 21." — a lead-in phrase before the label
  | 'bare-range' // "16.", "16-18." — needs state.book + state.chapter

const N = '\\d{1,3}'
const DASH = '[-–—]'
/** "16" or "16-18" — a single-chapter verse or range, as two optional capture groups. */
const RANGE = `(${N})(?:\\s*${DASH}\\s*(${N}))?`

const ROMAN_RE = /^[ivxlcdm]+$/i
const ROMAN_VALUES: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 }

/** Parse a Roman numeral (any case) to an integer, or null if it isn't one. */
export function romanToInt(s: string): number | null {
  const clean = s.trim().toLowerCase()
  if (!clean || !ROMAN_RE.test(clean)) return null
  let total = 0
  for (let i = 0; i < clean.length; i++) {
    const cur = ROMAN_VALUES[clean[i]]
    const next = i + 1 < clean.length ? ROMAN_VALUES[clean[i + 1]] : 0
    total += cur < next ? -cur : cur
  }
  return total > 0 ? total : null
}

const SHAPE_PATTERNS: Partial<Record<HeaderShape, RegExp>> = {
  'chapter-verse': new RegExp(
    `^\\(?(${N})\\s*:\\s*(${N})(?:\\s*${DASH}\\s*(?:(${N})\\s*:\\s*)?(${N}))?\\)?`
  ),
  'chapter-verse-roman': new RegExp(
    `^\\(?(?:Chapter|Chap\\.?|Cap\\.?)?\\s*([ivxlcdm]+)\\b[.,]?\\s*(?:v\\.?|vv\\.?|vers\\.?)?\\s*(${N})?(?:\\s*${DASH}\\s*(${N}))?\\)?`,
    'i'
  ),
  'bracket-number': new RegExp(`^\\[${RANGE}\\]`),
  'paren-number': new RegExp(`^${RANGE}\\)`),
  'word-label': new RegExp(`^(?:Verses?|Vers\\.?|Vv\\.?|V\\.?)\\s+${RANGE}\\.?`, 'i'),
  'phrase-label': new RegExp(`^[^:\\n]{1,80}:\\s*(?:Verses?|Vers\\.?|Vv\\.?|V\\.?)\\s+${RANGE}\\.?`, 'i'),
  'bare-range': new RegExp(`^${RANGE}\\.`)
}

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

  if (shape === 'chapter-verse') {
    if (!state.book) return null
    const m = SHAPE_PATTERNS['chapter-verse']!.exec(trimmed)
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

  if (shape === 'chapter-verse-roman') {
    if (!state.book) return null
    const m = SHAPE_PATTERNS['chapter-verse-roman']!.exec(trimmed)
    if (!m || !m[2]) return null // no verse number captured — treat as unparseable here
    const chapter = romanToInt(m[1])
    if (chapter == null) return null
    const verseStart = Number(m[2])
    const verseEnd = m[3] ? Number(m[3]) : verseStart
    return {
      raw: m[0],
      book: state.book,
      chapterStart: chapter,
      verseStart,
      chapterEnd: chapter,
      verseEnd,
      contextual: false
    }
  }

  // Remaining shapes are all "bare verse/range" forms that require a fully-established
  // book + chapter from prior headers.
  if (!state.book || state.chapter == null) return null
  const pattern = SHAPE_PATTERNS[shape]
  if (!pattern) return null
  const m = pattern.exec(trimmed)
  if (!m) return null
  const verseStart = Number(m[1])
  const verseEnd = m[2] ? Number(m[2]) : verseStart
  return {
    raw: m[0],
    book: state.book,
    chapterStart: state.chapter,
    verseStart,
    chapterEnd: state.chapter,
    verseEnd,
    contextual: true
  }
}

/** A standalone chapter heading with no verse component ("Chapter III", "Cap. III") — just
 *  updates carried context for subsequent bare-verse headers; not an excerpt boundary
 *  itself. Returns null if `line` isn't one. */
export function parseChapterOnlyHeader(line: string): { chapter: number } | null {
  const m = /^(?:Chapter|Chap\.?|Cap\.?)\s+([ivxlcdm]+)\s*\.?$/i.exec(line.trim())
  if (!m) return null
  const chapter = romanToInt(m[1])
  return chapter != null ? { chapter } : null
}
