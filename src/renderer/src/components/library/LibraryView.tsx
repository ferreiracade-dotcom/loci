import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import {
  Upload,
  FolderInput,
  LayoutGrid,
  List as ListIcon,
  RefreshCw,
  BookOpen,
  Info,
  Pencil,
  Layers,
  Check,
  Image as ImageIcon,
  Video,
  Search,
  Cloud,
  HardDrive,
  CloudOff,
  X
} from 'lucide-react'
import { useStore } from '../../store/useStore'
import { api } from '../../lib/api'
import { splitAuthors } from '../../lib/authors'
import { EmptyState } from '../EmptyState'
import { BookCover } from './BookCover'
import { BookInfoDrawer } from './BookInfoDrawer'
import { ShelvesManager } from './ShelvesManager'
import { DriveStatus } from './DriveStatus'
import type { Book, PdfSource, ReadingStatus } from '@shared/ipc'

const SOURCE_META: Record<PdfSource, string> = {
  local: 'On this PC — opens locally',
  drive: 'Streams from Google Drive',
  missing: 'File not found locally or on Drive'
}
function SourceIcon({ source, size = 12 }: { source: PdfSource; size?: number }): JSX.Element {
  if (source === 'drive') return <Cloud size={size} />
  if (source === 'missing') return <CloudOff size={size} />
  return <HardDrive size={size} />
}

const STATUS_LABEL: Record<ReadingStatus, string> = {
  unread: 'Unread',
  reading: 'Reading',
  finished: 'Finished'
}

/** "Ante-Nicene Fathers 1" — series with its position appended, when set. */
function seriesLabel(b: Book): string {
  if (!b.series) return ''
  return b.seriesNumber ? `${b.series} ${b.seriesNumber}` : b.series
}

/** Order books within a series by their number (numeric), unnumbered last. */
function bySeriesNumber(a: Book, b: Book): number {
  const na = parseFloat(a.seriesNumber ?? '')
  const nb = parseFloat(b.seriesNumber ?? '')
  const aHas = !Number.isNaN(na)
  const bHas = !Number.isNaN(nb)
  if (aHas && bHas) return na - nb || a.title.localeCompare(b.title)
  if (aHas !== bHas) return aHas ? -1 : 1
  return a.title.localeCompare(b.title)
}

type ContentTab = 'books' | 'images' | 'videos'
const CONTENT_TABS: { id: ContentTab; label: string; icon: typeof BookOpen }[] = [
  { id: 'books', label: 'Books', icon: BookOpen },
  { id: 'images', label: 'Images', icon: ImageIcon },
  { id: 'videos', label: 'Videos', icon: Video }
]

const GROUP_OPTIONS: { id: string; label: string }[] = [
  { id: 'none', label: 'No grouping' },
  { id: 'author', label: 'Author' },
  { id: 'series', label: 'Series' },
  { id: 'shelf', label: 'Shelf' },
  { id: 'tag', label: 'Tag' },
  { id: 'status', label: 'Status' }
]

function BookCard({
  book,
  size,
  onOpen,
  onRead,
  onMenu
}: {
  book: Book
  size: number
  onOpen: () => void
  onRead: () => void
  onMenu: (e: MouseEvent) => void
}) {
  return (
    <div
      className="book-card"
      onClick={onRead}
      onContextMenu={onMenu}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('application/x-loci-book', book.id)
        e.dataTransfer.effectAllowed = 'copy'
      }}
      title={`${book.title}${book.author ? ` — ${book.author}` : ''} · click to read · right-click for shelves`}
    >
      <div className="cover" style={{ height: Math.round(size * 1.4) }}>
        <BookCover id={book.id} hasCover={book.hasCover} title={book.title} />
        <span className={`status-badge ${book.status}`}>{STATUS_LABEL[book.status]}</span>
        <span className={`src-badge ${book.pdfSource}`} title={SOURCE_META[book.pdfSource]}>
          <SourceIcon source={book.pdfSource} />
        </span>
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
        {book.series && <div className="book-series">{seriesLabel(book)}</div>}
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
  onRead,
  onMenu
}: {
  book: Book
  onOpen: () => void
  onRead: () => void
  onMenu: (e: MouseEvent) => void
}) {
  return (
    <div
      className="book-row"
      onClick={onRead}
      onContextMenu={onMenu}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('application/x-loci-book', book.id)
        e.dataTransfer.effectAllowed = 'copy'
      }}
      title="Click to read · right-click for shelves"
    >
      <div className="row-cover">
        <BookCover id={book.id} hasCover={book.hasCover} title={book.title} />
      </div>
      <div className="row-main">
        {book.series && <div className="book-series">{seriesLabel(book)}</div>}
        <div className="book-title">{book.title}</div>
        <div className="book-author">
          {book.author ?? '—'}
          {book.year ? ` · ${book.year}` : ''}
        </div>
      </div>
      {book.quoteCount > 0 && <span className="row-quotes">{book.quoteCount} quotes</span>}
      <span className={`src-ico ${book.pdfSource}`} title={SOURCE_META[book.pdfSource]}>
        <SourceIcon source={book.pdfSource} size={15} />
      </span>
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

