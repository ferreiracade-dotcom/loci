import { describe, expect, it } from 'vitest'
import {
  EMPTY_WORKSPACE,
  MAX_HISTORY,
  canGoBack,
  canGoForward,
  goHistory,
  goToHistoryIndex,
  tabHistory,
  closeOtherTabs,
  closeTab,
  closeTabsToRight,
  contentKey,
  cycleTab,
  duplicateTab,
  findProjectTab,
  focusTab,
  migrateLegacyWorkspace,
  openTab,
  parsePersistedWorkspace,
  reflectWorkspace,
  reopenClosedTab,
  reorderTab,
  sanitizeWorkspace,
  selectTabByNumber,
  serializeWorkspace,
  setPinned,
  setSplitRatio,
  setTabContent,
  sortedTabs,
  splitPartner,
  splitTabs,
  stripUnits,
  tabContent,
  unsplitTab,
  validateRestoredTabs
} from './workspace'
import type { Tab, TabContent, Workspace } from './workspace'
import type { NoteSummary } from '@shared/ipc'

const pdf = (bookId: string): TabContent => ({ kind: 'pdf', bookId })

/** Build a workspace of PDF tabs b1..bn, returning it and the ids in strip order. */
function strip(n: number): { ws: Workspace; ids: string[] } {
  let ws: Workspace = EMPTY_WORKSPACE
  const ids: string[] = []
  for (let i = 1; i <= n; i++) {
    const r = openTab(ws, pdf(`b${i}`), { after: null })
    ws = r.ws
    ids.push(r.tabId)
  }
  return { ws, ids }
}

const order = (ws: Workspace): string[] => sortedTabs(ws.tabs).map((t) => t.bookId ?? t.kind)

describe('openTab', () => {
  it('opens the first tab and focuses it', () => {
    const { ws, tabId } = openTab(EMPTY_WORKSPACE, pdf('b1'))
    expect(ws.tabs).toHaveLength(1)
    expect(ws.tabs[0]).toMatchObject({ id: tabId, kind: 'pdf', order: 0 })
    expect(ws.activeTabId).toBe(tabId)
  })

  it('appends at the end by default with after: null, and allows duplicates', () => {
    const { ws } = strip(2)
    const r = openTab(ws, pdf('b1'), { after: null })
    expect(order(r.ws)).toEqual(['b1', 'b2', 'b1'])
    expect(r.ws.activeTabId).toBe(r.tabId)
  })

  it('places a tab right after another, and after a whole split pair', () => {
    const { ws, ids } = strip(3)
    expect(order(openTab(ws, pdf('x'), { after: ids[0] }).ws)).toEqual(['b1', 'x', 'b2', 'b3'])
    const split = splitTabs(ws, ids[0], ids[1])
    expect(order(openTab(split, pdf('x'), { after: ids[0] }).ws)).toEqual(['b1', 'b2', 'x', 'b3'])
  })

  it('does not focus the new tab when activate is false', () => {
    const { ws, ids } = strip(1)
    const r = openTab(ws, pdf('b2'), { activate: false })
    expect(r.ws.activeTabId).toBe(ids[0])
  })

  it('never opens a tab inside the pinned region', () => {
    const { ws, ids } = strip(2)
    const pinned = setPinned(ws, ids[1], true)
    expect(order(openTab(pinned, pdf('x'), { after: ids[1] }).ws)).toEqual(['b2', 'x', 'b1'])
  })
})

