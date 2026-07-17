import { useState } from 'react'
import { useStore } from '../../store/useStore'
import type { PaneMeta } from '../../store/useStore'
import { RichNoteEditor } from './RichNoteEditor'
import { PdfReader } from './PdfReader'
import { BiblePane } from './BiblePane'
import { PanePicker } from './PanePicker'
import { QuoteGroupPane } from './QuoteGroupPane'
import { TabStrip } from './TabStrip'
import type { HoverTarget } from './TabStrip'

/** Read whichever project-item drag payload is present on a drop event, if any. */
function projectItemFromDrag(e: React.DragEvent): { kind: 'book' | 'note' | 'scripture'; value: string } | null {
  const bookId = e.dataTransfer.getData('application/x-loci-book')
  if (bookId) return { kind: 'book', value: bookId }
  const notePath = e.dataTransfer.getData('application/x-loci-note')
  if (notePath) return { kind: 'note', value: notePath }
  const scripture = e.dataTransfer.getData('application/x-loci-scripture')
  if (scripture) return { kind: 'scripture', value: scripture }
  return null
}

/** One center-workspace pane: a tab strip over the active tab's reused body. */
export function PaneFrame({
  pane,
  focused,
  dragTabId,
  hover,
  onDragStart,
  onHover,
  onDrop,
  onDragCancel
}: {
  pane: PaneMeta
  focused: boolean
  dragTabId: string | null
  hover: HoverTarget | null
  onDragStart: (tabId: string) => void
  onHover: (target: HoverTarget | null) => void
  onDrop: () => void
  onDragCancel: () => void
}) {
  const tabs = useStore((s) => s.tabs)
  const activeProject = useStore((s) => s.activeProject)
  const addProjectItem = useStore((s) => s.addProjectItem)
  const resetTabToPicker = useStore((s) => s.resetTabToPicker)
  const closeTab = useStore((s) => s.closeTab)
  const [dragOver, setDragOver] = useState(false)

  const tab = tabs.find((t) => t.id === pane.activeTabId)

  // If this pane's sibling holds the active Project note, this pane is the sources surface —
  // its picker tabs offer only the project's items instead of the whole library.
  const projectTab = tabs.find((t) => t.kind === 'note' && t.notePath === activeProject?.path)
  const isProjectSibling = !!projectTab && projectTab.paneId !== pane.id
  // Both the sources surface and the project note's own pane accept a dropped reference-panel
  // item, adding it to the project's collection.
  const isProjectDropTarget = isProjectSibling || (!!activeProject && pane.id === projectTab?.paneId)

  const onDropItem = (e: React.DragEvent): void => {
    if (!isProjectDropTarget || !activeProject) return
    e.preventDefault()
    setDragOver(false)
    const dragged = projectItemFromDrag(e)
    if (!dragged) return
    if (dragged.kind === 'book') void addProjectItem({ kind: 'book', id: dragged.value })
    else if (dragged.kind === 'note') void addProjectItem({ kind: 'note', path: dragged.value })
    else {
      const [book, chapterStr] = dragged.value.split(':')
      if (book && chapterStr) void addProjectItem({ kind: 'scripture', book, chapter: Number(chapterStr) })
    }
  }

  let body: React.ReactNode = (
    <PanePicker
      heading="Open a note, a book, or the Bible"
      restrictToProject={isProjectSibling ? activeProject?.items : undefined}
    />
  )

  if (tab?.kind === 'pdf' && tab.bookId) {
    body = <PdfReader key={tab.id} bookId={tab.bookId} embedded />
  } else if (tab?.kind === 'note' && tab.notePath) {
    body = <RichNoteEditor key={tab.id} path={tab.notePath} />
  } else if (tab?.kind === 'quotes' && tab.quotesGroup) {
    body = <QuoteGroupPane key={tab.id} group={tab.quotesGroup} />
  } else if (tab?.kind === 'bible' && tab.book && tab.chapter != null) {
    body = (
      <BiblePane
        key={tab.id}
        tab={tab}
        onClose={() => closeTab(tab.id)}
        onReplace={() => resetTabToPicker(tab.id)}
      />
    )
  } else if (tab?.kind === 'picker') {
    body = (
      <PanePicker
        key={tab.id}
        tabId={tab.id}
        restrictToProject={isProjectSibling ? activeProject?.items : undefined}
      />
    )
  }

  return (
    <div
      className={`pane-frame${dragOver ? ' drag-over' : ''}`}
      onDragOver={(e) => {
        if (!isProjectDropTarget) return
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDropItem}
    >
      <TabStrip
        paneId={pane.id}
        focused={focused}
        dragTabId={dragTabId}
        hover={hover}
        onDragStart={onDragStart}
        onHover={onHover}
        onDrop={onDrop}
        onDragCancel={onDragCancel}
      />
      <div className="pane-body">{body}</div>
    </div>
  )
}
