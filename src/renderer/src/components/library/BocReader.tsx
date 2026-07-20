import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { api } from '../../lib/api'
import { bocDocument } from '@shared/bookOfConcord'
import type { BocSectionRow, BocSource } from '@shared/ipc'

interface Props {
  documentCode: string
  sectionOrdinal: number
  bocSourceId: string
  sources: BocSource[]
  /** Navigate the reader to another section ordinal (prev/next). */
  onNavigate: (ordinal: number) => void
  /** Fired when a paragraph is plain-clicked (not a drag-selection) — drives the commentary
   *  reference sidebar. The *section* is the lookup unit; which paragraph was clicked doesn't
   *  change the lookup. Omitted for preview-only instances. */
  onSectionClick?: (documentCode: string, ordinal: number) => void
  /** When provided, the header shows a source switcher (used when there's more than one). */
  onSourceChange?: (sourceId: string) => void
  /** Fired after a highlight colour is picked for a text selection. `paragraph` is the nearest
   *  `[N]` marker the selection starts in (null if the selection falls outside any marker, e.g.
   *  an unnumbered section). `color` is the swatch the user picked (mirrors the Scripture
   *  highlight flow); omit to let the write path default it. */
  onQuote?: (paragraph: number | null, text: string, color?: string) => void
  /** Slim header for the split pane beside a note. */
  compact?: boolean
}

// Highlight palette — mirrors ScriptureReader's HL_COLORS. BoC sources are the user's own local
// files (no copyright gate), so highlighting is always enabled here, unlike Scripture.
const HL_COLORS: { name: string; tint: string }[] = [
  { name: 'amber', tint: 'rgba(232, 182, 86, 0.34)' },
  { name: 'emerald', tint: 'rgba(110, 200, 150, 0.30)' },
  { name: 'sky', tint: 'rgba(120, 180, 240, 0.30)' },
  { name: 'rose', tint: 'rgba(240, 140, 165, 0.30)' },
  { name: 'violet', tint: 'rgba(186, 150, 236, 0.32)' }
]

interface HlSel {
  paragraph: number | null
  text: string
  x: number
  y: number
}

interface BocParagraph {
  /** The `[N]` marker this run of text follows; null for text before the first marker (or for
   *  sections with no markers at all, e.g. the ecumenical creeds). */
  paragraph: number | null
  text: string
}

// Section text carries inline `[N]` paragraph markers in a running prose block (not one marker
// per line). Split the text into paragraph-marker => following-text runs so each run can become
// its own clickable/citeable span.
const PARA_MARKER_RE = /\[(\d+)\]\s*/g

function splitBocParagraphs(text: string): BocParagraph[] {
  const out: BocParagraph[] = []
  let lastIndex = 0
  let lastPara: number | null = null
  PARA_MARKER_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = PARA_MARKER_RE.exec(text))) {
    if (m.index > lastIndex) out.push({ paragraph: lastPara, text: text.slice(lastIndex, m.index) })
    lastPara = Number(m[1])
    lastIndex = PARA_MARKER_RE.lastIndex
  }
  out.push({ paragraph: lastPara, text: text.slice(lastIndex) })
  return out.filter((p) => p.text.trim().length > 0)
}

