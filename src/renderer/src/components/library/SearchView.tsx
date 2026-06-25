import { useEffect, useMemo, useState } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { Search as SearchIcon, BookOpen, Quote as QuoteIcon, FileText, DatabaseZap } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { api } from '../../lib/api'
import type { SearchHit, SearchKind } from '@shared/ipc'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc

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
  const refreshLibrary = useStore((s) => s.refreshLibrary)

  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<SearchKind>('all')
  const [shelfId, setShelfId] = useState<string>('')
  const [results, setResults] = useState<SearchHit[]>([])
  const [searching, setSearching] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)

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

  const buildIndex = async (): Promise<void> => {
    const pending = await api.unindexedBooks()
    if (pending.length === 0) {
      setProgress({ done: 0, total: 0 })
      window.setTimeout(() => setProgress(null), 2000)
      return
    }
    setProgress({ done: 0, total: pending.length })
    for (let i = 0; i < pending.length; i++) {
      setProgress({ done: i, total: pending.length })
      try {
        const data = await api.getBookPdf(pending[i].id)
        if (!data) continue
        const doc = await pdfjsLib.getDocument({ data }).promise
        const pages: { page: number; text: string }[] = []
        for (let n = 1; n <= doc.numPages; n++) {
          const pg = await doc.getPage(n)
          const tc = await pg.getTextContent()
          pages.push({ page: n, text: tc.items.map((it) => ('str' in it ? it.str : '')).join(' ') })
        }
        await api.indexBookText(pending[i].id, pending[i].title, pages)
        void doc.destroy()
      } catch {
        /* skip unreadable book */
      }
    }
    setProgress(null)
    await refreshLibrary()
  }

  const onHit = (h: SearchHit): void => {
    if ((h.kind === 'page' || h.kind === 'quote') && h.bookId) openBookAt(h.bookId, h.page ?? 1)
    else if (h.kind === 'note' && h.ref) openNote(h.ref)
  }

  const hint = useMemo(() => {
    if (progress) {
      return progress.total === 0
        ? 'Everything is already indexed.'
        : `Indexing ${progress.done}/${progress.total} books…`
    }
    return null
  }, [progress])

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
        <button
          className="btn btn-sm"
          title="Extract and index any books not yet searchable"
          disabled={!!progress}
          onClick={() => void buildIndex()}
        >
          <DatabaseZap size={14} /> Build index
        </button>
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

      {hint && <div className="search-hint">{hint}</div>}

      <div className="search-results">
        {query.trim() && !searching && results.length === 0 && (
          <div className="quotes-empty">
            No matches. If books look unsearchable, click <b>Build index</b> above.
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
