import { useEffect, useState } from 'react'
import { Search as SearchIcon, DatabaseZap, X } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { SearchResults } from './SearchResults'
import type { SearchHit, SearchKind } from '@shared/ipc'

const KINDS: { id: SearchKind; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'page', label: 'Books' },
  { id: 'quote', label: 'Quotes' },
  { id: 'note', label: 'Notes' }
]

export function SearchView({ compact = false }: { compact?: boolean }) {
  const shelves = useStore((s) => s.shelves)
  const tags = useStore((s) => s.tags)
  const results = useStore((s) => s.searchResults)
  const query = useStore((s) => s.searchQuery)
  const kind = useStore((s) => s.searchKind)
  const shelfId = useStore((s) => s.searchShelf)
  const tag = useStore((s) => s.searchTag)
  const setSearchQuery = useStore((s) => s.setSearchQuery)
  const setSearchKind = useStore((s) => s.setSearchKind)
  const setSearchShelf = useStore((s) => s.setSearchShelf)
  const setSearchTag = useStore((s) => s.setSearchTag)
  const runSearch = useStore((s) => s.runSearch)
  const openBookAt = useStore((s) => s.openBookAt)
  const openNote = useStore((s) => s.openNote)
  const setActiveHit = useStore((s) => s.setActiveHit)
  const indexing = useStore((s) => s.indexing)
  const startIndexing = useStore((s) => s.startIndexing)
  const cancelIndexing = useStore((s) => s.cancelIndexing)

  const [searching, setSearching] = useState(false)

  useEffect(() => {
    setSearching(true)
    const t = setTimeout(() => {
      void runSearch(query, { kind, shelfId: shelfId || null, tag: tag || null }).finally(() =>
        setSearching(false)
      )
    }, 300)
    return () => clearTimeout(t)
  }, [query, kind, shelfId, tag, runSearch])

  const onHit = (h: SearchHit, index: number): void => {
    setActiveHit(index)
    if ((h.kind === 'page' || h.kind === 'quote') && h.bookId) openBookAt(h.bookId, h.page ?? 1)
    else if (h.kind === 'note' && h.ref) openNote(h.ref)
  }

  return (
    <div className={`search-view${compact ? ' compact' : ''}`}>
      <div className="search-bar">
        <div className="search-input-wrap">
          <SearchIcon size={16} className="search-icon" />
          <input
            className="search-input"
            autoFocus={!compact}
            placeholder="Search books, quotes, notes…"
            value={query}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        {!compact &&
          (indexing ? (
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
          ))}
      </div>

      <div className="search-scope">
        <div className="seg tiny">
          {KINDS.map((k) => (
            <button
              key={k.id}
              className={`seg-btn${kind === k.id ? ' active' : ''}`}
              onClick={() => setSearchKind(k.id)}
            >
              {k.label}
            </button>
          ))}
        </div>
        <select
          className="field scope-shelf"
          value={shelfId}
          onChange={(e) => setSearchShelf(e.target.value)}
        >
          <option value="">All shelves</option>
          {shelves.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        {tags.length > 0 && (
          <select
            className="field scope-shelf"
            value={tag}
            onChange={(e) => setSearchTag(e.target.value)}
          >
            <option value="">All tags</option>
            {tags.map((t) => (
              <option key={t.id} value={t.name}>
                #{t.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {query.trim() && !searching && results.length === 0 ? (
        <div className="quotes-empty">
          No matches. If books look unsearchable, use <b>Build index</b> in the Search view (it runs
          in the background).
        </div>
      ) : (
        <SearchResults onHit={onHit} />
      )}
    </div>
  )
}
