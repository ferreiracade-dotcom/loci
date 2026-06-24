import { useEffect, useRef, useState, type TextareaHTMLAttributes } from 'react'
import { Trash2, Plus } from 'lucide-react'
import { useStore } from '../../store/useStore'
import type { Annotation, Quote } from '@shared/ipc'

function AutoTextarea({
  value,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { value: string }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const el = ref.current
    if (el) {
      el.style.height = 'auto'
      el.style.height = `${el.scrollHeight}px`
    }
  }, [value])
  return <textarea ref={ref} value={value} {...rest} />
}

function QuoteCard({ q }: { q: Quote }) {
  const setQuoteTags = useStore((s) => s.setQuoteTags)
  const setQuoteAnnotations = useStore((s) => s.setQuoteAnnotations)
  const deleteQuote = useStore((s) => s.deleteQuote)

  const [adding, setAdding] = useState(false)
  const [tagText, setTagText] = useState('')
  const [draft, setDraft] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')

  const persist = (next: Annotation[]): void => void setQuoteAnnotations(q.id, next)

  const addAnnotation = (): void => {
    const text = draft.trim()
    if (!text) return
    persist([...q.annotations, { id: crypto.randomUUID(), text, createdAt: Date.now() }])
    setDraft('')
  }
  const commitEdit = (): void => {
    if (editingId === null) return
    const text = editText.trim()
    const next = text
      ? q.annotations.map((a) => (a.id === editingId ? { ...a, text } : a))
      : q.annotations.filter((a) => a.id !== editingId)
    setEditingId(null)
    persist(next)
  }
  const removeAnnotation = (id: string): void =>
    persist(q.annotations.filter((a) => a.id !== id))

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

      {q.annotations.length > 0 && (
        <div className="anno-list">
          {q.annotations.map((a) =>
            editingId === a.id ? (
              <AutoTextarea
                key={a.id}
                className="anno-edit"
                autoFocus
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                onBlur={commitEdit}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                    e.preventDefault()
                    commitEdit()
                  } else if (e.key === 'Escape') {
                    setEditingId(null)
                  }
                }}
              />
            ) : (
              <div key={a.id} className="anno-item">
                <span
                  className="anno-text"
                  title="Click to edit"
                  onClick={() => {
                    setEditingId(a.id)
                    setEditText(a.text)
                  }}
                >
                  {a.text}
                </span>
                <button
                  className="anno-del"
                  title="Delete note"
                  onClick={() => removeAnnotation(a.id)}
                >
                  ×
                </button>
              </div>
            )
          )}
        </div>
      )}

      <div className="anno-add">
        <AutoTextarea
          className="anno-input"
          placeholder="Add a comment…"
          rows={1}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault()
              addAnnotation()
            }
          }}
        />
        <button className="btn btn-sm anno-save" disabled={!draft.trim()} onClick={addAnnotation}>
          Save
        </button>
      </div>
    </div>
  )
}

export function QuotesPanel() {
  const quotes = useStore((s) => s.quotes)

  if (quotes.length === 0) {
    return (
      <div className="quotes-empty">
        Select text in the PDF and click <b>Add quote</b> to capture it here. Each quote becomes a
        bubble you can tag and comment on — comments are saved to the book&apos;s note and a
        highlights sidecar.
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
