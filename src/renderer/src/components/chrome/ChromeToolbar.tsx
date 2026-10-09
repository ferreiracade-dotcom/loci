import { useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  LayoutGrid,
  SquarePlus,
  BookMarked,
  EllipsisVertical,
  Headphones,
  History,
  Landmark,
  Library,
  Minus,
  NotebookPen,
  PanelRight,
  PenLine,
  Plus,
  Quote,
  RotateCw,
  ScrollText,
  Settings as SettingsIcon,
  Star,
  Undo2,
  ZoomIn
} from 'lucide-react'
import { useStore, focusedTab } from '../../store/useStore'
import type { Tab } from '../../store/useStore'
import { canGoBack, canGoForward, tabHistory } from '../../store/workspace'
import { api } from '../../lib/api'
import { PopupMenu } from './PopupMenu'
import type { MenuEntry } from './PopupMenu'
import { locationTab, tabDef, tabLocationText, tabTitle } from './tabRegistry'
import { BOOKMARK_TAB_EVENT, Omnibox } from './Omnibox'
import { isBackgroundClick, openFixedView, openInBackground } from './openViews'
import { SCRIPTURE_AUDIO_EVENT } from '../library/ScriptureAudio'
import { GROUP_COLORS, groupName } from '../../store/tabGroups'
import { requestGroupEditor } from './TabGroupMenus'

/** Entries shown in a Back/Forward dropdown, like Chrome's. */
const HISTORY_MENU_MAX = 12
const LONG_PRESS_MS = 500

/**
 * The row under the tab strip: Back / Forward / Reload for the focused tab, the omnibox, then
 * the toolbar icons (chapter audio when there is any, quick capture, side panel) and the ⋮ menu.
 */
export function ChromeToolbar({ onQuickCapture }: { onQuickCapture: () => void }) {
  const tab = useStore((s) => focusedTab(s))
  const sideOpen = useStore((s) => !s.layout?.notesCollapsed)
  const saveLayout = useStore((s) => s.saveLayout)
  const goBack = useStore((s) => s.goBack)
  const goForward = useStore((s) => s.goForward)
  const reloadTab = useStore((s) => s.reloadTab)
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null)
  const hasAudio = useChapterAudio(tab)

  return (
    <div className="chrome-toolbar">
      <HistoryButton tab={tab} dir={-1} onGo={() => goBack()} />
      <HistoryButton tab={tab} dir={1} onGo={() => goForward()} />
      <button
        className="ctb-btn"
        title="Reload (Ctrl+R)"
        disabled={!tab}
        onClick={() => tab && reloadTab(tab.id)}
      >
        <RotateCw size={16} />
      </button>
      <Omnibox />
      {hasAudio && tab && (
        <button
          className="ctb-btn"
          title="Listen to this chapter"
          onClick={() =>
            window.dispatchEvent(new CustomEvent(SCRIPTURE_AUDIO_EVENT, { detail: `${tab.book}:${tab.chapter}` }))
          }
        >
          <Headphones size={16} />
        </button>
      )}
      <button className="ctb-btn" title="Quick capture (Ctrl+Shift+N)" onClick={onQuickCapture}>
        <PenLine size={16} />
      </button>
      <button
        className={`ctb-btn${sideOpen ? ' on' : ''}`}
        title={sideOpen ? 'Hide side panel' : 'Show side panel'}
        onClick={() => saveLayout({ notesCollapsed: sideOpen })}
      >
        <PanelRight size={16} />
      </button>
      <div className="ctb-sep" />
      <button
        className="ctb-btn"
        title="Customize and control Loci"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          setMenuAt({ x: r.right - 260, y: r.bottom + 2 })
        }}
      >
        <EllipsisVertical size={16} />
      </button>
      {menuAt && <AppMenu x={menuAt.x} y={menuAt.y} onClose={() => setMenuAt(null)} />}
    </div>
  )
}

