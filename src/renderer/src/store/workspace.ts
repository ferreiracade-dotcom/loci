import type { NoteSummary } from '@shared/ipc'

export type TabKind = 'note' | 'bible' | 'pdf' | 'quotes' | 'picker' | 'boc'

/** A group of saved quotes opened in the center: a PDF, a Bible chapter, or a commentary source. */
export type QuoteGroupRef =
  | { type: 'book'; bookId: string; title: string }
  // `chapter` omitted = every chapter of this book (the "Bible book" grouping mode).
  | { type: 'scripture'; book: string; chapter?: number; translation: string; name: string }
  | { type: 'commentary'; sourceId: string; displayName: string }
  | { type: 'boc'; documentCode: string; bocSourceId: string; name: string }
  | { type: 'author'; author: string }
  | { type: 'tag'; tag: string }

/** One tab in the center workspace. Only the fields for its `kind` are set. */
export interface Tab {
  id: string
  paneId: string
  order: number
  kind: TabKind
  notePath?: string
  bookId?: string
  book?: string
  chapter?: number
  highlight?: number[]
  translation?: string
  quotesGroup?: QuoteGroupRef
  documentCode?: string
  sectionOrdinal?: number
  bocSourceId?: string
}

/** A pane: which tabs live in it (via `Tab.paneId`) plus which one is active. */
export interface PaneMeta {
  id: string
  activeTabId: string | null
}

/** The whole center workspace: 1-2 panes' worth of tabs. */
export interface Workspace {
  tabs: Tab[]
  paneOrder: PaneMeta[]
  activePaneId: string | null
}

/** Content to place into a tab. `picker` is the blank "choose what to open" tab. */
export type TabContent =
  | { kind: 'note'; notePath: string }
  | { kind: 'pdf'; bookId: string }
  | { kind: 'bible'; book: string; chapter: number; highlight?: number[]; translation?: string }
  | { kind: 'quotes'; quotesGroup: QuoteGroupRef }
  | { kind: 'boc'; documentCode: string; sectionOrdinal: number; bocSourceId?: string }
  | { kind: 'picker' }

/** The content a tab is currently showing, independent of its id/pane/order. */
export function tabContent(tab: Tab): TabContent {
  switch (tab.kind) {
    case 'note':
      return { kind: 'note', notePath: tab.notePath! }
    case 'pdf':
      return { kind: 'pdf', bookId: tab.bookId! }
    case 'bible':
      return { kind: 'bible', book: tab.book!, chapter: tab.chapter!, highlight: tab.highlight, translation: tab.translation }
    case 'quotes':
      return { kind: 'quotes', quotesGroup: tab.quotesGroup! }
    case 'boc':
      return { kind: 'boc', documentCode: tab.documentCode!, sectionOrdinal: tab.sectionOrdinal!, bocSourceId: tab.bocSourceId }
    case 'picker':
      return { kind: 'picker' }
  }
}

export const EMPTY_WORKSPACE: Workspace = { tabs: [], paneOrder: [], activePaneId: null }

export function tabsForPane(tabs: Tab[], paneId: string): Tab[] {
  return tabs.filter((t) => t.paneId === paneId).sort((a, b) => a.order - b.order)
}

export function activeTab(ws: Workspace, paneId: string): Tab | undefined {
  const meta = ws.paneOrder.find((p) => p.id === paneId)
  if (!meta?.activeTabId) return undefined
  return ws.tabs.find((t) => t.id === meta.activeTabId)
}

function nextOrder(tabs: Tab[], paneId: string): number {
  const existing = tabsForPane(tabs, paneId)
  return existing.length ? Math.max(...existing.map((t) => t.order)) + 1 : 0
}

function tabIdentity(t: Tab): Pick<Tab, 'id' | 'paneId' | 'order'> {
  return { id: t.id, paneId: t.paneId, order: t.order }
}

/** The other pane's id, if a second pane already exists — null if there's only one pane. */
export function otherPaneId(ws: Workspace, paneId: string): string | null {
  return ws.paneOrder.find((p) => p.id !== paneId)?.id ?? null
}

/** Drop a pane from `paneOrder` once it has no tabs left (never drops below 1 pane). */
function collapseEmptyPanes(ws: Workspace, checkPaneId: string): Workspace {
  if (ws.paneOrder.length < 2) return ws
  if (tabsForPane(ws.tabs, checkPaneId).length > 0) return ws
  const paneOrder = ws.paneOrder.filter((p) => p.id !== checkPaneId)
  const activePaneId = ws.activePaneId === checkPaneId ? (paneOrder[0]?.id ?? null) : ws.activePaneId
  return { ...ws, paneOrder, activePaneId }
}

