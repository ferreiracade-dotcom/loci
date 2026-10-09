import type { NoteSummary } from '@shared/ipc'

/**
 * Tab kinds. Content kinds carry a location in their fields; page kinds (library, notes, …) are
 * whole views that used to live behind the left icon rail. Which component, label and icon each
 * kind gets is decided in one place: `components/chrome/tabRegistry.tsx`.
 */
export type TabKind =
  | 'note'
  | 'bible'
  | 'pdf'
  | 'quotes'
  | 'boc'
  | 'newtab'
  | 'library'
  | 'notes'
  | 'quotesIndex'
  | 'fathers'
  | 'settings'
  | 'history'
  | 'bookmarks'
  | 'dashboard'

/** Page kinds: views with no location of their own. */
export type PageKind =
  | 'newtab'
  | 'library'
  | 'notes'
  | 'quotesIndex'
  | 'fathers'
  | 'settings'
  | 'history'
  | 'bookmarks'
  | 'dashboard'

export const PAGE_KINDS: PageKind[] = [
  'newtab',
  'library',
  'notes',
  'quotesIndex',
  'fathers',
  'settings',
  'history',
  'bookmarks',
  'dashboard'
]

const KNOWN_KINDS = new Set<string>(['note', 'bible', 'pdf', 'quotes', 'boc', ...PAGE_KINDS])

/** A group of saved quotes opened in the center: a PDF, a Bible chapter, or a commentary source. */
export type QuoteGroupRef =
  | { type: 'book'; bookId: string; title: string }
  // `chapter` omitted = every chapter of this book (the "Bible book" grouping mode).
  | { type: 'scripture'; book: string; chapter?: number; translation: string; name: string }
  | { type: 'commentary'; sourceId: string; displayName: string }
  | { type: 'boc'; documentCode: string; bocSourceId: string; name: string }
  | { type: 'author'; author: string }
  | { type: 'tag'; tag: string }

/** One tab in the window's single tab strip. Only the content fields for its `kind` are set. */
export interface Tab {
  id: string
  /** Position in the strip (0-based, contiguous; pinned tabs first). */
  order: number
  kind: TabKind
  pinned?: boolean
  /** Two tabs sharing a splitId render side by side (Chrome split view). */
  splitId?: string
  /** The open tab group this tab belongs to (see `tabGroups.ts`). */
  groupId?: string
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
  /**
   * Back/forward stack of locations (capped at MAX_HISTORY); `history[historyIndex]` is the
   * current location. Optional on the type so older persisted tabs (and test fixtures) still
   * parse; `sanitizeWorkspace` and `tabHistory` fill them in.
   */
  history?: TabLocation[]
  historyIndex?: number
}

/** A closed tab remembered for "Reopen closed tab", with where it sat in the strip. */
export interface ClosedTab {
  tab: Tab
  index: number
}

/** The whole tab workspace. */
export interface Workspace {
  tabs: Tab[]
  /** The focused tab (for a split, the focused half). */
  activeTabId: string | null
  /** Divider position per split, 0.2-0.8 (absent = 0.5). */
  splitRatios: Record<string, number>
  /** Most recent last; capped. */
  closed: ClosedTab[]
}

/** Content to place into a tab. */
export type TabContent =
  | { kind: 'note'; notePath: string }
  | { kind: 'pdf'; bookId: string }
  | { kind: 'bible'; book: string; chapter: number; highlight?: number[]; translation?: string }
  | { kind: 'quotes'; quotesGroup: QuoteGroupRef }
  | { kind: 'boc'; documentCode: string; sectionOrdinal: number; bocSourceId?: string }
  | { kind: PageKind }

/** Where a tab is: one entry of its back/forward history (same shape as TabContent). */
export type TabLocation = TabContent

export const MAX_CLOSED = 25
export const MAX_HISTORY = 50
export const MAX_SPLIT = 2

export const EMPTY_WORKSPACE: Workspace = { tabs: [], activeTabId: null, splitRatios: {}, closed: [] }

/** The content a tab is currently showing, independent of its id/order/pin/split. */
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
    default:
      return { kind: tab.kind }
  }
}

