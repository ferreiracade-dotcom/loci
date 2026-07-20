# Confessions (Book of Concord) — Plan 2: Reader & Nav Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Book of Concord readable in the app — a Confessions nav tab, a document/section reader mirroring the Bible reader, per-section commentary, a reference-sidebar panel, and paragraph-precise highlight-to-quote — all built on the Plan 1 backend (merged).

**Architecture:** Mirror the existing Bible reader stack. `BocReader` is a presentational component (props in, callbacks out) like `ScriptureReader`; `BocPane` owns location like `BiblePane`; a `'boc'` pane kind flows through the already-generic pane store. Commentary reuses `CommentaryPanel` by parameterizing it (props instead of hardcoded Bible store fields). Quotes add a v19 migration (`boc_source_id`/`boc_ref`) and a write path parallel to scripture/commentary quotes.

**Tech Stack:** TypeScript, Electron (main/preload/renderer), React 18 + Zustand 5, Tiptap (notes), better-sqlite3, `vitest` (logic-level only — no component tests exist).

## This is Plan 2 of 3

Spec: `docs/superpowers/specs/2026-07-18-confessions-boc-design.md`. Plan 1 (data foundation — registry, migration v18, parser, service, indexer, search, IPC reads, EPUB converter) is **merged to main**. Plan 3 (PanePicker, search filter UI + result grouping, Projects, drag-and-drop everywhere, shared `contentKindIcon`/`kindLabel` helper) comes after this. The Task 6 search-UI mislabeling finding recorded in the spec (`SearchHit.kind`/`groupKeyFor`/`onHit` unextended for `'confession'`) remains a **Plan 3** acceptance criterion — not this plan.

## Verification model (READ THIS)

This codebase has **no component/render test infra** (tests are logic-level `vitest`: `commentaryGrouping.test.ts`, `noteFrontmatter.test.ts`, `bocMarkdown.test.ts`, etc. — no Testing Library/jsdom). So:

- **Pure & backend tasks** (citation, the range-label helper, the v19 migration, the quote write-path service) → vitest TDD, run with `npm test -- <path>` (the native-ABI wrapper; never `npx vitest`).
- **UI tasks** (store types, `BocReader`, `BocPane`, nav wiring, panel parameterization, reference panel) → the gate is `npm run typecheck` (clean, both configs) **plus a live browser-preview check**. Each UI task lists an explicit browser-verification checklist. Use the harness preview tools: `preview_start` the dev server (see `.claude/launch.json`; create it if absent with the app's dev command), then `read_page`/`read_console_messages`/`computer` to drive and confirm, and a screenshot as proof.

## Global Constraints

- **No copyright gate on BoC highlighting** (settled in spec). `ScriptureReader` gates highlights to `provider === 'free-use'`; `BocSource` has NO provider field and none is added — BoC sources are user-owned local files, all quotable (the migration-v16 commentary-quotes precedent: copyrighted text captured as a quote stays local). `BocReader` always allows highlight-to-quote.
- **Ref-string format** (from Plan 1, unchanged): `formatBocRef(code, ordinal)` → `"AC:4"`; `parseBocRef` inverts it. Defined in `src/shared/bookOfConcord.ts`.
- **Migration discipline:** append only; next free version is **19** (v18 is the highest, `'book-of-concord'`). Never edit a shipped migration.
- **Citation display form:** `bocCitation` renders `"<abbreviation> <sectionNumber>, <paragraph> (<sourceDisplayName>)"`, e.g. `"AC IV, 2 (Reader's Edition)"`; when there's no paragraph, `"AC IV (Reader's Edition)"`; when a section has no number (Preface), use the label: `"AC, Preface (Reader's Edition)"`.
- **Test/typecheck commands:** `npm test -- <path>` for a single suite; `npm run typecheck` for both tsconfigs.
- **Available IPC (Plan 1, already on `window.api`):** `lookupBocSection(documentCode, ordinal)`, `getBocSection(documentCode, ordinal, sourceId)`, `listBocDocumentSections(documentCode, sourceId)`, `listBocSources()`, `listBocCommentarySources()`. `BocSource`, `BocSectionRow`, `BocCommentaryMatch` types are in `src/shared/ipc.ts`.
- **Static data:** `BOC_DOCUMENTS` (14 docs, `{code, title, abbreviation, sortOrder, aliases}`), `bocDocument(code)`, `documentCodeFromName(name)` in `src/shared/bookOfConcord.ts`.

## Non-goals (deferred)

- **Inline BoC-reference recognition in notes** (typing "AC IV" in a note → clickable/hover-preview ref, à la the `ScriptureRef` Tiptap extension in `RichNoteEditor.tsx:208-334`). It needs a from-scratch tokenizer for BoC's document+section scheme (unlike Bible's chapter:verse). Deferred to a later polish task; NOT in Plan 2.
- Multi-source ordinal alignment (Plan 1 follow-up), PanePicker/Projects/search-UI (Plan 3).
- The `worktree-tabbed-panes` branch: this plan targets today's pane model on `main`.

