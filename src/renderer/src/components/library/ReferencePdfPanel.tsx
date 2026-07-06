import { useEffect, useState } from 'react'
import { GripVertical, Search, Replace } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { api } from '../../lib/api'
import { bookMatchesQuery } from '../../lib/bookSearch'
import { PdfReader } from './PdfReader'
import { OpenInCenterButton } from './OpenInCenterButton'
import { BookListRow } from './LibraryView'

/** A PDF in the reference panel, with its own picker — independent of the center. */
export function ReferencePdfPanel() {
  const books = useStore((s) => s.books)
  const [bookId, setBookId] = useState<string | null>(null)
  const [browsing, setBrowsing] = useState(true)
  const [q, setQ] = useState('')

  // Clear the reference PDF once it's promoted to the center (avoids showing it twice).
  const clear = (): void => {
    setBookId(null)
    setBrowsing(true)
    void api.setSession('refPdf', '')
  }

  // Restore the last reference PDF, if it still exists.
  useEffect(() => {
    void api.getSession('refPdf').then((id) => {
      if (id && books.some((b) => b.id === id)) {
        setBookId(id)
        setBrowsing(false)
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [books.length])

  const pick = (id: string): void => {
    setBookId(id)
    setBrowsing(false)
    setQ('')
    void api.setSession('refPdf', id)
  }

  if (books.length === 0) {
    return <div className="quotes-empty">No PDFs in your library yet.</div>
  }

  const book = books.find((b) => b.id === bookId)
  const filtered = q.trim() ? books.filter((b) => bookMatchesQuery(b, q)) : books

  return (
    <div className="ref-pdf">
      <div className="ref-pdf-head">
        {bookId && !browsing && (
          <span
            className="ref-drag-handle"
            draggable
            title="Drag this book into a project"
            onDragStart={(e) => {
              e.dataTransfer.setData('application/x-loci-book', bookId)
              e.dataTransfer.effectAllowed = 'copy'
            }}
          >
            <GripVertical size={14} />
          </span>
        )}
        {bookId && !browsing ? (
          <>
            <span className="ref-pdf-title" title={book?.title}>
              {book?.title ?? 'Book'}
            </span>
            <button className="icon-btn" title="Choose a different book" onClick={() => setBrowsing(true)}>
              <Replace size={14} />
            </button>
          </>
        ) : (
          <div className="ref-pdf-search-wrap">
            <Search size={13} className="ref-pdf-search-icon" />
            <input
              className="ref-pdf-search"
              autoFocus
              placeholder="Search your library…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        )}
        <OpenInCenterButton content={bookId ? { kind: 'pdf', bookId } : null} onDone={clear} />
      </div>
      {browsing ? (
        <div className="ref-pdf-browse">
          {filtered.length === 0 ? (
            <div className="pp-empty">No matches.</div>
          ) : (
            <div className="list">
              {filtered.map((b) => (
                <BookListRow
                  key={b.id}
                  book={b}
                  onRead={() => pick(b.id)}
                  onOpen={() => pick(b.id)}
                  onMenu={(e) => e.preventDefault()}
                />
              ))}
            </div>
          )}
        </div>
      ) : bookId ? (
        <div className="ref-pdf-stage">
          <PdfReader key={bookId} bookId={bookId} embedded />
        </div>
      ) : (
        <div className="quotes-empty">Pick a book above to view it here.</div>
      )}
    </div>
  )
}
