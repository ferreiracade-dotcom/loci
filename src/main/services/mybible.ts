import { inflateRawSync } from 'zlib'
import type { ExtractedChunk } from './commentaryMarkdown'

// MyBible commentary modules (`*.commentaries.SQLite3`) are the format SermonIndex and many other
// sites publish commentaries in: one SQLite table of verse-keyed HTML comments. Reading them
// directly skips the PDF/EPUB conversion pipeline entirely, since the verse boundaries are data,
// not something inferred from layout.
//
//   commentaries(book_number, chapter_number_from, verse_number_from,
//                chapter_number_to, verse_number_to, text)
//
// verse_number_from = 0 marks a chapter introduction and chapter_number_from = 0 a book
// introduction. Neither is a real verse, so each is keyed to its chapter's verse 1: prefixed to
// verse 1's own comment when there is one, else as verse 1's excerpt by itself. Never to a later
// verse: where a module has no verse-1 row, the introduction is where verse 1 is discussed
// (Lenski on Matthew 1:1), so attaching it to 1:2 would mislabel it.

/** MyBible's fixed book numbering → the app's USFM codes. Deuterocanonical numbers are absent,
 *  so their rows are skipped rather than mis-filed. */
const MYBIBLE_BOOKS: Record<number, string> = {
  10: 'GEN', 20: 'EXO', 30: 'LEV', 40: 'NUM', 50: 'DEU', 60: 'JOS', 70: 'JDG', 80: 'RUT',
  90: '1SA', 100: '2SA', 110: '1KI', 120: '2KI', 130: '1CH', 140: '2CH', 150: 'EZR', 160: 'NEH',
  190: 'EST', 220: 'JOB', 230: 'PSA', 240: 'PRO', 250: 'ECC', 260: 'SNG', 290: 'ISA', 300: 'JER',
  310: 'LAM', 330: 'EZK', 340: 'DAN', 350: 'HOS', 360: 'JOL', 370: 'AMO', 380: 'OBA', 390: 'JON',
  400: 'MIC', 410: 'NAM', 420: 'HAB', 430: 'ZEP', 440: 'HAG', 450: 'ZEC', 460: 'MAL',
  470: 'MAT', 480: 'MRK', 490: 'LUK', 500: 'JHN', 510: 'ACT', 520: 'ROM', 530: '1CO', 540: '2CO',
  550: 'GAL', 560: 'EPH', 570: 'PHP', 580: 'COL', 590: '1TH', 600: '2TH', 610: '1TI', 620: '2TI',
  630: 'TIT', 640: 'PHM', 650: 'HEB', 660: 'JAS', 670: '1PE', 680: '2PE', 690: '1JN', 700: '2JN',
  710: '3JN', 720: 'JUD', 730: 'REV'
}

export interface MyBibleRow {
  book_number: number
  chapter_number_from: number
  verse_number_from: number
  chapter_number_to: number | null
  verse_number_to: number | null
  text: string | null
}

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–',
  hellip: '…', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”'
}

/** A module's HTML comment → the plain text the excerpt views render (`white-space: pre-wrap`):
 *  paragraphs become blank-line-separated, `<br>` a line break, every other tag is dropped
 *  keeping its text, and entities are decoded. */
export function myBibleHtmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|blockquote)>/gi, '\n\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, name: string) => {
      if (name[0] === '#') {
        const code = name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10)
        return Number.isFinite(code) ? String.fromCodePoint(code) : m
      }
      return ENTITIES[name.toLowerCase()] ?? m
    })
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export interface MyBibleParseOptions {
  /** The module comments on passages but keys each comment to the passage's first verse only
   *  (Keil & Delitzsch: "The First Day" at Gen 1:2 covers 1:2-5). Each single-verse comment is
   *  then stretched to the verse before the next comment, or to its chapter's end, so a click on
   *  any verse of the passage finds it. Off for modules of genuinely sparse notes, where it
   *  would attach a note to verses it never discussed. Needs `verseCounts` for chapter ends. */
  passageComments?: boolean
  verseCounts?: Record<string, number[]>
}

/** Turn a module's rows into verse-keyed chunks, in canonical (book, chapter, verse) order —
 *  modules aren't guaranteed to store rows in reading order, and the validator flags anything
 *  out of sequence. Pure, so it's unit-testable without a database. */