---

## File Structure

- **Modify** `src/shared/citation.ts` — add `bocCitation()` + `bocLabel()` (pure).
- **Create** `src/shared/citation.test.ts` if absent, else extend — test `bocCitation`.
- **Modify** `src/main/db/migrations.ts` — append migration v19 (`boc_source_id`/`boc_ref` on `quotes`).
- **Modify** `src/main/services/quotes.ts` — `addBocQuote`, `addBocCommentaryQuote`, `citationForRow` branch.
- **Modify** `src/main/services/quotes.test.ts` (or the relevant existing quotes test) — cover the BoC quote path.
- **Modify** `src/shared/ipc.ts`, `src/preload/index.ts`, `src/main/ipc/index.ts` — IPC for the two new quote writers + a `bocSectionRangeLabel` note.
- **Create** `src/renderer/src/lib/bocGrouping.ts` + `.test.ts` — `groupBocMatchesBySource`, `bocSectionRangeLabel` (pure).
- **Modify** `src/renderer/src/store/useStore.ts` — `'boc'` `PaneKind`, `Pane`/`PaneContent` fields, `bocLookup`/`bocMatches` state, `navigateBoc`, `bocSectionClicked`, `showConfessions`, `addBocQuote`, `QuoteGroupRef` boc member.
- **Create** `src/renderer/src/components/library/BocReader.tsx` — presentational reader.
- **Create** `src/renderer/src/components/library/BocPane.tsx` — pane wrapper (document/section nav + source picker).
- **Modify** `src/renderer/src/components/library/PaneFrame.tsx` — headerless `'boc'` branch.
- **Modify** `src/renderer/src/components/navigation.ts` — `LEFT_VIEWS`, `RIGHT_TABS`, `CENTER_EMPTY` entries.
- **Modify** `src/renderer/src/components/ThreePanel.tsx` — `selectLeftView`/`railActiveId`/`readerTab`/right-tab-switch branches.
- **Modify** `src/renderer/src/components/library/CommentaryPanel.tsx` — parameterize; **Create** `BocCommentaryPanel.tsx` thin wrapper.
- **Create** `src/renderer/src/components/library/ReferenceBocPanel.tsx` — reference-sidebar reader.

---

## Task 1: `bocCitation()` (pure)

**Files:**
- Modify: `src/shared/citation.ts` (add after the scripture section, ~line 165)
- Test: `src/shared/citation.test.ts` (create if absent)

**Interfaces:**
- Produces:
  - `interface BocCiteRef { abbreviation: string; sectionNumber: string | null; sectionLabel: string; paragraph?: number | null; sourceName: string }`
  - `function bocLabel(r: BocCiteRef): string` — `"AC IV, 2"` / `"AC IV"` / `"AC, Preface"`
  - `function bocCitation(r: BocCiteRef): string` — `bocLabel(r) + " (" + sourceName + ")"`

- [ ] **Step 1: Write the failing test**

Create/extend `src/shared/citation.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { bocLabel, bocCitation } from './citation'

describe('bocCitation', () => {
  const base = { abbreviation: 'AC', sectionNumber: 'IV', sectionLabel: 'Justification', sourceName: "Reader's Edition" }
  it('numbered section with paragraph', () => {
    expect(bocLabel({ ...base, paragraph: 2 })).toBe('AC IV, 2')
    expect(bocCitation({ ...base, paragraph: 2 })).toBe("AC IV, 2 (Reader's Edition)")
  })
  it('numbered section, no paragraph', () => {
    expect(bocLabel(base)).toBe('AC IV')
    expect(bocCitation(base)).toBe("AC IV (Reader's Edition)")
  })
  it('unnumbered section falls back to label', () => {
    const pref = { abbreviation: 'AC', sectionNumber: null, sectionLabel: 'Preface', sourceName: "Reader's Edition" }
    expect(bocLabel(pref)).toBe('AC, Preface')
    expect(bocCitation(pref)).toBe("AC, Preface (Reader's Edition)")
  })
})
```

