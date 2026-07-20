# Reference Sidebar Consolidation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganise the right-hand reference panel from nine corpus-shaped tabs into five task-shaped pills, with corpus demoted to a switchable mode inside a panel.

**Architecture:** All mode-selection logic lives in one pure module (`lib/corpusMode.ts`) that is fully unit-tested; the store holds the per-pill pinned mode and mirrors it to the session store; each merged pill is a thin wrapper rendering a shared `CorpusSwitch` above an *existing, unmodified* panel component. The existing panels are moved, never rewritten.

**Tech Stack:** TypeScript, Electron (main/preload/renderer), React 18 + Zustand 5, `vitest` (logic-level only — no component-render infra).

Spec: `docs/superpowers/specs/2026-07-20-reference-panel-consolidation-design.md`.

## Global Constraints

- **Five pills, in this order:** `Quotes · Notes · Books · Texts · Commentary`.
- **Modes:** `CorpusMode = 'books' | 'bible' | 'confessions'`. Quotes offers books+bible (confessions added in Task 6); Texts and Commentary offer bible+confessions.
- **Pins are sticky and per pill**, persisted in the **session key-value store** (`api.getSession`/`setSession`) under `refMode:<pill>` — **never** in `PanelLayout`, because `activeRightTab` is a real database column (`active_right_tab`, `state.ts:25`) and pin state must not require a schema migration.
- **An explicit lookup beats a pin:** `verseClicked` sets the Commentary pill to `bible`; `bocSectionClicked` sets it to `confessions`. Both override an existing pin and become the new pin.
- **The Backlinks pill and `BacklinksPanel` are deleted.** The `notes.backlinks` service and its IPC channel **stay** — they are inert without a caller and are the foundation if backlinks return elsewhere. Do not remove them.
- **Panel bodies are not rewritten.** `QuotesPanel`, `ScriptureHighlightsPanel`, `ReferenceBiblePanel`, `ReferenceBocPanel`, `CommentaryPanel`, `BocCommentaryPanel` keep their current internals.
- **Test/typecheck commands:** `npm test -- <path>` for one suite; `npm run typecheck` for both tsconfigs. **`npm test` fails with `EBUSY … better_sqlite3.node` while the Electron app is running — close Loci first.**
- **Migration discipline:** no database migration is needed anywhere in this plan.

## Non-goals

- Renaming or restructuring the left rail.
- Changing any panel's internal behaviour.
- Restoring backlinks in another location.
- Merging the PDF reader ("Books") into "Texts".

---

## File Structure

- **Create** `src/renderer/src/lib/corpusMode.ts` + `.test.ts` — types, mode resolution, tab-id migration (pure).
- **Create** `src/renderer/src/components/library/CorpusSwitch.tsx` — the segmented control plus the `useCorpusMode` hook.
- **Create** `src/renderer/src/components/library/QuotesReferencePanel.tsx` — Quotes pill wrapper.
- **Create** `src/renderer/src/components/library/TextsReferencePanel.tsx` — Texts pill wrapper.
- **Create** `src/renderer/src/components/library/CommentaryReferencePanel.tsx` — Commentary pill wrapper.
- **Create** `src/renderer/src/components/library/BocQuotesPanel.tsx` — the new Confessions quotes body (Task 6).
- **Modify** `src/renderer/src/store/useStore.ts` — `refModes` state, `setRefMode`, hydration, lookup precedence.
- **Modify** `src/renderer/src/components/navigation.ts` — `RIGHT_TABS` becomes five entries.
- **Modify** `src/renderer/src/components/ThreePanel.tsx` — tab normalisation via the migration map, `WIDE_RIGHT_TABS`, the body switch.
- **Modify** `src/renderer/src/styles/app.css` — `.corpus-switch` styles.
- **Delete** `src/renderer/src/components/library/BacklinksPanel.tsx`.

---

## Task 1: Mode resolution and tab migration (pure)

**Files:**
- Create: `src/renderer/src/lib/corpusMode.ts`
- Test: `src/renderer/src/lib/corpusMode.test.ts`

**Interfaces:**
- Produces:
  - `type CorpusMode = 'books' | 'bible' | 'confessions'`
  - `type RefPill = 'quotes' | 'notes' | 'books' | 'texts' | 'commentary'`
  - `const MODES_FOR_PILL: Record<RefPill, CorpusMode[]>`
  - `function modeForTabKind(kind: string | undefined): CorpusMode | null`
  - `function resolveCorpusMode(available: CorpusMode[], pinned: CorpusMode | null, focusedTabKind: string | undefined): CorpusMode`
  - `function migrateRightTabId(id: string): { pill: RefPill; mode: CorpusMode | null }`

