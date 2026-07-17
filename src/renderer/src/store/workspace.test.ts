import { describe, expect, it } from 'vitest'
import {
  EMPTY_WORKSPACE,
  activeTab,
  closeTab,
  findProjectTab,
  focusPane,
  focusTab,
  moveTab,
  openTab,
  otherPaneId,
  reflectWorkspace,
  reorderTab,
  sanitizeWorkspace,
  setTabContent,
  tabsForPane,
  validateRestoredTabs
} from './workspace'
import type { Tab, Workspace } from './workspace'
import type { NoteSummary } from '@shared/ipc'

describe('openTab', () => {
  it('creates the first pane and tab from an empty workspace', () => {
    const { ws, tabId } = openTab(EMPTY_WORKSPACE, { kind: 'pdf', bookId: 'b1' })
    expect(ws.paneOrder).toHaveLength(1)
    expect(ws.tabs).toHaveLength(1)
    expect(ws.tabs[0].id).toBe(tabId)
    expect(ws.tabs[0].kind).toBe('pdf')
    expect(ws.activePaneId).toBe(ws.paneOrder[0].id)
    expect(ws.paneOrder[0].activeTabId).toBe(tabId)
  })

  it('appends a new tab after the current one in the same pane by default, and allows duplicates', () => {
    let ws: Workspace = EMPTY_WORKSPACE
    ;({ ws } = openTab(ws, { kind: 'pdf', bookId: 'b1' }))
    const second = openTab(ws, { kind: 'pdf', bookId: 'b1' })
    ws = second.ws
    expect(ws.paneOrder).toHaveLength(1)
    expect(tabsForPane(ws.tabs, ws.paneOrder[0].id)).toHaveLength(2)
    expect(ws.paneOrder[0].activeTabId).toBe(second.tabId)
  })

  it('creates a second pane when opened into an explicit new paneId', () => {
    const { ws } = openTab(EMPTY_WORKSPACE, { kind: 'pdf', bookId: 'b1' })
    const { ws: ws2 } = openTab(ws, { kind: 'note', notePath: 'n1' }, { paneId: 'pane-2' })
    expect(ws2.paneOrder.map((p) => p.id)).toEqual([ws.paneOrder[0].id, 'pane-2'])
    expect(ws2.activePaneId).toBe('pane-2')
  })

  it('does not activate the new tab when activate is false', () => {
    const { ws } = openTab(EMPTY_WORKSPACE, { kind: 'pdf', bookId: 'b1' })
    const paneId = ws.paneOrder[0].id
    const { ws: ws2 } = openTab(ws, { kind: 'pdf', bookId: 'b2' }, { paneId, activate: false })
    expect(ws2.paneOrder[0].activeTabId).toBe(ws.paneOrder[0].activeTabId)
  })
})

describe('moveTab and collapse-on-empty', () => {
  it('moves a tab to a new pane and collapses the source pane once it has no tabs left', () => {
    const { ws } = openTab(EMPTY_WORKSPACE, { kind: 'pdf', bookId: 'b1' })
    const paneId = ws.paneOrder[0].id
    const tabId = ws.tabs[0].id
    const moved = moveTab(ws, tabId, 'pane-2')
    expect(moved.paneOrder.map((p) => p.id)).toEqual(['pane-2'])
    expect(moved.tabs[0].paneId).toBe('pane-2')
    expect(moved.activePaneId).toBe('pane-2')
    expect(otherPaneId(moved, 'pane-2')).toBeNull()
    void paneId
  })

  it('leaves the source pane intact when it still has other tabs', () => {
    let ws: Workspace = EMPTY_WORKSPACE
    ;({ ws } = openTab(ws, { kind: 'pdf', bookId: 'b1' }))
    const paneId = ws.paneOrder[0].id
    ;({ ws } = openTab(ws, { kind: 'pdf', bookId: 'b2' }, { paneId }))
    const firstTabId = tabsForPane(ws.tabs, paneId)[0].id
    const moved = moveTab(ws, firstTabId, 'pane-2')
    expect(moved.paneOrder.map((p) => p.id)).toEqual([paneId, 'pane-2'])
    expect(tabsForPane(moved.tabs, paneId)).toHaveLength(1)
  })

  it('refuses to create a third pane', () => {
    let ws: Workspace = EMPTY_WORKSPACE
    ;({ ws } = openTab(ws, { kind: 'pdf', bookId: 'b1' }))
    ;({ ws } = openTab(ws, { kind: 'pdf', bookId: 'b2' }, { paneId: 'pane-2' }))
    const tabId = ws.tabs[0].id
    const attempted = moveTab(ws, tabId, 'pane-3')
    expect(attempted).toBe(ws) // unchanged
  })

  it('repoints the source pane\'s active tab when the moved tab was the one active there', () => {
    let ws: Workspace = EMPTY_WORKSPACE
    ;({ ws } = openTab(ws, { kind: 'pdf', bookId: 'a' }))
    const paneId = ws.paneOrder[0].id
    ;({ ws } = openTab(ws, { kind: 'pdf', bookId: 'b' }, { paneId })) // b becomes active
    const [tabA, tabB] = tabsForPane(ws.tabs, paneId)
    const moved = moveTab(ws, tabB.id, 'pane-2')
    expect(moved.paneOrder.find((p) => p.id === paneId)?.activeTabId).toBe(tabA.id)
    const stillThere = activeTab(moved, paneId)
    expect(stillThere?.id).toBe(tabA.id)
  })
})

