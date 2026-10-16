// Shared parsers for the Berean (BSB / BLB) converters in tools/. No dependencies; plain Node.
//
// The converters (bsb-usfm-to-json.mjs, blb-to-json.mjs, bsb-interlinear-to-json.mjs,
// bsb-topics-to-json.mjs) read the raw public-domain sources in tools/sources/bsb/ (not committed)
// and write the committed outputs under resources/scripture/. Everything that can be unit-tested
// lives here; see bsb-lib.test.mjs.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inflateRawSync } from 'node:zlib'

export const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
export const SOURCES = join(REPO, 'tools', 'sources', 'bsb')
export const OUT = join(REPO, 'resources', 'scripture')

// ---------------------------------------------------------------- book codes

/** Parse the `[code, name, chapters, abbreviations]` table out of src/shared/scriptureRef.ts, so the
 *  converters always agree with the app's own book codes (the same trick the Python converters use). */
export function loadBooks(text = readFileSync(join(REPO, 'src', 'shared', 'scriptureRef.ts'), 'utf8')) {
  const books = []
  const re = /\['(\w{3})', '([^']+)', (\d+), \[([^\]]*)\]\]/g
  let m
  while ((m = re.exec(text))) {
    const abbr = [...m[4].matchAll(/'([^']+)'/g)].map((a) => a[1])
    books.push({ code: m[1], name: m[2], chapters: Number(m[3]), abbr })
  }
  if (books.length !== 66) throw new Error(`expected 66 books in scriptureRef.ts, found ${books.length}`)
  return books
}

/** name/abbreviation (case-insensitive) -> app book code. Throws on an unmapped name. */
export function makeBookResolver(books = loadBooks()) {
  const byName = new Map()
  for (const b of books) {
    for (const n of [b.name, ...b.abbr]) {
      const k = n.toLowerCase()
      if (byName.has(k) && byName.get(k) !== b.code) throw new Error(`book name clash: ${n}`)
      byName.set(k, b.code)
    }
  }
  const codes = new Set(books.map((b) => b.code))
  return {
    codes,
    byName: (name) => {
      const code = byName.get(name.trim().toLowerCase())
      if (!code) throw new Error(`unmapped book name: "${name}"`)
      return code
    },
    byCode: (code) => {
      if (!codes.has(code)) throw new Error(`unmapped book code: "${code}"`)
      return code
    }
  }
}

// ---------------------------------------------------------------- zip (read-only, stored/deflate)

/** Minimal zip reader: returns Map<entry name, () => Buffer>. Enough for USFM and xlsx archives. */
export function readZip(buf) {
  let eocd = -1
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66000); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new Error('not a zip file')
  const count = buf.readUInt16LE(eocd + 10)
  let p = buf.readUInt32LE(eocd + 16)
  const entries = new Map()
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('bad zip central directory')
    const method = buf.readUInt16LE(p + 10)
    const csize = buf.readUInt32LE(p + 20)
    const nameLen = buf.readUInt16LE(p + 28)
    const extraLen = buf.readUInt16LE(p + 30)
    const commentLen = buf.readUInt16LE(p + 32)
    const local = buf.readUInt32LE(p + 42)
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen)
    entries.set(name, () => {
      const dataStart = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28)
      const raw = buf.subarray(dataStart, dataStart + csize)
      if (method === 0) return Buffer.from(raw)
      if (method === 8) return inflateRawSync(raw)
      throw new Error(`unsupported zip method ${method} for ${name}`)
    })
    p += 46 + nameLen + extraLen + commentLen
  }
  return entries
}

// ---------------------------------------------------------------- USFM (BSB)

const unfold = (s) => s.replace(/\s+/g, ' ').trim()

/** Strip USFM character markup from running verse text: footnotes (with their nested \ref/\fv),
 *  inline cross-references, words-of-Jesus and other span markers. */
export function stripUsfmInline(s) {
  return s
    .replace(/\\f\s.*?\\f\*/gs, '')
    .replace(/\\x\s.*?\\x\*/gs, '')
    .replace(/\\ref\s[^\\]*\\ref\*/g, '')
    .replace(/\\[a-z]+\d?\*?/g, '') // remaining \wj \wj* \nd \add ... markers
}

// Paragraph markers whose whole line is structure (headings, cross-reference lists, ids), not verse text.
const SKIP_LINE = /^\\(?:id|usfm|ide|h|toc\d|mt\d?|s\d?|ms\d?|mr|qa|r|sr|rq|sp|cl|cd|cp|ca|va|vp)\b/

