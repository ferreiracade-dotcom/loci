import { beforeEach, describe, expect, it, vi } from 'vitest'

// The store talks to the preload bridge; every call resolves to nothing here.
vi.mock('../lib/api', () => ({
  api: new Proxy({}, { get: () => () => Promise.resolve(null) })
}))
vi.mock('../lib/pdfIndex', () => ({ extractAndIndexBook: () => Promise.resolve() }))
vi.mock('../lib/theme', () => ({ applyTheme: () => undefined }))

const { useStore, newTabDrafts } = await import('./useStore')
const { openInNewTab } = await import('../components/chrome/openViews')
const { EMPTY_WORKSPACE, openTab } = await import('./workspace')

/** Reset the strip to one tab with `content` (focused). */
function only(content: Parameters<typeof openTab>[1]): string {
  const { ws, tabId } = openTab(EMPTY_WORKSPACE, content)
  useStore.setState({ tabs: ws.tabs, activeTabId: tabId, splitRatios: {}, closedTabs: [], groups: [] })
  newTabDrafts.clear()
  return tabId
}

const kinds = (): string[] =>
  [...useStore.getState().tabs].sort((a, b) => a.order - b.order).map((t) => t.kind)

describe('empty New Tab reuse rule', () => {
  beforeEach(() => newTabDrafts.clear())

  it('a bookmark opened from an empty New Tab page fills it', () => {
    const id = only({ kind: 'newtab' })
    openInNewTab({ kind: 'pdf', bookId: 'b1' }, false)
    expect(kinds()).toEqual(['pdf'])
    expect(useStore.getState().activeTabId).toBe(id)
  })

  it('a ⋮ view (openPage) from an empty New Tab page fills it', () => {
    only({ kind: 'newtab' })
    useStore.getState().openPage('library')
    expect(kinds()).toEqual(['library'])
  })

  it('opens a new tab when something is typed on the New Tab page', () => {
    const id = only({ kind: 'newtab' })
    newTabDrafts.set(id, 'rom')
    openInNewTab({ kind: 'pdf', bookId: 'b1' }, false)
    expect(kinds()).toEqual(['newtab', 'pdf'])
  })

  it('opens a new tab when the New Tab page has history', () => {
    const id = only({ kind: 'pdf', bookId: 'b0' })
    useStore.getState().resetTabToNewTab(id)
    useStore.getState().openPage('notes')
    expect(kinds()).toEqual(['newtab', 'notes'])
  })

  it('opens a new tab from any other page', () => {
    only({ kind: 'library' })
    openInNewTab({ kind: 'pdf', bookId: 'b1' }, false)
    useStore.getState().openPage('notes')
    expect(kinds()).toEqual(['library', 'pdf', 'notes'])
  })

  it('a background open never fills the page', () => {
    only({ kind: 'newtab' })
    openInNewTab({ kind: 'pdf', bookId: 'b1' }, true)
    expect(kinds()).toEqual(['newtab', 'pdf'])
  })
})
