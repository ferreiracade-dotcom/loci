import { useRef } from 'react'
import { Settings as SettingsIcon, PanelLeftClose, PanelRightClose } from 'lucide-react'
import { useStore } from '../store/useStore'
import { Divider } from './Divider'
import { IconRail } from './IconRail'
import { EmptyState } from './EmptyState'
import { LEFT_VIEWS, RIGHT_TABS, CENTER_EMPTY } from './navigation'
import { LibraryView } from './library/LibraryView'
import { PdfReader } from './library/PdfReader'
import { QuotesPanel } from './library/QuotesPanel'
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
  const openBookId = useStore((s) => s.openBookId)
  const setLayoutLocal = useStore((s) => s.setLayoutLocal)
  const saveLayout = useStore((s) => s.saveLayout)
  const persistLayout = useStore((s) => s.persistLayout)
  const ref = useRef<HTMLDivElement>(null)

  const leftSlot = layout.leftCollapsed ? RAIL : layout.leftWidth
  const rightSlot = layout.notesCollapsed ? RAIL : layout.notesWidth
  const containerW = (): number => ref.current?.clientWidth ?? 1280

  const onLeftDrag = (dx: number): void => {
    const maxLeft = Math.min(LEFT_MAX, containerW() - rightSlot - CENTER_MIN - DIVIDER_ALLOWANCE)
    setLayoutLocal({ leftWidth: clamp(layout.leftWidth + dx, LEFT_MIN, maxLeft) })
  }
  const onRightDrag = (dx: number): void => {
    const maxNotes = Math.min(NOTES_MAX, containerW() - leftSlot - CENTER_MIN - DIVIDER_ALLOWANCE)
    setLayoutLocal({ notesWidth: clamp(layout.notesWidth - dx, NOTES_MIN, maxNotes) })
  }

  const empty = CENTER_EMPTY[layout.activeLeftView] ?? CENTER_EMPTY.library
  const activeTab = RIGHT_TABS.find((t) => t.id === layout.activeRightTab) ?? RIGHT_TABS[0]

  return (
    <div className="three-panel" ref={ref}>
      {layout.leftCollapsed ? (
        <IconRail
          items={LEFT_VIEWS}
          activeId={layout.activeLeftView}
          onSelect={(id) => saveLayout({ activeLeftView: id, leftCollapsed: false })}
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
                    className={`nav-item${v.id === layout.activeLeftView ? ' active' : ''}`}
                    onClick={() => saveLayout({ activeLeftView: v.id })}
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

      <main className="center">
        {openBookId ? (
          <PdfReader bookId={openBookId} />
        ) : layout.activeLeftView === 'library' ? (
          <LibraryView />
        ) : (
          <EmptyState icon={empty.icon} title={empty.title} subtitle={empty.subtitle} />
        )}
      </main>

      {layout.notesCollapsed ? (
        <IconRail
          items={RIGHT_TABS}
          activeId={layout.activeRightTab}
          onSelect={(id) => saveLayout({ activeRightTab: id, notesCollapsed: false })}
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
                title="Collapse notes panel"
                onClick={() => saveLayout({ notesCollapsed: true })}
              >
                <PanelRightClose size={16} />
              </button>
              <span className="brand-word small">Notes</span>
            </div>
            <div className="tabs">
              {RIGHT_TABS.map((t) => (
                <button
                  key={t.id}
                  className={`tab${t.id === layout.activeRightTab ? ' active' : ''}`}
                  onClick={() => saveLayout({ activeRightTab: t.id })}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div className="notes-body">
              {openBookId && layout.activeRightTab === 'book-notes' ? (
                <QuotesPanel />
              ) : (
                <EmptyState
                  icon={activeTab.icon}
                  title="Nothing here yet"
                  subtitle="Notes, backlinks, and tags fill in as you read and write (Phase 2)."
                />
              )}
            </div>
          </aside>
        </>
      )}
    </div>
  )
}
