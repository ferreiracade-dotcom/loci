import { useMemo, useState } from 'react'
import {
  BookMarked,
  EllipsisVertical,
  History,
  Landmark,
  LayoutDashboard,
  Library,
  Minus,
  NotebookPen,
  PanelRight,
  PenLine,
  Plus,
  Quote,
  ScrollText,
  Settings as SettingsIcon,
  Undo2,
  ZoomIn
} from 'lucide-react'
import { useStore, focusedTab } from '../../store/useStore'
import { PopupMenu } from './PopupMenu'
import type { MenuEntry } from './PopupMenu'
import { tabDef, tabTitle } from './tabRegistry'
import { openBibleTab, openConfessionsTab } from './openViews'

/**
 * The row under the tab strip. Phase 1 shows the focused tab's location read-only where the
 * omnibox will go (with Back/Forward/Reload to its left in phase 2), then the toolbar icons and
 * the ⋮ menu.
 */
export function ChromeToolbar({ onQuickCapture }: { onQuickCapture: () => void }) {
  const tab = useStore((s) => focusedTab(s))
  const books = useStore((s) => s.books)
  const notes = useStore((s) => s.standaloneNotes)
  const sideOpen = useStore((s) => !s.layout?.notesCollapsed)
  const saveLayout = useStore((s) => s.saveLayout)
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null)
  const ctx = useMemo(() => ({ books, notes }), [books, notes])

  const def = tab ? tabDef(tab.kind) : null
  const Icon = def?.icon

  return (
    <div className="chrome-toolbar">
      <div className="ctb-location" title={tab && def ? `${tabTitle(tab, ctx)} · ${def.subtitle(tab)}` : ''}>
        {Icon && <Icon size={15} className="ctb-loc-icon" />}
        {tab && def ? (
          tab.kind === 'newtab' ? (
            <span className="ctb-dim">New Tab</span>
          ) : (
            <>
              <span className="ctb-dim">{def.subtitle(tab)}</span>
              <span className="ctb-dim"> › </span>
              <span>{tabTitle(tab, ctx)}</span>
            </>
          )
        ) : null}
      </div>
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

/** The ⋮ menu. Until the bookmarks bar exists (phase 3) it also carries the fixed views. */
function AppMenu({ x, y, onClose }: { x: number; y: number; onClose: () => void }) {
  const newTab = useStore((s) => s.newTab)
  const reopenClosedTab = useStore((s) => s.reopenClosedTab)
  const closedCount = useStore((s) => s.closedTabs.length)
  const openPage = useStore((s) => s.openPage)
  const zoom = useStore((s) => s.zoom)
  const stepZoom = useStore((s) => s.stepZoom)

  const items: MenuEntry[] = [
    { label: 'New tab', icon: Plus, shortcut: 'Ctrl+T', onSelect: () => newTab(null) },
    {
      label: 'Reopen closed tab',
      icon: Undo2,
      shortcut: 'Ctrl+Shift+T',
      disabled: closedCount === 0,
      onSelect: reopenClosedTab
    },
    'sep',
    { label: 'History', icon: History, shortcut: 'Ctrl+H', onSelect: () => openPage('history') },
    'sep',
    { label: 'Bible', icon: ScrollText, onSelect: () => void openBibleTab() },
    { label: 'Confessions', icon: BookMarked, onSelect: () => void openConfessionsTab() },
    { label: 'Church Fathers', icon: Landmark, onSelect: () => openPage('fathers') },
    { label: 'Library', icon: Library, onSelect: () => openPage('library') },
    { label: 'Notes', icon: NotebookPen, onSelect: () => openPage('notes') },
    { label: 'Quotes', icon: Quote, onSelect: () => openPage('quotesIndex') },
    { label: 'Dashboard', icon: LayoutDashboard, onSelect: () => openPage('dashboard') },
    'sep',
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
