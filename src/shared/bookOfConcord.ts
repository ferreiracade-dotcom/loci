// Book of Concord document registry — shared by main (index/lookup) and renderer
// (reader + citation). Pure, no I/O. Mirrors scriptureRef.ts's BOOKS, but lists ONLY
// the documents; a document's sections (Preface, Articles, Conclusion, catechism parts,
// appendix sections) are discovered from the indexed source, not pre-authored here.

export type BocDocumentCode =
  | 'PREF' | 'CR'
  | 'AC' | 'AP' | 'SA' | 'TR' | 'SC' | 'LC' | 'FC-EP' | 'FC-SD'
  | 'CT' | 'BEC' | 'SVA'

export interface BocDocumentDef {
  code: BocDocumentCode
  title: string
  abbreviation: string
  sortOrder: number
  /** Extra name spellings a `# <Document>` heading may use (earlier Loci titles and the
   *  Reader's Edition ToC), beyond title/abbreviation/code. Case-insensitive. */
  aliases?: string[]
  /** The document is a single page on bookofconcord.cph.org (whose layout the corpus follows),
   *  so document lists open its one section directly instead of expanding to a lone child. */
  singleSection?: boolean
}

// Titles are bookofconcord.cph.org's menu names; SVA, absent there, follows its appendix naming.
export const BOC_DOCUMENTS: BocDocumentDef[] = [
  { code: 'PREF',   title: 'Preface to the Christian Book of Concord', abbreviation: 'Pref.', sortOrder: 1, aliases: ['Preface to the Book of Concord', 'Preface to The Christian Book of Concord'], singleSection: true },
  { code: 'CR',     title: 'The Ecumenical Creeds', abbreviation: 'Creeds', sortOrder: 2, aliases: ['Ecumenical Creeds', 'The Three Universal or Ecumenical Creeds', 'The Three Ecumenical Creeds'] },
  { code: 'AC',     title: 'The Augsburg Confession', abbreviation: 'AC',  sortOrder: 3,  aliases: ['Augsburg Confession', 'The Augsburg Confession (1530)'] },
  { code: 'AP',     title: 'The Apology of the Augsburg Confession', abbreviation: 'Ap', sortOrder: 4, aliases: ['Apology of the Augsburg Confession', 'The Apology of the Augsburg Confession (1531)'] },
  { code: 'SA',     title: 'The Smalcald Articles', abbreviation: 'SA',  sortOrder: 5,  aliases: ['Smalcald Articles', 'The Smalcald Articles (1537)'] },
  { code: 'TR',     title: 'The Power and Primacy of the Pope', abbreviation: 'Tr', sortOrder: 6, aliases: ['Treatise on the Power and Primacy of the Pope', 'The Power and Primacy of the Pope (1537)'], singleSection: true },
  { code: 'SC',     title: 'The Small Catechism', abbreviation: 'SC',  sortOrder: 7,  aliases: ['Small Catechism', 'The Small Catechism (1529)', 'Enchiridion: The Small Catechism'] },
  { code: 'LC',     title: 'The Large Catechism', abbreviation: 'LC',  sortOrder: 8,  aliases: ['Large Catechism', 'The Large Catechism (1529)'] },
  { code: 'FC-EP',  title: 'The Formula of Concord - Epitome', abbreviation: 'FC Ep', sortOrder: 9, aliases: ['Formula of Concord: Epitome', 'The Formula of Concord, Epitome', 'The Formula of Concord, Epitome (1577)', 'Epitome'] },
  { code: 'FC-SD',  title: 'The Formula of Concord - Solid Declaration', abbreviation: 'FC SD', sortOrder: 10, aliases: ['Formula of Concord: Solid Declaration', 'The Formula of Concord, Solid Declaration', 'The Formula of Concord, Solid Declaration (1577)', 'Solid Declaration'] },
  { code: 'CT',     title: 'Appendix A: Catalog of Testimonies', abbreviation: 'Cat. Test.', sortOrder: 11, aliases: ['Catalog of Testimonies'], singleSection: true },
  { code: 'BEC',    title: 'Appendix B: A Brief Exhortation to Confession', abbreviation: 'Brief Exh.', sortOrder: 12, aliases: ['A Brief Exhortation to Confession'], singleSection: true },
  { code: 'SVA',    title: 'Appendix C: Saxon Visitation Articles', abbreviation: 'SVA', sortOrder: 13, aliases: ['Saxon Visitation Articles'] }
]
// 13 documents, grouped as bookofconcord.cph.org groups them: the Preface to the Book of Concord,
// the Ecumenical Creeds (one document, a section per creed), Augsburg/Apology/Smalcald/Treatise/
// Small Cat/Large Cat/FC Epitome/FC Solid Declaration (8), and 3 appendices (CT/BEC/SVA).

