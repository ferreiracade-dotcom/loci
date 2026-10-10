import { useEffect, useMemo, useRef, useState } from 'react'
import { GripVertical, Search, Replace } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { api } from '../../lib/api'
import { bookMatchesQuery } from '../../lib/bookSearch'
import { PdfReader } from './PdfReader'
import { OpenInCenterButton } from './OpenInCenterButton'
import { BookListRow } from './LibraryView'
import { KindSwitch } from './KindSwitch'
import { KIND_PLURAL, ofKind } from '@shared/libraryKind'
import type { BookKind } from '@shared/ipc'

/** The Library pill: a book or article in the reference panel, with its own picker — independent
 *  of the center. A Books | Articles switch chooses which list the picker browses. */
export function ReferencePdfPanel() {
  const books = useStore((s) => s.books)
  const [kind, setKind] = useState<BookKind>('book')
  const [bookId, setBookId] = useState<string | null>(null)
  const [browsing, setBrowsing] = useState(true)
  const [q, setQ] = useState('')

  const counts = useMemo<Record<BookKind, number>>(
    () => ({ book: ofKind(books, 'book').length, article: ofKind(books, 'article').length }),
    [books]
  )

  // Clear the reference item once it's promoted to the center (avoids showing it twice).
  const clear = (): void => {
    setBookId(null)
    setBrowsing(true)
    void api.setSession('refPdf', '')
  }

  // Set once a saved item is restored: its own kind wins over the separately saved list choice,
  // whichever of the two session reads resolves first.
  const restoredRef = useRef(false)
  // The saved item is restored only the first time the library has loaded, so importing or
  // deleting while browsing never snaps the switch back.
  const restoredOnceRef = useRef(false)

  useEffect(() => {
    void api.getSession('refLibraryKind').then((v) => {
      if (!restoredRef.current && (v === 'book' || v === 'article')) setKind(v)
    })
  }, [])

  // Restore the last reference item, if it still exists (and show the list it belongs to).
  useEffect(() => {
    if (restoredOnceRef.current || books.length === 0) return
    restoredOnceRef.current = true
    void api.getSession('refPdf').then((id) => {
      const hit = id ? books.find((b) => b.id === id) : undefined
      if (hit) {
        restoredRef.current = true
        setBookId(hit.id)
        setKind(hit.kind)
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

  const changeKind = (k: BookKind): void => {
    setKind(k)
    setBrowsing(true)
    setQ('')
    void api.setSession('refLibraryKind', k)
  }

  if (books.length === 0) {
    return <div className="quotes-empty">No books or articles yet</div>
  }

  const book = books.find((b) => b.id === bookId)
  const ofThisKind = ofKind(books, kind)
  const filtered = q.trim() ? ofThisKind.filter((b) => bookMatchesQuery(b, q)) : ofThisKind
  const plural = KIND_PLURAL[kind].toLowerCase()

  return (
    <div className="ref-corpus-panel">
      <KindSwitch kind={kind} onChange={changeKind} counts={counts} />
      <div className="ref-pdf">
        <div className="ref-pdf-head">
          {bookId && !browsing && (
            <span
              className="ref-drag-handle"
              draggable
              title="Drag this into a project"
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
                {book?.title ?? 'Untitled'}
              </span>
              <button className="icon-btn" title={`Choose a different ${kind}`} onClick={() => setBrowsing(true)}>
                <Replace size={14} />
              </button>
            </>
          ) : (
            <div className="ref-pdf-search-wrap">
              <Search size={13} className="ref-pdf-search-icon" />
              <input
                className="ref-pdf-search"
                autoFocus
                placeholder={`Search ${plural}…`}
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
          )}
          <OpenInCenterButton content={bookId ? { kind: 'pdf', bookId } : null} onDone={clear} />
        </div>
        {browsing ? (
          <div className="ref-pdf-browse">
            {ofThisKind.length === 0 ? (
              <div className="pp-empty">No {plural} yet</div>
            ) : filtered.length === 0 ? (
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
          <div className="quotes-empty">Pick a {kind} above to view it here.</div>
        )}
      </div>
    </div>
  )
}
