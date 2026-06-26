import { useEffect, useState } from 'react'
import { BookOpen, FileText, ChevronRight, ChevronDown } from 'lucide-react'
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

/** Book cover for a group header; a kind icon for the Notes group. */
function GroupThumb({ bookId, books }: { bookId: string | null; books: Book[] }) {
  const book = bookId ? books.find((b) => b.id === bookId) : undefined
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
    <div className="hit-thumb hit-thumb-fallback">
      {bookId ? <BookOpen size={15} /> : <FileText size={15} />}
    </div>
  )
}

interface Group {
  key: string
  title: string
  bookId: string | null
  items: { h: SearchHit; i: number }[]
}

export function SearchResults({ onHit }: { onHit: (h: SearchHit, index: number) => void }) {
  const results = useStore((s) => s.searchResults)
  const activeHit = useStore((s) => s.activeHit)
  const books = useStore((s) => s.books)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  // Group hits by book (note hits collect under one "Notes" group), in order.
  const groups: Group[] = []
  const byKey = new Map<string, Group>()
  results.forEach((h, i) => {
    const key = h.bookId ? `b:${h.bookId}` : 'notes'
    let g = byKey.get(key)
    if (!g) {
      g = {
        key,
        title: h.bookId ? books.find((b) => b.id === h.bookId)?.title ?? h.title : 'Notes',
        bookId: h.bookId,
        items: []
      }
      byKey.set(key, g)
      groups.push(g)
    }
    g.items.push({ h, i })
  })

  const toggle = (key: string): void =>
    setExpanded((prev) => {
      const n = new Set(prev)
      if (n.has(key)) n.delete(key)
      else n.add(key)
      return n
    })

  const childLabel = (h: SearchHit): string => {
    if (h.kind === 'note') return h.title || 'Note'
    if (h.page != null) return `p. ${h.page}`
    return h.kind === 'quote' ? 'Quote' : '—'
  }

  return (
    <div className="search-results">
      {groups.map((g) => {
        const open = expanded.has(g.key) || g.items.some((x) => x.i === activeHit)
        return (
          <div className="hit-group" key={g.key}>
            <button className="hit-group-head" onClick={() => toggle(g.key)}>
              {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <GroupThumb bookId={g.bookId} books={books} />
              <span className="hit-group-title">{g.title}</span>
              <span className="hit-group-count">{g.items.length}</span>
            </button>
            {open && (
              <div className="hit-children">
                {g.items.map(({ h, i }) => (
                  <button
                    key={i}
                    className={`hit-child${i === activeHit ? ' active' : ''}`}
                    onClick={() => onHit(h, i)}
                  >
                    <div className="hit-child-head">
                      <span className="hit-child-loc">{childLabel(h)}</span>
                      {h.kind === 'quote' && h.usedInCount > 0 && (
                        <span className="hit-used">used in {h.usedInCount}</span>
                      )}
                    </div>
                    <Snippet text={h.snippet} />
                  </button>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
