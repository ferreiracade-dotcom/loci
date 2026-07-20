import { useStore } from '../../store/useStore'
import { bocDocument } from '@shared/bookOfConcord'
import { bocSectionLabel, bocSectionRangeLabel, groupBocMatchesBySource } from '../../lib/bocGrouping'
import { CommentaryPanelView } from './CommentaryPanel'
import type { CommentaryGroupVM } from './CommentaryPanel'

/** The Confessions commentary reference sidebar: results of the last BoC section click,
 *  grouped by source. The Bible-side twin of this is `CommentaryPanel`; both render through
 *  `CommentaryPanelView`. */
export function BocCommentaryPanel() {
  const lookup = useStore((s) => s.bocLookup)
  const matches = useStore((s) => s.bocMatches)
  const addBocCommentaryQuote = useStore((s) => s.addBocCommentaryQuote)

  const groups: CommentaryGroupVM[] = groupBocMatchesBySource(matches).map((g) => ({
    sourceId: g.sourceId,
    sourceDisplayName: g.sourceDisplayName,
    sourceAuthor: g.sourceAuthor,
    excerpts: g.matches.map((m) => ({
      excerptId: m.excerptId,
      text: m.text,
      rangeLabel: bocSectionRangeLabel(m),
      // No onViewInPdf: BoC commentary is markdown-sourced, so there's no page to jump to.
      onQuote: (text: string) => {
        if (!lookup) return
        return addBocCommentaryQuote({
          bocSourceId: m.sourceId,
          documentCode: lookup.documentCode,
          sectionOrdinal: lookup.ordinal,
          sectionNumber: lookup.sectionNumber,
          sectionLabel: lookup.sectionLabel,
          // The lookup unit is the section; a commentary excerpt isn't tied to one paragraph.
          paragraph: null,
          text
        })
      }
    }))
  }))

  const headLabel = lookup
    ? `${bocDocument(lookup.documentCode)?.abbreviation ?? lookup.documentCode} ${bocSectionLabel({
        number: lookup.sectionNumber,
        label: lookup.sectionLabel
      })}`.trim()
    : null

  return (
    <CommentaryPanelView
      headLabel={headLabel}
      groups={groups}
      noLookupHint="Click a section to see commentary."
      emptyHint="No commentary indexed for this section."
    />
  )
}
