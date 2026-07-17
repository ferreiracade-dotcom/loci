# Tabbed Panes — Design Spec

Date: 2026-07-17
Status: Approved for planning

## Summary

Replace Loci's current dual-pane workspace (each pane holds exactly one piece
of content, capped at 2 panes) with a Chrome-style tabbed workspace: a single
pane holds any number of tabs; a pane can split into two side-by-side panes
(left/right only); tabs can be reordered within a pane or dragged into the
other pane; opening something new always creates a new tab in the active pane
by default, with a right-click option to send it to the other pane instead.

## Goals

- Multiple items open at once as tabs, not just via the 2-pane cap.
- Tabs draggable for in-pane reordering and for moving to the other pane.
- Splitting stays capped at 2 panes, left/right only, with a draggable
  divider (unchanged from today).
- New tab, empty state offers a searchable picker (reusing the existing
  content picker) that turns into real content once something is chosen.
- Session (tabs, pane split, active tab) persists and restores correctly
  across app restarts — fixing the specific bug that caused a prior,
  deliberate "don't restore" workaround.

## Non-goals

- Top/bottom split (left/right only).
- More than 2 panes.
- The right-hand commentary/reference sidebar is untouched — this feature
  only concerns the center workspace.
- EPUB support (doesn't exist in the codebase; out of scope).
- Explicit "unsaved changes" warning on tab close — investigated and found
  unnecessary (see "Close behavior" below).

## Current state (for context)

Today, `CenterWorkspace.tsx` renders 0–2 `Pane`s from `useStore`, each a
single content slot (`Pane { id, kind, ...contentFields }`), split via a
`Divider`-controlled `paneRatio`. `addPane()` refuses beyond 2. `openInPane`
is the single entry point for placing content: it fills an empty pane,
appends a second pane when `split: true`, or replaces the focused
(or non-focused, if full) pane otherwise. `PaneFrame.tsx` dispatches on
`pane.kind` (`note` / `bible` / `pdf` / `quotes` / `empty`) to the matching
reader component. `reflectPanes()` derives legacy scalar fields
(`activeNotePath`, `openBookId`, `scripturePassage`, ...) from the focused
pane's content, for several consumers (QuotesPanel, BacklinksPanel,
ReferenceBiblePanel, etc.) that read those directly instead of `panes`.

Session persistence already exists via `session_state.workspace` (JSON blob,
written by `persistWorkspace` after every pane mutation), but panes are
deliberately **not** restored on launch — a workaround added after restore
kept reopening PDFs/Bible chapters the user had already closed. Root cause
(confirmed during design): `persistWorkspace` fires
`void api.setSession(...)` without sequencing, so a slower in-flight write
can complete after a newer one and silently overwrite good state with stale
state.

Two drag-and-drop idioms already exist in the codebase: native HTML5 DnD
with custom `application/x-loci-*` MIME types (for dragging content items
onto drop targets), and Pointer Events with `setPointerCapture` (used by
`Divider.tsx` for smooth continuous drags like resizing).

## Data model

Replaces `PaneKind` / `Pane` / `PaneContent` in `useStore.ts`.

```ts
export type TabKind = 'note' | 'bible' | 'pdf' | 'quotes' | 'picker'

export interface Tab {
  id: string
  paneId: string
  order: number
  kind: TabKind
  // content fields (present depending on kind), same shape as today's Pane fields:
  notePath?: string
  bookId?: string
  book?: string
  chapter?: number
  highlight?: number[]
  translation?: string
  quotesGroup?: QuoteGroupRef
}

export interface PaneMeta {
  id: string
  activeTabId: string | null
}

// store fields
tabs: Tab[]
paneOrder: PaneMeta[]   // length 1 or 2, left-to-right
activePaneId: string | null
paneRatio: number        // unchanged: 0.2–0.8, clamped
```

`kind: 'empty'` is gone. A tab always holds real content, including
`'picker'` (see "New tab" below) — a pane with zero tabs (first-ever
launch, or the instant before an empty pane collapses) falls back to
rendering `PanePicker` directly rather than via a tab.

### Derived selectors

