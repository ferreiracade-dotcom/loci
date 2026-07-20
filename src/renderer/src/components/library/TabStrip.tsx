import { useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { FileText, BookOpen, ScrollText, Quote, FilePlus, Plus, X } from 'lucide-react'
import { useStore, tabsForPane } from '../../store/useStore'
import type { Tab } from '../../store/useStore'
import { bookByCode } from '@shared/scriptureRef'

export interface HoverTarget {
  paneId: string
  index: number
}

function tabTitle(
  tab: Tab,
  books: { id: string; title: string }[],
  notes: { path: string; title: string }[]
): { icon: React.ReactNode; label: string } {
  if (tab.kind === 'pdf') {
    return { icon: <BookOpen size={13} />, label: books.find((b) => b.id === tab.bookId)?.title ?? 'Document' }
  }
  if (tab.kind === 'note') {
    return { icon: <FileText size={13} />, label: notes.find((n) => n.path === tab.notePath)?.title ?? 'Note' }
  }
  if (tab.kind === 'bible') {
    const label = tab.book && tab.chapter != null ? `${bookByCode(tab.book)?.name ?? tab.book} ${tab.chapter}` : 'Bible'
    return { icon: <ScrollText size={13} />, label }
  }
  if (tab.kind === 'quotes') {
    const g = tab.quotesGroup
    const label = !g
      ? 'Quotes'
      : g.type === 'book'
        ? g.title
        : g.type === 'scripture'
          ? g.chapter != null
            ? `${g.name} ${g.chapter}`
            : g.name
          : g.type === 'commentary'
            ? g.displayName
            : g.type === 'author'
              ? g.author
              : g.tag
                ? `#${g.tag}`
                : 'Untagged'
    return { icon: <Quote size={13} />, label }
  }
  return { icon: <FilePlus size={13} />, label: 'New Tab' }
}

export function TabStrip({
  paneId,
  focused,
  dragTabId,
  hover,
  onDragStart,
  onHover,
  onDrop,
  onDragCancel
}: {
  paneId: string
  focused: boolean
  dragTabId: string | null
  hover: HoverTarget | null
  onDragStart: (tabId: string) => void
  onHover: (target: HoverTarget | null) => void
  onDrop: () => void
  onDragCancel: () => void
}) {
  const books = useStore((s) => s.books)
  const notes = useStore((s) => s.standaloneNotes)
  const allTabs = useStore((s) => s.tabs)
  const paneOrder = useStore((s) => s.paneOrder)
  const openTab = useStore((s) => s.openTab)
  const closeTab = useStore((s) => s.closeTab)
  const focusTab = useStore((s) => s.focusTab)
  const moveTabToSplit = useStore((s) => s.moveTabToSplit)

  const [menuTabId, setMenuTabId] = useState<string | null>(null)
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null)

  const tabs = tabsForPane(allTabs, paneId)
  const activeTabId = paneOrder.find((p) => p.id === paneId)?.activeTabId ?? null

  const handlePointerDown = (e: ReactPointerEvent, tabId: string): void => {
    if (e.button !== 0) return
    // Don't capture the pointer for a close-button click — capture retargets the
    // resulting 'click' event to the tab itself, so the button's own handler never fires.
    if ((e.target as HTMLElement).closest('.tab-close')) return
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    onDragStart(tabId)
  }

  const handlePointerMove = (e: ReactPointerEvent): void => {
    if (!dragTabId) return
    const el = document.elementFromPoint(e.clientX, e.clientY)
    const paneEl = el?.closest<HTMLElement>('[data-pane-id]')
    if (!paneEl) {
      onHover(null)
      return
    }
    const targetPaneId = paneEl.dataset.paneId!
    const tabEls = Array.from(paneEl.querySelectorAll<HTMLElement>('[data-tab-id]'))
    let index = tabEls.length
    for (let i = 0; i < tabEls.length; i++) {
      const rect = tabEls[i].getBoundingClientRect()
      if (e.clientX < rect.left + rect.width / 2) {
        index = i
        break
      }
    }
    onHover({ paneId: targetPaneId, index })
  }

  const handlePointerUp = (e: ReactPointerEvent): void => {
    if (!dragTabId) return
    ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
    onDrop()
  }

  return (
    <div className={`tab-strip${focused ? ' pane-focused' : ''}`} data-pane-id={paneId}>
      {tabs.map((tab, i) => {
        const { icon, label } = tabTitle(tab, books, notes)
        const dropBefore = hover?.paneId === paneId && hover.index === i && dragTabId !== tab.id
        return (
          <div key={tab.id} className="tab-slot">
            {dropBefore && <div className="tab-drop-indicator" />}
            <div
              className={`tab${tab.id === activeTabId ? ' active' : ''}${tab.id === dragTabId ? ' dragging' : ''}`}
              data-tab-id={tab.id}
              onPointerDown={(e) => handlePointerDown(e, tab.id)}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={onDragCancel}
              onClick={() => focusTab(tab.id)}
              onAuxClick={(e) => {
                if (e.button === 1) closeTab(tab.id)
              }}
              onContextMenu={(e) => {
                e.preventDefault()
                const rect = e.currentTarget.getBoundingClientRect()
                setMenuPos({ top: rect.bottom, left: rect.left })
                setMenuTabId(tab.id)
              }}
              title={label}
            >
              {icon}
              <span className="tab-label">{label}</span>
              <button
                className="tab-close"
                title="Close tab"
                onClick={(e) => {
                  e.stopPropagation()
                  closeTab(tab.id)
                }}
              >
                <X size={12} />
              </button>
            </div>
            {menuTabId === tab.id && menuPos && (
              <div
                className="ctx-menu"
                style={{ top: menuPos.top, left: menuPos.left }}
                onMouseLeave={() => {
                  setMenuTabId(null)
                  setMenuPos(null)
                }}
              >
                <button
                  className="ctx-item"
                  onClick={() => {
                    moveTabToSplit(tab.id)
                    setMenuTabId(null)
                    setMenuPos(null)
                  }}
                >
                  Open in split pane
                </button>
              </div>
            )}
          </div>
        )
      })}
      {hover?.paneId === paneId && hover.index === tabs.length && dragTabId && (
        <div className="tab-drop-indicator" />
      )}
      <button className="tab-new" title="New tab" onClick={() => openTab({ kind: 'picker' }, { paneId })}>
        <Plus size={14} />
      </button>
    </div>
  )
}
