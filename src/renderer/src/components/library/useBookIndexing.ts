import { useEffect, useState } from 'react'
import { useStore } from '../../store/useStore'
import { api } from '../../lib/api'

/** Shared controls for the library-wide index, including articles. */
export function useBookIndexing() {
  const books = useStore((s) => s.books)
  const indexing = useStore((s) => s.indexing)
  const startIndexing = useStore((s) => s.startIndexing)
  const cancelIndexing = useStore((s) => s.cancelIndexing)
  const [pending, setPending] = useState<number | null>(null)

  useEffect(() => {
    let current = true
    if (!indexing) {
      void api.unindexedBooks().then(
        (items) => {
          if (current) setPending(items.length)
        },
        () => {
          if (current) setPending(null)
        }
      )
    }
    return () => {
      current = false
    }
  }, [books, indexing])

  const label = indexing
    ? indexing.total === 0
      ? 'Index up to date'
      : `Indexing ${indexing.done}/${indexing.total}…`
    : pending === null
      ? 'Index books'
      : `Index books (${pending} pending)`

  return { indexing, label, startIndexing, cancelIndexing }
}
