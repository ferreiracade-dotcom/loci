import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { api } from '../../lib/api'
import { parseReference } from '@shared/scriptureRef'
import { ScriptureReader } from './ScriptureReader'

/**
 * A live Bible in the reference panel — independent of the center Scripture view. Its own
 * translation + location, with a go-to box. Reuses ScriptureReader (audio + highlighting
 * included), so highlights captured here still auto-home to the per-book scripture note.
 */
export function ReferenceBiblePanel() {
  const translations = useStore((s) => s.scriptureTranslations)
  const defaultTranslation = useStore((s) => s.scriptureTranslation)
  const loadScripture = useStore((s) => s.loadScripture)

  const [translation, setTranslation] = useState(defaultTranslation)
  const [book, setBook] = useState('JHN')
  const [chapter, setChapter] = useState(1)
  const [highlight, setHighlight] = useState<number[]>([])
  const [refInput, setRefInput] = useState('')
  const [refError, setRefError] = useState(false)

  useEffect(() => {
    if (translations.length === 0) void loadScripture()
  }, [translations.length, loadScripture])

  // Default the translation once the registry loads; restore the last reference location.
  useEffect(() => {
    if (!translation && defaultTranslation) setTranslation(defaultTranslation)
  }, [defaultTranslation, translation])

  useEffect(() => {
    void api.getSession('refBibleLoc').then((v) => {
      if (!v) return
      try {
        const p = JSON.parse(v) as { book?: string; chapter?: number }
        if (p.book && p.chapter) {
          setBook(p.book)
          setChapter(p.chapter)
        }
      } catch {
        /* ignore */
      }
    })
    void api.getSession('refBibleTranslation').then((v) => {
      if (v) setTranslation(v)
    })
  }, [])

  const navigate = (b: string, c: number, hl: number[] = []): void => {
    setBook(b)
    setChapter(c)
    setHighlight(hl)
    void api.setSession('refBibleLoc', JSON.stringify({ book: b, chapter: c }))
  }

  const pickTranslation = (id: string): void => {
    setTranslation(id)
    void api.setSession('refBibleTranslation', id)
  }

  const goToRef = (e: React.FormEvent): void => {
    e.preventDefault()
    const ref = parseReference(refInput)
    if (!ref) {
      setRefError(true)
      return
    }
    setRefError(false)
    const start = ref.verseStart
    const hl =
      start != null
        ? Array.from({ length: (ref.verseEnd ?? start) - start + 1 }, (_, i) => start + i)
        : []
    navigate(ref.book, ref.chapter, hl)
    setRefInput('')
  }

  if (!translation) {
    return <div className="sr-loading">Loading Bible…</div>
  }

  return (
    <div className="ref-bible">
      <form className={`sv-goto${refError ? ' error' : ''}`} onSubmit={goToRef}>
        <Search size={14} className="sv-goto-icon" />
        <input
          value={refInput}
          placeholder="Go to reference (e.g. Rom 3:28)"
          onChange={(e) => {
            setRefInput(e.target.value)
            setRefError(false)
          }}
        />
      </form>
      <ScriptureReader
        translation={translation}
        book={book}
        chapter={chapter}
        highlight={highlight}
        onNavigate={navigate}
        translations={translations}
        onTranslationChange={pickTranslation}
        compact
      />
    </div>
  )
}
