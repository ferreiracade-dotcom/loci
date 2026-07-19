// Convert the Concordia Reader's Edition EPUB (Book of Concord) into two canonical
// Markdown files for Loci's Book-of-Concord vault ingestion: a primary-text file
// (confessional paragraphs, with `[N]` markers preserved) and a commentary file
// (editorial study notes + each document's Editor's Introduction, attached to that
// document's first section). Both use the heading contract the app's `parseBocMarkdown`
// expects: `# <Document title>` then, per discovered section, `## <ordinal> | <number> |
// <label> | <part>` (pipe-separated; number/part may be empty). The SAME ordinal is
// emitted in both files for the same section, so they align by ordinal, not position.
//
// Usage:
//   node tools/boc-epub-to-md.mjs <epub-path-or-unzipped-dir> [outDir]
//
//   <epub-path-or-unzipped-dir>  Either the .epub file itself, or a directory it has
//                                already been unzipped into (must contain a .opf).
//   [outDir]                    Defaults to tools/sources/. Writes boc-primary.md and
//                                boc-commentary.md there.
//
// Scaffolded from tools/epub-to-md.mjs (reuses its OPF/spine-reading and entity-decoding
// approach) but this is a from-scratch detector for the Reader's Edition's own CSS-class
// layout (see docs/superpowers/specs/2026-07-18-confessions-boc-design.md, "Ingestion").
//
// The EPUB and all Markdown this tool produces are COPYRIGHTED (Concordia Publishing
// House). Do not commit tools/sources/ output — it is gitignored. For personal use only.

import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'

const [inputArg, outDirArg] = process.argv.slice(2)
if (!inputArg) {
  console.error('usage: node tools/boc-epub-to-md.mjs <epub-path-or-unzipped-dir> [outDir]')
  process.exit(1)
}
const outDir = outDirArg || join(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), 'sources')

// --- EPUB unzip (only if a .epub file was given) --------------------------------------------
let epubDir = inputArg
let tmpExtractDir = null
if (/\.epub$/i.test(inputArg)) {
  tmpExtractDir = mkdtempSync(join(tmpdir(), 'boc-epub-'))
  // Prefer the `unzip` CLI (matches epub-to-md.mjs's documented workflow); fall back to
  // PowerShell's Expand-Archive on Windows if unzip isn't on PATH.
  try {
    execFileSync('unzip', ['-o', '-q', inputArg, '-d', tmpExtractDir], { stdio: 'inherit' })
  } catch {
    const zipCopy = join(tmpExtractDir, '__src.zip')
    // Expand-Archive requires a .zip extension.
    execFileSync('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-Command',
      `Copy-Item -LiteralPath '${inputArg.replace(/'/g, "''")}' -Destination '${zipCopy.replace(/'/g, "''")}'; Expand-Archive -LiteralPath '${zipCopy}' -DestinationPath '${tmpExtractDir.replace(/'/g, "''")}' -Force`
    ], { stdio: 'inherit' })
  }
  epubDir = tmpExtractDir
}

// --- Reused EPUB machinery (adapted from epub-to-md.mjs) ------------------------------------
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

