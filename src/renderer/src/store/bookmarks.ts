import { contentKey } from './workspace'
import type { TabLocation } from './workspace'

/** A saved location (Chrome bookmark). `parentId` is a folder id; absent = the bookmarks bar. */
export interface Bookmark {
  id: string
  title: string
  location: TabLocation
  parentId?: string
}

export interface BookmarkFolder {
  id: string
  title: string
  parentId?: string
}

export interface Bookmarks {
  bookmarks: Bookmark[]
  folders: BookmarkFolder[]
}

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

/** New-tab pages and Settings/History have nothing worth bookmarking. */
export function isBookmarkable(loc: TabLocation): boolean {
  return loc.kind !== 'newtab' && loc.kind !== 'settings' && loc.kind !== 'history'
}

export function addBookmark(
  b: Bookmarks,
  loc: TabLocation,
  title: string,
  id: string = crypto.randomUUID()
): { bookmarks: Bookmarks; bookmark: Bookmark } {
  const existing = findBookmark(b, loc)
  if (existing) return { bookmarks: b, bookmark: existing }
  const bookmark: Bookmark = { id, title: title.trim() || 'Bookmark', location: loc }
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
        )
      : []
    const folders = Array.isArray(raw.folders)
      ? raw.folders.filter((f): f is BookmarkFolder => !!f && typeof f.id === 'string' && typeof f.title === 'string')
      : []
    return { bookmarks, folders }
  } catch {
    return EMPTY_BOOKMARKS
  }
}

export function serializeBookmarks(b: Bookmarks): string {
  return JSON.stringify({ version: 1, bookmarks: b.bookmarks, folders: b.folders })
}
