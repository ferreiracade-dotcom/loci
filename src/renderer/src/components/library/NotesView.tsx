import { useState } from 'react'
import { FilePlus, FileText, FolderKanban, Trash2, Columns2 } from 'lucide-react'
import { useStore } from '../../store/useStore'
import type { NoteType } from '@shared/ipc'

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

  const [creating, setCreating] = useState<NoteType | null>(null)
  const [title, setTitle] = useState('')

  const allTags = [...new Set(notes.flatMap((n) => n.tags))].sort((a, b) => a.localeCompare(b))
  const shown = tagFilter ? notes.filter((n) => n.tags.includes(tagFilter)) : notes
  const projects = shown.filter((n) => n.type === 'project')
  const regular = shown.filter((n) => n.type !== 'project')

  const commitNew = (): void => {
    const t = title.trim()
    const type = creating === 'project' ? 'project' : undefined
    setCreating(null)
    setTitle('')
    if (t) void createNote(t, type)
  }

  const renderRow = (n: (typeof notes)[number]): React.ReactNode => (
    <div
      key={n.path}
      className={`note-row${activeNotePath === n.path ? ' active' : ''}`}
      onClick={() => openNote(n.path)}
    >
      {n.type === 'project' ? <FolderKanban size={14} /> : <FileText size={14} />}
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
  )

  return (
    <div className="notes-nav">
      <div className="notes-nav-head">
        <span>Notes</span>
        <div className="notes-nav-new">
          <button className="icon-btn" title="New note" onClick={() => setCreating('note')}>
            <FilePlus size={16} />
          </button>
          <button className="icon-btn" title="New project" onClick={() => setCreating('project')}>
            <FolderKanban size={16} />
          </button>
        </div>
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
            placeholder={creating === 'project' ? 'Project title…' : 'Note title…'}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitNew()
              else if (e.key === 'Escape') {
                setCreating(null)
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
          <>
            {projects.length > 0 && (
              <>
                <div className="notes-group-head">Projects</div>
                {projects.map(renderRow)}
              </>
            )}
            {regular.length > 0 && (
              <>
                {projects.length > 0 && <div className="notes-group-head">Notes</div>}
                {regular.map(renderRow)}
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
