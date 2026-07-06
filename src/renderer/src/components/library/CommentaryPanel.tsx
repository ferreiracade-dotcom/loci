import { useState } from 'react'
import { ChevronDown, ChevronRight, ExternalLink } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { bookByCode } from '@shared/scriptureRef'
import { excerptRangeLabel, groupMatchesBySource, shouldCollapseByDefault } from '../../lib/commentaryGrouping'

/** Excerpts longer than this are clamped with a "Show more" toggle (~4 lines of prose). */
const CLAMP_LENGTH = 320

/** The commentary reference sidebar: results of the last verse click, grouped by source. */
export function CommentaryPanel() {
  const lookup = useStore((s) => s.commentaryLookup)
  const matches = useStore((s) => s.commentaryMatches)
  const openBookAt = useStore((s) => s.openBookAt)

  const groups = groupMatchesBySource(matches)
  const defaultCollapsed = shouldCollapseByDefault(groups.length)
  const [collapsedOverride, setCollapsedOverride] = useState<Map<string, boolean>>(new Map())
  const [expandedExcerpts, setExpandedExcerpts] = useState<Set<string>>(new Set())

  const isCollapsed = (sourceId: string): boolean => collapsedOverride.get(sourceId) ?? defaultCollapsed
  const toggleSource = (sourceId: string): void => {
    setCollapsedOverride((prev) => {
      const next = new Map(prev)
      next.set(sourceId, !isCollapsed(sourceId))
      return next
    })
  }
  const toggleExcerpt = (excerptId: string): void => {
    setExpandedExcerpts((prev) => {
      const next = new Set(prev)
      if (next.has(excerptId)) next.delete(excerptId)
      else next.add(excerptId)
      return next
    })
  }

  if (!lookup) {
    return <div className="commentary-panel-empty">Click a verse to see commentary.</div>
  }
  if (groups.length === 0) {
    return <div className="commentary-panel-empty">No commentary indexed for this verse.</div>
  }

  const verseLabel = `${bookByCode(lookup.book)?.name ?? lookup.book} ${lookup.chapter}:${lookup.verse}`

  return (
    <div className="commentary-panel">
      <div className="commentary-panel-head">{verseLabel}</div>
      {groups.map((g) => {
        const collapsed = isCollapsed(g.sourceId)
        return (
          <div className="commentary-group" key={g.sourceId}>
            <button className="commentary-group-head" onClick={() => toggleSource(g.sourceId)}>
              {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
              <span className="commentary-source-name">{g.sourceDisplayName}</span>
              {g.sourceAuthor && <span className="commentary-source-author">{g.sourceAuthor}</span>}
            </button>
            {!collapsed && (
              <div className="commentary-group-body">
                {g.matches.map((m) => {
                  const expanded = expandedExcerpts.has(m.excerptId)
                  const clampable = m.text.length > CLAMP_LENGTH
                  return (
                    <div className="commentary-excerpt" key={m.excerptId}>
                      <div className="commentary-excerpt-ref">{excerptRangeLabel(m)}</div>
                      <div
                        className={`commentary-excerpt-text${clampable && !expanded ? ' clamped' : ''}`}
                      >
                        {m.text}
                      </div>
                      {clampable && (
                        <button className="commentary-excerpt-toggle" onClick={() => toggleExcerpt(m.excerptId)}>
                          {expanded ? 'Show less' : 'Show more'}
                        </button>
                      )}
                      <button
                        className="commentary-view-pdf"
                        disabled={!m.bookId}
                        title={m.bookId ? 'View in PDF' : "This source isn't linked to a library book"}
                        onClick={() => m.bookId && openBookAt(m.bookId, m.pageNumber)}
                      >
                        <ExternalLink size={12} /> View in PDF
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
