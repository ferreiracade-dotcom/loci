import { useEffect, useRef, useState } from 'react'
import { useStore } from '../../store/useStore'
import { SearchView } from '../library/SearchView'

/**
 * A 'search' tab: full Loci search results for the tab's query (from the New Tab page or the
 * omnibox's "Search Loci for …"). Editing the query updates this history entry in place, so
 * Back still returns to the New Tab page.
 */
export function SearchPage({ tabId, query }: { tabId: string; query: string }) {
  const replaceTabContent = useStore((s) => s.replaceTabContent)
  const [q, setQ] = useState(query)
  const timer = useRef<number | null>(null)

  // Back/Forward between two searches in this tab.
  useEffect(() => {
    setQ((cur) => (cur === query ? cur : query))
  }, [query])

  useEffect(
    () => () => {
      if (timer.current != null) window.clearTimeout(timer.current)
    },
    []
  )

  const change = (v: string): void => {
    setQ(v)
    if (timer.current != null) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      timer.current = null
      if (v.trim()) replaceTabContent(tabId, { kind: 'search', query: v })
    }, 500)
  }

  return (
    <div className="search-page">
      <SearchView query={q} onQueryChange={change} />
    </div>
  )
}
