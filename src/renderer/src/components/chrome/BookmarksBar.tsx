import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import type { CSSProperties, DragEvent as ReactDragEvent, MouseEvent as ReactMouseEvent } from 'react'
import {
  Bookmark as BookmarkIcon,
  BookmarkPlus,
  ChevronsRight,
  Columns2,
  Folder,
  FolderPlus,
  LayoutGrid,
  Pencil,
  Plus,
  SquareArrowOutUpRight,
  Trash2
} from 'lucide-react'
import { useStore, focusedTab } from '../../store/useStore'
import type { Bookmark, BookmarkFolder, TabLocation } from '../../store/useStore'
import { bookmarksIn, childrenOf, isBookmarkable } from '../../store/bookmarks'
import type { BookmarkNode } from '../../store/bookmarks'
import { tabContent } from '../../store/workspace'
import { GROUP_COLORS, groupName } from '../../store/tabGroups'
import { PopupMenu } from './PopupMenu'
import type { MenuEntry, MenuPick } from './PopupMenu'
import { TAB_REGISTRY, locationTab, tabDef, tabLocationText, tabTitle } from './tabRegistry'
import { isBackgroundClick, openFixedView, openInNewTab } from './openViews'
import type { FixedView } from './openViews'
import { TabGroupsMenu, savedGroupActions } from './TabGroupMenus'
import { openBookmarkDialog } from './BookmarkDialog'

/** The fixed entries, left of the owner's own bookmarks. Icons come from the tab registry. */
const FIXED: { view: FixedView; label: string; kind: keyof typeof TAB_REGISTRY }[] = [
  { view: 'bible', label: 'Bible', kind: 'bible' },
  { view: 'confessions', label: 'Confessions', kind: 'boc' },
  { view: 'commentary', label: 'Commentary', kind: 'commentary' },
  { view: 'dogmatics', label: 'Dogmatics', kind: 'dogmatics' },
  { view: 'fathers', label: 'Fathers', kind: 'fathers' },
  { view: 'library', label: 'Library', kind: 'library' },
  { view: 'notes', label: 'Notes', kind: 'notes' },
  { view: 'quotesIndex', label: 'Quotes', kind: 'quotesIndex' }
]

const DRAG_TYPE = 'application/x-loci-bookmark'

type Menu = { x: number; y: number; items: MenuEntry[] } | null

function openBookmark(m: Bookmark, pick: MenuPick | ReactMouseEvent): void {
  openInNewTab(m.location, isBackgroundClick(pick))
}

/** Open every bookmark in a folder as new background tabs; optionally as a new tab group. */
export function openAllInFolder(folder: BookmarkFolder, asGroup: boolean): void {
  const s = useStore.getState()
  const marks = bookmarksIn(s.bookmarks, folder.id)
  if (marks.length === 0) return
  const ids = marks.map((m) =>
    s.openTab(m.location, { forceNew: true, activate: false, after: null, groupId: null })
  )
  if (!asGroup) return
  const gid = useStore.getState().createGroup(ids[0])
  if (!gid) return
  useStore.getState().updateGroup(gid, { name: folder.title })
  for (const id of ids.slice(1)) useStore.getState().addTabToGroup(id, gid)
  useStore.getState().focusTab(ids[0])
}

/** "Add bookmark for current tab", "Add folder", "Show bookmarks bar", "Bookmarks manager". */
export function barMenuItems(parentId?: string): MenuEntry[] {
  const s = useStore.getState()
  const tab = focusedTab(s)
  const loc = tab ? tabContent(tab) : null
  const ctx = { books: s.books, notes: s.standaloneNotes }
  return [
    {
      label: 'Add bookmark for current tab…',
      icon: BookmarkPlus,
      disabled: !tab || !loc || !isBookmarkable(loc),
      onSelect: () =>
        tab &&
        loc &&
        openBookmarkDialog({
          type: 'newBookmark',
          location: loc,
          title: tabLocationText(tab, ctx) || tabTitle(tab, ctx),
          parentId
        })
    },
    { label: 'Add folder…', icon: FolderPlus, onSelect: () => openBookmarkDialog({ type: 'newFolder', parentId }) },
    'sep',
    {
      label: 'Show bookmarks bar',
      checked: s.showBookmarksBar,
      shortcut: 'Ctrl+Shift+B',
      onSelect: () => useStore.getState().toggleBookmarksBar()
    },
    { label: 'Bookmarks manager', icon: BookmarkIcon, shortcut: 'Ctrl+Shift+O', onSelect: () => s.openPage('bookmarks') }
  ]
}

