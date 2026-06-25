import { useEffect, useMemo, useState } from 'react'
import {
  Upload,
  FolderInput,
  LayoutGrid,
  List as ListIcon,
  RefreshCw,
  BookOpen,
  Info,
  Pencil,
  Layers
} from 'lucide-react'
import { useStore } from '../../store/useStore'
import { api } from '../../lib/api'
import { EmptyState } from '../EmptyState'
import { BookCover } from './BookCover'
import { BookInfoDrawer } from './BookInfoDrawer'
import { ShelvesManager } from './ShelvesManager'
import type { Book, ReadingStatus } from '@shared/ipc'

const STATUS_LABEL: Record<ReadingStatus, string> = {
  unread: 'Unread',
  reading: 'Reading',
  finished: 'Finished'
}

const GROUP_OPTIONS: { id: string; label: string }[] = [
  { id: 'none', label: 'No grouping' },
  { id: 'author', label: 'Author' },
  { id: 'genre', label: 'Genre' },
  { id: 'shelf', label: 'Shelf' },
  { id: 'tag', label: 'Tag' },
  { id: 'status', label: 'Status' }
]

function BookCard({
  book,
  size,
  onOpen,
  onRead
}: {
  book: Book
  size: number
  onOpen: () => void
  onRead: () => void
}) {
  return (
    <div
      className="book-card"
      onClick={onRead}
      title={`${book.title}${book.author ? ` — ${book.author}` : ''} · click to read`}
    >
      <div className="cover" style={{ height: Math.round(size * 1.4) }}>
        <BookCover id={book.id} hasCover={book.hasCover} title={book.title} />
        <span className={`status-badge ${book.status}`}>{STATUS_LABEL[book.status]}</span>
        <button
          className="card-info"
          title="Book info"
          onClick={(e) => {
            e.stopPropagation()
            onOpen()
          }}
        >
          <Info size={15} />
        </button>
      </div>
      <div className="book-meta">
        <div className="book-title">{book.title}</div>
        <div className="book-author">
          {book.author ?? '—'}
          {book.year ? ` · ${book.year}` : ''}
        </div>
      </div>
    </div>
  )
}

function BookListRow({
  book,
  onOpen,
  onRead
}: {
  book: Book
  onOpen: () => void
  onRead: () => void
}) {
  return (
    <div className="book-row" onClick={onRead} title="Click to read">
      <div className="row-cover">
        <BookCover id={book.id} hasCover={book.hasCover} title={book.title} />
      </div>
      <div className="row-main">
        <div className="book-title">{book.title}</div>
        <div className="book-author">
          {book.author ?? '—'}
          {book.year ? ` · ${book.year}` : ''}
          {book.genre ? ` · ${book.genre}` : ''}
        </div>
      </div>
      {book.quoteCount > 0 && <span className="row-quotes">{book.quoteCount} quotes</span>}
      <span className={`status-badge ${book.status} row-status`}>{STATUS_LABEL[book.status]}</span>
      <button
        className="row-info"
        title="Book info"
        onClick={(e) => {
          e.stopPropagation()
          onOpen()
        }}
      >
        <Info size={15} />
      </button>
    </div>
  )
}

