import { useEffect, useState } from 'react'
import { FileText, ArrowLeft, FilePlus, X } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { api } from '../../lib/api'
import { RichNoteEditor } from './RichNoteEditor'

export function StandaloneNotesPanel() {
  const notes = useStore((s) => s.standaloneNotes)
  const sidebarNotePath = useStore((s) => s.sidebarNotePath)
  const openSidebarNote = useStore((s) => s.openSidebarNote)
  const closeSidebarNote = useStore((s) => s.closeSidebarNote)
  const loadStandaloneNotes = useStore((s) => s.loadStandaloneNotes)
  // Remounting the editor on this token surfaces quotes inserted into the note (Part C).
  const noteReloadToken = useStore((s) => s.noteReloadToken)

  const [creating, setCreating] = useState(false)
  const [title, setTitle] = useState('')

  // Restore the last sidebar note on mount, if it still exists.
  useEffect(() => {
    if (sidebarNotePath) return
    void api.getSession('sidebarNote').then((p) => {
      if (p && notes.some((n) => n.path === p)) openSidebarNote(p)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes])

  const commitNew = async (): Promise<void> => {
    const t = title.trim()
    setCreating(false)
    setTitle('')
    if (!t) return
    const note = await api.createNote(t)
    await loadStandaloneNotes()
    openSidebarNote(note.path)
  }

  // ---- Editor mode: a single note open for editing in the sidebar ----
  if (sidebarNotePath) {
    const open = notes.find((n) => n.path === sidebarNotePath)
    return (
      <div className="sidebar-note">
        <div className="sidebar-note-head">
          <button className="icon-btn" title="Back to notes" onClick={closeSidebarNote}>
            <ArrowLeft size={15} />
          </button>
          <span className="sidebar-note-title">{open?.title ?? 'Note'}</span>
          <button className="icon-btn" title="Close note" onClick={closeSidebarNote}>
            <X size={14} />
          </button>
        </div>
        <div className="sidebar-note-body">
          <RichNoteEditor key={`${sidebarNotePath}#${noteReloadToken}`} path={sidebarNotePath} />
        </div>
      </div>
    )
  }

  // ---- List mode ----
  return (
    <div className="sidebar-note-list">
      <div className="sidebar-note-head">
        <span className="sidebar-note-title">Standalone notes</span>
        <button className="icon-btn" title="New note" onClick={() => setCreating(true)}>
          <FilePlus size={15} />
        </button>
      </div>

      {creating && (
        <div className="note-new">
          <input
            className="note-new-input"
            autoFocus
            placeholder="Note title…"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void commitNew()
              else if (e.key === 'Escape') {
                setCreating(false)
                setTitle('')
              }
            }}
          />
          <button className="btn btn-sm" onClick={() => void commitNew()}>
            Add
          </button>
        </div>
      )}

      {notes.length === 0 ? (
        <div className="quotes-empty">
          No standalone notes yet. Create one above, or press <b>Ctrl+Shift+N</b>.
        </div>
      ) : (
        <div className="backlinks-list">
          {notes.map((n) => (
            <button
              key={n.path}
              className="backlink-row"
              onClick={() => openSidebarNote(n.path)}
            >
              <FileText size={14} />
              <span>{n.title}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
