import { useEffect, useRef, useState, type MouseEvent } from 'react'
import {
  FilePlus,
  FileText,
  Trash2,
  Columns2,
  X,
  PanelLeftClose,
  PanelLeftOpen
} from 'lucide-react'
import { useStore } from '../../store/useStore'
import { api } from '../../lib/api'
import { RichNoteEditor as NoteEditor } from './RichNoteEditor'
import { Divider } from '../Divider'
import { EmptyState } from '../EmptyState'

export function NotesView({ compact = false }: { compact?: boolean }) {
  const notes = useStore((s) => s.standaloneNotes)
  const activeNotePath = useStore((s) => s.activeNotePath)
  const splitNotePath = useStore((s) => s.splitNotePath)
  const tagFilter = useStore((s) => s.notesTagFilter)
  const setTagFilter = useStore((s) => s.setNotesTagFilter)
  const openNote = useStore((s) => s.openNote)
  const openNoteInLeft = useStore((s) => s.openNoteInLeft)
  const openNoteInSplit = useStore((s) => s.openNoteInSplit)
  const closeSplitNote = useStore((s) => s.closeSplitNote)
  const closeLeftNote = useStore((s) => s.closeLeftNote)
  const createNote = useStore((s) => s.createNote)
  const deleteNote = useStore((s) => s.deleteNote)

  const [creating, setCreating] = useState(false)
  const [title, setTitle] = useState('')
  const [listCollapsed, setListCollapsed] = useState(false)
  const [ratio, setRatio] = useState(0.5)
  const splitRef = useRef<HTMLDivElement>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; path: string; title: string } | null>(
    null
  )

  useEffect(() => {
    void api.getSession('notesListCollapsed').then((v) => setListCollapsed(v === '1'))
  }, [])

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

  function toggleList(next: boolean): void {
    setListCollapsed(next)
    void api.setSession('notesListCollapsed', next ? '1' : '')
  }

  const onSplitDrag = (dx: number): void => {
    const w = splitRef.current?.clientWidth ?? 1
    setRatio((r) => Math.min(0.8, Math.max(0.2, r + dx / w)))
  }

  const commitNew = (): void => {
    const t = title.trim()
    setCreating(false)
    setTitle('')
    if (t) void createNote(t)
  }

  const onRowMenu = (e: MouseEvent, path: string, t: string): void => {
    e.preventDefault()
    setMenu({ x: e.clientX, y: e.clientY, path, title: t })
  }

  const allTags = [...new Set(notes.flatMap((n) => n.tags))].sort((a, b) => a.localeCompare(b))
  const shown = tagFilter ? notes.filter((n) => n.tags.includes(tagFilter)) : notes
  const leftTitle = notes.find((n) => n.path === activeNotePath)?.title ?? 'Note'
  const splitTitle = notes.find((n) => n.path === splitNotePath)?.title ?? 'Note'
  const showSplit = !!splitNotePath && !compact

  return (
    <div className={`notes-view${compact ? ' compact' : ''}`}>
      {listCollapsed ? (
        <div className="notes-list-rail">
          <button className="rail-btn" title="Show notes list" onClick={() => toggleList(false)}>
            <PanelLeftOpen size={16} />
          </button>
          <button
            className="rail-btn"
            title="New note"
            onClick={() => {
              toggleList(false)
              setCreating(true)
            }}
          >
            <FilePlus size={15} />
          </button>
          <div className="rail-sep" />
          <div className="rail-notes">
            {notes.map((n) => (
              <button
                key={n.path}
                className={`rail-note${activeNotePath === n.path ? ' active' : ''}`}
                title={n.title}
                onClick={() => openNote(n.path)}
                onContextMenu={(e) => onRowMenu(e, n.path, n.title)}
              >
                <FileText size={15} />
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="notes-list-col">
          <div className="notes-list-head">
            <span>Standalone notes</span>
            <div className="nlh-actions">
              <button className="icon-btn" title="New note" onClick={() => setCreating(true)}>
                <FilePlus size={16} />
              </button>
              <button className="icon-btn" title="Hide list" onClick={() => toggleList(true)}>
                <PanelLeftClose size={15} />
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

          <div className="notes-list-scroll">
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
                  onContextMenu={(e) => onRowMenu(e, n.path, n.title)}
                >
                  <FileText size={14} />
                  <span className="note-row-title">{n.title}</span>
                  {!compact && (
                    <button
                      className="note-row-split"
                      title="Open in Note 2 (right)"
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
      )}

      <div className="notes-edit-col">
        {activeNotePath ? (
          <div className="notes-edit-split" ref={splitRef}>
            {showSplit ? (
              <>
                <div className="notes-pane" style={{ flex: `${ratio} 1 0%` }}>
                  <div className="split-head">
                    <span className="split-slot">1</span>
                    <span className="split-title">{leftTitle}</span>
                    <button
                      className="icon-btn"
                      title="Close Note 1 (Note 2 becomes Note 1)"
                      onClick={closeLeftNote}
                    >
                      <X size={14} />
                    </button>
                  </div>
                  <NoteEditor key={activeNotePath} path={activeNotePath} />
                </div>
                <Divider onDrag={onSplitDrag} onDragEnd={() => undefined} />
                <div className="notes-split-pane" style={{ flex: `${1 - ratio} 1 0%` }}>
                  <div className="split-head">
                    <span className="split-slot">2</span>
                    <span className="split-title">{splitTitle}</span>
                    <button className="icon-btn" title="Close Note 2" onClick={closeSplitNote}>
                      <X size={14} />
                    </button>
                  </div>
                  <NoteEditor key={splitNotePath} path={splitNotePath} />
                </div>
              </>
            ) : (
              <NoteEditor key={activeNotePath} path={activeNotePath} />
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
              if (compact) openNote(menu.path)
              else openNoteInLeft(menu.path)
              setMenu(null)
            }}
          >
            <FileText size={14} /> {compact ? 'Open' : 'Open in Note 1 (left)'}
          </button>
          {!compact && (
            <button
              className="ctx-item"
              onClick={() => {
                openNoteInSplit(menu.path)
                setMenu(null)
              }}
            >
              <Columns2 size={14} /> Open in Note 2 (right)
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