const byCode = new Map(BOC_DOCUMENTS.map((d) => [d.code, d]))

export function bocDocument(code: string): BocDocumentDef | undefined {
  return byCode.get(code as BocDocumentCode)
}

export function documentCodeFromName(name: string): BocDocumentCode | undefined {
  const n = name.trim().toLowerCase()
  const hit = BOC_DOCUMENTS.find((d) =>
    d.title.toLowerCase() === n ||
    d.abbreviation.toLowerCase() === n ||
    d.code.toLowerCase() === n ||
    (d.aliases ?? []).some((a) => a.toLowerCase() === n))
  return hit?.code
}

export function formatBocRef(code: BocDocumentCode, ordinal: number): string {
  return `${code}:${ordinal}`
}

export function parseBocRef(ref: string): { code: BocDocumentCode; ordinal: number } | null {
  const m = /^([A-Z-]+):(\d+)$/.exec(ref.trim())
  if (!m) return null
  const doc = bocDocument(m[1])
  const ordinal = Number(m[2])
  if (!doc || ordinal < 1) return null
  return { code: doc.code, ordinal }
}

// --- Typed references (the omnibox) ----------------------------------------------------

/** Short spellings people type for each document, beyond its code and abbreviation. */
const QUERY_ALIASES: [string, BocDocumentCode[]][] = [
  ['ac', ['AC']], ['ca', ['AC']], ['aug', ['AC']], ['augsburg', ['AC']], ['augsburg confession', ['AC']],
  ['augustana', ['AC']],
  ['ap', ['AP']], ['apol', ['AP']], ['apology', ['AP']],
  ['sa', ['SA']], ['smalc', ['SA']], ['smalcald', ['SA']], ['smalcald articles', ['SA']],
  ['tr', ['TR']], ['treatise', ['TR']],
  ['sc', ['SC']], ['small catechism', ['SC']],
  ['lc', ['LC']], ['large catechism', ['LC']],
  ['fc', ['FC-EP', 'FC-SD']], ['formula', ['FC-EP', 'FC-SD']], ['formula of concord', ['FC-EP', 'FC-SD']],
  ['fc ep', ['FC-EP']], ['fcep', ['FC-EP']], ['ep', ['FC-EP']], ['epitome', ['FC-EP']],
  ['fc sd', ['FC-SD']], ['fcsd', ['FC-SD']], ['sd', ['FC-SD']], ['solid declaration', ['FC-SD']],
  ['cr', ['CR']], ['creeds', ['CR']], ['ecumenical creeds', ['CR']],
  ['pref', ['PREF']], ['preface', ['PREF']],
  ['sva', ['SVA']], ['ct', ['CT']], ['bec', ['BEC']]
]
const ALIAS_MAP = new Map<string, BocDocumentCode[]>(QUERY_ALIASES)

/** The three creeds are sections of one document ('CR'); typing a creed's name finds its
 *  section by this word in the section label ("The Apostles’ Creed"). */
const CREED_ALIASES: [string, string][] = [
  ['apostles creed', 'Apostles'], ['apostles', 'Apostles'],
  ['nicene creed', 'Nicene'], ['nicene', 'Nicene'],
  ['athanasian creed', 'Athanasian'], ['athanasian', 'Athanasian']
]
const CREED_MAP = new Map<string, string>(CREED_ALIASES)