describe('closeTab', () => {
  it('focuses the tab to the right, else the one to the left, and remembers the closed tab', () => {
    const { ws, ids } = strip(3)
    let w = focusTab(ws, ids[1])
    w = closeTab(w, ids[1])
    expect(w.activeTabId).toBe(ids[2])
    expect(w.closed.map((c) => c.tab.bookId)).toEqual(['b2'])
    w = closeTab(w, ids[2])
    expect(w.activeTabId).toBe(ids[0])
    expect(sortedTabs(w.tabs).map((t) => t.order)).toEqual([0])
  })

  it('leaves the split partner as a normal, focused tab', () => {
    const { ws, ids } = strip(3)
    const split = splitTabs(ws, ids[0], ids[1])
    const splitId = split.tabs.find((t) => t.id === ids[0])!.splitId!
    const ratio = setSplitRatio(split, splitId, 0.3)
    const w = closeTab(focusTab(ratio, ids[1]), ids[1])
    expect(w.activeTabId).toBe(ids[0])
    expect(w.tabs.find((t) => t.id === ids[0])?.splitId).toBeUndefined()
    expect(w.splitRatios).toEqual({})
  })

  it('caps the closed-tab stack', () => {
    let { ws } = strip(30)
    for (const t of [...ws.tabs]) ws = closeTab(ws, t.id)
    expect(ws.closed.length).toBe(25)
    expect(ws.tabs).toHaveLength(0)
  })
})

describe('closeOtherTabs / closeTabsToRight', () => {
  it('closes all other unpinned tabs, keeping pinned ones and the split partner', () => {
    const { ws, ids } = strip(5)
    let w = setPinned(ws, ids[4], true)
    w = splitTabs(w, ids[1], ids[2])
    w = closeOtherTabs(w, ids[1])
    expect(order(w)).toEqual(['b5', 'b2', 'b3'])
    expect(w.activeTabId).toBe(ids[1])
    expect(w.closed.map((c) => c.tab.bookId)).toEqual(['b1', 'b4'])
  })

  it('closes the tabs to the right of a tab (after its split pair)', () => {
    const { ws, ids } = strip(4)
    const split = splitTabs(ws, ids[0], ids[1])
    const w = closeTabsToRight(split, ids[0])
    expect(order(w)).toEqual(['b1', 'b2'])
    expect(w.activeTabId).toBe(ids[0])
  })
})

describe('reopenClosedTab', () => {
  it('restores the most recently closed tab at its old position and focuses it', () => {
    const { ws, ids } = strip(3)
    const closed = closeTab(ws, ids[1])
    const { ws: back, tabId } = reopenClosedTab(closed)
    expect(order(back)).toEqual(['b1', 'b2', 'b3'])
    expect(back.activeTabId).toBe(tabId)
    expect(back.closed).toHaveLength(0)
  })

  it('is a no-op with nothing closed', () => {
    const { ws } = strip(1)
    expect(reopenClosedTab(ws)).toEqual({ ws, tabId: null })
  })

  it('restores a closed split half as a normal tab', () => {
    const { ws, ids } = strip(2)
    const w = closeTab(splitTabs(ws, ids[0], ids[1]), ids[1])
    const { ws: back } = reopenClosedTab(w)
    expect(back.tabs.every((t) => !t.splitId)).toBe(true)
  })
})

describe('reorderTab', () => {
  it('moves a tab to a new position', () => {
    const { ws, ids } = strip(4)
    expect(order(reorderTab(ws, ids[0], 2))).toEqual(['b2', 'b3', 'b1', 'b4'])
    expect(order(reorderTab(ws, ids[3], 0))).toEqual(['b4', 'b1', 'b2', 'b3'])
  })

  it('moves a split pair as one unit and never drops into another pair', () => {
    const { ws, ids } = strip(5)
    let w = splitTabs(ws, ids[0], ids[1])
    w = splitTabs(w, ids[3], ids[4])
    // b1|b2 to between b4 and b5 (index 2 of [b3, b4, b5]) lands after the b4|b5 pair.
    expect(order(reorderTab(w, ids[0], 2))).toEqual(['b3', 'b4', 'b5', 'b1', 'b2'])
  })

  it('keeps pinned tabs in the pinned region and others out of it', () => {
    const { ws, ids } = strip(3)
    const w = setPinned(ws, ids[2], true) // [b3*, b1, b2]
    expect(order(reorderTab(w, ids[1], 0))).toEqual(['b3', 'b2', 'b1'])
    expect(order(reorderTab(w, ids[2], 3))).toEqual(['b3', 'b1', 'b2'])
  })
})