/** Whether the focused Bible tab's chapter has a narration (the reader already fetched it). */
function useChapterAudio(tab: Tab | undefined): boolean {
  const fallback = useStore((s) => s.scriptureTranslation)
  const translation = tab?.kind === 'bible' ? tab.translation || fallback : ''
  const key = tab?.kind === 'bible' && tab.book && tab.chapter != null ? `${translation}|${tab.book}|${tab.chapter}` : ''
  const [has, setHas] = useState<{ key: string; value: boolean }>({ key: '', value: false })
  useEffect(() => {
    if (!key) return
    let alive = true
    const [t, book, chapter] = key.split('|')
    void api
      .getScriptureChapter(t, book, Number(chapter))
      .then((p) => alive && setHas({ key, value: !!p?.audio?.length }))
      .catch(() => alive && setHas({ key, value: false }))
    return () => {
      alive = false
    }
  }, [key])
  return !!key && has.key === key && has.value
}

/**
 * Back or Forward. Click goes one step; Ctrl/middle-click opens that entry in a background
 * tab; right-click or a long press lists the entries to jump to, as in Chrome.
 */
function HistoryButton({ tab, dir, onGo }: { tab: Tab | undefined; dir: -1 | 1; onGo: () => void }) {
  const goToHistoryIndex = useStore((s) => s.goToHistoryIndex)
  const openPage = useStore((s) => s.openPage)
  const books = useStore((s) => s.books)
  const notes = useStore((s) => s.standaloneNotes)
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null)
  const pressTimer = useRef<number | null>(null)
  const longPressed = useRef(false)
  const enabled = dir === -1 ? canGoBack(tab) : canGoForward(tab)
  const Icon = dir === -1 ? ArrowLeft : ArrowRight
  const label = dir === -1 ? 'Back' : 'Forward'

  const openMenu = (el: HTMLElement): void => {
    const r = el.getBoundingClientRect()
    setMenuAt({ x: r.left, y: r.bottom + 2 })
  }
  const clearPress = (): void => {
    if (pressTimer.current != null) window.clearTimeout(pressTimer.current)
    pressTimer.current = null
  }

  const items = (): MenuEntry[] => {
    if (!tab) return []
    const h = tabHistory(tab)
    const ctx = { books, notes }
    const out: MenuEntry[] = []
    for (let i = h.index + dir, n = 0; i >= 0 && i < h.entries.length && n < HISTORY_MENU_MAX; i += dir, n++) {
      const t = locationTab(h.entries[i])
      const index = i
      out.push({ label: tabLocationText(t, ctx) || tabTitle(t, ctx), icon: tabDef(t.kind).icon, onSelect: () => goToHistoryIndex(tab.id, index) })
    }
    out.push('sep', { label: 'Show full history', icon: History, shortcut: 'Ctrl+H', onSelect: () => openPage('history') })
    return out
  }

  return (
    <>
      <button
        className="ctb-btn"
        title={`${label} (Alt+${dir === -1 ? 'Left' : 'Right'}); right-click to see history`}
        disabled={!enabled}
        onMouseDown={(e) => {
          if (e.button === 1) e.preventDefault()
          if (e.button !== 0) return
          longPressed.current = false
          const el = e.currentTarget
          pressTimer.current = window.setTimeout(() => {
            longPressed.current = true
            openMenu(el)
          }, LONG_PRESS_MS)
        }}
        onMouseUp={clearPress}
        onMouseLeave={clearPress}
        onClick={(e) => {
          if (longPressed.current) return
          if (isBackgroundClick(e) && tab) {
            const h = tabHistory(tab)
            const entry = h.entries[h.index + dir]
            if (entry) openInBackground(entry)
            return
          }
          onGo()
        }}
        onAuxClick={(e) => {
          if (e.button !== 1 || !tab) return
          const h = tabHistory(tab)
          const entry = h.entries[h.index + dir]
          if (entry) openInBackground(entry)
        }}
        onContextMenu={(e) => {
          e.preventDefault()
          if (enabled) openMenu(e.currentTarget)
        }}
      >
        <Icon size={16} />
      </button>
      {menuAt && <PopupMenu x={menuAt.x} y={menuAt.y} items={items()} onClose={() => setMenuAt(null)} />}
    </>
  )
}

/**
 * The ⋮ menu. The fixed views (Bible, Confessions, …) live on the bookmarks bar; while the bar
 * is hidden they are listed here too, so they stay one click away.
 */