/** A stable string for "where a tab is", used to detect navigation (history recording). */
export function contentKey(c: TabContent): string {
  const { kind, ...rest } = c as TabContent & Record<string, unknown>
  // Highlights are a view detail, not a location.
  delete (rest as Record<string, unknown>).highlight
  return `${kind}:${JSON.stringify(rest, Object.keys(rest).sort())}`
}

function newId(): string {
  return crypto.randomUUID()
}

/** Tabs in strip order. */
export function sortedTabs(tabs: Tab[]): Tab[] {
  return [...tabs].sort((a, b) => a.order - b.order)
}

/** Rewrite `order` as 0..n-1 following the array's sequence. */
export function renumber(tabs: Tab[]): Tab[] {
  return tabs.map((t, i) => (t.order === i ? t : { ...t, order: i }))
}

export function findTab(ws: Workspace, id: string | null | undefined): Tab | undefined {
  return id ? ws.tabs.find((t) => t.id === id) : undefined
}

export function focusedTab(ws: Pick<Workspace, 'tabs' | 'activeTabId'>): Tab | undefined {
  return ws.activeTabId ? ws.tabs.find((t) => t.id === ws.activeTabId) : undefined
}

/** The other half of a tab's split, if it is in one. */
export function splitPartner(tabs: Tab[], id: string): Tab | undefined {
  const tab = tabs.find((t) => t.id === id)
  if (!tab?.splitId) return undefined
  return tabs.find((t) => t.id !== id && t.splitId === tab.splitId)
}

/** The strip as units: a lone tab, or a split pair (left half first). */
export function stripUnits(tabs: Tab[]): Tab[][] {
  const sorted = sortedTabs(tabs)
  const units: Tab[][] = []
  for (const t of sorted) {
    const last = units[units.length - 1]
    if (t.splitId && last && last.length === 1 && last[0].splitId === t.splitId) last.push(t)
    else units.push([t])
  }
  return units
}

/** Index just past `id`'s unit (so a new tab lands after a split pair, not inside it). */
function indexAfter(sorted: Tab[], id: string): number {
  const i = sorted.findIndex((t) => t.id === id)
  if (i < 0) return sorted.length
  const t = sorted[i]
  if (t.splitId && sorted[i + 1]?.splitId === t.splitId) return i + 2
  return i + 1
}

/** First index an unpinned tab may occupy. */
export function pinnedCount(sorted: Tab[]): number {
  return sorted.filter((t) => t.pinned).length
}

/**
 * Create a new tab (duplicates always allowed). By default it goes at the end of the strip;
 * `after` places it right after that tab's unit. Activates it unless `activate` is false.
 */
export function openTab(
  ws: Workspace,
  content: TabContent,
  opts: { activate?: boolean; after?: string | null } = {}
): { ws: Workspace; tabId: string } {
  const activate = opts.activate ?? true
  const sorted = sortedTabs(ws.tabs)
  let index = opts.after ? indexAfter(sorted, opts.after) : sorted.length
  index = Math.max(index, pinnedCount(sorted))
  const tab: Tab = { id: newId(), order: 0, ...content, history: [content], historyIndex: 0 }
  const tabs = renumber([...sorted.slice(0, index), tab, ...sorted.slice(index)])
  return {
    ws: { ...ws, tabs, activeTabId: activate || !ws.activeTabId ? tab.id : ws.activeTabId },
    tabId: tab.id
  }
}

/** Which tab gets focus after `closed` (at `index` in the old strip) goes away: its split
 *  partner, else (Chrome) the tab to the right, else the one to the left. */
function pickReplacement(remaining: Tab[], partnerId: string | undefined, index: number): string | null {
  if (remaining.length === 0) return null
  if (partnerId && remaining.some((t) => t.id === partnerId)) return partnerId
  return (remaining[index] ?? remaining[remaining.length - 1]).id
}

/** Remove a split id from every tab that carries it (unsplitting both halves). */
function dropSplit(tabs: Tab[], splitId: string | undefined): Tab[] {
  if (!splitId) return tabs
  return tabs.map((t) => {
    if (t.splitId !== splitId) return t
    const { splitId: _drop, ...rest } = t
    void _drop
    return rest
  })
}