describe('setPinned', () => {
  it('moves a pinned tab to the end of the pinned region, and an unpinned one just after it', () => {
    const { ws, ids } = strip(3)
    let w = setPinned(ws, ids[2], true)
    expect(order(w)).toEqual(['b3', 'b1', 'b2'])
    w = setPinned(w, ids[1], true)
    expect(order(w)).toEqual(['b3', 'b2', 'b1'])
    w = setPinned(w, ids[2], false)
    expect(order(w)).toEqual(['b2', 'b3', 'b1'])
    expect(w.tabs.find((t) => t.id === ids[2])?.pinned).toBeUndefined()
  })

  it('takes a pinned tab out of its split', () => {
    const { ws, ids } = strip(2)
    const w = setPinned(splitTabs(ws, ids[0], ids[1]), ids[1], true)
    expect(w.tabs.every((t) => !t.splitId)).toBe(true)
  })
})

describe('split view', () => {
  it('joins two tabs: the second moves right after the first and the first keeps focus', () => {
    const { ws, ids } = strip(3)
    const w = splitTabs(ws, ids[0], ids[2])
    expect(order(w)).toEqual(['b1', 'b3', 'b2'])
    expect(splitPartner(w.tabs, ids[0])?.id).toBe(ids[2])
    expect(w.activeTabId).toBe(ids[0])
    expect(stripUnits(w.tabs).map((u) => u.length)).toEqual([2, 1])
  })

  it('allows at most two tabs per split: re-splitting breaks the old pair', () => {
    const { ws, ids } = strip(3)
    let w = splitTabs(ws, ids[0], ids[1])
    w = splitTabs(w, ids[0], ids[2])
    expect(splitPartner(w.tabs, ids[0])?.id).toBe(ids[2])
    expect(w.tabs.find((t) => t.id === ids[1])?.splitId).toBeUndefined()
    const counts = new Map<string, number>()
    for (const t of w.tabs) if (t.splitId) counts.set(t.splitId, (counts.get(t.splitId) ?? 0) + 1)
    expect([...counts.values()]).toEqual([2])
  })

  it('unsplits both halves and clamps the ratio', () => {
    const { ws, ids } = strip(2)
    let w = splitTabs(ws, ids[0], ids[1])
    const splitId = w.tabs[0].splitId!
    w = setSplitRatio(w, splitId, 0.95)
    expect(w.splitRatios[splitId]).toBe(0.8)
    w = unsplitTab(w, ids[1])
    expect(w.tabs.every((t) => !t.splitId)).toBe(true)
    expect(w.splitRatios).toEqual({})
  })
})

describe('duplicateTab / setTabContent / focus helpers', () => {
  it('duplicates a tab right after it, outside any split, and focuses the copy', () => {
    const { ws, ids } = strip(3)
    const split = splitTabs(ws, ids[0], ids[1])
    const { ws: w, tabId } = duplicateTab(split, ids[0])
    expect(order(w)).toEqual(['b1', 'b2', 'b1', 'b3'])
    expect(w.tabs.find((t) => t.id === tabId)?.splitId).toBeUndefined()
    expect(w.activeTabId).toBe(tabId)
  })

  it('replaces content in place, keeping id, order, pin and split', () => {
    const { ws, ids } = strip(2)
    let w = splitTabs(ws, ids[0], ids[1])
    const splitId = w.tabs[0].splitId
    w = setTabContent(w, ids[1], { kind: 'note', notePath: 'n.md' })
    const t = w.tabs.find((x) => x.id === ids[1])!
    expect(t).toMatchObject({ kind: 'note', notePath: 'n.md', order: 1, splitId })
    expect(t.bookId).toBeUndefined()
  })

  it('cycles with wraparound and selects by number (9 = last)', () => {
    const { ws, ids } = strip(3)
    expect(cycleTab(ws, 1).activeTabId).toBe(ids[0])
    expect(cycleTab(ws, -1).activeTabId).toBe(ids[1])
    expect(selectTabByNumber(ws, 1).activeTabId).toBe(ids[0])
    expect(selectTabByNumber(ws, 8).activeTabId).toBe(ids[2])
    expect(selectTabByNumber(focusTab(ws, ids[0]), 9).activeTabId).toBe(ids[2])
  })
})

