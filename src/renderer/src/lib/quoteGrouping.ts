import type { Book, Quote } from '@shared/ipc'

export const UNKNOWN_AUTHOR = 'Unknown author'
export const SCRIPTURE_AUTHOR = 'Scripture'

/** The "Author" group a quote belongs to: the book's author, the commentary source's author, or
 *  the fixed "Scripture" bucket for Bible quotes (which have no author of their own). Shared
 *  between the Quotes nav (building the group list) and its group pane (filtering by author). */
export function authorFor(q: Quote, books: Book[]): string {
  if (q.bookId) return books.find((b) => b.id === q.bookId)?.author?.trim() || UNKNOWN_AUTHOR
  if (q.commentarySource) return q.commentaryAuthor?.trim() || UNKNOWN_AUTHOR
  return SCRIPTURE_AUTHOR
}