function withoutRatio(ratios: Record<string, number>, splitId: string | undefined): Record<string, number> {
  if (!splitId || !(splitId in ratios)) return ratios
  const next = { ...ratios }
  delete next[splitId]
  return next
}

function remember(closed: ClosedTab[], tabs: Tab[], index: number): ClosedTab[] {
  const entries = tabs.map((t, i) => {
    const { splitId: _s, ...rest } = t
    void _s
    return { tab: { ...rest }, index: index + i }
  })
  return [...closed, ...entries].slice(-MAX_CLOSED)
}

/** Close a tab. Its split partner, if any, stays as a normal tab and takes focus. */
export function closeTab(ws: Workspace, tabId: string): Workspace {
  const sorted = sortedTabs(ws.tabs)
  const index = sorted.findIndex((t) => t.id === tabId)
  if (index < 0) return ws
  const tab = sorted[index]
  const partner = splitPartner(sorted, tabId)
  const remaining = dropSplit(
    sorted.filter((t) => t.id !== tabId),
    tab.splitId
  )
  const activeTabId =
    ws.activeTabId === tabId ? pickReplacement(remaining, partner?.id, index) : ws.activeTabId
  return {
    tabs: renumber(remaining),
    activeTabId,
    splitRatios: withoutRatio(ws.splitRatios, tab.splitId),
    closed: remember(ws.closed, [tab], index)
  }
}

/** Close a set of tabs at once (Close other tabs / Close tabs to the right). */
function closeMany(ws: Workspace, ids: Set<string>, focus: string): Workspace {
  if (ids.size === 0) return ws.activeTabId === focus ? ws : { ...ws, activeTabId: focus }
  const sorted = sortedTabs(ws.tabs)
  let tabs = sorted
  let ratios = ws.splitRatios
  let closed = ws.closed
  sorted.forEach((t, i) => {
    if (!ids.has(t.id)) return
    closed = remember(closed, [t], i)
    if (t.splitId) {
      tabs = dropSplit(tabs, t.splitId)
      ratios = withoutRatio(ratios, t.splitId)
    }
  })
  tabs = tabs.filter((t) => !ids.has(t.id))
  const activeTabId = tabs.some((t) => t.id === focus) ? focus : (tabs[0]?.id ?? null)
  return { tabs: renumber(tabs), activeTabId, splitRatios: ratios, closed }
}

/** Close every other unpinned tab, keeping `tabId` and its split partner. */
export function closeOtherTabs(ws: Workspace, tabId: string): Workspace {
  const partner = splitPartner(ws.tabs, tabId)
  const ids = new Set(
    ws.tabs.filter((t) => !t.pinned && t.id !== tabId && t.id !== partner?.id).map((t) => t.id)
  )
  return closeMany(ws, ids, tabId)
}

/** Close every tab to the right of `tabId`'s unit. */
export function closeTabsToRight(ws: Workspace, tabId: string): Workspace {
  const sorted = sortedTabs(ws.tabs)
  const cut = indexAfter(sorted, tabId)
  const ids = new Set(sorted.slice(cut).map((t) => t.id))
  const keepFocus = ws.activeTabId && !ids.has(ws.activeTabId) ? ws.activeTabId : tabId
  return closeMany(ws, ids, keepFocus)
}

/** Reopen the most recently closed tab where it was, and focus it. */
export function reopenClosedTab(ws: Workspace): { ws: Workspace; tabId: string | null } {
  const last = ws.closed[ws.closed.length - 1]
  if (!last) return { ws, tabId: null }
  const sorted = sortedTabs(ws.tabs)
  const pins = pinnedCount(sorted)
  let index = Math.min(last.index, sorted.length)
  // Never land inside a split pair.
  const before = sorted[index - 1]
  if (before?.splitId && sorted[index]?.splitId === before.splitId) index += 1
  const tab: Tab = { ...last.tab, id: newId() }
  if (tab.pinned) index = Math.min(index, pins)
  else index = Math.max(index, pins)
  const tabs = renumber([...sorted.slice(0, index), tab, ...sorted.slice(index)])
  return {
    ws: { ...ws, tabs, activeTabId: tab.id, closed: ws.closed.slice(0, -1) },
    tabId: tab.id
  }
}

