import { BookOpen, Quote as QuoteIcon, FileText } from 'lucide-react'
import { useStore } from '../../store/useStore'
import type { SearchHit } from '@shared/ipc'

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

function KindIcon({ kind }: { kind: SearchHit['kind'] }) {
  if (kind === 'quote') return <QuoteIcon size={14} />
  if (kind === 'note') return <FileText size={14} />
  return <BookOpen size={14} />
}

export function SearchResults({ onHit }: { onHit: (h: SearchHit) => void }) {
  const results = useStore((s) => s.searchResults)
  const openBookId = useStore((s) => s.openBookId)

  return (
    <div className="search-results">
      {results.map((h, i) => (
        <button
          key={i}
          className={`hit-row${h.bookId && h.bookId === openBookId ? ' active' : ''}`}
          onClick={() => onHit(h)}
        >
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
  )
}
