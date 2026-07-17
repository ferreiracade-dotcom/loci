# Tabbed Panes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Loci's 2-slot dual-pane workspace with a Chrome-style tabbed workspace — unlimited tabs per pane, drag to reorder or move between panes, split capped at 2 panes (left/right), and a working session restore.

**Architecture:** A new pure state-transition module (`workspace.ts`) owns all tab/pane logic as plain functions over an explicit `Workspace` value (no `zustand`, no `api`, fully unit-testable). `useStore.ts` becomes a thin wrapper: it holds `tabs`/`paneOrder`/`activePaneId`/`paneRatio` as state, calls the pure functions, and handles the side effects (persistence, derived legacy fields). Every component that today reads `panes`/`Pane`/`PaneContent` is migrated to `tabs`/`Tab`/`TabContent`. A new `TabStrip` component (Pointer Events, matching the existing `Divider.tsx` precedent — no new dependency) renders each pane's tabs and drives both in-pane reordering and cross-pane dragging.

**Tech Stack:** TypeScript, React 18, zustand, Vitest (`environment: 'node'`, no component-rendering infra — matches this repo's existing test style of pure-function unit tests only).

## Global Constraints

- No semicolons, single quotes, 2-space indent — matches every existing file in this repo exactly.
- No new npm dependencies (no drag-and-drop library) — drag is hand-rolled Pointer Events, per `Divider.tsx`'s existing pattern.
- No SQL migration needed — `session_state` is already a generic key/value JSON store (`src/main/db/migrations.ts`); the `workspace` key's JSON shape just changes.
- New automated tests are pure-function `vitest` unit tests only (`src/**/*.test.ts`, `environment: 'node'`) — this repo has no component-rendering test infra (no Testing Library/jsdom), so UI components are verified via `npm run typecheck` + manual smoke test, matching how every other UI component in this repo is (not) tested today.
- Design reference: `docs/superpowers/specs/2026-07-17-tabbed-panes-design.md`.

---

## Task 1: Pure workspace model + sequential write queue

**Files:**
- Create: `src/renderer/src/store/workspace.ts`
- Create: `src/renderer/src/store/workspace.test.ts`
- Create: `src/renderer/src/lib/sequentialQueue.ts`
- Create: `src/renderer/src/lib/sequentialQueue.test.ts`

**Interfaces:**
- Consumes: `NoteSummary` type from `@shared/ipc` (already exists).
- Produces (used by every later task): `TabKind`, `QuoteGroupRef`, `Tab`, `PaneMeta`, `Workspace`, `TabContent`, `EMPTY_WORKSPACE`, `tabsForPane(tabs, paneId)`, `activeTab(ws, paneId)`, `openTab(ws, content, opts?)`, `moveTab(ws, tabId, targetPaneId)`, `closeTab(ws, tabId)`, `reorderTab(ws, tabId, targetOrder)`, `setTabContent(ws, tabId, content)`, `focusTab(ws, tabId)`, `focusPane(ws, paneId)`, `otherPaneId(ws, paneId)`, `findProjectTab(tabs, standaloneNotes)`, `reflectWorkspace(ws)`, `validateRestoredTabs(tabs, books, standaloneNotes)`, `sanitizeWorkspace(ws)`; and `createSequentialQueue(): (task: () => Promise<void>) => void`.

- [ ] **Step 1: Write failing tests for the workspace module**

Create `src/renderer/src/store/workspace.test.ts`:

```ts
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
  it('replaces a tab’s content in place, keeping its id/paneId/order', () => {
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
  const notes = [
    { path: 'proj.md', type: 'project' },
    { path: 'plain.md', type: undefined }
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
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `npx vitest run src/renderer/src/store/workspace.test.ts`
Expected: FAIL — `Cannot find module './workspace'` (the file doesn't exist yet).

- [ ] **Step 3: Implement `workspace.ts`**

Create `src/renderer/src/store/workspace.ts`:

```ts
import type { NoteSummary } from '@shared/ipc'

export type TabKind = 'note' | 'bible' | 'pdf' | 'quotes' | 'picker'

/** A group of saved quotes opened in the center: a PDF, a Bible chapter, or a commentary source. */
export type QuoteGroupRef =
  | { type: 'book'; bookId: string; title: string }
  // `chapter` omitted = every chapter of this book (the "Bible book" grouping mode).
  | { type: 'scripture'; book: string; chapter?: number; translation: string; name: string }
  | { type: 'commentary'; sourceId: string; displayName: string }
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
  | { kind: 'picker' }

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
  paneOrder = paneOrder.map((p) => (p.id === targetPaneId ? { ...p, activeTabId: tabId } : p))

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
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `npx vitest run src/renderer/src/store/workspace.test.ts`
Expected: PASS (all tests green).

- [ ] **Step 5: Write failing tests for the sequential write queue**

Create `src/renderer/src/lib/sequentialQueue.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createSequentialQueue } from './sequentialQueue'

describe('createSequentialQueue', () => {
  it('runs tasks in the order they were pushed, even if an earlier one resolves later', async () => {
    const results: string[] = []
    const push = createSequentialQueue()
    push(
      () =>
        new Promise((resolve) => {
          setTimeout(() => {
            results.push('a')
            resolve()
          }, 20)
        })
    )
    push(async () => {
      results.push('b')
    })
    push(async () => {
      results.push('c')
    })
    await new Promise((resolve) => setTimeout(resolve, 40))
    expect(results).toEqual(['a', 'b', 'c'])
  })

  it('keeps running later tasks even if an earlier one throws', async () => {
    const results: string[] = []
    const push = createSequentialQueue()
    push(async () => {
      throw new Error('boom')
    })
    push(async () => {
      results.push('after-failure')
    })
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(results).toEqual(['after-failure'])
  })
})
```

- [ ] **Step 6: Run the test to confirm it fails**

Run: `npx vitest run src/renderer/src/lib/sequentialQueue.test.ts`
Expected: FAIL — `Cannot find module './sequentialQueue'`.

- [ ] **Step 7: Implement `sequentialQueue.ts`**

Create `src/renderer/src/lib/sequentialQueue.ts`:

```ts
/**
 * Runs async tasks strictly in the order they were pushed, regardless of how long each one
 * takes. Used to persist workspace state: firing writes off independently risks a slower
 * earlier write landing after a faster later one and silently reverting good state.
 */
export function createSequentialQueue(): (task: () => Promise<void>) => void {
  let tail: Promise<void> = Promise.resolve()
  return (task) => {
    tail = tail.then(
      () => task(),
      () => task()
    )
  }
}
```

- [ ] **Step 8: Run both test files to confirm everything passes**

Run: `npx vitest run src/renderer/src/store/workspace.test.ts src/renderer/src/lib/sequentialQueue.test.ts`
Expected: PASS (all tests green).

- [ ] **Step 9: Commit**

```bash
git add src/renderer/src/store/workspace.ts src/renderer/src/store/workspace.test.ts src/renderer/src/lib/sequentialQueue.ts src/renderer/src/lib/sequentialQueue.test.ts
git commit -m "Add pure workspace (tabs/panes) model and sequential write queue"
```

---

## Task 2: Wire `useStore.ts` to the workspace model

**Files:**
- Modify: `src/renderer/src/store/useStore.ts`

**Interfaces:**
- Consumes: everything produced by Task 1 (`workspace.ts`, `sequentialQueue.ts`).
- Produces (used by Tasks 3-9): Store fields `tabs: Tab[]`, `paneOrder: PaneMeta[]`, `activePaneId: string | null`, `paneRatio: number`; Store actions `openTab(content, opts?): string`, `openTabInSplit(content): void`, `moveTabToSplit(tabId): void`, `closeTab(tabId): void`, `reorderTab(tabId, targetOrder): void`, `placeTab(tabId, paneId, order): void`, `setTabContent(tabId, content): void`, `resetTabToPicker(tabId): void`, `focusTab(tabId): void`, `focusPane(paneId): void`, `setPaneRatio(r): void`, `createNoteInTab(id, title, type?): Promise<NoteSummary>`; re-exported types `Tab`, `TabContent`, `PaneMeta`, `Workspace`, `QuoteGroupRef`; re-exported selectors `tabsForPane`, `activeTab`.

This task has no new automated tests of its own (this file already has zero test coverage today — it imports `../lib/api`, which reads `window.loci` at module scope and cannot be imported under this repo's `environment: 'node'` vitest config). It's verified by `npm run typecheck` at the end of Task 2, and by the full app smoke test in Task 10.

- [ ] **Step 1: Replace the pane types and helpers with imports from `workspace.ts`**

In `src/renderer/src/store/useStore.ts`, replace lines 37-137 (from `// --- Center workspace (Phase 8.7 Stage 3) ---` through the end of `persistWorkspace`) with:

```ts
import {
  EMPTY_WORKSPACE,
  activeTab,
  closeTab as pureCloseTab,
  findProjectTab,
  focusPane as pureFocusPane,
  focusTab as pureFocusTab,
  moveTab as pureMoveTab,
  openTab as pureOpenTab,
  otherPaneId,
  reflectWorkspace,
  reorderTab as pureReorderTab,
  sanitizeWorkspace,
  setTabContent as pureSetTabContent,
  tabsForPane,
  validateRestoredTabs
} from './workspace'
import type { PaneMeta, Tab, TabContent, Workspace, QuoteGroupRef } from './workspace'
import { createSequentialQueue } from '../lib/sequentialQueue'

export type { PaneMeta, Tab, TabContent, Workspace, QuoteGroupRef }
export { tabsForPane, activeTab }

/** Rewrite a project note's `items:` frontmatter line, preserving everything else. */
async function writeProjectItems(path: string, items: ProjectItem[]): Promise<void> {
  const raw = await api.readNote(path)
  const { fm, body } = parseNote(raw)
  fm.items = items
  await api.saveNote(path, `${serializeFrontMatter(fm)}\n\n${body}`)
}

function sameProjectItem(a: ProjectItem, b: ProjectItem): boolean {
  if (a.kind !== b.kind) return false
  if (a.kind === 'book' && b.kind === 'book') return a.id === b.id
  if (a.kind === 'note' && b.kind === 'note') return a.path === b.path
  if (a.kind === 'scripture' && b.kind === 'scripture') {
    return a.book === b.book && a.chapter === b.chapter
  }
  return false
}

const queuePersist = createSequentialQueue()

function persistWorkspace(
  tabs: Tab[],
  paneOrder: PaneMeta[],
  activePaneId: string | null,
  paneRatio: number
): void {
  // Don't persist picker tabs — they'd restore as blank pickers with nothing chosen yet.
  const sanitized = sanitizeWorkspace({
    tabs: tabs.filter((t) => t.kind !== 'picker'),
    paneOrder,
    activePaneId
  })
  const payload = JSON.stringify({ ...sanitized, paneRatio })
  queuePersist(() => api.setSession('workspace', payload))
}
```

Note: `sameProjectItem` and `writeProjectItems` already existed at their old location (lines 102-130 of the original file) — this hunk keeps them, just drops `paneFromContent`, `reflectPanes`, and `findProjectPane` (now imported from `workspace.ts` as `reflectWorkspace`/`findProjectTab`).

- [ ] **Step 2: Update the `Store` interface's center-workspace fields and actions**

Replace lines 197-205 (the `// --- Center workspace (Phase 8.7 Stage 3) ---` state fields) with:

```ts
  // --- Center workspace ---
  /** Every open tab across both panes; the source of truth. */
  tabs: Tab[]
  /** Up to two panes, in left-to-right order. */
  paneOrder: PaneMeta[]
  /** Focused pane — receives "open" actions and feeds the derived context fields. */
  activePaneId: string | null
  /** Split ratio between the two panes (0.2-0.8). */
  paneRatio: number
  /** The Project note open in either pane, and its source collection, or null. */
  activeProject: { path: string; items: ProjectItem[] } | null
```

Replace lines 296-307 (the `// --- Center workspace ---` action signatures) with:

```ts
  // --- Center workspace ---
  /** Create a new tab (duplicates allowed) and focus it; returns the new tab's id. */
  openTab: (content: TabContent, opts?: { paneId?: string; activate?: boolean }) => string
  /** Open a new tab beside the current one, splitting into a second pane if needed. */
  openTabInSplit: (content: TabContent) => void
  /** Move an existing tab into the other pane, creating it if needed. */
  moveTabToSplit: (tabId: string) => void
  closeTab: (tabId: string) => void
  /** Reorder a tab within its own pane. */
  reorderTab: (tabId: string, targetOrder: number) => void
  /** Move a tab to an exact pane + position in one step (drag-and-drop drop handler). */
  placeTab: (tabId: string, paneId: string, order: number) => void
  setTabContent: (tabId: string, content: TabContent) => void
  /** Reset a tab to the content picker without closing it. */
  resetTabToPicker: (tabId: string) => void
  /** Activate a specific tab (and its pane). */
  focusTab: (tabId: string) => void
  /** Focus a pane without changing which of its tabs is active. */
  focusPane: (id: string) => void
  setPaneRatio: (r: number) => void
  /** Create a note and place it into a specific tab (used by the picker). */
  createNoteInTab: (id: string, title: string, type?: NoteType) => Promise<NoteSummary>
```

- [ ] **Step 3: Update the initial state values**

Replace lines 406-409 (`panes: [],` through `activeProject: null,`) with:

```ts
    tabs: [],
    paneOrder: [],
    activePaneId: null,
    paneRatio: 0.5,
    activeProject: null,
```

- [ ] **Step 4: Rewrite `init()`'s restore logic to actually restore**

Replace lines 438-474 (from the `// Never auto-restore workspace panes on launch` comment through `void get().refreshActiveProject()`) with:

```ts
      // Restore the workspace: validate every tab's reference against what's still in the
      // library/notes list (a book or note can be deleted while the app is closed), then
      // sanitize pane/active-tab bookkeeping around whatever survives.
      let workspace: Workspace = EMPTY_WORKSPACE
      let paneRatio = 0.5
      const restoredRaw = await api.getSession('workspace')
      if (restoredRaw) {
        try {
          const parsed = JSON.parse(restoredRaw) as Partial<Workspace> & { paneRatio?: number }
          const tabs = validateRestoredTabs(
            Array.isArray(parsed.tabs) ? parsed.tabs : [],
            data.books,
            data.standaloneNotes
          )
          workspace = sanitizeWorkspace({
            tabs,
            paneOrder: Array.isArray(parsed.paneOrder) ? parsed.paneOrder : [],
            activePaneId: parsed.activePaneId ?? null
          })
          if (typeof parsed.paneRatio === 'number') {
            paneRatio = Math.min(0.8, Math.max(0.2, parsed.paneRatio))
          }
        } catch {
          /* ignore malformed value */
        }
      }
      let landingView = data.layout.activeLeftView
      if (landingView === 'reading' && workspace.tabs.length === 0) landingView = 'library'
      const layout = { ...data.layout, activeLeftView: landingView }
      const reflected = reflectWorkspace(workspace)
      set({
        appState,
        ...data,
        layout,
        tabs: workspace.tabs,
        paneOrder: workspace.paneOrder,
        activePaneId: workspace.activePaneId,
        paneRatio,
        ...reflected,
        // Seed the selected translation from config so a Bible pane can render its
        // (offline-cached) text immediately, before the translation registry has resolved.
        scriptureTranslation: data.config.scriptureTranslation || 'BSB',
        pendingPage: null,
        phase: 'welcome'
      })
      void get().refreshActiveProject()
```

- [ ] **Step 5: Rename the `openInPane` call sites to `openTab`/`openTabInSplit`**

In `openBook` (was line 543), `openBookAt` (was line 551), `createNote` (was line 582), `openNote` (was line 587), `openQuotesGroup` (was line 656): replace every `get().openInPane({ ... })` with `get().openTab({ ... })` (same argument object, just the method name changes).

In `openNoteInSplit` (was lines 591-594), replace:

```ts
    openNoteInSplit: (path) => {
      get().openInPane({ kind: 'note', notePath: path }, { split: true })
      get().saveLayout({ activeLeftView: 'reading' })
    },
```

with:

```ts
    openNoteInSplit: (path) => {
      get().openTabInSplit({ kind: 'note', notePath: path })
      get().saveLayout({ activeLeftView: 'reading' })
    },
```

- [ ] **Step 6: Update `closeBook` and `deleteNote`**

Replace `closeBook` (was lines 568-573):

```ts
    closeBook: () => {
      const pdf = get().tabs.find((t) => t.kind === 'pdf')
      if (pdf) get().closeTab(pdf.id)
      set({ quotes: [] })
      void api.setSession('lastOpenBook', '')
    },
```

In `deleteNote` (was lines 598-609), replace the pane-closing loop:

```ts
      // Close any center pane showing this note; clear the sidebar note if it matches.
      for (const p of get().panes.filter((p) => p.kind === 'note' && p.notePath === path)) {
        get().closePane(p.id)
      }
```

with:

```ts
      // Close any tab showing this note; clear the sidebar note if it matches.
      for (const t of get().tabs.filter((t) => t.kind === 'note' && t.notePath === path)) {
        get().closeTab(t.id)
      }
```

- [ ] **Step 7: Rewrite `navigateScripture` and `showScripture`**

Replace `navigateScripture` (was lines 909-930):

```ts
    // In-place navigation, like clicking a link in a browser tab: if the active tab is already
    // showing the Bible, it navigates there. Only explicit "open" actions create a new tab.
    navigateScripture: (book, chapter, highlight = []) => {
      const { activePaneId, scriptureTranslation } = get()
      const current = activePaneId ? activeTab({ tabs: get().tabs, paneOrder: get().paneOrder, activePaneId }, activePaneId) : undefined
      if (current?.kind === 'bible') {
        get().setTabContent(current.id, {
          kind: 'bible',
          book,
          chapter,
          highlight,
          translation: current.translation || scriptureTranslation
        })
      } else {
        get().openTab({ kind: 'bible', book, chapter, highlight, translation: scriptureTranslation })
      }
      get().saveLayout({ activeLeftView: 'reading' })
      void api.setSession('lastScripture', JSON.stringify({ book, chapter }))
    },
```

Replace `showScripture` (was lines 944-969), only its first branch:

```ts
    showScripture: async () => {
      const bible = get().tabs.find((t) => t.kind === 'bible')
      if (bible) {
        get().focusTab(bible.id)
        get().saveLayout({ activeLeftView: 'reading' })
      } else {
```

(the rest of the function — the passage-resolution fallback and final `if (get().scriptureTranslations.length === 0) ...` line — is unchanged).

- [ ] **Step 8: Replace the old pane action implementations with the new tab-based ones**

Replace lines 1012-1097 (from `openInPane: (content, opts) => {` through the end of `createNoteInPane`) with:

```ts
    openTab: (content, opts) => {
      const currentWs: Workspace = { tabs: get().tabs, paneOrder: get().paneOrder, activePaneId: get().activePaneId }
      const { ws: next, tabId } = pureOpenTab(currentWs, content, opts)
      set({ tabs: next.tabs, paneOrder: next.paneOrder, activePaneId: next.activePaneId, ...reflectWorkspace(next) })
      persistWorkspace(next.tabs, next.paneOrder, next.activePaneId, get().paneRatio)
      void get().refreshActiveProject()
      return tabId
    },

    openTabInSplit: (content) => {
      const { activePaneId, tabs, paneOrder } = get()
      const target =
        (activePaneId ? otherPaneId({ tabs, paneOrder, activePaneId }, activePaneId) : null) ??
        crypto.randomUUID()
      get().openTab(content, { paneId: target })
    },

    moveTabToSplit: (tabId) => {
      const { tabs, paneOrder, activePaneId } = get()
      const tab = tabs.find((t) => t.id === tabId)
      if (!tab) return
      const target = otherPaneId({ tabs, paneOrder, activePaneId }, tab.paneId) ?? crypto.randomUUID()
      const next = pureMoveTab({ tabs, paneOrder, activePaneId }, tabId, target)
      set({ tabs: next.tabs, paneOrder: next.paneOrder, activePaneId: next.activePaneId, ...reflectWorkspace(next) })
      persistWorkspace(next.tabs, next.paneOrder, next.activePaneId, get().paneRatio)
    },

    closeTab: (tabId) => {
      const { tabs, paneOrder, activePaneId } = get()
      const next = pureCloseTab({ tabs, paneOrder, activePaneId }, tabId)
      set({ tabs: next.tabs, paneOrder: next.paneOrder, activePaneId: next.activePaneId, ...reflectWorkspace(next) })
      persistWorkspace(next.tabs, next.paneOrder, next.activePaneId, get().paneRatio)
      void get().refreshActiveProject()
    },

    reorderTab: (tabId, targetOrder) => {
      const { tabs, paneOrder, activePaneId } = get()
      const next = pureReorderTab({ tabs, paneOrder, activePaneId }, tabId, targetOrder)
      set({ tabs: next.tabs })
      persistWorkspace(next.tabs, get().paneOrder, get().activePaneId, get().paneRatio)
    },

    placeTab: (tabId, paneId, order) => {
      const { tabs, paneOrder, activePaneId } = get()
      const ws0: Workspace = { tabs, paneOrder, activePaneId }
      const tab = tabs.find((t) => t.id === tabId)
      if (!tab) return
      const ws1 = tab.paneId === paneId ? ws0 : pureMoveTab(ws0, tabId, paneId)
      const next = pureReorderTab(ws1, tabId, order)
      set({ tabs: next.tabs, paneOrder: next.paneOrder, activePaneId: next.activePaneId, ...reflectWorkspace(next) })
      persistWorkspace(next.tabs, next.paneOrder, next.activePaneId, get().paneRatio)
    },

    setTabContent: (tabId, content) => {
      const { tabs, paneOrder, activePaneId } = get()
      const next = pureSetTabContent({ tabs, paneOrder, activePaneId }, tabId, content)
      set({ tabs: next.tabs, ...reflectWorkspace(next) })
      persistWorkspace(next.tabs, get().paneOrder, get().activePaneId, get().paneRatio)
      void get().refreshActiveProject()
    },

    resetTabToPicker: (tabId) => {
      get().setTabContent(tabId, { kind: 'picker' })
    },

    focusTab: (tabId) => {
      const { tabs, paneOrder, activePaneId } = get()
      const next = pureFocusTab({ tabs, paneOrder, activePaneId }, tabId)
      set({ paneOrder: next.paneOrder, activePaneId: next.activePaneId, ...reflectWorkspace(next) })
      persistWorkspace(next.tabs, next.paneOrder, next.activePaneId, get().paneRatio)
    },

    focusPane: (id) => {
      const { tabs, paneOrder, activePaneId } = get()
      if (id === activePaneId) return
      const next = pureFocusPane({ tabs, paneOrder, activePaneId }, id)
      set({ activePaneId: next.activePaneId, ...reflectWorkspace(next) })
      persistWorkspace(next.tabs, next.paneOrder, next.activePaneId, get().paneRatio)
    },

    setPaneRatio: (r) => {
      const ratio = Math.min(0.8, Math.max(0.2, r))
      set({ paneRatio: ratio })
      persistWorkspace(get().tabs, get().paneOrder, get().activePaneId, ratio)
    },

    createNoteInTab: async (id, title, type) => {
      const note = await api.createNote(title, type)
      await get().loadStandaloneNotes()
      get().setTabContent(id, { kind: 'note', notePath: note.path })
      return note
    },
```

- [ ] **Step 9: Update `refreshActiveProject`**

Replace lines 1099-1115 (`refreshActiveProject: async () => {` through its closing `},`) with:

```ts
    refreshActiveProject: async () => {
      const { tabs, standaloneNotes, activeProject } = get()
      const projectTab = findProjectTab(tabs, standaloneNotes)
      if (!projectTab?.notePath) {
        if (activeProject) set({ activeProject: null })
        return
      }
      // Already tracking this exact project — don't clobber items just added/removed locally.
      if (activeProject?.path === projectTab.notePath) return
      const raw = await api.readNote(projectTab.notePath)
      const { fm } = parseNote(raw)
      // Guard against a stale response if the workspace changed again while this was in flight.
      if (findProjectTab(get().tabs, get().standaloneNotes)?.notePath !== projectTab.notePath) {
        return
      }
      set({ activeProject: { path: projectTab.notePath, items: fm.items } })
    },
```

- [ ] **Step 10: Typecheck**

Run: `npm run typecheck`
Expected: fails at this point, listing every file that still references `Pane`/`PaneContent`/`panes`/`openInPane`/`setPaneContent`/`addPane`/`setPaneEmpty`/`closePane`/`createNoteInPane` — that's exactly `PaneFrame.tsx`, `CenterWorkspace.tsx`, `BiblePane.tsx`, `PanePicker.tsx`, `OpenInCenterButton.tsx`, `ThreePanel.tsx`, `QuotesView.tsx`, fixed in Tasks 3-9. This is expected; do not try to make it pass yet.

- [ ] **Step 11: Commit**

```bash
git add src/renderer/src/store/useStore.ts
git commit -m "Wire useStore to the tab/pane workspace model"
```

---

## Task 3: `TabStrip` component

**Files:**
- Create: `src/renderer/src/components/library/TabStrip.tsx`
- Modify: `src/renderer/src/styles/app.css`

**Interfaces:**
- Consumes: `useStore` fields/actions from Task 2 (`tabs`, `paneOrder`, `openTab`, `closeTab`, `focusTab`, `moveTabToSplit`), the re-exported `tabsForPane` selector, `Tab`/`TabContent` types.
- Produces (used by Tasks 4-5): `TabStrip` component with props `{ paneId: string; focused: boolean; dragTabId: string | null; hover: HoverTarget | null; onDragStart: (tabId: string) => void; onHover: (target: HoverTarget | null) => void; onDrop: () => void; onDragCancel: () => void }`; exported type `HoverTarget = { paneId: string; index: number }`.

No automated tests (React component with no rendering test infra in this repo, per Global Constraints) — verified by typecheck (Task 10) and manual smoke test (Task 10).

- [ ] **Step 1: Create `TabStrip.tsx`**

Create `src/renderer/src/components/library/TabStrip.tsx`:

```tsx
import { useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { FileText, BookOpen, ScrollText, Quote, FilePlus, Plus, X } from 'lucide-react'
import { useStore, tabsForPane } from '../../store/useStore'
import type { Tab } from '../../store/useStore'
import { bookByCode } from '@shared/scriptureRef'

export interface HoverTarget {
  paneId: string
  index: number
}

function tabTitle(
  tab: Tab,
  books: { id: string; title: string }[],
  notes: { path: string; title: string }[]
): { icon: React.ReactNode; label: string } {
  if (tab.kind === 'pdf') {
    return { icon: <BookOpen size={13} />, label: books.find((b) => b.id === tab.bookId)?.title ?? 'Document' }
  }
  if (tab.kind === 'note') {
    return { icon: <FileText size={13} />, label: notes.find((n) => n.path === tab.notePath)?.title ?? 'Note' }
  }
  if (tab.kind === 'bible') {
    const label = tab.book && tab.chapter != null ? `${bookByCode(tab.book)?.name ?? tab.book} ${tab.chapter}` : 'Bible'
    return { icon: <ScrollText size={13} />, label }
  }
  if (tab.kind === 'quotes') {
    const g = tab.quotesGroup
    const label = !g
      ? 'Quotes'
      : g.type === 'book'
        ? g.title
        : g.type === 'scripture'
          ? g.chapter != null
            ? `${g.name} ${g.chapter}`
            : g.name
          : g.type === 'commentary'
            ? g.displayName
            : g.type === 'author'
              ? g.author
              : g.tag
                ? `#${g.tag}`
                : 'Untagged'
    return { icon: <Quote size={13} />, label }
  }
  return { icon: <FilePlus size={13} />, label: 'New Tab' }
}