- `tabsForPane(paneId)` → `tabs.filter(t => t.paneId === paneId).sort((a, b) => a.order - b.order)`
- `activeTab(paneId)` → the tab whose id matches `paneOrder.find(p => p.id === paneId)?.activeTabId`

### `reflectPanes` compatibility

Rewired to resolve legacy scalar fields (`activeNotePath`, `openBookId`,
`scripturePassage`, `scriptureTranslation`) from the **active tab of the
active pane** instead of "the focused pane's content." Output shape is
unchanged, so no downstream consumer of those fields needs to change.

### Core mutations

Replace `openInPane` / `setPaneContent` / `addPane`:

- **`openTab(content, { paneId?, activate? })`** — creates a new tab
  (duplicates always allowed) in the given pane (default: active pane),
  appended after the current active tab, and focuses it unless
  `activate: false`. Every "open" action funnels through this by default;
  splitting/moving is a separate, explicit action.
- **`moveTab(tabId, targetPaneId, targetOrder)`** — reassigns a tab's
  `paneId`/`order`. If `targetPaneId` doesn't exist yet in `paneOrder`, it
  is created first (this powers both "right-click → open in split pane"
  and drag-to-other-pane).
- **`closeTab(tabId)`** — removes the tab. If its pane now has zero tabs
  and there are 2 panes, that pane is dropped from `paneOrder` and the
  remaining pane's ratio effectively becomes 1 (collapse back to single
  pane). If it's the only pane, that pane just shows zero tabs (picker
  fallback).
- **`reorderTab(tabId, targetOrder)`** — same-pane reorder, for in-strip
  dragging.
- **`fillTab(tabId, content)`** — replaces a `picker` tab's content in
  place once something is chosen (does not create a new tab).

### Special case: `navigateScripture` navigates in place

