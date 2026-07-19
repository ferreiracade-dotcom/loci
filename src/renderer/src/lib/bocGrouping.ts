import type { BocCommentaryMatch } from '../../../shared/ipc'

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
