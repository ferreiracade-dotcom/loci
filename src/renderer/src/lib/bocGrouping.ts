import type { BocCommentaryMatch, BocSectionRow } from '../../../shared/ipc'

export interface BocCommentaryGroup {
  sourceId: string
  sourceDisplayName: string
  sourceAuthor: string | null
  matches: BocCommentaryMatch[]
}

export function groupBocMatchesBySource(matches: BocCommentaryMatch[]): BocCommentaryGroup[] {
  const byId = new Map<string, BocCommentaryGroup>()
  for (const m of matches) {
    let g = byId.get(m.sourceId)
    if (!g) {
      g = { sourceId: m.sourceId, sourceDisplayName: m.sourceDisplayName, sourceAuthor: m.sourceAuthor, matches: [] }
      byId.set(m.sourceId, g)
    }
    g.matches.push(m)
  }
  return [...byId.values()].sort((a, b) => (a.matches[0]?.sortOrder ?? 0) - (b.matches[0]?.sortOrder ?? 0))
}

export function bocSectionRangeLabel(m: { sectionStart: number; sectionEnd: number }): string {
  return m.sectionStart === m.sectionEnd ? `§${m.sectionStart}` : `§${m.sectionStart}–${m.sectionEnd}`
}

/** A section's list-row label, as bookofconcord.cph.org's menu writes it: "Article IV.
 *  Justification" ("Articles VII and VIII (IV). The Church"), or just the label when the
 *  section is unnumbered ("Preface", "I. Original Sin"). Shared by every Confessions list. */
export function bocSectionLabel(r: { number: string | null; label: string }): string {
  if (!r.number) return r.label
  return `${/ and /.test(r.number) ? 'Articles' : 'Article'} ${r.number}. ${r.label}`
}

export interface PartGroup {
  part: string | null
  /** The section that IS this part's page (e.g. AC "A Review of the Various Abuses…", LC
   *  "Part 2: The Apostles' Creed"): shown as the group's clickable heading, with `rows` nested
   *  under it, as the site's menu nests them — instead of once as a row and again as a header. */
  head?: BocSectionRow
  rows: BocSectionRow[]
}

/** Group an ordinal-ordered section list into contiguous runs sharing the same `part` — parts
 *  appear as unbroken runs in reading order, so this reproduces the document's own part
 *  headings without needing a separate lookup. Shared by BocPane's nav rail and PanePicker's
 *  Confessions browser so both surfaces group sections the same way. */
export function groupByPart(rows: BocSectionRow[]): PartGroup[] {
  const groups: PartGroup[] = []
  for (const r of rows) {
    const last = groups[groups.length - 1]
    if (last && last.part === r.part) {
      last.rows.push(r)
      continue
    }
    // A part named after the section just before it: that section is the part's own page.
    const prev = last?.rows[last.rows.length - 1]
    if (r.part && prev && prev.part !== r.part && prev.label === r.part) {
      last.rows.pop()
      if (last.rows.length === 0 && !last.head) groups.pop()
      groups.push({ part: r.part, head: prev, rows: [r] })
    } else groups.push({ part: r.part, rows: [r] })
  }
  return groups
}
