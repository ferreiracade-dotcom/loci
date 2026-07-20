import { useRef, useState } from 'react'
import { ChevronDown, ChevronRight, ExternalLink, Copy, Check, Quote } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { api } from '../../lib/api'
import { bookByCode } from '@shared/scriptureRef'
import { excerptRangeLabel, groupMatchesBySource, shouldCollapseByDefault } from '../../lib/commentaryGrouping'

/** Excerpts longer than this are clamped with a "Show more" toggle (~4 lines of prose). */
const CLAMP_LENGTH = 320

/** One excerpt as the view renders it, independent of which corpus it came from. `onQuote`
 *  receives the text the user actually wants quoted (their selection, or the whole excerpt) —
 *  the view resolves that; the wrapper only decides where the quote is written. */
export interface CommentaryExcerptVM {
  excerptId: string
  text: string
  rangeLabel: string
  onQuote: (text: string) => void | Promise<void>
  onViewInPdf?: () => void
}

export interface CommentaryGroupVM {
  sourceId: string
  sourceDisplayName: string
  sourceAuthor: string | null
  excerpts: CommentaryExcerptVM[]
}

/** One commentary excerpt with its copy / quote / view-in-PDF actions. */
function CommentaryExcerpt({ e }: { e: CommentaryExcerptVM }) {
  const textRef = useRef<HTMLDivElement>(null)
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)
  const [added, setAdded] = useState(false)

  const clampable = e.text.length > CLAMP_LENGTH

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
    return e.text
  }

  const copy = (): void => {
    void navigator.clipboard.writeText(quotableText()).then(() => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    })
  }

  const addQuote = (): void => {
    const confirm = (): void => {
      setAdded(true)
      window.setTimeout(() => setAdded(false), 1400)
    }
    // Flash the ✓ only once the write lands, as the pre-refactor panel did.
    const result = e.onQuote(quotableText())
    if (result instanceof Promise) void result.then(confirm)
    else confirm()
  }

  return (
    <div className="commentary-excerpt">
      <div className="commentary-excerpt-ref">{e.rangeLabel}</div>
      <div ref={textRef} className={`commentary-excerpt-text${clampable && !expanded ? ' clamped' : ''}`}>
        {e.text}
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
            scraped commentary) carry the full comment inline, so there's nothing to open. */}
        {e.onViewInPdf && (
          <button className="commentary-excerpt-act commentary-view-pdf" title="View in PDF" onClick={e.onViewInPdf}>
            <ExternalLink size={12} /> View in PDF
          </button>
        )}
      </div>
    </div>
  )
}

/** The commentary sidebar's presentation: grouped excerpts with collapse state and the two
 *  empty states. Corpus-agnostic — Bible and Book of Concord each supply their own groups via
 *  a thin wrapper below / in BocCommentaryPanel. */
export function CommentaryPanelView({
  headLabel,
  groups,
  noLookupHint,
  emptyHint
}: {
  /** null before anything has been clicked — renders `noLookupHint`. */
  headLabel: string | null
  groups: CommentaryGroupVM[]
  noLookupHint: string
  emptyHint: string
}) {
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

  if (headLabel === null) {
    return <div className="commentary-panel-empty">{noLookupHint}</div>
  }
  if (groups.length === 0) {
    return <div className="commentary-panel-empty">{emptyHint}</div>
  }

  return (
    <div className="commentary-panel">
      <div className="commentary-panel-head">{headLabel}</div>
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
                {g.excerpts.map((e) => (
                  <CommentaryExcerpt key={e.excerptId} e={e} />
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

/** The Bible commentary reference sidebar: results of the last verse click, grouped by source. */
export function CommentaryPanel() {
  const lookup = useStore((s) => s.commentaryLookup)
  const matches = useStore((s) => s.commentaryMatches)
  const openBookAt = useStore((s) => s.openBookAt)
  const bumpReload = useStore((s) => s.bumpReload)

  const groups: CommentaryGroupVM[] = groupMatchesBySource(matches).map((g) => ({
    sourceId: g.sourceId,
    sourceDisplayName: g.sourceDisplayName,
    sourceAuthor: g.sourceAuthor,
    excerpts: g.matches.map((m) => ({
      excerptId: m.excerptId,
      text: m.text,
      rangeLabel: excerptRangeLabel(m),
      onQuote: (text: string) => {
        if (!lookup) return
        return api
          .addCommentaryQuote({
            sourceId: m.sourceId,
            book: lookup.book,
            chapter: lookup.chapter,
            verseStart: lookup.verse,
            text
          })
          .then(bumpReload)
      },
      onViewInPdf:
        m.bookId && m.pageNumber > 0 ? () => openBookAt(m.bookId!, m.pageNumber) : undefined
    }))
  }))

  const headLabel = lookup
    ? `${bookByCode(lookup.book)?.name ?? lookup.book} ${lookup.chapter}:${lookup.verse}`
    : null

  return (
    <CommentaryPanelView
      headLabel={headLabel}
      groups={groups}
      noLookupHint="Click a verse to see commentary."
      emptyHint="No commentary indexed for this verse."
    />
  )
}
