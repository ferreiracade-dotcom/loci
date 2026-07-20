import { useState } from 'react'
import { X, FileText, BookOpen, ChevronLeft, Replace, LayoutPanelTop, Quote } from 'lucide-react'
import { useStore } from '../../store/useStore'
import type { Pane } from '../../store/useStore'
import { RichNoteEditor } from './RichNoteEditor'
import { PdfReader } from './PdfReader'
import { BiblePane } from './BiblePane'
import { PanePicker } from './PanePicker'
import { QuoteGroupPane } from './QuoteGroupPane'

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

/** One center-workspace pane: a slim header (kind + title + close) over the reused body. */
export function PaneFrame({
  pane,
  active,
  onClose
}: {
  pane: Pane
  active: boolean
  onClose: () => void
}) {
  const books = useStore((s) => s.books)
  const notes = useStore((s) => s.standaloneNotes)
  const saveLayout = useStore((s) => s.saveLayout)
  const setPaneEmpty = useStore((s) => s.setPaneEmpty)
  const panes = useStore((s) => s.panes)
  const activeProject = useStore((s) => s.activeProject)
  const addProjectItem = useStore((s) => s.addProjectItem)
  const [dragOver, setDragOver] = useState(false)

  const replace = (): void => setPaneEmpty(pane.id)

  // If this pane's sibling is the active Project note, this pane is the sources surface —
  // its (empty-state) picker offers only the project's items instead of the whole library.
  const projectPane = panes.find((p) => p.kind === 'note' && p.notePath === activeProject?.path)
  const isProjectSibling = !!projectPane && projectPane.id !== pane.id
  // Both the sources surface (pane 2) and the project note's own pane accept a dropped
  // reference-panel item, adding it to the project's collection.
  const isProjectDropTarget = isProjectSibling || (!!activeProject && pane.id === projectPane?.id)

  const onDrop = (e: React.DragEvent): void => {
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

  // Bible panes carry their own rich header (book nav + reader title + translation), so they
  // skip the generic pane header — the close + change controls live in the reader/nav.
  if (pane.kind === 'bible' && pane.book && pane.chapter != null) {
    return (
      <div className={`pane-frame headerless${active ? ' active' : ''}`}>
        <div className="pane-body">
          <BiblePane key={pane.id} pane={pane} onClose={onClose} onReplace={replace} />
        </div>
      </div>
    )
  }

  // Closing a book should land back on the library grid, not the empty workspace.
  const backToLibrary = (): void => {
    onClose()
    saveLayout({ activeLeftView: 'library' })
  }

  let icon = <FileText size={13} />
  let title = 'Pane'
  let body: React.ReactNode = null
  let canReplace = false

  if (pane.kind === 'pdf' && pane.bookId) {
    icon = <BookOpen size={13} />
    title = books.find((b) => b.id === pane.bookId)?.title ?? 'Document'
    body = <PdfReader key={pane.bookId} bookId={pane.bookId} embedded />
    canReplace = true
  } else if (pane.kind === 'note' && pane.notePath) {
    icon = <FileText size={13} />
    title = notes.find((n) => n.path === pane.notePath)?.title ?? 'Note'
    body = <RichNoteEditor key={pane.notePath} path={pane.notePath} />
    canReplace = true
  } else if (pane.kind === 'quotes' && pane.quotesGroup) {
    const g = pane.quotesGroup
    icon = <Quote size={13} />
    title =
      g.type === 'book'
        ? g.title
        : g.type === 'scripture'
          ? g.chapter != null
            ? `${g.name} ${g.chapter}`
            : g.name
          : g.type === 'commentary'
            ? g.displayName
            : g.type === 'boc'
              ? g.name
              : g.type === 'author'
                ? g.author
                : g.tag
                  ? `#${g.tag}`
                  : 'Untagged'
    body = <QuoteGroupPane key={JSON.stringify(g)} group={g} />
    canReplace = true
  } else if (pane.kind === 'empty') {
    icon = <LayoutPanelTop size={13} />
    title = isProjectSibling ? 'Project sources' : 'New pane'
    body = (
      <PanePicker
        paneId={pane.id}
        restrictToProject={isProjectSibling ? activeProject?.items : undefined}
      />
    )
  }

  return (
    <div
      className={`pane-frame${active ? ' active' : ''}${dragOver ? ' drag-over' : ''}`}
      onDragOver={(e) => {
        if (!isProjectDropTarget) return
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      <div className="pane-head">
        {icon}
        <span className="pane-title" title={title}>
          {title}
        </span>
        {pane.kind === 'pdf' && (
          <button className="pane-back" title="Back to Library" onClick={backToLibrary}>
            <ChevronLeft size={13} />
            Library
          </button>
        )}
        {canReplace && (
          <button className="icon-btn" title="Change content" onClick={replace}>
            <Replace size={13} />
          </button>
        )}
        <button className="icon-btn" title="Close pane" onClick={onClose}>
          <X size={13} />
        </button>
      </div>
      <div className="pane-body">{body}</div>
    </div>
  )
}
