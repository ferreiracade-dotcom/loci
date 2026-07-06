import type { Book } from '@shared/ipc'

/**
 * Whether a book matches a free-text query — title, author, and series (including "<series> <n>"
 * and "<abbr> <n>" as contiguous strings, so "ANF 1" or "Ante-Nicene Fathers 1" finds the right
 * volume). Shared by the library list and the reference-panel book browser so they agree on what
 * counts as a match.
 */
export function bookMatchesQuery(book: Book, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const terms = q.split(/\s+/).filter(Boolean)
  const series = book.series ?? ''
  const num = book.seriesNumber ?? ''
  const abbr = book.seriesAbbr ?? ''
  const hay = [
    book.title,
    book.author ?? '',
    series,
    abbr,
    num,
    series && num ? `${series} ${num}` : '',
    abbr && num ? `${abbr} ${num}` : ''
  ]
    .join(' ')
    .toLowerCase()
  return terms.every((t) => hay.includes(t))
}