- [ ] **Step 2: Run → FAIL** (`npm test -- src/shared/citation.test.ts`).

- [ ] **Step 3: Implement** in `src/shared/citation.ts`:

```ts
export interface BocCiteRef {
  abbreviation: string
  sectionNumber: string | null
  sectionLabel: string
  paragraph?: number | null
  sourceName: string
}

export function bocLabel(r: BocCiteRef): string {
  const head = r.sectionNumber ? `${r.abbreviation} ${r.sectionNumber}` : `${r.abbreviation}, ${r.sectionLabel}`
  return r.paragraph != null ? `${head}, ${r.paragraph}` : head
}

export function bocCitation(r: BocCiteRef): string {
  return `${bocLabel(r)} (${r.sourceName})`
}
```

- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit**

```bash
git add src/shared/citation.ts src/shared/citation.test.ts
git commit -m "Add bocCitation() for Book of Concord references"
```

---

## Task 2: BoC grouping + range-label helpers (pure)

**Files:**
- Create: `src/renderer/src/lib/bocGrouping.ts`
- Test: `src/renderer/src/lib/bocGrouping.test.ts`

**Interfaces:**
- Consumes: `BocCommentaryMatch` from `../../../shared/ipc` (fields: `excerptId, sourceId, sourceDisplayName, sourceAuthor, sortOrder, text, sectionStart, sectionEnd`).
- Produces:
  - `interface BocCommentaryGroup { sourceId: string; sourceDisplayName: string; sourceAuthor: string | null; matches: BocCommentaryMatch[] }`
  - `function groupBocMatchesBySource(matches: BocCommentaryMatch[]): BocCommentaryGroup[]` — grouped by sourceId, groups ordered by the first match's `sortOrder`.
  - `function bocSectionRangeLabel(m: { sectionStart: number; sectionEnd: number }): string` — `"§4"` when start===end, else `"§4–6"`.

Mirror `src/renderer/src/lib/commentaryGrouping.ts`'s `groupMatchesBySource`/`excerptRangeLabel` (read it first).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { groupBocMatchesBySource, bocSectionRangeLabel } from './bocGrouping'

const m = (over: Partial<any> = {}): any => ({
  excerptId: 'e', sourceId: 's1', sourceDisplayName: 'A', sourceAuthor: null,
  sortOrder: 0, text: 't', sectionStart: 4, sectionEnd: 4, ...over
})

describe('bocGrouping', () => {
  it('groups by source, ordered by sortOrder', () => {
    const g = groupBocMatchesBySource([
      m({ sourceId: 's1', sortOrder: 1, excerptId: 'a' }),
      m({ sourceId: 's2', sortOrder: 0, sourceDisplayName: 'B', excerptId: 'b' }),
      m({ sourceId: 's1', sortOrder: 1, excerptId: 'c' })
    ])
    expect(g.map((x) => x.sourceId)).toEqual(['s2', 's1'])
    expect(g[1].matches.map((x) => x.excerptId)).toEqual(['a', 'c'])
  })
  it('formats a section range label', () => {
    expect(bocSectionRangeLabel({ sectionStart: 4, sectionEnd: 4 })).toBe('§4')
    expect(bocSectionRangeLabel({ sectionStart: 4, sectionEnd: 6 })).toBe('§4–6')
  })
})
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement** `src/renderer/src/lib/bocGrouping.ts`:

```ts
import type { BocCommentaryMatch } from '../../../shared/ipc'

export interface BocCommentaryGroup {
  sourceId: string
  sourceDisplayName: string
  sourceAuthor: string | null
  matches: BocCommentaryMatch[]
}

export function groupBocMatchesBySource(matches: BocCommentaryMatch[]): BocCommentaryGroup[] {
  const byId = new Map<string, BocCommentaryGroup>()
  for (const m of matches) {
    let g = byId.get(m.sourceId)
    if (!g) {
      g = { sourceId: m.sourceId, sourceDisplayName: m.sourceDisplayName, sourceAuthor: m.sourceAuthor, matches: [] }
      byId.set(m.sourceId, g)
    }
    g.matches.push(m)
  }
  return [...byId.values()].sort((a, b) => (a.matches[0]?.sortOrder ?? 0) - (b.matches[0]?.sortOrder ?? 0))
}

export function bocSectionRangeLabel(m: { sectionStart: number; sectionEnd: number }): string {
  return m.sectionStart === m.sectionEnd ? `§${m.sectionStart}` : `§${m.sectionStart}–${m.sectionEnd}`
}
```

- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/lib/bocGrouping.ts src/renderer/src/lib/bocGrouping.test.ts
git commit -m "Add BoC commentary grouping + section-range label helpers"
```

---

## Task 3: v19 migration + BoC quote write-path (backend)

**Files:**
- Modify: `src/main/db/migrations.ts` (append v19)
- Modify: `src/main/services/quotes.ts` (`addBocQuote`, `addBocCommentaryQuote`, `citationForRow` branch)
- Modify: `src/shared/ipc.ts`, `src/preload/index.ts`, `src/main/ipc/index.ts` (IPC for the two writers)
- Test: `src/main/services/quotes.test.ts` (extend, or create if absent)

**Interfaces:**
- Consumes: `bocCitation` (Task 1); `formatBocRef`/`bocDocument` from `bookOfConcord.ts`.
- Produces:
  - Migration v19 `'boc-quotes'`: `ALTER TABLE quotes ADD COLUMN boc_source_id TEXT REFERENCES boc_sources(id) ON DELETE CASCADE; ALTER TABLE quotes ADD COLUMN boc_ref TEXT;`

  > **AS BUILT (commit a221430) — this migration shipped with four more columns than planned, deliberately:**
  > `boc_commentary_source_id TEXT REFERENCES boc_commentary_sources(id) ON DELETE CASCADE`,
  > `boc_section_number TEXT`, `boc_section_label TEXT`, `boc_paragraph INTEGER`.
  > Why: (1) `boc_commentary_sources` is a *separate table* from `boc_sources` (migration 18), so
  > `addBocCommentaryQuote` cannot reuse `boc_source_id` — with `foreign_keys = ON` that insert
  > throws. This mirrors how `commentary_source_id` is kept separate from `book_id`.
  > (2) `citationForRow` must regenerate the citation from stored columns alone (as the scripture
  > and commentary branches do), but a section's number/label are NOT re-derivable from `"AC:6"` —
  > unnumbered sections cite by label ("SC, Preface") and the paragraph isn't in the ref at all.
  > So they're captured once at quote time. There is no stored `citation` column on `quotes` (the
  > plan's illustrative test wrongly selected one); citation is always computed via `citationForRow`.
  - `interface BocQuoteInput { bocSourceId: string; documentCode: string; sectionOrdinal: number; sectionNumber: string | null; sectionLabel: string; paragraph: number | null; text: string; color?: string }`
  - `addBocQuote(input: BocQuoteInput): { id: string }` — inserts a `quotes` row with `book_id NULL`, `boc_source_id`, `boc_ref = formatBocRef(documentCode, sectionOrdinal)`, computed `citation = bocCitation(...)` using `bocDocument(documentCode).abbreviation` + the source's display_name.
  - `addBocCommentaryQuote(input)` — same shape but the ref points at the commentary source; reuse `addBocQuote` structure with the commentary source id.
  - `citationForRow` gains a `boc_source_id`/`boc_ref` branch producing the BoC citation.
  - IPC: `api.addBocQuote(input)`, `api.addBocCommentaryQuote(input)`.

Read `src/main/services/quotes.ts` first — mirror `addScriptureQuote` (line 524, the `scripture_ref`/`scripture_translation` insert with `book_id NULL`) and `addCommentaryQuote` (line 807, the `commentary_source_id`/`commentary_ref` insert) exactly. Add the BoC branch to `citationForRow` (line 310) alongside its existing `scripture_ref` branch (line 316) and the commentary branch — key it on `r.boc_ref`/`r.boc_source_id`. Note `addScriptureHighlight` is the *store* action name (`useStore.ts:1000`); the *service* function is `addScriptureQuote`.

- [ ] **Step 1: Write the failing test** (extend `quotes.test.ts`, in-memory-DB harness):

```ts
// harness: in-memory db + runMigrations + boc.createSource to make a source row …
import * as boc from './boc'
import { addBocQuote, listQuotes } from './quotes' // match the file's real list/read fn