- [ ] **Step 1: Write the failing test**

Create `src/renderer/src/lib/corpusMode.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { modeForTabKind, resolveCorpusMode, migrateRightTabId, MODES_FOR_PILL } from './corpusMode'

describe('modeForTabKind', () => {
  it('maps centre tab kinds onto corpus modes', () => {
    expect(modeForTabKind('pdf')).toBe('books')
    expect(modeForTabKind('bible')).toBe('bible')
    expect(modeForTabKind('boc')).toBe('confessions')
  })
  it('returns null for kinds with no corpus', () => {
    expect(modeForTabKind('note')).toBeNull()
    expect(modeForTabKind('picker')).toBeNull()
    expect(modeForTabKind(undefined)).toBeNull()
  })
})

describe('resolveCorpusMode', () => {
  const both: ('bible' | 'confessions')[] = ['bible', 'confessions']

  it('follows the focused tab when nothing is pinned', () => {
    expect(resolveCorpusMode(both, null, 'boc')).toBe('confessions')
    expect(resolveCorpusMode(both, null, 'bible')).toBe('bible')
  })

  // The whole point of sticky: a pin must survive a tab change.
  it('keeps a pinned mode even when the focused tab says otherwise', () => {
    expect(resolveCorpusMode(both, 'bible', 'boc')).toBe('bible')
    expect(resolveCorpusMode(both, 'confessions', 'bible')).toBe('confessions')
  })

  it('ignores a pin the pill cannot offer', () => {
    // 'books' is not a Texts mode; fall back to following the tab.
    expect(resolveCorpusMode(both, 'books', 'boc')).toBe('confessions')
  })

  it('keeps the first available mode when the tab has no corpus', () => {
    expect(resolveCorpusMode(both, null, 'note')).toBe('bible')
    expect(resolveCorpusMode(both, null, undefined)).toBe('bible')
  })

  it('ignores a focused kind the pill cannot offer', () => {
    // A PDF is focused but Texts has no books mode — do not blank, keep the default.
    expect(resolveCorpusMode(both, null, 'pdf')).toBe('bible')
  })
})

describe('migrateRightTabId', () => {
  it('maps every legacy id to a surviving pill and mode', () => {
    expect(migrateRightTabId('book-notes')).toEqual({ pill: 'quotes', mode: 'books' })
    expect(migrateRightTabId('scripture-highlights')).toEqual({ pill: 'quotes', mode: 'bible' })
    expect(migrateRightTabId('standalone-notes')).toEqual({ pill: 'notes', mode: null })
    expect(migrateRightTabId('backlinks')).toEqual({ pill: 'notes', mode: null })
    expect(migrateRightTabId('reference-pdf')).toEqual({ pill: 'books', mode: null })
    expect(migrateRightTabId('reference-bible')).toEqual({ pill: 'texts', mode: 'bible' })
    expect(migrateRightTabId('reference-boc')).toEqual({ pill: 'texts', mode: 'confessions' })
    expect(migrateRightTabId('commentary')).toEqual({ pill: 'commentary', mode: 'bible' })
    expect(migrateRightTabId('boc-commentary')).toEqual({ pill: 'commentary', mode: 'confessions' })
  })

  it('passes through ids that are already new pills', () => {
    expect(migrateRightTabId('quotes')).toEqual({ pill: 'quotes', mode: null })
    expect(migrateRightTabId('texts')).toEqual({ pill: 'texts', mode: null })
  })

  it('falls back to quotes for an unknown id', () => {
    expect(migrateRightTabId('tags')).toEqual({ pill: 'quotes', mode: null })
    expect(migrateRightTabId('')).toEqual({ pill: 'quotes', mode: null })
  })

  it('offers a mode list for every pill, and single-mode pills offer none', () => {
    expect(MODES_FOR_PILL.texts).toEqual(['bible', 'confessions'])
    expect(MODES_FOR_PILL.commentary).toEqual(['bible', 'confessions'])
    expect(MODES_FOR_PILL.notes).toEqual([])
    expect(MODES_FOR_PILL.books).toEqual([])
  })
})
```

- [ ] **Step 2: Run → FAIL**

Run: `npm test -- src/renderer/src/lib/corpusMode.test.ts`
Expected: FAIL — `Failed to resolve import "./corpusMode"`.

- [ ] **Step 3: Implement `src/renderer/src/lib/corpusMode.ts`**

