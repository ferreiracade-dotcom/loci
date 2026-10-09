import { useState } from 'react'
import { useStore, splitPartner } from '../../store/useStore'
import type { Tab } from '../../store/useStore'
import { tabDef } from '../chrome/tabRegistry'

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

/** One tab's content (a whole tab, or one half of a split view). */
export function PaneFrame({ tab }: { tab: Tab }) {
  const tabs = useStore((s) => s.tabs)
  const activeProject = useStore((s) => s.activeProject)
  const addProjectItem = useStore((s) => s.addProjectItem)
  const resetTabToNewTab = useStore((s) => s.resetTabToNewTab)
  const closeTab = useStore((s) => s.closeTab)
  const [dragOver, setDragOver] = useState(false)

  // If this tab's split partner is the active Project note, this tab is the sources surface —
  // its New Tab page offers only the project's items instead of the whole library.
  const partner = splitPartner(tabs, tab.id)
  const isProjectNote = !!activeProject && tab.kind === 'note' && tab.notePath === activeProject.path
  const isProjectSibling =
    !!activeProject && partner?.kind === 'note' && partner.notePath === activeProject.path
  // Both the sources surface and the project note itself accept a dropped reference-panel
  // item, adding it to the project's collection.
  const isProjectDropTarget = isProjectSibling || isProjectNote

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

  const ctx = {
    close: () => closeTab(tab.id),
    replace: () => resetTabToNewTab(tab.id),
    restrictToProject: isProjectSibling ? activeProject?.items : undefined
  }
  const body = tabDef(tab.kind).render(tab, ctx) ?? tabDef('newtab').render(tab, ctx)

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
      <div className="pane-body">{body}</div>
    </div>
  )
}