function decodeEntities(s) {
  return s
    .replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ')
    .replace(/&#8217;/g, '’').replace(/&#8216;/g, '‘')
    .replace(/&#8220;/g, '“').replace(/&#8221;/g, '”')
    .replace(/&#8211;/g, '–').replace(/&#8212;/g, '—').replace(/&#8230;/g, '…')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&[a-z]+;/gi, ' ')
}

/** Strip tags from a fragment of inner HTML, converting <br> to a space (so adjacent
 *  words don't run together), decoding entities, and collapsing all whitespace to single
 *  spaces (paragraphs in this markup have no meaningful internal line breaks). */
function textOf(innerHtml) {
  // <br> commonly carries a class attribute here (`<br class="calibre24"/>`), so match any
  // attributes up to the closing `>` — a bare `<br\s*\/?>` regex misses these and silently
  // drops the word-boundary space at multi-line heading breaks (e.g. "EDITOR'S INTRODUCTION"
  // + <br> + "TO THE AUGSBURG CONFESSION" would otherwise collapse into one run-on word).
  return decodeEntities(innerHtml.replace(/<br\b[^>]*>/gi, ' ').replace(/<[^>]+>/g, ''))
    .replace(/\s+/g, ' ')
    .trim()
}

// --- Document registry (mirrors src/shared/bookOfConcord.ts's BOC_DOCUMENTS) -----------------
// `title` is emitted VERBATIM as the `# <Document>` heading — it must exactly match (after
// documentCodeFromName's trim+lowercase) the real registry's title/abbreviation/code/alias so
// the app's parser resolves it. `matchAliases` are EXTRA source-heading spellings (beyond
// title/abbreviation/code) this converter recognizes when scanning the EPUB; they don't need to
// round-trip through the app parser themselves.
const DOCS = [
  { code: 'CR-AP', title: "Apostles' Creed", abbreviation: 'Ap. Creed', matchAliases: ["The Apostles' Creed"] },
  { code: 'CR-NI', title: 'Nicene Creed', abbreviation: 'Nic. Creed', matchAliases: ['The Nicene Creed'] },
  { code: 'CR-ATH', title: 'Athanasian Creed', abbreviation: 'Ath. Creed', matchAliases: ['The Creed of Athanasius'] },
  { code: 'AC', title: 'Augsburg Confession', abbreviation: 'AC', matchAliases: ['The Augsburg Confession', 'The Augsburg Confession (1530)'] },
  { code: 'AP', title: 'Apology of the Augsburg Confession', abbreviation: 'Ap', matchAliases: ['The Apology of the Augsburg Confession', 'The Apology of the Augsburg Confession (1531)'] },
  { code: 'SA', title: 'Smalcald Articles', abbreviation: 'SA', matchAliases: ['The Smalcald Articles', 'The Smalcald Articles (1537)'] },
  { code: 'TR', title: 'Treatise on the Power and Primacy of the Pope', abbreviation: 'Tr', matchAliases: ['The Power and Primacy of the Pope', 'The Power and Primacy of the Pope (1537)'] },
  { code: 'SC', title: 'Small Catechism', abbreviation: 'SC', matchAliases: ['The Small Catechism', 'The Small Catechism (1529)', 'Enchiridion: The Small Catechism', 'Enchiridion'] },
  { code: 'LC', title: 'Large Catechism', abbreviation: 'LC', matchAliases: ['The Large Catechism', 'The Large Catechism (1529)'] },
  { code: 'FC-EP', title: 'Formula of Concord: Epitome', abbreviation: 'FC Ep', matchAliases: ['The Formula of Concord, Epitome', 'The Formula of Concord, Epitome (1577)', 'Epitome'] },
  { code: 'FC-SD', title: 'Formula of Concord: Solid Declaration', abbreviation: 'FC SD', matchAliases: ['The Formula of Concord, Solid Declaration', 'The Formula of Concord, Solid Declaration (1577)', 'Solid Declaration'] },
  { code: 'CT', title: 'Catalog of Testimonies', abbreviation: 'Cat. Test.', matchAliases: ['Appendix A: Catalog of Testimonies', 'Catalog of Testimonies'] },
  { code: 'BEC', title: 'A Brief Exhortation to Confession', abbreviation: 'Brief Exh.', matchAliases: ['Appendix B: A Brief Exhortation to Confession'] },
  { code: 'SVA', title: 'Saxon Visitation Articles', abbreviation: 'SVA', matchAliases: ['Appendix C: Saxon Visitation Articles'] }
]

/** Normalize a heading's plain text for alias comparison: drop guillemet/bracket
 *  decoration, treat colons as word separators (so "Enchiridion: The Small Catechism"
 *  and a <br>-separated "ENCHIRIDION"/"THE SMALL CATECHISM" pair compare equal), strip a
 *  leading "The " and a trailing " (YYYY)", and collapse whitespace. */
function normalizeHeading(raw) {
  let s = raw.replace(/[«»‹›]/g, '').replace(/[[\]]/g, '').replace(/:/g, ' ').replace(/[’‘]/g, "'")
  s = s.replace(/\s+/g, ' ').trim()
  s = s.replace(/^The\s+/i, '')
  s = s.replace(/\s*\(\d{4}\)\s*$/, '')
  return s.trim()
}

const ALIAS_MAP = new Map() // normalized-lowercase -> code
for (const d of DOCS) {
  const names = [d.title, d.abbreviation, d.code, ...(d.matchAliases ?? [])]
  for (const n of names) ALIAS_MAP.set(normalizeHeading(n).toLowerCase(), d.code)
}
const TITLE_BY_CODE = new Map(DOCS.map((d) => [d.code, d.title]))

function isAllCaps(text) {
  const letters = text.replace(/[^A-Za-z]/g, '')
  return letters.length > 0 && letters === letters.toUpperCase()
}
function toTitleCase(text) {
  return text.replace(/[A-Za-z]+(?:'[A-Za-z]+)?/g, (w) => {
    if (/^[IVXLCDM]+$/i.test(w)) return w.toUpperCase() // bare roman numeral, e.g. "II" not "Ii"
    return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() // ...incl. after an apostrophe
  })
}
function displayLabel(text) {
  return isAllCaps(text) ? toTitleCase(text) : text
}

/** An `article`-class heading's raw text is like "ARTICLE IV" or, for the Apology's
 *  dual-numbered sections, "ARTICLE II (I)" / "ARTICLES VII AND VIII (IV)" — the section's
 *  `number` field must be ONLY the numeral (and any parenthetical dual-number), since it
 *  feeds citations rendered as e.g. "AC IV, 2"; a leftover "ARTICLE " prefix would wrongly
 *  render as "AC ARTICLE IV, 2". Strip a leading "ARTICLE "/"ARTICLES " (case-insensitive,
 *  one or more spaces) and trim; text with no such prefix passes through unchanged. */
function stripArticlePrefix(text) {
  return text.replace(/^articles?\s+/i, '').trim()
}

const BARE_NUMERAL_RE = /^[IVXLCDM]+\.?$|^\d+\.?$/i
const INTRO_TRIGGER_RE = /^editor(?:'?s|ial)?\s+introduction\b/i
const BODY_START_PHRASES = new Set(['to the christian reader'])

// Classes that never contribute text (illustrations, captions, page-break markers,
// timeline-table cells, decorative epigraphs on title pages).
const DECORATIVE_SKIP = new Set([
  'pagebreak', 'com_img', 'tit_img1', 'img_cap_line', 'antx-caption', 'p_cap',
  'line_img', 'line_img1', 'line_img2', 'tab_num', 'tab_txt', 'toc1', 'toc2',
  'title_rev', 'image1'
])

// --- Per-document state machine --------------------------------------------------------------
function convert(opfPath) {
  const files = spineFiles(opfPath).filter((f) => existsSync(f))
  const docsOut = new Map() // code -> section[]

  let currentDoc = null
  let currentSections = null
  let ordinal = 0
  let currentPart = null
  let mode = 'body' // 'body' | 'intro'
  let currentSection = null
  let pendingIntro = [] // lines attached to the NEXT document's first section
  let pendingNumber = null // holds an `article`-class number awaiting its ch_h1a label
  let pendingFormulaTitle = false // saw bare "Formula of Concord" pt-heading, awaiting [First/Second Part]
  let lastDocOpenText = ''
  let docJustOpened = false // true only for the very next paragraph after a document opens

  function flushSection() {
    if (currentSection && currentSections) currentSections.push(currentSection)
    currentSection = null
  }
  function openSection(rawLabel, number, isPartHeader) {
    flushSection()
    ordinal += 1
    const part = isPartHeader ? null : currentPart
    currentSection = { ordinal, number, label: displayLabel(rawLabel), part, body: [], notes: [] }
    if (ordinal === 1 && pendingIntro.length) {
      currentSection.notes.push(...pendingIntro)
      pendingIntro = []
    }
    if (isPartHeader) currentPart = toTitleCase(rawLabel)
  }
  function openDocument(code, headingText) {
    flushSection()
    currentDoc = code
    currentSections = docsOut.get(code)
    if (!currentSections) { currentSections = []; docsOut.set(code, currentSections) }
    ordinal = 0
    currentPart = null
    mode = 'body'
    currentSection = null
    lastDocOpenText = headingText
    docJustOpened = true
    // pendingIntro deliberately carries over (e.g. the Ecumenical Creeds' shared intro,
    // read before any of the three creeds' own document opens, attaches to the first one).
  }
  function appendBody(text) {
    if (currentSection) { currentSection.body.push(text); return }
    if (mode === 'intro') { pendingIntro.push(text); return }
    if (currentDoc) { openSection(lastDocOpenText || currentDoc, null, false); currentSection.body.push(text) }
    // else: no document open yet (front matter) — drop silently.
  }
  function appendNote(text) {
    if (currentSection) { currentSection.notes.push(text); return }
    pendingIntro.push(text)
  }

  const PARA_RE = /<p\b[^>]*\bclass="([a-zA-Z0-9_-]+)"[^>]*>([\s\S]*?)<\/p>/g

  for (const file of files) {
    const html = readFileSync(file, 'utf8')
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
    const body = bodyMatch ? bodyMatch[1] : html
    PARA_RE.lastIndex = 0
    let m
    while ((m = PARA_RE.exec(body))) {
      const cls = m[1]
      const text = textOf(m[2])
      if (!text) continue

      // `toc_head1` only ever marks true book-level back matter (Glossary, Description of
      // Persons and Groups, Scripture Index, A Visual Overview of the Reformation, …), which
      // follows the Saxon Visitation Articles — the last of the 14 documents — with no further
      // document-title heading to naturally close it out. Without this, its own heading
      // classes (ch_h1b/ch_h1c reused for A–Z index dividers) would otherwise keep being
      // attributed to whatever document was last open. Stop attribution outright.
      if (cls === 'toc_head1') { flushSection(); currentDoc = null; currentSections = null; mode = 'body'; continue }
      if (DECORATIVE_SKIP.has(cls)) continue

      // Consumed at most once: only the very first paragraph seen right after a document
      // opens is a candidate "decorative subtitle right on the title page" (see below).
      const wasJustOpened = docJustOpened
      docJustOpened = false

      if (cls === 'tab_ti') { mode = 'intro'; continue } // "OUTLINE"/"TIMELINE" front matter
      if (cls === 'article') { pendingNumber = stripArticlePrefix(text); continue }

      if (cls === 'txt_center') {
        if (currentSection) currentSection.body.push(text)
        else if (mode === 'intro') pendingIntro.push(text)
        continue
      }

      if (cls === 'ch_h1a' && pendingNumber !== null) {
        openSection(text, pendingNumber, false)
        pendingNumber = null
        continue
      }

      if (cls === 'ch_h1b') {
        const t = text.trim()
        if (BARE_NUMERAL_RE.test(t)) { openSection(t, null, false); continue } // Catalog of Testimonies' "I.", "II.", …
        // Saxon Visitation Articles combines the article number and label into one ch_h1b
        // paragraph (no separate `article`/ch_h1a pair): "ARTICLE I" + <br> + "The Holy Supper".
        const artMatch = /^(ARTICLE\s+[IVXLCDM]+[a-z]?)\s+(.+)$/i.exec(t)
        if (artMatch) { openSection(artMatch[2], stripArticlePrefix(artMatch[1].toUpperCase()), false); continue }
        // Otherwise fall through to the shared heading-candidate machine below: it may be a
        // real section heading (e.g. Catalog of Testimonies' "Conclusion") or, when it's just
        // a descriptive subtitle continuing the previous heading (Smalcald's "The
        // Awe-Inspiring Articles on the Divine Majesty" under "THE FIRST PART"), it will still
        // open its own (slightly over-granular, but harmless) section — never silently lost.
      }

      const isHeadingCandidate = cls === 'toc_head' || cls === 'pt' || cls === 'ch_h' || cls === 'ch_h1b' ||
        /^ch_h/.test(cls) || cls === 'heading' || /^heading\d/.test(cls)
      if (isHeadingCandidate) {
        const norm = normalizeHeading(text)
        const normLower = norm.toLowerCase()

        // "THE FORMULA OF CONCORD" (pt) is shared by both Epitome and Solid Declaration;
        // the immediately following "[First Part]" / "[Second Part]" disambiguates.
        if (pendingFormulaTitle && normLower === 'first part') { openDocument('FC-EP', text); pendingFormulaTitle = false; continue }
        if (pendingFormulaTitle && normLower === 'second part') { openDocument('FC-SD', text); pendingFormulaTitle = false; continue }
        pendingFormulaTitle = normLower === 'formula of concord'

        const code = ALIAS_MAP.get(normLower)
        if (code) {
          if (currentDoc !== code) openDocument(code, text)
          else mode = 'body' // repeated bare title = body starts (ends intro accumulation)
          continue
        }

        // A `pt`-classed heading that isn't a document title (or the Formula's Part I/II
        // marker, already handled above) is always a book-level umbrella divider spanning
        // several documents (e.g. "THE CONFESSION OF FAITH", "THE THREE UNIVERSAL OR
        // ECUMENICAL CREEDS") — never real section content. Ignore it outright.
        if (cls === 'pt') continue

        if (INTRO_TRIGGER_RE.test(norm)) { mode = 'intro'; continue }

        // Several documents (Smalcald Articles, Small Catechism, Treatise) put a second,
        // decorative subtitle heading directly on the title page, right after the `pt`
        // heading that opens the document (e.g. "ARTICLES OF CHRISTIAN DOCTRINE" under "THE
        // SMALCALD ARTICLES") — not a real section and never repeated, so the "body already
        // started" repeated-title signal never fires for it. Skip exactly this one heading.
        if (wasJustOpened) continue

        if (mode === 'intro') {
          // An ALL-CAPS heading ends the intro accumulation and opens the real first
          // section — but only when it's `ch_h` specifically. Several documents' intro
          // narratives use ALL-CAPS `toc_head` sub-dividers of their own mid-narrative
          // (e.g. Formula of Concord Epitome's "CONTROVERSIES AND THE FORMULA OF CONCORD",
          // itself still editorial background, not the real body) that would otherwise end
          // the intro far too early.
          if ((cls === 'ch_h' && isAllCaps(text)) || BODY_START_PHRASES.has(normLower)) {
            mode = 'body' // falls through to open a section below
          } else {
            pendingIntro.push(text)
            continue
          }
        }

        // mode === 'body': a real section-opening heading.
        if (BARE_NUMERAL_RE.test(norm)) {
          openSection(text, null, false)
        } else {
          const isPartHeader = isAllCaps(text) || /^[IVXLCDM]+\.\s/i.test(text) || /\bpart\b/i.test(text)
          openSection(text, null, isPartHeader)
        }
        continue
      }

      // Regular paragraph: confessional text or an editorial note. `ch_note` is the
      // documented note class, but several documents (SA/TR/LC/FC…) instead tag notes
      // `noindent2` and rely on a literal "Note:" prefix — check both.
      const isNote = cls === 'ch_note' || cls === 'note' || /^\[?note:/i.test(text)
      if (isNote) appendNote(text)
      else appendBody(text)
    }
  }
  flushSection()
  return docsOut
}

// --- Output ------------------------------------------------------------------------------
function heading(section) {
  return `## ${section.ordinal} | ${section.number ?? ''} | ${section.label} | ${section.part ?? ''}`
}

function writeOutputs(docsOut, outDir) {
  mkdirSync(outDir, { recursive: true })
  const primaryLines = []
  const commentaryLines = []
  for (const [code, sections] of docsOut) {
    const title = TITLE_BY_CODE.get(code) ?? code
    primaryLines.push(`# ${title}`, '')
    commentaryLines.push(`# ${title}`, '')
    for (const s of sections) {
      primaryLines.push(heading(s), '', s.body.join('\n\n'), '')
      commentaryLines.push(heading(s), '', s.notes.join('\n\n'), '')
    }
  }
  const primaryPath = join(outDir, 'boc-primary.md')
  const commentaryPath = join(outDir, 'boc-commentary.md')
  writeFileSync(primaryPath, primaryLines.join('\n'), 'utf8')
  writeFileSync(commentaryPath, commentaryLines.join('\n'), 'utf8')
  return { primaryPath, commentaryPath }
}

const opfPath = findOpf(epubDir)
if (!opfPath) {
  console.error('No .opf found under ' + epubDir + ' — is this an EPUB or an unzipped EPUB directory?')
  process.exit(1)
}
const docsOut = convert(opfPath)
const { primaryPath, commentaryPath } = writeOutputs(docsOut, outDir)

console.error('Documents found: ' + docsOut.size)
for (const [code, sections] of docsOut) {
  console.error('  ' + code + ': ' + sections.length + ' sections')
}
console.error('wrote ' + primaryPath)
console.error('wrote ' + commentaryPath)

if (tmpExtractDir) rmSync(tmpExtractDir, { recursive: true, force: true })