it('creates a BoC quote row with boc_ref and a BoC citation', () => {
  const src = boc.createSource({ displayName: "Reader's Edition", author: null, mdRelativePath: 're.md' })
  const { id } = addBocQuote({
    bocSourceId: src.id, documentCode: 'AC', sectionOrdinal: 6, sectionNumber: 'IV',
    sectionLabel: 'Justification', paragraph: 2, text: 'Our churches teach…'
  })
  const row: any = db.prepare('SELECT boc_source_id, boc_ref, book_id, citation FROM quotes WHERE id = ?').get(id)
  expect(row.book_id).toBeNull()
  expect(row.boc_source_id).toBe(src.id)
  expect(row.boc_ref).toBe('AC:6')
  expect(row.citation).toBe("AC IV, 2 (Reader's Edition)")
})
```

- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** the migration, the two service functions, the `citationForRow` branch, and the IPC surface (mirror the scripture/commentary quote precedents named above). Then `npm run typecheck`.
- [ ] **Step 4: Run → PASS** (`npm test -- src/main/services/quotes.test.ts`) and full `npm test` (no regressions).
- [ ] **Step 5: Commit**

```bash
git add src/main/db/migrations.ts src/main/services/quotes.ts src/main/services/quotes.test.ts src/shared/ipc.ts src/preload/index.ts src/main/ipc/index.ts
git commit -m "Add Book of Concord quote write-path (migration v19 + IPC)"
```

---

## Task 4: `'boc'` pane kind + store actions (UI — typecheck-gated)

**Files:**
- Modify: `src/renderer/src/store/useStore.ts`

**Interfaces:**
- Produces (store additions):
  - `PaneKind` gains `'boc'`; `Pane`/`PaneContent` gain `documentCode?: string; sectionOrdinal?: number; bocSourceId?: string`.
  - Store state: `bocLookup: { documentCode: string; ordinal: number } | null`, `bocMatches: BocCommentaryMatch[]`.
  - `QuoteGroupRef` gains `{ type: 'boc'; documentCode: string; bocSourceId: string; name: string }`.
  - Actions: `navigateBoc(documentCode: string, ordinal: number, bocSourceId?: string)` (mirror `navigateScripture:911`); `bocSectionClicked(documentCode: string, ordinal: number)` (mirror `verseClicked:932` — set `bocLookup`, `await api.lookupBocSection`, stale-guard, set `bocMatches`, `saveLayout({activeRightTab:'boc-commentary', notesCollapsed:false})`); `showConfessions()` (mirror `showScripture:944`, searching `panes.find(p => p.kind === 'boc')`); `addBocQuote(input)` (mirror `addScriptureHighlight:1000` → `api.addBocQuote` → bump `noteReloadToken`).

Read `useStore.ts:39-100, 911-1010` first. `openInPane`/`setPaneContent`/`paneFromContent` are already generic — no change needed beyond the type unions.

- [ ] **Step 1: Add the type-union members** (`PaneKind`, `Pane`, `PaneContent`, `QuoteGroupRef`) and the two state fields with initial values (`bocLookup: null`, `bocMatches: []`).
- [ ] **Step 2: Add `navigateBoc`, `bocSectionClicked`, `showConfessions`, `addBocQuote`**, each mirroring the named Bible action line-for-line with BoC fields/APIs.
- [ ] **Step 3: Typecheck** — `npm run typecheck` clean. (No unit test; store actions aren't unit-tested in this codebase. Their behavior is exercised by the browser checks in Tasks 5–8.)
- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/store/useStore.ts
git commit -m "Add 'boc' pane kind and Book of Concord store actions"
```

---

## Task 5: `BocReader` + `BocPane` + PaneFrame wiring (UI — typecheck + browser)

**Files:**
- Create: `src/renderer/src/components/library/BocReader.tsx`
- Create: `src/renderer/src/components/library/BocPane.tsx`
- Modify: `src/renderer/src/components/library/PaneFrame.tsx` (headerless `'boc'` branch, mirror line 67)

