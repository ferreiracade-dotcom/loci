import { describe, expect, it, vi } from 'vitest'

// A second device: the wizard points Loci at a vault that already has bookmarks and a saved
// tab group. Finishing the wizard must load them, not start from empty copies that the first
// change would write back over the vault's.
// The merged view main hands over from the vault's device folders.
const snapshot = {
  deviceId: 'dev-b',
  deviceName: 'B',
  bookmarks: [
    { id: 'm1', type: 'bookmark', title: 'Romans 3', location: { kind: 'bible', book: 'ROM', chapter: 3 }, order: 0 }
  ],
  tabGroups: [
    {
      id: 'g1',
      name: 'Study',
      color: 'blue',
      pinnedToBar: true,
      createdAt: 1,
      tabs: [{ location: { kind: 'bible', book: 'ROM', chapter: 3 } }],
      splitRatios: {}
    }
  ],
  devices: [],
  legacyTabGroups: null
}
const writes: [string, { upserts: { id: string }[]; deletes: string[] }][] = []
const calls: Record<string, (...a: unknown[]) => unknown> = {
  getAppState: () => ({ setupComplete: true, vaultPath: '/v', vaultExists: true }),
  completeWizard: () => ({ setupComplete: true, vaultPath: '/v', vaultExists: true }),
  getConfig: () => ({ theme: {}, scriptureTranslation: 'BSB' }),
  getLayout: () => ({ notesCollapsed: true, notesWidth: 300, activeRightTab: 'quotes' }),
  listBooks: () => [],
  listShelves: () => [],
  listTags: () => [],
  listStandaloneNotes: () => [],
  syncInit: () => snapshot,
  syncPut: (kind, changes) => {
    writes.push([kind as string, changes as (typeof writes)[number][1]])
  }
}
vi.mock('../lib/api', () => ({
  api: new Proxy(
    {},
    { get: (_t, name: string) => (...a: unknown[]) => Promise.resolve(calls[name] ? calls[name](...a) : null) }
  )
}))
vi.mock('../lib/pdfIndex', () => ({ extractAndIndexBook: () => Promise.resolve() }))
vi.mock('../lib/theme', () => ({ applyTheme: () => undefined }))

const { useStore } = await import('./useStore')

describe('finishing the setup wizard', () => {
  it('loads the vault bookmarks and groups and opens a New Tab page', async () => {
    await useStore.getState().completeWizard({} as never)
    const s = useStore.getState()
    expect(s.phase).toBe('ready')
    expect(s.bookmarks.bookmarks.map((m) => m.title)).toEqual(['Romans 3'])
    expect(s.groups.map((g) => g.name)).toEqual(['Study'])
    expect(s.tabs).toHaveLength(1)
    expect(s.activeTabId).toBe(s.tabs[0].id)

    // A change afterwards records just that change: nothing synced is deleted or rewritten.
    s.newTab(null)
    s.addBookmark({ kind: 'bible', book: 'JHN', chapter: 1 }, 'John 1')
    await new Promise((r) => setTimeout(r, 700))
    const bm = writes.filter(([k]) => k === 'bookmarks')
    expect(bm).toHaveLength(1)
    expect(bm[0][1].deletes).toEqual([])
    expect(bm[0][1].upserts.map((u) => u.id)).not.toContain('m1')
    expect(writes.filter(([k]) => k === 'tabGroups')).toEqual([])
  })
})
