import { X, FileText, BookOpen, ChevronLeft, Replace, LayoutPanelTop } from 'lucide-react'
import { useStore } from '../../store/useStore'
import type { Pane } from '../../store/useStore'
import { RichNoteEditor } from './RichNoteEditor'
import { PdfReader } from './PdfReader'
import { BiblePane } from './BiblePane'
import { PanePicker } from './PanePicker'

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

  const replace = (): void => setPaneEmpty(pane.id)

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
  } else if (pane.kind === 'empty') {
    icon = <LayoutPanelTop size={13} />
    title = 'New pane'
    body = <PanePicker paneId={pane.id} />
  }

  return (
    <div className={`pane-frame${active ? ' active' : ''}`}>
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
