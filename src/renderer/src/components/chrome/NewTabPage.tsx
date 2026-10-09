import { useEffect, useMemo, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import { ChevronRight, Search } from 'lucide-react'
import { useStore, newTabDrafts } from '../../store/useStore'
import type { TabContent } from '../../store/useStore'
import { api } from '../../lib/api'
import { VaultOverview } from '../library/VaultOverview'
import { PopupMenu } from './PopupMenu'
import type { MenuEntry } from './PopupMenu'
import { useOmniSuggestions } from './Omnibox'
import type { Suggestion } from './omnibox'
import { tabDef } from './tabRegistry'
import { fixedViewContent, isBackgroundClick, openInBackground, runOmniAction } from './openViews'
import type { FixedView } from './openViews'
import { buildTiles, hideTile, parseHiddenTiles } from './newTabTiles'
import type { Tile, TileSections } from './newTabTiles'

const HIDDEN_KEY = 'ntpHiddenTiles'

/** The fixed views, so they stay reachable when the bookmarks bar is hidden. */
const SHORTCUTS: { view: FixedView; label: string; kind: 'bible' | 'boc' | 'fathers' | 'library' | 'notes' | 'quotesIndex' }[] = [
  { view: 'bible', label: 'Bible', kind: 'bible' },
  { view: 'confessions', label: 'Confessions', kind: 'boc' },
  { view: 'fathers', label: 'Fathers', kind: 'fathers' },
  { view: 'library', label: 'Library', kind: 'library' },
  { view: 'notes', label: 'Notes', kind: 'notes' },
  { view: 'quotesIndex', label: 'Quotes', kind: 'quotesIndex' }
]

/** A tile's content ready to open (a Bible tile takes the current translation). */
function withTranslation(c: TabContent): TabContent {
  if (c.kind !== 'bible' || c.translation) return c
  return { ...c, highlight: [], translation: useStore.getState().scriptureTranslation }
}

/** Show `content` in this tab (pushing its history, so Back returns to the New Tab page). */
function openHere(tabId: string, content: TabContent): void {
  const s = useStore.getState()
  newTabDrafts.delete(tabId)
  s.navigateTab(tabId, content)
  if (content.kind === 'bible') {
    void api.setSession('lastScripture', JSON.stringify({ book: content.book, chapter: content.chapter }))
    if (s.scriptureTranslations.length === 0) void s.loadScripture()
  }
}

/** Load the tile sections (history, last-read places and the removed-tiles list). */
function useTiles(): { sections: TileSections | null; remove: (key: string) => void } {
  const books = useStore((s) => s.books)
  const notes = useStore((s) => s.standaloneNotes)
  const [raw, setRaw] = useState<{
    history: Awaited<ReturnType<typeof api.listHistory>>
    lastBible: { book: string; chapter: number } | null
    lastBoc: { documentCode: string; ordinal: number } | null
    hidden: Record<string, number>
  } | null>(null)

  useEffect(() => {
    let alive = true
    const json = <T,>(v: string | null): T | null => {
      try {
        return v ? (JSON.parse(v) as T) : null
      } catch {
        return null
      }
    }
    void Promise.all([
      api.listHistory(400).catch(() => []),
      api.getSession('lastScripture').catch(() => null),
      api.getSession('lastBoc').catch(() => null),
      api.getSession(HIDDEN_KEY).catch(() => null)
    ]).then(([history, bible, boc, hidden]) => {
      if (!alive) return
      const b = json<{ book?: string; chapter?: number }>(bible)
      const c = json<{ documentCode?: string; ordinal?: number }>(boc)
      setRaw({
        history,
        lastBible: b?.book && b.chapter ? { book: b.book, chapter: b.chapter } : null,
        lastBoc: c?.documentCode && c.ordinal != null ? { documentCode: c.documentCode, ordinal: c.ordinal } : null,
        hidden: parseHiddenTiles(hidden)
      })
    })
    return () => {
      alive = false
    }
  }, [])

  const sections = useMemo(
    () => (raw ? buildTiles({ ...raw, books, notes }) : null),
    [raw, books, notes]
  )
  const remove = (key: string): void => {
    if (!raw) return
    const hidden = hideTile(raw.hidden, key)
    setRaw({ ...raw, hidden })
    void api.setSession(HIDDEN_KEY, JSON.stringify(hidden))
  }
  return { sections, remove }
}

/**
 * The New Tab page (Ctrl+T, "+"): the Loci wordmark, a search box with the omnibox's
 * suggestions (Enter shows the pick in this tab, Alt+Enter in a new one; a plain query shows
 * search results here), then Chrome-style shortcut tiles: where you left off, recent passages,
 * recent notes, and the fixed views. The vault health and bibliography (the old Dashboard)
 * fold out at the bottom.
 */
export function NewTabPage({ tabId }: { tabId: string }) {
  const tab = useStore((s) => s.tabs.find((t) => t.id === tabId))
  const [text, setText] = useState(() => newTabDrafts.get(tabId) ?? '')
  const [sel, setSel] = useState(0)
  const [open, setOpen] = useState(false)
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuEntry[] } | null>(null)
  const [vaultOpen, setVaultOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const suggestions = useOmniSuggestions(open ? text : '', tab, true)
  const { sections, remove } = useTiles()

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const type = (v: string): void => {
    setText(v)
    setSel(0)
    setOpen(true)
    if (v) newTabDrafts.set(tabId, v)
    else newTabDrafts.delete(tabId)
  }

  const pick = (s: Suggestion | undefined, newTab: boolean): void => {
    if (!s) return
    setOpen(false)
    if (!newTab) {
      newTabDrafts.delete(tabId)
      useStore.getState().focusTab(tabId)
    }
    void runOmniAction(s.action, newTab)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setSel((i) => Math.min(i + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSel((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      pick(suggestions[sel] ?? suggestions[0], e.altKey)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      if (open && suggestions.length) setOpen(false)
      else type('')
    }
  }

  const openTile = (content: TabContent, e: ReactMouseEvent): void => {
    const c = withTranslation(content)
    if (isBackgroundClick(e)) openInBackground(c)
    else openHere(tabId, c)
  }
  const openShortcut = async (view: FixedView, e: ReactMouseEvent): Promise<void> => {
    const background = isBackgroundClick(e)
    const c = await fixedViewContent(view)
    if (background) openInBackground(c)
    else openHere(tabId, c)
  }
  const inNewTab = (c: TabContent): void => {
    const s = useStore.getState()
    s.openTab(withTranslation(c), { forceNew: true, after: null, groupId: null })
    if (c.kind === 'bible' && s.scriptureTranslations.length === 0) void s.loadScripture()
  }

  const tileMenu = (e: ReactMouseEvent, t: Tile): void => {
    e.preventDefault()
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        { label: 'Open in new tab', onSelect: () => inNewTab(t.content) },
        { label: 'Open in background tab', onSelect: () => openInBackground(withTranslation(t.content)) },
        'sep',
        { label: 'Remove from tiles', onSelect: () => remove(t.key) }
      ]
    })
  }
  const shortcutMenu = (e: ReactMouseEvent, view: FixedView): void => {
    e.preventDefault()
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        { label: 'Open in new tab', onSelect: () => void fixedViewContent(view).then(inNewTab) },
        { label: 'Open in background tab', onSelect: () => void fixedViewContent(view).then(openInBackground) }
      ]
    })
  }

  const row = (title: string, tiles: Tile[]) =>
    tiles.length > 0 && (
      <section className="ntp-section">
        <h3>{title}</h3>
        <div className="ntp-tiles">
          {tiles.map((t) => {
            const Icon = tabDef(t.kind).icon
            return (
              <button
                key={t.key}
                className="ntp-tile"
                title={`${t.title}\n${t.subtitle}`}
                onClick={(e) => openTile(t.content, e)}
                onAuxClick={(e) => {
                  if (e.button === 1) openTile(t.content, e)
                }}
                onMouseDown={(e) => {
                  if (e.button === 1) e.preventDefault()
                }}
                onContextMenu={(e) => tileMenu(e, t)}
              >
                <span className="ntp-tile-ic">
                  <Icon size={20} />
                </span>
                <span className="ntp-tile-title">{t.title}</span>
                <span className="ntp-tile-sub">{t.subtitle}</span>
              </button>
            )
          })}
        </div>
      </section>
    )

  const showSugg = open && suggestions.length > 0

  return (
    <div className="ntp">
      <div className="ntp-word">Loci</div>
      <div className={`ntp-box${showSugg ? ' open' : ''}`}>
        <Search size={18} className="ntp-box-ic" />
        <input
          ref={inputRef}
          value={text}
          spellCheck={false}
          placeholder="Search Loci or type a reference"
          onChange={(e) => type(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
        />
        {showSugg && (
          <div className="ntp-sugg" onMouseDown={(e) => e.preventDefault()}>
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
      </div>

      <div className="ntp-shortcuts">
        {SHORTCUTS.map((s) => {
          const Icon = tabDef(s.kind).icon
          return (
            <button
              key={s.view}
              className="ntp-tile"
              onClick={(e) => void openShortcut(s.view, e)}
              onAuxClick={(e) => {
                if (e.button === 1) void openShortcut(s.view, e)
              }}
              onMouseDown={(e) => {
                if (e.button === 1) e.preventDefault()
              }}
              onContextMenu={(e) => shortcutMenu(e, s.view)}
            >
              <span className="ntp-tile-ic">
                <Icon size={20} />
              </span>
              <span className="ntp-tile-title">{s.label}</span>
            </button>
          )
        })}
      </div>

      {sections && (
        <>
          {row('Continue reading', sections.continueReading)}
          {row('Recent', sections.recent)}
          {row('Recent notes', sections.recentNotes)}
        </>
      )}

      <section className={`ntp-vault${vaultOpen ? ' open' : ''}`}>
        <button className="ntp-vault-head" onClick={() => setVaultOpen((v) => !v)}>
          <ChevronRight size={15} className="ntp-vault-chev" />
          Vault health and bibliography
        </button>
        {vaultOpen && <VaultOverview />}
      </section>

      {menu && <PopupMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
    </div>
  )
}
