import { useEffect, useState } from 'react'
import { X, RefreshCw, Trash2, BookOpen, Image as ImageIcon } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { api } from '../../lib/api'
import { BookCover } from './BookCover'
import type { ReadingStatus } from '@shared/ipc'

const STATUSES: { id: ReadingStatus; label: string }[] = [
  { id: 'unread', label: 'Unread' },
  { id: 'reading', label: 'Reading' },
  { id: 'finished', label: 'Finished' }
]

type Form = {
  title: string
  author: string
  year: string
  publisher: string
  genre: string
  pageOffset: string
}

export function BookInfoDrawer({ bookId, onClose }: { bookId: string; onClose: () => void }) {
  const book = useStore((s) => s.books.find((b) => b.id === bookId))
  const shelves = useStore((s) => s.shelves)
  const updateBook = useStore((s) => s.updateBook)
  const setBookShelves = useStore((s) => s.setBookShelves)
  const setBookTags = useStore((s) => s.setBookTags)
  const deleteBook = useStore((s) => s.deleteBook)
  const refetchMetadata = useStore((s) => s.refetchMetadata)
  const openBook = useStore((s) => s.openBook)
  const refreshLibrary = useStore((s) => s.refreshLibrary)
  const libraryBusy = useStore((s) => s.libraryBusy)
  const [coverKey, setCoverKey] = useState(0)

  const changeCover = async (): Promise<void> => {
    const url = await api.setBookCover(bookId)
    if (url) {
      await refreshLibrary()
      setCoverKey((k) => k + 1)
    }
  }

  const [form, setForm] = useState<Form>({
    title: '',
    author: '',
    year: '',
    publisher: '',
    genre: '',
    pageOffset: '0'
  })
  const [tagText, setTagText] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const bookKey = book ? `${book.id}:${book.author ?? ''}:${book.year ?? ''}:${book.genre ?? ''}` : ''
  useEffect(() => {
    if (book) {
      setForm({
        title: book.title,
        author: book.author ?? '',
        year: book.year?.toString() ?? '',
        publisher: book.publisher ?? '',
        genre: book.genre ?? '',
        pageOffset: book.pageOffset.toString()
      })
      setTagText(book.tags.join(', '))
    }
    // Resync when identity or fetched metadata changes (so Refetch shows new values).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookKey])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!book) return null

  const set = (k: keyof Form, v: string): void => setForm((f) => ({ ...f, [k]: v }))

  const saveMeta = (): void => {
    void updateBook(book.id, {
      title: form.title.trim() || book.title,
      author: form.author.trim() || null,
      year: form.year.trim() ? Number(form.year) : null,
      publisher: form.publisher.trim() || null,
      genre: form.genre.trim() || null,
      pageOffset: Number(form.pageOffset) || 0
    })
  }
  const toggleShelf = (id: string): void => {
    const next = book.shelfIds.includes(id)
      ? book.shelfIds.filter((x) => x !== id)
      : [...book.shelfIds, id]
    void setBookShelves(book.id, next)
  }
  const commitTags = (): void => {
    void setBookTags(
      book.id,
      tagText
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
    )
  }
  const doDelete = (): void => {
    const id = book.id
    onClose()
    void deleteBook(id)
  }

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div className="drawer wide" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <h2 className="drawer-title">Book info</h2>
          <button className="icon-btn" title="Close" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="drawer-body">
          <div className="bi-top">
            <div className="bi-cover-col">
              <div className="bi-cover">
                <BookCover key={coverKey} id={book.id} hasCover={book.hasCover} title={book.title} />
              </div>
              <button className="btn btn-sm bi-setcover" onClick={() => void changeCover()}>
                <ImageIcon size={13} /> Set cover…
              </button>
            </div>
            <div className="bi-status">
              <div className="set-label">Reading status</div>
              <div className="seg">
                {STATUSES.map((s) => (
                  <button
                    key={s.id}
                    className={`seg-btn${book.status === s.id ? ' active' : ''}`}
                    onClick={() => void updateBook(book.id, { status: s.id })}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              <button
                className="btn btn-sm bi-refetch"
                disabled={libraryBusy}
                onClick={() => void refetchMetadata(book.id)}
              >
                <RefreshCw size={14} className={libraryBusy ? 'spin' : ''} /> Refetch metadata
              </button>
            </div>
          </div>

          <section className="set-section">
            <h3 className="set-h">Details</h3>
            <label className="set-label">Title</label>
            <input className="field" value={form.title} onChange={(e) => set('title', e.target.value)} />
            <label className="set-label">Author</label>
            <input className="field" value={form.author} onChange={(e) => set('author', e.target.value)} />
            <div className="field-grid">
              <div>
                <label className="set-label">Year</label>
                <input
                  className="field"
                  value={form.year}
                  inputMode="numeric"
                  onChange={(e) => set('year', e.target.value)}
                />
              </div>
              <div>
                <label className="set-label">Page offset</label>
                <input
                  className="field"
                  value={form.pageOffset}
                  inputMode="numeric"
                  onChange={(e) => set('pageOffset', e.target.value)}
                />
              </div>
            </div>
            <label className="set-label">Publisher</label>
            <input
              className="field"
              value={form.publisher}
              onChange={(e) => set('publisher', e.target.value)}
            />
            <label className="set-label">Genre</label>
            <input className="field" value={form.genre} onChange={(e) => set('genre', e.target.value)} />
            <button className="btn btn-primary btn-sm bi-save" onClick={saveMeta}>
              Save details
            </button>
          </section>

          <section className="set-section">
            <h3 className="set-h">Shelves</h3>
            <div className="check-list">
              {shelves.map((s) => (
                <label key={s.id} className="check-row">
                  <input
                    type="checkbox"
                    checked={book.shelfIds.includes(s.id)}
                    onChange={() => toggleShelf(s.id)}
                  />
                  <span>{s.name}</span>
                </label>
              ))}
            </div>
          </section>

          <section className="set-section">
            <h3 className="set-h">Tags</h3>
            <input
              className="field"
              placeholder="comma, separated, tags"
              value={tagText}
              onChange={(e) => setTagText(e.target.value)}
              onBlur={commitTags}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitTags()
              }}
            />
            <p className="folder-hint">Press Enter or click away to save.</p>
          </section>

          <section className="set-section">
            <h3 className="set-h">Reading</h3>
            <button
              className="btn btn-sm btn-primary"
              onClick={() => {
                onClose()
                openBook(book.id)
              }}
            >
              <BookOpen size={14} /> Open in reader
            </button>
            {book.lastPage > 1 && <p className="folder-hint">Resumes on page {book.lastPage}.</p>}
          </section>

          <section className="set-section">
            <h3 className="set-h">Danger zone</h3>
            {confirmDelete ? (
              <div className="confirm-row">
                <span>Delete “{book.title}” and its cached PDF?</span>
                <button className="btn btn-sm" onClick={() => setConfirmDelete(false)}>
                  Cancel
                </button>
                <button className="btn btn-sm danger-btn" onClick={doDelete}>
                  <Trash2 size={14} /> Delete
                </button>
              </div>
            ) : (
              <button className="btn btn-sm" onClick={() => setConfirmDelete(true)}>
                <Trash2 size={14} /> Delete book
              </button>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
