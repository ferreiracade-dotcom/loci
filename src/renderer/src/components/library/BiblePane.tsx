import { useEffect, useMemo, useState } from 'react'
import { Search, PanelLeftClose, PanelLeftOpen, Columns2, Replace } from 'lucide-react'
import { useStore } from '../../store/useStore'
import type { Tab } from '../../store/useStore'
import { api } from '../../lib/api'
import { BOOKS, parseReference } from '@shared/scriptureRef'
import { ScriptureReader } from './ScriptureReader'

/**
 * A Bible in a center workspace pane: the collapsible book-nav drawer (lifted from the old
 * full-center ScriptureView) plus the ScriptureReader. Navigation and translation changes
 * update *this* pane only; "Compare" opens a second Bible pane beside it.
 */
export function BiblePane({
  tab,
  onClose,
  onReplace
}: {
  tab: Tab
  onClose?: () => void
  onReplace?: () => void
}) {
  const translations = useStore((s) => s.scriptureTranslations)
  const defaultTranslation = useStore((s) => s.scriptureTranslation)
  const loadScripture = useStore((s) => s.loadScripture)
  const setTabContent = useStore((s) => s.setTabContent)
  const openTabInSplit = useStore((s) => s.openTabInSplit)
  const setScriptureTranslation = useStore((s) => s.setScriptureTranslation)
  const verseClicked = useStore((s) => s.verseClicked)

  const translation = tab.translation || defaultTranslation
  const book = tab.book ?? 'JHN'
  const chapter = tab.chapter ?? 1
  const highlight = tab.highlight ?? []

  const [refInput, setRefInput] = useState('')
  const [refError, setRefError] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(book)
  // Panes are narrower than the old full-center view, so default the drawer to its rail.
  const [navCollapsed, setNavCollapsed] = useState(true)

  // Make sure the translation registry is available (needed for the nav select + compare).
  useEffect(() => {
    if (translations.length === 0) void loadScripture()
  }, [translations.length, loadScripture])

  // Restore the drawer collapse state (shared across Bible panes).
  useEffect(() => {
    void api.getSession('bibleNavCollapsed').then((v) => setNavCollapsed(v !== '0'))
  }, [])

  // Keep the expanded book in sync with the pane's passage.
  useEffect(() => {
    setExpanded(book)
  }, [book])

  const toggleNav = (next: boolean): void => {
    setNavCollapsed(next)
    void api.setSession('bibleNavCollapsed', next ? '1' : '0')
  }

  const navigate = (b: string, c: number, hl: number[] = []): void => {
    setTabContent(tab.id, { kind: 'bible', book: b, chapter: c, highlight: hl, translation })
    void api.setSession('lastScripture', JSON.stringify({ book: b, chapter: c }))
  }

  const pickTranslation = (id: string): void => {
    setTabContent(tab.id, { kind: 'bible', book, chapter, highlight, translation: id })
    setScriptureTranslation(id)
  }

  // "Compare" = a second Bible tab beside this one, defaulted to another translation.
  const openCompare = (): void => {
    const other = translations.find((t) => t.id !== translation)?.id ?? translation
    openTabInSplit({ kind: 'bible', book, chapter, highlight, translation: other })
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

  const ot = useMemo(() => BOOKS.filter((b) => b.testament === 'OT'), [])
  const nt = useMemo(() => BOOKS.filter((b) => b.testament === 'NT'), [])
  const canCompare = translations.length > 1

  const bookList = (label: string, books: typeof BOOKS): React.ReactNode => (
    <div className="sv-testament">
      <div className="sv-testament-head">{label}</div>
      {books.map((b) => (
        <div key={b.code} className="sv-book-wrap">
          <button
            className={`sv-book${book === b.code ? ' active' : ''}`}
            onClick={() => setExpanded(expanded === b.code ? null : b.code)}
          >
            {b.name}
          </button>
          {expanded === b.code && (
            <div className="sv-chapters">
              {Array.from({ length: b.chapters }, (_, i) => i + 1).map((ch) => (
                <button
                  key={ch}
                  className={`sv-chap${book === b.code && chapter === ch ? ' active' : ''}`}
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
          {canCompare && (
            <button className="rail-btn" title="Compare translations" onClick={openCompare}>
              <Columns2 size={16} />
            </button>
          )}
          {onReplace && (
            <button className="rail-btn" title="Change content" onClick={onReplace}>
              <Replace size={16} />
            </button>
          )}
        </div>
      ) : (
        <div className="sv-nav">
          <div className="sv-nav-top">
            <div className="sv-nav-bar">
              <span className="sv-nav-title">Bible</span>
              {canCompare && (
                <button className="icon-btn" title="Compare translations" onClick={openCompare}>
                  <Columns2 size={15} />
                </button>
              )}
              {onReplace && (
                <button className="icon-btn" title="Change content" onClick={onReplace}>
                  <Replace size={15} />
                </button>
              )}
              <button className="icon-btn" title="Hide books" onClick={() => toggleNav(true)}>
                <PanelLeftClose size={15} />
              </button>
            </div>
            <select
              className="sv-translation"
              value={translation}
              onChange={(e) => pickTranslation(e.target.value)}
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
        {translation ? (
          <ScriptureReader
            translation={translation}
            book={book}
            chapter={chapter}
            highlight={highlight}
            onNavigate={navigate}
            onVerseClick={verseClicked}
            translations={translations}
            onTranslationChange={pickTranslation}
            compact
            onClose={onClose}
          />
        ) : (
          <div className="sr-loading">Loading Bible…</div>
        )}
      </div>
    </div>
  )
}
