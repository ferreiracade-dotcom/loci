// Normalize a commentary-Markdown file against Loci's versification table.
//
//   node normalize-commentary-md.mjs <file.md> [--dry]
//
// Scraped/OCR'd public-domain commentaries occasionally mis-number a heading: an off-by-one
// chapter label (e.g. Job "39:39" for 38:39, where the verse belongs to the previous chapter's
// tail) or a mis-scanned verse ("11:82" for 11:32). Those excerpts fail the app's bounds check.
// Fixing the number, though, can leave the excerpt physically after a higher verse and so trip
// the app's *sequence* check instead. So this pass does both:
//   * re-labels a verse that overflows its chapter but fits the PREVIOUS chapter (chapter tail),
//     unless that target verse already exists in the book (then drops, to avoid a duplicate),
//   * drops an excerpt whose verse fits no plausible chapter (pure mis-scan),
//   * sorts every book's excerpts by reference, so nothing is left out of sequence.
// The app already displays matches sorted by reference, so physical order carries no meaning.
// Reads the verse counts straight from the app so the two never drift. Personal-use cleanup.

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const [file, ...flags] = process.argv.slice(2)
const DRY = flags.includes('--dry')
if (!file) {
  console.error('usage: node normalize-commentary-md.mjs <file.md> [--dry]')
  process.exit(1)
}

