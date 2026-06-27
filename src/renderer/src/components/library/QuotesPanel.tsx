import {
  Fragment,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type TextareaHTMLAttributes
} from 'react'
import { Trash2, Plus, Pencil, Copy, Check, BookMarked } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { api } from '../../lib/api'
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
  return text.split(/(\*[^*]+\*|\[[^\]]+\])/g).map((p, i) => {
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

export interface CardHandlers {
  onSetTags: (id: string, tags: string[]) => void
  onSetAnnotations: (id: string, annotations: Annotation[]) => void
  onDelete: (id: string) => void
}

export function QuoteCard({
  q,
  book,
  style,
  handlers
}: {
  q: Quote
  book: Book | null
  style: CitationStyle
  handlers: CardHandlers
}) {
  const [adding, setAdding] = useState(false)
  const [tagText, setTagText] = useState('')
  const [draft, setDraft] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [copied, setCopied] = useState(false)

  const printedPage = q.page != null && book ? q.page - (book.pageOffset ?? 0) : q.page
  const citation = book ? formatCitation(sourceFromBook(book), style, printedPage) : q.citation
  const verifyPage = !!book && q.page != null && (book.pageOffset ?? 0) === 0

  const quoteMarkdown = (): string => {
    const body = q.text.trim().replace(/\n+/g, '\n> ')
    return `> ${body}\n>\n> — ${citation}`
  }

  const copyCitation = (): void => {
    void navigator.clipboard.writeText(quoteMarkdown()).then(() => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    })
  }

  const persist = (next: Annotation[]): void => handlers.onSetAnnotations(q.id, next)

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
  const removeAnnotation = (id: string): void => persist(q.annotations.filter((a) => a.id !== id))

  const commitTag = (): void => {
    const t = tagText.trim().replace(/^#/, '').toLowerCase()
    if (t && !q.tags.includes(t)) handlers.onSetTags(q.id, [...q.tags, t])
    setTagText('')
    setAdding(false)
  }
  const removeTag = (t: string): void =>
    handlers.onSetTags(
      q.id,
      q.tags.filter((x) => x !== t)
    )

  return (
    <div className="quote-card">
      <button className="quote-del" title="Delete quote" onClick={() => handlers.onDelete(q.id)}>
        <Trash2 size={13} />
      </button>
      <div
        className="quote-bubble"
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData('text/plain', quoteMarkdown())
          e.dataTransfer.effectAllowed = 'copy'
        }}
        title="Drag into a note to insert the quote + citation"
      >
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
          <button className="cite-copy" title="Copy quote + citation" onClick={copyCitation}>
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
  const openBookId = useStore((s) => s.openBookId)
  const books = useStore((s) => s.books)
  const storeQuotes = useStore((s) => s.quotes)
  const noteReloadToken = useStore((s) => s.noteReloadToken)
  const refreshLibrary = useStore((s) => s.refreshLibrary)

  const [selectedBookId, setSelectedBookId] = useState<string | null>(openBookId)
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [style, setStyle] = useState<CitationStyle>('footnote')

  const booksWithQuotes = books.filter((b) => b.quoteCount > 0)

  // Auto-jump to the open book; otherwise default to the first cited book.
  useEffect(() => {
    if (openBookId) setSelectedBookId(openBookId)
    else setSelectedBookId((cur) => cur ?? booksWithQuotes[0]?.id ?? null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openBookId, books.length])

  const reload = useCallback(async () => {
    if (!selectedBookId) {
      setQuotes([])
      return
    }
    setQuotes(await api.listQuotes(selectedBookId))
  }, [selectedBookId])

  // Reload when the selected book changes, or when quotes are added/removed
  // (store bumps noteReloadToken), or when the open book's store quotes change.
  useEffect(() => {
    void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload, noteReloadToken, storeQuotes])

  const handlers: CardHandlers = {
    onSetTags: (id, tags) => void api.setQuoteTags(id, tags).then(reload),
    onSetAnnotations: (id, annotations) => {
      setQuotes((qs) => qs.map((q) => (q.id === id ? { ...q, annotations } : q)))
      void api.setQuoteAnnotations(id, annotations)
    },
    onDelete: (id) =>
      void api
        .deleteQuote(id)
        .then(reload)
        .then(() => refreshLibrary())
  }

  const book = books.find((b) => b.id === selectedBookId) ?? null

  if (booksWithQuotes.length === 0) {
    return (
      <div className="quotes-empty">
        Select text in the PDF and click <b>Add quote</b> to capture it here. Each quote becomes a
        bubble you can tag, comment on, copy, or drag into a note.
      </div>
    )
  }

  return (
    <div className="quotes-list">
      <div className="qn-head">
        <BookMarked size={14} />
        <select
          className="book-select"
          value={selectedBookId ?? ''}
          onChange={(e) => setSelectedBookId(e.target.value)}
        >
          {booksWithQuotes.map((b) => (
            <option key={b.id} value={b.id}>
              {b.title}
            </option>
          ))}
        </select>
      </div>

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

      {quotes.length === 0 ? (
        <div className="quotes-empty">No quotes in this book yet.</div>
      ) : (
        quotes.map((q) => <QuoteCard key={q.id} q={q} book={book} style={style} handlers={handlers} />)
      )}
    </div>
  )
}
