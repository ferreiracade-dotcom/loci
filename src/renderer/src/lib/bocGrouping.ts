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

/** A section's list-row label: "IV. Justification", or just the label when the section is
 *  unnumbered (prefaces, appendices). Shared by BocPane's nav rail and PanePicker's browser. */
export function bocSectionLabel(r: { number: string | null; label: string }): string {
  return r.number ? `${r.number}. ${r.label}` : r.label
}

export interface PartGroup {
  part: string | null
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
    if (last && last.part === r.part) last.rows.push(r)
    else groups.push({ part: r.part, rows: [r] })
  }
  return groups
}
