import { useState } from 'react'
import { Trash2, Plus } from 'lucide-react'
import { useStore } from '../../store/useStore'
import type { Quote } from '@shared/ipc'

function QuoteCard({ q }: { q: Quote }) {
  const setQuoteTags = useStore((s) => s.setQuoteTags)
  const deleteQuote = useStore((s) => s.deleteQuote)
  const [adding, setAdding] = useState(false)
  const [tagText, setTagText] = useState('')

  const commit = (): void => {
    const t = tagText.trim().replace(/^#/, '').toLowerCase()
    if (t && !q.tags.includes(t)) void setQuoteTags(q.id, [...q.tags, t])
    setTagText('')
    setAdding(false)
  }
  const removeTag = (t: string): void => void setQuoteTags(q.id, q.tags.filter((x) => x !== t))

  return (
    <div className="quote-card">
      <div className="quote-text">{q.text}</div>
      <div className="quote-cite">{q.citation}</div>
      <div className="quote-tags">
        {q.tags.map((t) => (
          <span key={t} className="qtag">
            #{t}
            <button title="Remove tag" onClick={() => removeTag(t)}>
              ×
            </button>
          </span>
        ))}
        {adding ? (
          <input
            className="qtag-input"
            autoFocus
            placeholder="tag"
            value={tagText}
            onChange={(e) => setTagText(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit()
              else if (e.key === 'Escape') {
                setTagText('')
                setAdding(false)
              }
            }}
          />
        ) : (
          <button className="qtag-add" title="Add quote tag" onClick={() => setAdding(true)}>
            <Plus size={12} />
          </button>
        )}
      </div>
      <button className="quote-del" title="Delete quote" onClick={() => void deleteQuote(q.id)}>
        <Trash2 size={13} />
      </button>
    </div>
  )
}

export function QuotesPanel() {
  const quotes = useStore((s) => s.quotes)

  if (quotes.length === 0) {
    return (
      <div className="quotes-empty">
        Select text in the PDF and click <b>Add quote</b> to capture it here. Quotes are saved to the
        book&apos;s note and a highlights sidecar.
      </div>
    )
  }

  return (
    <div className="quotes-list">
      <div className="quotes-count">
        {quotes.length} quote{quotes.length === 1 ? '' : 's'}
      </div>
      {quotes.map((q) => (
        <QuoteCard key={q.id} q={q} />
      ))}
    </div>
  )
}