describe('closeTab', () => {
  it('activates the next tab to the right after closing the active one', () => {
    let ws: Workspace = EMPTY_WORKSPACE
    ;({ ws } = openTab(ws, { kind: 'pdf', bookId: 'a' }))
    const paneId = ws.paneOrder[0].id
    ;({ ws } = openTab(ws, { kind: 'pdf', bookId: 'b' }, { paneId }))
    ;({ ws } = openTab(ws, { kind: 'pdf', bookId: 'c' }, { paneId }))
    const [t1, t2, t3] = tabsForPane(ws.tabs, paneId)
    const afterClose = closeTab(ws, t2.id)
    expect(afterClose.paneOrder[0].activeTabId).toBe(t3.id)
    void t1
  })

  it('falls back to the last tab when the closed active tab was rightmost', () => {
    let ws: Workspace = EMPTY_WORKSPACE
    ;({ ws } = openTab(ws, { kind: 'pdf', bookId: 'a' }))
    const paneId = ws.paneOrder[0].id
    ;({ ws } = openTab(ws, { kind: 'pdf', bookId: 'b' }, { paneId }))
    const [t1, t2] = tabsForPane(ws.tabs, paneId)
    const afterClose = closeTab(ws, t2.id)
    expect(afterClose.paneOrder[0].activeTabId).toBe(t1.id)
  })

  it('collapses a pane down to single-pane mode when its last tab closes', () => {
    let ws: Workspace = EMPTY_WORKSPACE
    ;({ ws } = openTab(ws, { kind: 'pdf', bookId: 'a' }))
    const firstPaneId = ws.paneOrder[0].id
    ;({ ws } = openTab(ws, { kind: 'note', notePath: 'n1' }, { paneId: 'pane-2' }))
    const secondTabId = tabsForPane(ws.tabs, 'pane-2')[0].id
    const afterClose = closeTab(ws, secondTabId)
    expect(afterClose.paneOrder.map((p) => p.id)).toEqual([firstPaneId])
    expect(afterClose.activePaneId).toBe(firstPaneId)
  })
})

describe('reorderTab', () => {
  it('reorders tabs within their pane', () => {
    let ws: Workspace = EMPTY_WORKSPACE
    ;({ ws } = openTab(ws, { kind: 'pdf', bookId: 'a' }))
    const paneId = ws.paneOrder[0].id
    ;({ ws } = openTab(ws, { kind: 'pdf', bookId: 'b' }, { paneId }))
    ;({ ws } = openTab(ws, { kind: 'pdf', bookId: 'c' }, { paneId }))
    const [t1, , t3] = tabsForPane(ws.tabs, paneId)
    const reordered = reorderTab(ws, t3.id, 0)
    expect(tabsForPane(reordered.tabs, paneId).map((t) => t.bookId)).toEqual(['c', 'a', 'b'])
    void t1
  })
})

