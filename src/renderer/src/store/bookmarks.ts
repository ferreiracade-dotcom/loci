import { contentKey, migrateLocation } from './workspace'
import type { TabLocation } from './workspace'

/**
 * A saved location (Chrome bookmark). `parentId` is a folder id; absent = the bookmarks bar.
 * `order` sorts a folder's children (bookmarks and folders share one sequence, as in Chrome).
 */
export interface Bookmark {
  id: string
  title: string
  location: TabLocation
  parentId?: string
  order?: number
}

export interface BookmarkFolder {
  id: string
  title: string
  parentId?: string
  order?: number
}

export interface Bookmarks {
  bookmarks: Bookmark[]
  folders: BookmarkFolder[]
}

/** One child of a folder (or of the bar), for rendering in order. */
export type BookmarkNode =
  | { type: 'bookmark'; item: Bookmark }
  | { type: 'folder'; item: BookmarkFolder }

export const EMPTY_BOOKMARKS: Bookmarks = { bookmarks: [], folders: [] }

/**
 * Identity of a bookmarkable location. Unlike `contentKey` (which treats highlighted verses as
 * a view detail) the verses count here, as a URL fragment does in Chrome: John 3:16 and John 3
 * are different bookmarks.
 */
export function bookmarkKey(loc: TabLocation): string {
  const hl = 'highlight' in loc && Array.isArray(loc.highlight) && loc.highlight.length ? loc.highlight : null
  return hl ? `${contentKey(loc)}#${hl.join(',')}` : contentKey(loc)
}

export function findBookmark(b: Bookmarks, loc: TabLocation): Bookmark | undefined {
  const key = bookmarkKey(loc)
  return b.bookmarks.find((m) => bookmarkKey(m.location) === key)
}

/** New-tab pages and the browser's own pages have nothing worth bookmarking. */
export function isBookmarkable(loc: TabLocation): boolean {
  return loc.kind !== 'newtab' && loc.kind !== 'settings' && loc.kind !== 'history' && loc.kind !== 'bookmarks'
}

/** A folder's children (or the bar's, for `parentId` undefined), in order. */
export function childrenOf(b: Bookmarks, parentId?: string): BookmarkNode[] {
  const nodes: BookmarkNode[] = [
    ...b.folders.filter((f) => f.parentId === parentId).map((item) => ({ type: 'folder' as const, item })),
    ...b.bookmarks.filter((m) => m.parentId === parentId).map((item) => ({ type: 'bookmark' as const, item }))
  ]
  return nodes.sort((x, y) => (x.item.order ?? Infinity) - (y.item.order ?? Infinity))
}

function nextOrder(b: Bookmarks, parentId?: string): number {
  const kids = childrenOf(b, parentId)
  return kids.length ? Math.max(...kids.map((k) => k.item.order ?? 0)) + 1 : 0
}

export function findFolder(b: Bookmarks, id: string | undefined): BookmarkFolder | undefined {
  return id ? b.folders.find((f) => f.id === id) : undefined
}

/** Ids of a folder and every folder nested in it. */
export function folderSubtree(b: Bookmarks, id: string): Set<string> {
  const out = new Set<string>([id])
  let grew = true
  while (grew) {
    grew = false
    for (const f of b.folders) {
      if (f.parentId && out.has(f.parentId) && !out.has(f.id)) {
        out.add(f.id)
        grew = true
      }
    }
  }
  return out
}

/** Folder titles from the bar down to `id` (empty for the bar itself). */
export function folderPath(b: Bookmarks, id: string | undefined): BookmarkFolder[] {
  const path: BookmarkFolder[] = []
  const seen = new Set<string>()
  let f = findFolder(b, id)
  while (f && !seen.has(f.id)) {
    seen.add(f.id)
    path.unshift(f)
    f = findFolder(b, f.parentId)
  }
  return path
}

/** Every bookmark inside a folder, at any depth, in tree order. */
export function bookmarksIn(b: Bookmarks, parentId?: string): Bookmark[] {
  const out: Bookmark[] = []
  for (const n of childrenOf(b, parentId)) {
    if (n.type === 'bookmark') out.push(n.item)
    else out.push(...bookmarksIn(b, n.item.id))
  }
  return out
}

export function addBookmark(
  b: Bookmarks,
  loc: TabLocation,
  title: string,
  id: string = crypto.randomUUID(),
  parentId?: string
): { bookmarks: Bookmarks; bookmark: Bookmark } {
  const existing = findBookmark(b, loc)
  if (existing) return { bookmarks: b, bookmark: existing }
  const parent = findFolder(b, parentId)?.id
  const bookmark: Bookmark = { id, title: title.trim() || 'Bookmark', location: loc, order: nextOrder(b, parent) }
  if (parent) bookmark.parentId = parent
  return { bookmarks: { ...b, bookmarks: [...b.bookmarks, bookmark] }, bookmark }
}

