// OSIS scripture-reference parsing for ThML `scripRef osisRef="…"` attributes. Pure; shared by
// the ThML parser (main) and the Fathers reader (renderer, to open a clicked reference).
//
// Handles the shapes CCEL actually emits: `Bible:John.3.16`, ranges (`Bible:1Pet.5.1-1Pet.5.5`,
// cross-chapter, and the `-12` verse shorthand), chapter-only (`Bible:Num.16`), book-only
// (`Bible:Jude`), the LXX prefix (`Bible.lxx:Isa.7.9`), and space-separated lists
// (`Bible:Isa.64.4 Bible:1Cor.2.9`). Books are returned as the 3-letter USFM codes used
// everywhere else in Loci (scriptureRef.ts). Deuterocanonical books are recognised but reported
// as `non-canon` because Loci's Bible navigation covers the 66-book canon only.
import { bookByCode } from './scriptureRef'

export interface OsisPassage {
  /** USFM code, e.g. "1PE". */
  book: string
  chapterStart: number
  /** null = the whole chapter (or whole book when the range spans chapters). */
  verseStart: number | null
  chapterEnd: number
  verseEnd: number | null
}

export type OsisParse =
  | { kind: 'ok'; passages: OsisPassage[] }
  | { kind: 'non-canon'; book: string }
  | { kind: 'bad' }

const OSIS_TO_USFM: Record<string, string> = {
  Gen: 'GEN', Exod: 'EXO', Lev: 'LEV', Num: 'NUM', Deut: 'DEU', Josh: 'JOS', Judg: 'JDG',
  Ruth: 'RUT', '1Sam': '1SA', '2Sam': '2SA', '1Kgs': '1KI', '2Kgs': '2KI', '1Chr': '1CH',
  '2Chr': '2CH', Ezra: 'EZR', Neh: 'NEH', Esth: 'EST', Job: 'JOB', Ps: 'PSA', Prov: 'PRO',
  Eccl: 'ECC', Song: 'SNG', Isa: 'ISA', Jer: 'JER', Lam: 'LAM', Ezek: 'EZK', Dan: 'DAN',
  Hos: 'HOS', Joel: 'JOL', Amos: 'AMO', Obad: 'OBA', Jonah: 'JON', Mic: 'MIC', Nah: 'NAM',
  Hab: 'HAB', Zeph: 'ZEP', Hag: 'HAG', Zech: 'ZEC', Mal: 'MAL', Matt: 'MAT', Mark: 'MRK',
  Luke: 'LUK', John: 'JHN', Acts: 'ACT', Rom: 'ROM', '1Cor': '1CO', '2Cor': '2CO', Gal: 'GAL',
  Eph: 'EPH', Phil: 'PHP', Col: 'COL', '1Thess': '1TH', '2Thess': '2TH', '1Tim': '1TI',
  '2Tim': '2TI', Titus: 'TIT', Phlm: 'PHM', Heb: 'HEB', Jas: 'JAS', '1Pet': '1PE', '2Pet': '2PE',
  '1John': '1JN', '2John': '2JN', '3John': '3JN', Jude: 'JUD', Rev: 'REV',
  // Variant spellings seen in the CCEL files.
  Jon: 'JON', '1Kings': '1KI', '2Kings': '2KI', Philem: 'PHM', Cant: 'SNG', Eccles: 'ECC'
}

const NON_CANON = new Set([
  'Tob', 'Jdt', 'AddEsth', 'Wis', 'Sir', 'Bar', 'EpJer', 'PrAzar', 'Sus', 'Bel',
  '1Macc', '2Macc', '3Macc', '4Macc', '1Esd', '2Esd', 'PrMan', 'Ps151'
])

/** `Bible:` or a translation-qualified `Bible.lxx:` prefix. */
const PREFIX_RE = /^Bible(?:\.[A-Za-z0-9]+)?:/i

interface Point {
  book: string
  chapter: number | null
  verse: number | null
}

type PointResult = { ok: Point } | { nonCanon: string } | null

function validate(p: Point): PointResult {
  const def = bookByCode(p.book)
  if (!def) return null
  if (p.chapter !== null && (p.chapter < 1 || p.chapter > def.chapters)) return null
  if (p.verse !== null && p.verse < 1) return null
  return { ok: p }
}

function parsePoint(raw: string): PointResult {
  const m = /^([1-4]?[A-Za-z]+)(?:\.(\d+)(?:\.(\d+))?)?$/.exec(raw.replace(PREFIX_RE, ''))
  if (!m) return null
  const usfm = OSIS_TO_USFM[m[1]]
  if (!usfm) return NON_CANON.has(m[1]) ? { nonCanon: m[1] } : null
  return validate({
    book: usfm,
    chapter: m[2] ? Number(m[2]) : null,
    verse: m[3] ? Number(m[3]) : null
  })
}

/** The right-hand side of a range may be a full point, `C.V`, or a bare number (a verse when the
 *  start named a verse, otherwise a chapter). */
function parseEnd(raw: string, start: Point): PointResult {
  const s = raw.replace(PREFIX_RE, '')
  if (/^\d+$/.test(s)) {
    const n = Number(s)
    return start.verse !== null
      ? validate({ book: start.book, chapter: start.chapter, verse: n })
      : validate({ book: start.book, chapter: n, verse: null })
  }
  const cv = /^(\d+)\.(\d+)$/.exec(s)
  if (cv) return validate({ book: start.book, chapter: Number(cv[1]), verse: Number(cv[2]) })
  return parsePoint(s)
}

function toPassage(a: Point, b: Point | null): OsisPassage | null {
  const def = bookByCode(a.book)
  if (!def) return null
  if (b === null) {
    if (a.chapter === null) {
      return { book: a.book, chapterStart: 1, verseStart: null, chapterEnd: def.chapters, verseEnd: null }
    }
    return { book: a.book, chapterStart: a.chapter, verseStart: a.verse, chapterEnd: a.chapter, verseEnd: a.verse }
  }
  if (b.book !== a.book || a.chapter === null) return null
  const ce = b.chapter ?? a.chapter
  if (ce < a.chapter) return null
  if (ce === a.chapter && a.verse !== null && b.verse !== null && b.verse < a.verse) return null
  return { book: a.book, chapterStart: a.chapter, verseStart: a.verse, chapterEnd: ce, verseEnd: b.verse }
}

/** Parse an `osisRef` attribute value into one passage per space-separated element. A list with
 *  at least one canonical element is `ok` (unusable siblings are dropped); otherwise the result
 *  says whether the problem was a deuterocanonical book or plain garbage. */
export function parseOsisRef(osis: string): OsisParse {
  const elements = osis.trim().split(/\s+/).filter(Boolean)
  if (elements.length === 0) return { kind: 'bad' }
  const passages: OsisPassage[] = []
  let nonCanon: string | null = null
  for (const el of elements) {
    const parts = el.split('-')
    if (parts.length > 2) continue
    const a = parsePoint(parts[0])
    if (a === null) continue
    if ('nonCanon' in a) {
      nonCanon = a.nonCanon
      continue
    }
    let b: Point | null = null
    if (parts.length === 2) {
      const end = parseEnd(parts[1], a.ok)
      if (end === null || 'nonCanon' in end) continue
      b = end.ok
    }
    const passage = toPassage(a.ok, b)
    if (passage) passages.push(passage)
  }
  if (passages.length > 0) return { kind: 'ok', passages }
  return nonCanon !== null ? { kind: 'non-canon', book: nonCanon } : { kind: 'bad' }
}
