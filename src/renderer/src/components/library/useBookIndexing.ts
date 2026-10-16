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

  const upToDate = !indexing && pending === 0
  const label = indexing
    ? indexing.total === 0
      ? 'Index up to date'
      : `Indexing ${indexing.done}/${indexing.total}…`
    : pending === null
      ? 'Build index'
      : pending === 0
        ? 'Index up to date'
        : `Build index (${pending} pending)`

  return { indexing, label, upToDate, startIndexing, cancelIndexing }
}