/**
 * Move a tab (with its split partner) so its unit starts at strip position `targetIndex`
 * (an index into the strip without the moved unit). Pinned tabs stay within the pinned region
 * and unpinned tabs within the unpinned one.
 */
export function reorderTab(ws: Workspace, tabId: string, targetIndex: number): Workspace {
  const sorted = sortedTabs(ws.tabs)
  const tab = sorted.find((t) => t.id === tabId)
  if (!tab) return ws
  const moving = sorted.filter((t) => t.id === tabId || (tab.splitId && t.splitId === tab.splitId))
  const rest = sorted.filter((t) => !moving.includes(t))
  const pins = pinnedCount(rest)
  let index = Math.max(0, Math.min(targetIndex, rest.length))
  index = tab.pinned ? Math.min(index, pins) : Math.max(index, pins)
  // Never drop into the middle of another split pair.
  const before = rest[index - 1]
  if (before?.splitId && rest[index]?.splitId === before.splitId) index += 1
  const tabs = renumber([...rest.slice(0, index), ...moving, ...rest.slice(index)])
  return { ...ws, tabs }
}

/** Pin (icon-only, moved to the end of the pinned region) or unpin (moved just after it). */
export function setPinned(ws: Workspace, tabId: string, pinned: boolean): Workspace {
  const tab = ws.tabs.find((t) => t.id === tabId)
  if (!tab || !!tab.pinned === pinned) return ws
  let tabs = ws.tabs
  let ratios = ws.splitRatios
  if (pinned && tab.splitId) {
    // Pinned tabs can't be in a split.
    tabs = dropSplit(tabs, tab.splitId)
    ratios = withoutRatio(ratios, tab.splitId)
  }
  const sorted = sortedTabs(tabs)
  const updated = sorted.find((t) => t.id === tabId)!
  const rest = sorted.filter((t) => t.id !== tabId)
  // Pinned tabs can't be in a group either.
  const moved: Tab = pinned
    ? (({ groupId: _g, ...r }) => (void _g, { ...r, pinned: true }))(updated)
    : (({ pinned: _p, ...r }) => (void _p, r))(updated)
  const index = pinnedCount(rest)
  return { ...ws, tabs: renumber([...rest.slice(0, index), moved, ...rest.slice(index)]), splitRatios: ratios }
}

/**
 * Join two tabs into a split view: `b` moves right after `a`, both leave any split they were in
 * (and are unpinned), and `a` keeps focus.
 */
export function splitTabs(ws: Workspace, a: string, b: string): Workspace {
  if (a === b) return ws
  const ta = ws.tabs.find((t) => t.id === a)
  const tb = ws.tabs.find((t) => t.id === b)
  if (!ta || !tb) return ws
  let tabs = dropSplit(dropSplit(ws.tabs, ta.splitId), tb.splitId)
  let ratios = withoutRatio(withoutRatio(ws.splitRatios, ta.splitId), tb.splitId)
  const splitId = newId()
  tabs = tabs.map((t) => {
    if (t.id !== a && t.id !== b) return t
    const { pinned: _p, ...rest } = t
    void _p
    return { ...rest, splitId }
  })
  const sorted = sortedTabs(tabs)
  const B = sorted.find((t) => t.id === b)!
  const without = sorted.filter((t) => t.id !== b)
  const ai = without.findIndex((t) => t.id === a)
  const ordered = [...without.slice(0, ai + 1), B, ...without.slice(ai + 1)]
  // `a` may have been pinned: keep the pair after the pinned region.
  const pins = pinnedCount(ordered)
  const pairStart = ordered.findIndex((t) => t.splitId === splitId)
  let final = ordered
  if (pairStart < pins) {
    const pair = ordered.filter((t) => t.splitId === splitId)
    const others = ordered.filter((t) => t.splitId !== splitId)
    final = [...others.slice(0, pins), ...pair, ...others.slice(pins)]
  }
  ratios = { ...ratios }
  return { ...ws, tabs: renumber(final), activeTabId: a, splitRatios: ratios }
}

/** Take a tab's split apart; both halves become normal tabs. */
export function unsplitTab(ws: Workspace, tabId: string): Workspace {
  const tab = ws.tabs.find((t) => t.id === tabId)
  if (!tab?.splitId) return ws
  return { ...ws, tabs: dropSplit(ws.tabs, tab.splitId), splitRatios: withoutRatio(ws.splitRatios, tab.splitId) }
}

