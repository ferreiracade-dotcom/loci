import { useEffect, useRef, useState } from 'react'
import { BookOpen, FileText, ScrollText, ChevronRight, ChevronDown } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { api } from '../../lib/api'
import { getCachedCover, setCachedCover } from '../../lib/coverCache'
import type { Book, SearchHit } from '@shared/ipc'

/** Group hits by book (page/quote), by chapter ref (scripture), or bundle notes together. */
function groupKeyFor(h: SearchHit): string {
  if (h.bookId) return `b:${h.bookId}`
  if (h.kind === 'scripture' && h.ref) return `s:${h.ref}`
  return 'notes'
}

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

/** Book cover for a group header; a kind icon for the Notes/Scripture groups. */
function GroupThumb({ bookId, kind, books }: { bookId: string | null; kind: string; books: Book[] }) {
  const book = bookId ? books.find((b) => b.id === bookId) : undefined
  const [src, setSrc] = useState<string | null>(() => (book ? (getCachedCover(book.id) ?? null) : null))

  useEffect(() => {
    let alive = true
    if (!book?.hasCover) {
      setSrc(null)
      return
    }
    const cached = getCachedCover(book.id)
    if (cached !== undefined) {
      setSrc(cached)
      return
    }
    void api.getCover(book.id).then((d) => {
      setCachedCover(book.id, d)
      if (alive) setSrc(d)
    })
    return () => {
      alive = false
    }
  }, [book?.id, book?.hasCover])

  if (src) return <img className="hit-thumb" src={src} alt="" draggable={false} />
  return (
    <div className="hit-thumb hit-thumb-fallback">
      {bookId ? <BookOpen size={15} /> : kind === 'scripture' ? <ScrollText size={15} /> : <FileText size={15} />}
    </div>
  )
}

interface Group {
  key: string
  title: string
  bookId: string | null
  kind: string
  items: { h: SearchHit; i: number }[]
}

export function SearchResults({
  onHit,
  results: resultsProp,
  activeHit: activeHitProp
}: {
  onHit: (h: SearchHit, index: number) => void
  /** Defaults to the global search store — pass explicit results for a local, scoped search. */
  results?: SearchHit[]
  activeHit?: number | null
}) {
  const storeResults = useStore((s) => s.searchResults)
  const storeActiveHit = useStore((s) => s.activeHit)
  const results = resultsProp ?? storeResults
  const activeHit = resultsProp ? (activeHitProp ?? null) : storeActiveHit
  const books = useStore((s) => s.books)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const activeChildRef = useRef<HTMLButtonElement | null>(null)

  // Auto-expand the group of a newly active hit (once); it stays collapsible.
  useEffect(() => {
    if (activeHit == null) return
    const h = results[activeHit]
    if (!h) return
    const key = groupKeyFor(h)
    setExpanded((prev) => (prev.has(key) ? prev : new Set(prev).add(key)))
  }, [activeHit, results])

  // When the active hit's group is open, scroll the highlighted hit into view.
  useEffect(() => {
    activeChildRef.current?.scrollIntoView({ block: 'nearest' })
  }, [activeHit, expanded])

  // Group hits by book, by scripture chapter, or bundle notes together, in order.
  const groups: Group[] = []
  const byKey = new Map<string, Group>()
  results.forEach((h, i) => {
    const key = groupKeyFor(h)
    let g = byKey.get(key)
    if (!g) {
      const title = h.bookId
        ? (books.find((b) => b.id === h.bookId)?.title ?? h.title)
        : h.kind === 'scripture'
          ? h.title
          : 'Notes'
      g = { key, title, bookId: h.bookId, kind: h.kind, items: [] }
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
    if (h.kind === 'scripture') return h.page != null ? `v. ${h.page}` : '—'
    if (h.page != null) {
      // Show the book's printed page (PDF page minus its front-matter offset).
      const book = books.find((b) => b.id === h.bookId)
      return `p. ${h.page - (book?.pageOffset ?? 0)}`
    }
    return h.kind === 'quote' ? 'Quote' : '—'
  }

  return (
    <div className="search-results">
      {groups.map((g) => {
        const open = expanded.has(g.key)
        const hasActive = g.items.some((x) => x.i === activeHit)
        return (
          <div className="hit-group" key={g.key}>
            <button
              className={`hit-group-head${hasActive ? ' active' : ''}`}
              onClick={() => toggle(g.key)}
            >
              {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <GroupThumb bookId={g.bookId} kind={g.kind} books={books} />
              <span className="hit-group-title">{g.title}</span>
              <span className="hit-group-count">{g.items.length}</span>
            </button>
            {open && (
              <div className="hit-children">
                {g.items.map(({ h, i }) => (
                  <button
                    key={i}
                    ref={i === activeHit ? activeChildRef : null}
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