export function removeBookmark(b: Bookmarks, id: string): Bookmarks {
  if (!b.bookmarks.some((m) => m.id === id)) return b
  return { ...b, bookmarks: b.bookmarks.filter((m) => m.id !== id) }
}

export function renameBookmark(b: Bookmarks, id: string, title: string): Bookmarks {
  const t = title.trim()
  if (!t) return b
  return { ...b, bookmarks: b.bookmarks.map((m) => (m.id === id ? { ...m, title: t } : m)) }
}

/** The ☆ / Ctrl+D action: bookmark `loc`, or remove its bookmark if it already has one. */
export function toggleBookmark(
  b: Bookmarks,
  loc: TabLocation,
  title: string
): { bookmarks: Bookmarks; added: Bookmark | null } {
  const existing = findBookmark(b, loc)
  if (existing) return { bookmarks: removeBookmark(b, existing.id), added: null }
  const { bookmarks, bookmark } = addBookmark(b, loc, title)
  return { bookmarks, added: bookmark }
}

export function addFolder(
  b: Bookmarks,
  title: string,
  parentId?: string,
  id: string = crypto.randomUUID()
): { bookmarks: Bookmarks; folder: BookmarkFolder } {
  const parent = findFolder(b, parentId)?.id
  const folder: BookmarkFolder = { id, title: title.trim() || 'New folder', order: nextOrder(b, parent) }
  if (parent) folder.parentId = parent
  return { bookmarks: { ...b, folders: [...b.folders, folder] }, folder }
}

export function renameFolder(b: Bookmarks, id: string, title: string): Bookmarks {
  const t = title.trim()
  if (!t || !findFolder(b, id)) return b
  return { ...b, folders: b.folders.map((f) => (f.id === id ? { ...f, title: t } : f)) }
}

/** Delete a folder with everything in it, as Chrome does. */
export function removeFolder(b: Bookmarks, id: string): Bookmarks {
  if (!findFolder(b, id)) return b
  const gone = folderSubtree(b, id)
  return {
    folders: b.folders.filter((f) => !gone.has(f.id)),
    bookmarks: b.bookmarks.filter((m) => !m.parentId || !gone.has(m.parentId))
  }
}

/**
 * Move a bookmark or folder into `parentId` (undefined = the bar) at position `index` among
 * that parent's children. A folder can't move into itself or its own subfolders.
 */
export function moveNode(b: Bookmarks, id: string, parentId: string | undefined, index: number): Bookmarks {
  const isFolder = b.folders.some((f) => f.id === id)
  const isMark = b.bookmarks.some((m) => m.id === id)
  if (!isFolder && !isMark) return b
  if (parentId !== undefined && !findFolder(b, parentId)) return b
  if (isFolder && parentId !== undefined && folderSubtree(b, id).has(parentId)) return b
  const siblings = childrenOf(b, parentId).filter((n) => n.item.id !== id)
  const at = Math.max(0, Math.min(index, siblings.length))
  const moving: BookmarkNode = isFolder
    ? { type: 'folder', item: b.folders.find((f) => f.id === id)! }
    : { type: 'bookmark', item: b.bookmarks.find((m) => m.id === id)! }
  const ordered = [...siblings.slice(0, at), moving, ...siblings.slice(at)]
  const orderOf = new Map(ordered.map((n, i) => [n.item.id, i]))
  const place = <T extends Bookmark | BookmarkFolder>(x: T): T => {
    const o = orderOf.get(x.id)
    if (o === undefined) return x
    const next = { ...x, order: o }
    if (parentId === undefined) delete next.parentId
    else next.parentId = parentId
    return next
  }
  return { folders: b.folders.map(place), bookmarks: b.bookmarks.map(place) }
}

/** The Edit dialog: rename, and optionally move to another folder (appended at its end). */
export function editBookmark(
  b: Bookmarks,
  id: string,
  patch: { title?: string; parentId?: string | null }
): Bookmarks {
  let next = b
  if (patch.title !== undefined) next = renameBookmark(next, id, patch.title)
  if (patch.parentId !== undefined) {
    const parent = patch.parentId ?? undefined
    const m = next.bookmarks.find((x) => x.id === id)
    if (m && m.parentId !== parent) next = moveNode(next, id, parent, Infinity)
  }
  return next
}

/** Folder edit: rename and/or move. */
export function editFolder(
  b: Bookmarks,
  id: string,
  patch: { title?: string; parentId?: string | null }
): Bookmarks {
  let next = b
  if (patch.title !== undefined) next = renameFolder(next, id, patch.title)
  if (patch.parentId !== undefined) {
    const parent = patch.parentId ?? undefined
    const f = findFolder(next, id)
    if (f && f.parentId !== parent) next = moveNode(next, id, parent, Infinity)
  }
  return next
}