/**
 * Create a new tab (duplicates always allowed) in `opts.paneId` (default: the active pane, or a
 * fresh first pane if there isn't one yet). Activates it unless `opts.activate` is false.
 */
export function openTab(
  ws: Workspace,
  content: TabContent,
  opts: { paneId?: string; activate?: boolean } = {}
): { ws: Workspace; tabId: string } {
  const activate = opts.activate ?? true
  let paneOrder = ws.paneOrder
  let paneId = opts.paneId ?? ws.activePaneId ?? paneOrder[0]?.id

  if (!paneId) {
    paneId = crypto.randomUUID()
    paneOrder = [{ id: paneId, activeTabId: null }]
  } else if (!paneOrder.some((p) => p.id === paneId)) {
    if (paneOrder.length >= 2) {
      // Never exceed 2 panes — fall back to the first one.
      paneId = paneOrder[0].id
    } else {
      paneOrder = [...paneOrder, { id: paneId, activeTabId: null }]
    }
  }

  const tab: Tab = { id: crypto.randomUUID(), paneId, order: nextOrder(ws.tabs, paneId), ...content }
  const tabs = [...ws.tabs, tab]
  paneOrder = activate
    ? paneOrder.map((p) => (p.id === paneId ? { ...p, activeTabId: tab.id } : p))
    : paneOrder

  return {
    ws: { tabs, paneOrder, activePaneId: activate ? paneId : ws.activePaneId },
    tabId: tab.id
  }
}

/** Move a tab to a different pane (creating that pane if it doesn't exist yet), and focus it there. */
export function moveTab(ws: Workspace, tabId: string, targetPaneId: string): Workspace {
  const tab = ws.tabs.find((t) => t.id === tabId)
  if (!tab || tab.paneId === targetPaneId) return ws

  let paneOrder = ws.paneOrder
  if (!paneOrder.some((p) => p.id === targetPaneId)) {
    if (paneOrder.length >= 2) return ws
    paneOrder = [...paneOrder, { id: targetPaneId, activeTabId: null }]
  }

  const sourcePaneId = tab.paneId
  const tabs = ws.tabs.map((t) =>
    t.id === tabId ? { ...t, paneId: targetPaneId, order: nextOrder(ws.tabs, targetPaneId) } : t
  )
  paneOrder = paneOrder.map((p) => {
    if (p.id === targetPaneId) return { ...p, activeTabId: tabId }
    if (p.id === sourcePaneId && p.activeTabId === tabId) {
      return { ...p, activeTabId: pickReplacementActiveTab(tabsForPane(tabs, sourcePaneId), tab.order) }
    }
    return p
  })

  return collapseEmptyPanes({ tabs, paneOrder, activePaneId: targetPaneId }, sourcePaneId)
}

/** Which tab should become active after closing the one at `closedOrder` — the next one to the
 *  right, or the last remaining tab if the closed one was rightmost. */
function pickReplacementActiveTab(remaining: Tab[], closedOrder: number): string | null {
  if (remaining.length === 0) return null
  const next = remaining.find((t) => t.order > closedOrder)
  return (next ?? remaining[remaining.length - 1]).id
}

export function closeTab(ws: Workspace, tabId: string): Workspace {
  const tab = ws.tabs.find((t) => t.id === tabId)
  if (!tab) return ws
  const tabs = ws.tabs.filter((t) => t.id !== tabId)
  const paneOrder = ws.paneOrder.map((p) => {
    if (p.id !== tab.paneId || p.activeTabId !== tabId) return p
    return { ...p, activeTabId: pickReplacementActiveTab(tabsForPane(tabs, p.id), tab.order) }
  })
  return collapseEmptyPanes({ tabs, paneOrder, activePaneId: ws.activePaneId }, tab.paneId)
}

/** Reorder a tab within its own pane to `targetOrder` (clamped to its siblings' range). */
export function reorderTab(ws: Workspace, tabId: string, targetOrder: number): Workspace {
  const tab = ws.tabs.find((t) => t.id === tabId)
  if (!tab) return ws
  const siblings = tabsForPane(ws.tabs, tab.paneId).filter((t) => t.id !== tabId)
  const clamped = Math.max(0, Math.min(targetOrder, siblings.length))
  const reordered = [...siblings.slice(0, clamped), tab, ...siblings.slice(clamped)]
  const orderById = new Map(reordered.map((t, i) => [t.id, i]))
  const tabs = ws.tabs.map((t) => (orderById.has(t.id) ? { ...t, order: orderById.get(t.id)! } : t))
  return { ...ws, tabs }
}

