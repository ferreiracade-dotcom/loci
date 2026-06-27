import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { api } from '../../lib/api'
import { useStore } from '../../store/useStore'
import { bookByCode, bookByOrder } from '@shared/scriptureRef'
import type { ScripturePassage, ScriptureTranslation } from '@shared/ipc'
import { ScriptureAudio } from './ScriptureAudio'

interface Props {
  translation: string
  book: string
  chapter: number
  highlight: number[]
  /** Navigate the reader (prev/next chapter, or a verse jump). */
  onNavigate: (book: string, chapter: number, highlight?: number[]) => void
  /** When provided, the header shows a translation switcher (used when the nav is hidden). */
  translations?: ScriptureTranslation[]
  onTranslationChange?: (id: string) => void
  /** Slim header for the split pane beside a note. */
  compact?: boolean
}

interface Adjacent {
  book: string
  chapter: number
}

// Highlight palette (public-domain translations only). Tints layer over the page.
const HL_COLORS: { name: string; tint: string }[] = [
  { name: 'amber', tint: 'rgba(232, 182, 86, 0.34)' },
  { name: 'emerald', tint: 'rgba(110, 200, 150, 0.30)' },
  { name: 'sky', tint: 'rgba(120, 180, 240, 0.30)' },
  { name: 'rose', tint: 'rgba(240, 140, 165, 0.30)' },
  { name: 'violet', tint: 'rgba(186, 150, 236, 0.32)' }
]
const tintOf = (name: string): string => HL_COLORS.find((c) => c.name === name)?.tint ?? HL_COLORS[0].tint

interface HlSel {
  start: number
  end: number
  x: number
  y: number
}

function prevChapter(book: string, chapter: number): Adjacent | null {
  if (chapter > 1) return { book, chapter: chapter - 1 }
  const def = bookByCode(book)
  if (!def) return null
  const prev = bookByOrder(def.order - 1)
  return prev ? { book: prev.code, chapter: prev.chapters } : null
}

function nextChapter(book: string, chapter: number): Adjacent | null {
  const def = bookByCode(book)
  if (!def) return null
  if (chapter < def.chapters) return { book, chapter: chapter + 1 }
  const next = bookByOrder(def.order + 1)
  return next ? { book: next.code, chapter: 1 } : null
}