**Interfaces:**
- `BocReader` props (mirror `ScriptureReader` props, `ScriptureReader.tsx:9-26`):
  ```ts
  interface BocReaderProps {
    documentCode: string
    sectionOrdinal: number
    bocSourceId: string
    sources: BocSource[]
    onNavigate: (ordinal: number) => void
    onSectionClick?: (documentCode: string, ordinal: number) => void
    onSourceChange?: (sourceId: string) => void
    onQuote?: (paragraph: number | null, text: string) => void
    compact?: boolean
  }
  ```
  Behavior: loads the section via `api.getBocSection(documentCode, sectionOrdinal, bocSourceId)`; renders `section.text` with its inline `[N]` paragraph markers styled as a clickable gutter (each `[N]` → `<span data-para={N} class="bp">`); a source `<select>` when `sources.length > 1` (mirror the translation dropdown at `ScriptureReader.tsx:226-241`); prev/next section nav via `onNavigate(ordinal ± 1)`; text-selection → color popover → `onQuote(paragraph, text)` (mirror `onBodyMouseUp`/`pickColor` at `ScriptureReader.tsx:159-207`, but NO `provider` gate — always enabled). Clicking a paragraph calls `onSectionClick(documentCode, sectionOrdinal)` to trigger commentary (the section is the lookup unit; the paragraph is for citation only).
- `BocPane` (mirror `BiblePane.tsx`): owns `documentCode = pane.documentCode ?? 'AC'`, `sectionOrdinal = pane.sectionOrdinal ?? 1`, `bocSourceId = pane.bocSourceId ?? sources[0]?.id`; a left rail listing `BOC_DOCUMENTS` (14) and, for the current document, its sections from `api.listBocDocumentSections(documentCode, bocSourceId)` (grouped under `section_part` headings where present); `navigate()` → `setPaneContent(pane.id, { kind: 'boc', documentCode, sectionOrdinal, bocSourceId })`; wires `onSectionClick={bocSectionClicked}`, `onQuote={(para, text) => addBocQuote({...})}`, `onSourceChange`, and renders `BocReader`.
- `PaneFrame.tsx`: add, next to the bible headerless branch (line 67), `if (pane.kind === 'boc' && pane.documentCode && pane.sectionOrdinal != null) return <headerless BocPane>`.

