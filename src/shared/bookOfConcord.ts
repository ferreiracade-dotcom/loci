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
  /** Extra name spellings the converter's `# <Document>` heading may use (from the
   *  Reader's Edition ToC), beyond title/abbreviation/code. Case-insensitive. */
  aliases?: string[]
  /** The document is a single page on bookofconcord.cph.org (whose layout the corpus follows),
   *  so document lists open its one section directly instead of expanding to a lone child. */
  singleSection?: boolean
}

export const BOC_DOCUMENTS: BocDocumentDef[] = [
  { code: 'PREF',   title: 'Preface to the Book of Concord', abbreviation: 'Pref.', sortOrder: 1, aliases: ['Preface to the Christian Book of Concord', 'Preface to The Christian Book of Concord'], singleSection: true },
  { code: 'CR',     title: 'Ecumenical Creeds',     abbreviation: 'Creeds', sortOrder: 2, aliases: ['The Ecumenical Creeds', 'The Three Universal or Ecumenical Creeds', 'The Three Ecumenical Creeds'] },
  { code: 'AC',     title: 'Augsburg Confession',   abbreviation: 'AC',  sortOrder: 3,  aliases: ['The Augsburg Confession', 'The Augsburg Confession (1530)'] },
  { code: 'AP',     title: 'Apology of the Augsburg Confession', abbreviation: 'Ap', sortOrder: 4, aliases: ['The Apology of the Augsburg Confession', 'The Apology of the Augsburg Confession (1531)'] },
  { code: 'SA',     title: 'Smalcald Articles',     abbreviation: 'SA',  sortOrder: 5,  aliases: ['The Smalcald Articles', 'The Smalcald Articles (1537)'] },
  { code: 'TR',     title: 'Treatise on the Power and Primacy of the Pope', abbreviation: 'Tr', sortOrder: 6, aliases: ['The Power and Primacy of the Pope', 'The Power and Primacy of the Pope (1537)'], singleSection: true },
  { code: 'SC',     title: 'Small Catechism',       abbreviation: 'SC',  sortOrder: 7,  aliases: ['The Small Catechism', 'The Small Catechism (1529)', 'Enchiridion: The Small Catechism'] },
  { code: 'LC',     title: 'Large Catechism',       abbreviation: 'LC',  sortOrder: 8,  aliases: ['The Large Catechism', 'The Large Catechism (1529)'] },
  { code: 'FC-EP',  title: 'Formula of Concord: Epitome', abbreviation: 'FC Ep', sortOrder: 9, aliases: ['The Formula of Concord, Epitome', 'The Formula of Concord, Epitome (1577)', 'Epitome'] },
  { code: 'FC-SD',  title: 'Formula of Concord: Solid Declaration', abbreviation: 'FC SD', sortOrder: 10, aliases: ['The Formula of Concord, Solid Declaration', 'The Formula of Concord, Solid Declaration (1577)', 'Solid Declaration'] },
  { code: 'CT',     title: 'Catalog of Testimonies', abbreviation: 'Cat. Test.', sortOrder: 11, aliases: ['Appendix A: Catalog of Testimonies'], singleSection: true },
  { code: 'BEC',    title: 'A Brief Exhortation to Confession', abbreviation: 'Brief Exh.', sortOrder: 12, aliases: ['Appendix B: A Brief Exhortation to Confession'], singleSection: true },
  { code: 'SVA',    title: 'Saxon Visitation Articles', abbreviation: 'SVA', sortOrder: 13, aliases: ['Appendix C: Saxon Visitation Articles'] }
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
