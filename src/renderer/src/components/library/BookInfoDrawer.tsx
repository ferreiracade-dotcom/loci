import { useEffect, useMemo, useState } from 'react'
import { X, Plus, RefreshCw, Trash2, BookOpen, Image as ImageIcon } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { api } from '../../lib/api'
import { splitAuthors, joinAuthors } from '../../lib/authors'
import { DrawerOverlay } from '../DrawerOverlay'
import { BookCover } from './BookCover'
import type { ReadingStatus } from '@shared/ipc'

const STATUSES: { id: ReadingStatus; label: string }[] = [
  { id: 'unread', label: 'Unread' },
  { id: 'reading', label: 'Reading' },
  { id: 'finished', label: 'Finished' }
]

type Form = {
  title: string
  authors: string[]
  series: string
  seriesNumber: string
  seriesAbbr: string
  year: string
  publisher: string
  pageOffset: string
}

export function BookInfoDrawer({ bookId, onClose }: { bookId: string; onClose: () => void }) {
  const book = useStore((s) => s.books.find((b) => b.id === bookId))
  const allBooks = useStore((s) => s.books)
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
    authors: [''],
    series: '',
    seriesNumber: '',
    seriesAbbr: '',
    year: '',
    publisher: '',
    pageOffset: '0'
  })
  const [tagText, setTagText] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Existing authors / series across the library, for the typeaheads.
  const authorOptions = useMemo(
    () => [...new Set(allBooks.flatMap((b) => splitAuthors(b.author)))].sort((a, b) => a.localeCompare(b)),
    [allBooks]
  )
  const seriesOptions = useMemo(
    () =>
      [...new Set(allBooks.map((b) => b.series).filter((s): s is string => !!s && s.trim() !== ''))].sort(
        (a, b) => a.localeCompare(b)
      ),
    [allBooks]
  )
  // Remember each series' abbreviation so picking a known series fills it in.
  const seriesAbbrMap = useMemo(() => {
    const m = new Map<string, string>()
    for (const b of allBooks) {
      if (b.series?.trim() && b.seriesAbbr?.trim() && !m.has(b.series.trim().toLowerCase())) {
        m.set(b.series.trim().toLowerCase(), b.seriesAbbr.trim())
      }
    }
    return m
  }, [allBooks])

  const onSeriesChange = (v: string): void =>
    setForm((f) => {
      const known = seriesAbbrMap.get(v.trim().toLowerCase())
      // Auto-fill the abbreviation from a known series, unless one's already typed.
      return { ...f, series: v, seriesAbbr: f.seriesAbbr.trim() ? f.seriesAbbr : known ?? f.seriesAbbr }
    })

  const bookKey = book
    ? `${book.id}:${book.author ?? ''}:${book.series ?? ''}:${book.seriesNumber ?? ''}:${book.seriesAbbr ?? ''}:${book.year ?? ''}`
    : ''
  useEffect(() => {
    if (book) {
      setForm({
        title: book.title,
        authors: splitAuthors(book.author).length ? splitAuthors(book.author) : [''],
        series: book.series ?? '',
        seriesNumber: book.seriesNumber ?? '',
        seriesAbbr: book.seriesAbbr ?? '',
        year: book.year?.toString() ?? '',
        publisher: book.publisher ?? '',
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

  const setAuthorAt = (i: number, v: string): void =>
    setForm((f) => {
      const authors = [...f.authors]
      authors[i] = v
      return { ...f, authors }
    })
  const addAuthor = (): void => setForm((f) => ({ ...f, authors: [...f.authors, ''] }))
  const removeAuthor = (i: number): void =>
    setForm((f) => {
      const authors = f.authors.filter((_, j) => j !== i)
      return { ...f, authors: authors.length ? authors : [''] }
    })

  const saveMeta = (): void => {
    void updateBook(book.id, {
      title: form.title.trim() || book.title,
      author: joinAuthors(form.authors) || null,
      series: form.series.trim() || null,
      seriesNumber: form.seriesNumber.trim() || null,
      seriesAbbr: form.seriesAbbr.trim() || null,
      year: form.year.trim() ? Number(form.year) : null,
      publisher: form.publisher.trim() || null,
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
    <DrawerOverlay onClose={onClose} className="drawer wide">
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
            <label className="set-label">Authors</label>
            <div className="author-list">
              {form.authors.map((a, i) => (
                <div className="author-row" key={i}>
                  <input
                    className="field"
                    value={a}
                    list="bi-author-options"
                    autoComplete="off"
                    placeholder="Author name"
                    onChange={(e) => setAuthorAt(i, e.target.value)}
                  />
                  {form.authors.length > 1 && (
                    <button
                      className="icon-btn author-del"
                      title="Remove author"
                      onClick={() => removeAuthor(i)}
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button className="btn btn-sm author-add" onClick={addAuthor}>
              <Plus size={13} /> Add author
            </button>
            <datalist id="bi-author-options">
              {authorOptions.map((a) => (
                <option key={a} value={a} />
              ))}
            </datalist>
            <label className="set-label">Series</label>
            <input
              className="field"
              value={form.series}
              placeholder="e.g. Ante-Nicene Fathers"
              list="bi-series-options"
              autoComplete="off"
              onChange={(e) => onSeriesChange(e.target.value)}
            />
            <datalist id="bi-series-options">
              {seriesOptions.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
            <div className="field-grid">
              <div>
                <label className="set-label">Number in series</label>
                <input
                  className="field"
                  value={form.seriesNumber}
                  placeholder="e.g. 1"
                  onChange={(e) => set('seriesNumber', e.target.value)}
                />
              </div>
              <div>
                <label className="set-label">Abbreviation</label>
                <input
                  className="field"
                  value={form.seriesAbbr}
                  placeholder="e.g. ANF"
                  autoComplete="off"
                  onChange={(e) => set('seriesAbbr', e.target.value)}
                />
              </div>
            </div>
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
    </DrawerOverlay>
  )
}
