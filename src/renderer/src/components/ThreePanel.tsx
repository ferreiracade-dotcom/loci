import { useRef } from 'react'
import { Settings as SettingsIcon, PanelLeftClose, PanelRightClose } from 'lucide-react'
import { useStore } from '../store/useStore'
import { Divider } from './Divider'
import { IconRail } from './IconRail'
import { EmptyState } from './EmptyState'
import { LEFT_VIEWS, RIGHT_TABS, CENTER_EMPTY } from './navigation'
import { LibraryView } from './library/LibraryView'
import { CenterWorkspace } from './library/CenterWorkspace'
import { QuotesPanel } from './library/QuotesPanel'
import { ScriptureHighlightsPanel } from './library/ScriptureHighlightsPanel'
import { NotesView } from './library/NotesView'
import { BacklinksPanel } from './library/BacklinksPanel'
import { StandaloneNotesPanel } from './library/StandaloneNotesPanel'
import { ReferencePdfPanel } from './library/ReferencePdfPanel'
import { ReferenceBiblePanel } from './library/ReferenceBiblePanel'
import { CommentaryPanel } from './library/CommentaryPanel'
import { SearchView } from './library/SearchView'
import { DashboardView } from './library/DashboardView'
import { clamp } from '../lib/util'

const RAIL = 48
const CENTER_MIN = 300
const LEFT_MIN = 180
const LEFT_MAX = 320
const NOTES_MIN = 220
const NOTES_MAX = 480
const DIVIDER_ALLOWANCE = 14