// Verse counts, read directly from src/shared/versification.ts (keys are USFM codes in canonical
// order). Parsing the literal keeps this tool in lock-step with what the app validates against.
const versPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'shared', 'versification.ts')
const versSrc = readFileSync(versPath, 'utf8')
const VERSE_COUNTS = {}
const CODES = []
for (const m of versSrc.matchAll(/['"]?([A-Z0-9]{3})['"]?\s*:\s*\[([\d,\s]+)\]/g)) {
  VERSE_COUNTS[m[1]] = m[2].split(',').map((n) => Number(n.trim())).filter((n) => n > 0)
  CODES.push(m[1])
}

// Canonical book names in the same canonical order as the versification keys, so name→code is a
// simple zip. Matches the `# Book` headings the converters emit.
const NAMES = [
  'Genesis', 'Exodus', 'Leviticus', 'Numbers', 'Deuteronomy', 'Joshua', 'Judges', 'Ruth',
  '1 Samuel', '2 Samuel', '1 Kings', '2 Kings', '1 Chronicles', '2 Chronicles', 'Ezra',
  'Nehemiah', 'Esther', 'Job', 'Psalms', 'Proverbs', 'Ecclesiastes', 'Song of Solomon', 'Isaiah',
  'Jeremiah', 'Lamentations', 'Ezekiel', 'Daniel', 'Hosea', 'Joel', 'Amos', 'Obadiah', 'Jonah',
  'Micah', 'Nahum', 'Habakkuk', 'Zephaniah', 'Haggai', 'Zechariah', 'Malachi', 'Matthew', 'Mark',
  'Luke', 'John', 'Acts', 'Romans', '1 Corinthians', '2 Corinthians', 'Galatians', 'Ephesians',
  'Philippians', 'Colossians', '1 Thessalonians', '2 Thessalonians', '1 Timothy', '2 Timothy',
  'Titus', 'Philemon', 'Hebrews', 'James', '1 Peter', '2 Peter', '1 John', '2 John', '3 John',
  'Jude', 'Revelation'
]
if (CODES.length !== NAMES.length) {
  console.error(`versification has ${CODES.length} books but the name table has ${NAMES.length} — aborting`)
  process.exit(1)
}
const NAME_TO_CODE = new Map(NAMES.map((n, i) => [n.toLowerCase(), CODES[i]]))

const HEADING = /^(#{1,6})\s+(.*\S)\s*$/
const BARE_REF = /^(\d{1,3})[:.](\d{1,3})(?:\s*[–—-]\s*(\d{1,3}))?\s*$/

// --- Parse the file into books, each holding an ordered list of excerpts ---------------------
const lines = readFileSync(file, 'utf8').split(/\r?\n/)
const books = [] // { name, code, pre: string[], excerpts: [{ cs, vs, ve, body: string[] }] }
let book = null
let excerpt = null
for (const line of lines) {
  const h = HEADING.exec(line)
  if (h && h[1].length === 1) {
    const name = h[2].trim()
    book = { name, code: NAME_TO_CODE.get(name.toLowerCase()) || null, pre: [], excerpts: [] }
    books.push(book)
    excerpt = null
    continue
  }
  const ref = h && h[1].length === 2 ? BARE_REF.exec(h[2].trim()) : null
  if (ref && book) {
    excerpt = {
      cs: Number(ref[1]),
      vs: Number(ref[2]),
      ce: Number(ref[1]),
      ve: ref[3] ? Number(ref[3]) : Number(ref[2]),
      body: []
    }
    book.excerpts.push(excerpt)
    continue
  }
  // Any other line is body for the open excerpt, or (before the first excerpt) book front matter.
  if (excerpt) excerpt.body.push(line)
  else if (book) book.pre.push(line)
}

// --- Fix bounds violations (clamp overshooting ranges / relabel chapter tails / drop mis-scans) --
let relabeled = 0
let clamped = 0
let dropped = 0
const notes = []
for (const b of books) {
  const counts = b.code ? VERSE_COUNTS[b.code] : null
  if (!counts) continue
  const existing = new Set(b.excerpts.map((e) => `${e.cs}:${e.vs}-${e.ve}`))
  const kept = []
  for (const e of b.excerpts) {
    const maxV = e.cs >= 1 && e.cs <= counts.length ? counts[e.cs - 1] : 0
    if (e.vs <= maxV && e.ve <= maxV) {
      kept.push(e)
      continue
    }
    // A range whose start is valid but whose end overshoots the chapter — an overview/pericope
    // range that runs a verse or two past the end (the source counts by RSV, or a plain typo like
    // "1:13-26" for a 25-verse chapter). Clamp the end to the chapter's last verse; keep the text.
    if (maxV > 0 && e.vs <= maxV && e.ve > maxV) {
      notes.push(`  clamp  ${b.code} ${e.cs}:${e.vs}-${e.ve} -> ${e.cs}:${e.vs}-${maxV}`)
      e.ve = maxV
      clamped++
      kept.push(e)
      continue
    }
    // A single verse exactly one past the chapter end (e.g. RSV splits 3 John's last verse into
    // 14–15 where Loci counts 14): attach it to the last verse rather than discard the comment.
    if (maxV > 0 && e.vs === maxV + 1 && e.ve <= maxV + 1) {
      notes.push(`  merge  ${b.code} ${e.cs}:${e.vs}${e.ve !== e.vs ? '-' + e.ve : ''} -> ${e.cs}:${maxV}`)
      e.vs = maxV
      e.ve = maxV
      clamped++
      kept.push(e)
      continue
    }
    const prevMax = e.cs >= 2 ? counts[e.cs - 2] : 0
    const target = `${e.cs - 1}:${e.vs}-${e.ve}`
    if (e.vs <= prevMax && e.ve <= prevMax && !existing.has(target)) {
      notes.push(`  relabel ${b.code} ${e.cs}:${e.vs}${e.ve !== e.vs ? '-' + e.ve : ''} -> ${e.cs - 1}:${e.vs}${e.ve !== e.vs ? '-' + e.ve : ''}`)
      e.cs -= 1
      e.ce -= 1
      existing.add(target)
      relabeled++
      kept.push(e)
    } else {
      notes.push(`  drop   ${b.code} ${e.cs}:${e.vs}${e.ve !== e.vs ? '-' + e.ve : ''} (verse exceeds all plausible chapters)`)
      dropped++
    }
  }
  b.excerpts = kept
}

// --- Sort each book's excerpts by reference so none are out of sequence -----------------------
let reordered = 0
for (const b of books) {
  const before = b.excerpts.map((e) => `${e.cs}:${e.vs}`).join(',')
  // Sort by start ref; on a tie, the WIDER range first (c.ve - a.ve) so a pericope overview
  // ("1:2-15") precedes the single verses it covers ("1:2", "1:3", …) in the reader.
  b.excerpts.sort((a, c) => a.cs - c.cs || a.vs - c.vs || c.ve - a.ve)
  if (b.excerpts.map((e) => `${e.cs}:${e.vs}`).join(',') !== before) reordered++
}

// --- Re-emit -----------------------------------------------------------------------------------
const out = []
for (const b of books) {
  if (out.length) out.push('')
  out.push('# ' + b.name)
  for (const l of b.pre) out.push(l)
  for (const e of b.excerpts) {
    out.push('')
    out.push('## ' + (e.ve !== e.vs ? `${e.cs}:${e.vs}-${e.ve}` : `${e.cs}:${e.vs}`))
    for (const l of e.body) out.push(l)
  }
}
// Collapse any accidental run of blank lines and trailing blanks.
const text = out.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '') + '\n'

console.error(`relabeled: ${relabeled}, clamped: ${clamped}, dropped: ${dropped}, books reordered: ${reordered}`)
if (notes.length) console.error(notes.join('\n'))
if (!DRY) {
  writeFileSync(file, text, 'utf8')
  console.error('wrote ' + file)
} else {
  console.error('(dry run — no changes written)')
}
