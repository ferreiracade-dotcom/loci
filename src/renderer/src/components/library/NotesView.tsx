import { useState } from 'react'
import { FilePlus, FileText, Trash2, Columns2 } from 'lucide-react'
import { useStore } from '../../store/useStore'

/**
 * The notes-list navigator (full-center). Picking a note opens it in a center workspace pane;
 * the editor itself now lives in `PaneFrame`, not here.
 */
export function NotesView() {
  const notes = useStore((s) => s.standaloneNotes)
  const activeNotePath = useStore((s) => s.activeNotePath)
  const tagFilter = useStore((s) => s.notesTagFilter)
  const setTagFilter = useStore((s) => s.setNotesTagFilter)
  const openNote = useStore((s) => s.openNote)
  const openNoteInSplit = useStore((s) => s.openNoteInSplit)
  const createNote = useStore((s) => s.createNote)
  const deleteNote = useStore((s) => s.deleteNote)

  const [creating, setCreating] = useState(false)
  const [title, setTitle] = useState('')

  const allTags = [...new Set(notes.flatMap((n) => n.tags))].sort((a, b) => a.localeCompare(b))
  const shown = tagFilter ? notes.filter((n) => n.tags.includes(tagFilter)) : notes

  const commitNew = (): void => {
    const t = title.trim()
    setCreating(false)
    setTitle('')
    if (t) void createNote(t)
  }

  return (
    <div className="notes-nav">
      <div className="notes-nav-head">
        <span>Notes</span>
        <button className="icon-btn" title="New note" onClick={() => setCreating(true)}>
          <FilePlus size={16} />
        </button>
      </div>

      {allTags.length > 0 && (
        <div className="notes-filter">
          <button
            className={`nf-chip${!tagFilter ? ' active' : ''}`}
            onClick={() => setTagFilter(null)}
          >
            All
          </button>
          {allTags.map((t) => (
            <button
              key={t}
              className={`nf-chip${tagFilter === t ? ' active' : ''}`}
              onClick={() => setTagFilter(tagFilter === t ? null : t)}
            >
              #{t}
            </button>
          ))}
        </div>
      )}

      {creating && (
        <div className="note-new">
          <input
            className="note-new-input"
            autoFocus
            placeholder="Note title…"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitNew()
              else if (e.key === 'Escape') {
                setCreating(false)
                setTitle('')
              }
            }}
          />
          <button className="btn btn-sm" onClick={commitNew}>
            Add
          </button>
        </div>
      )}

      <div className="notes-nav-list">
        {shown.length === 0 && !creating ? (
          <div className="notes-list-empty">
            {tagFilter ? `No notes tagged #${tagFilter}.` : 'No standalone notes yet.'}
          </div>
        ) : (
          shown.map((n) => (
            <div
              key={n.path}
              className={`note-row${activeNotePath === n.path ? ' active' : ''}`}
              onClick={() => openNote(n.path)}
            >
              <FileText size={14} />
              <span className="note-row-title">{n.title}</span>
              <button
                className="note-row-split"
                title="Open in a second pane"
                onClick={(e) => {
                  e.stopPropagation()
                  openNoteInSplit(n.path)
                }}
              >
                <Columns2 size={13} />
              </button>
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
  )
}