```ts
/** Which corpus a multi-mode reference panel is currently showing. */
export type CorpusMode = 'books' | 'bible' | 'confessions'

/** The five reference-panel pills. */
export type RefPill = 'quotes' | 'notes' | 'books' | 'texts' | 'commentary'

/** Modes each pill can offer. An empty list means the pill is single-mode and shows no switch.
 *  Quotes gains 'confessions' in Task 6, once BocQuotesPanel exists. */
export const MODES_FOR_PILL: Record<RefPill, CorpusMode[]> = {
  quotes: ['books', 'bible'],
  notes: [],
  books: [],
  texts: ['bible', 'confessions'],
  commentary: ['bible', 'confessions']
}

/** The corpus implied by a focused centre tab, or null for tabs that have none. */
export function modeForTabKind(kind: string | undefined): CorpusMode | null {
  if (kind === 'pdf') return 'books'
  if (kind === 'bible') return 'bible'
  if (kind === 'boc') return 'confessions'
  return null
}

/** Which mode a pill shows: a usable pin wins, else follow the focused tab, else keep the
 *  pill's first mode. Never returns a mode the pill cannot offer. */
export function resolveCorpusMode(
  available: CorpusMode[],
  pinned: CorpusMode | null,
  focusedTabKind: string | undefined
): CorpusMode {
  if (pinned && available.includes(pinned)) return pinned
  const followed = modeForTabKind(focusedTabKind)
  if (followed && available.includes(followed)) return followed
  return available[0]
}

/** Legacy `activeRightTab` values, which are persisted in the database, mapped onto the new
 *  pills. Applied on read so an older stored value still resolves — no data migration. */
const LEGACY_TABS: Record<string, { pill: RefPill; mode: CorpusMode | null }> = {
  'book-notes': { pill: 'quotes', mode: 'books' },
  'scripture-highlights': { pill: 'quotes', mode: 'bible' },
  'standalone-notes': { pill: 'notes', mode: null },
  // The Backlinks panel is gone; Notes is the nearest surviving home.
  backlinks: { pill: 'notes', mode: null },
  'reference-pdf': { pill: 'books', mode: null },
  'reference-bible': { pill: 'texts', mode: 'bible' },
  'reference-boc': { pill: 'texts', mode: 'confessions' },
  commentary: { pill: 'commentary', mode: 'bible' },
  'boc-commentary': { pill: 'commentary', mode: 'confessions' }
}

const PILLS: RefPill[] = ['quotes', 'notes', 'books', 'texts', 'commentary']

export function migrateRightTabId(id: string): { pill: RefPill; mode: CorpusMode | null } {
  const legacy = LEGACY_TABS[id]
  if (legacy) return legacy
  if ((PILLS as string[]).includes(id)) return { pill: id as RefPill, mode: null }
  return { pill: 'quotes', mode: null }
}
```

- [ ] **Step 4: Run → PASS**

Run: `npm test -- src/renderer/src/lib/corpusMode.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/lib/corpusMode.ts src/renderer/src/lib/corpusMode.test.ts
git commit -m "Add corpus mode resolution and reference tab migration"
```

---

## Task 2: Pinned modes in the store

**Files:**
- Modify: `src/renderer/src/store/useStore.ts`

**Interfaces:**
- Consumes: `CorpusMode`, `RefPill` (Task 1).
- Produces (store additions):
  - `refModes: Partial<Record<RefPill, CorpusMode>>`
  - `setRefMode: (pill: RefPill, mode: CorpusMode) => void`

- [ ] **Step 1: Add state and the action to the `Store` interface**

Beside the other reference-panel fields:

```ts
  /** The mode each multi-mode reference pill is pinned to. Absent = follow the focused tab.
   *  Mirrored to the session store under `refMode:<pill>`; deliberately NOT in PanelLayout,
   *  which is a database row. */
  refModes: Partial<Record<RefPill, CorpusMode>>
  setRefMode: (pill: RefPill, mode: CorpusMode) => void
```

Import the types at the top of the file:

```ts
import type { CorpusMode, RefPill } from '../lib/corpusMode'
```

- [ ] **Step 2: Add the initial value and the action**

Initial state, beside the other defaults:

```ts
    refModes: {},
```

The action:

```ts
    setRefMode: (pill, mode) => {
      set({ refModes: { ...get().refModes, [pill]: mode } })
      void api.setSession(`refMode:${pill}`, mode)
    },
```

- [ ] **Step 3: Hydrate pins during `init()`**

Find `init()` and add this alongside the other session restores. Unknown or absent values are
skipped, so a stale key can never pin a pill to a mode it cannot offer:

