import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { api } from '../../lib/api'
import { passageFromOsis } from '../../lib/fathersReaderUtils'
import { FATHERS_SERIES_LABEL } from '@shared/fathers'
import type { FathersNote, FathersSection } from '@shared/ipc'

export interface FathersQuoteCapture {
  text: string
  /** Printed page the selection starts on ('415', 'xiv'), if known. */
  page: string | null
  /** 1-based index of the paragraph the selection starts in, if any. */
  paragraph: number | null
  color: string
}

interface Props {
  volumeCode: string
  sectionId: string
  /** Navigate to another section of the same volume (prev/next). */
  onNavigate: (sectionId: string) => void
  /** A scripture link was clicked: show this passage in the Texts panel. */
  onPassage: (book: string, chapter: number, highlight: number[]) => void
  /** When provided, selecting text offers the colour picker and reports the capture. */
  onQuote?: (capture: FathersQuoteCapture) => void
  /** When provided, the author in the breadcrumb is a link to their page. */
  onAuthor?: (authorId: string) => void
  /** Slim header for the split pane beside a note. */
  compact?: boolean
}

// Highlight palette — mirrors BocReader / ScriptureReader. The Fathers text is the user's own
// public-domain file, so highlighting is always on.
const HL_COLORS: { name: string; tint: string }[] = [
  { name: 'amber', tint: 'rgba(232, 182, 86, 0.34)' },
  { name: 'emerald', tint: 'rgba(110, 200, 150, 0.30)' },
  { name: 'sky', tint: 'rgba(120, 180, 240, 0.30)' },
  { name: 'rose', tint: 'rgba(240, 140, 165, 0.30)' },
  { name: 'violet', tint: 'rgba(186, 150, 236, 0.32)' }
]

interface HlSel {
  text: string
  page: string | null
  paragraph: number | null
  x: number
  y: number
}

/** The printed page in force at the range point (`container`, `offset`): the last page-break marker
 *  before that point, else the page the section started on. Page breaks are empty
 *  `span.pb[data-page]` elements in the section HTML. The point may be a text node or an element
 *  (a triple-click or margin drag starts on the <p> or root div), so the offset is honoured. */
function pageForPoint(
  root: HTMLElement,
  container: Node,
  offset: number,
  startPage: string | null
): string | null {
  const start = document.createRange()
  start.setStart(container, offset)
  let page = startPage
  for (const pb of Array.from(root.querySelectorAll<HTMLElement>('span.pb'))) {
    // comparePoint is -1 when the marker sits before the start point.
    if (start.comparePoint(pb, 0) === -1) page = pb.dataset.page ?? page
    else break
  }
  return page
}

/** 1-based index of the paragraph containing `node` among the section's paragraphs, or null. */
function paragraphForNode(root: HTMLElement, node: Node): number | null {
  const el = node.nodeType === 1 ? (node as Element) : node.parentElement
  const p = el?.closest('p')
  if (!p || !root.contains(p)) return null
  return Array.from(root.querySelectorAll('p')).indexOf(p) + 1
}

/** One Church Fathers section: breadcrumb, sanitized HTML, footnote popovers, scripture links,
 *  printed-page margin labels and selection-to-quote. The HTML is built by the ThML parser from
 *  an allow-list of tags (see thml.ts), so it is safe to inject. */