export function setSplitRatio(ws: Workspace, splitId: string, ratio: number): Workspace {
  const r = Math.min(0.8, Math.max(0.2, ratio))
  return { ...ws, splitRatios: { ...ws.splitRatios, [splitId]: r } }
}

/** Open a copy of a tab right after its unit (not in a split) and focus it. */
export function duplicateTab(ws: Workspace, tabId: string): { ws: Workspace; tabId: string | null } {
  const tab = ws.tabs.find((t) => t.id === tabId)
  if (!tab) return { ws, tabId: null }
  const { ws: opened, tabId: id } = openTab(ws, tabContent(tab), { after: tabId })
  // Chrome's Duplicate keeps the back/forward history.
  const h = tabHistory(tab)
  const next = {
    ...opened,
    tabs: opened.tabs.map((t) =>
      t.id === id
        ? { ...t, history: h.entries, historyIndex: h.index, ...(tab.groupId ? { groupId: tab.groupId } : {}) }
        : t
    )
  }
  if (!tab.pinned) return { ws: next, tabId: id }
  return { ws: setPinned(next, id, true), tabId: id }
}

/** A tab's content fields replaced by `content`, keeping id, position, pin, split, group and history. */
function withContent(t: Tab, content: TabContent, history: TabLocation[], historyIndex: number): Tab {
  const base: Tab = { id: t.id, order: t.order, kind: content.kind }
  if (t.pinned) base.pinned = true
  if (t.splitId) base.splitId = t.splitId
  if (t.groupId) base.groupId = t.groupId
  return { ...base, ...content, history, historyIndex }
}

/**
 * A tab's back/forward history, normalised: never empty, index in range, and the entry at the
 * index is the tab's current location (a tab restored from an older session gets a one-entry
 * history; a current location missing from the stack is appended).
 */
export function tabHistory(tab: Tab): { entries: TabLocation[]; index: number } {
  const current = tabContent(tab)
  const raw = Array.isArray(tab.history)
    ? tab.history.filter((h) => h && typeof h === 'object' && KNOWN_KINDS.has((h as TabLocation).kind))
    : []
  if (raw.length === 0) return { entries: [current], index: 0 }
  let index = typeof tab.historyIndex === 'number' ? Math.round(tab.historyIndex) : raw.length - 1
  index = Math.max(0, Math.min(raw.length - 1, index))
  if (contentKey(raw[index]) === contentKey(current)) {
    const entries = [...raw]
    entries[index] = current
    return capHistory(entries, index)
  }
  return capHistory([...raw.slice(0, index + 1), current], index + 1)
}

function capHistory(entries: TabLocation[], index: number): { entries: TabLocation[]; index: number } {
  const drop = Math.max(0, entries.length - MAX_HISTORY)
  return { entries: entries.slice(drop), index: Math.max(0, index - drop) }
}

/**
 * Navigate a tab in place (keeps its id, position, pin and split). A new location is pushed on
 * the tab's history, dropping any forward entries, like following a link in Chrome; a change
 * that keeps the location (e.g. only the highlighted verses) replaces the current entry.
 */
export function setTabContent(ws: Workspace, tabId: string, content: TabContent): Workspace {
  const tabs = ws.tabs.map((t) => {
    if (t.id !== tabId) return t
    const h = tabHistory(t)
    if (contentKey(h.entries[h.index]) === contentKey(content)) {
      const entries = [...h.entries]
      entries[h.index] = content
      return withContent(t, content, entries, h.index)
    }
    const pushed = capHistory([...h.entries.slice(0, h.index + 1), content], h.index + 1)
    return withContent(t, content, pushed.entries, pushed.index)
  })
  return { ...ws, tabs }
}

/** Move a tab to entry `index` of its own history (Back, Forward, or a pick from their lists). */
export function goToHistoryIndex(ws: Workspace, tabId: string, index: number): Workspace {
  const tab = ws.tabs.find((t) => t.id === tabId)
  if (!tab) return ws
  const h = tabHistory(tab)
  if (index < 0 || index >= h.entries.length || index === h.index) return ws
  const tabs = ws.tabs.map((t) => (t.id === tabId ? withContent(t, h.entries[index], h.entries, index) : t))
  return { ...ws, tabs }
}

