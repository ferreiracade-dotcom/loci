import { useEffect, useState } from 'react'
import { BookOpen, Quote as QuoteIcon, FileText } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { api } from '../../lib/api'
import type { Book, SearchHit } from '@shared/ipc'

function Snippet({ text }: { text: string }) {
  const parts = text.split(/⟦|⟧/)
  return (
    <span className="hit-snippet">
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="hit-mark">
            {p}
          </mark>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
    </span>
  )
}

/** A book cover thumbnail for book/quote hits; a kind icon otherwise. */
function HitThumb({ hit, books }: { hit: SearchHit; books: Book[] }) {
  const book = hit.bookId ? books.find((b) => b.id === hit.bookId) : undefined
  const [src, setSrc] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    if (book?.hasCover) {
      void api.getCover(book.id).then((d) => {
        if (alive) setSrc(d)
      })
    } else {
      setSrc(null)
    }
    return () => {
      alive = false
    }
  }, [book?.id, book?.hasCover])

  if (src) return <img className="hit-thumb" src={src} alt="" draggable={false} />
  return (
    <div className={`hit-thumb hit-thumb-fallback ${hit.kind}`}>
      {hit.kind === 'quote' ? (
        <QuoteIcon size={15} />
      ) : hit.kind === 'note' ? (
        <FileText size={15} />
      ) : (
        <BookOpen size={15} />
      )}
    </div>
  )
}

export function SearchResults({ onHit }: { onHit: (h: SearchHit, index: number) => void }) {
  const results = useStore((s) => s.searchResults)
  const activeHit = useStore((s) => s.activeHit)
  const books = useStore((s) => s.books)

  return (
    <div className="search-results">
      {results.map((h, i) => (
        <button
          key={i}
          className={`hit-row${i === activeHit ? ' active' : ''}`}
          onClick={() => onHit(h, i)}
        >
          <HitThumb hit={h} books={books} />
          <div className="hit-body">
            <div className="hit-head">
              <span className="hit-title">{h.title || 'Untitled'}</span>
              {h.page != null && <span className="hit-page">p. {h.page}</span>}
              {h.kind === 'quote' && h.usedInCount > 0 && (
                <span className="hit-used">used in {h.usedInCount}</span>
              )}
            </div>
            <Snippet text={h.snippet} />
          </div>
        </button>
      ))}
    </div>
  )
}
