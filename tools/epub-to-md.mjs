// Convert a commentary EPUB into canonical commentary-Markdown for Loci.
//
// Usage:
//   1) unzip your book:   unzip "Book.epub" -d book-dir
//   2) node epub-to-md.mjs <book-dir> "<Book Name>" <out.md>
//
// Reads the OPF spine for reading order, then splits each document at its verse-reference
// headings (bold/heading elements whose text is "chapter:verse" or a range) into verse-keyed
// excerpts. For multi-book volumes (e.g. "1 & 2 Timothy and Titus") it reads the EPUB's own
// table of contents to find where each Bible book begins and emits a `# Book` heading there,
// so "1:1" in 1 Timothy and "1:1" in Titus stay separate. No dependencies; plain Node.
//
// The "<Book Name>" argument is only a fallback used for excerpts that appear before any
// book-titled TOC section (front matter) or when the TOC names no recognisable Bible book.
//
// For your personal use on files you own. Do not redistribute converted copyrighted text.

import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'

const [dir, bookName, outFile] = process.argv.slice(2)
if (!dir || !bookName || !outFile) {
  console.error('usage: node epub-to-md.mjs <unzipped-epub-dir> "<Book Name>" <out.md>')
  process.exit(1)
}

// A token that never occurs in commentary prose and survives tag-stripping + whitespace
// collapse — used to mark verse-reference boundaries before splitting.
const SENT = 'ZZREFBREAKZZ'

// --- Bible book recognition (for splitting multi-book volumes by their TOC) -----------------
// Canonical name (matching the app's scriptureRef spellings) → the labels a TOC might use.
const BOOKS = [
  ['Genesis', ['Gen', 'Gn']], ['Exodus', ['Exod', 'Ex']], ['Leviticus', ['Lev', 'Lv']],
  ['Numbers', ['Num', 'Nm']], ['Deuteronomy', ['Deut', 'Dt']], ['Joshua', ['Josh', 'Jos']],
  ['Judges', ['Judg', 'Jdg']], ['Ruth', ['Ru']], ['1 Samuel', ['1 Sam', 'I Samuel', 'First Samuel']],
  ['2 Samuel', ['2 Sam', 'II Samuel', 'Second Samuel']], ['1 Kings', ['I Kings', 'First Kings']],
  ['2 Kings', ['II Kings', 'Second Kings']], ['1 Chronicles', ['1 Chron', 'I Chronicles', 'First Chronicles']],
  ['2 Chronicles', ['2 Chron', 'II Chronicles', 'Second Chronicles']], ['Ezra', []],
  ['Nehemiah', ['Neh']], ['Esther', ['Est']], ['Job', []], ['Psalms', ['Psalm', 'Ps']],
  ['Proverbs', ['Prov', 'Prv']], ['Ecclesiastes', ['Eccl', 'Ec']], ['Song of Solomon', ['Song of Songs', 'Canticles']],
  ['Isaiah', ['Isa', 'Is']], ['Jeremiah', ['Jer']], ['Lamentations', ['Lam']], ['Ezekiel', ['Ezek', 'Ezk']],
  ['Daniel', ['Dan', 'Dn']], ['Hosea', ['Hos']], ['Joel', []], ['Amos', []], ['Obadiah', ['Obad']],
  ['Jonah', ['Jon']], ['Micah', ['Mic']], ['Nahum', ['Nah']], ['Habakkuk', ['Hab']],
  ['Zephaniah', ['Zeph']], ['Haggai', ['Hag']], ['Zechariah', ['Zech']], ['Malachi', ['Mal']],
  ['Matthew', ['Matt', 'Mt']], ['Mark', ['Mk']], ['Luke', ['Lk']], ['John', ['Jn']],
  ['Acts', ['Acts of the Apostles']], ['Romans', ['Rom', 'Rm']],
  ['1 Corinthians', ['1 Cor', 'I Corinthians', 'First Corinthians']],
  ['2 Corinthians', ['2 Cor', 'II Corinthians', 'Second Corinthians']], ['Galatians', ['Gal']],
  ['Ephesians', ['Eph']], ['Philippians', ['Phil', 'Php']], ['Colossians', ['Col']],
  ['1 Thessalonians', ['1 Thess', 'I Thessalonians', 'First Thessalonians']],
  ['2 Thessalonians', ['2 Thess', 'II Thessalonians', 'Second Thessalonians']],
  ['1 Timothy', ['1 Tim', 'I Timothy', 'First Timothy']],
  ['2 Timothy', ['2 Tim', 'II Timothy', 'Second Timothy']], ['Titus', ['Tit']],
  ['Philemon', ['Philem', 'Phlm', 'Phm']], ['Hebrews', ['Heb']], ['James', ['Jas', 'Jm']],
  ['1 Peter', ['1 Pet', 'I Peter', 'First Peter']], ['2 Peter', ['2 Pet', 'II Peter', 'Second Peter']],
  ['1 John', ['I John', 'First John']], ['2 John', ['II John', 'Second John']],
  ['3 John', ['III John', 'Third John']], ['Jude', []], ['Revelation', ['Rev', 'Apocalypse']]
]
const BOOK_LOOKUP = new Map()
for (const [canonical, variants] of BOOKS) {
  BOOK_LOOKUP.set(canonical.toLowerCase(), canonical)
  for (const v of variants) BOOK_LOOKUP.set(v.toLowerCase(), canonical)
}
/** If a TOC label IS a Bible book name (and nothing else), return the canonical name, else null.
 *  Deliberately strict — a label like "Part One: ... (ch. 1)" or "Introduction" must NOT match. */