export function BocReader({
  documentCode,
  sectionOrdinal,
  bocSourceId,
  sources,
  onNavigate,
  onSectionClick,
  onSourceChange,
  onQuote,
  compact = false
}: Props) {
  const [section, setSection] = useState<BocSectionRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Ordinals for the current document, in reading order — sections are a sparse subset of
  // integers (part/article headings carry no text and produce no row), so prev/next must step
  // to the adjacent entry in this list rather than assume ordinal ± 1 exists.
  const [ordinals, setOrdinals] = useState<number[]>([])
  const [hlSel, setHlSel] = useState<HlSel | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!documentCode || !bocSourceId) return
    let alive = true
    setLoading(true)
    setError(null)
    void api
      .getBocSection(documentCode, sectionOrdinal, bocSourceId)
      .then((s) => {
        if (!alive) return
        setSection(s)
        setLoading(false)
        if (!s) setError('Could not load this section.')
      })
      .catch(() => {
        if (!alive) return
        setLoading(false)
        setError('Could not load this section.')
      })
    return () => {
      alive = false
    }
  }, [documentCode, sectionOrdinal, bocSourceId])

  // The document's full ordinal list — used only to compute the adjacent prev/next ordinal.
  useEffect(() => {
    if (!documentCode || !bocSourceId) return
    let alive = true
    void api
      .listBocDocumentSections(documentCode, bocSourceId)
      .then((rows) => {
        if (alive) setOrdinals(rows.map((r) => r.ordinal))
      })
      .catch(() => {
        if (alive) setOrdinals([])
      })
    return () => {
      alive = false
    }
  }, [documentCode, bocSourceId])

  useEffect(() => {
    setHlSel(null)
    scrollRef.current?.scrollTo({ top: 0 })
  }, [section])

  const paragraphs = useMemo(() => (section ? splitBocParagraphs(section.text) : []), [section])

  const paraOf = (node: Node | null): number | null => {
    const el = node && node.nodeType === 1 ? (node as Element) : (node?.parentElement ?? null)
    const bp = el?.closest?.('.bp') as HTMLElement | null
    const n = bp?.getAttribute('data-para')
    return n ? Number(n) : null
  }

  const onBodyMouseUp = (e: React.MouseEvent): void => {
    if (!onQuote) return
    if ((e.target as Element).closest?.('.scripture-hl-pop')) return
    const sel = window.getSelection()
    const body = scrollRef.current
    if (!sel || sel.isCollapsed || sel.rangeCount === 0 || !body) {
      setHlSel(null)
      return
    }
    const range = sel.getRangeAt(0)
    if (!body.contains(range.commonAncestorContainer)) {
      setHlSel(null)
      return
    }
    const text = sel.toString().trim()
    if (!text) {
      setHlSel(null)
      return
    }
    const rect = range.getBoundingClientRect()
    const host = body.getBoundingClientRect()
    setHlSel({
      paragraph: paraOf(range.startContainer),
      text,
      x: rect.left - host.left + body.scrollLeft + rect.width / 2,
      y: rect.bottom - host.top + body.scrollTop + 6
    })
  }

  const pickColor = (color: string): void => {
    if (!hlSel || !onQuote) return
    onQuote(hlSel.paragraph, hlSel.text, color)
    window.getSelection()?.removeAllRanges()
    setHlSel(null)
  }

  const idx = ordinals.indexOf(sectionOrdinal)
  const prevOrdinal = idx > 0 ? ordinals[idx - 1] : null
  const nextOrdinal = idx >= 0 && idx < ordinals.length - 1 ? ordinals[idx + 1] : null

  const doc = bocDocument(documentCode)
  const docLabel = doc?.abbreviation ?? documentCode
  const title = section
    ? section.number
      ? `${docLabel} ${section.number} — ${section.label}`
      : `${docLabel}, ${section.label}`
    : (doc?.title ?? documentCode)
  const currentSource = sources.find((s) => s.id === bocSourceId)

  return (
    <div className={`scripture-reader${compact ? ' compact' : ''}`}>
      <div className="sr-head">
        <button
          className="icon-btn"
          title="Previous section"
          disabled={prevOrdinal == null}
          onClick={() => prevOrdinal != null && onNavigate(prevOrdinal)}
        >
          <ChevronLeft size={16} />
        </button>
        <span className="sr-title">{title}</span>
        {sources.length > 1 && onSourceChange ? (
          <select
            className="sr-translation"
            title="Source"
            value={bocSourceId}
            onChange={(e) => onSourceChange(e.target.value)}
          >
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.displayName}
              </option>
            ))}
          </select>
        ) : (
          <span className="sr-abbr">{currentSource?.displayName ?? ''}</span>
        )}
        <button
          className="icon-btn"
          title="Next section"
          disabled={nextOrdinal == null}
          onClick={() => nextOrdinal != null && onNavigate(nextOrdinal)}
        >
          <ChevronRight size={16} />
        </button>
      </div>

      <div
        className="sr-body"
        ref={scrollRef}
        onMouseUp={onBodyMouseUp}
        onMouseDown={() => setHlSel(null)}
      >
        {loading ? (
          <div className="sr-loading">
            <Loader2 size={18} className="spin" /> Loading…
          </div>
        ) : error ? (
          <div className="sr-error">{error}</div>
        ) : section && paragraphs.length > 0 ? (
          <div className="sr-text">
            {section.part && <div className="sr-abbr" style={{ marginBottom: 10 }}>{section.part}</div>}
            {paragraphs.map((p, i) => (
              <span
                key={`${p.paragraph ?? 'n'}-${i}`}
                data-para={p.paragraph ?? undefined}
                className="bp"
                onClick={() => {
                  // A drag-to-select leaves a non-collapsed selection at click time — skip firing
                  // the lookup so a highlight-selection doesn't also open the commentary sidebar.
                  if (window.getSelection()?.isCollapsed === false) return
                  onSectionClick?.(documentCode, sectionOrdinal)
                }}
              >
                {p.paragraph != null && <span className="sv-num">{p.paragraph}</span>}
                {p.text.split(/\n{2,}/).map((line, li, arr) => (
                  <span key={li}>
                    {line}
                    {li < arr.length - 1 && (
                      <>
                        <br />
                        <br />
                      </>
                    )}
                  </span>
                ))}{' '}
              </span>
            ))}
          </div>
        ) : section ? (
          <div className="sr-loading">No text for this section.</div>
        ) : null}

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
                title={`Highlight (${c.name})`}
                onClick={() => pickColor(c.name)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