export function FathersReader({
  volumeCode,
  sectionId,
  onNavigate,
  onPassage,
  onQuote,
  onAuthor,
  compact = false
}: Props) {
  const [section, setSection] = useState<FathersSection | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pop, setPop] = useState<{ note: FathersNote; x: number; y: number } | null>(null)
  const [hlSel, setHlSel] = useState<HlSel | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const textRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)
    void api
      .getFathersSection(volumeCode, sectionId)
      .then((s) => {
        if (!alive) return
        setSection(s)
        setLoading(false)
        if (!s) {
          // Drop the previous section so its header, notes and prev/next are not shown beside the error.
          setSection(null)
          setError('Could not load this section.')
        }
      })
      .catch(() => {
        if (!alive) return
        setSection(null)
        setLoading(false)
        setError('Could not load this section.')
      })
    return () => {
      alive = false
    }
  }, [volumeCode, sectionId])

  useEffect(() => {
    setPop(null)
    setHlSel(null)
    scrollRef.current?.scrollTo({ top: 0 })
  }, [section])

  /** Click handling shared by the section body and the footnote popover: scripture links open the
   *  passage in the Texts panel; footnote markers open the popover. Returns true if it handled it. */
  const handleClick = (e: React.MouseEvent): boolean => {
    const target = e.target as Element
    const link = target.closest?.('a.scripref') as HTMLElement | null
    if (link) {
      e.preventDefault()
      const p = passageFromOsis(link.dataset.osis ?? '')
      if (p) onPassage(p.book, p.chapter, p.highlight)
      return true
    }
    const fn = target.closest?.('sup.fn') as HTMLElement | null
    const body = scrollRef.current
    if (fn && section && body) {
      const note = section.notes.find((n) => n.anchor === fn.dataset.note)
      if (note) {
        const r = fn.getBoundingClientRect()
        const host = body.getBoundingClientRect()
        setPop({ note, x: r.left - host.left + body.scrollLeft, y: r.bottom - host.top + body.scrollTop + 6 })
      }
      return true
    }
    return false
  }

  const onTextClick = (e: React.MouseEvent): void => {
    // A drag-to-select leaves a non-collapsed selection; that is a highlight, not a click.
    if (window.getSelection()?.isCollapsed === false) return
    if (!handleClick(e)) setPop(null)
  }

  const onBodyMouseUp = (e: React.MouseEvent): void => {
    if (!onQuote) return
    const t = e.target as Element
    if (t.closest?.('.scripture-hl-pop') || t.closest?.('.fathers-note-pop')) return
    const sel = window.getSelection()
    const body = scrollRef.current
    const text = textRef.current
    if (!sel || sel.isCollapsed || sel.rangeCount === 0 || !body || !text || !section) {
      setHlSel(null)
      return
    }
    const range = sel.getRangeAt(0)
    if (!text.contains(range.commonAncestorContainer)) {
      setHlSel(null)
      return
    }
    const picked = sel.toString().trim()
    if (!picked) {
      setHlSel(null)
      return
    }
    const rect = range.getBoundingClientRect()
    const host = body.getBoundingClientRect()
    setHlSel({
      text: picked,
      page: pageForPoint(text, range.startContainer, range.startOffset, section.startPage),
      paragraph: paragraphForNode(text, range.startContainer),
      x: rect.left - host.left + body.scrollLeft + rect.width / 2,
      y: rect.bottom - host.top + body.scrollTop + 6
    })
  }

  const pickColor = (color: string): void => {
    if (!hlSel || !onQuote) return
    onQuote({ text: hlSel.text, page: hlSel.page, paragraph: hlSel.paragraph, color })
    window.getSelection()?.removeAllRanges()
    setHlSel(null)
  }

  const title = section ? section.shortTitle || section.titles[section.titles.length - 1] || section.id : ''
  const volLabel = section ? `${FATHERS_SERIES_LABEL[section.series]} ${section.volumeNumber}` : ''

  return (
    <div className={`scripture-reader fathers-reader${compact ? ' compact' : ''}`}>
      <div className="sr-head">
        <button
          className="icon-btn"
          title="Previous section"
          disabled={!section?.prevId}
          onClick={() => section?.prevId && onNavigate(section.prevId)}
        >
          <ChevronLeft size={16} />
        </button>
        <span className="sr-title">{title}</span>
        {section?.editorial && <span className="fathers-tag">Editor</span>}
        <span className="sr-abbr">
          {volLabel}
          {section?.startPage ? ` · p. ${section.startPage}` : ''}
        </span>
        <button
          className="icon-btn"
          title="Next section"
          disabled={!section?.nextId}
          onClick={() => section?.nextId && onNavigate(section.nextId)}
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {section && (
        <div className="fathers-crumbs">
          <span>{section.volumeTitle}</span>
          {section.authorName && (
            <>
              <span className="fathers-crumb-sep">›</span>
              {onAuthor && section.authorId ? (
                <button className="fathers-crumb-link" onClick={() => onAuthor(section.authorId as string)}>
                  {section.authorName}
                </button>
              ) : (
                <span>{section.authorName}</span>
              )}
            </>
          )}
          {section.workTitle && (
            <>
              <span className="fathers-crumb-sep">›</span>
              <span>{section.workTitle}</span>
            </>
          )}
        </div>
      )}

      <div
        className="sr-body"
        ref={scrollRef}
        onMouseUp={onBodyMouseUp}
        onMouseDown={(e) => {
          if (!(e.target as Element).closest?.('.fathers-note-pop')) setHlSel(null)
        }}
      >
        {loading ? (
          <div className="sr-loading">
            <Loader2 size={18} className="spin" /> Loading…
          </div>
        ) : error ? (
          <div className="sr-error">{error}</div>
        ) : section ? (
          <div
            ref={textRef}
            className="sr-text fathers-text"
            onClick={onTextClick}
            dangerouslySetInnerHTML={{ __html: section.html }}
          />
        ) : null}

        {pop && (
          <div
            className="fathers-note-pop"
            style={{ left: Math.max(8, pop.x - 12), top: pop.y }}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              handleClick(e)
              e.stopPropagation()
            }}
          >
            <button className="fathers-note-close" title="Close" onClick={() => setPop(null)}>
              ×
            </button>
            <div className="fathers-note-n">Note {pop.note.n}</div>
            <div dangerouslySetInnerHTML={{ __html: pop.note.html }} />
          </div>
        )}

        {hlSel && (
          <div
            className="scripture-hl-pop"
            style={{ left: hlSel.x, top: hlSel.y }}
            onMouseDown={(e) => {
              e.preventDefault()
              e.stopPropagation()
            }}
          >
            {HL_COLORS.map((c) => (
              <button
                key={c.name}
                className="shp-swatch"
                style={{ background: c.tint }}
                title={`Quote (${c.name})`}
                onClick={() => pickColor(c.name)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
