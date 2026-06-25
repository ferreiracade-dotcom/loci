import { useMemo, useState } from 'react'
import {
  Upload,
  FolderInput,
  LayoutGrid,
  List as ListIcon,
  RefreshCw,
  BookOpen,
  Info,
  Pencil
} from 'lucide-react'
import { useStore } from '../../store/useStore'
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

  const filtered = useMemo(
    () => (activeShelf ? books.filter((b) => b.shelfIds.includes(activeShelf)) : books),
    [books, activeShelf]
  )

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
        ) : view === 'grid' ? (
          <div
            className="grid"
            style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${coverSize}px, 1fr))` }}
          >
            {filtered.map((b) => (
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
            {filtered.map((b) => (
              <BookListRow key={b.id} book={b} onOpen={() => setInfoId(b.id)} onRead={() => openBook(b.id)} />
            ))}
          </div>
        )}
      </div>

      {toast && <div className="toast">{toast}</div>}
      {infoId && <BookInfoDrawer bookId={infoId} onClose={() => setInfoId(null)} />}
      {shelvesOpen && <ShelvesManager onClose={() => setShelvesOpen(false)} />}
    </div>
  )
}