/** Replace a tab's content in place (used to fill a picker tab, or to swap what a tab shows). */
export function setTabContent(ws: Workspace, tabId: string, content: TabContent): Workspace {
  const tabs = ws.tabs.map((t) => (t.id === tabId ? { ...tabIdentity(t), ...content } : t))
  return { ...ws, tabs }
}

export function focusTab(ws: Workspace, tabId: string): Workspace {
  const tab = ws.tabs.find((t) => t.id === tabId)
  if (!tab) return ws
  const paneOrder = ws.paneOrder.map((p) => (p.id === tab.paneId ? { ...p, activeTabId: tabId } : p))
  return { ...ws, paneOrder, activePaneId: tab.paneId }
}

export function focusPane(ws: Workspace, paneId: string): Workspace {
  if (!ws.paneOrder.some((p) => p.id === paneId)) return ws
  return { ...ws, activePaneId: paneId }
}

/** The note tab (if any) whose note is a Project — independent of focus, since a project's
 *  sibling pane (the sources surface) restricts based on this, not on which tab is active. */
export function findProjectTab(
  tabs: Tab[],
  standaloneNotes: Pick<NoteSummary, 'path' | 'type'>[]
): Tab | null {
  return (
    tabs.find(
      (t) => t.kind === 'note' && standaloneNotes.find((n) => n.path === t.notePath)?.type === 'project'
    ) ?? null
  )
}

export interface ReflectedFields {
  openBookId: string | null
  activeNotePath: string | null
  scripturePassage?: { book: string; chapter: number; highlight: number[] }
  scriptureTranslation?: string
}

/**
 * Legacy "active context" fields derived from the active tab, so peripheral consumers
 * (QuotesPanel, BacklinksPanel, ScriptureHighlightsPanel, ReferenceBiblePanel, …) keep
 * reporting what's focused in the center without being rewritten.
 */
export function reflectWorkspace(ws: Workspace): ReflectedFields {
  const active = ws.activePaneId ? activeTab(ws, ws.activePaneId) : undefined
  const pdf = active?.kind === 'pdf' ? active : ws.tabs.find((t) => t.kind === 'pdf')
  const noteTabs = ws.tabs.filter((t) => t.kind === 'note')
  const activeNote = active?.kind === 'note' ? active : noteTabs[0]
  const bibleTabs = ws.tabs.filter((t) => t.kind === 'bible')
  const activeBible = active?.kind === 'bible' ? active : bibleTabs[0]

  const fields: ReflectedFields = {
    openBookId: pdf?.bookId ?? null,
    activeNotePath: activeNote?.notePath ?? null
  }
  if (activeBible?.book && activeBible.chapter != null) {
    fields.scripturePassage = {
      book: activeBible.book,
      chapter: activeBible.chapter,
      highlight: activeBible.highlight ?? []
    }
    if (activeBible.translation) fields.scriptureTranslation = activeBible.translation
  }
  return fields
}

/** Drop restored tabs whose reference no longer resolves (a deleted book or note). */
export function validateRestoredTabs(
  tabs: Tab[],
  books: { id: string }[],
  standaloneNotes: { path: string }[]
): Tab[] {
  const bookIds = new Set(books.map((b) => b.id))
  const notePaths = new Set(standaloneNotes.map((n) => n.path))
  return tabs.filter((t) => {
    if (t.kind === 'pdf') return !!t.bookId && bookIds.has(t.bookId)
    if (t.kind === 'note') return !!t.notePath && notePaths.has(t.notePath)
    return true
  })
}

/** Fix up `paneOrder`/`activePaneId` after tabs were filtered out from under them: drop panes
 *  left with no tabs, and repoint any dangling `activeTabId`/`activePaneId`. */
export function sanitizeWorkspace(ws: Workspace): Workspace {
  const paneOrder = ws.paneOrder
    .map((p) => {
      const tabs = tabsForPane(ws.tabs, p.id)
      if (tabs.length === 0) return null
      const activeTabId = tabs.some((t) => t.id === p.activeTabId) ? p.activeTabId : tabs[0].id
      return { id: p.id, activeTabId }
    })
    .filter((p): p is PaneMeta => p !== null)
  const tabs = ws.tabs.filter((t) => paneOrder.some((p) => p.id === t.paneId))
  const activePaneId = paneOrder.some((p) => p.id === ws.activePaneId)
    ? ws.activePaneId
    : (paneOrder[0]?.id ?? null)
  return { tabs, paneOrder, activePaneId }
}
