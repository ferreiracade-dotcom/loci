import { describe, expect, it } from 'vitest'
import {
  EMPTY_BOOKMARKS,
  addBookmark,
  findBookmark,
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
})
