import { useRef, useState } from 'react'
import { ChevronDown, X } from 'lucide-react'
import { PopupMenu } from './chrome/PopupMenu'
import { useStore } from '../store/useStore'
import { Divider } from './Divider'
import { EmptyState } from './EmptyState'
import { RIGHT_TABS } from './navigation'
import { TabWorkspace } from './chrome/TabWorkspace'
import { StandaloneNotesPanel } from './library/StandaloneNotesPanel'
import { ReferencePdfPanel } from './library/ReferencePdfPanel'
import { QuotesReferencePanel } from './library/QuotesReferencePanel'
import { TextsReferencePanel } from './library/TextsReferencePanel'
import { CommentaryReferencePanel } from './library/CommentaryReferencePanel'
import { clamp } from '../lib/util'
import { migrateRightTabId } from '../lib/corpusMode'

const CENTER_MIN = 300
const NOTES_MIN = 220
const NOTES_MAX = 480
const DIVIDER_ALLOWANCE = 14
/** Reference tabs that render a reader and so want a wider panel: they raise the panel's max
 *  width and auto-widen a narrow panel the first time one is chosen. */
const WIDE_RIGHT_TABS = new Set(['books', 'texts', 'commentary'])

/**
 * The window body under the toolbar: tab content, plus Chrome's side panel (the reference
 * panel, toggled from the toolbar): a header with a dropdown to pick Quotes / Notes / Library /
 * Texts / Commentary and a close button.
 */
export function ThreePanel() {
  const layout = useStore((s) => s.layout)!
  const setLayoutLocal = useStore((s) => s.setLayoutLocal)
  const saveLayout = useStore((s) => s.saveLayout)
  const persistLayout = useStore((s) => s.persistLayout)
  const ref = useRef<HTMLDivElement>(null)
  const [pickerAt, setPickerAt] = useState<{ x: number; y: number; w: number } | null>(null)

  // Normalise the active right tab. Stored values may be legacy ids from before the five-pill
  // consolidation — map them rather than dropping the user on a fallback.
  const rightTabId = migrateRightTabId(layout.activeRightTab).pill
  const readerTab = WIDE_RIGHT_TABS.has(rightTabId)
  const notesMax = readerTab ? 820 : NOTES_MAX
  const activeTab = RIGHT_TABS.find((t) => t.id === rightTabId) ?? RIGHT_TABS[0]
  const containerW = (): number => ref.current?.clientWidth ?? 1280

  const selectRightTab = (id: string): void => {
    const patch: Parameters<typeof saveLayout>[0] = { activeRightTab: id }
    if (WIDE_RIGHT_TABS.has(id) && layout.notesWidth < 460) patch.notesWidth = 560
    saveLayout(patch)
  }

  const onRightDrag = (dx: number): void => {
    const maxNotes = Math.min(notesMax, containerW() - CENTER_MIN - DIVIDER_ALLOWANCE)
    setLayoutLocal({ notesWidth: clamp(layout.notesWidth - dx, NOTES_MIN, maxNotes) })
  }

  return (
    <div className="three-panel" ref={ref}>
      <main className="center">
        <TabWorkspace />
      </main>

      {!layout.notesCollapsed && (
        <>
          <Divider onDrag={onRightDrag} onDragEnd={persistLayout} />
          <aside className="sidebar notes-panel side-panel" style={{ width: layout.notesWidth }}>
            <div className="side-panel-head">
              <button
                className="side-panel-pick"
                title="Choose what the side panel shows"
                onClick={(e) => {
                  const r = e.currentTarget.getBoundingClientRect()
                  setPickerAt({ x: r.left, y: r.bottom + 4, w: r.width })
                }}
              >
                <activeTab.icon size={15} />
                <span>{activeTab.label}</span>
                <ChevronDown size={15} />
              </button>
              <button
                className="ctb-btn"
                title="Close side panel"
                onClick={() => saveLayout({ notesCollapsed: true })}
              >
                <X size={16} />
              </button>
            </div>
            {pickerAt && (
              <PopupMenu
                x={pickerAt.x}
                y={pickerAt.y}
                className="side-panel-menu"
                onClose={() => setPickerAt(null)}
                items={RIGHT_TABS.map((t) => ({
                  label: t.label,
                  icon: t.icon,
                  shortcut: t.id === rightTabId ? '✓' : undefined,
                  onSelect: () => selectRightTab(t.id)
                }))}
              />
            )}
            <div className="notes-body">
              {rightTabId === 'quotes' ? (
                <QuotesReferencePanel />
              ) : rightTabId === 'notes' ? (
                <StandaloneNotesPanel />
              ) : rightTabId === 'books' ? (
                <ReferencePdfPanel />
              ) : rightTabId === 'texts' ? (
                <TextsReferencePanel />
              ) : rightTabId === 'commentary' ? (
                <CommentaryReferencePanel />
              ) : (
                <EmptyState icon={activeTab.icon} title="Nothing here yet" subtitle="Pick a reference source above." />
              )}
            </div>
          </aside>
        </>
      )}
    </div>
  )
}
