import { describe, expect, it } from 'vitest'
import {
  EMPTY_BOOKMARKS,
  addBookmark,
  addFolder,
  bookmarksIn,
  childrenOf,
  editBookmark,
  editFolder,
  findBookmark,
  folderPath,
  migrateBookmarks,
  moveNode,
  removeFolder,
  renameFolder,
  searchBookmarks,
  isBookmarkable,
  parseBookmarks,
  removeBookmark,
  renameBookmark,
  serializeBookmarks,
  toggleBookmark
} from './bookmarks'
import type { TabLocation } from './workspace'

const john3: TabLocation = { kind: 'bible', book: 'JHN', chapter: 3, translation: 'BSB' }
const john316: TabLocation = { kind: 'bible', book: 'JHN', chapter: 3, highlight: [16], translation: 'BSB' }
const ac4: TabLocation = { kind: 'boc', documentCode: 'AC', sectionOrdinal: 5 }

describe('bookmarks', () => {
  it('toggle adds, then removes, a bookmark for a location', () => {
    const first = toggleBookmark(EMPTY_BOOKMARKS, john3, 'John 3')
    expect(first.added?.title).toBe('John 3')
    expect(findBookmark(first.bookmarks, john3)?.id).toBe(first.added?.id)
    const second = toggleBookmark(first.bookmarks, john3, 'John 3')
    expect(second.added).toBeNull()
    expect(second.bookmarks.bookmarks).toHaveLength(0)
  })

  it('treats highlighted verses as part of the location', () => {
    const { bookmarks } = toggleBookmark(EMPTY_BOOKMARKS, john316, 'John 3:16')
    expect(findBookmark(bookmarks, john316)).toBeDefined()
    expect(findBookmark(bookmarks, john3)).toBeUndefined()
  })

  it('keeps bookmarks of different quote groups apart', () => {
    const grace: TabLocation = { kind: 'quotes', quotesGroup: { type: 'tag', tag: 'grace' } }
    const luther: TabLocation = { kind: 'quotes', quotesGroup: { type: 'author', author: 'Luther' } }
    const a = toggleBookmark(EMPTY_BOOKMARKS, grace, '#grace')
    expect(findBookmark(a.bookmarks, luther)).toBeUndefined()
    const b = toggleBookmark(a.bookmarks, luther, 'Luther')
    expect(b.added?.title).toBe('Luther')
    expect(b.bookmarks.bookmarks).toHaveLength(2)
  })

  it('does not add a duplicate for the same location', () => {
    const a = addBookmark(EMPTY_BOOKMARKS, ac4, 'AC IV')
    const b = addBookmark(a.bookmarks, { ...ac4 }, 'again')
    expect(b.bookmarks).toBe(a.bookmarks)
    expect(b.bookmark.id).toBe(a.bookmark.id)
  })

  it('renames (ignoring blank names) and removes', () => {
    const a = addBookmark(EMPTY_BOOKMARKS, ac4, 'AC IV', 'x')
    const renamed = renameBookmark(a.bookmarks, 'x', '  Justification ')
    expect(renamed.bookmarks[0].title).toBe('Justification')
    expect(renameBookmark(renamed, 'x', '  ')).toBe(renamed)
    expect(removeBookmark(renamed, 'x').bookmarks).toEqual([])
    expect(removeBookmark(renamed, 'nope')).toBe(renamed)
  })

  it('round-trips through persistence and drops malformed entries', () => {
    const a = addBookmark(EMPTY_BOOKMARKS, ac4, 'AC IV', 'x').bookmarks
    expect(parseBookmarks(serializeBookmarks(a))).toEqual(a)
    expect(parseBookmarks('{"bookmarks":[{"id":1},{"id":"y","title":"t","location":{"kind":"pdf","bookId":"b"}}]}').bookmarks).toHaveLength(1)
    expect(parseBookmarks('not json')).toEqual(EMPTY_BOOKMARKS)
    expect(parseBookmarks(null)).toEqual(EMPTY_BOOKMARKS)
  })

  it('new tab, settings and history pages are not bookmarkable', () => {
    expect(isBookmarkable({ kind: 'newtab' })).toBe(false)
    expect(isBookmarkable({ kind: 'settings' })).toBe(false)
    expect(isBookmarkable({ kind: 'library' })).toBe(true)
    expect(isBookmarkable(john3)).toBe(true)
  })

  it('the manager page is not bookmarkable', () => {
    expect(isBookmarkable({ kind: 'bookmarks' })).toBe(false)
  })
})

const ids = (nodes: { item: { id: string } }[]): string[] => nodes.map((n) => n.item.id)

