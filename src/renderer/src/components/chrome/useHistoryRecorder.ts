import { useEffect, useRef } from 'react'
import { useStore } from '../../store/useStore'
import { contentKey, tabContent } from '../../store/workspace'
import { api } from '../../lib/api'
import { tabDef, tabTitle } from './tabRegistry'

/**
 * Records a History entry whenever a tab's location changes (a new tab, or a tab navigating).
 * Tabs restored at startup are seeded, not recorded; focusing a tab is not a visit.
 */
export function useHistoryRecorder(): void {
  const seen = useRef<Map<string, string> | null>(null)

  useEffect(() => {
    const record = (tabs: ReturnType<typeof useStore.getState>['tabs']): void => {
      const { books, standaloneNotes } = useStore.getState()
      const next = new Map<string, string>()
      for (const tab of tabs) {
        const content = tabContent(tab)
        const key = contentKey(content)
        next.set(tab.id, key)
        if (!seen.current || seen.current.get(tab.id) === key) continue
        if (!tabDef(tab.kind).recordHistory) continue
        void api
          .addHistory({
            kind: tab.kind,
            title: tabTitle(tab, { books, notes: standaloneNotes }),
            location: JSON.stringify(content)
          })
          .catch(() => {
            /* best effort */
          })
      }
      seen.current = next
    }
    record(useStore.getState().tabs)
    return useStore.subscribe((s, prev) => {
      if (s.tabs !== prev.tabs) record(s.tabs)
    })
  }, [])
}