// Persists across mounts so the library returns to where you were after a book.
let libraryScrollTop = 0

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
  const setBookShelves = useStore((s) => s.setBookShelves)
  const [infoId, setInfoId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [shelvesOpen, setShelvesOpen] = useState(false)
  const [groupBy, setGroupBy] = useState('none')
  const [contentTab, setContentTab] = useState<ContentTab>('books')
  const [query, setQuery] = useState('')
  const [dropShelf, setDropShelf] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; bookId: string } | null>(null)
  const bodyRef = useRef<HTMLDivElement>(null)

  // Restore the library scroll position when returning from a book / re-render.
  useLayoutEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = libraryScrollTop
  }, [])

  useEffect(() => {
    void api.getSession('libraryGroup').then((v) => {
      // 'genre' grouping was removed in favour of 'series'; migrate any saved value.
      if (v === 'genre') {
        setGroupBy('series')
        void api.setSession('libraryGroup', 'series')
      } else if (v) setGroupBy(v)
    })
    void api.getSession('libraryTab').then((v) => {
      if (v === 'images' || v === 'videos') setContentTab(v)
    })
  }, [])

  function changeGroup(v: string): void {
    setGroupBy(v)
    void api.setSession('libraryGroup', v)
  }
  function changeTab(v: ContentTab): void {
    setContentTab(v)
    void api.setSession('libraryTab', v)
  }

  useEffect(() => {
    if (!menu) return
    const onDoc = (): void => setMenu(null)
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setMenu(null)
    }
    window.addEventListener('click', onDoc)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('click', onDoc)
      window.removeEventListener('keydown', onKey)
    }
  }, [menu])

  function openMenu(e: MouseEvent, bookId: string): void {
    e.preventDefault()
    setMenu({ x: e.clientX, y: e.clientY, bookId })
  }
  async function toggleShelf(book: Book, shelfId: string): Promise<void> {
    const next = book.shelfIds.includes(shelfId)
      ? book.shelfIds.filter((s) => s !== shelfId)
      : [...book.shelfIds, shelfId]
    await setBookShelves(book.id, next)
  }
  async function dropOnShelf(bookId: string, shelfId: string): Promise<void> {
    const b = books.find((x) => x.id === bookId)
    if (!b || b.shelfIds.includes(shelfId)) return
    await setBookShelves(bookId, [...b.shelfIds, shelfId])
    const shelfName = shelves.find((s) => s.id === shelfId)?.name ?? 'shelf'
    setToast(`Added “${b.title}” to ${shelfName}`)
    window.setTimeout(() => setToast(null), 2800)
  }

  const filtered = useMemo(
    () => (activeShelf ? books.filter((b) => b.shelfIds.includes(activeShelf)) : books),
    [books, activeShelf]
  )

  const searched = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return filtered
    const terms = q.split(/\s+/).filter(Boolean)
    return filtered.filter((b) => {
      const series = b.series ?? ''
      const num = b.seriesNumber ?? ''
      const abbr = b.seriesAbbr ?? ''
      // Include "<series> <n>" and "<abbr> <n>" as contiguous strings so a query
      // like "ANF 1" or "Ante-Nicene Fathers 1" matches the right volume.
      const hay = [
        b.title,
        b.author ?? '',
        series,
        abbr,
        num,
        series && num ? `${series} ${num}` : '',
        abbr && num ? `${abbr} ${num}` : ''
      ]
        .join(' ')
        .toLowerCase()
      return terms.every((t) => hay.includes(t))
    })
  }, [filtered, query])

  const groups = useMemo(() => {
    if (groupBy === 'none') return null
    const map = new Map<string, Book[]>()
    const add = (k: string, b: Book): void => {
      const arr = map.get(k)
      if (arr) arr.push(b)
      else map.set(k, [b])
    }
    for (const b of searched) {
      if (groupBy === 'author') {
        const names = splitAuthors(b.author)
        if (names.length === 0) add('Unknown author', b)
        else names.forEach((n) => add(n, b))
      } else if (groupBy === 'series') add(b.series?.trim() || 'No series', b)
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
      .map(([key, items]) => ({
        key,
        items: groupBy === 'series' ? [...items].sort(bySeriesNumber) : items
      }))
      .sort((a, b) => a.key.localeCompare(b.key))
  }, [groupBy, searched, shelves])

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
            onMenu={(e) => openMenu(e, b.id)}
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
            onMenu={(e) => openMenu(e, b.id)}
          />
        ))}
      </div>
    )

  return (
    <div className="library">
      <div className="library-toolbar">
        <div className="tb-left">
          <div className="seg tiny">
            {CONTENT_TABS.map((t) => {
              const Icon = t.icon
              return (
                <button
                  key={t.id}
                  className={`seg-btn${contentTab === t.id ? ' active' : ''}`}
                  title={t.label}
                  onClick={() => changeTab(t.id)}
                >
                  <Icon size={14} /> {t.label}
                </button>
              )
            })}
          </div>
          {contentTab === 'books' && (
            <>
              <button
                className="btn btn-sm"
                disabled={libraryBusy}
                onClick={() => void doImport('source')}
              >
                <Upload size={14} /> Import from source
              </button>
              <button
                className="btn btn-sm"
                disabled={libraryBusy}
                onClick={() => void doImport('files')}
              >
                <FolderInput size={14} /> Choose files…
              </button>
              {libraryBusy && (
                <span className="muted-inline">
                  <RefreshCw size={14} className="spin" /> Working…
                </span>
              )}
              <div className="lib-search">
                <Search size={14} />
                <input
                  value={query}
                  placeholder="Search books…"
                  onChange={(e) => setQuery(e.target.value)}
                />
                {query && (
                  <button title="Clear" onClick={() => setQuery('')}>
                    <X size={13} />
                  </button>
                )}
              </div>
            </>
          )}
        </div>
        <div className="tb-right">
          <DriveStatus />
          {contentTab === 'books' && (
            <>
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
            </>
          )}
        </div>
      </div>

      {contentTab === 'books' ? (
        <>
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
            className={`chip${activeShelf === s.id ? ' active' : ''}${
              dropShelf === s.id ? ' drop-over' : ''
            }`}
            onClick={() => setActiveShelf(s.id)}
            onDragOver={(e) => {
              e.preventDefault()
              e.dataTransfer.dropEffect = 'copy'
              if (dropShelf !== s.id) setDropShelf(s.id)
            }}
            onDragLeave={() => setDropShelf((d) => (d === s.id ? null : d))}
            onDrop={(e) => {
              e.preventDefault()
              const id = e.dataTransfer.getData('application/x-loci-book')
              setDropShelf(null)
              if (id) void dropOnShelf(id, s.id)
            }}
          >
            {s.name} <span className="chip-n">{s.count}</span>
          </button>
        ))}
        <button className="chip chip-manage" title="Add or edit shelves" onClick={() => setShelvesOpen(true)}>
          <Pencil size={12} /> Edit shelves
        </button>
      </div>

      <div
        className="library-body"
        ref={bodyRef}
        onScroll={(e) => {
          libraryScrollTop = e.currentTarget.scrollTop
        }}
      >
        {searched.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title={
              query.trim()
                ? 'No books match'
                : books.length === 0
                  ? 'Your library is empty'
                  : 'No books on this shelf'
            }
            subtitle={
              query.trim()
                ? `Nothing matches “${query.trim()}”.`
                : books.length === 0
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
          renderItems(searched)
        )}
      </div>
        </>
      ) : (
        <div className="library-body">
          <EmptyState
            icon={contentTab === 'images' ? ImageIcon : Video}
            title={contentTab === 'images' ? 'Image library' : 'Video transcripts'}
            subtitle={
              contentTab === 'images'
                ? 'The image library arrives in Phase 10.'
                : 'YouTube-transcript reading arrives in Phase 5.'
            }
          />
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
      {infoId && <BookInfoDrawer bookId={infoId} onClose={() => setInfoId(null)} />}
      {shelvesOpen && <ShelvesManager onClose={() => setShelvesOpen(false)} />}

      {menu &&
        (() => {
          const mb = books.find((b) => b.id === menu.bookId)
          if (!mb) return null
          return (
            <div
              className="ctx-menu"
              style={{
                top: Math.min(menu.y, window.innerHeight - 320),
                left: Math.min(menu.x, window.innerWidth - 210)
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                className="ctx-item"
                onClick={() => {
                  openBook(mb.id)
                  setMenu(null)
                }}
              >
                <BookOpen size={14} /> Read
              </button>
              <button
                className="ctx-item"
                onClick={() => {
                  setInfoId(mb.id)
                  setMenu(null)
                }}
              >
                <Info size={14} /> Book info…
              </button>
              <div className="ctx-sep" />
              <div className="ctx-label">Shelves</div>
              {shelves.length === 0 && <div className="ctx-empty">No shelves yet</div>}
              {shelves.map((s) => (
                <button
                  key={s.id}
                  className="ctx-item ctx-check"
                  onClick={() => void toggleShelf(mb, s.id)}
                >
                  <span className="ctx-tick">
                    {mb.shelfIds.includes(s.id) ? <Check size={13} /> : null}
                  </span>
                  {s.name}
                </button>
              ))}
            </div>
          )
        })()}
    </div>
  )
}
