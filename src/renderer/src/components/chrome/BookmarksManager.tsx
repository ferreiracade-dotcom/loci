import { useState } from 'react'
import type { DragEvent as ReactDragEvent } from 'react'
import { Bookmark as BookmarkIcon, EllipsisVertical, Folder, FolderOpen, FolderPlus, Search } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { childrenOf, folderPath, searchBookmarks } from '../../store/bookmarks'
import type { BookmarkNode, Bookmarks } from '../../store/bookmarks'
import { PopupMenu } from './PopupMenu'
import type { MenuEntry } from './PopupMenu'
import { tabDef } from './tabRegistry'
import { isBackgroundClick, openInNewTab } from './openViews'
import { nodeMenuItems, locationLabel } from './BookmarksBar'
import { openBookmarkDialog } from './BookmarkDialog'

const DRAG_TYPE = 'application/x-loci-bookmark'
const ROOT = ''

/** The Bookmarks manager tab (Ctrl+Shift+O): folder tree, list, search, rename, move, delete. */
export function BookmarksManager() {
  const bookmarks = useStore((s) => s.bookmarks)
  const moveBookmarkNode = useStore((s) => s.moveBookmarkNode)
  const [folder, setFolder] = useState<string>(ROOT)
  const [query, setQuery] = useState('')
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuEntry[] } | null>(null)
  const [dropKey, setDropKey] = useState<string | null>(null)

  const current = folder && bookmarks.folders.some((f) => f.id === folder) ? folder : ROOT
  const searching = query.trim().length > 0
  const rows: BookmarkNode[] = searching ? searchBookmarks(bookmarks, query) : childrenOf(bookmarks, current || undefined)
  const crumbs = folderPath(bookmarks, current || undefined)

  const allowDrop = (e: ReactDragEvent, key: string): void => {
    if (!e.dataTransfer.types.includes(DRAG_TYPE)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDropKey(key)
  }

  const dropInto = (e: ReactDragEvent, parent: string): void => {
    e.preventDefault()
    setDropKey(null)
    const id = e.dataTransfer.getData(DRAG_TYPE)
    if (id) moveBookmarkNode(id, parent || undefined, Infinity)
  }

  const dropOnRow = (e: ReactDragEvent, target: BookmarkNode): void => {
    e.preventDefault()
    e.stopPropagation()
    setDropKey(null)
    const id = e.dataTransfer.getData(DRAG_TYPE)
    if (!id || id === target.item.id) return
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const y = e.clientY - r.top
    if (target.type === 'folder' && y > r.height * 0.25 && y < r.height * 0.75) {
      moveBookmarkNode(id, target.item.id, Infinity)
      return
    }
    const parent = target.item.parentId
    const siblings = childrenOf(bookmarks, parent).filter((n) => n.item.id !== id)
    const i = siblings.findIndex((n) => n.item.id === target.item.id)
    moveBookmarkNode(id, parent, y < r.height / 2 ? i : i + 1)
  }

  const open = (n: BookmarkNode, e: { ctrlKey: boolean; metaKey: boolean; button: number }): void => {
    if (n.type === 'folder') {
      setFolder(n.item.id)
      setQuery('')
    } else openInNewTab(n.item.location, isBackgroundClick(e))
  }

  return (
    <div className="bmm">
      <header className="bmm-head">
        <h1>
          <BookmarkIcon size={18} /> Bookmarks
        </h1>
        <label className="bmm-search">
          <Search size={15} />
          <input placeholder="Search bookmarks" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <button className="bm-btn" onClick={() => openBookmarkDialog({ type: 'newFolder', parentId: current || undefined })}>
          <FolderPlus size={14} /> Add folder
        </button>
      </header>
      <div className="bmm-body">
        <nav className="bmm-tree">
          <TreeNode
            id={ROOT}
            title="Bookmarks bar"
            depth={0}
            bookmarks={bookmarks}
            current={searching ? null : current}
            dropKey={dropKey}
            onSelect={(id) => {
              setFolder(id)
              setQuery('')
            }}
            onDragOver={allowDrop}
            onDrop={dropInto}
            onContext={(n, x, y) => setMenu({ x, y, items: nodeMenuItems(n, { withBarItems: false }) })}
          />
        </nav>
        <section className="bmm-list">
          <div className="bmm-crumbs">
            {searching ? (
              `Search results for "${query.trim()}"`
            ) : (
              <>
                <button onClick={() => setFolder(ROOT)}>Bookmarks bar</button>
                {crumbs.map((f) => (
                  <span key={f.id}>
                    {' › '}
                    <button onClick={() => setFolder(f.id)}>{f.title}</button>
                  </span>
                ))}
              </>
            )}
          </div>
          {rows.length === 0 && <div className="bmm-empty">{searching ? 'No bookmarks match.' : 'This folder is empty.'}</div>}
          {rows.map((n) => {
            const Icon = n.type === 'folder' ? Folder : tabDef(n.item.location.kind).icon
            const sub =
              n.type === 'folder'
                ? `${childrenOf(bookmarks, n.item.id).length} items`
                : [locationLabel(n.item.location), searching ? folderPath(bookmarks, n.item.parentId).map((f) => f.title).join(' › ') : '']
                    .filter(Boolean)
                    .join(' · ')
            return (
              <div
                key={n.item.id}
                className={`bmm-row${dropKey === n.item.id ? ' drop' : ''}`}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(DRAG_TYPE, n.item.id)
                  e.dataTransfer.effectAllowed = 'move'
                }}
                onDragOver={(e) => {
                  e.stopPropagation()
                  allowDrop(e, n.item.id)
                }}
                onDragLeave={() => setDropKey(null)}
                onDrop={(e) => dropOnRow(e, n)}
                onMouseDown={(e) => {
                  if (e.button === 1) e.preventDefault()
                }}
                onClick={(e) => open(n, e)}
                onAuxClick={(e) => {
                  if (e.button === 1 && n.type === 'bookmark') openInNewTab(n.item.location, true)
                }}
                onContextMenu={(e) => {
                  e.preventDefault()
                  setMenu({ x: e.clientX, y: e.clientY, items: nodeMenuItems(n, { withBarItems: false }) })
                }}
              >
                <Icon size={16} className="bmm-ic" />
                <span className="bmm-title">{n.item.title}</span>
                <span className="bmm-sub">{sub}</span>
                <button
                  className="ctb-btn bmm-more"
                  title="More actions"
                  onClick={(e) => {
                    e.stopPropagation()
                    const r = e.currentTarget.getBoundingClientRect()
                    setMenu({ x: r.right - 240, y: r.bottom + 2, items: nodeMenuItems(n, { withBarItems: false }) })
                  }}
                >
                  <EllipsisVertical size={16} />
                </button>
              </div>
            )
          })}
        </section>
      </div>
      {menu && <PopupMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
    </div>
  )
}