export function ScriptureReader({
  translation,
  book,
  chapter,
  highlight,
  onNavigate,
  translations,
  onTranslationChange,
  compact = false
}: Props) {
  const [passage, setPassage] = useState<ScripturePassage | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [quoted, setQuoted] = useState<Map<number, string>>(new Map())
  const [hlSel, setHlSel] = useState<HlSel | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const addScriptureHighlight = useStore((s) => s.addScriptureHighlight)

  // Highlighting is allowed only on public-domain providers (their text is licence-safe
  // to store); copyrighted translations show no popover and no saved marks.
  const canHighlight = translations?.find((t) => t.id === translation)?.provider === 'free-use'

  useEffect(() => {
    if (!translation) return
    let alive = true
    setLoading(true)
    setError(null)
    void api
      .getScriptureChapter(translation, book, chapter)
      .then((p) => {
        if (!alive) return
        setPassage(p)
        setLoading(false)
        if (!p) setError('Could not load this chapter.')
      })
      .catch(() => {
        if (!alive) return
        setLoading(false)
        setError('Could not load this chapter.')
      })
    return () => {
      alive = false
    }
  }, [translation, book, chapter])

  // Scroll the first highlighted verse into view once the chapter renders.
  useEffect(() => {
    if (!passage || highlight.length === 0) {
      scrollRef.current?.scrollTo({ top: 0 })
      return
    }
    const el = scrollRef.current?.querySelector('.sv.hl')
    el?.scrollIntoView({ block: 'center' })
  }, [passage, highlight])

  // Load existing highlights for this chapter (and dismiss any open popover).
  const refreshQuoted = useCallback(async () => {
    if (!canHighlight) {
      setQuoted(new Map())
      return
    }
    try {
      const list = await api.listScriptureHighlights(translation, book, chapter)
      const m = new Map<number, string>()
      for (const h of list) for (let v = h.verseStart; v <= h.verseEnd; v++) m.set(v, h.color)
      setQuoted(m)
    } catch {
      setQuoted(new Map())
    }
  }, [canHighlight, translation, book, chapter])

  useEffect(() => {
    setHlSel(null)
    void refreshQuoted()
  }, [refreshQuoted, passage])

  const verseOf = (node: Node | null): number | null => {
    const el = node && node.nodeType === 1 ? (node as Element) : (node?.parentElement ?? null)
    const sv = el?.closest?.('.sv') as HTMLElement | null
    const n = sv?.getAttribute('data-verse')
    return n ? Number(n) : null
  }

  const onBodyMouseUp = (e: React.MouseEvent): void => {
    if (!canHighlight) return
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
    const a = verseOf(range.startContainer)
    const b = verseOf(range.endContainer)
    if (a == null || b == null) {
      setHlSel(null)
      return
    }
    const rect = range.getBoundingClientRect()
    const host = body.getBoundingClientRect()
    setHlSel({
      start: Math.min(a, b),
      end: Math.max(a, b),
      x: rect.left - host.left + body.scrollLeft + rect.width / 2,
      y: rect.bottom - host.top + body.scrollTop + 6
    })
  }

  const pickColor = async (color: string): Promise<void> => {
    if (!hlSel || !passage) return
    const text = passage.verses
      .filter((v) => v.verse >= hlSel.start && v.verse <= hlSel.end)
      .map((v) => v.text)
      .join(' ')
    await addScriptureHighlight({
      translation,
      book,
      chapter,
      verseStart: hlSel.start,
      verseEnd: hlSel.end !== hlSel.start ? hlSel.end : undefined,
      text,
      color
    })
    window.getSelection()?.removeAllRanges()
    setHlSel(null)
    void refreshQuoted()
  }

  const prev = prevChapter(book, chapter)
  const next = nextChapter(book, chapter)
  const title = passage ? passage.reference : `${bookByCode(book)?.name ?? book} ${chapter}`
  const hl = new Set(highlight)

  return (
    <div className={`scripture-reader${compact ? ' compact' : ''}`}>
      <div className="sr-head">
        <button
          className="icon-btn"
          title="Previous chapter"
          disabled={!prev}
          onClick={() => prev && onNavigate(prev.book, prev.chapter)}
        >
          <ChevronLeft size={16} />
        </button>
        <span className="sr-title">{title}</span>
        {translations && translations.length > 1 && onTranslationChange ? (
          <select
            className="sr-translation"
            title="Translation"
            value={translation}
            onChange={(e) => onTranslationChange(e.target.value)}
          >
            {translations.map((t) => (
              <option key={t.id} value={t.id}>
                {t.abbr}
              </option>
            ))}
          </select>
        ) : (
          <span className="sr-abbr">{passage?.translation ?? translation}</span>
        )}
        <button
          className="icon-btn"
          title="Next chapter"
          disabled={!next}
          onClick={() => next && onNavigate(next.book, next.chapter)}
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {passage?.audio && passage.audio.length > 0 && (
        <ScriptureAudio key={`${book}:${chapter}`} tracks={passage.audio} />
      )}

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
        ) : passage ? (
          <>
            <div className="sr-text">
              {passage.verses.map((v) => {
                const q = quoted.get(v.verse)
                return (
                  <span
                    key={v.verse}
                    data-verse={v.verse}
                    className={`sv${hl.has(v.verse) ? ' hl' : ''}${q ? ' sv-quoted' : ''}`}
                    style={q ? { background: tintOf(q) } : undefined}
                  >
                    <span className="sv-num">{v.verse}</span>
                    {v.text}{' '}
                  </span>
                )
              })}
            </div>
            {passage.copyright && <div className="sr-copyright">{passage.copyright}</div>}
          </>
        ) : null}

        {hlSel && canHighlight && (
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
                onClick={() => void pickColor(c.name)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