const ROMAN: [number, string][] = [
  [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']
]

export function toRoman(n: number): string {
  let out = ''
  let rest = Math.floor(n)
  for (const [v, s] of ROMAN) {
    while (rest >= v) {
      out += s
      rest -= v
    }
  }
  return out
}

/** Parse a Roman numeral (I..CXCIX), case-insensitive; null if it isn't a well-formed one. */
export function fromRoman(s: string): number | null {
  const t = s.trim().toUpperCase()
  if (!/^[IVXLC]+$/.test(t)) return null
  const vals: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100 }
  let total = 0
  for (let i = 0; i < t.length; i++) {
    const v = vals[t[i]]
    const next = vals[t[i + 1]] ?? 0
    total += v < next ? -v : v
  }
  return total > 0 && toRoman(total) === t ? total : null
}

export interface BocQuery {
  code: BocDocumentCode
  /** The article as a Roman numeral ("IV"), if one was typed. */
  article?: string
  /** A word the wanted section's label contains (a creed's name within 'CR'). */
  section?: string
}

/**
 * Parse what someone types for the Confessions: a document (code, abbreviation, title or a
 * common short form) optionally followed by an article in Roman or Arabic numerals, e.g.
 * "AC IV", "ac 4", "Apol. iv", "FC SD X", "SA", "LC", "Augsburg Confession art. 4".
 * Returns every document it could mean ("FC 10" is the Epitome or the Solid Declaration).
 */
export function parseBocQuery(input: string): BocQuery[] {
  const s = input
    .trim()
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[.,:]/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!s) return []
  const m = /^(.*?)(?:\s+(?:art|article))?(?:\s+([ivxlc]+|\d{1,3}))?$/.exec(s)
  if (!m) return []
  const docPart = m[1].replace(/^the /, '')
  const creed = CREED_MAP.get(docPart)
  if (creed) return m[2] ? [] : [{ code: 'CR', section: creed }]
  let article: string | undefined
  if (m[2]) {
    const n = /^\d+$/.test(m[2]) ? Number(m[2]) : fromRoman(m[2])
    if (!n || n < 1) return []
    article = toRoman(n)
  }
  let codes = ALIAS_MAP.get(docPart)
  if (!codes) {
    const exact = documentCodeFromName(docPart)
    if (exact) codes = [exact]
  }
  if (!codes) return []
  return codes.map((code) => (article ? { code, article } : { code }))
}

/**
 * Whether an indexed section's number is the article `roman` ("IV"). Section numbers are kept
 * verbatim from the source, so the Apology's dual numbering "II (I)" counts as II.
 */
export function bocSectionMatches(sectionNumber: string | null, roman: string): boolean {
  if (!sectionNumber) return false
  const first = sectionNumber.trim().split(/[\s(]/)[0].replace(/\.$/, '').toUpperCase()
  if (first === roman.toUpperCase()) return true
  const n = Number(first)
  return Number.isInteger(n) && n > 0 && toRoman(n) === roman.toUpperCase()
}

/** The article numbers a section number or label names: "IV (II)" → IV; "VII and VIII (IV)" →
 *  VII, VIII; "XIIa (V)" → XII. Arabic numbers become Roman. */
function articleNumbers(text: string): string[] {
  const t = text.trim().replace(/^Articles?\s+/i, '').split('(')[0]
  const out: string[] = []
  for (const tok of t.split(/\s+(?:and|&)\s+|\s*,\s*/i)) {
    const m = /^([IVXLC]+|\d+)[ab]?\.?$/i.exec(tok.trim())
    if (!m) continue
    const n = /^\d+$/.test(m[1]) ? Number(m[1]) : fromRoman(m[1])
    if (n && n > 0) out.push(toRoman(n))
  }
  return out
}

/**
 * Whether an indexed section is the article `roman` ("IV"). The rebuilt corpus mirrors
 * bookofconcord.cph.org: most articles carry a number ("IV", the Apology's "IV (II)",
 * "VII and VIII (IV)", "XIIa (V)"), but some documents put the numeral in the label instead
 * ("X. Church Practices" in the Formula, "II. The Creed" in the Small Catechism, "Article II"
 * in the Large Catechism's Creed part).
 */
export function bocRowMatches(row: { number: string | null; label: string }, roman: string): boolean {
  const want = roman.toUpperCase()
  if (row.number && articleNumbers(row.number).includes(want)) return true
  const lead = /^(?:Articles?\s+)?([IVXLC]+[ab]?)(?:\.\s|\s*$)/i.exec(row.label.trim())
  return !!lead && articleNumbers(lead[1]).includes(want)
}
