import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Search, Star } from 'lucide-react'
import { useStore, focusedTab } from '../../store/useStore'
import type { Bookmark, Tab } from '../../store/useStore'
import { tabContent } from '../../store/workspace'
import { findBookmark, isBookmarkable } from '../../store/bookmarks'
import { api } from '../../lib/api'
import { tabBreadcrumb, tabDef, tabLocationText, tabTitle } from './tabRegistry'
import type { TitleContext } from './tabRegistry'
import { buildSuggestions } from './omnibox'
import type { Suggestion } from './omnibox'
import { runOmniAction } from './openViews'

/** Ctrl+L (from the shortcut hook) asks the omnibox to take focus. */
export const FOCUS_OMNIBOX_EVENT = 'loci:focus-omnibox'
/** Ctrl+D asks the omnibox to toggle the ☆ for the focused tab. */
export const BOOKMARK_TAB_EVENT = 'loci:bookmark-tab'

const sectionCache = new Map<string, { number: string | null; label: string } | null>()

/** The focused Confessions tab's section number/label, for its breadcrumb ("AC › IV"). */
function useBocSection(tab: Tab | undefined): { number: string | null; label: string } | null {
  const code = tab?.kind === 'boc' ? tab.documentCode : undefined
  const ordinal = tab?.kind === 'boc' ? tab.sectionOrdinal : undefined
  const source = tab?.kind === 'boc' ? tab.bocSourceId : undefined
  const key = code && ordinal != null ? `${code}:${ordinal}:${source ?? ''}` : ''
  const [, bump] = useState(0)
  useEffect(() => {
    if (!key || sectionCache.has(key) || !code || ordinal == null) return
    let alive = true
    void (async () => {
      try {
        const sourceId = source || (await api.listBocSources())[0]?.id
        const row = sourceId ? await api.getBocSection(code, ordinal, sourceId) : null
        sectionCache.set(key, row ? { number: row.number, label: row.label } : null)
      } catch {
        sectionCache.set(key, null)
      }
      if (alive) bump((n) => n + 1)
    })()
    return () => {
      alive = false
    }
  }, [key, code, ordinal, source])
  return key ? (sectionCache.get(key) ?? null) : null
}

/**
 * The omnibox suggestion list for `text` (empty when blank), from the open tabs, bookmarks,
 * books and notes. Shared by the omnibox and the New Tab page's search box.
 */
export function useOmniSuggestions(text: string, current: Tab | undefined, searchFirst = false): Suggestion[] {
  const tabs = useStore((s) => s.tabs)
  const books = useStore((s) => s.books)
  const notes = useStore((s) => s.standaloneNotes)
  const bookmarks = useStore((s) => s.bookmarks)
  const translation = useStore((s) => s.scriptureTranslation)
  return useMemo(() => {
    if (!text.trim()) return []
    const ctx: TitleContext = { books, notes }
    return buildSuggestions(text, {
      tabs: tabs.map((t) => ({ id: t.id, kind: t.kind, title: tabTitle(t, ctx) })),
      currentTabId: current?.id ?? null,
      bookmarks: bookmarks.bookmarks,
      books,
      notes,
      translation: (current?.kind === 'bible' && current.translation) || translation
    }, { searchFirst })
  }, [text, tabs, current, bookmarks, books, notes, translation, searchFirst])
}

/**
 * Chrome's omnibox: a breadcrumb of the focused tab's location until it is clicked (or Ctrl+L),
 * then a text box with a suggestion list. Enter shows the pick in this tab (pushing its
 * history), Alt+Enter in a new tab, Esc puts the breadcrumb back. The ☆ inside toggles a
 * bookmark for the current location.
 */
