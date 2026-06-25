import {
  Fragment,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type TextareaHTMLAttributes
} from 'react'
import { Trash2, Plus, Pencil, Copy, Check } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { formatCitation, parseAuthors, type CitationSource, type CitationStyle } from '@shared/citation'
import type { Annotation, Book, Quote } from '@shared/ipc'

const STYLE_OPTIONS: { id: CitationStyle; label: string }[] = [
  { id: 'footnote', label: 'Footnote' },
  { id: 'short', label: 'Short note' },
  { id: 'author-date', label: 'Author–date' },
  { id: 'bibliography', label: 'Bibliography' }
]

function sourceFromBook(book: Book): CitationSource {
  return {
    kind: 'book',
    authors: parseAuthors(book.author),
    title: book.title,
    publisher: book.publisher,
    city: book.city,
    year: book.year
  }
}

/** Render a citation string with *markdown italics* and [amber placeholders]. */
function renderCitation(text: string): ReactNode {
  const parts = text.split(/(\*[^*]+\*|\[[^\]]+\])/g)
  return parts.map((p, i) => {
    if (p.startsWith('*') && p.endsWith('*')) return <em key={i}>{p.slice(1, -1)}</em>
    if (p.startsWith('[') && p.endsWith(']'))
      return (
        <span key={i} className="cite-ph">
          {p}
        </span>
      )
    return <Fragment key={i}>{p}</Fragment>
  })
}

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

function QuoteCard({ q, book, style }: { q: Quote; book: Book | null; style: CitationStyle }) {
  const setQuoteTags = useStore((s) => s.setQuoteTags)
  const setQuoteAnnotations = useStore((s) => s.setQuoteAnnotations)
  const deleteQuote = useStore((s) => s.deleteQuote)

  const [adding, setAdding] = useState(false)
  const [tagText, setTagText] = useState('')
  const [draft, setDraft] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [copied, setCopied] = useState(false)

  const printedPage = q.page != null && book ? q.page - (book.pageOffset ?? 0) : q.page
  const citation = book ? formatCitation(sourceFromBook(book), style, printedPage) : q.citation
  const verifyPage = !!book && q.page != null && (book.pageOffset ?? 0) === 0

  const copyCitation = (): void => {
    void navigator.clipboard.writeText(citation.replace(/\*/g, '')).then(() => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    })
  }

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
        <div className="quote-cite-row">
          <div className="quote-cite">
            {renderCitation(citation)}
            {verifyPage && (
              <span className="cite-verify" title="No page offset set for this book — the printed page may differ from the PDF page. Set it in Book Info.">
                {' '}
                · verify page
              </span>
            )}
          </div>
          <button
            className="cite-copy"
            title="Copy citation"
            onClick={copyCitation}
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
          </button>
        </div>
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
                  title="Double-click to edit"
                  onDoubleClick={() => {
                    setEditingId(a.id)
                    setEditText(a.text)
                  }}
                >
                  {a.text}
                </span>
                <div className="anno-actions">
                  <button
                    className="anno-act"
                    title="Edit note"
                    onClick={() => {
                      setEditingId(a.id)
                      setEditText(a.text)
                    }}
                  >
                    <Pencil size={12} />
                  </button>
                  <button
                    className="anno-act anno-del"
                    title="Delete note"
                    onClick={() => removeAnnotation(a.id)}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
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
  const openBookId = useStore((s) => s.openBookId)
  const books = useStore((s) => s.books)
  const [style, setStyle] = useState<CitationStyle>('footnote')

  const book = books.find((b) => b.id === openBookId) ?? null

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
      <div className="quotes-head">
        <span className="quotes-count">
          {quotes.length} quote{quotes.length === 1 ? '' : 's'}
        </span>
        <select
          className="cite-style"
          value={style}
          title="Citation style (CMOS 18)"
          onChange={(e) => setStyle(e.target.value as CitationStyle)}
        >
          {STYLE_OPTIONS.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      {quotes.map((q) => (
        <QuoteCard key={q.id} q={q} book={book} style={style} />
      ))}
    </div>
  )
}