export function parseMyBibleCommentaries(rows: MyBibleRow[], options: MyBibleParseOptions = {}): ExtractedChunk[] {
  type Keyed = { order: number; chunk: ExtractedChunk; intro: boolean }
  const keyed: Keyed[] = []
  const bookOrder = new Map(Object.keys(MYBIBLE_BOOKS).map((n, i) => [Number(n), i]))

  for (const r of rows) {
    const book = MYBIBLE_BOOKS[r.book_number]
    const text = myBibleHtmlToText(r.text ?? '')
    if (!book || !text) continue
    const chapterStart = r.chapter_number_from
    const verseStart = r.verse_number_from
    const intro = chapterStart === 0 || verseStart === 0
    // A missing or backwards end collapses to a single-verse excerpt.
    let chapterEnd = r.chapter_number_to || chapterStart
    let verseEnd = r.verse_number_to || verseStart
    if (chapterEnd < chapterStart || (chapterEnd === chapterStart && verseEnd < verseStart)) {
      chapterEnd = chapterStart
      verseEnd = verseStart
    }
    const headerRaw =
      chapterEnd !== chapterStart
        ? `${chapterStart}:${verseStart}-${chapterEnd}:${verseEnd}`
        : verseEnd !== verseStart
          ? `${chapterStart}:${verseStart}-${verseEnd}`
          : `${chapterStart}:${verseStart}`
    keyed.push({
      // Book intro (chapter 0) sorts before chapter 1; a chapter intro (verse 0) before verse 1.
      order: bookOrder.get(r.book_number)! * 1e6 + chapterStart * 1e3 + verseStart,
      intro,
      chunk: { headerRaw, book, chapterStart, verseStart, chapterEnd, verseEnd, text, page: 0 }
    })
  }
  // Stable sort: rows sharing a key keep the module's own order.
  keyed.sort((a, b) => a.order - b.order)

  const chunks: ExtractedChunk[] = []
  let pendingIntro: { book: string; chapter: number; text: string } | null = null
  const flushIntroAsOwnChunk = (): void => {
    if (!pendingIntro) return
    const ch = Math.max(pendingIntro.chapter, 1)
    chunks.push({
      headerRaw: `${ch}:1`,
      book: pendingIntro.book,
      chapterStart: ch,
      verseStart: 1,
      chapterEnd: ch,
      verseEnd: 1,
      text: pendingIntro.text,
      page: 0
    })
    pendingIntro = null
  }

  for (const { chunk, intro } of keyed) {
    if (intro) {
      // Two intros in a row (book intro, then chapter 1's) merge into one preface.
      if (pendingIntro && pendingIntro.book === chunk.book) {
        pendingIntro = { book: chunk.book, chapter: chunk.chapterStart, text: `${pendingIntro.text}\n\n${chunk.text}` }
      } else {
        flushIntroAsOwnChunk()
        pendingIntro = { book: chunk.book, chapter: chunk.chapterStart, text: chunk.text }
      }
      continue
    }
    if (pendingIntro) {
      const isItsVerseOne =
        pendingIntro.book === chunk.book &&
        Math.max(pendingIntro.chapter, 1) === chunk.chapterStart &&
        chunk.verseStart === 1
      if (isItsVerseOne) {
        chunk.text = `${pendingIntro.text}\n\n${chunk.text}`
        pendingIntro = null
      } else {
        flushIntroAsOwnChunk()
      }
    }
    chunks.push(chunk)
  }
  flushIntroAsOwnChunk()
  if (options.passageComments) extendToPassages(chunks, options.verseCounts ?? {})
  return chunks
}

/** See MyBibleParseOptions.passageComments. Only single-verse chunks stretch: an explicit range
 *  in the module is already what it means. Never past a chapter end, and never onto a verse
 *  number the versification doesn't have. */
function extendToPassages(chunks: ExtractedChunk[], verseCounts: Record<string, number[]>): void {
  chunks.forEach((c, i) => {
    if (c.chapterEnd !== c.chapterStart || c.verseEnd !== c.verseStart) return
    const next = chunks[i + 1]
    const sameChapterNext = next && next.book === c.book && next.chapterStart === c.chapterStart
    const end = sameChapterNext ? next.verseStart - 1 : (verseCounts[c.book]?.[c.chapterStart - 1] ?? c.verseStart)
    if (end <= c.verseStart) return
    c.verseEnd = end
    c.headerRaw = `${c.chapterStart}:${c.verseStart}-${end}`
  })
}

/** Pull one file out of a zip archive held in memory. Handles the two methods real-world
 *  module zips use (stored, deflate) — enough for the single-file archives sites distribute,
 *  without adding an archive dependency. Throws if no entry matches. */
export function extractFromZip(zip: Buffer, match: (name: string) => boolean): { name: string; data: Buffer } {
  // End-of-central-directory record: scan back from the end (it may be followed by a comment).
  let eocd = -1
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 22 - 0xffff); i--) {
    if (zip.readUInt32LE(i) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new Error('Not a zip archive')
  const count = zip.readUInt16LE(eocd + 10)
  let p = zip.readUInt32LE(eocd + 16)
  for (let n = 0; n < count; n++) {
    if (zip.readUInt32LE(p) !== 0x02014b50) throw new Error('Corrupt zip central directory')
    const method = zip.readUInt16LE(p + 10)
    const compSize = zip.readUInt32LE(p + 20)
    const nameLen = zip.readUInt16LE(p + 28)
    const extraLen = zip.readUInt16LE(p + 30)
    const commentLen = zip.readUInt16LE(p + 32)
    const localOffset = zip.readUInt32LE(p + 42)
    const name = zip.toString('utf8', p + 46, p + 46 + nameLen)
    p += 46 + nameLen + extraLen + commentLen
    if (!match(name)) continue
    // The local header repeats name/extra with its own (possibly different) lengths.
    const dataStart = localOffset + 30 + zip.readUInt16LE(localOffset + 26) + zip.readUInt16LE(localOffset + 28)
    const raw = zip.subarray(dataStart, dataStart + compSize)
    if (method === 0) return { name, data: Buffer.from(raw) }
    if (method === 8) return { name, data: inflateRawSync(raw) }
    throw new Error(`Unsupported zip compression method ${method}`)
  }
  throw new Error('No matching file in the zip archive')
}
