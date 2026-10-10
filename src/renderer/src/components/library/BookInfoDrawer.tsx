import { useEffect, useMemo, useState } from 'react'
import {
  X,
  ArrowRightLeft,
  Plus,
  RefreshCw,
  Trash2,
  BookOpen,
  Image as ImageIcon,
  Cloud,
  HardDrive,
  CloudOff
} from 'lucide-react'
import { useStore } from '../../store/useStore'
import { api } from '../../lib/api'
import { splitAuthors, joinAuthors } from '../../lib/authors'
import { setCachedCover } from '../../lib/coverCache'
import { DrawerOverlay } from '../DrawerOverlay'
import { BookCover } from './BookCover'
import { KIND_LABEL } from '@shared/libraryKind'
import type { PdfSource, ReadingStatus } from '@shared/ipc'

const SOURCE_LABEL: Record<PdfSource, string> = {
  local: 'Reads from this PC',
  drive: 'Streams from Google Drive',
  missing: 'File not found'
}

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
  journal: string
  volume: string
  issue: string
  pages: string
  doi: string
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
  const moveBook = useStore((s) => s.moveBook)
  const libraryBusy = useStore((s) => s.libraryBusy)
  const [coverKey, setCoverKey] = useState(0)

  const changeCover = async (): Promise<void> => {
    const url = await api.setBookCover(bookId)
    if (url) {
      setCachedCover(bookId, url)
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
    pageOffset: '0',
    journal: '',
    volume: '',
    issue: '',
    pages: '',
    doi: ''
  })
  const [tagText, setTagText] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [doiBusy, setDoiBusy] = useState(false)
  const [doiError, setDoiError] = useState<string | null>(null)
  const [moveBusy, setMoveBusy] = useState(false)
  const [moveError, setMoveError] = useState<string | null>(null)

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
    ? `${book.id}:${book.kind}:${book.author ?? ''}:${book.series ?? ''}:${book.seriesNumber ?? ''}:${book.seriesAbbr ?? ''}:${book.year ?? ''}`
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
        pageOffset: book.pageOffset.toString(),
        journal: book.journal ?? '',
        volume: book.volume ?? '',
        issue: book.issue ?? '',
        pages: book.pages ?? '',
        doi: book.doi ?? ''
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

  // Crossref fills the form only; nothing is stored until the user presses "Save details".
  const fillFromDoi = async (): Promise<void> => {
    if (doiBusy) return
    setDoiBusy(true)
    setDoiError(null)
    try {
      const res = await api.lookupDoi(form.doi)
      if (!res.ok) {
        setDoiError(res.error)
        return
      }
      const f = res.fields
      setForm((cur) => ({
        ...cur,
        title: f.title ?? cur.title,
        authors: f.authors.length ? f.authors : cur.authors,
        journal: f.journal ?? cur.journal,
        volume: f.volume ?? cur.volume,
        issue: f.issue ?? cur.issue,
        pages: f.pages ?? cur.pages,
        year: f.year != null ? String(f.year) : cur.year,
        doi: f.doi
      }))
    } finally {
      setDoiBusy(false)
    }
  }

  const doMove = async (): Promise<void> => {
    if (moveBusy) return
    setMoveBusy(true)
    setMoveError(null)
    try {
      const ok = await moveBook(book.id, book.kind === 'article' ? 'book' : 'article')
      if (!ok) setMoveError('Could not move the file. Check that its folder is available and try again.')
    } finally {
      setMoveBusy(false)
    }
  }

  const saveMeta = (): void => {
    void updateBook(book.id, {
      title: form.title.trim() || book.title,
      author: joinAuthors(form.authors) || null,
      series: form.series.trim() || null,
      seriesNumber: form.seriesNumber.trim() || null,
      seriesAbbr: form.seriesAbbr.trim() || null,
      year: form.year.trim() ? Number(form.year) : null,
      publisher: form.publisher.trim() || null,
      pageOffset: Number(form.pageOffset) || 0,
      ...(book.kind === 'article'
        ? {
            journal: form.journal.trim() || null,
            volume: form.volume.trim() || null,
            issue: form.issue.trim() || null,
            pages: form.pages.trim() || null,
            doi: form.doi.trim() || null
          }
        : {})
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
          <h2 className="drawer-title">{KIND_LABEL[book.kind]} info</h2>
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
                title="Re-derive title, author, and series from the file name"
                onClick={() => void refetchMetadata(book.id)}
              >
                <RefreshCw size={14} className={libraryBusy ? 'spin' : ''} /> Re-parse from filename
              </button>
              <div className={`bi-source ${book.pdfSource}`} title={SOURCE_LABEL[book.pdfSource]}>
                {book.pdfSource === 'drive' ? (
                  <Cloud size={14} />
                ) : book.pdfSource === 'missing' ? (
                  <CloudOff size={14} />
                ) : (
                  <HardDrive size={14} />
                )}
                <span>{SOURCE_LABEL[book.pdfSource]}</span>
              </div>
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
            {book.kind === 'article' && (
              <>
                <label className="set-label">DOI</label>
                <div className="author-row">
                  <input
                    className="field"
                    value={form.doi}
                    placeholder="10.1000/xyz123 or https://doi.org/…"
                    autoComplete="off"
                    onChange={(e) => {
                      set('doi', e.target.value)
                      setDoiError(null)
                    }}
                  />
                  <button
                    className="btn btn-sm"
                    disabled={doiBusy || !form.doi.trim()}
                    title="Fill title, authors, journal, volume, issue, pages and year from Crossref"
                    onClick={() => void fillFromDoi()}
                  >
                    <RefreshCw size={13} className={doiBusy ? 'spin' : ''} /> Fill from DOI
                  </button>
                </div>
                {doiError && (
                  <p className="folder-hint" role="alert">
                    {doiError}
                  </p>
                )}
                <label className="set-label">Journal</label>
                <input
                  className="field"
                  value={form.journal}
                  placeholder="e.g. Concordia Journal"
                  onChange={(e) => set('journal', e.target.value)}
                />
                <div className="field-grid">
                  <div>
                    <label className="set-label">Volume</label>
                    <input className="field" value={form.volume} onChange={(e) => set('volume', e.target.value)} />
                  </div>
                  <div>
                    <label className="set-label">Issue</label>
                    <input className="field" value={form.issue} onChange={(e) => set('issue', e.target.value)} />
                  </div>
                </div>
                <label className="set-label">Pages</label>
                <input
                  className="field"
                  value={form.pages}
                  placeholder="e.g. 45–67"
                  onChange={(e) => set('pages', e.target.value)}
                />
              </>
            )}
            {book.kind !== 'article' && (
              <>
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
              </>
            )}
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
            {book.kind !== 'article' && (
              <>
                <label className="set-label">Publisher</label>
                <input
                  className="field"
                  value={form.publisher}
                  onChange={(e) => set('publisher', e.target.value)}
                />
              </>
            )}
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
            <button
              className="btn btn-sm bi-move"
              disabled={moveBusy}
              title="Moves the file to the other folder; quotes, highlights and shelves stay attached"
              onClick={() => void doMove()}
            >
              <ArrowRightLeft size={14} /> {book.kind === 'article' ? 'Move to Books' : 'Move to Articles'}
            </button>
            {moveError && (
              <p className="folder-hint" role="alert">
                {moveError}
              </p>
            )}
          </section>

          <section className="set-section">
            <h3 className="set-h">Danger zone</h3>
            {confirmDelete ? (
              <div className="confirm-row">
                <span>
                  Delete “{book.title}”? Its file moves to the vault’s “deleted” folder
                  (recoverable) and leaves your library and Drive folders.
                </span>
                <button className="btn btn-sm" onClick={() => setConfirmDelete(false)}>
                  Cancel
                </button>
                <button className="btn btn-sm danger-btn" onClick={doDelete}>
                  <Trash2 size={14} /> Delete
                </button>
              </div>
            ) : (
              <button className="btn btn-sm" onClick={() => setConfirmDelete(true)}>
                <Trash2 size={14} /> Delete {KIND_LABEL[book.kind].toLowerCase()}
              </button>
            )}
          </section>
        </div>
    </DrawerOverlay>
  )
}