export function TabStrip({
  paneId,
  focused,
  dragTabId,
  hover,
  onDragStart,
  onHover,
  onDrop,
  onDragCancel
}: {
  paneId: string
  focused: boolean
  dragTabId: string | null
  hover: HoverTarget | null
  onDragStart: (tabId: string) => void
  onHover: (target: HoverTarget | null) => void
  onDrop: () => void
  onDragCancel: () => void
}) {
  const books = useStore((s) => s.books)
  const notes = useStore((s) => s.standaloneNotes)
  const allTabs = useStore((s) => s.tabs)
  const paneOrder = useStore((s) => s.paneOrder)
  const openTab = useStore((s) => s.openTab)
  const closeTab = useStore((s) => s.closeTab)
  const focusTab = useStore((s) => s.focusTab)
  const moveTabToSplit = useStore((s) => s.moveTabToSplit)

  const [menuTabId, setMenuTabId] = useState<string | null>(null)

  const tabs = tabsForPane(allTabs, paneId)
  const activeTabId = paneOrder.find((p) => p.id === paneId)?.activeTabId ?? null

  const handlePointerDown = (e: ReactPointerEvent, tabId: string): void => {
    if (e.button !== 0) return
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    onDragStart(tabId)
  }

  const handlePointerMove = (e: ReactPointerEvent): void => {
    if (!dragTabId) return
    const el = document.elementFromPoint(e.clientX, e.clientY)
    const paneEl = el?.closest<HTMLElement>('[data-pane-id]')
    if (!paneEl) {
      onHover(null)
      return
    }
    const targetPaneId = paneEl.dataset.paneId!
    const tabEls = Array.from(paneEl.querySelectorAll<HTMLElement>('[data-tab-id]'))
    let index = tabEls.length
    for (let i = 0; i < tabEls.length; i++) {
      const rect = tabEls[i].getBoundingClientRect()
      if (e.clientX < rect.left + rect.width / 2) {
        index = i
        break
      }
    }
    onHover({ paneId: targetPaneId, index })
  }

  const handlePointerUp = (e: ReactPointerEvent): void => {
    if (!dragTabId) return
    ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
    onDrop()
  }

  return (
    <div className={`tab-strip${focused ? ' pane-focused' : ''}`} data-pane-id={paneId}>
      {tabs.map((tab, i) => {
        const { icon, label } = tabTitle(tab, books, notes)
        const dropBefore = hover?.paneId === paneId && hover.index === i && dragTabId !== tab.id
        return (
          <div key={tab.id} className="tab-slot">
            {dropBefore && <div className="tab-drop-indicator" />}
            <div
              className={`tab${tab.id === activeTabId ? ' active' : ''}${tab.id === dragTabId ? ' dragging' : ''}`}
              data-tab-id={tab.id}
              onPointerDown={(e) => handlePointerDown(e, tab.id)}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={onDragCancel}
              onClick={() => focusTab(tab.id)}
              onAuxClick={(e) => {
                if (e.button === 1) closeTab(tab.id)
              }}
              onContextMenu={(e) => {
                e.preventDefault()
                setMenuTabId(tab.id)
              }}
              title={label}
            >
              {icon}
              <span className="tab-label">{label}</span>
              <button
                className="tab-close"
                title="Close tab"
                onClick={(e) => {
                  e.stopPropagation()
                  closeTab(tab.id)
                }}
              >
                <X size={12} />
              </button>
            </div>
            {menuTabId === tab.id && (
              <div className="tab-menu" onMouseLeave={() => setMenuTabId(null)}>
                <button
                  className="tab-menu-item"
                  onClick={() => {
                    moveTabToSplit(tab.id)
                    setMenuTabId(null)
                  }}
                >
                  Open in split pane
                </button>
              </div>
            )}
          </div>
        )
      })}
      {hover?.paneId === paneId && hover.index === tabs.length && dragTabId && (
        <div className="tab-drop-indicator" />
      )}
      <button className="tab-new" title="New tab" onClick={() => openTab({ kind: 'picker' }, { paneId })}>
        <Plus size={14} />
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Add the tab strip CSS**

In `src/renderer/src/styles/app.css`, add after the `.center-workspace` rule block (after line 199, before `.ws-pane` at line 200):

```css
.tab-strip {
  display: flex;
  align-items: stretch;
  overflow-x: auto;
  overflow-y: hidden;
  border-bottom: 1px solid var(--border);
  background: var(--panel);
  flex: 0 0 auto;
}
.center-workspace .ws-pane:not(:only-child) .tab-strip.pane-focused {
  box-shadow: inset 0 2px 0 var(--accent);
}
.tab-slot {
  display: flex;
  align-items: stretch;
  position: relative;
  flex: 1 1 0;
  min-width: 84px;
  max-width: 200px;
}
.tab {
  display: flex;
  align-items: center;
  gap: 5px;
  flex: 1;
  min-width: 0;
  padding: 6px 6px 6px 9px;
  border-right: 1px solid var(--border);
  color: var(--muted);
  cursor: pointer;
  user-select: none;
  touch-action: none;
}
.tab.active {
  color: var(--text);
  background: var(--base);
}
.tab.dragging {
  opacity: 0.4;
}
.tab-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-ui);
  font-size: 12px;
}
.tab-close {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  color: inherit;
  border-radius: 4px;
  padding: 2px;
  cursor: pointer;
}
.tab-close:hover {
  background: var(--accent-12);
  color: var(--accent);
}
.tab-drop-indicator {
  position: absolute;
  top: 4px;
  bottom: 4px;
  left: -1px;
  width: 2px;
  background: var(--accent);
  z-index: 1;
}
.tab-new {
  flex: 0 0 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  border-left: 1px solid var(--border);
  color: var(--muted);
  cursor: pointer;
}
.tab-new:hover {
  color: var(--accent);
  background: var(--accent-12);
}
.tab-menu {
  position: absolute;
  top: 100%;
  left: 4px;
  z-index: 20;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 6px;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.18);
  padding: 4px;
  min-width: 150px;
}
.tab-menu-item {
  display: block;
  width: 100%;
  text-align: left;
  background: none;
  border: none;
  padding: 6px 8px;
  border-radius: 4px;
  color: var(--text);
  font-family: var(--font-ui);
  font-size: 12px;
  cursor: pointer;
}
.tab-menu-item:hover {
  background: var(--accent-12);
  color: var(--accent);
}
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/library/TabStrip.tsx src/renderer/src/styles/app.css
git commit -m "Add TabStrip component"
```

---

## Task 4: Restructure `PaneFrame`

**Files:**
- Modify: `src/renderer/src/components/library/PaneFrame.tsx`
- Modify: `src/renderer/src/styles/app.css`

**Interfaces:**
- Consumes: `TabStrip`/`HoverTarget` from Task 3; `PaneMeta`/`Tab` types and `resetTabToPicker`/`closeTab` actions from Task 2.
- Produces (used by Task 5): `PaneFrame` component with props `{ pane: PaneMeta; focused: boolean; dragTabId: string | null; hover: HoverTarget | null; onDragStart: (tabId: string) => void; onHover: (target: HoverTarget | null) => void; onDrop: () => void; onDragCancel: () => void }`.

- [ ] **Step 1: Rewrite `PaneFrame.tsx`**

Replace the entire contents of `src/renderer/src/components/library/PaneFrame.tsx`:

```tsx
import { useState } from 'react'
import { useStore } from '../../store/useStore'
import type { PaneMeta } from '../../store/useStore'
import { RichNoteEditor } from './RichNoteEditor'
import { PdfReader } from './PdfReader'
import { BiblePane } from './BiblePane'
import { PanePicker } from './PanePicker'
import { QuoteGroupPane } from './QuoteGroupPane'
import { TabStrip } from './TabStrip'
import type { HoverTarget } from './TabStrip'

/** Read whichever project-item drag payload is present on a drop event, if any. */
function projectItemFromDrag(e: React.DragEvent): { kind: 'book' | 'note' | 'scripture'; value: string } | null {
  const bookId = e.dataTransfer.getData('application/x-loci-book')
  if (bookId) return { kind: 'book', value: bookId }
  const notePath = e.dataTransfer.getData('application/x-loci-note')
  if (notePath) return { kind: 'note', value: notePath }
  const scripture = e.dataTransfer.getData('application/x-loci-scripture')
  if (scripture) return { kind: 'scripture', value: scripture }
  return null
}

/** One center-workspace pane: a tab strip over the active tab's reused body. */
export function PaneFrame({
  pane,
  focused,
  dragTabId,
  hover,
  onDragStart,
  onHover,
  onDrop,
  onDragCancel
}: {
  pane: PaneMeta
  focused: boolean
  dragTabId: string | null
  hover: HoverTarget | null
  onDragStart: (tabId: string) => void
  onHover: (target: HoverTarget | null) => void
  onDrop: () => void
  onDragCancel: () => void
}) {
  const tabs = useStore((s) => s.tabs)
  const activeProject = useStore((s) => s.activeProject)
  const addProjectItem = useStore((s) => s.addProjectItem)
  const resetTabToPicker = useStore((s) => s.resetTabToPicker)
  const closeTab = useStore((s) => s.closeTab)
  const [dragOver, setDragOver] = useState(false)

  const tab = tabs.find((t) => t.id === pane.activeTabId)

  // If this pane's sibling holds the active Project note, this pane is the sources surface —
  // its picker tabs offer only the project's items instead of the whole library.
  const projectTab = tabs.find((t) => t.kind === 'note' && t.notePath === activeProject?.path)
  const isProjectSibling = !!projectTab && projectTab.paneId !== pane.id
  // Both the sources surface and the project note's own pane accept a dropped reference-panel
  // item, adding it to the project's collection.
  const isProjectDropTarget = isProjectSibling || (!!activeProject && pane.id === projectTab?.paneId)

  const onDropItem = (e: React.DragEvent): void => {
    if (!isProjectDropTarget || !activeProject) return
    e.preventDefault()
    setDragOver(false)
    const dragged = projectItemFromDrag(e)
    if (!dragged) return
    if (dragged.kind === 'book') void addProjectItem({ kind: 'book', id: dragged.value })
    else if (dragged.kind === 'note') void addProjectItem({ kind: 'note', path: dragged.value })
    else {
      const [book, chapterStr] = dragged.value.split(':')
      if (book && chapterStr) void addProjectItem({ kind: 'scripture', book, chapter: Number(chapterStr) })
    }
  }

  let body: React.ReactNode = (
    <PanePicker
      heading="Open a note, a book, or the Bible"
      restrictToProject={isProjectSibling ? activeProject?.items : undefined}
    />
  )

  if (tab?.kind === 'pdf' && tab.bookId) {
    body = <PdfReader key={tab.id} bookId={tab.bookId} embedded />
  } else if (tab?.kind === 'note' && tab.notePath) {
    body = <RichNoteEditor key={tab.id} path={tab.notePath} />
  } else if (tab?.kind === 'quotes' && tab.quotesGroup) {
    body = <QuoteGroupPane key={tab.id} group={tab.quotesGroup} />
  } else if (tab?.kind === 'bible' && tab.book && tab.chapter != null) {
    body = (
      <BiblePane
        key={tab.id}
        tab={tab}
        onClose={() => closeTab(tab.id)}
        onReplace={() => resetTabToPicker(tab.id)}
      />
    )
  } else if (tab?.kind === 'picker') {
    body = (
      <PanePicker
        key={tab.id}
        tabId={tab.id}
        restrictToProject={isProjectSibling ? activeProject?.items : undefined}
      />
    )
  }

  return (
    <div
      className={`pane-frame${dragOver ? ' drag-over' : ''}`}
      onDragOver={(e) => {
        if (!isProjectDropTarget) return
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDropItem}
    >
      <TabStrip
        paneId={pane.id}
        focused={focused}
        dragTabId={dragTabId}
        hover={hover}
        onDragStart={onDragStart}
        onHover={onHover}
        onDrop={onDrop}
        onDragCancel={onDragCancel}
      />
      <div className="pane-body">{body}</div>
    </div>
  )
}
```

Note: the generic "Change content" (replace) header button from the old `PaneFrame` is intentionally dropped — with tabs, replacing content is just opening a new tab (the "+" button) and closing the old one, so a separate replace affordance is redundant. `BiblePane`'s own "Change content" button (in its reader chrome, unrelated to `PaneFrame`'s old header) is kept via the `onReplace` prop. The old PDF-specific "Back to Library" shortcut is also dropped — closing a book tab via its `×` no longer needs to double as page navigation; "Library" in the left rail does that.

- [ ] **Step 2: Remove now-dead CSS and add the pane-focus rule**

In `src/renderer/src/styles/app.css`, delete the `.pane-head` through `.pane-title` rules (originally lines 216-237: `.pane-head { ... }` and `.pane-title { ... }`) — no longer rendered.

Replace the accent rules (originally lines 270-277):

```css
/* Accent the focused pane only when two panes are open. */
.center-workspace .ws-pane:not(:only-child) .pane-frame.active .pane-head {
  box-shadow: inset 0 2px 0 var(--accent);
}
/* Bible panes have no pane-head, so accent the frame itself. */
.center-workspace .ws-pane:not(:only-child) .pane-frame.headerless.active {
  box-shadow: inset 0 2px 0 var(--accent);
}
```

with nothing — this is now handled by the `.tab-strip.pane-focused` rule added in Task 3, Step 2, which covers every pane kind uniformly.

Delete the `.ws-add` rule block (originally lines 279-294) — the "open a second pane" button no longer exists (splitting is drag/right-click only, per the design).

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/library/PaneFrame.tsx src/renderer/src/styles/app.css
git commit -m "Restructure PaneFrame around tabs"
```

---

## Task 5: Restructure `CenterWorkspace`

**Files:**
- Modify: `src/renderer/src/components/library/CenterWorkspace.tsx`

**Interfaces:**
- Consumes: `PaneFrame`/`HoverTarget` from Task 4; `paneOrder`/`placeTab`/`focusPane`/`setPaneRatio` from Task 2.
- Produces: nothing new consumed elsewhere — `CenterWorkspace` is the top-level workspace component rendered by `ThreePanel.tsx` (unchanged call site, still `<CenterWorkspace />`).

- [ ] **Step 1: Rewrite `CenterWorkspace.tsx`**

Replace the entire contents of `src/renderer/src/components/library/CenterWorkspace.tsx`:

```tsx
import { Fragment, useRef, useState } from 'react'
import { ChevronLeft } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { Divider } from '../Divider'
import { PaneFrame } from './PaneFrame'
import { PanePicker } from './PanePicker'
import type { HoverTarget } from './TabStrip'

interface DragState {
  tabId: string
}

/** The center workspace: up to two panes of tabs, with a draggable divider between them. */
export function CenterWorkspace() {
  const paneOrder = useStore((s) => s.paneOrder)
  const activePaneId = useStore((s) => s.activePaneId)
  const paneRatio = useStore((s) => s.paneRatio)
  const focusPane = useStore((s) => s.focusPane)
  const setPaneRatio = useStore((s) => s.setPaneRatio)
  const placeTab = useStore((s) => s.placeTab)
  const cameFromSearch = useStore((s) => s.cameFromSearch)
  const returnToSearch = useStore((s) => s.returnToSearch)
  const ref = useRef<HTMLDivElement>(null)

  const [drag, setDrag] = useState<DragState | null>(null)
  const [hover, setHover] = useState<HoverTarget | null>(null)

  const onDrag = (dx: number): void => {
    const w = ref.current?.clientWidth ?? 1
    setPaneRatio(paneRatio + dx / w)
  }

  const endDrag = (): void => {
    setDrag(null)
    setHover(null)
  }

  const dropTab = (): void => {
    if (drag && hover) placeTab(drag.tabId, hover.paneId, hover.index)
    endDrag()
  }

  // A search hit opened this pane — offer a way back to the results list without closing it.
  const backBar = cameFromSearch && (
    <div className="ws-search-return">
      <button className="pane-back" onClick={returnToSearch}>
        <ChevronLeft size={13} />
        Back to search results
      </button>
    </div>
  )

  if (paneOrder.length === 0) {
    return (
      <div className="center-workspace-wrap">
        {backBar}
        <div className="center-workspace">
          <PanePicker heading="Open a note, a book, or the Bible" />
        </div>
      </div>
    )
  }

  return (
    <div className="center-workspace-wrap">
      {backBar}
      <div className="center-workspace" ref={ref}>
        {paneOrder.map((pane, i) => (
          <Fragment key={pane.id}>
            {i > 0 && <Divider onDrag={onDrag} onDragEnd={() => undefined} />}
            <div
              className="ws-pane"
              style={paneOrder.length === 2 ? { flex: `${i === 0 ? paneRatio : 1 - paneRatio} 1 0%` } : { flex: 1 }}
              onMouseDownCapture={() => focusPane(pane.id)}
            >
              <PaneFrame
                pane={pane}
                focused={pane.id === activePaneId}
                dragTabId={drag?.tabId ?? null}
                hover={hover}
                onDragStart={(tabId) => setDrag({ tabId })}
                onHover={setHover}
                onDrop={dropTab}
                onDragCancel={endDrag}
              />
            </div>
          </Fragment>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/components/library/CenterWorkspace.tsx
git commit -m "Restructure CenterWorkspace to drive tab drag-and-drop"
```

---

## Task 6: Rewire `PanePicker` to fill tabs

**Files:**
- Modify: `src/renderer/src/components/library/PanePicker.tsx`

**Interfaces:**
- Consumes: `setTabContent`/`createNoteInTab`/`openTab` from Task 2.
- Produces: `PanePicker` now takes `tabId?: string` instead of `paneId?: string` (used by `PaneFrame.tsx`, Task 4, and `CenterWorkspace.tsx`, Task 5 — both already updated to pass `tabId`/no id).

- [ ] **Step 1: Update the type import**

In `src/renderer/src/components/library/PanePicker.tsx`, replace:

```ts
import type { PaneContent } from '../../store/useStore'
```

with:

```ts
import type { TabContent } from '../../store/useStore'
```

- [ ] **Step 2: Rename the `paneId` prop to `tabId`**

Replace:

```ts
export function PanePicker({
  paneId,
  heading,
  restrictToProject
}: {
  paneId?: string
  heading?: string
  restrictToProject?: ProjectItem[]
}) {
```

with:

```ts
export function PanePicker({
  tabId,
  heading,
  restrictToProject
}: {
  tabId?: string
  heading?: string
  restrictToProject?: ProjectItem[]
}) {
```

- [ ] **Step 3: Swap the store hooks**

Replace:

```ts
  const setPaneContent = useStore((s) => s.setPaneContent)
  const createNoteInPane = useStore((s) => s.createNoteInPane)
  const openInPane = useStore((s) => s.openInPane)
```

with:

```ts
  const setTabContent = useStore((s) => s.setTabContent)
  const createNoteInTab = useStore((s) => s.createNoteInTab)
  const openTab = useStore((s) => s.openTab)
```

- [ ] **Step 4: Update `place`, `newNote`, and `newProject`**

Replace:

```ts
  // Fill the target pane, or open into a fresh pane when there's no target.
  const place = (content: PaneContent): void => {
    if (paneId) setPaneContent(paneId, content)
    else openInPane(content)
  }
```

with:

```ts
  // Fill the target tab, or open a fresh tab when there's no target.
  const place = (content: TabContent): void => {
    if (tabId) setTabContent(tabId, content)
    else openTab(content)
  }
```

Replace:

```ts
  const newNote = (): void => {
    if (!query) return
    if (paneId) {
      void createNoteInPane(paneId, query).then((note) => {
        if (restrictToProject) void addProjectItem({ kind: 'note', path: note.path })
      })
    } else {
      void createNote(query)
    }
  }
  const newProject = (): void => {
    if (!query) return
    if (paneId) void createNoteInPane(paneId, query, 'project')
    else void createNote(query, 'project')
  }
```

with:

```ts
  const newNote = (): void => {
    if (!query) return
    if (tabId) {
      void createNoteInTab(tabId, query).then((note) => {
        if (restrictToProject) void addProjectItem({ kind: 'note', path: note.path })
      })
    } else {
      void createNote(query)
    }
  }
  const newProject = (): void => {
    if (!query) return
    if (tabId) void createNoteInTab(tabId, query, 'project')
    else void createNote(query, 'project')
  }
```

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/library/PanePicker.tsx
git commit -m "Rewire PanePicker to fill tabs instead of panes"
```

---

## Task 7: Rewire `BiblePane` to take a tab

**Files:**
- Modify: `src/renderer/src/components/library/BiblePane.tsx`

**Interfaces:**
- Consumes: `Tab` type, `setTabContent`/`openTabInSplit` from Task 2.
- Produces: `BiblePane` now takes a `tab: Tab` prop instead of `pane: Pane` (matches `PaneFrame.tsx`'s call site from Task 4).

- [ ] **Step 1: Update the type import**

Replace:

```ts
import type { Pane } from '../../store/useStore'
```

with:

```ts
import type { Tab } from '../../store/useStore'
```

- [ ] **Step 2: Rename the `pane` prop to `tab`**

Replace:

```ts
export function BiblePane({
  pane,
  onClose,
  onReplace
}: {
  pane: Pane
  onClose?: () => void
  onReplace?: () => void
}) {
```

with:

```ts
export function BiblePane({
  tab,
  onClose,
  onReplace
}: {
  tab: Tab
  onClose?: () => void
  onReplace?: () => void
}) {
```

- [ ] **Step 3: Swap the store hooks and derived fields**

Replace:

```ts
  const translations = useStore((s) => s.scriptureTranslations)
  const defaultTranslation = useStore((s) => s.scriptureTranslation)
  const loadScripture = useStore((s) => s.loadScripture)
  const setPaneContent = useStore((s) => s.setPaneContent)
  const openInPane = useStore((s) => s.openInPane)
  const setScriptureTranslation = useStore((s) => s.setScriptureTranslation)
  const verseClicked = useStore((s) => s.verseClicked)

  const translation = pane.translation || defaultTranslation
  const book = pane.book ?? 'JHN'
  const chapter = pane.chapter ?? 1
  const highlight = pane.highlight ?? []
```

with:

```ts
  const translations = useStore((s) => s.scriptureTranslations)
  const defaultTranslation = useStore((s) => s.scriptureTranslation)
  const loadScripture = useStore((s) => s.loadScripture)
  const setTabContent = useStore((s) => s.setTabContent)
  const openTabInSplit = useStore((s) => s.openTabInSplit)
  const setScriptureTranslation = useStore((s) => s.setScriptureTranslation)
  const verseClicked = useStore((s) => s.verseClicked)

  const translation = tab.translation || defaultTranslation
  const book = tab.book ?? 'JHN'
  const chapter = tab.chapter ?? 1
  const highlight = tab.highlight ?? []
```

- [ ] **Step 4: Update `navigate`, `pickTranslation`, and `openCompare`**

Replace:

```ts
  const navigate = (b: string, c: number, hl: number[] = []): void => {
    setPaneContent(pane.id, { kind: 'bible', book: b, chapter: c, highlight: hl, translation })
    void api.setSession('lastScripture', JSON.stringify({ book: b, chapter: c }))
  }

  const pickTranslation = (id: string): void => {
    setPaneContent(pane.id, { kind: 'bible', book, chapter, highlight, translation: id })
    setScriptureTranslation(id)
  }

  // "Compare" = a second Bible pane beside this one, defaulted to another translation.
  const openCompare = (): void => {
    const other = translations.find((t) => t.id !== translation)?.id ?? translation
    openInPane({ kind: 'bible', book, chapter, highlight, translation: other }, { split: true })
  }
```

with:

```ts
  const navigate = (b: string, c: number, hl: number[] = []): void => {
    setTabContent(tab.id, { kind: 'bible', book: b, chapter: c, highlight: hl, translation })
    void api.setSession('lastScripture', JSON.stringify({ book: b, chapter: c }))
  }

  const pickTranslation = (id: string): void => {
    setTabContent(tab.id, { kind: 'bible', book, chapter, highlight, translation: id })
    setScriptureTranslation(id)
  }

  // "Compare" = a second Bible tab beside this one, defaulted to another translation.
  const openCompare = (): void => {
    const other = translations.find((t) => t.id !== translation)?.id ?? translation
    openTabInSplit({ kind: 'bible', book, chapter, highlight, translation: other })
  }
```

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/library/BiblePane.tsx
git commit -m "Rewire BiblePane to take a tab instead of a pane"
```

---

## Task 8: Simplify `OpenInCenterButton`

**Files:**
- Modify: `src/renderer/src/components/library/OpenInCenterButton.tsx`
- Modify: `src/renderer/src/styles/app.css`

**Interfaces:**
- Consumes: `openTab`/`openTabInSplit` from Task 2, `TabContent` type.
- Produces: `OpenInCenterButton` keeps its existing `{ content: TabContent | null; onDone?: () => void }` props (just the `content` type changes from `PaneContent` to `TabContent`) — no call-site changes needed elsewhere.

The old "replace which pane?" menu existed because panes were a scarce, capped resource that sometimes had to be overwritten. Tabs remove that constraint — opening always adds a tab — so this component collapses from a stateful menu to two plain buttons: open as a new tab (default), or open in the split pane.

- [ ] **Step 1: Rewrite `OpenInCenterButton.tsx`**

Replace the entire contents of `src/renderer/src/components/library/OpenInCenterButton.tsx`:

```tsx
import { ArrowLeftToLine, Columns2 } from 'lucide-react'
import { useStore } from '../../store/useStore'
import type { TabContent } from '../../store/useStore'

/**
 * Promote a reference (PDF/Bible) from the right panel into the center workspace as a new tab,
 * then close the reference panel so the same thing isn't shown twice.
 */
export function OpenInCenterButton({
  content,
  onDone
}: {
  content: TabContent | null
  onDone?: () => void
}) {
  const openTab = useStore((s) => s.openTab)
  const openTabInSplit = useStore((s) => s.openTabInSplit)
  const saveLayout = useStore((s) => s.saveLayout)

  // Show the center workspace and collapse the reference panel (it's now in the center).
  const finish = (): void => {
    saveLayout({ activeLeftView: 'reading', notesCollapsed: true })
    onDone?.()
  }

  return (
    <div className="ref-promote-wrap">
      <button
        className="ref-promote"
        disabled={!content}
        onClick={() => {
          if (!content) return
          openTab(content)
          finish()
        }}
        title="Open in the center workspace"
      >
        <ArrowLeftToLine size={13} /> Open in center
      </button>
      <button
        className="ref-promote-split"
        disabled={!content}
        onClick={() => {
          if (!content) return
          openTabInSplit(content)
          finish()
        }}
        title="Open in a split pane"
      >
        <Columns2 size={13} />
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Update the CSS**

In `src/renderer/src/styles/app.css`, replace:

```css
.ref-promote-wrap {
  position: relative;
  flex: 0 0 auto;
}
```

with:

```css
.ref-promote-wrap {
  position: relative;
  display: inline-flex;
  gap: 4px;
  flex: 0 0 auto;
}
.ref-promote-split {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: 1px solid var(--border-strong);
  color: var(--muted);
  border-radius: 6px;
  padding: 6px 8px;
  cursor: pointer;
}
.ref-promote-split:hover:not(:disabled) {
  color: var(--accent);
  border-color: var(--accent);
}
.ref-promote-split:disabled {
  opacity: 0.5;
  cursor: default;
}
```

Delete the now-dead `.ref-promote-menu`, `.rpm-label`, `.rpm-item`, and `.rpm-item:hover` rules (the "Replace which pane?" menu they styled no longer exists).

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/library/OpenInCenterButton.tsx src/renderer/src/styles/app.css
git commit -m "Simplify OpenInCenterButton now that opening always creates a tab"
```

---

## Task 9: Fix remaining direct pane readers

**Files:**
- Modify: `src/renderer/src/components/ThreePanel.tsx`
- Modify: `src/renderer/src/components/library/QuotesView.tsx`

**Interfaces:**
- Consumes: `tabs`/`paneOrder`/`activePaneId` from Task 2.
- Produces: nothing new — these are leaf consumers.

These are the only two files (besides the workspace component tree already covered) that read `panes`/`activePaneId` directly instead of via the derived legacy fields.

- [ ] **Step 1: Fix `ThreePanel.tsx`'s rail-highlight logic**

Replace:

```ts
  const panes = useStore((s) => s.panes)
  const activePaneId = useStore((s) => s.activePaneId)
```

with:

```ts
  const tabs = useStore((s) => s.tabs)
  const paneOrder = useStore((s) => s.paneOrder)
  const activePaneId = useStore((s) => s.activePaneId)
```

Replace:

```ts
  // In the workspace, light up the rail item matching the focused pane (Bible→Scripture,
  // note→Notes); books have no rail entry, so they leave the rail unlit.
  const focusedPane = panes.find((p) => p.id === activePaneId)
  const railActiveId =
    layout.activeLeftView === 'reading' && focusedPane
      ? focusedPane.kind === 'bible'
        ? 'scripture'
        : focusedPane.kind === 'note'
          ? 'notes'
          : layout.activeLeftView
      : layout.activeLeftView
```

with:

```ts
  // In the workspace, light up the rail item matching the focused pane's active tab
  // (Bible→Scripture, note→Notes); books have no rail entry, so they leave the rail unlit.
  const focusedTabId = paneOrder.find((p) => p.id === activePaneId)?.activeTabId
  const focusedTab = tabs.find((t) => t.id === focusedTabId)
  const railActiveId =
    layout.activeLeftView === 'reading' && focusedTab
      ? focusedTab.kind === 'bible'
        ? 'scripture'
        : focusedTab.kind === 'note'
          ? 'notes'
          : layout.activeLeftView
      : layout.activeLeftView
```

- [ ] **Step 2: Fix `QuotesView.tsx`'s active-group highlight**

Replace:

```ts
  const panes = useStore((s) => s.panes)
```

with:

```ts
  const tabs = useStore((s) => s.tabs)
```

Replace:

```ts
  // Light up the row whose group is open in a pane.
  const activePane = panes.find((p) => p.kind === 'quotes')?.quotesGroup
  const isActive = (ref: QuoteGroupRef): boolean => {
    if (!activePane || activePane.type !== ref.type) return false
    if (activePane.type === 'book' && ref.type === 'book') return activePane.bookId === ref.bookId
    if (activePane.type === 'scripture' && ref.type === 'scripture') {
      return activePane.book === ref.book && activePane.chapter === ref.chapter
    }
    if (activePane.type === 'commentary' && ref.type === 'commentary') {
      return activePane.sourceId === ref.sourceId
    }
    if (activePane.type === 'author' && ref.type === 'author') return activePane.author === ref.author
    if (activePane.type === 'tag' && ref.type === 'tag') return activePane.tag === ref.tag
    return false
  }
```

with:

```ts
  // Light up the row whose group is open in a tab.
  const activeGroup = tabs.find((t) => t.kind === 'quotes')?.quotesGroup
  const isActive = (ref: QuoteGroupRef): boolean => {
    if (!activeGroup || activeGroup.type !== ref.type) return false
    if (activeGroup.type === 'book' && ref.type === 'book') return activeGroup.bookId === ref.bookId
    if (activeGroup.type === 'scripture' && ref.type === 'scripture') {
      return activeGroup.book === ref.book && activeGroup.chapter === ref.chapter
    }
    if (activeGroup.type === 'commentary' && ref.type === 'commentary') {
      return activeGroup.sourceId === ref.sourceId
    }
    if (activeGroup.type === 'author' && ref.type === 'author') return activeGroup.author === ref.author
    if (activeGroup.type === 'tag' && ref.type === 'tag') return activeGroup.tag === ref.tag
    return false
  }
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/ThreePanel.tsx src/renderer/src/components/library/QuotesView.tsx
git commit -m "Fix remaining pane readers to resolve through tabs"
```

---

## Task 10: Full verification pass

**Files:** none (verification only).

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: PASS — every test in `src/**/*.test.ts`, including the new `workspace.test.ts` and `sequentialQueue.test.ts` from Task 1.

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS, with zero remaining references to `Pane`, `PaneKind`, `PaneContent`, `openInPane`, `setPaneContent`, `addPane`, `setPaneEmpty`, `closePane`, or `createNoteInPane` anywhere in `src/`. If anything still fails, it means a call site was missed in Tasks 2-9 — fix it there rather than patching around it here.

- [ ] **Step 3: Manual smoke test**

This is an Electron desktop app, not a browser-previewable web app, so verify by running it directly:

Run: `npm run dev`

Walk through this checklist in the running app:

1. Open a book from the Library — it opens as a single tab in a single pane.
2. Click "+" on the tab strip — a picker tab opens; search for and pick a note — the *same tab* turns into that note (no second tab was created).
3. Open a second, different book from the Library — it opens as a *new* tab in the same pane (not a split).
4. Right-click a tab → "Open in split pane" — a second pane appears with that tab; the first pane keeps its remaining tab(s).
5. Drag a tab left/right within its own strip — it reorders live.
6. Drag a tab from one pane's strip onto the other pane's strip — it moves there.
7. Close every tab in one pane — that pane collapses and the remaining pane goes full width.
8. Open the Bible from the left rail, click a cross-reference inside an open note — it opens a *new* Bible tab (not in-place, since the active tab was the note). Then, with that Bible tab active, click a chapter link in its own nav drawer — it navigates *in place* (same tab, no new one).
9. With a Project note open in one pane and a picker tab open in the other, confirm the picker is scoped to "Add a source" for that project (not the whole library).
10. Quit and relaunch the app (`npm run dev` again after stopping it) — the same tabs, pane split, and active tab come back. Then close a couple of tabs, quit, and relaunch again — confirm the *closed* tabs do **not** reappear (this is the specific bug the write-queue in Task 1/2 fixes).

If any step fails, return to the relevant task above and fix it — do not report this plan as complete until all ten checklist items pass.

- [ ] **Step 4: Final commit (if Step 3 required fixes)**

```bash
git add -A
git commit -m "Fix issues found during tabbed-panes smoke test"
```

(Skip this step if Step 3 required no changes.)
