import { describe, expect, it, vi } from 'vitest'

// A second device: the wizard points Loci at a vault that already has bookmarks and a saved
// tab group. Finishing the wizard must load them, not start from empty copies that the first
// change would write back over the vault's.
const vaultBookmarks = JSON.stringify({
  version: 1,
  bookmarks: [{ id: 'm1', title: 'Romans 3', location: { kind: 'bible', book: 'ROM', chapter: 3 } }],
  folders: []
})
const vaultGroups = JSON.stringify({
  version: 1,
  groups: [
    {
      id: 'g1',
      name: 'Study',
      color: 'blue',
      collapsed: false,
      pinnedToBar: true,
      open: false,
      savedTabs: [{ id: 't1', order: 0, kind: 'bible', book: 'ROM', chapter: 3 }]
    }
  ]
})
const writes: [string, string][] = []
const calls: Record<string, (...a: unknown[]) => unknown> = {
  getAppState: () => ({ setupComplete: true, vaultPath: '/v', vaultExists: true }),
  completeWizard: () => ({ setupComplete: true, vaultPath: '/v', vaultExists: true }),
  getConfig: () => ({ theme: {}, scriptureTranslation: 'BSB' }),
  getLayout: () => ({ notesCollapsed: true, notesWidth: 300, activeRightTab: 'quotes' }),
  listBooks: () => [],
  listShelves: () => [],
  listTags: () => [],
  listStandaloneNotes: () => [],
  getVaultData: (key) => (key === 'bookmarks' ? vaultBookmarks : vaultGroups),
  setVaultData: (key, json) => {
    writes.push([key as string, json as string])
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

    // A change afterwards keeps the vault's group and bookmark in what is written.
    s.newTab(null)
    s.addBookmark({ kind: 'bible', book: 'JHN', chapter: 1 }, 'John 1')
    await new Promise((r) => setTimeout(r, 700))
    const bm = writes.filter(([k]) => k === 'bookmarks').pop()
    expect(bm && JSON.parse(bm[1]).bookmarks).toHaveLength(2)
    for (const [, json] of writes.filter(([k]) => k === 'tabGroups')) {
      expect(JSON.parse(json).groups).toHaveLength(1)
    }
  })
})