/** Parse one USFM book into { code, chapters: { "<n>": [[verse, text], ...] } } in source order.
 *  Verse numbers are kept as in the source (never assumed contiguous). A verse range marker
 *  (\v 2-3) is stored under its first number. Text before the first \v of a chapter is ignored. */
export function parseUsfmBook(text) {
  const idm = /^\\id\s+(\w{3})/m.exec(text)
  if (!idm) throw new Error('USFM book has no \\id line')
  const chapters = {}
  let chapter = null
  let verse = null
  let buf = []
  const flush = () => {
    if (chapter !== null && verse !== null) {
      const t = unfold(stripUsfmInline(buf.join(' ')))
      ;(chapters[chapter] ||= []).push([verse, t])
    }
    verse = null
    buf = []
  }
  for (const line of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const cm = /^\\c\s+(\d+)/.exec(line)
    if (cm) {
      flush()
      chapter = Number(cm[1])
      chapters[chapter] ||= []
      continue
    }
    if (SKIP_LINE.test(line) || chapter === null) continue
    // \d is a Psalm superscription: verse text when it carries a \v (Ps 3:1), else a bare heading.
    if (/^\\d\b/.test(line) && !/\\v\s/.test(line)) continue
    // A line may carry several \v markers; text between them belongs to the preceding verse.
    const parts = line.split(/\\v\s+(\d+)(?:-\d+)?\s*/)
    // parts: [before, num, after, num, after, ...]
    if (parts[0].trim()) buf.push(parts[0])
    for (let i = 1; i < parts.length; i += 2) {
      flush()
      verse = Number(parts[i])
      buf.push(parts[i + 1])
    }
  }
  flush()
  for (const [c, vs] of Object.entries(chapters)) if (!vs.length) delete chapters[c]
  return { code: idm[1], chapters }
}

// ---------------------------------------------------------------- BLB

/** Remove the HTML fragments embedded in blb.txt: the Psalm superscription's inline verse-number
 *  link (`<span class=|reftext|><a href=|#|><b>1</b></a>`, deleted with its number) and the stray
 *  `<p class=...>` paragraph tags. [supplied word] brackets are left alone. */
export function stripBlbHtml(s) {
  return s
    .replace(/<span class=\|reftext\|>.*?<\/a>/g, '')
    .replace(/<\/?(?:p|span|a|b|br)\b[^>]*>/g, ' ')
}

/** Parse blb.txt ("Genesis 1:1<TAB>text", header lines, then a "Verse<TAB>…" column row). */
export function parseBlb(text, resolver) {
  const out = {}
  for (const line of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const tab = line.indexOf('\t')
    if (tab < 0) continue
    const m = /^(.+?) (\d+):(\d+)$/.exec(line.slice(0, tab))
    if (!m) continue // header lines and the "Verse<TAB>…" column row
    const code = resolver.byName(m[1])
    const ch = Number(m[2])
    const verse = unfold(stripBlbHtml(line.slice(tab + 1)))
    if (!verse) continue // verses the BLB leaves blank (e.g. Matt 17:21) are omitted, like the BSB's
    ;(((out[code] ||= {})[ch]) ||= []).push([Number(m[3]), verse])
  }
  return out
}

// ---------------------------------------------------------------- interlinear (bsb_tables.tsv)

/** Column positions in bsb_tables.tsv (header row is verified by parseInterlinear). */
const COL = { hebSort: 0, grkSort: 1, bsbSort: 2, lang: 4, orig: 5, translit: 7, parsing: 8, strH: 10, strG: 11, verseId: 12, bsb: 18 }
const EXPECTED_HEADER = { 0: 'Heb Sort', 1: 'Greek Sort', 2: 'BSB Sort', 4: 'Language', 7: 'Translit', 10: 'Str Heb', 11: 'Str Grk', 12: 'VerseId', 18: ' BSB version ' }

/**
 * Parse bsb_tables.tsv into { CODE: { "<chapter>": { "<verse>": [ {o,t,s,p,e}, ... ] } } }.
 *
 * - The file has one row per original-language word, plus ~300k padding rows (blank fields) and a
 *   few stray rows with no original word; rows without an original word are skipped.
 * - Chapter/verse come from the `VerseId` column ("John 3:16"), which is set on the first row of
 *   each verse (the `Verse` column is a running verse counter, not a verse number).
 * - Order: the file is sorted in English (BSB) order. We emit each verse in ORIGINAL-LANGUAGE
 *   reading order instead - by `Heb Sort` for Hebrew/Aramaic, `Greek Sort` for Greek - because an
 *   interlinear reads the original left-to-right (or right-to-left) with the English gloss under
 *   each word; `BSB Sort` is the stable tiebreak. (BSB English order is recoverable from `e`.)
 * - o: original word (pointed Hebrew / accented Greek), t: transliteration, s: Strong's number
 *   ("H7225" / "G976", Aramaic counts as H), p: short parsing code, e: BSB English for the word
 *   (trimmed; "-" or "vvv" are the source's marks for untranslated words, kept as-is).
 */