- [ ] **Step 1** Create `BocReader.tsx` per the contract (copy `ScriptureReader.tsx` structure; strip the audio block, testament logic, and the `provider` highlight gate; swap verse→paragraph, book/chapter→document/section, `api.getScriptureChapter`→`api.getBocSection`).
- [ ] **Step 2** Create `BocPane.tsx` per the contract (copy `BiblePane.tsx`; replace the 66-book testament nav with the 14-document + sections rail; replace translation with source picker).
- [ ] **Step 3** Add the `PaneFrame.tsx` headerless `'boc'` branch.
- [ ] **Step 4 — Typecheck:** `npm run typecheck` clean.
- [ ] **Step 5 — Browser verify** (requires an indexed BoC source in the vault — convert the Reader's Edition with `tools/boc-epub-to-md.mjs` into the `confessions/` and `confessions-commentary/` vault folders first, restart so `syncBocFolder` indexes it):
  - `preview_start` the dev server. In the app, temporarily trigger a `boc` pane (e.g. call `openInPane({kind:'boc', documentCode:'AC', sectionOrdinal:6, bocSourceId:<id>})` via the devtools console, or wire the nav in Task 6 first and come back).
  - `read_page`: confirm AC section 6 renders "Justification" text with `[N]` markers, a source picker, and prev/next nav.
  - `read_console_messages`: no errors.
  - Select text → confirm the color popover appears (no provider gate).
  - Screenshot as proof.
- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/library/BocReader.tsx src/renderer/src/components/library/BocPane.tsx src/renderer/src/components/library/PaneFrame.tsx
git commit -m "Add BocReader + BocPane and wire the boc pane frame"
```

---

## Task 6: Left-nav wiring (UI — typecheck + browser)

**Files:**
- Modify: `src/renderer/src/components/navigation.ts` (`LEFT_VIEWS`, `CENTER_EMPTY`)
- Modify: `src/renderer/src/components/ThreePanel.tsx` (`selectLeftView`, `railActiveId`)

**Interfaces:**
- `LEFT_VIEWS` gains `{ id: 'confessions', label: 'Confessions', icon: <ScrollText/> }` (reuse an existing lucide icon already imported, e.g. `BookMarked`/`ScrollText`).
- `CENTER_EMPTY` gains a `confessions` entry (title + hint copy mirroring the `scripture` entry).
- `ThreePanel.selectLeftView` (line 42): add `else if (id === 'confessions') void showConfessions()` before the generic `saveLayout` branch.
- `ThreePanel.railActiveId` (line 49): light `'confessions'` when the focused pane is `kind === 'boc'`.
- `centerNode()` needs NO change — a `boc` pane opens via `showConfessions()` and falls through `default → CenterWorkspace`, exactly like Scripture.

- [ ] **Step 1** Add the `LEFT_VIEWS` + `CENTER_EMPTY` entries.
- [ ] **Step 2** Add the `selectLeftView` + `railActiveId` branches, importing `showConfessions` from the store.
- [ ] **Step 3 — Typecheck** clean.
- [ ] **Step 4 — Browser verify:** reload; a "Confessions" icon appears in the left rail; clicking it opens/focuses a BoC pane (or the empty-state copy if none); the rail item highlights when a boc pane is focused. Screenshot.
- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/navigation.ts src/renderer/src/components/ThreePanel.tsx
git commit -m "Add Confessions left-nav tab"
```

---

## Task 7: Parameterize `CommentaryPanel` + BoC commentary tab (UI — typecheck + browser)

**Files:**
- Modify: `src/renderer/src/components/library/CommentaryPanel.tsx` (extract a presentational core taking props)
- Create: `src/renderer/src/components/library/BocCommentaryPanel.tsx` (thin wrapper)
- Modify: `src/renderer/src/components/navigation.ts` (`RIGHT_TABS` → `boc-commentary`)
- Modify: `src/renderer/src/components/ThreePanel.tsx` (right-tab switch + `readerTab`/`selectRightTab` widening)

**Interfaces:**
- Refactor `CommentaryPanel` into a presentational `CommentaryPanelView` taking props: `{ hasLookup: boolean; groups: {sourceId; sourceDisplayName; sourceAuthor; matches: {excerptId; text; rangeLabel: string; onQuote: () => void; onViewInPdf?: () => void}[]}[]; emptyHint: string }`. The existing `CommentaryPanel` becomes a thin Bible wrapper reading `commentaryLookup`/`commentaryMatches` + `groupMatchesBySource` + `excerptRangeLabel` + the existing `addCommentaryQuote`, mapping into the view's props. `BocCommentaryPanel` is the parallel wrapper: reads `bocLookup`/`bocMatches`, uses `groupBocMatchesBySource`/`bocSectionRangeLabel` (Task 2), and `addBocCommentaryQuote` (Task 3). This is where the Plan-1 `header_raw` field (currently written but unread) can be surfaced if useful — otherwise leave it.
- `RIGHT_TABS` gains `{ id: 'boc-commentary', label: 'Confessions', icon: <MessageSquareText/> }`.
- `ThreePanel` right-tab switch (line 215): add `rightTabId === 'boc-commentary' → <BocCommentaryPanel/>`.
- `ThreePanel` `readerTab` (line 65) + `selectRightTab` widening (line 74): add `'boc-commentary'` to the widen conditions.

- [ ] **Step 1** Extract `CommentaryPanelView` (pure presentational) from `CommentaryPanel`; keep `CommentaryPanel` behavior identical (Bible wrapper). Typecheck.
- [ ] **Step 2** Create `BocCommentaryPanel` wrapper.
- [ ] **Step 3** Add the `RIGHT_TABS` entry + the `ThreePanel` switch/widening branches.
- [ ] **Step 4 — Typecheck** clean.
- [ ] **Step 5 — Browser verify:** open AC in a boc pane, click a section → the right sidebar switches to the "Confessions" commentary tab and shows the Reader's-Edition study note for that section, grouped by source; a "Quote" action on an excerpt creates a quote (check the Quotes view). Confirm the Bible commentary still works unchanged (click a verse). Screenshots of both.
- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/library/CommentaryPanel.tsx src/renderer/src/components/library/BocCommentaryPanel.tsx src/renderer/src/components/navigation.ts src/renderer/src/components/ThreePanel.tsx
git commit -m "Parameterize CommentaryPanel; add BoC commentary sidebar tab"
```

---

## Task 8: `ReferenceBocPanel` (UI — typecheck + browser)

**Files:**
- Create: `src/renderer/src/components/library/ReferenceBocPanel.tsx`
- Modify: `src/renderer/src/components/navigation.ts` (`RIGHT_TABS` → `reference-boc`)
- Modify: `src/renderer/src/components/ThreePanel.tsx` (switch + widening)

**Interfaces:**
- `ReferenceBocPanel` (mirror `ReferenceBiblePanel.tsx`): own local `documentCode`/`sectionOrdinal`/`bocSourceId` state, restored from a new session key `refBocLoc` (`api.getSession`/`setSession`); a document picker (14 `BOC_DOCUMENTS`); an `OpenInCenterButton` promoting to `content={{ kind: 'boc', documentCode, sectionOrdinal, bocSourceId }}`; and an embedded `BocReader` with `onSectionClick={bocSectionClicked}`. Drag-and-drop (the `application/x-loci-boc` mime + `ProjectItem` `boc` variant + `PaneFrame.projectItemFromDrag` branch) is **Plan 3** — do NOT add it here; this panel is read/open only.
- `RIGHT_TABS` gains `{ id: 'reference-boc', label: 'Confessions ref', icon: <BookMarked/> }`.
- `ThreePanel`: switch branch `reference-boc → <ReferenceBocPanel/>`; add to `readerTab`/`selectRightTab` widening.

- [ ] **Step 1** Create `ReferenceBocPanel.tsx` per the contract (copy `ReferenceBiblePanel.tsx`; swap book-search for the 14-document picker; swap `ScriptureReader` for `BocReader`; new session key). Omit the drag handle.
- [ ] **Step 2** Add the `RIGHT_TABS` entry + `ThreePanel` branches.
- [ ] **Step 3 — Typecheck** clean.
- [ ] **Step 4 — Browser verify:** the "Confessions ref" sidebar tab shows an independent BoC reader; picking a document/section renders it; "Open in center" promotes it to a center pane; state persists across a reload (session key). Screenshot.
- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/library/ReferenceBocPanel.tsx src/renderer/src/components/navigation.ts src/renderer/src/components/ThreePanel.tsx
git commit -m "Add Confessions reference sidebar panel"
```

---

## Self-Review

**Spec coverage (Plan 2 scope):**
- `bocCitation` (paragraph-precise) → Task 1 ✓
- `'boc'` pane kind + store → Task 4 ✓
- `BocReader` / `BocPane` (document→section, source picker, `[N]` gutter, highlight-to-quote, no copyright gate) → Task 5 ✓
- Left-nav "Confessions" tab + `CENTER_EMPTY` → Task 6 ✓
- Commentary panel (parameterized, BoC lookup on section click, right-tab wiring + widening) → Task 7 ✓; `header_raw` surfaced-or-left noted ✓
- Reference sidebar panel → Task 8 ✓
- Quotes migration (`boc_source_id`/`boc_ref`) + write path + `citationForRow` branch → Task 3 ✓
- Notes: the spec's "sidebar note" integration is delivered via the highlight-to-quote path (a quote carries its `bocCitation`); the inline "type AC IV → clickable ref" Tiptap extension is explicitly a **non-goal/deferred** here (see Non-goals) — flagged, not silently dropped.
- Drag-and-drop, PanePicker, Projects, search filter UI → **Plan 3** (Task 8 explicitly excludes DnD).

**Type consistency:** `BocCiteRef` (Task 1) consumed by Task 3's `addBocQuote`; `BocCommentaryMatch`/`BocSource`/`BocSectionRow` (Plan 1 ipc.ts) used identically in Tasks 2/4/5/7/8; `navigateBoc`/`bocSectionClicked`/`showConfessions`/`addBocQuote` (Task 4) called by Tasks 5–8; ref format `CODE:ordinal` from `formatBocRef` used in Task 3.

**Verification honesty:** Tasks 1–3 are vitest-TDD (pure + backend). Tasks 4–8 are typecheck + browser-preview-gated because the codebase has no component-test infra — each names concrete browser checks, not "it works." The browser checks in Tasks 5/7/8 require an indexed Reader's Edition in the vault (run the Plan-1 converter first); Task 5 Step 5 notes this prerequisite.
