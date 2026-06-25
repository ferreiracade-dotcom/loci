import { useEffect, useState, type MouseEvent } from 'react'
import { FilePlus, FileText, Trash2, Columns2, X } from 'lucide-react'
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
  const splitNotePath = useStore((s) => s.splitNotePath)
  const openNote = useStore((s) => s.openNote)
  const openNoteInSplit = useStore((s) => s.openNoteInSplit)
  const closeSplitNote = useStore((s) => s.closeSplitNote)
  const createNote = useStore((s) => s.createNote)
  const deleteNote = useStore((s) => s.deleteNote)

  const [creating, setCreating] = useState(false)
  const [title, setTitle] = useState('')
  const [newType, setNewType] = useState<NoteType>('note')
  const [filter, setFilter] = useState<'all' | NoteType>('all')
  const [menu, setMenu] = useState<{ x: number; y: number; path: string; title: string } | null>(
    null
  )

  useEffect(() => {
    if (!menu) return
    const onDoc = (): void => setMenu(null)
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setMenu(null)
    }
    window.addEventListener('click', onDoc)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('click', onDoc)
      window.removeEventListener('keydown', onKey)
    }
  }, [menu])

  const commitNew = (): void => {
    const t = title.trim()
    setCreating(false)
    setTitle('')
    if (t) void createNote(t, newType)
  }

  const onRowMenu = (e: MouseEvent, path: string, t: string): void => {
    e.preventDefault()
    setMenu({ x: e.clientX, y: e.clientY, path, title: t })
  }

  const shown = filter === 'all' ? notes : notes.filter((n) => n.type === filter)
  const splitTitle = notes.find((n) => n.path === splitNotePath)?.title ?? 'Note'

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
                onContextMenu={(e) => onRowMenu(e, n.path, n.title)}
              >
                <FileText size={14} />
                <span className="note-row-title">{n.title}</span>
                <span className={`note-type-badge ${n.type}`}>{TYPE_LABEL[n.type]}</span>
                {!compact && (
                  <button
                    className="note-row-split"
                    title="Open in split pane"
                    onClick={(e) => {
                      e.stopPropagation()
                      openNoteInSplit(n.path)
                    }}
                  >
                    <Columns2 size={13} />
                  </button>
                )}
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
          <div className="notes-edit-split">
            <NoteEditor key={activeNotePath} path={activeNotePath} />
            {splitNotePath && !compact && (
              <div className="notes-split-pane">
                <div className="split-head">
                  <span className="split-title">{splitTitle}</span>
                  <button className="icon-btn" title="Close split" onClick={closeSplitNote}>
                    <X size={14} />
                  </button>
                </div>
                <NoteEditor key={splitNotePath} path={splitNotePath} />
              </div>
            )}
          </div>
        ) : (
          <EmptyState
            icon={FileText}
            title="No note open"
            subtitle="Select a note on the left, or create a new one. Ctrl+Shift+N captures one anywhere."
          />
        )}
      </div>

      {menu && (
        <div
          className="ctx-menu"
          style={{
            top: Math.min(menu.y, window.innerHeight - 160),
            left: Math.min(menu.x, window.innerWidth - 210)
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="ctx-item"
            onClick={() => {
              openNote(menu.path)
              setMenu(null)
            }}
          >
            <FileText size={14} /> Open
          </button>
          {!compact && (
            <button
              className="ctx-item"
              onClick={() => {
                openNoteInSplit(menu.path)
                setMenu(null)
              }}
            >
              <Columns2 size={14} /> Open in split
            </button>
          )}
          <div className="ctx-sep" />
          <button
            className="ctx-item ctx-danger"
            onClick={() => {
              const t = menu.title
              const p = menu.path
              setMenu(null)
              if (window.confirm(`Delete “${t}”?`)) void deleteNote(p)
            }}
          >
            <Trash2 size={14} /> Delete
          </button>
        </div>
      )}
    </div>
  )
}