describe('bookmark folders', () => {
  const base = (): ReturnType<typeof addBookmark>['bookmarks'] => {
    let b = addBookmark(EMPTY_BOOKMARKS, john3, 'John 3', 'j3').bookmarks
    b = addFolder(b, 'Dogmatics', undefined, 'f1').bookmarks
    b = addBookmark(b, ac4, 'AC IV', 'ac', 'f1').bookmarks
    b = addFolder(b, 'Nested', 'f1', 'f2').bookmarks
    return b
  }

  it('adds folders and bookmarks in order, bar and folders sharing one sequence', () => {
    const b = base()
    expect(ids(childrenOf(b))).toEqual(['j3', 'f1'])
    expect(ids(childrenOf(b, 'f1'))).toEqual(['ac', 'f2'])
    expect(addFolder(b, '  ', undefined, 'f3').folder.title).toBe('New folder')
    // A missing parent falls back to the bar.
    expect(addFolder(b, 'X', 'nope', 'f4').folder.parentId).toBeUndefined()
  })

  it('renames and deletes folders with their contents', () => {
    let b = base()
    b = addBookmark(b, john316, 'John 3:16', 'deep', 'f2').bookmarks
    b = renameFolder(b, 'f1', ' Systematics ')
    expect(b.folders.find((f) => f.id === 'f1')?.title).toBe('Systematics')
    expect(renameFolder(b, 'f1', ' ')).toBe(b)
    const gone = removeFolder(b, 'f1')
    expect(gone.folders).toEqual([])
    expect(gone.bookmarks.map((m) => m.id)).toEqual(['j3'])
  })

  it('moves and reorders, refusing to put a folder inside itself', () => {
    let b = base()
    b = moveNode(b, 'ac', undefined, 0)
    expect(ids(childrenOf(b))).toEqual(['ac', 'j3', 'f1'])
    expect(ids(childrenOf(b, 'f1'))).toEqual(['f2'])
    b = moveNode(b, 'j3', 'f2', 0)
    expect(ids(childrenOf(b, 'f2'))).toEqual(['j3'])
    expect(folderPath(b, 'f2').map((f) => f.title)).toEqual(['Dogmatics', 'Nested'])
    expect(moveNode(b, 'f1', 'f2', 0)).toBe(b)
    expect(moveNode(b, 'f1', 'f1', 0)).toBe(b)
    expect(bookmarksIn(b, 'f1').map((m) => m.id)).toEqual(['j3'])
  })

  it('edits a bookmark: rename and move to another folder', () => {
    let b = base()
    b = editBookmark(b, 'j3', { title: 'Nicodemus', parentId: 'f2' })
    const m = b.bookmarks.find((x) => x.id === 'j3')!
    expect(m.title).toBe('Nicodemus')
    expect(m.parentId).toBe('f2')
    b = editBookmark(b, 'j3', { parentId: null })
    expect(b.bookmarks.find((x) => x.id === 'j3')!.parentId).toBeUndefined()
    expect(ids(childrenOf(b))).toEqual(['f1', 'j3'])
    b = editFolder(b, 'f2', { title: 'Inner', parentId: null })
    expect(ids(childrenOf(b))).toEqual(['f1', 'j3', 'f2'])
  })

  it('searches titles by every word', () => {
    const b = base()
    expect(ids(searchBookmarks(b, 'ac'))).toEqual(['ac'])
    expect(ids(searchBookmarks(b, 'dog'))).toEqual(['f1'])
    expect(searchBookmarks(b, '  ')).toEqual([])
  })

  it('repairs dangling and cyclic parents on load', () => {
    const json = JSON.stringify({
      bookmarks: [{ id: 'm', title: 't', location: john3, parentId: 'missing' }],
      folders: [
        { id: 'a', title: 'A', parentId: 'b' },
        { id: 'b', title: 'B', parentId: 'a' }
      ]
    })
    const b = parseBookmarks(json)
    expect(b.bookmarks[0].parentId).toBeUndefined()
    expect(b.folders.some((f) => f.parentId === undefined)).toBe(true)
    expect(childrenOf(b).length).toBeGreaterThan(1)
  })

  it('round-trips folders through persistence', () => {
    const b = base()
    expect(parseBookmarks(serializeBookmarks(b))).toEqual(b)
  })
})

describe('bookmark migration', () => {
  it('migrates the phase-2 session copy when the vault has none', () => {
    const legacy = JSON.stringify({ version: 1, bookmarks: [{ id: 'x', title: 'John 3', location: john3 }], folders: [] })
    const r = migrateBookmarks(null, legacy)
    expect(r.migrated).toBe(true)
    expect(r.bookmarks.bookmarks[0]).toMatchObject({ id: 'x', title: 'John 3', order: 0 })
  })

  it('prefers the vault copy once it exists, even if empty', () => {
    const legacy = JSON.stringify({ bookmarks: [{ id: 'x', title: 'J', location: john3 }] })
    const r = migrateBookmarks('{"version":1,"bookmarks":[],"folders":[]}', legacy)
    expect(r.migrated).toBe(false)
    expect(r.bookmarks.bookmarks).toEqual([])
  })

  it('has nothing to migrate from an empty session', () => {
    expect(migrateBookmarks(null, null)).toEqual({ bookmarks: EMPTY_BOOKMARKS, migrated: false })
  })
})

describe('retired kinds', () => {
  it('a bookmark to the retired Dashboard opens the New Tab page', () => {
    const b = parseBookmarks(
      JSON.stringify({ bookmarks: [{ id: 'm', title: 'Dashboard', location: { kind: 'dashboard' } }], folders: [] })
    )
    expect(b.bookmarks[0].location).toEqual({ kind: 'newtab' })
  })
})