/** Back (-1) or Forward (+1) in a tab's history; unchanged at either end. */
export function goHistory(ws: Workspace, tabId: string, delta: number): Workspace {
  const tab = ws.tabs.find((t) => t.id === tabId)
  if (!tab) return ws
  return goToHistoryIndex(ws, tabId, tabHistory(tab).index + delta)
}

export function canGoBack(tab: Tab | undefined): boolean {
  return !!tab && tabHistory(tab).index > 0
}

export function canGoForward(tab: Tab | undefined): boolean {
  if (!tab) return false
  const h = tabHistory(tab)
  return h.index < h.entries.length - 1
}

export function focusTab(ws: Workspace, tabId: string): Workspace {
  if (!ws.tabs.some((t) => t.id === tabId) || ws.activeTabId === tabId) return ws
  return { ...ws, activeTabId: tabId }
}

/** Ctrl+Tab / Ctrl+Shift+Tab: focus the next/previous tab, wrapping. */
export function cycleTab(ws: Workspace, dir: 1 | -1): Workspace {
  const sorted = sortedTabs(ws.tabs)
  if (sorted.length === 0) return ws
  const i = sorted.findIndex((t) => t.id === ws.activeTabId)
  const next = sorted[(i + dir + sorted.length) % sorted.length]
  return focusTab(ws, next.id)
}

/** Ctrl+1..8 focus the nth tab (or the last one if there are fewer); Ctrl+9 the last tab. */
export function selectTabByNumber(ws: Workspace, n: number): Workspace {
  const sorted = sortedTabs(ws.tabs)
  if (sorted.length === 0) return ws
  const target = n >= 9 ? sorted[sorted.length - 1] : (sorted[n - 1] ?? sorted[sorted.length - 1])
  return focusTab(ws, target.id)
}

/** The Project note open in any tab — independent of focus. */
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
 * Legacy "active context" fields derived from the focused tab (the focused half of a split),
 * so peripheral consumers (QuotesPanel, ScriptureHighlightsPanel, ReferenceBiblePanel, …) keep
 * reporting what's focused without being rewritten. Falls back to the split partner, then to
 * any tab of the right kind, as the two-pane model did.
 */