export function ThreePanel({ onOpenSettings }: { onOpenSettings: () => void }) {
  const layout = useStore((s) => s.layout)!
  const setLayoutLocal = useStore((s) => s.setLayoutLocal)
  const saveLayout = useStore((s) => s.saveLayout)
  const persistLayout = useStore((s) => s.persistLayout)
  const showScripture = useStore((s) => s.showScripture)
  const panes = useStore((s) => s.panes)
  const activePaneId = useStore((s) => s.activePaneId)
  const ref = useRef<HTMLDivElement>(null)

  // The left rail mostly just switches the active view; "Scripture" opens/focuses a Bible pane.
  const selectLeftView = (id: string): void => {
    if (id === 'scripture') void showScripture()
    else saveLayout({ activeLeftView: id })
  }

  // In the workspace, light up the rail item matching the focused pane (Bible→Scripture,
  // note→Notes); books have no rail entry, so they leave the rail unlit.
  const focusedPane = panes.find((p) => p.id === activePaneId)
  const railActiveId =
    layout.activeLeftView === 'reading' && focusedPane
      ? focusedPane.kind === 'bible'
        ? 'scripture'
        : focusedPane.kind === 'note'
          ? 'notes'
          : layout.activeLeftView
      : layout.activeLeftView

  // Normalize the active right tab (a removed tab, e.g. legacy 'tags', falls back).
  const rightTabId = RIGHT_TABS.some((t) => t.id === layout.activeRightTab)
    ? layout.activeRightTab
    : 'book-notes'
  // The PDF/Bible/Commentary references want more room, so the panel may grow wider when
  // they're active.
  const readerTab =
    rightTabId === 'reference-pdf' || rightTabId === 'reference-bible' || rightTabId === 'commentary'
  const notesMax = readerTab ? 820 : NOTES_MAX

  const leftSlot = layout.leftCollapsed ? RAIL : layout.leftWidth
  const rightSlot = layout.notesCollapsed ? RAIL : layout.notesWidth
  const containerW = (): number => ref.current?.clientWidth ?? 1280

  // Switch reference source; auto-widen the panel the first time a reader source is chosen.
  const selectRightTab = (id: string, expand = false): void => {
    const patch: Parameters<typeof saveLayout>[0] = { activeRightTab: id }
    if (expand) patch.notesCollapsed = false
    if (
      (id === 'reference-pdf' || id === 'reference-bible' || id === 'commentary') &&
      layout.notesWidth < 460
    ) {
      patch.notesWidth = 560
    }
    saveLayout(patch)
  }

  const onLeftDrag = (dx: number): void => {
    const maxLeft = Math.min(LEFT_MAX, containerW() - rightSlot - CENTER_MIN - DIVIDER_ALLOWANCE)
    setLayoutLocal({ leftWidth: clamp(layout.leftWidth + dx, LEFT_MIN, maxLeft) })
  }
  const onRightDrag = (dx: number): void => {
    const maxNotes = Math.min(notesMax, containerW() - leftSlot - CENTER_MIN - DIVIDER_ALLOWANCE)
    setLayoutLocal({ notesWidth: clamp(layout.notesWidth - dx, NOTES_MIN, maxNotes) })
  }

  const empty = CENTER_EMPTY[layout.activeLeftView] ?? CENTER_EMPTY.library
  const activeTab = RIGHT_TABS.find((t) => t.id === layout.activeRightTab) ?? RIGHT_TABS[0]

  // Library/Search/Dashboard are full-center navigators; Notes is the notes-list navigator.
  // Scripture, books and notes open as panes, so everything else ('reading') is the workspace.
  const centerNode = (): React.ReactNode => {
    switch (layout.activeLeftView) {
      case 'library':
        return <LibraryView />
      case 'search':
        return <SearchView />
      case 'notes':
        return <NotesView />
      case 'dashboard':
        return <DashboardView />
      case 'graph':
      case 'pages':
        return <EmptyState icon={empty.icon} title={empty.title} subtitle={empty.subtitle} />
      default:
        return <CenterWorkspace />
    }
  }

  return (
    <div className="three-panel" ref={ref}>
      {layout.leftCollapsed ? (
        <IconRail
          items={LEFT_VIEWS}
          activeId={railActiveId}
          onSelect={(id) => selectLeftView(id)}
          onExpand={() => saveLayout({ leftCollapsed: false })}
          expandSide="left"
          footer={
            <button className="rail-btn" title="Settings" onClick={onOpenSettings}>
              <SettingsIcon size={18} />
            </button>
          }
        />
      ) : (
        <>
          <aside className="sidebar left-sidebar" style={{ width: leftSlot }}>
            <div className="sidebar-head">
              <span className="brand-word">Loci</span>
              <button
                className="icon-btn"
                title="Collapse sidebar"
                onClick={() => saveLayout({ leftCollapsed: true })}
              >
                <PanelLeftClose size={16} />
              </button>
            </div>
            <nav className="nav">
              {LEFT_VIEWS.map((v) => {
                const Icon = v.icon
                return (
                  <button
                    key={v.id}
                    className={`nav-item${v.id === railActiveId ? ' active' : ''}`}
                    onClick={() => selectLeftView(v.id)}
                  >
                    <Icon size={16} />
                    <span>{v.label}</span>
                  </button>
                )
              })}
            </nav>
            <div className="sidebar-foot">
              <button className="nav-item" onClick={onOpenSettings}>
                <SettingsIcon size={16} />
                <span>Settings</span>
              </button>
            </div>
          </aside>
          <Divider onDrag={onLeftDrag} onDragEnd={persistLayout} />
        </>
      )}

      <main className="center">{centerNode()}</main>

      {layout.notesCollapsed ? (
        <IconRail
          items={RIGHT_TABS}
          activeId={rightTabId}
          onSelect={(id) => selectRightTab(id, true)}
          onExpand={() => saveLayout({ notesCollapsed: false })}
          expandSide="right"
        />
      ) : (
        <>
          <Divider onDrag={onRightDrag} onDragEnd={persistLayout} />
          <aside className="sidebar notes-panel" style={{ width: rightSlot }}>
            <div className="sidebar-head">
              <button
                className="icon-btn"
                title="Collapse reference panel"
                onClick={() => saveLayout({ notesCollapsed: true })}
              >
                <PanelRightClose size={16} />
              </button>
              <span className="brand-word small">Reference</span>
            </div>
            <div className="tabs">
              {RIGHT_TABS.map((t) => {
                const Icon = t.icon
                return (
                  <button
                    key={t.id}
                    className={`tab tab-icon${t.id === rightTabId ? ' active' : ''}`}
                    title={t.label}
                    onClick={() => selectRightTab(t.id)}
                  >
                    <Icon size={14} />
                    <span>{t.label}</span>
                  </button>
                )
              })}
            </div>
            <div className="notes-body">
              {rightTabId === 'book-notes' ? (
                <QuotesPanel />
              ) : rightTabId === 'scripture-highlights' ? (
                <ScriptureHighlightsPanel />
              ) : rightTabId === 'standalone-notes' ? (
                <StandaloneNotesPanel />
              ) : rightTabId === 'backlinks' ? (
                <BacklinksPanel />
              ) : rightTabId === 'reference-pdf' ? (
                <ReferencePdfPanel />
              ) : rightTabId === 'reference-bible' ? (
                <ReferenceBiblePanel />
              ) : rightTabId === 'commentary' ? (
                <CommentaryPanel />
              ) : (
                <EmptyState
                  icon={activeTab.icon}
                  title="Nothing here yet"
                  subtitle="Pick a reference source above."
                />
              )}
            </div>
          </aside>
        </>
      )}
    </div>
  )
}