/** Bookmarks and folders whose title contains every word of `query` (case-insensitive). */
export function searchBookmarks(b: Bookmarks, query: string): BookmarkNode[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return []
  const hit = (s: string): boolean => words.every((w) => s.toLowerCase().includes(w))
  return [
    ...b.folders.filter((f) => hit(f.title)).map((item) => ({ type: 'folder' as const, item })),
    ...b.bookmarks.filter((m) => hit(m.title)).map((item) => ({ type: 'bookmark' as const, item }))
  ]
}

/**
 * Repair a loaded tree: dangling or cyclic parents go to the bar, and every parent's children
 * get contiguous orders (missing orders keep their array position).
 */
export function normalizeBookmarks(b: Bookmarks): Bookmarks {
  const ids = new Set(b.folders.map((f) => f.id))
  let folders = b.folders.map((f) => (f.parentId && !ids.has(f.parentId) ? withoutParent(f) : f))
  // Break cycles: walk up from each folder; if we revisit, cut its parent.
  const byId = new Map(folders.map((f) => [f.id, f]))
  folders = folders.map((f) => {
    const seen = new Set<string>([f.id])
    let p = f.parentId ? byId.get(f.parentId) : undefined
    while (p) {
      if (seen.has(p.id)) return withoutParent(f)
      seen.add(p.id)
      p = p.parentId ? byId.get(p.parentId) : undefined
    }
    return f
  })
  const bookmarks = b.bookmarks.map((m) => (m.parentId && !ids.has(m.parentId) ? withoutParent(m) : m))
  const fixedIds = new Set(folders.map((f) => f.id))
  let out: Bookmarks = { folders, bookmarks }
  for (const parent of [undefined, ...fixedIds]) {
    const kids = [
      ...out.folders.map((item, i) => ({ item, i, type: 'folder' as const })),
      ...out.bookmarks.map((item, i) => ({ item, i: i + 1e6, type: 'bookmark' as const }))
    ]
      .filter((k) => k.item.parentId === parent)
      .sort((x, y) => (x.item.order ?? Infinity) - (y.item.order ?? Infinity) || x.i - y.i)
    const orderOf = new Map(kids.map((k, i) => [k.item.id, i]))
    out = {
      folders: out.folders.map((f) => (orderOf.has(f.id) && f.order !== orderOf.get(f.id) ? { ...f, order: orderOf.get(f.id) } : f)),
      bookmarks: out.bookmarks.map((m) =>
        orderOf.has(m.id) && m.order !== orderOf.get(m.id) ? { ...m, order: orderOf.get(m.id) } : m
      )
    }
  }
  return out
}

function withoutParent<T extends { parentId?: string }>(x: T): T {
  const next = { ...x }
  delete next.parentId
  return next
}

/** Parse the persisted bookmarks. Never throws; drops malformed entries. */
export function parseBookmarks(json: string | null): Bookmarks {
  if (!json) return EMPTY_BOOKMARKS
  try {
    const raw = JSON.parse(json) as Partial<Bookmarks>
    const bookmarks = Array.isArray(raw.bookmarks)
      ? raw.bookmarks.filter(
          (m): m is Bookmark =>
            !!m &&
            typeof m.id === 'string' &&
            typeof m.title === 'string' &&
            !!m.location &&
            typeof m.location.kind === 'string'
        ).map((m) => ({ ...m, location: migrateLocation(m.location) }))
      : []
    const folders = Array.isArray(raw.folders)
      ? raw.folders.filter((f): f is BookmarkFolder => !!f && typeof f.id === 'string' && typeof f.title === 'string')
      : []
    return normalizeBookmarks({ bookmarks, folders })
  } catch {
    return EMPTY_BOOKMARKS
  }
}

export function serializeBookmarks(b: Bookmarks): string {
  return JSON.stringify({ version: 1, bookmarks: b.bookmarks, folders: b.folders })
}

/**
 * Where bookmarks come from at startup. The vault file wins once it exists; before that, the
 * session_state copy from phase 2 is migrated (and should then be written to the vault).
 */
export function migrateBookmarks(
  vaultJson: string | null,
  sessionJson: string | null
): { bookmarks: Bookmarks; migrated: boolean } {
  if (vaultJson !== null) return { bookmarks: parseBookmarks(vaultJson), migrated: false }
  const legacy = parseBookmarks(sessionJson)
  const migrated = legacy.bookmarks.length > 0 || legacy.folders.length > 0
  return { bookmarks: legacy, migrated }
}