export function parseInterlinear(tsv, resolver) {
  const out = {}
  const lines = tsv.replace(/^﻿/, '').split(/\r?\n/)
  const header = lines[0].split('\t')
  for (const [i, name] of Object.entries(EXPECTED_HEADER)) {
    if (header[i] !== name) throw new Error(`bsb_tables.tsv column ${i} is "${header[i]}", expected "${name}"`)
  }
  let cur = null // { code, chapter, verse, words: [] }
  const finish = () => {
    if (!cur || !cur.words.length) return
    cur.words.sort((a, b) => a.key - b.key || a.tie - b.tie)
    const book = (out[cur.code] ||= {})
    const ch = (book[cur.chapter] ||= {})
    if (ch[cur.verse]) throw new Error(`duplicate verse ${cur.code} ${cur.chapter}:${cur.verse} in bsb_tables.tsv`)
    ch[cur.verse] = cur.words.map((w) => w.w)
  }
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    if (!line) continue
    const c = line.split('\t')
    if (c[COL.verseId]) {
      const m = /^(.+?) (\d+):(\d+)$/.exec(c[COL.verseId])
      if (!m) throw new Error(`bad VerseId "${c[COL.verseId]}" on line ${i + 1}`)
      finish()
      cur = { code: resolver.byName(m[1]), chapter: Number(m[2]), verse: Number(m[3]), words: [] }
    }
    if (!c[COL.orig] || !cur) continue
    const greek = c[COL.lang] === 'Greek'
    const str = greek ? c[COL.strG] : c[COL.strH]
    const sortVal = Number(greek ? c[COL.grkSort] : c[COL.hebSort])
    cur.words.push({
      key: Number.isFinite(sortVal) ? sortVal : 0,
      tie: Number(c[COL.bsbSort]) || 0,
      w: { o: c[COL.orig], t: c[COL.translit], s: str ? (greek ? 'G' : 'H') + str : '', p: c[COL.parsing], e: (c[COL.bsb] ?? '').trim() }
    })
  }
  finish()
  return out
}

// ---------------------------------------------------------------- topical index (xlsx)

const XML_ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
const unxml = (s) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e) =>
    e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : XML_ENT[e.toLowerCase()]
  )

/** xl/sharedStrings.xml -> string[] (rich-text runs concatenated). */
export function parseSharedStrings(xml) {
  const out = []
  for (const si of xml.matchAll(/<si>(.*?)<\/si>/gs)) {
    let s = ''
    for (const t of si[1].matchAll(/<t(?:\s[^>]*)?>(.*?)<\/t>/gs)) s += unxml(t[1])
    out.push(s)
  }
  return out
}

/**
 * The topical index sheet: rows 1-3 are title/header lines (Sort, Source, Topic, Num, Verse, Context);
 * then a TOPIC row (Topic in column C, source tag in B) is followed by its verse rows (Verse in
 * column E, e.g. "Exodus 17:12" or "Revelation 13:16–18"; Context, the verse text, is dropped).
 * Returns { "<Topic>": ["Exodus 17:12", ...] }. A topic that appears under several sources (Torrey's,
 * Nave's, ...) is merged; duplicate references are dropped; refs stay the source's strings.
 */
export function parseTopics(sheetXml, strings) {
  const topics = new Map()
  let cur = null
  for (const row of sheetXml.matchAll(/<row\b[^>]*>(.*?)<\/row>/gs)) {
    const cells = {}
    for (const c of row[1].matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>(.*?)<\/c>)/gs)) {
      const v = c[3] && /<v>(.*?)<\/v>/s.exec(c[3])
      if (!v) continue
      cells[c[1]] = /t="s"/.test(c[2]) ? strings[Number(v[1])] : v[1]
    }
    if (cells.A === 'Sort' && cells.C === 'Topic') continue
    if (cells.C) {
      cur = topics.get(cells.C)
      if (!cur) topics.set(cells.C, (cur = []))
    } else if (cells.E && cur) {
      const ref = cells.E.trim()
      if (ref && !cur.includes(ref)) cur.push(ref)
    }
  }
  for (const [k, v] of topics) if (!v.length) topics.delete(k)
  return Object.fromEntries(topics)
}
