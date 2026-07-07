import { useRef, useState } from 'react'
import { ChevronDown, ChevronRight, ExternalLink, Copy, Check, Quote } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { api } from '../../lib/api'
import { bookByCode } from '@shared/scriptureRef'
import type { CommentaryMatch } from '@shared/ipc'
import { excerptRangeLabel, groupMatchesBySource, shouldCollapseByDefault } from '../../lib/commentaryGrouping'

/** Excerpts longer than this are clamped with a "Show more" toggle (~4 lines of prose). */
const CLAMP_LENGTH = 320

/** One commentary excerpt with its copy / quote / view-in-PDF actions. */
function CommentaryExcerpt({
  m,
  lookup
}: {
  m: CommentaryMatch
  lookup: { book: string; chapter: number; verse: number }
}) {
  const openBookAt = useStore((s) => s.openBookAt)
  const bumpReload = useStore((s) => s.bumpReload)
  const textRef = useRef<HTMLDivElement>(null)
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)
  const [added, setAdded] = useState(false)

  const clampable = m.text.length > CLAMP_LENGTH

  /** The user's selection if it falls inside this excerpt's text, else the whole excerpt. */
  const quotableText = (): string => {
    const sel = window.getSelection()
    if (sel && !sel.isCollapsed && sel.rangeCount > 0 && textRef.current) {
      const range = sel.getRangeAt(0)
      if (textRef.current.contains(range.commonAncestorContainer)) {
        const picked = sel.toString().trim()
        if (picked) return picked
      }
    }
    return m.text
  }

  const copy = (): void => {
    void navigator.clipboard.writeText(quotableText()).then(() => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    })
  }

  const addQuote = (): void => {
    const text = quotableText()
    void api
      .addCommentaryQuote({
        sourceId: m.sourceId,
        book: lookup.book,
        chapter: lookup.chapter,
        verseStart: lookup.verse,
        text
      })
      .then(() => {
        bumpReload()
        setAdded(true)
        window.setTimeout(() => setAdded(false), 1400)
      })
  }

  return (
    <div className="commentary-excerpt">
      <div className="commentary-excerpt-ref">{excerptRangeLabel(m)}</div>
      <div ref={textRef} className={`commentary-excerpt-text${clampable && !expanded ? ' clamped' : ''}`}>
        {m.text}
      </div>
      {clampable && (
        <button className="commentary-excerpt-toggle" onClick={() => setExpanded((v) => !v)}>
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
      <div className="commentary-excerpt-actions">
        <button
          className="commentary-excerpt-act"
          title="Add as a quote (select text first to quote just part of it)"
          onClick={addQuote}
        >
          {added ? <Check size={12} /> : <Quote size={12} />} Add quote
        </button>
        <button
          className="commentary-excerpt-act"
          title="Copy (select text first to copy just part of it)"
          onClick={copy}
        >
          {copied ? <Check size={12} /> : <Copy size={12} />} Copy
        </button>
        {/* Only PDF-sourced excerpts have a book + page to jump to. Markdown sources (EPUB/
            scraped commentary) carry the full verse comment inline, so there's nothing to open. */}
        {m.bookId && m.pageNumber > 0 && (
          <button
            className="commentary-excerpt-act commentary-view-pdf"
            title="View in PDF"
            onClick={() => openBookAt(m.bookId!, m.pageNumber)}
          >
            <ExternalLink size={12} /> View in PDF
          </button>
        )}
      </div>
    </div>
  )
}

/** The commentary reference sidebar: results of the last verse click, grouped by source. */
export function CommentaryPanel() {
  const lookup = useStore((s) => s.commentaryLookup)
  const matches = useStore((s) => s.commentaryMatches)

  const groups = groupMatchesBySource(matches)
  const defaultCollapsed = shouldCollapseByDefault(groups.length)
  const [collapsedOverride, setCollapsedOverride] = useState<Map<string, boolean>>(new Map())

  const isCollapsed = (sourceId: string): boolean => collapsedOverride.get(sourceId) ?? defaultCollapsed
  const toggleSource = (sourceId: string): void => {
    setCollapsedOverride((prev) => {
      const next = new Map(prev)
      next.set(sourceId, !isCollapsed(sourceId))
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
                {g.matches.map((m) => (
                  <CommentaryExcerpt key={m.excerptId} m={m} lookup={lookup} />
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
