import { useEffect } from 'react'
import { useStore } from '../../store/useStore'
import { sortedTabs, tabContent } from '../../store/workspace'
import { GROUP_COLORS, groupName } from '../../store/tabGroups'
import { api } from '../../lib/api'
import type { RemoteTab } from '@shared/sync'
import { tabTitle } from './tabRegistry'

/** How long the strip must stay still before its tabs are published. */
const PUBLISH_DELAY_MS = 5000

/** This device's open tabs, as other devices' History pages list them. */
export function openTabsSnapshot(state: ReturnType<typeof useStore.getState>): RemoteTab[] {
  const ctx = { books: state.books, notes: state.standaloneNotes }
  return sortedTabs(state.tabs)
    .filter((t) => t.kind !== 'newtab')
    .map((t) => {
      const g = t.groupId ? state.groups.find((x) => x.id === t.groupId) : undefined
      const location = JSON.parse(JSON.stringify(tabContent(t))) as RemoteTab['location']
      return {
        title: tabTitle(t, ctx),
        location,
        ...(g ? { groupName: groupName(g), groupColor: GROUP_COLORS[g.color] } : {})
      }
    })
}

/**
 * Multi-device sync in the window: applies the merged bookmarks and tab groups main pushes when
 * another device's changes arrive, and publishes this device's open tabs (debounced).
 */
export function useDeviceSync(): void {
  useEffect(() => api.onSyncChanged((s) => useStore.getState().applySync(s)), [])

  useEffect(() => {
    let timer: number | null = null
    const publish = (): void => {
      timer = null
      void api.syncPublishTabs(openTabsSnapshot(useStore.getState())).catch(() => {
        /* best effort */
      })
    }
    const schedule = (): void => {
      if (timer != null) window.clearTimeout(timer)
      timer = window.setTimeout(publish, PUBLISH_DELAY_MS)
    }
    schedule()
    const unsub = useStore.subscribe((s, prev) => {
      if (s.tabs !== prev.tabs || s.groups !== prev.groups || s.books !== prev.books) schedule()
    })
    const flush = (): void => {
      if (timer != null) {
        window.clearTimeout(timer)
        publish()
      }
    }
    window.addEventListener('beforeunload', flush)
    return () => {
      unsub()
      window.removeEventListener('beforeunload', flush)
      if (timer != null) window.clearTimeout(timer)
    }
  }, [])
}