export function reflectWorkspace(ws: Pick<Workspace, 'tabs' | 'activeTabId'>): ReflectedFields {
  const active = focusedTab(ws)
  const partner = active ? splitPartner(ws.tabs, active.id) : undefined
  const pick = (kind: TabKind): Tab | undefined =>
    active?.kind === kind
      ? active
      : partner?.kind === kind
        ? partner
        : sortedTabs(ws.tabs).find((t) => t.kind === kind)
  const pdf = pick('pdf')
  const note = pick('note')
  const bible = pick('bible')

  const fields: ReflectedFields = {
    openBookId: pdf?.bookId ?? null,
    activeNotePath: note?.notePath ?? null
  }
  if (bible?.book && bible.chapter != null) {
    fields.scripturePassage = { book: bible.book, chapter: bible.chapter, highlight: bible.highlight ?? [] }
    if (bible.translation) fields.scriptureTranslation = bible.translation
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


/**
 * Repair a workspace after tabs were filtered out from under it or it was read from disk:
 * renumber, put pinned tabs first, keep only splits with exactly two adjacent unpinned halves,
 * and repoint a dangling activeTabId.
 */
export function sanitizeWorkspace(ws: Partial<Workspace> & { tabs: Tab[] }): Workspace {
  let tabs = sortedTabs(ws.tabs.filter((t) => t && typeof t.id === 'string' && KNOWN_KINDS.has(t.kind)))
  tabs = [...tabs.filter((t) => t.pinned), ...tabs.filter((t) => !t.pinned)]
  // Splits: exactly two members, adjacent, not pinned.
  const counts = new Map<string, number>()
  for (const t of tabs) if (t.splitId) counts.set(t.splitId, (counts.get(t.splitId) ?? 0) + 1)
  tabs = tabs.map((t, i) => {
    if (!t.splitId) return t
    const ok =
      counts.get(t.splitId) === MAX_SPLIT &&
      !t.pinned &&
      (tabs[i - 1]?.splitId === t.splitId || tabs[i + 1]?.splitId === t.splitId)
    if (ok) return t
    const { splitId: _s, ...rest } = t
    void _s
    return rest
  })
  tabs = renumber(tabs).map((t) => {
    const h = tabHistory(t)
    return { ...t, history: h.entries, historyIndex: h.index }
  })
  const liveSplits = new Set(tabs.map((t) => t.splitId).filter(Boolean) as string[])
  const splitRatios: Record<string, number> = {}
  for (const [k, v] of Object.entries(ws.splitRatios ?? {})) {
    if (liveSplits.has(k) && typeof v === 'number') splitRatios[k] = Math.min(0.8, Math.max(0.2, v))
  }
  const activeTabId = tabs.some((t) => t.id === ws.activeTabId) ? ws.activeTabId! : (tabs[0]?.id ?? null)
  const closed = Array.isArray(ws.closed)
    ? ws.closed.filter((c) => c && c.tab && KNOWN_KINDS.has(c.tab.kind)).slice(-MAX_CLOSED)
    : []
  return { tabs, activeTabId, splitRatios, closed }
}

/** The persisted two-pane workspace format (2026-07-17 tabbed panes spec). */
interface LegacyTab extends Omit<Tab, 'kind'> {
  kind: string
  paneId?: string
}
interface LegacyWorkspace {
  tabs?: LegacyTab[]
  paneOrder?: { id: string; activeTabId: string | null }[]
  activePaneId?: string | null
  paneRatio?: number
}

export function isLegacyWorkspace(raw: unknown): raw is LegacyWorkspace {
  return !!raw && typeof raw === 'object' && Array.isArray((raw as LegacyWorkspace).paneOrder)
}

/**
 * Migrate the two-pane format to one strip: left pane's tabs first, then the right pane's. If
 * two panes were open, their active tabs become one split (keeping the old divider ratio).
 */
export function migrateLegacyWorkspace(raw: LegacyWorkspace): Workspace {
  const panes = raw.paneOrder ?? []
  const all = raw.tabs ?? []
  const strip: Tab[] = []
  for (const pane of panes) {
    const paneTabs = all.filter((t) => t.paneId === pane.id).sort((a, b) => a.order - b.order)
    for (const t of paneTabs) {
      const { paneId: _p, ...rest } = t
      void _p
      const kind = (rest.kind === 'picker' ? 'newtab' : rest.kind) as TabKind
      strip.push({ ...rest, kind, order: strip.length })
    }
  }
  const actives = panes
    .map((p) => p.activeTabId)
    .filter((id): id is string => !!id && strip.some((t) => t.id === id))
  const activePane = panes.find((p) => p.id === raw.activePaneId)
  const focus = activePane?.activeTabId && actives.includes(activePane.activeTabId)
    ? activePane.activeTabId
    : (actives[0] ?? strip[0]?.id ?? null)
  let ws = sanitizeWorkspace({ tabs: strip, activeTabId: focus })
  if (actives.length === 2) {
    const [left, right] = actives
    ws = splitTabs(ws, left, right)
    const splitId = ws.tabs.find((t) => t.id === left)!.splitId!
    if (typeof raw.paneRatio === 'number') ws = setSplitRatio(ws, splitId, raw.paneRatio)
    ws = { ...ws, activeTabId: focus }
  }
  return ws
}

/** Parse a persisted workspace in either format. Never throws. */
export function parsePersistedWorkspace(json: string | null): Workspace {
  if (!json) return EMPTY_WORKSPACE
  try {
    const raw = JSON.parse(json) as unknown
    if (isLegacyWorkspace(raw)) return migrateLegacyWorkspace(raw)
    if (raw && typeof raw === 'object' && Array.isArray((raw as Workspace).tabs)) {
      return sanitizeWorkspace(raw as Workspace)
    }
  } catch {
    /* malformed: start fresh */
  }
  return EMPTY_WORKSPACE
}

/** What goes to disk: new-tab pages are kept (they're cheap and Chrome restores them). */
export function serializeWorkspace(ws: Workspace): string {
  return JSON.stringify({ version: 2, ...sanitizeWorkspace(ws) })
}