function bookFromLabel(label) {
  const clean = label.replace(/\s+/g, ' ').trim().replace(/[.,;:]+$/, '')
  return BOOK_LOOKUP.get(clean.toLowerCase()) || null
}

// Alternation of every book name/abbreviation, longest first so "1 Peter" wins over "Peter".
const BOOK_ALT = [...BOOK_LOOKUP.keys()]
  .sort((a, b) => b.length - a.length)
  .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  .join('|')
// ACCS (Ancient Christian Commentary) and similar catenae put the reference at the END of a
// section-title heading, prefixed by the book name — e.g. "<h1>TRUE WISDOM JAMES 3:13-18</h1>", or
// for single-chapter books a verse-only form "<h1>KEEPING THE FAITH 2 JOHN 7-11</h1>".
const ACCS_CV = new RegExp(
  '\\b(' + BOOK_ALT + ')\\s+(\\d{1,3})[:.](\\d{1,3})(?:\\s*[-–—]\\s*(\\d{1,3}))?\\s*$',
  'i'
)
const ACCS_V = new RegExp('\\b(' + BOOK_ALT + ')\\s+(\\d{1,3})(?:\\s*[-–—]\\s*(\\d{1,3}))?\\s*$', 'i')
/** Parse a heading's plain text into an ACCS reference, or null. Tries "Book chap:verse[-verse]"
 *  first, then a verse-only "Book verse[-verse]" (valid only for single-chapter books → ch 1). */
function parseAccsRef(t) {
  let m = ACCS_CV.exec(t)
  if (m) {
    const book = BOOK_LOOKUP.get(m[1].toLowerCase()) || m[1]
    return { book, chapter: Number(m[2]), vs: Number(m[3]), ve: m[4] ? Number(m[4]) : Number(m[3]) }
  }
  m = ACCS_V.exec(t)
  if (m) {
    const book = BOOK_LOOKUP.get(m[1].toLowerCase()) || m[1]
    if (SINGLE_CHAPTER.has(book)) {
      return { book, chapter: 1, vs: Number(m[2]), ve: m[3] ? Number(m[3]) : Number(m[2]) }
    }
  }
  return null
}
const HEADING_EL = /<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/gi

function findOpf(root) {
  const container = join(root, 'META-INF', 'container.xml')
  if (existsSync(container)) {
    const m = readFileSync(container, 'utf8').match(/full-path="([^"]+\.opf)"/i)
    if (m) return join(root, m[1])
  }
  const stack = [root]
  while (stack.length) {
    const d = stack.pop()
    for (const name of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, name.name)
      if (name.isDirectory()) stack.push(p)
      else if (/\.opf$/i.test(name.name)) return p
    }
  }
  return null
}

