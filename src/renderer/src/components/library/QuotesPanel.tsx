import { useEffect, useRef, useState } from 'react'
import { Trash2, Plus } from 'lucide-react'
import { useStore } from '../../store/useStore'
import type { Quote } from '@shared/ipc'

function QuoteCard({ q }: { q: Quote }) {
  const setQuoteTags = useStore((s) => s.setQuoteTags)
  const setQuoteAnnotation = useStore((s) => s.setQuoteAnnotation)
  const deleteQuote = useStore((s) => s.deleteQuote)

  const [adding, setAdding] = useState(false)
  const [tagText, setTagText] = useState('')
  const [annotation, setAnnotation] = useState(q.annotation)
  const [saved, setSaved] = useState(false)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Reset when this card represents a different quote.
  useEffect(() => {
    setAnnotation(q.annotation)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.id])

  // Auto-grow the textarea to fit its content.
  useEffect(() => {
    const ta = taRef.current
    if (ta) {
      ta.style.height = 'auto'
      ta.style.height = `${ta.scrollHeight}px`
    }
  }, [annotation])

  // Flush a pending save on unmount.
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [])

  const onAnnotation = (val: string): void => {
    setAnnotation(val)
    setSaved(false)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      void setQuoteAnnotation(q.id, val).then(() => setSaved(true))
    }, 800)
  }

  const commitTag = (): void => {
    const t = tagText.trim().replace(/^#/, '').toLowerCase()
    if (t && !q.tags.includes(t)) void setQuoteTags(q.id, [...q.tags, t])
    setTagText('')
    setAdding(false)
  }
  const removeTag = (t: string): void =>
    void setQuoteTags(
      q.id,
      q.tags.filter((x) => x !== t)
    )

  return (
    <div className="quote-card">
      <button className="quote-del" title="Delete quote" onClick={() => void deleteQuote(q.id)}>
        <Trash2 size={13} />
      </button>
      <div className="quote-bubble">
        <div className="quote-text">{q.text}</div>
        <div className="quote-cite">{q.citation}</div>
      </div>

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
            onBlur={commitTag}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitTag()
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

      <textarea
        ref={taRef}
        className="quote-anno"
        placeholder="Comment or annotate this quote…"
        value={annotation}
        rows={1}
        onChange={(e) => onAnnotation(e.target.value)}
      />
      {saved && <div className="anno-saved">Saved</div>}
    </div>
  )
}

export function QuotesPanel() {
  const quotes = useStore((s) => s.quotes)

  if (quotes.length === 0) {
    return (
      <div className="quotes-empty">
        Select text in the PDF and click <b>Add quote</b> to capture it here. Each quote becomes a
        bubble you can tag and annotate underneath — saved to the book&apos;s note and a highlights
        sidecar.
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