function AppMenu({ x, y, onClose }: { x: number; y: number; onClose: () => void }) {
  const newTab = useStore((s) => s.newTab)
  const reopenClosedTab = useStore((s) => s.reopenClosedTab)
  const closedCount = useStore((s) => s.closedTabs.length)
  const openPage = useStore((s) => s.openPage)
  const zoom = useStore((s) => s.zoom)
  const stepZoom = useStore((s) => s.stepZoom)
  const showBar = useStore((s) => s.showBookmarksBar)
  const toggleBookmarksBar = useStore((s) => s.toggleBookmarksBar)
  const groups = useStore((s) => s.groups)
  const createGroupWithNewTab = useStore((s) => s.createGroupWithNewTab)
  const openGroup = useStore((s) => s.openGroup)

  const newGroup = (): void => {
    const id = createGroupWithNewTab()
    if (id) requestGroupEditor(id)
  }
  const views: MenuEntry[] = showBar
    ? []
    : [
        { label: 'Bible', icon: ScrollText, onSelect: () => void openFixedView('bible') },
        { label: 'Confessions', icon: BookMarked, onSelect: () => void openFixedView('confessions') },
        { label: 'Church Fathers', icon: Landmark, onSelect: () => void openFixedView('fathers') },
        { label: 'Library', icon: Library, onSelect: () => void openFixedView('library') },
        { label: 'Notes', icon: NotebookPen, onSelect: () => void openFixedView('notes') },
        { label: 'Quotes', icon: Quote, onSelect: () => void openFixedView('quotesIndex') }
      ]
  const items: MenuEntry[] = [
    { label: 'New tab', icon: Plus, shortcut: 'Ctrl+T', onSelect: () => newTab(null) },
    { label: 'New tab group', icon: LayoutGrid, onSelect: newGroup },
    {
      label: 'Reopen closed tab',
      icon: Undo2,
      shortcut: 'Ctrl+Shift+T',
      disabled: closedCount === 0,
      onSelect: reopenClosedTab
    },
    'sep',
    { label: 'History', icon: History, shortcut: 'Ctrl+H', onSelect: () => openPage('history') },
    {
      label: 'Bookmarks',
      icon: Star,
      submenu: [
        {
          label: 'Bookmark this tab',
          icon: Star,
          shortcut: 'Ctrl+D',
          onSelect: () => window.dispatchEvent(new Event(BOOKMARK_TAB_EVENT))
        },
        {
          label: 'Show bookmarks bar',
          checked: showBar,
          shortcut: 'Ctrl+Shift+B',
          onSelect: toggleBookmarksBar
        },
        { label: 'Bookmarks manager', icon: Bookmark, shortcut: 'Ctrl+Shift+O', onSelect: () => openPage('bookmarks') }
      ]
    },
    {
      label: 'Tab groups',
      icon: LayoutGrid,
      submenu: [
        { label: 'Create new tab group', icon: SquarePlus, onSelect: newGroup },
        ...(groups.length ? (['sep'] as MenuEntry[]) : []),
        ...groups.map(
          (g): MenuEntry => ({
            label: `${groupName(g)}${g.open ? '' : ' (closed)'}`,
            dot: GROUP_COLORS[g.color],
            onSelect: () => openGroup(g.id)
          })
        )
      ]
    },
    'sep',
    ...(views.length ? [...views, 'sep' as const] : []),
    {
      label: 'Zoom',
      icon: ZoomIn,
      custom: (
        <span className="cm-zoom">
          <span className="cm-label">Zoom</span>
          <button className="cm-zoom-btn" title="Zoom out (Ctrl+Minus)" onClick={() => stepZoom(-1)}>
            <Minus size={14} />
          </button>
          <button className="cm-zoom-val" title="Reset zoom (Ctrl+0)" onClick={() => stepZoom(0)}>
            {zoom}%
          </button>
          <button className="cm-zoom-btn" title="Zoom in (Ctrl+Plus)" onClick={() => stepZoom(1)}>
            <Plus size={14} />
          </button>
        </span>
      )
    },
    'sep',
    { label: 'Settings', icon: SettingsIcon, onSelect: () => openPage('settings') }
  ]
  return <PopupMenu x={x} y={y} items={items} onClose={onClose} className="app-menu" />
}
