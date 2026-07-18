// Convert a commentary PDF into canonical commentary-Markdown for Loci.
//
// Usage:
//   node pdf-to-md.mjs <book.pdf> "<Book Name>" <out.md>
//   node pdf-to-md.mjs <book.pdf> "<Book Name>" --profile-only
//
// Samples the PDF to infer its header style (font size / left margin / font-switching —
// whichever one actually distinguishes a verse header from body text for this source), then
// chunks the whole document into verse-keyed excerpts and writes them as `# Book` / `##
// chapter:verse` canonical Markdown — the same format tools/epub-to-md.mjs produces, parsed by
// the app's src/main/services/commentaryMarkdown.ts. "<Book Name>" seeds the book before the
// first header is found (or when no header ever restates it); a real per-source header still
// wins the moment one is seen.
//
// `--profile-only` prints the inferred shape and its sample matches without writing anything —
// use it to sanity-check an unfamiliar book's layout before committing to a full conversion.
//
// The extraction heuristics (line grouping, two-column detection, profiling, running
// header/footer stripping, citation-vs-boundary chapter-jump folding, glyph-mangled numeral
// resolution) are ported from Loci's in-app PDF pipeline (commentaryExtract.ts /
// scriptureRef.ts), hardened against real problem books already in this library — Gerhard's
// alternating running headers, Lenski's stray footnote-as-page-edge, Kretzmann's two-column
// layout. The output contract and CLI shape are ported from tools/epub-to-md.mjs.
//
// For your personal use on files you own. Do not redistribute converted copyrighted text.

import { readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

const rawArgs = process.argv.slice(2)
const profileOnly = rawArgs.includes('--profile-only')
const positional = rawArgs.filter((a) => a !== '--profile-only')
const [pdfPath, bookName, outFile] = positional
if (!pdfPath || !bookName || (!profileOnly && !outFile)) {
  console.error('usage: node pdf-to-md.mjs <book.pdf> "<Book Name>" <out.md>')
  console.error('       node pdf-to-md.mjs <book.pdf> "<Book Name>" --profile-only')
  process.exit(1)
}

// ============================================================================================
// Scripture reference grammar — ported from src/shared/scriptureRef.ts. A standalone tools/
// script can't import that TS module without a build step, so (matching tools/epub-to-md.mjs's
// own precedent of keeping its own book list) this is a plain-JS port, not a re-derivation —
// keep it in sync with scriptureRef.ts by hand if that grammar ever changes.
// ============================================================================================

const RAW_BOOKS = [
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
const BOOKS = RAW_BOOKS.map(([code, name, chapters, abbr]) => ({ code, name, chapters, abbr }))
const BY_CODE = new Map(BOOKS.map((b) => [b.code, b]))

const SPELLING_TO_CODE = new Map()
const RAW_SPELLINGS = []
const FULL_NAME_SPELLINGS = []
for (const b of BOOKS) {
  FULL_NAME_SPELLINGS.push(b.name)
  for (const s of [b.name, ...b.abbr]) {
    SPELLING_TO_CODE.set(s.toLowerCase(), b.code)
    if (/^(First|Second|Third)\s/.test(s)) {
      FULL_NAME_SPELLINGS.push(s)
      continue
    }
    RAW_SPELLINGS.push(s)
  }
}
const ESC = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const ALTERNATION = RAW_SPELLINGS.sort((a, b) => b.length - a.length).map(ESC).join('|')
const FULL_NAME_ALTERNATION = FULL_NAME_SPELLINGS.sort((a, b) => b.length - a.length).map(ESC).join('|')

const CORE = `(${ALTERNATION})\\b\\.?\\s+(\\d{1,3})(?::(\\d{1,3})(?:\\s*[-–]\\s*(\\d{1,3}))?)?`
const SCAN_RE = new RegExp(`\\b${CORE}`, 'g')
const BARE_BOOK_NAME_RE = new RegExp(`\\b(${FULL_NAME_ALTERNATION})\\s*$`)

/** Find a bare book-name mention at the end of `text`, with no chapter/verse required — for
 *  running headers that restate only the book ("Interpretation of Second Corinthians"). */
function matchBareBookName(text) {
  const m = BARE_BOOK_NAME_RE.exec(text.trim())
  if (!m) return null
  return SPELLING_TO_CODE.get(m[1].toLowerCase()) ?? null
}

/** Resolve a full book name or abbreviation (the *entire* string) to its USFM code. */
function bookCodeFromName(name) {
  return SPELLING_TO_CODE.get(name.trim().toLowerCase()) ?? null
}

function buildRef(spelling, chapter, vs, ve, raw, index) {
  const code = SPELLING_TO_CODE.get(spelling.toLowerCase())
  const def = code ? BY_CODE.get(code) : undefined
  if (!def) return null
  const ch = Number(chapter)
  if (ch < 1 || ch > def.chapters) return null
  const verseStart = vs ? Number(vs) : undefined
  const verseEnd = ve ? Number(ve) : verseStart
  return { raw, index, book: def.code, chapter: ch, verseStart, verseEnd }
}

/** Find every Scripture reference in free text — used by the 'book-chapter-verse' shape. */
function findReferences(text) {
  const out = []
  SCAN_RE.lastIndex = 0
  let m
  while ((m = SCAN_RE.exec(text))) {
    const ref = buildRef(m[1], m[2], m[3], m[4], m[0], m.index)
    if (ref) out.push(ref)
  }
  return out
}

// --- Commentary header parsing --------------------------------------------------------------

const N = '\\d{1,3}'
const GLITCHED_ONE = '[lLI|\\]]{1,2}'
const NUM = `(?:${N}|${GLITCHED_ONE})`
const DASH = '[-–—]'
const RANGE = `(${NUM})(?:\\s*${DASH}\\s*(${NUM}))?`

function parseNumeral(s) {
  return /^\d+$/.test(s) ? Number(s) : 1
}

const ROMAN_RE = /^[ivxlcdm]+$/i
const ROMAN_VALUES = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 }

/** Parse a Roman numeral (any case) to an integer, or null if it isn't one. */
function romanToInt(s) {
  const clean = s.trim().toLowerCase()
  if (!clean || !ROMAN_RE.test(clean)) return null
  // V, L, D never repeat in a valid Roman numeral — reject "ll"/"vv"/"dd" rather than silently
  // computing a technically-parseable but nonsensical value (real: Lenski's "CHAPTER ll" is a
  // glyph-mangled "II", not a genuine repeated "L").
  if (/([vld])\1/.test(clean)) return null
  let total = 0
  for (let i = 0; i < clean.length; i++) {
    const cur = ROMAN_VALUES[clean[i]]
    const next = i + 1 < clean.length ? ROMAN_VALUES[clean[i + 1]] : 0
    total += cur < next ? -cur : cur
  }
  return total > 0 ? total : null
}

const SHAPE_PATTERNS = {
  'chapter-verse': new RegExp(`^\\(?(${N})\\s*:\\s*(${N})(?:\\s*${DASH}\\s*(?:(${N})\\s*:\\s*)?(${N}))?\\)?`),
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

const HEADER_SHAPES = [
  'book-chapter-verse',
  'chapter-verse',
  'chapter-verse-roman',
  'bracket-number',
  'paren-number',
  'word-label',
  'phrase-label',
  'bare-range'
]

/** Parse one candidate header line against carried context (state.book/state.chapter). Returns
 *  null if `line` doesn't match `shape`, or the shape needs context not yet established. */
function parseCommentaryHeader(line, state, shape) {
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
    const m = SHAPE_PATTERNS['chapter-verse'].exec(trimmed)
    if (!m) return null
    const chapterStart = Number(m[1])
    const verseStart = Number(m[2])
    const chapterEnd = m[3] ? Number(m[3]) : chapterStart
    const verseEnd = m[4] ? Number(m[4]) : verseStart
    return { raw: m[0], book: state.book, chapterStart, verseStart, chapterEnd, verseEnd, contextual: false }
  }

  if (shape === 'chapter-verse-roman') {
    if (!state.book) return null
    const m = SHAPE_PATTERNS['chapter-verse-roman'].exec(trimmed)
    if (!m || !m[2]) return null
    const chapter = romanToInt(m[1])
    if (chapter == null) return null
    const verseStart = Number(m[2])
    const verseEnd = m[3] ? Number(m[3]) : verseStart
    return { raw: m[0], book: state.book, chapterStart: chapter, verseStart, chapterEnd: chapter, verseEnd, contextual: false }
  }

  // Remaining shapes are all "bare verse/range" forms needing an established book + chapter.
  if (!state.book || state.chapter == null) return null
  const pattern = SHAPE_PATTERNS[shape]
  if (!pattern) return null
  const m = pattern.exec(trimmed)
  if (!m) return null
  const verseStart = parseNumeral(m[1])
  const endGlitched = !!m[2] && !/^\d+$/.test(m[2])
  const verseEnd = !m[2] || endGlitched ? verseStart : parseNumeral(m[2])
  return {
    raw: m[0],
    book: state.book,
    chapterStart: state.chapter,
    verseStart,
    chapterEnd: state.chapter,
    verseEnd,
    contextual: true,
    verseStartGlitched: !/^\d+$/.test(m[1])
  }
}

/** A standalone chapter heading with no verse component ("Chapter III", "Cap. III"). `raw` is
 *  the matched numeral itself, for reinterpretGlyphedRoman's fallback below. */
function parseChapterOnlyHeader(line) {
  const m = /^(?:Chapter|Chap\.?|Cap\.?)\s+([ivxlcdm]+)\s*\.?$/i.exec(line.trim())
  if (!m) return null
  const chapter = romanToInt(m[1])
  return chapter != null ? { chapter, raw: m[1] } : null
}

/** Retry a Roman-numeral chapter title with every ambiguous 'l'/'L' reinterpreted as a mangled
 *  "I" — the same glyph-lookalike quirk GLITCHED_ONE guards for standalone "1"s, here striking
 *  inside a multi-character numeral (real: Lenski's "CHAPTER Vl" for "CHAPTER VI" parses as
 *  V-then-L = 45 instead of the intended 6, since lowercase 'l' is itself a valid Roman digit
 *  worth 50 — romanToInt has no way to know it's "I" gone wrong). Only tried by the caller when
 *  the direct reading is already out of range for the book, so a genuine numeral that legitimately
 *  contains L ("Chapter L", "Chapter LX" — real for 50+-chapter books like Genesis or Psalms) is
 *  never second-guessed. */
function reinterpretGlyphedRoman(raw, maxChapter) {
  if (!/[lL]/.test(raw)) return null
  const retried = romanToInt(raw.replace(/[lL]/g, 'i'))
  return retried != null && retried <= maxChapter ? retried : null
}

const CHAPTER_TITLE_LOOSE_RE = /^(?:Chapter|Chap\.?|Cap\.?)\s+\S+$/i

/** True when `line` clearly reads as a chapter-title marker even though its numeral doesn't
 *  parse as a clean Roman numeral (glyph-mangled mid-numeral, real: Gerhard's "CHAPTER |"). */
function looksLikeChapterTitle(line) {
  return CHAPTER_TITLE_LOOSE_RE.test(line.trim())
}

// ============================================================================================
// PDF line extraction — ported from src/main/services/commentaryExtract.ts.
// ============================================================================================

/** "2 TIMOTHY" -> "2 Timothy" — for testing all-caps running headers against the (deliberately
 *  case-sensitive) book-name grammar; never used for excerpt-boundary text. */
function titleCaseWords(s) {
  return s.replace(/[A-Za-z]+/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
}

function groupItemsByY(items, page) {
  const buckets = []
  const TOLERANCE = 2
  for (const item of items) {
    if (!item.str) continue
    const y = item.transform[5]
    const x = item.transform[4]
    const fontSize = Math.round(item.height * 100) / 100
    const bold = /bold|black|heavy/i.test(item.fontName)
    let bucket = buckets.find((b) => Math.abs(b.y - y) <= TOLERANCE)
    if (!bucket) {
      bucket = { y, items: [] }
      buckets.push(bucket)
    }
    bucket.items.push({ x, text: item.str, fontSize, bold, fontName: item.fontName })
  }
  return buckets
    .map((b) => {
      const sorted = [...b.items].sort((a, c) => a.x - c.x)
      const text = sorted.map((i) => i.text).join('')
      const first = sorted[0]
      const distinctFonts = new Set(b.items.map((i) => i.fontName))
      return {
        page,
        y: b.y,
        x: first.x,
        text,
        fontSize: first.fontSize,
        bold: first.bold,
        multiFont: distinctFonts.size > 1
      }
    })
    .filter((l) => l.text.trim().length > 0)
    .sort((a, b) => b.y - a.y)
}

const ITEM_LEFT = (i) => i.transform[4]
const ITEM_RIGHT = (i) => i.transform[4] + (i.width ?? 0)

/** Detect a vertical whitespace gutter splitting a page into two text columns (real: Kretzmann's
 *  Popular Commentary), returning the split x-coordinate, or null for a single-column page. */
function findColumnGutter(items) {
  const withText = items.filter((i) => i.str.trim())
  if (withText.length < 40) return null
  const minX = Math.min(...withText.map(ITEM_LEFT))
  const maxX = Math.max(...withText.map(ITEM_RIGHT))
  const span = maxX - minX
  if (span <= 0) return null

  let bestX = null
  let bestCrossing = Infinity
  for (let x = minX + span * 0.33; x <= minX + span * 0.66; x += 2) {
    let crossing = 0
    for (const i of withText) if (ITEM_LEFT(i) < x && ITEM_RIGHT(i) > x) crossing++
    if (crossing < bestCrossing) {
      bestCrossing = crossing
      bestX = x
    }
  }
  if (bestX == null || bestCrossing > withText.length * 0.02) return null

  const leftCount = withText.filter((i) => ITEM_RIGHT(i) <= bestX).length
  const rightCount = withText.filter((i) => ITEM_LEFT(i) >= bestX).length
  if (leftCount < withText.length * 0.25 || rightCount < withText.length * 0.25) return null
  return bestX
}

/** Group a page's items into reading-order lines, transparently handling two-column layouts. */
function groupIntoLines(items, page) {
  const gutter = findColumnGutter(items)
  if (gutter == null) return groupItemsByY(items, page)
  const leftItems = items.filter((i) => ITEM_LEFT(i) < gutter)
  const rightItems = items.filter((i) => ITEM_LEFT(i) >= gutter)
  return [...groupItemsByY(leftItems, page), ...groupItemsByY(rightItems, page)]
}

function shapeMatchesLine(text, shape) {
  return parseCommentaryHeader(text, { book: 'XXX', chapter: 1 }, shape) !== null
}

function median(nums) {
  if (nums.length === 0) return 0
  const sorted = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

const SIZE_TOLERANCE = 0.75
const X_TOLERANCE = 4
const MULTI_FONT_RATE_TOLERANCE = 0.3

/** A candidate line matches the learned header style if it's close to the header's own (font
 *  size, x, font-switching) on whichever axis actually distinguishes header from body. */
function matchesLearnedHeaderStyle(line, profile) {
  const sizeDistinct = Math.abs(profile.headerFontSize - profile.bodyFontSize) > SIZE_TOLERANCE
  const xDistinct = Math.abs(profile.headerMarginX - profile.bodyMarginX) > X_TOLERANCE
  const multiFontDistinct = Math.abs(profile.headerMultiFontRate - profile.bodyMultiFontRate) > MULTI_FONT_RATE_TOLERANCE

  const sizeMatches = Math.abs(line.fontSize - profile.headerFontSize) <= SIZE_TOLERANCE
  const xMatches = Math.abs(line.x - profile.headerMarginX) <= X_TOLERANCE
  const multiFontMatches = line.multiFont === profile.headerMultiFontRate > 0.5

  return (sizeDistinct && sizeMatches) || (xDistinct && xMatches) || (multiFontDistinct && multiFontMatches)
}

/** Sample a representative slice of the document for profiling: skip the first ~10% (front
 *  matter/TOC) and take up to 40 pages evenly spaced through the rest. */
function pickProfilingSample(pagesLines) {
  const total = pagesLines.length
  if (total <= 40) return pagesLines
  const usable = pagesLines.slice(Math.floor(total * 0.1))
  const step = Math.max(1, Math.floor(usable.length / 40))
  const sample = []
  for (let i = 0; i < usable.length && sample.length < 40; i += step) sample.push(usable[i])
  return sample
}

/** Infer a source's header shape and structural signal from a sample of its pages. */
function profileSource(pagesLines) {
  const allLines = pagesLines.flat()

  let bestShape = HEADER_SHAPES[0]
  let bestMatches = []
  for (const shape of HEADER_SHAPES) {
    const matches = allLines.filter((l) => shapeMatchesLine(l.text, shape))
    const bodyLikeCount = allLines.length
    if (matches.length >= 3 && matches.length < bodyLikeCount * 0.5 && matches.length > bestMatches.length) {
      bestShape = shape
      bestMatches = matches
    }
  }

  const nonMatching = allLines.filter((l) => !bestMatches.includes(l))
  const rate = (lines) => (lines.length === 0 ? 0 : lines.filter((l) => l.multiFont).length / lines.length)
  const profile = {
    shape: bestShape,
    bodyFontSize: median(nonMatching.map((l) => l.fontSize)),
    headerFontSize: median(bestMatches.map((l) => l.fontSize)),
    bodyMarginX: median(nonMatching.map((l) => l.x)),
    headerMarginX: median(bestMatches.map((l) => l.x)),
    headerMultiFontRate: rate(bestMatches),
    bodyMultiFontRate: rate(nonMatching)
  }

  const pageByNumber = new Map()
  for (const p of pagesLines) if (p.length) pageByNumber.set(p[0].page, p)
  const samples = bestMatches.slice(0, 10).map((line) => {
    const pageLines = pageByNumber.get(line.page) ?? []
    const idx = pageLines.indexOf(line)
    const after = idx >= 0 ? pageLines.slice(idx + 1, idx + 3) : []
    return { page: line.page, headerRaw: line.text, snippetAfter: after.map((l) => l.text).join(' ').slice(0, 150) }
  })

  return { profile, samples }
}

const DIGIT_RUN = /\d+/g
function normalizeForBandDetection(text) {
  return text.trim().replace(DIGIT_RUN, '#')
}

/** Detect recurring running headers/footers by comparing each page's topmost and bottommost
 *  line across all sampled pages — if the same (digit-normalized) text recurs on at least half
 *  the pages, it's a running header/footer, not body content. */
function detectRunningLines(pagesLines) {
  const pagesWithContent = pagesLines.filter((p) => p.length > 0)
  if (pagesWithContent.length < 3) return []

  const topCounts = new Map()
  const bottomCounts = new Map()
  for (const page of pagesWithContent) {
    const top = normalizeForBandDetection(page[0].text)
    const bottom = normalizeForBandDetection(page[page.length - 1].text)
    topCounts.set(top, (topCounts.get(top) ?? 0) + 1)
    if (bottom !== top) bottomCounts.set(bottom, (bottomCounts.get(bottom) ?? 0) + 1)
  }

  const threshold = pagesWithContent.length * 0.5
  const specs = []
  for (const [text, count] of topCounts) if (count >= threshold) specs.push({ edge: 'top', normalizedText: text })
  for (const [text, count] of bottomCounts) if (count >= threshold) specs.push({ edge: 'bottom', normalizedText: text })
  return specs
}

// Wide enough to see through sources whose running header alternates format by verso/recto page
// (real: Gerhard's odd pages show "2 TIMOTHY 1:2-3 115", even pages show "116 COMMENTARY ON 2
// TIMOTHY" with no chapter:verse at all). Deliberately higher than the bare minimum needed to
// detect *some* pattern, since a citation-dense source can coincidentally recur a citation
// format nearby (real: Lenski's Corinthians has isolated, self-correcting single-page misfires).
const RECURRING_EDGE_WINDOW = 8
const RECURRING_EDGE_MIN_MATCHES = 3

function isRecurringEdge(pagesLines, pageIdx, edge) {
  const lines = pagesLines[pageIdx]
  if (lines.length === 0) return false
  const normalized = normalizeForBandDetection(edge === 'top' ? lines[0].text : lines[lines.length - 1].text)

  let matches = 0
  const from = Math.max(0, pageIdx - RECURRING_EDGE_WINDOW)
  const to = Math.min(pagesLines.length - 1, pageIdx + RECURRING_EDGE_WINDOW)
  for (let i = from; i <= to; i++) {
    if (i === pageIdx) continue
    const other = pagesLines[i]
    if (other.length === 0) continue
    const otherNormalized = normalizeForBandDetection(edge === 'top' ? other[0].text : other[other.length - 1].text)
    if (otherNormalized === normalized) matches++
  }
  return matches >= RECURRING_EDGE_MIN_MATCHES
}

function stripRunningLines(lines, specs) {
  if (specs.length === 0 || lines.length === 0) return lines
  const normalizedTop = normalizeForBandDetection(lines[0].text)
  const normalizedBottom = normalizeForBandDetection(lines[lines.length - 1].text)
  const dropTop = specs.some((s) => s.edge === 'top' && s.normalizedText === normalizedTop)
  const dropBottom = specs.some((s) => s.edge === 'bottom' && s.normalizedText === normalizedBottom)
  return lines.filter((_l, i) => {
    if (dropTop && i === 0) return false
    if (dropBottom && i === lines.length - 1) return false
    return true
  })
}

/** Clamp a chapter number to the book's real range, warning once per offending value — a
 *  defense-in-depth backstop (not just against the specific runaway below) for any chapter
 *  value a heuristic ever proposes that the canon itself rules out. Unknown book codes pass
 *  through unclamped (nothing to check against). */
const warnedChapterOverflows = new Set()
function clampChapter(book, chapter, context) {
  const def = BY_CODE.get(book)
  if (!def || chapter <= def.chapters) return chapter
  const key = `${book}:${chapter}`
  if (!warnedChapterOverflows.has(key)) {
    warnedChapterOverflows.add(key)
    const where = context ? ` (from "${context.text}" on p.${context.page})` : ''
    console.error(`WARNING: inferred chapter ${chapter} for ${book}, which only has ${def.chapters}${where} — clamping to ${def.chapters}.`)
  }
  return def.chapters
}

/** Chunk a whole document's already-grouped, per-page lines into verse-keyed excerpts. */
function chunkDocument(pagesLines, profile, initialState) {
  const runningLines = detectRunningLines(pagesLines)
  const state = { ...initialState }
  const chunks = []
  let current = null
  // Guards the "assume next chapter" glyph-mangled-title fallback: true once a real verse
  // header has been produced under the *current* book/chapter anchor (real: Gerhard's 2 Timothy
  // opens with its own "CHAPTER |" restating chapter 1, right after the book transition reset
  // chapter to 1 — advancing to 2 there would be wrong).
  let chunkSeenSinceReset = false

  for (let pageIdx = 0; pageIdx < pagesLines.length; pageIdx++) {
    const rawLines = pagesLines[pageIdx]
    const edges = [
      ['top', rawLines[0]],
      ['bottom', rawLines[rawLines.length - 1]]
    ]
    for (const [edge, edgeLine] of edges) {
      if (!edgeLine || !isRecurringEdge(pagesLines, pageIdx, edge)) continue
      const pageRef = parseCommentaryHeader(titleCaseWords(edgeLine.text), { book: null, chapter: null }, 'book-chapter-verse')
      if (pageRef) {
        if (pageRef.book !== state.book || pageRef.chapterStart !== state.chapter) chunkSeenSinceReset = false
        state.book = pageRef.book
        state.chapter = pageRef.chapterStart
        break
      }
      const bareBook = matchBareBookName(titleCaseWords(edgeLine.text))
      if (bareBook && bareBook !== state.book) {
        state.book = bareBook
        state.chapter = 1
        chunkSeenSinceReset = false
        break
      }
    }
    const lines = stripRunningLines(rawLines, runningLines)
    for (const line of lines) {
      const chapterOnly = parseChapterOnlyHeader(line.text)
      if (chapterOnly) {
        const maxChapter = BY_CODE.get(state.book)?.chapters
        const resolved =
          maxChapter && chapterOnly.chapter > maxChapter
            ? (reinterpretGlyphedRoman(chapterOnly.raw, maxChapter) ?? chapterOnly.chapter)
            : chapterOnly.chapter
        const clamped = clampChapter(state.book, resolved, line)
        if (clamped !== state.chapter) chunkSeenSinceReset = false
        state.chapter = clamped
        continue
      }
      const isLargeTitleFont = line.fontSize > profile.bodyFontSize + 3
      if (isLargeTitleFont && looksLikeChapterTitle(line.text) && state.chapter != null && chunkSeenSinceReset) {
        state.chapter = clampChapter(state.book, state.chapter + 1, line)
        // Re-arm the guard: without this, a run of several large-font lines that each merely
        // *look* like a chapter title (no real verse content confirming any of them) advances
        // the chapter once per line with nothing to stop it — real find: a run of such lines in
        // a Lenski PDF advanced Mark from chapter 5 to a nonexistent "chapter 45" with zero
        // actual verse headers in between. Requiring a genuine verse header to re-confirm before
        // the next speculative advance bounds the damage to one wrong guess per real transition.
        chunkSeenSinceReset = false
        continue
      }

      const header = parseCommentaryHeader(line.text, state, profile.shape)
      if (header && matchesLearnedHeaderStyle(line, profile)) {
        chunkSeenSinceReset = true
        const previous = current
        if (previous) chunks.push(previous)
        state.book = header.book
        state.chapter = header.chapterEnd
        const verseStart =
          header.verseStartGlitched && previous && previous.book === header.book && previous.chapterEnd === header.chapterStart
            ? previous.verseEnd + 1
            : header.verseStart
        const verseEnd = header.verseEnd === header.verseStart ? verseStart : header.verseEnd
        current = {
          headerRaw: line.text,
          book: header.book,
          chapterStart: header.chapterStart,
          verseStart,
          chapterEnd: header.chapterEnd,
          verseEnd,
          text: '',
          page: line.page
        }
        continue
      }

      if (current) current.text += (current.text ? '\n' : '') + line.text
    }
  }
  if (current) chunks.push(current)
  return chunks
}

/** Extract every page's grouped lines from a PDF's bytes. */
async function extractPagesLines(pdfBytes, onProgress) {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs')
  pdfjsLib.GlobalWorkerOptions.workerSrc = pathToFileURL(
    require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs')
  ).href

  const data = pdfBytes.constructor === Uint8Array ? pdfBytes : new Uint8Array(pdfBytes)
  const doc = await pdfjsLib.getDocument({ data, useSystemFonts: true }).promise
  const pages = []
  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum)
    const content = await page.getTextContent()
    pages.push(groupIntoLines(content.items, pageNum))
    onProgress?.(pageNum, doc.numPages)
  }
  return pages
}

// ============================================================================================
// Output + coverage report — contract ported from tools/epub-to-md.mjs.
// ============================================================================================

function writeCanonicalMarkdown(chunks, outPath) {
  const out = []
  let writtenBook = null
  for (const c of chunks) {
    // An empty-bodied chunk (a header immediately followed by another header, no text between)
    // usually means the first header was a false positive, not a genuine empty comment — but
    // silently dropping it would make the coverage report below overstate what's actually in
    // the file (a real find while validating this tool: it claimed 113 excerpts when only 103
    // were ever written). Write it through instead — the app's own validateSource flags a
    // 0-word excerpt for review, which is the honest outcome, not a silent gap.
    if (c.book !== writtenBook) {
      if (out.length) out.push('')
      out.push('# ' + (BY_CODE.get(c.book)?.name ?? c.book), '')
      writtenBook = c.book
    }
    const ref =
      c.verseEnd !== c.verseStart || c.chapterEnd !== c.chapterStart
        ? `${c.chapterStart}:${c.verseStart}-${c.chapterEnd !== c.chapterStart ? c.chapterEnd + ':' : ''}${c.verseEnd}`
        : `${c.chapterStart}:${c.verseStart}`
    out.push('## ' + ref)
    out.push(c.text.trim())
    out.push('')
  }
  if (out.length === 0) out.push('# ' + bookName, '')
  writeFileSync(outPath, out.join('\n'), 'utf8')
}

/** Loud, greppable coverage report — the exact property that made the recent EPUB-side bugs
 *  (a 58-byte "Corinthians", a 242KB file that yielded only 2 excerpts) instantly diagnosable
 *  from file size and heading count alone. Applied here too, plus an explicit low-yield check
 *  the EPUB tool doesn't have, since a PDF's page count gives a concrete expectation to compare
 *  against that an EPUB's file size doesn't. */
function reportCoverage(chunks, pageCount) {
  if (chunks.length === 0) {
    console.error(`WARNING: 0 excerpts extracted from ${pageCount} pages — the header shape was probably misdetected. Try --profile-only first.`)
    return
  }
  const byBook = new Map()
  for (const c of chunks) {
    if (!byBook.has(c.book)) byBook.set(c.book, new Set())
    byBook.get(c.book).add(c.chapterStart)
  }
  if (byBook.size <= 1) {
    const chapters = new Set(chunks.map((c) => c.chapterStart))
    console.error(`excerpts: ${chunks.length}, chapters: ${chapters.size} (${[...chapters].sort((a, b) => a - b).join(',')})`)
  } else {
    console.error(`excerpts: ${chunks.length} across ${byBook.size} books:`)
    const perBookCounts = []
    for (const [book, chs] of byBook) {
      const count = chunks.filter((c) => c.book === book).length
      perBookCounts.push(count)
      console.error(`  ${book}: ${count} excerpts, chapters ${[...chs].sort((a, b) => a - b).join(',')}`)
    }
    // A source that's genuinely a multi-book volume (real: Gerhard's 1&2 Timothy) has substantial
    // excerpt counts in EACH book. Many books each with only a handful of excerpts is a different
    // signature: cross-reference citations in the prose ("as Paul says in Romans 7...") getting
    // mistaken for real book-changing headers under the 'book-chapter-verse' shape, which has no
    // way to tell "this line IS a header" from "this line is body text that happens to name
    // another book+chapter" — matchesLearnedHeaderStyle's font/margin check is the only defense,
    // and it isn't always enough. Real find: an ACCS PDF whose two-level pericope/verse structure
    // this single-shape profiler doesn't model at all produced 13 "books" this way, 12 of them
    // spurious. If most of this source's excerpts sit in ONE book and everything else is thin,
    // the thin ones are probably contamination, not real coverage.
    perBookCounts.sort((a, b) => b - a)
    const [largest, ...rest] = perBookCounts
    const restMedian = rest.length ? rest[Math.floor(rest.length / 2)] : 0
    if (byBook.size > 3 && restMedian <= 3 && largest > rest.reduce((s, n) => s + n, 0)) {
      console.error(
        `WARNING: ${byBook.size} "books" detected but ${rest.length} of them have ~${restMedian} excerpts or ` +
          `fewer each, while one book has ${largest} — this looks like cross-reference citations mistaken for ` +
          `headers, not a genuine multi-book volume. Don't trust this conversion without reviewing it by hand; ` +
          `this source's layout likely needs a different approach than single-shape header profiling (e.g. a ` +
          `two-level pericope/verse structure, as ACCS volumes use).`
      )
    }
  }
  const excerptsPerPage = chunks.length / Math.max(1, pageCount)
  if (excerptsPerPage < 0.15) {
    console.error(
      `WARNING: only ${chunks.length} excerpts from ${pageCount} pages (${excerptsPerPage.toFixed(2)}/page) — ` +
        `unusually low yield. Check the output file: the header shape may be right but under-firing (verify a ` +
        `few pages by hand before trusting this conversion).`
    )
  }
  const avgLen = chunks.reduce((s, c) => s + c.text.length, 0) / chunks.length
  if (avgLen < 40) {
    console.error(
      `WARNING: average excerpt length is only ${Math.round(avgLen)} characters — excerpts may be getting cut ` +
        `off right after their header (check matchesLearnedHeaderStyle / body-vs-header signal for this source).`
    )
  }
}

// ============================================================================================
// Main
// ============================================================================================

const pdfBytes = readFileSync(pdfPath)
console.error(`reading ${pdfPath}...`)
const pagesLines = await extractPagesLines(pdfBytes, (done, total) => {
  if (done % 50 === 0 || done === total) console.error(`  page ${done}/${total}`)
})
console.error(`extracted ${pagesLines.length} pages`)

const sample = pickProfilingSample(pagesLines)
const { profile, samples } = profileSource(sample)
console.error(
  `inferred shape: ${profile.shape} (header font ${profile.headerFontSize} vs body ${profile.bodyFontSize}, ` +
    `header x ${profile.headerMarginX} vs body x ${profile.bodyMarginX}, ` +
    `header multiFont rate ${profile.headerMultiFontRate.toFixed(2)} vs body ${profile.bodyMultiFontRate.toFixed(2)})`
)

if (profileOnly) {
  console.error(`\n${samples.length} sample matches:`)
  for (const s of samples) {
    console.error(`  p.${s.page}  "${s.headerRaw}"  -> ${s.snippetAfter}`)
  }
  process.exit(0)
}

const seedBook = bookCodeFromName(bookName)
if (!seedBook) {
  console.error(`note: "${bookName}" isn't a recognized book name — relying entirely on in-document headers to establish the book.`)
}
const chunks = chunkDocument(pagesLines, profile, { book: seedBook, chapter: null })

writeCanonicalMarkdown(chunks, outFile)
reportCoverage(chunks, pagesLines.length)
console.error(`wrote ${outFile}`)
