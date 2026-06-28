import { useState } from 'react'
import { FileText, BookOpen, ScrollText, Plus } from 'lucide-react'
import { useStore } from '../../store/useStore'
import type { PaneContent } from '../../store/useStore'

/**
 * The content picker. Search standalone notes and library books, open the Bible, or type a new
 * name to create a note. With `paneId` it fills that pane; without one (an empty workspace) it
 * opens into a fresh pane.
 */
export function PanePicker({ paneId, heading }: { paneId?: string; heading?: string }) {
  const notes = useStore((s) => s.standaloneNotes)
  const books = useStore((s) => s.books)
  const setPaneContent = useStore((s) => s.setPaneContent)
  const createNoteInPane = useStore((s) => s.createNoteInPane)
  const openInPane = useStore((s) => s.openInPane)
  const createNote = useStore((s) => s.createNote)
  const scripturePassage = useStore((s) => s.scripturePassage)
  const scriptureTranslation = useStore((s) => s.scriptureTranslation)

  const [q, setQ] = useState('')
  const query = q.trim()
  const ql = query.toLowerCase()
  const noteHits = ql ? notes.filter((n) => n.title.toLowerCase().includes(ql)) : notes
  const bookHits = ql ? books.filter((b) => b.title.toLowerCase().includes(ql)) : books

  // Fill the target pane, or open into a fresh pane when there's no target.
  const place = (content: PaneContent): void => {
    if (paneId) setPaneContent(paneId, content)
    else openInPane(content)
  }
  const openBible = (): void => {
    const p = scripturePassage ?? { book: 'JHN', chapter: 1, highlight: [] }
    place({
      kind: 'bible',
      book: p.book,
      chapter: p.chapter,
      highlight: [],
      translation: scriptureTranslation
    })
  }
  const newNote = (): void => {
    if (!query) return
    if (paneId) void createNoteInPane(paneId, query)
    else void createNote(query)
  }

  return (
    <div className="pane-picker">
      <div className="pp-box">
        {heading && <div className="pp-heading">{heading}</div>}
        <input
          className="pp-search"
          autoFocus
          placeholder="Search notes & books, or type a new note name…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && query) newNote()
          }}
        />
        <div className="pp-quick">
          {query && (
            <button className="pp-item pp-new" onClick={newNote}>
              <Plus size={14} />
              <span className="pp-item-title">New note “{query}”</span>
            </button>
          )}
          <button className="pp-item" onClick={openBible}>
            <ScrollText size={14} />
            <span className="pp-item-title">Open the Bible</span>
          </button>
        </div>
        <div className="pp-scroll">
          {noteHits.length > 0 && <div className="pp-sec">Notes</div>}
          {noteHits.map((n) => (
            <button
              key={n.path}
              className="pp-item"
              onClick={() => place({ kind: 'note', notePath: n.path })}
            >
              <FileText size={14} />
              <span className="pp-item-title">{n.title}</span>
            </button>
          ))}
          {bookHits.length > 0 && <div className="pp-sec">Library</div>}
          {bookHits.map((b) => (
            <button
              key={b.id}
              className="pp-item"
              onClick={() => place({ kind: 'pdf', bookId: b.id })}
            >
              <BookOpen size={14} />
              <span className="pp-item-title">{b.title}</span>
            </button>
          ))}
          {noteHits.length === 0 && bookHits.length === 0 && (
            <div className="pp-empty">No matches. Type a name above to create a note.</div>
          )}
        </div>
      </div>
    </div>
  )
}
