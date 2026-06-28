import { useState } from 'react'
import { FileText, BookOpen, ScrollText, Plus } from 'lucide-react'
import { useStore } from '../../store/useStore'

/**
 * The empty-pane content picker. Search standalone notes and library books, open the Bible,
 * or type a new name to create a note — all placed into this pane (`paneId`).
 */
export function PanePicker({ paneId }: { paneId: string }) {
  const notes = useStore((s) => s.standaloneNotes)
  const books = useStore((s) => s.books)
  const setPaneContent = useStore((s) => s.setPaneContent)
  const createNoteInPane = useStore((s) => s.createNoteInPane)
  const scripturePassage = useStore((s) => s.scripturePassage)
  const scriptureTranslation = useStore((s) => s.scriptureTranslation)

  const [q, setQ] = useState('')
  const query = q.trim()
  const ql = query.toLowerCase()
  const noteHits = ql ? notes.filter((n) => n.title.toLowerCase().includes(ql)) : notes
  const bookHits = ql ? books.filter((b) => b.title.toLowerCase().includes(ql)) : books

  const openBible = (): void => {
    const p = scripturePassage ?? { book: 'JHN', chapter: 1, highlight: [] }
    setPaneContent(paneId, {
      kind: 'bible',
      book: p.book,
      chapter: p.chapter,
      highlight: [],
      translation: scriptureTranslation
    })
  }
  const newNote = (): void => {
    if (query) void createNoteInPane(paneId, query)
  }

  return (
    <div className="pane-picker">
      <div className="pp-box">
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
              onClick={() => setPaneContent(paneId, { kind: 'note', notePath: n.path })}
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
              onClick={() => setPaneContent(paneId, { kind: 'pdf', bookId: b.id })}
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
