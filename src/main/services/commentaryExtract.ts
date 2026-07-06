import { pathToFileURL } from 'url'
import {
  looksLikeChapterTitle,
  matchBareBookName,
  parseChapterOnlyHeader,
  parseCommentaryHeader,
  type HeaderParseState,
  type HeaderShape,
  type ParsedHeader
} from '../../shared/scriptureRef'

/** "2 TIMOTHY" -> "2 Timothy" — used only to test all-caps running headers against the
 *  (deliberately case-sensitive) book-name grammar; never used for excerpt-boundary text. */
function titleCaseWords(s: string): string {
  return s.replace(/[A-Za-z]+/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
}

/** All header shapes profiling will try, in no particular order. */
export const HEADER_SHAPES: HeaderShape[] = [
  'book-chapter-verse',
  'chapter-verse',
  'chapter-verse-roman',
  'bracket-number',
  'paren-number',
  'word-label',
  'phrase-label',
  'bare-range'
]

/** A line of body text, grouped from raw pdfjs text items by y-coordinate. `x`/`fontSize`/
 *  `bold` describe the leftmost (first) item on the line — what actually determines whether
 *  the line *starts* with header-styled text, since a header phrase's font often reverts to
 *  body style partway through (e.g. "1:9 exaltation. <body text...>"). `multiFont` is a
 *  separate signal: some sources mark a header by switching fonts mid-line (e.g. a roman
 *  verse-number label followed by an italicized quotation) without changing size or margin —
 *  and pdfjs anonymizes embedded font names (e.g. "g_d0_f1"), so "is this run italic/bold"
 *  can't be read from the name; a font *change within the line* is what's actually visible. */
export interface PositionedLine {
  page: number
  y: number
  x: number
  text: string
  fontSize: number
  bold: boolean
  multiFont: boolean
}

/** Raw pdfjs TextItem shape (subset actually used here). */
export interface RawTextItem {
  str: string
  transform: number[]
  height: number
  fontName: string
  hasEOL?: boolean
}

/** Group a page's raw text items into lines by y-coordinate proximity (items on the same
 *  line generally share a y within a point or two; distinct lines don't). */
export function groupIntoLines(items: RawTextItem[], page: number): PositionedLine[] {
  const buckets: {
    y: number
    items: { x: number; text: string; fontSize: number; bold: boolean; fontName: string }[]
  }[] = []
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
    .sort((a, b) => b.y - a.y) // reading order: top of page first
}

/** Tests whether `line` matches `shape`'s grammar at all, ignoring contextual state (used
 *  during profiling's sampling pass, before any book/chapter context has been established).
 *  A placeholder non-null state satisfies parseCommentaryHeader's context gate — the shape's
 *  regex itself doesn't depend on the placeholder's actual value. */
function shapeMatchesLine(text: string, shape: HeaderShape): boolean {
  return parseCommentaryHeader(text, { book: 'XXX', chapter: 1 }, shape) !== null
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0
  const sorted = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/** The learned per-source header profile, confirmed by the user (Phase 2c) before full
 *  extraction runs. `bodyFontSize`/`bodyMarginX` and `headerFontSize`/`headerMarginX` are
 *  compared against each other (not fixed constants) since headers can be smaller OR larger
 *  than body text, and indented OR flush depending on the source's typesetting. */
export interface SourceProfile {
  shape: HeaderShape
  bodyFontSize: number
  headerFontSize: number
  bodyMarginX: number
  headerMarginX: number
  /** Fraction of header-shaped lines (during profiling) that mixed more than one font, vs.
   *  the same fraction among ordinary body lines — a header that switches fonts mid-line
   *  (e.g. a label followed by an italicized quotation) trips this even when size/margin
   *  don't differ at all (real example: bracketed verse numbers followed by an italic quote,
   *  where the PDF's embedded fonts have anonymized names so "italic" can't be read directly). */
  headerMultiFontRate: number
  bodyMultiFontRate: number
}

const SIZE_TOLERANCE = 0.75
const X_TOLERANCE = 4
const MULTI_FONT_RATE_TOLERANCE = 0.3

/** A candidate line matches the learned header style if it's close to the header's own
 *  (font size, x, font-switching) on whichever axis actually distinguishes header from body
 *  for this source. */
export function matchesLearnedHeaderStyle(line: PositionedLine, profile: SourceProfile): boolean {
  const sizeDistinct = Math.abs(profile.headerFontSize - profile.bodyFontSize) > SIZE_TOLERANCE
  const xDistinct = Math.abs(profile.headerMarginX - profile.bodyMarginX) > X_TOLERANCE
  const multiFontDistinct =
    Math.abs(profile.headerMultiFontRate - profile.bodyMultiFontRate) > MULTI_FONT_RATE_TOLERANCE

  const sizeMatches = Math.abs(line.fontSize - profile.headerFontSize) <= SIZE_TOLERANCE
  const xMatches = Math.abs(line.x - profile.headerMarginX) <= X_TOLERANCE
  const multiFontMatches = line.multiFont === profile.headerMultiFontRate > 0.5

  return (
    (sizeDistinct && sizeMatches) || (xDistinct && xMatches) || (multiFontDistinct && multiFontMatches)
  )
}

export interface HeaderCandidate {
  line: PositionedLine
  header: ParsedHeader
}

/** A line qualifies as a header only if it BOTH parses under the source's confirmed shape
 *  AND carries that shape's learned structural signal — rejects inline cross-references like
 *  "see v. 16" in ordinary body text, which match the regex but not the structural signal. */
export function detectHeaders(
  lines: PositionedLine[],
  state: HeaderParseState,
  profile: SourceProfile
): HeaderCandidate[] {
  const out: HeaderCandidate[] = []
  for (const line of lines) {
    const header = parseCommentaryHeader(line.text, state, profile.shape)
    if (!header) continue
    if (!matchesLearnedHeaderStyle(line, profile)) continue
    out.push({ line, header })
    state.book = header.book
    state.chapter = header.chapterEnd
  }
  return out
}

export interface ProfileSample {
  page: number
  headerRaw: string
  snippetAfter: string
}

/** Infer a source's header shape and structural signal from a sample of its pages, and
 *  return a handful of matches for the user to confirm (Phase 2c). Pure function of
 *  already-grouped lines so it's testable without touching pdfjs or the filesystem. */
export function profileSource(pagesLines: PositionedLine[][]): {
  profile: SourceProfile
  samples: ProfileSample[]
} {
  const allLines = pagesLines.flat()

  let bestShape: HeaderShape = HEADER_SHAPES[0]
  let bestMatches: PositionedLine[] = []
  for (const shape of HEADER_SHAPES) {
    const matches = allLines.filter((l) => shapeMatchesLine(l.text, shape))
    // A source with real per-verse headers should have dozens across a whole book, not just
    // one or two incidental matches — require at least a few hits, and prefer whichever
    // shape has the most (but not literally most-of-the-document, which would mean the
    // "shape" is just matching ordinary prose).
    const bodyLikeCount = allLines.length
    if (matches.length >= 3 && matches.length < bodyLikeCount * 0.5 && matches.length > bestMatches.length) {
      bestShape = shape
      bestMatches = matches
    }
  }

  const nonMatching = allLines.filter((l) => !bestMatches.includes(l))
  const rate = (lines: PositionedLine[]): number =>
    lines.length === 0 ? 0 : lines.filter((l) => l.multiFont).length / lines.length
  const profile: SourceProfile = {
    shape: bestShape,
    bodyFontSize: median(nonMatching.map((l) => l.fontSize)),
    headerFontSize: median(bestMatches.map((l) => l.fontSize)),
    bodyMarginX: median(nonMatching.map((l) => l.x)),
    headerMarginX: median(bestMatches.map((l) => l.x)),
    headerMultiFontRate: rate(bestMatches),
    bodyMultiFontRate: rate(nonMatching)
  }

  const samples: ProfileSample[] = bestMatches.slice(0, 10).map((line) => {
    const pageLines = pagesLines[line.page - 1] ?? []
    const idx = pageLines.indexOf(line)
    const after = idx >= 0 ? pageLines.slice(idx + 1, idx + 3) : []
    return {
      page: line.page,
      headerRaw: line.text,
      snippetAfter: after.map((l) => l.text).join(' ').slice(0, 150)
    }
  })

  return { profile, samples }
}

const DIGIT_RUN = /\d+/g

/** Normalize a line for running-header/footer comparison — page numbers change per page,
 *  everything else in a running header/footer stays fixed. */
function normalizeForBandDetection(text: string): string {
  return text.trim().replace(DIGIT_RUN, '#')
}

export interface RunningLineSpec {
  /** Which edge of the page this recurring line sits on. */
  edge: 'top' | 'bottom'
  normalizedText: string
}

/** Detect recurring running headers/footers by comparing each page's topmost and bottommost
 *  line across all sampled pages — if the same (digit-normalized) text recurs on at least
 *  half the pages, it's a running header/footer, not body content. */
export function detectRunningLines(pagesLines: PositionedLine[][]): RunningLineSpec[] {
  const pagesWithContent = pagesLines.filter((p) => p.length > 0)
  if (pagesWithContent.length < 3) return []

  const topCounts = new Map<string, number>()
  const bottomCounts = new Map<string, number>()
  for (const page of pagesWithContent) {
    const top = normalizeForBandDetection(page[0].text)
    const bottom = normalizeForBandDetection(page[page.length - 1].text)
    topCounts.set(top, (topCounts.get(top) ?? 0) + 1)
    if (bottom !== top) bottomCounts.set(bottom, (bottomCounts.get(bottom) ?? 0) + 1)
  }

  const threshold = pagesWithContent.length * 0.5
  const specs: RunningLineSpec[] = []
  for (const [text, count] of topCounts) if (count >= threshold) specs.push({ edge: 'top', normalizedText: text })
  for (const [text, count] of bottomCounts)
    if (count >= threshold) specs.push({ edge: 'bottom', normalizedText: text })
  return specs
}

// Wide enough to see through sources whose running header alternates format by verso/recto
// page (real: Gerhard's odd pages show "2 TIMOTHY 1:2-3 115", even pages show "116
// COMMENTARY ON 2 TIMOTHY" with no chapter:verse at all) — a same-shape match then only
// recurs every other page, so a narrower window can miss the second confirming match.
// MIN_MATCHES is deliberately higher than the bare minimum needed to detect *some* pattern:
// a citation-dense source can have the same cross-reference citation format coincidentally
// recur 2-3 times nearby (real: Lenski's Corinthians commentary has isolated, self-correcting
// single-page misfires where a footnote reference to another book briefly hijacks tracking) —
// a genuine running header recurs on nearly every page for the length of a whole section, so
// requiring more confirmations costs nothing there while filtering out rarer coincidences.
const RECURRING_EDGE_WINDOW = 8
const RECURRING_EDGE_MIN_MATCHES = 3

/** True when the page at `pageIdx`'s top/bottom line also appears (digit-normalized) at the
 *  same edge on at least a couple of nearby pages — confirms a genuine running header/footer
 *  local to this stretch of the document, as opposed to incidental body text that happens to
 *  land on a single page's first/last line (a book-wide detectRunningLines pass can miss a
 *  running header that's only common within one section of a multi-book source, since it
 *  never reaches 50% of the *whole* document — this is deliberately local instead). */
function isRecurringEdge(
  pagesLines: PositionedLine[][],
  pageIdx: number,
  edge: 'top' | 'bottom'
): boolean {
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

/** Strip lines matching detected running headers/footers from one page's lines. */
export function stripRunningLines(lines: PositionedLine[], specs: RunningLineSpec[]): PositionedLine[] {
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

export interface ExtractedChunk {
  headerRaw: string
  book: string
  chapterStart: number
  verseStart: number
  chapterEnd: number
  verseEnd: number
  text: string
  page: number
}

/** Chunk a whole document's already-grouped, per-page lines into verse-keyed excerpts,
 *  threading header-parse state across page boundaries (a chapter can continue across a
 *  page break) and stripping detected running headers/footers first. Pure — takes lines,
 *  not PDF bytes, so it's testable without pdfjs. */
export function chunkDocument(
  pagesLines: PositionedLine[][],
  profile: SourceProfile,
  initialState: HeaderParseState = { book: null, chapter: null }
): ExtractedChunk[] {
  const runningLines = detectRunningLines(pagesLines)
  const state: HeaderParseState = { ...initialState }
  const chunks: ExtractedChunk[] = []
  let current: ExtractedChunk | null = null
  // Guards the "assume next chapter" glyph-mangled-title fallback below: true once a real
  // verse header has been produced under the *current* book/chapter anchor. Without it, the
  // very first chapter-title-like line seen right after any reset (document start, a book
  // transition, or an explicit chapter update) would be read as "the next chapter" even
  // though it's actually just restating the chapter that reset already established (real:
  // Gerhard's 2 Timothy opens with its own "CHAPTER |" restating chapter 1, right after the
  // book transition reset chapter to 1 — advancing to 2 there would be wrong).
  let chunkSeenSinceReset = false

  for (let pageIdx = 0; pageIdx < pagesLines.length; pageIdx++) {
    const rawLines = pagesLines[pageIdx]
    // Running headers/footers often restate "BOOK chapter:verse-verse" as a page guide
    // (e.g. "2 TIMOTHY 1:2-3") — re-anchor context from it before stripping, so a book
    // change partway through a source (a single PDF covering two epistles, say) isn't
    // missed even when the commentary's own excerpt headers never restate the book. Only
    // trust an edge line for this if it actually *recurs* nearby — otherwise ordinary body
    // text that happens to land on a page's very first/last line and happens to look like a
    // reference gets mistaken for an authoritative page guide (real: Lenski's Corinthians
    // commentary has a footnote "Gal. 3:1: ..." as a page's last line, which isn't a running
    // header at all and would otherwise hijack the whole book as Galatians from then on).
    const edges: Array<['top' | 'bottom', PositionedLine | undefined]> = [
      ['top', rawLines[0]],
      ['bottom', rawLines[rawLines.length - 1]]
    ]
    for (const [edge, edgeLine] of edges) {
      if (!edgeLine || !isRecurringEdge(pagesLines, pageIdx, edge)) continue
      // Running headers are frequently set in small caps/all caps ("2 TIMOTHY 1:2-3"), but
      // the book-name grammar is deliberately case-sensitive (to reject lowercase prose like
      // "mark 3 items") and only recognizes mixed-case spellings — title-case just for this
      // check, since a short, structurally-isolated page header isn't prose.
      const pageRef = parseCommentaryHeader(
        titleCaseWords(edgeLine.text),
        { book: null, chapter: null },
        'book-chapter-verse'
      )
      if (pageRef) {
        if (pageRef.book !== state.book || pageRef.chapterStart !== state.chapter) chunkSeenSinceReset = false
        state.book = pageRef.book
        state.chapter = pageRef.chapterStart
        break
      }
      // Some running headers restate only the book, with no chapter:verse page guide at all
      // (real: Lenski's "Interpretation of Second Corinthians" — unlike Gerhard's "2 TIMOTHY
      // 1:2-3" style, it never restates a reference). Catch a bare book-name *change* too,
      // resetting to chapter 1 since a book transition always starts there — but only on an
      // actual change, so a header merely restating the book already in progress doesn't
      // stomp on chapter tracking already underway from real headers.
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
      // Chapter-title pages ("CHAPTER II") are typically styled as a big display headline,
      // nothing like the source's learned *verse*-header signature (small label + body text)
      // — so unlike verse headers, this isn't gated by matchesLearnedHeaderStyle. The regex's
      // own anchoring (the whole line must be nothing but "Chapter <roman>") is specific
      // enough on its own to avoid misfiring on ordinary prose.
      const chapterOnly = parseChapterOnlyHeader(line.text)
      if (chapterOnly) {
        if (chapterOnly.chapter !== state.chapter) chunkSeenSinceReset = false
        state.chapter = chapterOnly.chapter
        continue
      }
      // Chapter title, but the numeral itself didn't parse (garbled glyph) — assume the
      // next sequential chapter rather than discarding the transition entirely. Unlike
      // parseChapterOnlyHeader's strict regex, "looks like a chapter title" alone (just
      // "Chapter <token>" on its own line) is loose enough to misfire on ordinary prose
      // outline text ("Chapter 5" mentioned in a summary) — real chapter titles are also
      // set in a big display font, well above body size, so require that too. Also require
      // a real chunk to have appeared since the last reset (document start, a book
      // transition, or an explicit chapter update) — the first chapter-title-like line right
      // after one of those restates the chapter the reset already established rather than
      // advancing past it (real: Gerhard's opening "CHAPTER I|" for 1 Timothy chapter 1, and
      // again "CHAPTER |" for 2 Timothy chapter 1 right after the book transition).
      const isLargeTitleFont = line.fontSize > profile.bodyFontSize + 3
      if (isLargeTitleFont && looksLikeChapterTitle(line.text) && state.chapter != null && chunkSeenSinceReset) {
        state.chapter += 1
        continue
      }

      const header = parseCommentaryHeader(line.text, state, profile.shape)
      if (header && matchesLearnedHeaderStyle(line, profile)) {
        chunkSeenSinceReset = true
        const previous: ExtractedChunk | null = current
        if (previous) chunks.push(previous)
        state.book = header.book
        state.chapter = header.chapterEnd
        // header.verseStart is just a "1" placeholder when the numeral itself was a
        // glyph-mangled glob whose value can't be read off directly (see
        // ParsedHeader.verseStartGlitched) — the glyph-run's length doesn't reliably
        // indicate the digit count (real: Gerhard's "Verse LI." is genuinely verse 11, not
        // 1). Resolve it from the chunk that came right before instead: commentaries
        // proceed verse-by-verse without skipping, so if the prior chunk (same book,
        // same chapter) ended at verse 10, this one is verse 11 — reliable without ever
        // having to guess at the glyphs themselves. Falls back to the 1 placeholder only
        // when there's no same-chapter predecessor (i.e. this really is a fresh chapter).
        const verseStart: number =
          header.verseStartGlitched &&
          previous &&
          previous.book === header.book &&
          previous.chapterEnd === header.chapterStart
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

      if (current) {
        current.text += (current.text ? '\n' : '') + line.text
      }
      // Lines before the first header are front matter/preface — dropped, not mis-tagged.
    }
  }
  if (current) chunks.push(current)
  return chunks
}

// --- pdfjs-dist I/O (thin — everything above this line is pure and unit-tested against
// synthetic fixtures; this is the one part that actually opens a PDF) ---------------------

/** Extract every page's grouped lines from a PDF's bytes. `onProgress` reports pages read,
 *  not excerpts produced — chunking/validation happen afterward on the returned lines. */
export async function extractPagesLines(
  pdfBytes: Uint8Array,
  onProgress?: (done: number, total: number) => void
): Promise<PositionedLine[][]> {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs')
  // No real Worker thread is used in Node — pdfjs still needs workerSrc pointed at the
  // worker module (as a file:// URL — Windows absolute paths aren't valid ESM specifiers)
  // so its "fake worker" fallback can load it in-process.
  pdfjsLib.GlobalWorkerOptions.workerSrc = pathToFileURL(
    require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs')
  ).href

  // library.getBookPdf() returns bytes read via Node's fs, which come back as a Buffer —
  // a Uint8Array subclass, but pdfjs-dist strictly rejects it ("provide binary data as
  // Uint8Array, rather than Buffer"). Force a plain Uint8Array.
  const data = pdfBytes.constructor === Uint8Array ? pdfBytes : new Uint8Array(pdfBytes)
  const doc = await pdfjsLib.getDocument({ data, useSystemFonts: true }).promise
  const pages: PositionedLine[][] = []
  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum)
    const content = await page.getTextContent()
    pages.push(groupIntoLines(content.items as RawTextItem[], pageNum))
    onProgress?.(pageNum, doc.numPages)
  }
  return pages
}