function TreeNode({
  id,
  title,
  depth,
  bookmarks,
  current,
  dropKey,
  onSelect,
  onDragOver,
  onDrop,
  onContext
}: {
  id: string
  title: string
  depth: number
  bookmarks: Bookmarks
  current: string | null
  dropKey: string | null
  onSelect: (id: string) => void
  onDragOver: (e: ReactDragEvent, key: string) => void
  onDrop: (e: ReactDragEvent, parent: string) => void
  onContext: (n: BookmarkNode, x: number, y: number) => void
}) {
  const sub = childrenOf(bookmarks, id || undefined).filter((n) => n.type === 'folder')
  const key = `tree:${id}`
  const folder = bookmarks.folders.find((f) => f.id === id)
  const Icon = current === id ? FolderOpen : Folder
  return (
    <>
      <div
        className={`bmm-tree-row${current === id ? ' on' : ''}${dropKey === key ? ' drop' : ''}`}
        style={{ paddingLeft: 10 + depth * 16 }}
        onClick={() => onSelect(id)}
        onDragOver={(e) => onDragOver(e, key)}
        onDrop={(e) => onDrop(e, id)}
        onContextMenu={(e) => {
          e.preventDefault()
          if (folder) onContext({ type: 'folder', item: folder }, e.clientX, e.clientY)
        }}
      >
        <Icon size={15} />
        <span>{title}</span>
      </div>
      {sub.map((n) => (
        <TreeNode
          key={n.item.id}
          id={n.item.id}
          title={n.item.title}
          depth={depth + 1}
          bookmarks={bookmarks}
          current={current}
          dropKey={dropKey}
          onSelect={onSelect}
          onDragOver={onDragOver}
          onDrop={onDrop}
          onContext={onContext}
        />
      ))}
    </>
  )
}
