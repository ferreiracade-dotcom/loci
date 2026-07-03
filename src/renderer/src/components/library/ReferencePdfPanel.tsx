import { useEffect, useState } from 'react'
import { GripVertical } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { api } from '../../lib/api'
import { PdfReader } from './PdfReader'
import { OpenInCenterButton } from './OpenInCenterButton'

/** A PDF in the reference panel, with its own picker — independent of the center. */
export function ReferencePdfPanel() {
  const books = useStore((s) => s.books)
  const [bookId, setBookId] = useState<string | null>(null)

  // Clear the reference PDF once it's promoted to the center (avoids showing it twice).
  const clear = (): void => {
    setBookId(null)
    void api.setSession('refPdf', '')
  }

  // Restore the last reference PDF, if it still exists.
  useEffect(() => {
    void api.getSession('refPdf').then((id) => {
      if (id && books.some((b) => b.id === id)) setBookId(id)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [books.length])

  const pick = (id: string): void => {
    setBookId(id || null)
    void api.setSession('refPdf', id)
  }

  if (books.length === 0) {
    return <div className="quotes-empty">No PDFs in your library yet.</div>
  }

  return (
    <div className="ref-pdf">
      <div className="ref-pdf-head">
        {bookId && (
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
        <select
          className="book-select"
          value={bookId ?? ''}
          onChange={(e) => pick(e.target.value)}
        >
          <option value="">Choose a PDF…</option>
          {books.map((b) => (
            <option key={b.id} value={b.id}>
              {b.title}
            </option>
          ))}
        </select>
        <OpenInCenterButton content={bookId ? { kind: 'pdf', bookId } : null} onDone={clear} />
      </div>
      {bookId ? (
        <div className="ref-pdf-stage">
          <PdfReader key={bookId} bookId={bookId} embedded />
        </div>
      ) : (
        <div className="quotes-empty">Pick a PDF above to view it here.</div>
      )}
    </div>
  )
}
