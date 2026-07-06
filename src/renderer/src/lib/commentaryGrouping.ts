import type { CommentaryMatch } from '@shared/ipc'

export interface CommentaryGroup {
  sourceId: string
  sourceDisplayName: string
  sourceAuthor: string | null
  sortOrder: number
  matches: CommentaryMatch[]
}

/** Group lookup results by source, preserving each source's first-seen order (the lookup
 *  query already orders by sort_order, so this is stable without re-sorting matches). */
export function groupMatchesBySource(matches: CommentaryMatch[]): CommentaryGroup[] {
  const bySource = new Map<string, CommentaryGroup>()
  for (const m of matches) {
    let group = bySource.get(m.sourceId)
    if (!group) {
      group = {
        sourceId: m.sourceId,
        sourceDisplayName: m.sourceDisplayName,
        sourceAuthor: m.sourceAuthor,
        sortOrder: m.sortOrder,
        matches: []
      }
      bySource.set(m.sourceId, group)
    }
    group.matches.push(m)
  }
  return [...bySource.values()].sort((a, b) => a.sortOrder - b.sortOrder)
}

/** Collapsed by default once more than 2 sources have results; expanded for 1-2 (spec §5). */
export function shouldCollapseByDefault(groupCount: number): boolean {
  return groupCount > 2
}

/** Human range label for an excerpt, e.g. "v. 16", "vv. 16-21", or "3:25-4:2" cross-chapter. */
export function excerptRangeLabel(
  m: Pick<CommentaryMatch, 'chapterStart' | 'verseStart' | 'chapterEnd' | 'verseEnd'>
): string {
  if (m.chapterStart === m.chapterEnd) {
    return m.verseStart === m.verseEnd ? `v. ${m.verseStart}` : `vv. ${m.verseStart}-${m.verseEnd}`
  }
  return `${m.chapterStart}:${m.verseStart}-${m.chapterEnd}:${m.verseEnd}`
}