export function Omnibox() {
  const tab = useStore((s) => focusedTab(s))
  const books = useStore((s) => s.books)
  const notes = useStore((s) => s.standaloneNotes)
  const bookmarks = useStore((s) => s.bookmarks)
  const toggleBookmark = useStore((s) => s.toggleBookmark)
  const setToast = useStore((s) => s.setToast)
  const bocSection = useBocSection(tab)

  const [editing, setEditing] = useState(false)
  const [text, setText] = useState('')
  const [typed, setTyped] = useState(false)
  const [sel, setSel] = useState(0)
  const [bubble, setBubble] = useState<{ bookmark: Bookmark; rect: DOMRect } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const starRef = useRef<HTMLButtonElement>(null)

  const ctx: TitleContext = useMemo(() => ({ books, notes, bocSection }), [books, notes, bocSection])
  const crumbs = tab ? tabBreadcrumb(tab, ctx) : []
  const locationText = tab ? tabLocationText(tab, ctx) : ''
  const location = tab ? tabContent(tab) : null
  const canStar = !!location && isBookmarkable(location)
  const starred = !!location && !!findBookmark(bookmarks, location)

  const suggestions = useOmniSuggestions(editing && typed ? text : '', tab)

  const begin = useCallback((): void => {
    setEditing(true)
    setTyped(false)
    setSel(0)
    setText(locationText)
  }, [locationText])

  // Select the whole location once the input exists (click, or Ctrl+L while already editing).
  useLayoutEffect(() => {
    if (editing && !typed) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing, typed])

  const end = (): void => {
    setEditing(false)
    setTyped(false)
    setText('')
  }

  const pick = (s: Suggestion | undefined, newTab: boolean): void => {
    end()
    inputRef.current?.blur()
    if (s) void runOmniAction(s.action, newTab)
  }

  const star = useCallback((): void => {
    const s = useStore.getState()
    const t = focusedTab(s)
    if (!t) return
    const loc = tabContent(t)
    if (!isBookmarkable(loc)) return
    const added = toggleBookmark(loc, tabLocationText(t, ctx) || tabTitle(t, ctx))
    if (added) {
      const rect = starRef.current?.getBoundingClientRect()
      if (rect) setBubble({ bookmark: added, rect })
    } else {
      setBubble(null)
      setToast('Bookmark removed')
    }
  }, [toggleBookmark, setToast, ctx])

  useEffect(() => {
    const onFocus = (): void => begin()
    const onStar = (): void => star()
    window.addEventListener(FOCUS_OMNIBOX_EVENT, onFocus)
    window.addEventListener(BOOKMARK_TAB_EVENT, onStar)
    return () => {
      window.removeEventListener(FOCUS_OMNIBOX_EVENT, onFocus)
      window.removeEventListener(BOOKMARK_TAB_EVENT, onStar)
    }
  }, [begin, star])

  // Switching tabs while editing drops the edit, as Chrome does.
  useEffect(() => {
    setEditing(false)
  }, [tab?.id])

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSel((i) => Math.min(i + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSel((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (!typed) {
        pick(undefined, false)
        return
      }
      pick(suggestions[sel] ?? suggestions[0], e.altKey)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      pick(undefined, false)
    }
  }

  const Icon = editing || !tab || tab.kind === 'newtab' ? Search : tabDef(tab.kind).icon

  return (
    <div
      className={`omnibox${editing ? ' focus' : ''}${editing && suggestions.length ? ' open' : ''}`}
      onMouseDown={(e) => {
        if (editing || (e.target as HTMLElement).closest('.omni-star')) return
        e.preventDefault()
        begin()
      }}
    >
      <Icon size={15} className="omni-icon" />
      {editing ? (
        <input
          ref={inputRef}
          className="omni-input"
          value={text}
          spellCheck={false}
          placeholder="Search Loci or type a reference"
          onChange={(e) => {
            setText(e.target.value)
            setTyped(true)
            setSel(0)
          }}
          onKeyDown={onKeyDown}
          onBlur={() => end()}
        />
      ) : (
        <div className="omni-crumb" title={crumbs.join(' › ')}>
          {crumbs.length === 0 ? (
            <span className="omni-dim">Search Loci or type a reference (rom 3:28, AC IV, justification)</span>
          ) : (
            crumbs.map((c, i) => (
              <span key={i} className={i < crumbs.length - 1 ? 'omni-dim' : undefined}>
                {i > 0 && <span className="omni-dim omni-sep"> › </span>}
                {c}
              </span>
            ))
          )}
        </div>
      )}
      {canStar && !editing && (
        <button
          ref={starRef}
          className={`ctb-btn omni-star${starred ? ' on' : ''}`}
          title={starred ? 'Edit bookmark for this tab (Ctrl+D)' : 'Bookmark this tab (Ctrl+D)'}
          onClick={star}
        >
          <Star size={16} />
        </button>
      )}
      {editing && suggestions.length > 0 && (
        <div className="omni-sugg" onMouseDown={(e) => e.preventDefault()}>
          {suggestions.map((s, i) => {
            const SIcon = s.icon === 'search' ? Search : tabDef(s.icon).icon
            return (
              <div
                key={i}
                className={`omni-row${i === sel ? ' sel' : ''}`}
                onMouseEnter={() => setSel(i)}
                onClick={(e) => pick(s, e.altKey)}
              >
                <SIcon size={15} className="omni-row-ic" />
                <span className="omni-row-label">{s.label}</span>
                {s.hint && <small>{s.hint}</small>}
              </div>
            )
          })}
        </div>
      )}
      {bubble && <BookmarkBubble bookmark={bubble.bookmark} rect={bubble.rect} onClose={() => setBubble(null)} />}
    </div>
  )
}

/** Chrome's "Bookmark added" bubble under the ☆: rename, or remove it again. */
function BookmarkBubble({ bookmark, rect, onClose }: { bookmark: Bookmark; rect: DOMRect; onClose: () => void }) {
  const renameBookmark = useStore((s) => s.renameBookmark)
  const removeBookmark = useStore((s) => s.removeBookmark)
  const [name, setName] = useState(bookmark.title)
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const done = useCallback((): void => {
    renameBookmark(bookmark.id, name)
    onClose()
  }, [renameBookmark, bookmark.id, name, onClose])

  useEffect(() => {
    const onDown = (e: MouseEvent): void => {
      if (!ref.current?.contains(e.target as Node)) done()
    }
    document.addEventListener('mousedown', onDown, true)
    return () => document.removeEventListener('mousedown', onDown, true)
  }, [done])

  return createPortal(
    <div
      ref={ref}
      className="bm-bubble"
      style={{ left: Math.max(8, Math.min(rect.right - 320, window.innerWidth - 330)), top: rect.bottom + 8 }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <h6>Bookmark added</h6>
      <label>
        Name
        <input
          ref={inputRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') done()
            if (e.key === 'Escape') {
              e.stopPropagation()
              onClose()
            }
          }}
        />
      </label>
      <div className="bm-bubble-btns">
        <button
          className="bm-btn"
          onClick={() => {
            removeBookmark(bookmark.id)
            onClose()
          }}
        >
          Remove
        </button>
        <button className="bm-btn primary" onClick={done}>
          Done
        </button>
      </div>
    </div>,
    document.body
  )
}