Clicking a cross-reference or verse link inside an already-open Bible tab
should behave like clicking a link in a browser tab — it navigates that
same tab, not spawn a new one. So `navigateScripture`: if the active tab is
already `kind: 'bible'`, it mutates that tab's `book`/`chapter`/`highlight`
in place. Only explicit "open" actions (library/search, the picker's "Open
the Bible", an explicit "open in new tab") go through `openTab`.

## Components

### `TabStrip` (new — `src/renderer/src/components/library/TabStrip.tsx`)

Renders one pane's tabs via `tabsForPane(paneId)`.

- Each tab shows an icon + title (see "Tab title/icon resolution") + a
  close (×) button.
- Click activates a tab; × or middle-click closes it.
- Drag via Pointer Events (matching `Divider.tsx`'s precedent):
  - Dragging within the strip reorders live (`reorderTab`).
  - Dragging past the strip's edge toward/onto the other pane calls
    `moveTab`. One mechanism covers both in-pane reorder and cross-pane
    move.
- Right-click → single context menu item, **"Open in split pane"**
  (`moveTab` to the other pane, creating it if needed).
- Trailing "+" button creates a new `picker` tab and activates it.
- Overflow: tabs shrink toward a minimum width as more open; once at
  minimum width, the strip scrolls horizontally.

### `PaneFrame` (restructured)

Renders `<TabStrip paneId={pane.id} />` above the content area. The content
area dispatches on the **active tab's** `kind` (`note` / `bible` / `pdf` /
`quotes` / `picker`) instead of the pane's own `kind`. Per-content header
controls (replace/close) move from the pane header into the tab strip.

### `CenterWorkspace` (restructured)

Iterates `paneOrder` (1 or 2 entries) instead of `panes`; same
`Divider`/`paneRatio` split logic as today. The standalone "+add pane"
button goes away — dragging a tab to a pane's edge, or right-click → "Open
in split pane," both create the second pane on demand.

### New tab / picker

"+" in a `TabStrip` creates a tab with `kind: 'picker'`, rendering the
existing `PanePicker` component (already has search across notes/library +
an "Open the Bible" action and a full book/chapter browser — this is the
"mini nav" behavior, already built, nothing new needed here). `PanePicker`'s
internal `place()` changes from `setPaneContent`/`openInPane` to
`fillTab(tabId, content)`, replacing the picker tab's own content in place
rather than opening a second tab.

### Tab title/icon resolution

A small pure helper, `tabTitle(tab, store) → { icon, label }`:

| kind | label |
|---|---|
| `note` | note title, looked up from `standaloneNotes` by `notePath` |
| `pdf` | book title, looked up from `books` by `bookId` |
| `bible` | `"John 3"` style, from `book` + `chapter` |
| `quotes` | the quotes group's label |
| `picker` | `"New Tab"` |

## Call-site migration

| Today | Becomes |
|---|---|
| `openNoteInSplit` (always `split: true`) | `openTab(content)` targeted at the other pane (created if needed) |
| `BiblePane`'s "Compare" button (always `split: true`) | `openTab` into the other pane |
| `OpenInCenterButton`'s split/replace-menu logic | Default: `openTab` into the active pane (new tab). Its "open in split" option: `openTab` into the other pane. The old "replace which pane?" menu is removed — tabs absorb what used to require replacing when both panes were full. |
| `PanePicker`'s `place()` | `fillTab(tabId, content)` |
| `navigateScripture` | In-place mutation of the active bible tab (see above), not `openTab` |

## Persistence

`persistWorkspace` extends to `{ tabs, paneOrder, activePaneId, paneRatio }`,
written via `session_state.workspace` at the same mutation points as today
(after `openTab`, `moveTab`, `closeTab`, `reorderTab`, `fillTab`,
`setPaneRatio`, `focusPane`).

**Fix for the prior restore bug:** writes are sequenced through a promise
queue —

```ts
let writeQueue: Promise<void> = Promise.resolve()
function persistWorkspace(...) {
  const payload = JSON.stringify({ tabs, paneOrder, activePaneId, paneRatio })
  writeQueue = writeQueue.then(() => api.setSession('workspace', payload))
}
```

— so writes always land in the order they were issued, and the last one
issued always wins, even under rapid changes or at quit.

**Restore, on launch:** the persisted `workspace` value is read and applied
(overriding today's "peek only, don't restore" behavior). Each restored
tab's reference is validated against current state before being restored:
`bookId` must exist in `books`, `notePath` must exist in `standaloneNotes`.
Anything that no longer resolves is silently dropped. `bible` / `quotes` /
`picker` tabs have nothing to validate and always restore as-is.

## Edge cases

- **Last tab in a pane closed (2 panes open):** that pane collapses; the
  remaining pane goes to full width. (Confirmed behavior.)
- **Last tab in the only pane closed:** that one pane shows the picker
  fallback (not an app-wide empty state).
- **Dragging a pane's only tab toward the split target:** creates pane 2
  with that tab, which empties pane 1, which immediately collapses per the
  rule above — net effect is a no-op, no special-casing needed.
- **Drag dropped outside any valid target:** snaps back, no state change.
- **Duplicate content across tabs:** explicitly allowed — each tab has
  independent state (e.g. scroll position), including within the same
  pane.

## Close behavior (investigated, no warning needed)

`RichNoteEditor` already autosaves on an 800ms debounce and flushes any
pending save synchronously on unmount (`useStore.ts` / `RichNoteEditor.tsx`
cleanup effect). Closing a note tab therefore never loses an edit. Other
tab kinds (`bible`, `pdf`, `quotes`) are read-only views with nothing to
lose. Decision: no dirty-tracking or close-confirmation dialog is built —
it would add friction with no corresponding data-safety benefit.

## Testing approach

This codebase's existing tests are all logic-level `vitest` (no
component-rendering infra — no Testing Library/jsdom dependency). New
coverage matches that pattern, exercising the store directly in a new
`useStore.tabs.test.ts`:

- `openTab` / `moveTab` / `closeTab` / `reorderTab` / `fillTab` state
  transitions.
- Collapse-on-empty-pane rule (2 panes → 1 after last-tab close).
- `navigateScripture`'s in-place-vs-new-tab branching.
- Restore-time validation dropping stale `bookId`/`notePath` references.
- Persistence write-queue never applies writes out of order under rapid
  concurrent calls.

## Open questions

None — all resolved during design review.
