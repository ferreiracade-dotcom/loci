// Book of Concord document registry — shared by main (index/lookup) and renderer
// (reader + citation). Pure, no I/O. Mirrors scriptureRef.ts's BOOKS, but lists ONLY
// the documents; a document's sections (Preface, Articles, Conclusion, catechism parts,
// appendix sections) are discovered from the indexed source, not pre-authored here.

export type BocDocumentCode =
  | 'CR-AP' | 'CR-NI' | 'CR-ATH'
  | 'AC' | 'AP' | 'SA' | 'TR' | 'SC' | 'LC' | 'FC-EP' | 'FC-SD'
  | 'CT' | 'BEC' | 'SVA'

export interface BocDocumentDef {
  code: BocDocumentCode
  title: string
  abbreviation: string
  sortOrder: number
  /** Extra name spellings the converter's `# <Document>` heading may use (from the
   *  Reader's Edition ToC), beyond title/abbreviation/code. Case-insensitive. */
  aliases?: string[]
}

export const BOC_DOCUMENTS: BocDocumentDef[] = [
  { code: 'CR-AP',  title: "Apostles' Creed",       abbreviation: "Ap. Creed",  sortOrder: 1,  aliases: ["The Apostles' Creed"] },
  { code: 'CR-NI',  title: 'Nicene Creed',          abbreviation: 'Nic. Creed', sortOrder: 2,  aliases: ['The Nicene Creed'] },
  { code: 'CR-ATH', title: 'Athanasian Creed',      abbreviation: 'Ath. Creed', sortOrder: 3,  aliases: ['The Creed of Athanasius'] },
  { code: 'AC',     title: 'Augsburg Confession',   abbreviation: 'AC',  sortOrder: 4,  aliases: ['The Augsburg Confession', 'The Augsburg Confession (1530)'] },
  { code: 'AP',     title: 'Apology of the Augsburg Confession', abbreviation: 'Ap', sortOrder: 5, aliases: ['The Apology of the Augsburg Confession', 'The Apology of the Augsburg Confession (1531)'] },
  { code: 'SA',     title: 'Smalcald Articles',     abbreviation: 'SA',  sortOrder: 6,  aliases: ['The Smalcald Articles', 'The Smalcald Articles (1537)'] },
  { code: 'TR',     title: 'Treatise on the Power and Primacy of the Pope', abbreviation: 'Tr', sortOrder: 7, aliases: ['The Power and Primacy of the Pope', 'The Power and Primacy of the Pope (1537)'] },
  { code: 'SC',     title: 'Small Catechism',       abbreviation: 'SC',  sortOrder: 8,  aliases: ['The Small Catechism', 'The Small Catechism (1529)', 'Enchiridion: The Small Catechism'] },
  { code: 'LC',     title: 'Large Catechism',       abbreviation: 'LC',  sortOrder: 9,  aliases: ['The Large Catechism', 'The Large Catechism (1529)'] },
  { code: 'FC-EP',  title: 'Formula of Concord: Epitome', abbreviation: 'FC Ep', sortOrder: 10, aliases: ['The Formula of Concord, Epitome', 'The Formula of Concord, Epitome (1577)', 'Epitome'] },
  { code: 'FC-SD',  title: 'Formula of Concord: Solid Declaration', abbreviation: 'FC SD', sortOrder: 11, aliases: ['The Formula of Concord, Solid Declaration', 'The Formula of Concord, Solid Declaration (1577)', 'Solid Declaration'] },
  { code: 'CT',     title: 'Catalog of Testimonies', abbreviation: 'Cat. Test.', sortOrder: 12, aliases: ['Appendix A: Catalog of Testimonies'] },
  { code: 'BEC',    title: 'A Brief Exhortation to Confession', abbreviation: 'Brief Exh.', sortOrder: 13, aliases: ['Appendix B: A Brief Exhortation to Confession'] },
  { code: 'SVA',    title: 'Saxon Visitation Articles', abbreviation: 'SVA', sortOrder: 14, aliases: ['Appendix C: Saxon Visitation Articles'] }
]
// 14 documents: 3 Ecumenical Creeds + Augsburg/Apology/Smalcald/Treatise/Small Cat/
// Large Cat/FC Epitome/FC Solid Declaration (8) + 3 appendices (CT/BEC/SVA).

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
  ['apostles creed', ['CR-AP']], ['apostles', ['CR-AP']],
  ['nicene creed', ['CR-NI']], ['nicene', ['CR-NI']],
  ['athanasian creed', ['CR-ATH']], ['athanasian', ['CR-ATH']]
]
const ALIAS_MAP = new Map<string, BocDocumentCode[]>(QUERY_ALIASES)

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
    .replace(/[.,:'’]/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!s) return []
  const m = /^(.*?)(?:\s+(?:art|article))?(?:\s+([ivxlc]+|\d{1,3}))?$/.exec(s)
  if (!m) return []
  const docPart = m[1].replace(/^the /, '')
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