describe('setTabContent, focusTab, focusPane', () => {
  it('replaces a tab\'s content in place, keeping its id/paneId/order', () => {
    const { ws, tabId } = openTab(EMPTY_WORKSPACE, { kind: 'picker' })
    const filled = setTabContent(ws, tabId, { kind: 'note', notePath: 'n1' })
    expect(filled.tabs[0]).toMatchObject({ id: tabId, kind: 'note', notePath: 'n1' })
    expect(filled.tabs[0].bookId).toBeUndefined()
  })

  it('focusTab activates the tab and its pane; focusPane only changes activePaneId', () => {
    let ws: Workspace = EMPTY_WORKSPACE
    ;({ ws } = openTab(ws, { kind: 'pdf', bookId: 'a' }))
    const paneId = ws.paneOrder[0].id
    ;({ ws } = openTab(ws, { kind: 'note', notePath: 'n1' }, { paneId: 'pane-2' }))
    const firstTabId = tabsForPane(ws.tabs, paneId)[0].id
    const focused = focusTab(ws, firstTabId)
    expect(focused.activePaneId).toBe(paneId)
    expect(focused.paneOrder.find((p) => p.id === paneId)?.activeTabId).toBe(firstTabId)
    const stillFocused = focusPane(focused, 'pane-2')
    expect(stillFocused.activePaneId).toBe('pane-2')
    expect(stillFocused.paneOrder.find((p) => p.id === paneId)?.activeTabId).toBe(firstTabId)
  })
})

describe('findProjectTab and reflectWorkspace', () => {
  const notes: Pick<NoteSummary, 'path' | 'type'>[] = [
    { path: 'proj.md', type: 'project' },
    { path: 'plain.md', type: 'note' }
  ]

  it('finds the note tab whose note is a project', () => {
    let ws: Workspace = EMPTY_WORKSPACE
    ;({ ws } = openTab(ws, { kind: 'note', notePath: 'plain.md' }))
    ;({ ws } = openTab(ws, { kind: 'note', notePath: 'proj.md' }, { paneId: 'pane-2' }))
    const found = findProjectTab(ws.tabs, notes)
    expect(found?.notePath).toBe('proj.md')
    expect(findProjectTab(ws.tabs.filter((t) => t.notePath !== 'proj.md'), notes)).toBeNull()
  })

  it('derives legacy fields from the active tab, falling back to any matching tab', () => {
    let ws: Workspace = EMPTY_WORKSPACE
    ;({ ws } = openTab(ws, { kind: 'bible', book: 'JHN', chapter: 3, highlight: [16], translation: 'BSB' }))
    const reflected = reflectWorkspace(ws)
    expect(reflected.scripturePassage).toEqual({ book: 'JHN', chapter: 3, highlight: [16] })
    expect(reflected.scriptureTranslation).toBe('BSB')
    expect(reflected.openBookId).toBeNull()
  })
})

describe('validateRestoredTabs and sanitizeWorkspace', () => {
  it('drops tabs whose book/note no longer exists, keeps everything else', () => {
    const tabs: Tab[] = [
      { id: '1', paneId: 'p1', order: 0, kind: 'pdf', bookId: 'gone' },
      { id: '2', paneId: 'p1', order: 1, kind: 'pdf', bookId: 'here' },
      { id: '3', paneId: 'p1', order: 2, kind: 'note', notePath: 'missing.md' },
      { id: '4', paneId: 'p1', order: 3, kind: 'bible', book: 'JHN', chapter: 1 }
    ]
    const kept = validateRestoredTabs(tabs, [{ id: 'here' }], [])
    expect(kept.map((t) => t.id)).toEqual(['2', '4'])
  })

  it('drops panes left with no tabs and repairs dangling active ids', () => {
    const ws: Workspace = {
      tabs: [{ id: 't1', paneId: 'p1', order: 0, kind: 'pdf', bookId: 'b1' }],
      paneOrder: [
        { id: 'p1', activeTabId: 'stale-id' },
        { id: 'p2', activeTabId: null }
      ],
      activePaneId: 'p2'
    }
    const sanitized = sanitizeWorkspace(ws)
    expect(sanitized.paneOrder.map((p) => p.id)).toEqual(['p1'])
    expect(sanitized.paneOrder[0].activeTabId).toBe('t1')
    expect(sanitized.activePaneId).toBe('p1')
  })
})
