import { useEffect, useMemo, useState } from 'react'
import { Search, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { api } from '../../lib/api'
import { BOOKS, parseReference } from '@shared/scriptureRef'
import { ScriptureReader } from './ScriptureReader'

export function ScriptureView() {
  const translations = useStore((s) => s.scriptureTranslations)
  const translation = useStore((s) => s.scriptureTranslation)
  const passage = useStore((s) => s.scripturePassage)
  const loadScripture = useStore((s) => s.loadScripture)
  const setTranslation = useStore((s) => s.setScriptureTranslation)
  const navigate = useStore((s) => s.navigateScripture)

  const [refInput, setRefInput] = useState('')
  const [refError, setRefError] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [navCollapsed, setNavCollapsed] = useState(false)

  // Load translations + restore the last passage on first mount.
  useEffect(() => {
    if (translations.length === 0 || !passage) void loadScripture()
  }, [translations.length, passage, loadScripture])

  // Restore the nav collapse state.
  useEffect(() => {
    void api.getSession('scriptureNavCollapsed').then((v) => setNavCollapsed(v === '1'))
  }, [])

  const toggleNav = (next: boolean): void => {
    setNavCollapsed(next)
    void api.setSession('scriptureNavCollapsed', next ? '1' : '')
  }

  // Keep the expanded book in sync with the open passage.
  useEffect(() => {
    if (passage) setExpanded(passage.book)
  }, [passage])

  const ot = useMemo(() => BOOKS.filter((b) => b.testament === 'OT'), [])
  const nt = useMemo(() => BOOKS.filter((b) => b.testament === 'NT'), [])

  const goToRef = (e: React.FormEvent): void => {
    e.preventDefault()
    const ref = parseReference(refInput)
    if (!ref) {
      setRefError(true)
      return
    }
    setRefError(false)
    const start = ref.verseStart
    const highlight =
      start != null
        ? Array.from({ length: (ref.verseEnd ?? start) - start + 1 }, (_, i) => start + i)
        : []
    navigate(ref.book, ref.chapter, highlight)
    setRefInput('')
  }

  const bookList = (label: string, books: typeof BOOKS): React.ReactNode => (
    <div className="sv-testament">
      <div className="sv-testament-head">{label}</div>
      {books.map((b) => (
        <div key={b.code} className="sv-book-wrap">
          <button
            className={`sv-book${passage?.book === b.code ? ' active' : ''}`}
            onClick={() => setExpanded(expanded === b.code ? null : b.code)}
          >
            {b.name}
          </button>
          {expanded === b.code && (
            <div className="sv-chapters">
              {Array.from({ length: b.chapters }, (_, i) => i + 1).map((ch) => (
                <button
                  key={ch}
                  className={`sv-chap${
                    passage?.book === b.code && passage?.chapter === ch ? ' active' : ''
                  }`}
                  onClick={() => navigate(b.code, ch)}
                >
                  {ch}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )

  return (
    <div className="scripture-view">
      {navCollapsed ? (
        <div className="sv-nav-rail">
          <button className="rail-btn" title="Show books" onClick={() => toggleNav(false)}>
            <PanelLeftOpen size={16} />
          </button>
        </div>
      ) : (
        <div className="sv-nav">
          <div className="sv-nav-top">
            <div className="sv-nav-bar">
              <span className="sv-nav-title">Bible</span>
              <button className="icon-btn" title="Hide books" onClick={() => toggleNav(true)}>
                <PanelLeftClose size={15} />
              </button>
            </div>
            <select
              className="sv-translation"
              value={translation}
              onChange={(e) => setTranslation(e.target.value)}
            >
              {translations.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.abbr} — {t.name}
                </option>
              ))}
            </select>
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
          </div>
          <div className="sv-books">
            {bookList('Old Testament', ot)}
            {bookList('New Testament', nt)}
          </div>
        </div>
      )}

      <div className="sv-main">
        {passage && translation ? (
          <ScriptureReader
            translation={translation}
            book={passage.book}
            chapter={passage.chapter}
            highlight={passage.highlight}
            onNavigate={navigate}
            translations={translations}
            onTranslationChange={setTranslation}
          />
        ) : (
          <div className="sr-loading">Loading Bible…</div>
        )}
      </div>
    </div>
  )
}