describe('reflectWorkspace and findProjectTab', () => {
  const notes: Pick<NoteSummary, 'path' | 'type'>[] = [
    { path: 'proj.md', type: 'project' },
    { path: 'plain.md', type: 'note' }
  ]

  it('finds the note tab whose note is a project', () => {
    let ws: Workspace = EMPTY_WORKSPACE
    ;({ ws } = openTab(ws, { kind: 'note', notePath: 'plain.md' }))
    ;({ ws } = openTab(ws, { kind: 'note', notePath: 'proj.md' }))
    expect(findProjectTab(ws.tabs, notes)?.notePath).toBe('proj.md')
    expect(findProjectTab(ws.tabs.filter((t) => t.notePath !== 'proj.md'), notes)).toBeNull()
  })

  it('derives legacy fields from the focused tab', () => {
    const { ws } = openTab(EMPTY_WORKSPACE, { kind: 'bible', book: 'JHN', chapter: 3, highlight: [16], translation: 'BSB' })
    const reflected = reflectWorkspace(ws)
    expect(reflected.scripturePassage).toEqual({ book: 'JHN', chapter: 3, highlight: [16] })
    expect(reflected.scriptureTranslation).toBe('BSB')
    expect(reflected.openBookId).toBeNull()
  })

  it('prefers the focused split half, then its partner, over other tabs', () => {
    let ws: Workspace = EMPTY_WORKSPACE
    let other: string, a: string, b: string
    ;({ ws, tabId: other } = openTab(ws, { kind: 'bible', book: 'GEN', chapter: 1 }))
    ;({ ws, tabId: a } = openTab(ws, pdf('b1')))
    ;({ ws, tabId: b } = openTab(ws, { kind: 'bible', book: 'ROM', chapter: 3 }))
    ws = splitTabs(ws, a, b)
    void other
    const r = reflectWorkspace(ws)
    expect(r.openBookId).toBe('b1')
    expect(r.scripturePassage?.book).toBe('ROM')
  })
})

describe('tabContent / contentKey', () => {
  it('extracts the content fields, dropping id/order/pin/split', () => {
    const base = { id: 't1', order: 0, pinned: true, splitId: 's' }
    expect(tabContent({ ...base, kind: 'note', notePath: 'a.md' })).toEqual({ kind: 'note', notePath: 'a.md' })
    expect(tabContent({ ...base, kind: 'pdf', bookId: 'b1' })).toEqual({ kind: 'pdf', bookId: 'b1' })
    const group = { type: 'author', author: 'Calvin' } as const
    expect(tabContent({ ...base, kind: 'quotes', quotesGroup: group })).toEqual({ kind: 'quotes', quotesGroup: group })
    expect(tabContent({ ...base, kind: 'settings' })).toEqual({ kind: 'settings' })
  })

  it('treats highlights as the same location and chapters as different', () => {
    const a = contentKey({ kind: 'bible', book: 'JHN', chapter: 3, highlight: [16] })
    const b = contentKey({ kind: 'bible', book: 'JHN', chapter: 3, highlight: [] })
    const c = contentKey({ kind: 'bible', book: 'JHN', chapter: 4 })
    expect(a).toBe(b)
    expect(a).not.toBe(c)
  })
})