export function LibraryView() {
  const books = useStore((s) => s.books)
  const shelves = useStore((s) => s.shelves)
  const layout = useStore((s) => s.layout)!
  const saveLayout = useStore((s) => s.saveLayout)
  const activeShelf = useStore((s) => s.activeShelf)
  const setActiveShelf = useStore((s) => s.setActiveShelf)
  const importFromSource = useStore((s) => s.importFromSource)
  const importFiles = useStore((s) => s.importFiles)
  const libraryBusy = useStore((s) => s.libraryBusy)
  const importProgress = useStore((s) => s.importProgress)
  const openBook = useStore((s) => s.openBook)
  const [infoId, setInfoId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [shelvesOpen, setShelvesOpen] = useState(false)
  const [groupBy, setGroupBy] = useState('none')

  useEffect(() => {
    void api.getSession('libraryGroup').then((v) => {
      if (v) setGroupBy(v)
    })
  }, [])

  function changeGroup(v: string): void {
    setGroupBy(v)
    void api.setSession('libraryGroup', v)
  }

  const filtered = useMemo(
    () => (activeShelf ? books.filter((b) => b.shelfIds.includes(activeShelf)) : books),
    [books, activeShelf]
  )

  const groups = useMemo(() => {
    if (groupBy === 'none') return null
    const map = new Map<string, Book[]>()
    const add = (k: string, b: Book): void => {
      const arr = map.get(k)
      if (arr) arr.push(b)
      else map.set(k, [b])
    }
    for (const b of filtered) {
      if (groupBy === 'author') add(b.author?.trim() || 'Unknown author', b)
      else if (groupBy === 'genre') add(b.genre?.trim() || 'No genre', b)
      else if (groupBy === 'status') add(STATUS_LABEL[b.status], b)
      else if (groupBy === 'shelf') {
        const names = b.shelfIds
          .map((id) => shelves.find((s) => s.id === id)?.name)
          .filter((n): n is string => !!n)
        if (names.length === 0) add('Unshelved', b)
        else names.forEach((n) => add(n, b))
      } else if (groupBy === 'tag') {
        if (b.tags.length === 0) add('Untagged', b)
        else b.tags.forEach((t) => add('#' + t, b))
      }
    }
    return [...map.entries()]
      .map(([key, items]) => ({ key, items }))
      .sort((a, b) => a.key.localeCompare(b.key))
  }, [groupBy, filtered, shelves])

  async function doImport(kind: 'source' | 'files'): Promise<void> {
    const res = kind === 'source' ? await importFromSource() : await importFiles()
    const tail = res.imported > 0 ? ' · fetching metadata in background…' : ''
    setToast(
      `Imported ${res.imported} · skipped ${res.skipped}${res.failed ? ` · failed ${res.failed}` : ''}${tail}`
    )
    window.setTimeout(() => setToast(null), 5000)
  }

  const view = layout.libraryView
  const coverSize = layout.coverSize

  const renderItems = (items: Book[]): JSX.Element =>
    view === 'grid' ? (
      <div
        className="grid"
        style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${coverSize}px, 1fr))` }}
      >
        {items.map((b) => (
          <BookCard
            key={b.id}
            book={b}
            size={coverSize}
            onOpen={() => setInfoId(b.id)}
            onRead={() => openBook(b.id)}
          />
        ))}
      </div>
    ) : (
      <div className="list">
        {items.map((b) => (
          <BookListRow
            key={b.id}
            book={b}
            onOpen={() => setInfoId(b.id)}
            onRead={() => openBook(b.id)}
          />
        ))}
      </div>
    )

  return (
    <div className="library">
      <div className="library-toolbar">
        <div className="tb-left">
          <button className="btn btn-sm" disabled={libraryBusy} onClick={() => void doImport('source')}>
            <Upload size={14} /> Import from source
          </button>
          <button className="btn btn-sm" disabled={libraryBusy} onClick={() => void doImport('files')}>
            <FolderInput size={14} /> Choose files…
          </button>
          {libraryBusy && (
            <span className="muted-inline">
              <RefreshCw size={14} className="spin" /> Working…
            </span>
          )}
        </div>
        <div className="tb-right">
          <div className="group-wrap" title="Group books by">
            <Layers size={14} />
            <select
              className="group-select"
              value={groupBy}
              onChange={(e) => changeGroup(e.target.value)}
            >
              {GROUP_OPTIONS.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.id === 'none' ? g.label : `Group: ${g.label}`}
                </option>
              ))}
            </select>
          </div>
          <div className="seg tiny">
            <button
              className={`seg-btn${view === 'grid' ? ' active' : ''}`}
              title="Grid view"
              onClick={() => saveLayout({ libraryView: 'grid' })}
            >
              <LayoutGrid size={14} />
            </button>
            <button
              className={`seg-btn${view === 'list' ? ' active' : ''}`}
              title="List view"
              onClick={() => saveLayout({ libraryView: 'list' })}
            >
              <ListIcon size={14} />
            </button>
          </div>
          {view === 'grid' && (
            <input
              className="slider"
              type="range"
              min={90}
              max={200}
              value={coverSize}
              title="Cover size"
              onChange={(e) => saveLayout({ coverSize: Number(e.target.value) })}
            />
          )}
        </div>
      </div>

      {importProgress && (
        <div className="import-progress">
          <span className="ip-label">
            {importProgress.phase === 'importing' ? 'Indexing' : 'Fetching metadata'}{' '}
            {importProgress.done}/{importProgress.total}
          </span>
          <div className="ip-track">
            <div
              className="ip-fill"
              style={{
                width: `${importProgress.total ? Math.round((importProgress.done / importProgress.total) * 100) : 0}%`
              }}
            />
          </div>
        </div>
      )}

      <div className="shelf-bar">
        <button className={`chip${!activeShelf ? ' active' : ''}`} onClick={() => setActiveShelf(null)}>
          All <span className="chip-n">{books.length}</span>
        </button>
        {shelves.map((s) => (
          <button
            key={s.id}
            className={`chip${activeShelf === s.id ? ' active' : ''}`}
            onClick={() => setActiveShelf(s.id)}
          >
            {s.name} <span className="chip-n">{s.count}</span>
          </button>
        ))}
        <button className="chip chip-manage" title="Add or edit shelves" onClick={() => setShelvesOpen(true)}>
          <Pencil size={12} /> Edit shelves
        </button>
      </div>

      <div className="library-body">
        {filtered.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title={books.length === 0 ? 'Your library is empty' : 'No books on this shelf'}
            subtitle={
              books.length === 0
                ? 'Import PDFs from your source folder, or choose files above.'
                : 'Try another shelf, or import more books.'
            }
          />
        ) : groups ? (
          groups.map((g) => (
            <section key={g.key} className="lib-group">
              <div className="lib-group-head">
                {g.key} <span className="lib-group-n">{g.items.length}</span>
              </div>
              {renderItems(g.items)}
            </section>
          ))
        ) : (
          renderItems(filtered)
        )}
      </div>

      {toast && <div className="toast">{toast}</div>}
      {infoId && <BookInfoDrawer bookId={infoId} onClose={() => setInfoId(null)} />}
      {shelvesOpen && <ShelvesManager onClose={() => setShelvesOpen(false)} />}
    </div>
  )
}
