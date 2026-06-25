import { useEffect, useState } from 'react'
import { Search as SearchIcon, BookOpen, Quote as QuoteIcon, FileText, DatabaseZap, X } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { api } from '../../lib/api'
import type { SearchHit, SearchKind } from '@shared/ipc'

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

const KINDS: { id: SearchKind; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'page', label: 'Books' },
  { id: 'quote', label: 'Quotes' },
  { id: 'note', label: 'Notes' }
]

function KindIcon({ kind }: { kind: SearchHit['kind'] }) {
  if (kind === 'quote') return <QuoteIcon size={14} />
  if (kind === 'note') return <FileText size={14} />
  return <BookOpen size={14} />
}

export function SearchView() {
  const shelves = useStore((s) => s.shelves)
  const openBookAt = useStore((s) => s.openBookAt)
  const openNote = useStore((s) => s.openNote)
  const indexing = useStore((s) => s.indexing)
  const startIndexing = useStore((s) => s.startIndexing)
  const cancelIndexing = useStore((s) => s.cancelIndexing)

  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<SearchKind>('all')
  const [shelfId, setShelfId] = useState<string>('')
  const [results, setResults] = useState<SearchHit[]>([])
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    if (!query.trim()) {
      setResults([])
      return
    }
    setSearching(true)
    const t = setTimeout(() => {
      void api
        .search(query, { kind, shelfId: shelfId || null })
        .then((r) => setResults(r))
        .finally(() => setSearching(false))
    }, 300)
    return () => clearTimeout(t)
  }, [query, kind, shelfId])

  const onHit = (h: SearchHit): void => {
    if ((h.kind === 'page' || h.kind === 'quote') && h.bookId) openBookAt(h.bookId, h.page ?? 1)
    else if (h.kind === 'note' && h.ref) openNote(h.ref)
  }

  return (
    <div className="search-view">
      <div className="search-bar">
        <div className="search-input-wrap">
          <SearchIcon size={16} className="search-icon" />
          <input
            className="search-input"
            autoFocus
            placeholder="Search books, quotes, and notes…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        {indexing ? (
          <div className="index-progress">
            <span>
              {indexing.total === 0 ? 'Up to date' : `Indexing ${indexing.done}/${indexing.total}`}
            </span>
            {indexing.total > 0 && (
              <button className="btn btn-sm" onClick={cancelIndexing}>
                <X size={14} /> Stop
              </button>
            )}
          </div>
        ) : (
          <button
            className="btn btn-sm"
            title="Extract and index any books not yet searchable (runs in the background)"
            onClick={() => void startIndexing()}
          >
            <DatabaseZap size={14} /> Build index
          </button>
        )}
      </div>

      <div className="search-scope">
        <div className="seg tiny">
          {KINDS.map((k) => (
            <button
              key={k.id}
              className={`seg-btn${kind === k.id ? ' active' : ''}`}
              onClick={() => setKind(k.id)}
            >
              {k.label}
            </button>
          ))}
        </div>
        <select className="field scope-shelf" value={shelfId} onChange={(e) => setShelfId(e.target.value)}>
          <option value="">All shelves</option>
          {shelves.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      <div className="search-results">
        {query.trim() && !searching && results.length === 0 && (
          <div className="quotes-empty">
            No matches. If books look unsearchable, click <b>Build index</b> above (it runs in the
            background — you can keep working).
          </div>
        )}
        {results.map((h, i) => (
          <button key={i} className="hit-row" onClick={() => onHit(h)}>
            <div className="hit-head">
              <span className={`hit-kind ${h.kind}`}>
                <KindIcon kind={h.kind} />
              </span>
              <span className="hit-title">{h.title || 'Untitled'}</span>
              {h.page != null && <span className="hit-page">p. {h.page}</span>}
              {h.kind === 'quote' && h.usedInCount > 0 && (
                <span className="hit-used">used in {h.usedInCount}</span>
              )}
            </div>
            <Snippet text={h.snippet} />
          </button>
        ))}
      </div>
    </div>
  )
}
