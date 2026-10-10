import type { FathersSectionSummary } from '../../../shared/ipc'

export interface FathersWorkGroup {
  /** '' when the section carries no work title. */
  workTitle: string
  sections: FathersSectionSummary[]
}
export interface FathersAuthorGroup {
  /** Stable React key: the author (or 'unattributed') plus where the run starts. */
  key: string
  authorId: string | null
  /** Display name; 'Unattributed' for front matter and collections with no single author. */
  authorName: string
  works: FathersWorkGroup[]
}

/**
 * Group a volume's reading-order section list into contiguous author runs, each split into
 * contiguous work runs — the Volumes drawer's "author → work → section" tree. Runs rather than a
 * map, so a volume that returns to an author later (or interleaves unattributed front matter)
 * keeps its reading order instead of merging distant sections.
 */
export function groupFathersSections(sections: FathersSectionSummary[]): FathersAuthorGroup[] {
  const groups: FathersAuthorGroup[] = []
  for (const s of sections) {
    let g = groups[groups.length - 1]
    if (!g || g.authorId !== s.authorId) {
      g = {
        key: `${s.authorId ?? 'unattributed'}@${s.ordinal}`,
        authorId: s.authorId,
        authorName: s.authorId ? (s.authorName ?? s.authorId) : 'Unattributed',
        works: []
      }
      groups.push(g)
    }
    const work = s.workTitle ?? ''
    let w = g.works[g.works.length - 1]
    if (!w || w.workTitle !== work) {
      w = { workTitle: work, sections: [] }
      g.works.push(w)
    }
    w.sections.push(s)
  }
  return groups
}

/** A section's row label in the drawer: its short title, else its last ancestor title, else its id. */
export function sectionLabel(s: Pick<FathersSectionSummary, 'shortTitle' | 'titles' | 'id'>): string {
  return s.shortTitle || s.titles[s.titles.length - 1] || s.id
}
