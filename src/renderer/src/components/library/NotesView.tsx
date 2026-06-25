import { useState } from 'react'
import { FilePlus, FileText, Trash2 } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { NoteEditor } from './NoteEditor'
import { EmptyState } from '../EmptyState'

export function NotesView({ compact = false }: { compact?: boolean }) {
  const notes = useStore((s) => s.standaloneNotes)
  const activeNotePath = useStore((s) => s.activeNotePath)
  const openNote = useStore((s) => s.openNote)
  const createNote = useStore((s) => s.createNote)
  const deleteNote = useStore((s) => s.deleteNote)

  const [creating, setCreating] = useState(false)
  const [title, setTitle] = useState('')

  const commitNew = (): void => {
    const t = title.trim()
    setCreating(false)
    setTitle('')
    if (t) void createNote(t)
  }

  return (
    <div className={`notes-view${compact ? ' compact' : ''}`}>
      <div className="notes-list-col">
        <div className="notes-list-head">
          <span>Standalone notes</span>
          <button className="icon-btn" title="New note" onClick={() => setCreating(true)}>
            <FilePlus size={16} />
          </button>
        </div>
        {creating && (
          <input
            className="note-new-input"
            autoFocus
            placeholder="Note title…"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={commitNew}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitNew()
              else if (e.key === 'Escape') {
                setCreating(false)
                setTitle('')
              }
            }}
          />
        )}
        <div className="notes-list-scroll">
          {notes.length === 0 && !creating ? (
            <div className="notes-list-empty">No standalone notes yet.</div>
          ) : (
            notes.map((n) => (
              <div
                key={n.path}
                className={`note-row${activeNotePath === n.path ? ' active' : ''}`}
                onClick={() => openNote(n.path)}
              >
                <FileText size={14} />
                <span className="note-row-title">{n.title}</span>
                <button
                  className="note-row-del"
                  title="Delete note"
                  onClick={(e) => {
                    e.stopPropagation()
                    if (window.confirm(`Delete “${n.title}”?`)) void deleteNote(n.path)
                  }}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
      <div className="notes-edit-col">
        {activeNotePath ? (
          <NoteEditor key={activeNotePath} path={activeNotePath} />
        ) : (
          <EmptyState
            icon={FileText}
            title="No note open"
            subtitle="Select a note on the left, or create a new one. Ctrl+Shift+N captures one anywhere."
          />
        )}
      </div>
    </div>
  )
}