describe('restore: validate, sanitize, round trip, legacy migration', () => {
  it('drops tabs whose book/note no longer exists, keeps everything else', () => {
    const tabs: Tab[] = [
      { id: '1', order: 0, kind: 'pdf', bookId: 'gone' },
      { id: '2', order: 1, kind: 'pdf', bookId: 'here' },
      { id: '3', order: 2, kind: 'note', notePath: 'missing.md' },
      { id: '4', order: 3, kind: 'bible', book: 'JHN', chapter: 1 }
    ]
    expect(validateRestoredTabs(tabs, [{ id: 'here' }], []).map((t) => t.id)).toEqual(['2', '4'])
  })

  it('repairs dangling focus, orphaned split halves and unknown kinds', () => {
    const ws = sanitizeWorkspace({
      tabs: [
        { id: 'a', order: 5, kind: 'pdf', bookId: 'b1', splitId: 's1' },
        { id: 'b', order: 9, kind: 'bogus' as 'pdf' },
        { id: 'c', order: 7, kind: 'library', pinned: true }
      ],
      activeTabId: 'gone',
      splitRatios: { s1: 0.4 }
    })
    expect(ws.tabs.map((t) => [t.id, t.order])).toEqual([
      ['c', 0],
      ['a', 1]
    ])
    expect(ws.tabs[1].splitId).toBeUndefined()
    expect(ws.splitRatios).toEqual({})
    expect(ws.activeTabId).toBe('c')
  })

  it('round-trips tabs, pins, splits, ratios, focus and closed tabs', () => {
    const { ws, ids } = strip(4)
    let w = setPinned(ws, ids[3], true)
    w = splitTabs(w, ids[0], ids[1])
    const splitId = w.tabs.find((t) => t.id === ids[0])!.splitId!
    w = setSplitRatio(w, splitId, 0.35)
    w = closeTab(w, ids[2])
    w = focusTab(w, ids[1])
    const back = parsePersistedWorkspace(serializeWorkspace(w))
    expect(back).toEqual(sanitizeWorkspace(w))
    expect(back.splitRatios[splitId]).toBe(0.35)
    expect(back.activeTabId).toBe(ids[1])
    expect(back.closed).toHaveLength(1)
  })

  it('returns an empty workspace for missing or malformed data', () => {
    expect(parsePersistedWorkspace(null)).toEqual(EMPTY_WORKSPACE)
    expect(parsePersistedWorkspace('{not json')).toEqual(EMPTY_WORKSPACE)
  })

  it('migrates two panes: left tabs first, active tabs joined into a split, ratio kept', () => {
    const legacy = {
      tabs: [
        { id: 'r1', paneId: 'R', order: 0, kind: 'note', notePath: 'n.md' },
        { id: 'l2', paneId: 'L', order: 1, kind: 'bible', book: 'JHN', chapter: 3 },
        { id: 'l1', paneId: 'L', order: 0, kind: 'pdf', bookId: 'b1' },
        { id: 'r2', paneId: 'R', order: 1, kind: 'picker' }
      ],
      paneOrder: [
        { id: 'L', activeTabId: 'l1' },
        { id: 'R', activeTabId: 'r2' }
      ],
      activePaneId: 'R',
      paneRatio: 0.6
    }
    const ws = parsePersistedWorkspace(JSON.stringify(legacy))
    // l1 and r2 become a split; r2 is pulled next to l1.
    expect(sortedTabs(ws.tabs).map((t) => t.id)).toEqual(['l1', 'r2', 'l2', 'r1'])
    expect(ws.tabs.find((t) => t.id === 'r2')?.kind).toBe('newtab')
    expect(splitPartner(ws.tabs, 'l1')?.id).toBe('r2')
    expect(ws.activeTabId).toBe('r2')
    expect(Object.values(ws.splitRatios)).toEqual([0.6])
    expect(ws.tabs.some((t) => 'paneId' in t)).toBe(false)
  })

  it('migrates a single pane without making a split', () => {
    const ws = migrateLegacyWorkspace({
      tabs: [
        { id: 'a', paneId: 'L', order: 0, kind: 'pdf', bookId: 'b1' },
        { id: 'b', paneId: 'L', order: 1, kind: 'boc', documentCode: 'AC', sectionOrdinal: 4 }
      ],
      paneOrder: [{ id: 'L', activeTabId: 'b' }],
      activePaneId: 'L'
    })
    expect(sortedTabs(ws.tabs).map((t) => t.id)).toEqual(['a', 'b'])
    expect(ws.tabs.every((t) => !t.splitId)).toBe(true)
    expect(ws.activeTabId).toBe('b')
  })
})