function spineFiles(opfPath) {
  const opf = readFileSync(opfPath, 'utf8')
  const base = dirname(opfPath)
  const manifest = new Map()
  for (const m of opf.matchAll(/<item\b[^>]*\bid="([^"]+)"[^>]*\bhref="([^"]+)"/gi)) {
    manifest.set(m[1], decodeURIComponent(m[2]))
  }
  for (const m of opf.matchAll(/<item\b[^>]*\bhref="([^"]+)"[^>]*\bid="([^"]+)"/gi)) {
    if (!manifest.has(m[2])) manifest.set(m[2], decodeURIComponent(m[1]))
  }
  const files = []
  for (const m of opf.matchAll(/<itemref\b[^>]*\bidref="([^"]+)"/gi)) {
    const href = manifest.get(m[1])
    if (href) files.push(join(base, href))
  }
  return files
}

/** Map each spine file (by basename) that STARTS a Bible book → the canonical book name, read
 *  from the EPUB's table of contents (EPUB2 toc.ncx or EPUB3 nav). Only the first section whose
 *  label is exactly a book name counts, so "1 Timothy" maps but "Part One ... (ch. 1)" does not. */
function bookStartsByFile(opfPath) {
  const base = dirname(opfPath)
  const opf = readFileSync(opfPath, 'utf8')
  const map = new Map()
  const add = (label, src) => {
    const book = bookFromLabel(decodeEntities(label.replace(/<[^>]+>/g, '')))
    if (!book) return
    const file = basename(src.split('#')[0])
    if (file && !map.has(file)) map.set(file, book)
  }
  // EPUB2: toc.ncx (referenced from the OPF spine's `toc` attribute, else by name).
  let ncxPath = null
  const tocId = (opf.match(/<spine\b[^>]*\btoc="([^"]+)"/i) || [])[1]
  if (tocId) {
    const href = (opf.match(new RegExp('<item\\b[^>]*\\bid="' + tocId + '"[^>]*\\bhref="([^"]+)"', 'i')) ||
      opf.match(new RegExp('<item\\b[^>]*\\bhref="([^"]+)"[^>]*\\bid="' + tocId + '"', 'i')) || [])[1]
    if (href) ncxPath = join(base, decodeURIComponent(href))
  }
  if (!ncxPath || !existsSync(ncxPath)) {
    const guess = join(base, 'toc.ncx')
    if (existsSync(guess)) ncxPath = guess
  }
  if (ncxPath && existsSync(ncxPath)) {
    const ncx = readFileSync(ncxPath, 'utf8')
    for (const m of ncx.matchAll(/<navPoint\b[\s\S]*?<text>([\s\S]*?)<\/text>[\s\S]*?<content\b[^>]*\bsrc="([^"]+)"/gi)) {
      add(m[1], m[2])
    }
  }
  // EPUB3 fallback: a nav document's <a href>...</a> entries.
  if (map.size === 0) {
    for (const m of opf.matchAll(/<item\b[^>]*\bproperties="[^"]*\bnav\b[^"]*"[^>]*\bhref="([^"]+)"/gi)) {
      const navPath = join(base, decodeURIComponent(m[1]))
      if (!existsSync(navPath)) continue
      const nav = readFileSync(navPath, 'utf8')
      for (const a of nav.matchAll(/<a\b[^>]*\bhref="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) add(a[2], a[1])
    }
  }
  return map
}