```ts
      const pins: Partial<Record<RefPill, CorpusMode>> = {}
      await Promise.all(
        (['quotes', 'texts', 'commentary'] as RefPill[]).map(async (pill) => {
          const v = await api.getSession(`refMode:${pill}`)
          if (v === 'books' || v === 'bible' || v === 'confessions') pins[pill] = v
        })
      )
      set({ refModes: pins })
```

- [ ] **Step 4: Make an explicit lookup beat the pin**

In `verseClicked` (around line 951), replace the existing `saveLayout` call:

```ts
      get().saveLayout({ activeRightTab: 'commentary', notesCollapsed: false })
      // A click on a verse is a request for *this* passage's commentary — more specific than
      // whatever the pill was pinned to, so it re-pins.
      get().setRefMode('commentary', 'bible')
```

In `bocSectionClicked` (around line 1060), likewise:

```ts
      get().saveLayout({ activeRightTab: 'commentary', notesCollapsed: false })
      get().setRefMode('commentary', 'confessions')
```

Note both now use `'commentary'` — the `'boc-commentary'` tab id no longer exists.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: clean, both configs. (No unit test: store actions are not unit-tested in this codebase; the behaviour is covered by Task 1's `resolveCorpusMode` tests and the browser checks in Task 5.)

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/store/useStore.ts
git commit -m "Track pinned reference-panel modes in the store"
```

---

## Task 3: `CorpusSwitch` and `useCorpusMode`

**Files:**
- Create: `src/renderer/src/components/library/CorpusSwitch.tsx`
- Modify: `src/renderer/src/styles/app.css`

**Interfaces:**
- Consumes: `MODES_FOR_PILL`, `resolveCorpusMode`, `CorpusMode`, `RefPill` (Task 1); `refModes`, `setRefMode` (Task 2).
- Produces:
  - `function useCorpusMode(pill: RefPill): { mode: CorpusMode; setMode: (m: CorpusMode) => void; modes: CorpusMode[] }`
  - `function CorpusSwitch({ pill }: { pill: RefPill }): ReactNode`

- [ ] **Step 1: Create the component and hook**

```tsx
import { useStore, tabsForPane } from '../../store/useStore'
import { MODES_FOR_PILL, resolveCorpusMode, type CorpusMode, type RefPill } from '../../lib/corpusMode'

const MODE_LABELS: Record<CorpusMode, string> = {
  books: 'Books',
  bible: 'Bible',
  confessions: 'Confessions'
}

/** The mode a pill should show, plus the setter that pins it. Auto-follows the focused centre
 *  tab until the user picks a mode; after that the pin wins and persists. */
export function useCorpusMode(pill: RefPill): {
  mode: CorpusMode
  setMode: (m: CorpusMode) => void
  modes: CorpusMode[]
} {
  const tabs = useStore((s) => s.tabs)
  const paneOrder = useStore((s) => s.paneOrder)
  const activePaneId = useStore((s) => s.activePaneId)
  const refModes = useStore((s) => s.refModes)
  const setRefMode = useStore((s) => s.setRefMode)

  const focusedTabId = paneOrder.find((p) => p.id === activePaneId)?.activeTabId
  const focusedKind = tabs.find((t) => t.id === focusedTabId)?.kind

  const modes = MODES_FOR_PILL[pill]
  const mode = resolveCorpusMode(modes, refModes[pill] ?? null, focusedKind)
  return { mode, setMode: (m) => setRefMode(pill, m), modes }
}

/** Segmented control naming the corpus a panel is showing. Renders nothing for single-mode
 *  pills, so wrappers can include it unconditionally. */
export function CorpusSwitch({ pill }: { pill: RefPill }) {
  const { mode, setMode, modes } = useCorpusMode(pill)
  if (modes.length < 2) return null
  return (
    <div className="corpus-switch">
      {modes.map((m) => (
        <button
          key={m}
          className={`corpus-switch-btn${m === mode ? ' active' : ''}`}
          onClick={() => setMode(m)}
        >
          {MODE_LABELS[m]}
        </button>
      ))}
    </div>
  )
}
```

Note: `tabsForPane` is imported above only if used; if the editor flags it as unused, drop it from
the import — the hook reads `paneOrder`/`tabs` directly.

- [ ] **Step 2: Add the styles**

Append to `src/renderer/src/styles/app.css`, after the `.tabs` block:

```css
/* Corpus switch: which body a multi-mode reference pill is showing. */
.corpus-switch {
  display: flex;
  gap: 4px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border);
}
.corpus-switch-btn {
  flex: 0 0 auto;
  padding: 3px 10px;
  border-radius: 999px;
  border: 1px solid var(--border-strong);
  background: transparent;
  color: var(--muted);
  font-family: var(--font-ui);
  font-size: 11px;
  cursor: pointer;
  white-space: nowrap;
}
.corpus-switch-btn:hover {
  color: var(--text);
}
.corpus-switch-btn.active {
  background: var(--accent-12);
  color: var(--accent);
  border-color: var(--gold);
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/library/CorpusSwitch.tsx src/renderer/src/styles/app.css
git commit -m "Add CorpusSwitch and the useCorpusMode hook"
```

---

## Task 4: The three wrapper panels

**Files:**
- Create: `src/renderer/src/components/library/QuotesReferencePanel.tsx`
- Create: `src/renderer/src/components/library/TextsReferencePanel.tsx`
- Create: `src/renderer/src/components/library/CommentaryReferencePanel.tsx`

**Interfaces:**
- Consumes: `CorpusSwitch`, `useCorpusMode` (Task 3); the six existing panel components, unmodified.
- Produces: `QuotesReferencePanel`, `TextsReferencePanel`, `CommentaryReferencePanel` — each a default-free named export taking no props.

Each wrapper is the same three lines of logic. They are separate files rather than one
parameterised component because their mode→body maps are the only thing that differs and a shared
one would need a registry indirection for no gain.

- [ ] **Step 1: Create `QuotesReferencePanel.tsx`**

```tsx
import { CorpusSwitch, useCorpusMode } from './CorpusSwitch'
import { QuotesPanel } from './QuotesPanel'
import { ScriptureHighlightsPanel } from './ScriptureHighlightsPanel'

/** The Quotes pill: quotes for whatever you have open, per corpus. The Confessions mode is
 *  added in Task 6. */
export function QuotesReferencePanel() {
  const { mode } = useCorpusMode('quotes')
  return (
    <>
      <CorpusSwitch pill="quotes" />
      {mode === 'bible' ? <ScriptureHighlightsPanel /> : <QuotesPanel />}
    </>
  )
}
```

- [ ] **Step 2: Create `TextsReferencePanel.tsx`**

```tsx
import { CorpusSwitch, useCorpusMode } from './CorpusSwitch'
import { ReferenceBiblePanel } from './ReferenceBiblePanel'
import { ReferenceBocPanel } from './ReferenceBocPanel'

/** The Texts pill: a live Bible or Book of Concord reader, independent of the centre. */
export function TextsReferencePanel() {
  const { mode } = useCorpusMode('texts')
  return (
    <>
      <CorpusSwitch pill="texts" />
      {mode === 'confessions' ? <ReferenceBocPanel /> : <ReferenceBiblePanel />}
    </>
  )
}
```

- [ ] **Step 3: Create `CommentaryReferencePanel.tsx`**

```tsx
import { CorpusSwitch, useCorpusMode } from './CorpusSwitch'
import { CommentaryPanel } from './CommentaryPanel'
import { BocCommentaryPanel } from './BocCommentaryPanel'

/** The Commentary pill: commentary for the last verse or section clicked. */
export function CommentaryReferencePanel() {
  const { mode } = useCorpusMode('commentary')
  return (
    <>
      <CorpusSwitch pill="commentary" />
      {mode === 'confessions' ? <BocCommentaryPanel /> : <CommentaryPanel />}
    </>
  )
}
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: clean. (The wrappers are not yet reachable — Task 5 wires them in.)

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/library/QuotesReferencePanel.tsx \
  src/renderer/src/components/library/TextsReferencePanel.tsx \
  src/renderer/src/components/library/CommentaryReferencePanel.tsx
git commit -m "Add the merged reference panel wrappers"
```

---

## Task 5: Rewire the strip to five pills; delete Backlinks

**Files:**
- Modify: `src/renderer/src/components/navigation.ts`
- Modify: `src/renderer/src/components/ThreePanel.tsx`
- Delete: `src/renderer/src/components/library/BacklinksPanel.tsx`

**Interfaces:**
- Consumes: `migrateRightTabId` (Task 1); the three wrappers (Task 4).

- [ ] **Step 1: Replace `RIGHT_TABS`**

In `navigation.ts`, replace the whole `RIGHT_TABS` array with:

```ts
/** Right reference-panel pills, organised by task. Corpus is a mode inside a panel, not a pill,
 *  so adding a corpus does not add tabs here. */
export const RIGHT_TABS: RailItem[] = [
  { id: 'quotes', label: 'Quotes', icon: Quote },
  { id: 'notes', label: 'Notes', icon: FileText },
  { id: 'books', label: 'Books', icon: File },
  { id: 'texts', label: 'Texts', icon: BookOpenText },
  { id: 'commentary', label: 'Commentary', icon: MessageSquareQuote }
]
```

Then remove exactly these three now-unused icons from the lucide import at the top of the file:
`Highlighter`, `Link2`, `MessageSquareText`. They were used only by the deleted `RIGHT_TABS`
entries.

**Keep `BookMarked`** — despite also being deleted from `RIGHT_TABS`, it is still used by
`LEFT_VIEWS`'s "Confessions" entry (`navigation.ts:29`) and by `CENTER_EMPTY.confessions`
(`navigation.ts:83`). Removing it breaks the build. Verified 2026-07-20.

Keep `Quote`, `FileText`, `File`, `BookOpenText`, `MessageSquareQuote` (the new `RIGHT_TABS` uses
them) and everything `LEFT_VIEWS`/`CENTER_EMPTY` uses: `BookOpen`, `NotebookPen`, `Search`,
`ScrollText`, `Network`, `LayoutDashboard`, `Files`.

- [ ] **Step 2: Normalise the active tab through the migration map**

In `ThreePanel.tsx`, replace the `rightTabId` block (around line 78):

```ts
  // Normalise the active right tab. Stored values may be legacy ids from before the five-pill
  // consolidation — map them rather than dropping the user on a fallback.
  const rightTabId = migrateRightTabId(layout.activeRightTab).pill
```

Add the import:

```ts
import { migrateRightTabId } from '../lib/corpusMode'
```

- [ ] **Step 3: Update `WIDE_RIGHT_TABS`**

Replace the constant with the new ids:

```ts
/** Reference pills that render a reader and so want a wider notes panel. */
const WIDE_RIGHT_TABS = new Set(['books', 'texts', 'commentary'])
```

- [ ] **Step 4: Replace the body switch**

Replace the whole `rightTabId === …` chain in `.notes-body` with:

```tsx
              {rightTabId === 'quotes' ? (
                <QuotesReferencePanel />
              ) : rightTabId === 'notes' ? (
                <StandaloneNotesPanel />
              ) : rightTabId === 'books' ? (
                <ReferencePdfPanel />
              ) : rightTabId === 'texts' ? (
                <TextsReferencePanel />
              ) : rightTabId === 'commentary' ? (
                <CommentaryReferencePanel />
              ) : (
                <EmptyState
                  icon={activeTab.icon}
                  title="Nothing here yet"
                  subtitle="Pick a reference source above."
                />
              )}
```

- [ ] **Step 5: Fix the imports**

Remove these imports from `ThreePanel.tsx`: `QuotesPanel`, `ScriptureHighlightsPanel`,
`BacklinksPanel`, `ReferenceBiblePanel`, `CommentaryPanel`, `BocCommentaryPanel`,
`ReferenceBocPanel`. Add:

```ts
import { QuotesReferencePanel } from './library/QuotesReferencePanel'
import { TextsReferencePanel } from './library/TextsReferencePanel'
import { CommentaryReferencePanel } from './library/CommentaryReferencePanel'
```

Keep `StandaloneNotesPanel` and `ReferencePdfPanel` — they are still rendered directly.

- [ ] **Step 6: Delete the Backlinks panel**

```bash
git rm src/renderer/src/components/library/BacklinksPanel.tsx
```

Do **not** touch `src/main/services/notes.ts`'s `backlinks()` or the `Channels.backlinks` IPC —
they stay by design (see Global Constraints).

- [ ] **Step 7: Typecheck and run the full suite**

Run: `npm run typecheck` — expected: clean, both configs. Any error naming a deleted import is a
missed edit in Step 5.
Run: `npm test` — expected: all suites pass.

- [ ] **Step 8: Browser verify**

Close Loci, then `npm run dev`. Verify:
- The strip shows exactly five pills on **one row**: Quotes, Notes, Books, Texts, Commentary.
- Each of Quotes / Texts / Commentary shows a segmented switch; Notes and Books do not.
- Open a Bible tab, click a verse → the panel switches to Commentary in **Bible** mode showing that verse's commentary. Open a BoC tab, click a section → Commentary flips to **Confessions**.
- Click **Bible** in the Commentary switch while a BoC tab is focused → it stays on Bible after clicking another tab (the pin is sticky), and survives an app restart.
- Screenshot the strip as proof.

- [ ] **Step 9: Commit**

```bash
git add src/renderer/src/components/navigation.ts src/renderer/src/components/ThreePanel.tsx
git commit -m "Consolidate the reference strip to five task-shaped pills"
```

---

## Task 6: The Confessions quotes mode

The only genuinely new component in this plan. Everything before it was rearrangement.

**Files:**
- Create: `src/renderer/src/components/library/BocQuotesPanel.tsx`
- Modify: `src/renderer/src/lib/corpusMode.ts` (add `'confessions'` to the quotes pill)
- Modify: `src/renderer/src/lib/corpusMode.test.ts` (assert the new mode list)
- Modify: `src/renderer/src/components/library/QuotesReferencePanel.tsx`

**Interfaces:**
- Consumes: `api.listBocQuotes(bocSourceId, documentCode)` (added in `5b80540`); `QuoteCard` and `makeQuoteCardHandlers` from `QuotesPanel`; `BOC_DOCUMENTS`/`bocDocument` from `@shared/bookOfConcord`.

- [ ] **Step 1: Write the failing test**

Extend `src/renderer/src/lib/corpusMode.test.ts`:

```ts
  it('offers the confessions mode on the quotes pill', () => {
    expect(MODES_FOR_PILL.quotes).toEqual(['books', 'bible', 'confessions'])
  })
```

- [ ] **Step 2: Run → FAIL**

Run: `npm test -- src/renderer/src/lib/corpusMode.test.ts`
Expected: FAIL — received `['books', 'bible']`.

- [ ] **Step 3: Add the mode**

In `corpusMode.ts`:

```ts
  quotes: ['books', 'bible', 'confessions'],
```

- [ ] **Step 4: Run → PASS**

Run: `npm test -- src/renderer/src/lib/corpusMode.test.ts`
Expected: PASS.

- [ ] **Step 5: Create `BocQuotesPanel.tsx`**

Location-anchored to the focused BoC tab, mirroring `ScriptureHighlightsPanel`'s shape (read that
file first): follow the open document, list its quotes, reuse `QuoteCard` so drag/copy/tags/
annotations behave identically.

```tsx
import { useCallback, useEffect, useState } from 'react'
import { BookMarked } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { api } from '../../lib/api'
import { BOC_DOCUMENTS, bocDocument } from '@shared/bookOfConcord'
import type { BocSource, Quote } from '@shared/ipc'
import { QuoteCard, makeQuoteCardHandlers } from './QuotesPanel'

/**
 * Book of Concord quotes, location-anchored like ScriptureHighlightsPanel: it follows the
 * focused BoC tab's document and lists that document's saved quotes. Quotes carry their own
 * BoC citation, so book is null.
 */
export function BocQuotesPanel() {
  const tabs = useStore((s) => s.tabs)
  const paneOrder = useStore((s) => s.paneOrder)
  const activePaneId = useStore((s) => s.activePaneId)
  const noteReloadToken = useStore((s) => s.noteReloadToken)

  const focusedTabId = paneOrder.find((p) => p.id === activePaneId)?.activeTabId
  const focusedTab = tabs.find((t) => t.id === focusedTabId)

  const [sources, setSources] = useState<BocSource[]>([])
  const [documentCode, setDocumentCode] = useState('AC')
  const [quotes, setQuotes] = useState<Quote[]>([])

  const bocSourceId = sources[0]?.id ?? ''

  useEffect(() => {
    void api.listBocSources().then(setSources)
  }, [])

  // Follow the focused BoC tab's document.
  useEffect(() => {
    if (focusedTab?.kind === 'boc' && focusedTab.documentCode) setDocumentCode(focusedTab.documentCode)
  }, [focusedTab?.kind, focusedTab?.documentCode])

  const reload = useCallback(async () => {
    if (!bocSourceId) {
      setQuotes([])
      return
    }
    setQuotes(await api.listBocQuotes(bocSourceId, documentCode))
  }, [bocSourceId, documentCode])

  useEffect(() => {
    void reload()
  }, [reload, noteReloadToken])

  const handlers = makeQuoteCardHandlers({
    setQuotes,
    refresh: reload,
    onDelete: (id) => void api.deleteQuote(id).then(reload)
  })

  if (!bocSourceId) {
    return <div className="quotes-empty">No Confessions text indexed yet.</div>
  }

  return (
    <div className="quotes-list">
      <div className="qn-head">
        <BookMarked size={14} />
        <select
          className="book-select"
          value={documentCode}
          onChange={(e) => setDocumentCode(e.target.value)}
        >
          {BOC_DOCUMENTS.map((d) => (
            <option key={d.code} value={d.code}>
              {d.title}
            </option>
          ))}
        </select>
      </div>
      {quotes.length === 0 ? (
        <div className="quotes-empty">
          No quotes from {bocDocument(documentCode)?.title ?? documentCode} yet. Select text in the
          Confessions reader and pick a colour to capture it here.
        </div>
      ) : (
        quotes.map((q) => <QuoteCard key={q.id} quote={q} {...handlers} />)
      )}
    </div>
  )
}
```

> Before writing this, open `QuotesPanel.tsx` and read the real `QuoteCard` props and
> `makeQuoteCardHandlers` signature, and `ScriptureHighlightsPanel.tsx` for how it passes them.
> Match them exactly — the spread above is illustrative, not a contract.

- [ ] **Step 6: Render it from the Quotes wrapper**

In `QuotesReferencePanel.tsx`:

```tsx
import { CorpusSwitch, useCorpusMode } from './CorpusSwitch'
import { QuotesPanel } from './QuotesPanel'
import { ScriptureHighlightsPanel } from './ScriptureHighlightsPanel'
import { BocQuotesPanel } from './BocQuotesPanel'

/** The Quotes pill: quotes for whatever you have open, per corpus. */
export function QuotesReferencePanel() {
  const { mode } = useCorpusMode('quotes')
  return (
    <>
      <CorpusSwitch pill="quotes" />
      {mode === 'bible' ? (
        <ScriptureHighlightsPanel />
      ) : mode === 'confessions' ? (
        <BocQuotesPanel />
      ) : (
        <QuotesPanel />
      )}
    </>
  )
}
```

- [ ] **Step 7: Typecheck and run the full suite**

Run: `npm run typecheck` — clean.
Run: `npm test` — all suites pass.

- [ ] **Step 8: Browser verify**

Close Loci, `npm run dev`, then:
- Quotes pill now offers three modes; focusing a BoC tab selects **Confessions** automatically.
- The existing BoC quotes appear (there are four in the live database as of 2026-07-20: two from the Reader's Edition, two from its Notes, all on `AP:5`) with citations like `Ap IV (II), 1 (Concordia Reader's Edition)`.
- The document `<select>` switches documents; a document with no quotes shows the empty-state copy, not a blank panel.
- Delete a quote → it disappears and does not return after a reload.
- Screenshot as proof.

- [ ] **Step 9: Commit**

```bash
git add src/renderer/src/components/library/BocQuotesPanel.tsx \
  src/renderer/src/components/library/QuotesReferencePanel.tsx \
  src/renderer/src/lib/corpusMode.ts src/renderer/src/lib/corpusMode.test.ts
git commit -m "Add the Confessions quotes mode to the Quotes pill"
```

---

## Self-Review

**Spec coverage:**
- Five pills, organised by task → Task 5 ✓
- `CorpusSwitch` shared segmented control → Task 3 ✓
- Auto-follow from the focused tab kind → Task 1 (`modeForTabKind`/`resolveCorpusMode`) + Task 3 ✓
- Sticky, per-pill pins persisted in the session store, not `PanelLayout` → Task 2 ✓
- An explicit lookup beats a pin (`verseClicked`/`bocSectionClicked`) → Task 2 Step 4 ✓
- Thin wrappers over unmodified panel bodies → Task 4 ✓
- Backlinks pill and panel deleted; `notes.backlinks` service and IPC retained → Task 5 Step 6 ✓
- `activeRightTab` legacy id migration on read → Task 1 (`migrateRightTabId`) + Task 5 Step 2 ✓
- `WIDE_RIGHT_TABS` updated to the new ids → Task 5 Step 3 ✓
- New Confessions quotes panel, sequenced last → Task 6 ✓
- Books stays a separate single-mode pill → Task 5 Step 4 ✓

**Deliberately not covered:** the spec's mitigation that each mode's empty-state copy should name
its corpus ("Click a *verse*…" vs "Click a *section*…"). Both strings already do — `CommentaryPanel`
passes `"Click a verse to see commentary."` and `BocCommentaryPanel` `"Click a section to see
commentary."` — so no task is needed. Verified before writing this plan.

**Type consistency:** `CorpusMode` and `RefPill` are defined once in Task 1 and imported unchanged
by Tasks 2, 3, 4 and 6. `MODES_FOR_PILL` is the single source of which modes a pill offers, read by
`useCorpusMode` (Task 3) and widened in Task 6 — no wrapper hardcodes a mode list.
`migrateRightTabId` returns `{ pill, mode }`; Task 5 uses only `.pill`, which is intentional — the
`.mode` half is informational for a future task that wants to seed a pin from a legacy id, and is
asserted in Task 1's tests so it cannot silently rot.

**Verification honesty:** Tasks 1 and 6 carry real vitest coverage of the pure logic — mode
resolution and the migration map are exactly the mappings that break silently. Tasks 2–5 are
typecheck plus browser-gated, because they are store wiring and composition with no unit-testable
seam in a codebase with no component-render infra. Each names concrete browser checks, including
the two that would otherwise be assumed: that a pin survives a tab change, and that it survives a
restart.