describe('per-tab back/forward history', () => {
  const bible = (book: string, chapter: number, highlight?: number[]): TabContent => ({
    kind: 'bible',
    book,
    chapter,
    highlight,
    translation: 'BSB'
  })

  it('a new tab starts with its location as the only entry', () => {
    const { ws, tabId } = openTab(EMPTY_WORKSPACE, pdf('b1'))
    const tab = ws.tabs.find((t) => t.id === tabId)!
    expect(tabHistory(tab)).toEqual({ entries: [pdf('b1')], index: 0 })
    expect(canGoBack(tab)).toBe(false)
    expect(canGoForward(tab)).toBe(false)
  })

  it('navigating pushes, Back and Forward restore in the same tab', () => {
    let { ws, tabId } = openTab(EMPTY_WORKSPACE, bible('JHN', 3))
    ws = setTabContent(ws, tabId, bible('ROM', 3))
    ws = setTabContent(ws, tabId, bible('ROM', 4))
    let tab = ws.tabs[0]
    expect(tabHistory(tab).entries.map((e) => (e as { chapter: number }).chapter)).toEqual([3, 3, 4])
    expect(tabHistory(tab).index).toBe(2)

    ws = goHistory(ws, tabId, -1)
    tab = ws.tabs[0]
    expect(tab.book).toBe('ROM')
    expect(tab.chapter).toBe(3)
    expect(tab.id).toBe(tabId)
    expect(canGoBack(tab)).toBe(true)
    expect(canGoForward(tab)).toBe(true)

    ws = goHistory(ws, tabId, -1)
    expect(ws.tabs[0].book).toBe('JHN')
    expect(canGoBack(ws.tabs[0])).toBe(false)
    // Back at the start is a no-op.
    expect(goHistory(ws, tabId, -1)).toBe(ws)

    ws = goHistory(ws, tabId, 1)
    ws = goHistory(ws, tabId, 1)
    expect(ws.tabs[0].chapter).toBe(4)
    expect(goHistory(ws, tabId, 1)).toBe(ws)
  })

  it('navigating after Back drops the forward entries', () => {
    let { ws, tabId } = openTab(EMPTY_WORKSPACE, bible('JHN', 1))
    ws = setTabContent(ws, tabId, bible('JHN', 2))
    ws = setTabContent(ws, tabId, bible('JHN', 3))
    ws = goHistory(ws, tabId, -2)
    ws = setTabContent(ws, tabId, pdf('b1'))
    const h = tabHistory(ws.tabs[0])
    expect(h.entries).toEqual([bible('JHN', 1), pdf('b1')])
    expect(h.index).toBe(1)
    expect(canGoForward(ws.tabs[0])).toBe(false)
  })

  it('a change that keeps the location (highlighted verses) replaces the entry', () => {
    let { ws, tabId } = openTab(EMPTY_WORKSPACE, bible('JHN', 3))
    ws = setTabContent(ws, tabId, bible('JHN', 3, [16]))
    const h = tabHistory(ws.tabs[0])
    expect(h.entries).toEqual([bible('JHN', 3, [16])])
    expect(h.index).toBe(0)
  })

  it('goToHistoryIndex jumps to any entry and ignores out-of-range indexes', () => {
    let { ws, tabId } = openTab(EMPTY_WORKSPACE, { kind: 'newtab' })
    ws = setTabContent(ws, tabId, pdf('b1'))
    ws = setTabContent(ws, tabId, pdf('b2'))
    ws = goToHistoryIndex(ws, tabId, 0)
    expect(ws.tabs[0].kind).toBe('newtab')
    expect(ws.tabs[0].bookId).toBeUndefined()
    expect(tabHistory(ws.tabs[0]).entries).toHaveLength(3)
    expect(goToHistoryIndex(ws, tabId, 7)).toBe(ws)
    expect(goToHistoryIndex(ws, tabId, -1)).toBe(ws)
  })

  it('keeps pin and split when going back', () => {
    let { ws, tabId: a } = openTab(EMPTY_WORKSPACE, pdf('b1'))
    const opened = openTab(ws, pdf('b2'))
    ws = splitTabs(opened.ws, a, opened.tabId)
    ws = setTabContent(ws, a, bible('JHN', 3))
    ws = goHistory(ws, a, -1)
    const tab = ws.tabs.find((t) => t.id === a)!
    expect(tab.kind).toBe('pdf')
    expect(tab.splitId).toBeDefined()
  })

  it('caps history at MAX_HISTORY entries, dropping the oldest', () => {
    let { ws, tabId } = openTab(EMPTY_WORKSPACE, bible('PSA', 1))
    for (let c = 2; c <= MAX_HISTORY + 10; c++) ws = setTabContent(ws, tabId, bible('PSA', c))
    const h = tabHistory(ws.tabs[0])
    expect(h.entries).toHaveLength(MAX_HISTORY)
    expect(h.index).toBe(MAX_HISTORY - 1)
    expect((h.entries[0] as { chapter: number }).chapter).toBe(11)
  })

  it('duplicate and reopen keep the history', () => {
    let { ws, tabId } = openTab(EMPTY_WORKSPACE, pdf('b1'))
    ws = setTabContent(ws, tabId, pdf('b2'))
    const dup = duplicateTab(ws, tabId)
    expect(canGoBack(dup.ws.tabs.find((t) => t.id === dup.tabId))).toBe(true)
    const extra = openTab(ws, pdf('b3')).ws
    const reopened = reopenClosedTab(closeTab(extra, tabId))
    const tab = reopened.ws.tabs.find((t) => t.id === reopened.tabId)!
    expect(tabHistory(tab).entries).toEqual([pdf('b1'), pdf('b2')])
  })

  it('migrates tabs without history and survives a persistence round trip', () => {
    const legacy: Tab = { id: 't1', order: 0, kind: 'pdf', bookId: 'b1' }
    const ws = sanitizeWorkspace({ tabs: [legacy], activeTabId: 't1' })
    expect(ws.tabs[0].history).toEqual([pdf('b1')])
    expect(ws.tabs[0].historyIndex).toBe(0)

    let w = openTab(EMPTY_WORKSPACE, pdf('b1'))
    w = { ws: setTabContent(w.ws, w.tabId, pdf('b2')), tabId: w.tabId }
    const back = goHistory(w.ws, w.tabId, -1)
    const restored = parsePersistedWorkspace(serializeWorkspace(back))
    expect(tabHistory(restored.tabs[0])).toEqual({ entries: [pdf('b1'), pdf('b2')], index: 0 })
  })

  it('repairs a history whose current entry does not match the tab', () => {
    const t: Tab = { id: 't', order: 0, kind: 'pdf', bookId: 'b3', history: [pdf('b1'), pdf('b2')], historyIndex: 5 }
    expect(tabHistory(t)).toEqual({ entries: [pdf('b1'), pdf('b2'), pdf('b3')], index: 2 })
  })
})