function decodeEntities(s) {
  return s
    .replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ')
    .replace(/&#8217;/g, '’').replace(/&#8216;/g, '‘')
    .replace(/&#8220;/g, '“').replace(/&#8221;/g, '”')
    .replace(/&#8211;/g, '–').replace(/&#8212;/g, '—').replace(/&#8230;/g, '…')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&[a-z]+;/gi, ' ')
}

// A reference heading: a bold/heading element whose text is exactly "chap:verse[-verse]".
const REF_HEADING =
  /<(?:h[1-6]|b|strong|span[^>]*)\b[^>]*>\s*(\d{1,3})[:.](\d{1,3})(?:\s*[–—-]\s*(\d{1,3}))?\s*<\/(?:h[1-6]|b|strong|span)>/gi

// Single-chapter books are keyed by verse alone, so their commentary lemmas are just a verse
// number ("4", "4–7") at the START of a paragraph — there is no "chapter:verse" to match.
const SINGLE_CHAPTER = new Set(['Obadiah', 'Philemon', '2 John', '3 John', 'Jude'])
const VERSE_PARA =
  /<p\b[^>]*>\s*<(?:span[^>]*|b|strong)\b[^>]*>\s*(\d{1,3})(?:\s*[–—-]\s*(\d{1,3}))?\s*<\/(?:span|b|strong)>/gi

// Publisher "furniture" that this parallel-Bible commentary layout interleaves with the actual
// verse commentary — the two-translation scripture block, the devotional articles, the part
// dividers and section intros. Because these are not clean verse headings, their text otherwise
// bleeds onto the end of the preceding excerpt; we cut each excerpt at the first one we hit so
// the stored text is just the commentary. Harmless to books that don't use these.
const NOISE_MARKERS = [
  /\bESV\s+KJV\b/,
  // The devotional article is titled "<ref> in Devotion and Prayer". Swallow the leading ref
  // when present (so it isn't left dangling on the end of the commentary), but keep the ref
  // OPTIONAL — when this article's ref was itself captured as the heading, the excerpt body
  // begins with a bare "in Devotion and Prayer" and must still be recognised and dropped.
  /(?:\s*\d{1,3}(?:[:.]\d{1,3})?(?:\s*[–—-]\s*\d{1,3})?\s+)?in Devotion and Prayer\b/,
  /\bIntroduction to \d/,
  /\bPART\s+\d/
]
// A section-reference fragment (has a colon or an en-dash range) left dangling at the very end
// after a cut — e.g. the "(1:12–17)" of the next section's title. Prose rarely ends this way.
const TRAILING_REF = /\s*\(?\d{1,3}(?::\d{1,3}(?:\s*[–—-]\s*\d{1,3})?|\s*[–—-]\s*\d{1,3})\)?\s*$/
function trimNoise(text) {
  let cut = text.length
  for (const re of NOISE_MARKERS) {
    const m = re.exec(text)
    if (m && m.index < cut) cut = m.index
  }
  return text.slice(0, cut).replace(TRAILING_REF, '').trim()
}

function textOf(html) {
  const body = (html.match(/<body[^>]*>([\s\S]*?)<\/body>/i) || [null, html])[1]
  return decodeEntities(body.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim()
}

// --- ACCS two-level extraction ---------------------------------------------------------------
// ACCS volumes nest a level under the pericope: the `<h1>` gives a passage RANGE (e.g. "JAMES
// 1:2-15") whose only body is the editors' OVERVIEW, and each `<h2>` under it gives a single verse
// ("1:2", or a bare "7" in single-chapter books) whose body is several Father-by-Father comment
// paragraphs. We key the overview to the range and every comment to its own verse, keeping the
// individual comments as blank-line-separated paragraphs. Works for both the one-file-per-pericope
// layout (James…Jude) and the calibre-split layout (Revelation) since it keys on heading LEVEL,
// not CSS class. A bare "chap:verse" sub-heading (no book name) is a verse; a book-qualified
// heading is a pericope. Single-chapter books use verse-only sub-headings mapped to chapter 1.
const ACCS_SUB_CV = /^\s*(\d{1,3})[:.](\d{1,3})(?:\s*[-–—]\s*(\d{1,3}))?/
const ACCS_SUB_V = /^\s*(\d{1,3})(?:\s*[-–—]\s*(\d{1,3}))?/

/** Split a document body into its headings, each paired with the raw HTML that follows it up to
 *  the next heading of any level (its "section body"). */
function accsHeadings(html) {
  const body = (html.match(/<body[^>]*>([\s\S]*?)<\/body>/i) || [null, html])[1]
  const re = /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi
  const raw = []
  let m
  while ((m = re.exec(body))) raw.push({ inner: m[2], start: m.index, end: re.lastIndex })
  return raw.map((h, i) => ({
    text: decodeEntities(h.inner.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim(),
    body: body.slice(h.end, i + 1 < raw.length ? raw[i + 1].start : body.length)
  }))
}

/** Turn a section body's HTML into an array of paragraph strings, dropping footnote markers and
 *  collapsing whitespace within each paragraph while preserving the paragraph breaks. */
function accsParagraphs(html) {
  let s = html.replace(/<a\b[^>]*class="apnf"[^>]*>[\s\S]*?<\/a>/gi, '') // footnote superscripts
  s = s.replace(/<br\s*\/?>/gi, ' ')
  s = s.replace(/<\/p>|<\/h[1-6]>|<\/div>/gi, '\n\n')
  s = decodeEntities(s.replace(/<[^>]+>/g, ''))
  return s
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

/** Extract ACCS excerpts across the whole volume, threading the current book/chapter (set by each
 *  book-qualified pericope heading) across files, since the calibre-split layout puts a pericope's
 *  verse sections in later spine files than its overview. */
function accsExtract(files) {
  const out = []
  let curBook = null
  let curChapter = null
  for (const file of files) {
    for (const h of accsHeadings(readFileSync(file, 'utf8'))) {
      const peri = parseAccsRef(h.text) // book-qualified heading → a pericope; its body is the overview
      if (peri) {
        curBook = peri.book
        curChapter = peri.chapter
        const text = accsParagraphs(h.body).join('\n\n')
        if (text) out.push({ book: curBook, chapter: peri.chapter, verseStart: peri.vs, verseEnd: peri.ve, text })
        continue
      }
      if (!curBook) continue // front matter before the first pericope
      let vm = ACCS_SUB_CV.exec(h.text)
      let chapter, vs, ve
      if (vm) {
        chapter = Number(vm[1]); vs = Number(vm[2]); ve = vm[3] ? Number(vm[3]) : vs
      } else if (SINGLE_CHAPTER.has(curBook) && (vm = ACCS_SUB_V.exec(h.text))) {
        chapter = 1; vs = Number(vm[1]); ve = vm[2] ? Number(vm[2]) : vs
      } else {
        continue // not a verse sub-heading (a running-head or front-matter title)
      }
      const text = accsParagraphs(h.body).join('\n\n')
      if (text) out.push({ book: curBook, chapter, verseStart: vs, verseEnd: ve, text })
    }
  }
  return out
}

const opfPath = findOpf(dir)
if (!opfPath) {
  console.error('No .opf found - is this an unzipped EPUB directory?')
  process.exit(1)
}

const bookStarts = bookStartsByFile(opfPath)
const files = spineFiles(opfPath).filter((f) => existsSync(f))

// Decide once whether this whole volume is ACCS-style: count headings that end in a book+ref.
let accsHits = 0
for (const file of files) {
  HEADING_EL.lastIndex = 0
  for (const m of readFileSync(file, 'utf8').matchAll(HEADING_EL)) {
    const t = decodeEntities(m[1].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
    if (parseAccsRef(t)) accsHits++
  }
}
const isAccs = accsHits >= 3

const excerpts = [] // { book, chapter, verseStart, verseEnd, text }
let open = null
let lastChapter = null
let currentBook = bookName // fallback until the TOC hands us the first book
// ACCS volumes have their own two-level (pericope overview + per-verse) extraction; the loop below
// is only for the RHB/Concordia "bold chapter:verse" style.
for (const file of isAccs ? [] : files) {
  // Crossing into a file that the TOC marks as the start of a Bible book: switch books, reset
  // the per-book chapter tracking, and stop appending to the previous book's last excerpt.
  const startsBook = bookStarts.get(basename(file))
  if (startsBook && startsBook !== currentBook) {
    currentBook = startsBook
    lastChapter = null
    open = null
  }
  const html = readFileSync(file, 'utf8')
  // Pick the heading style: single-chapter (verse-only paragraph leaders mapped to chapter 1) or
  // standard "chapter:verse" bold markers.
  let marked
  if (SINGLE_CHAPTER.has(currentBook)) {
    VERSE_PARA.lastIndex = 0
    marked = html.replace(VERSE_PARA, (_m, v, v2) => SENT + '1:' + v + (v2 ? '-' + v2 : '') + SENT)
  } else {
    REF_HEADING.lastIndex = 0
    marked = html.replace(REF_HEADING, (_m, ch, v, v2) => SENT + ch + ':' + v + (v2 ? '-' + v2 : '') + SENT)
  }
  const parts = textOf(marked).split(SENT)
  if (open && parts[0].trim()) open.text += ' ' + parts[0].trim()
  for (let i = 1; i < parts.length; i += 2) {
    const ref = parts[i]
    const body = (parts[i + 1] || '').trim()
    const [ch, rest] = ref.split(':')
    const [vs, ve] = rest.split('-')
    const chapter = Number(ch)
    // Verse-by-verse commentary chapters advance monotonically within a book, so a heading whose
    // chapter jumps more than one ahead (a forward cross-reference like "23:34" citing Luke inside
    // Mark) or backward at all (a back-reference like "4:16" cited inside the chapter-10 comment)
    // is a citation, not a section boundary — fold its text back into the open excerpt.
    if (lastChapter !== null && (chapter > lastChapter + 1 || chapter < lastChapter)) {
      if (open) open.text += ' ' + ref + ' ' + body
      continue
    }
    lastChapter = chapter
    open = { book: currentBook, chapter, verseStart: Number(vs), verseEnd: Number(ve || vs), text: body }
    excerpts.push(open)
  }
}

// In single-chapter books the parallel scripture reproduces each verse number before the
// commentary does, so a verse appears several times; the commentary always comes last, so for
// those books keep only the final excerpt per verse. (Books are contiguous in the spine.)
// ACCS uses the dedicated two-level extractor instead of this RHB dedup.
const merged = isAccs ? accsExtract(files) : []
for (let i = 0; !isAccs && i < excerpts.length; ) {
  const book = excerpts[i].book
  let j = i
  while (j < excerpts.length && excerpts[j].book === book) j++
  const slice = excerpts.slice(i, j)
  if (SINGLE_CHAPTER.has(book)) {
    const byVerse = new Map()
    for (const e of slice) byVerse.set(e.verseStart + '-' + e.verseEnd, e) // last wins
    merged.push(...[...byVerse.values()].sort((a, b) => a.verseStart - b.verseStart))
  } else {
    merged.push(...slice)
  }
  i = j
}

const out = []
let writtenBook = null
const kept = []
for (const e of merged) {
  // ACCS text is already clean, multi-paragraph prose — never run it through trimNoise (which would
  // clip a patristic source citation that ends in a "book.section" number as a dangling ref).
  const text = isAccs ? e.text : trimNoise(e.text)
  if (!text) continue
  if (e.book !== writtenBook) {
    if (out.length) out.push('')
    out.push('# ' + e.book, '')
    writtenBook = e.book
  }
  const ref = e.verseEnd !== e.verseStart ? e.chapter + ':' + e.verseStart + '-' + e.verseEnd : e.chapter + ':' + e.verseStart
  out.push('## ' + ref)
  out.push(text)
  out.push('')
  kept.push({ ...e, text })
}
if (out.length === 0) out.push('# ' + bookName, '') // nothing parsed — still write a valid stub
writeFileSync(outFile, out.join('\n'), 'utf8')

// Structure only (no text).
const byBook = new Map()
for (const e of kept) {
  if (!byBook.has(e.book)) byBook.set(e.book, new Set())
  byBook.get(e.book).add(e.chapter)
}
if (byBook.size <= 1) {
  const chapters = new Set(kept.map((e) => e.chapter))
  console.error('excerpts: ' + kept.length + ', chapters: ' + chapters.size + ' (' + [...chapters].sort((a, b) => a - b).join(',') + ')')
} else {
  console.error('excerpts: ' + kept.length + ' across ' + byBook.size + ' books:')
  for (const [book, chs] of byBook) {
    console.error('  ' + book + ': ' + kept.filter((e) => e.book === book).length +
      ' excerpts, chapters ' + [...chs].sort((a, b) => a - b).join(','))
  }
}
console.error('wrote ' + outFile)
