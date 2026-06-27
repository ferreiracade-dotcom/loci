import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { api } from '../../lib/api'
import { bookByCode, bookByOrder } from '@shared/scriptureRef'
import type { ScripturePassage, ScriptureTranslation } from '@shared/ipc'

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
  const scrollRef = useRef<HTMLDivElement>(null)

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

      <div className="sr-body" ref={scrollRef}>
        {loading ? (
          <div className="sr-loading">
            <Loader2 size={18} className="spin" /> Loading…
          </div>
        ) : error ? (
          <div className="sr-error">{error}</div>
        ) : passage ? (
          <>
            <div className="sr-text">
              {passage.verses.map((v) => (
                <span key={v.verse} className={`sv${hl.has(v.verse) ? ' hl' : ''}`}>
                  <span className="sv-num">{v.verse}</span>
                  {v.text}{' '}
                </span>
              ))}
            </div>
            {passage.copyright && <div className="sr-copyright">{passage.copyright}</div>}
          </>
        ) : null}
      </div>
    </div>
  )
}