/** Right-click on a bookmark or folder (bar, folder dropdown or manager). */
export function nodeMenuItems(node: BookmarkNode, opts: { withBarItems?: boolean } = {}): MenuEntry[] {
  const s = useStore.getState()
  const tail = opts.withBarItems === false ? [] : (['sep', ...barMenuItems(node.item.parentId)] as MenuEntry[])
  if (node.type === 'bookmark') {
    const m = node.item
    return [
      { label: 'Open in new tab', icon: Plus, onSelect: () => openInNewTab(m.location, false) },
      { label: 'Open in new background tab', icon: SquareArrowOutUpRight, onSelect: () => openInNewTab(m.location, true) },
      { label: 'Open in split view', icon: Columns2, onSelect: () => s.openTabInSplit(m.location) },
      'sep',
      { label: 'Edit…', icon: Pencil, onSelect: () => openBookmarkDialog({ type: 'editBookmark', id: m.id }) },
      { label: 'Delete', icon: Trash2, onSelect: () => s.removeBookmark(m.id) },
      ...tail
    ]
  }
  const f = node.item
  const count = bookmarksIn(s.bookmarks, f.id).length
  return [
    { label: `Open all (${count})`, icon: Plus, disabled: count === 0, onSelect: () => openAllInFolder(f, false) },
    { label: 'Open all in new tab group', icon: LayoutGrid, disabled: count === 0, onSelect: () => openAllInFolder(f, true) },
    'sep',
    { label: 'Edit…', icon: Pencil, onSelect: () => openBookmarkDialog({ type: 'editFolder', id: f.id }) },
    {
      label: 'Delete',
      icon: Trash2,
      onSelect: () => {
        const empty = childrenOf(s.bookmarks, f.id).length === 0
        if (empty || window.confirm(`Delete the folder "${f.title}" and everything in it?`)) s.removeBookmarkFolder(f.id)
      }
    },
    ...tail
  ]
}

function locationIcon(loc: TabLocation) {
  return tabDef(loc.kind).icon
}

/** A folder's contents as dropdown entries (subfolders as submenus). */
function folderEntries(folderId: string, onContext: (n: BookmarkNode, x: number, y: number) => void): MenuEntry[] {
  const b = useStore.getState().bookmarks
  const kids = childrenOf(b, folderId)
  if (kids.length === 0) return [{ label: '(empty)', disabled: true }]
  const entries: MenuEntry[] = kids.map((n) =>
    n.type === 'folder'
      ? {
          label: n.item.title,
          icon: Folder,
          submenu: folderEntries(n.item.id, onContext),
          onContext: (e) => onContext(n, e.clientX, e.clientY)
        }
      : {
          label: n.item.title,
          icon: locationIcon(n.item.location),
          onSelect: (p) => openBookmark(n.item, p),
          onContext: (e) => onContext(n, e.clientX, e.clientY)
        }
  )
  const folder = b.folders.find((f) => f.id === folderId)
  const count = bookmarksIn(b, folderId).length
  if (folder && count > 0) {
    entries.push('sep', { label: `Open all (${count})`, onSelect: () => openAllInFolder(folder, false) })
    entries.push({ label: 'Open all in new tab group', onSelect: () => openAllInFolder(folder, true) })
  }
  return entries
}

interface BarItem {
  key: string
  label: string
  icon: LucideIcon
  node?: BookmarkNode
  fixed?: FixedView
}

/**
 * Chrome's bookmarks bar: pinned tab groups and the ⊞ tab groups menu, the fixed views, then
 * the owner's bookmarks and folders (drag to reorder or drop onto a folder). Items that don't
 * fit go in the » menu.
 */
