import { useState } from 'react'
import { FilePlus, FileText, Trash2 } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { NoteEditor } from './NoteEditor'
import { EmptyState } from '../EmptyState'
import type { NoteType } from '@shared/ipc'

const TYPE_LABEL: Record<NoteType, string> = {
  note: 'Note',
  page: 'Page',
  chapter: 'Chapter',
  topic: 'Topic',
  'book-note': 'Book'
}
const CREATE_TYPES: NoteType[] = ['note', 'topic', 'chapter', 'page']
const FILTERS: ('all' | NoteType)[] = ['all', 'note', 'topic', 'chapter', 'page']

export function NotesView({ compact = false }: { compact?: boolean }) {
  const notes = useStore((s) => s.standaloneNotes)
  const activeNotePath = useStore((s) => s.activeNotePath)
  const openNote = useStore((s) => s.openNote)
  const createNote = useStore((s) => s.createNote)
  const deleteNote = useStore((s) => s.deleteNote)

  const [creating, setCreating] = useState(false)
  const [title, setTitle] = useState('')
  const [newType, setNewType] = useState<NoteType>('note')
  const [filter, setFilter] = useState<'all' | NoteType>('all')

  const commitNew = (): void => {
    const t = title.trim()
    setCreating(false)
    setTitle('')
    if (t) void createNote(t, newType)
  }

  const shown = filter === 'all' ? notes : notes.filter((n) => n.type === filter)

  return (
    <div className={`notes-view${compact ? ' compact' : ''}`}>
      <div className="notes-list-col">
        <div className="notes-list-head">
          <span>Standalone notes</span>
          <button className="icon-btn" title="New note" onClick={() => setCreating(true)}>
            <FilePlus size={16} />
          </button>
        </div>

        <div className="notes-filter">
          {FILTERS.map((f) => (
            <button
              key={f}
              className={`nf-chip${filter === f ? ' active' : ''}`}
              onClick={() => setFilter(f)}
            >
              {f === 'all' ? 'All' : TYPE_LABEL[f]}
            </button>
          ))}
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
                if (e.key === 'Enter') commitNew()
                else if (e.key === 'Escape') {
                  setCreating(false)
                  setTitle('')
                }
              }}
            />
            <select
              className="note-new-type"
              value={newType}
              onChange={(e) => setNewType(e.target.value as NoteType)}
            >
              {CREATE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABEL[t]}
                </option>
              ))}
            </select>
            <button className="btn btn-sm" onClick={commitNew}>
              Add
            </button>
          </div>
        )}

        <div className="notes-list-scroll">
          {shown.length === 0 && !creating ? (
            <div className="notes-list-empty">
              {filter === 'all'
                ? 'No standalone notes yet.'
                : `No ${TYPE_LABEL[filter as NoteType].toLowerCase()} notes.`}
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
                <span className={`note-type-badge ${n.type}`}>{TYPE_LABEL[n.type]}</span>
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