export function BookmarksBar() {
  const show = useStore((s) => s.showBookmarksBar)
  const groups = useStore((s) => s.groups)
  const bookmarks = useStore((s) => s.bookmarks)
  const openGroup = useStore((s) => s.openGroup)
  const moveBookmarkNode = useStore((s) => s.moveBookmarkNode)
  const [menu, setMenu] = useState<Menu>(null)
  const [groupsMenu, setGroupsMenu] = useState<{ x: number; y: number } | null>(null)
  const [drop, setDrop] = useState<{ key: string; pos: 'before' | 'after' | 'into' } | null>(null)
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [width, setWidth] = useState(0)
  const rowRef = useRef<HTMLDivElement>(null)
  const dragId = useRef<string | null>(null)

  const items: BarItem[] = useMemo(() => {
    const fixed: BarItem[] = FIXED.map((f) => ({
      key: `fixed:${f.view}`,
      label: f.label,
      icon: TAB_REGISTRY[f.kind].icon,
      fixed: f.view
    }))
    const own: BarItem[] = childrenOf(bookmarks).map((n) => ({
      key: n.item.id,
      label: n.item.title,
      icon: n.type === 'folder' ? Folder : locationIcon(n.item.location),
      node: n
    }))
    return [...fixed, ...own]
  }, [bookmarks])

  // Which items overflow the row (they're clipped and listed under »).
  useLayoutEffect(() => {
    const row = rowRef.current
    if (!row) return
    const measure = (): void => setWidth(row.clientWidth)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(row)
    return () => ro.disconnect()
  }, [show])
  useLayoutEffect(() => {
    const row = rowRef.current
    if (!row) return
    const next = new Set<string>()
    for (const el of Array.from(row.querySelectorAll<HTMLElement>('[data-bb-key]'))) {
      if (el.offsetLeft + el.offsetWidth > row.clientWidth + 1) next.add(el.dataset.bbKey!)
    }
    setHidden((prev) => (prev.size === next.size && [...next].every((k) => prev.has(k)) ? prev : next))
  }, [items, width])

  if (!show) return null

  const openNodeMenu = (n: BookmarkNode, x: number, y: number): void => setMenu({ x, y, items: nodeMenuItems(n) })

  const openFolder = (f: BookmarkFolder, el: HTMLElement): void => {
    const r = el.getBoundingClientRect()
    setMenu({ x: r.left, y: r.bottom + 4, items: folderEntries(f.id, openNodeMenu) })
  }

  const clickItem = (it: BarItem, e: ReactMouseEvent<HTMLElement>): void => {
    if (it.fixed) void openFixedView(it.fixed, isBackgroundClick(e))
    else if (it.node?.type === 'bookmark') openBookmark(it.node.item, e)
    else if (it.node?.type === 'folder') openFolder(it.node.item, e.currentTarget)
  }

  const contextItem = (it: BarItem, e: ReactMouseEvent): void => {
    e.preventDefault()
    e.stopPropagation()
    if (it.node) return openNodeMenu(it.node, e.clientX, e.clientY)
    const view = it.fixed!
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        { label: 'Open in new tab', icon: Plus, onSelect: () => void openFixedView(view, false) },
        { label: 'Open in new background tab', icon: SquareArrowOutUpRight, onSelect: () => void openFixedView(view, true) },
        'sep',
        ...barMenuItems()
      ]
    })
  }

  // --- drag to reorder / into folders (the owner's items only) ---
  const own = childrenOf(bookmarks)
  const dropAt = (e: ReactDragEvent, it: BarItem | null): void => {
    if (!e.dataTransfer.types.includes(DRAG_TYPE)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (!it?.node) {
      setDrop({ key: 'end', pos: 'before' })
      return
    }
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const x = e.clientX - r.left
    let pos: 'before' | 'after' | 'into' = x < r.width / 2 ? 'before' : 'after'
    if (it.node.type === 'folder' && x > r.width * 0.25 && x < r.width * 0.75 && it.node.item.id !== dragId.current) pos = 'into'
    setDrop({ key: it.key, pos })
  }
  const finishDrop = (e: ReactDragEvent): void => {
    e.preventDefault()
    const id = dragId.current ?? e.dataTransfer.getData(DRAG_TYPE)
    const target = drop
    setDrop(null)
    dragId.current = null
    if (!id || !target) return
    if (target.key === 'end') return moveBookmarkNode(id, undefined, Infinity)
    if (target.key === id) return
    if (target.pos === 'into') return moveBookmarkNode(id, target.key, Infinity)
    const siblings = own.filter((n) => n.item.id !== id)
    const i = siblings.findIndex((n) => n.item.id === target.key)
    moveBookmarkNode(id, undefined, i < 0 ? Infinity : target.pos === 'before' ? i : i + 1)
  }

  const overflow = items.filter((it) => hidden.has(it.key))
  const pinned = groups.filter((g) => g.pinnedToBar)

  return (
    <div
      className="bbar"
      onContextMenu={(e) => {
        e.preventDefault()
        setMenu({ x: e.clientX, y: e.clientY, items: barMenuItems() })
      }}
    >
      {pinned.map((g) => (
        <button
          key={g.id}
          className={`bb-item bb-group${g.open ? '' : ' closed'}`}
          style={{ '--gc': GROUP_COLORS[g.color] } as CSSProperties}
          title={g.open ? `${groupName(g)} (open)` : `${groupName(g)} (closed: click to reopen)`}
          data-group-chip={g.id}
          onClick={() => openGroup(g.id)}
          onContextMenu={(e) => {
            e.preventDefault()
            e.stopPropagation()
            setMenu({ x: e.clientX, y: e.clientY, items: savedGroupActions(g, { pinEntry: 'unpin' }) })
          }}
        >
          <span className="bb-dot" />
          <span className="bb-label">{groupName(g)}</span>
        </button>
      ))}
      <button
        className="bb-item bb-icon"
        title="Tab groups"
        data-bb-groups
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          setGroupsMenu({ x: r.left, y: r.bottom + 4 })
        }}
      >
        <LayoutGrid size={14} />
      </button>
      <div className="bb-sep" />
      <div
        className="bb-row"
        ref={rowRef}
        onDragOver={(e) => dropAt(e, null)}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setDrop(null)
        }}
        onDrop={finishDrop}
      >
        {items.map((it, i) => {
          const Icon = it.icon
          const isHidden = hidden.has(it.key)
          const dropCls = drop?.key === it.key ? ` drop-${drop.pos}` : ''
          return (
            <span key={it.key} className="bb-slot" data-bb-key={it.key} style={isHidden ? { visibility: 'hidden' } : undefined}>
              {i === FIXED.length && <span className="bb-sep" />}
              <button
                className={`bb-item${dropCls}`}
                title={it.node?.type === 'bookmark' ? `${it.label}\nClick: new tab. Ctrl or middle click: background tab.` : it.label}
                draggable={!!it.node}
                onDragStart={(e) => {
                  if (!it.node) return
                  dragId.current = it.node.item.id
                  e.dataTransfer.setData(DRAG_TYPE, it.node.item.id)
                  e.dataTransfer.effectAllowed = 'move'
                }}
                onDragEnd={() => {
                  dragId.current = null
                  setDrop(null)
                }}
                onDragOver={(e) => {
                  e.stopPropagation()
                  dropAt(e, it)
                }}
                onDrop={(e) => {
                  e.stopPropagation()
                  finishDrop(e)
                }}
                onMouseDown={(e) => {
                  if (e.button === 1) e.preventDefault()
                }}
                onClick={(e) => clickItem(it, e)}
                onAuxClick={(e) => {
                  if (e.button !== 1) return
                  e.preventDefault()
                  if (it.fixed) void openFixedView(it.fixed, true)
                  else if (it.node?.type === 'bookmark') openInNewTab(it.node.item.location, true)
                }}
                onContextMenu={(e) => contextItem(it, e)}
              >
                <Icon size={14} />
                <span className="bb-label">{it.label}</span>
              </button>
            </span>
          )
        })}
        {drop?.key === 'end' && <span className="bb-drop-end" />}
      </div>
      {overflow.length > 0 && (
        <button
          className="bb-item bb-icon bb-more"
          title="More bookmarks"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect()
            setMenu({
              x: r.right - 240,
              y: r.bottom + 4,
              items: overflow.map((it): MenuEntry => {
                if (it.fixed) {
                  const view = it.fixed
                  return { label: it.label, icon: it.icon, onSelect: (p) => void openFixedView(view, isBackgroundClick(p)) }
                }
                const n = it.node!
                return n.type === 'folder'
                  ? { label: n.item.title, icon: Folder, submenu: folderEntries(n.item.id, openNodeMenu), onContext: (ev) => openNodeMenu(n, ev.clientX, ev.clientY) }
                  : {
                      label: n.item.title,
                      icon: locationIcon(n.item.location),
                      onSelect: (p) => openBookmark(n.item, p),
                      onContext: (ev) => openNodeMenu(n, ev.clientX, ev.clientY)
                    }
              })
            })
          }}
        >
          <ChevronsRight size={14} />
        </button>
      )}
      {menu && <PopupMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
      {groupsMenu && <TabGroupsMenu x={groupsMenu.x} y={groupsMenu.y} onClose={() => setGroupsMenu(null)} />}
    </div>
  )
}

/** For the manager and tests: a location's label as the registry gives it. */
export function locationLabel(loc: TabLocation): string {
  const s = useStore.getState()
  return tabTitle(locationTab(loc), { books: s.books, notes: s.standaloneNotes })
}
