# Confessions (Book of Concord) — Plan 3: Full Integration Surfaces

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a Book of Concord section a first-class citizen of every surface that already accepts a book, note, or Bible chapter — search results, Projects, and drag-and-drop — and collapse the ad hoc kind→icon/label duplication those surfaces have each grown.

**Architecture:** Nothing new is invented here; each task extends an existing union and the branches that switch on it. The one structural change is extracting the search-result grouping logic out of `SearchResults.tsx` into a pure, testable module (mirroring `bocGrouping.ts`), because the `'confession'` grouping bug is precisely the kind of thing a unit test pins down and a component can't.

**Tech Stack:** TypeScript, Electron (main/preload/renderer), React 18 + Zustand 5, better-sqlite3 + FTS5, `vitest` (logic-level only — no component tests exist).

## This is Plan 3 of 3

Spec: `docs/superpowers/specs/2026-07-18-confessions-boc-design.md` (§"Integration surfaces", items 1–5). Plan 1 (data foundation) and Plan 2 (reader & nav) are **merged to main**.

**Two of the spec's five Plan 3 items were already delivered ahead of schedule** during Plan 2, because the tabbed-panes merge made them prerequisites rather than polish:

| Spec item | Status |
|---|---|
| 1. `PanePicker` Confessions browse section | **Done** — commit `04f9563`. Unrestricted mode only; Task 3 below finishes the `restrictToProject` half. |
| 2. `reference-boc` tab + `ReferenceBocPanel` + sidebar widening | **Done** — commit `64473f4` (Plan 2 Task 8). |
| 3. Search: `'confession'` end-to-end in the renderer | **Task 1** below. |
| 4. Projects: `boc` variant in `ProjectItem` | **Task 2** below. |
| 5. Drag-and-drop: `application/x-loci-boc` | **Task 4** below. |
| — Shared `contentKindIcon()`/`kindLabel()` refactor | **Task 5** below. |

**Ordering is not arbitrary.** Task 1 must land before Task 2: the moment a Project's item scope includes BoC (Task 2), matching confession rows flow into the restricted `PanePicker`'s `SearchResults`, where an unextended `SearchHit.kind` mislabels and breaks them. Shipping Task 2 first would ship a knowingly broken surface.

## Verification model (READ THIS)

Unchanged from Plan 2. This codebase has **no component/render test infra** (tests are logic-level `vitest` — no Testing Library/jsdom):

- **Pure & backend tasks** (search grouping helpers, `isProjectItem`, `sameProjectItem`, the search `items` scope) → vitest TDD, run with `npm test -- <path>` (the native-ABI wrapper; **never** `npx vitest`).
- **UI tasks** (component branches, drag handles, picker rendering) → the gate is `npm run typecheck` (clean, both configs) **plus a live browser check**. Each UI task lists explicit checks.
- **`npm test` fails with `EBUSY … better_sqlite3.node` if the Electron app is running.** Close Loci before running the suite.

## Global Constraints

- **Ref-string format** (Plan 1, unchanged): `formatBocRef(code, ordinal)` → `"AC:4"`; `parseBocRef` inverts it. Both in `src/shared/bookOfConcord.ts`.
- **Confession rows reuse `book_id`.** `indexBocForSearch` (`search.ts:200`) writes `search_fts` rows with `kind='confession'`, `book_id = <BoC source id>`, `ref = formatBocRef(...)`, `page = NULL`, `title = <section label>`. **This is the root of the grouping bug**: every existing grouping/thumbnail path checks `bookId` first and would treat a BoC source id as a library book id. Any new branch on `'confession'` MUST be tested *before* the `bookId` check.
- **`SearchKind` already includes `'confession'`** (`ipc.ts:561`, Plan 1). It is `SearchHit['kind']` and `HitRow['kind']` that are unextended — do not "fix" `SearchKind`.
- **Migration discipline:** append only; next free version is **20** (v19 is the highest, `'boc-quotes'`). No task in this plan needs a migration — `ProjectItem` lives in note frontmatter, not the DB.
- **Project items persist as JSON in note frontmatter** (`noteFrontmatter.ts`, `items:` line). `isProjectItem` is a validating filter — an unrecognized kind is silently dropped on read, so the validator must be extended in the same commit as the union.
- **Test/typecheck commands:** `npm test -- <path>` for one suite; `npm run typecheck` for both tsconfigs.

## Non-goals (deferred)

- **Inline BoC-reference recognition in notes** (typing "AC IV" → clickable ref, à la the `ScriptureRef` Tiptap extension). Still deferred; needs a from-scratch tokenizer for BoC's document+section scheme.
- **Multi-source ordinal alignment** (Plan 1 follow-up).
- **`quotes` as a `ProjectItem` kind** — noted in the spec as also missing, but out of scope here; this plan adds `boc` only.
- **Full-text indexing of `boc_commentary_excerpts`** — deliberately lookup-only, mirroring the Bible precedent where `commentary_excerpts` is reached via `lookupVerse` and never enters `search_fts`.

---

## File Structure

- **Create** `src/renderer/src/lib/searchGrouping.ts` + `.test.ts` — `groupKeyFor`, `groupTitleFor`, `childLabelFor` (pure, extracted from `SearchResults.tsx`).
- **Modify** `src/shared/ipc.ts` — `SearchHit['kind']` gains `'confession'`; `ProjectItem` gains the `boc` variant.
- **Modify** `src/main/services/search.ts` — `HitRow['kind']` gains `'confession'`; the `items` scope gains a BoC branch.
- **Modify** `src/main/services/search.boc.test.ts` — cover the `items` scope.
- **Modify** `src/renderer/src/components/library/SearchResults.tsx` — consume the extracted helpers; `GroupThumb` gains a confession icon.
- **Modify** `src/renderer/src/components/library/SearchView.tsx` — `KINDS` gains a Confessions chip; `onHit` gains a `'confession'` branch.
- **Modify** `src/renderer/src/lib/noteFrontmatter.ts` + `.test.ts` — `isProjectItem` accepts `boc`.
- **Modify** `src/renderer/src/store/useStore.ts` — `sameProjectItem` handles `boc`.
- **Modify** `src/renderer/src/components/library/PanePicker.tsx` — restricted-mode BoC sources + add-to-project from the Confessions tab.
- **Modify** `src/renderer/src/components/library/ReferenceBocPanel.tsx` — drag handle.
- **Modify** `src/renderer/src/components/library/PaneFrame.tsx` — `projectItemFromDrag` gains a `boc` branch.
- **Create** `src/renderer/src/lib/contentKind.tsx` — shared `contentKindIcon()`/`kindLabel()`.
- **Modify** `TabStrip.tsx`, `SearchResults.tsx`, `PanePicker.tsx`, `QuotesView.tsx` — consume the shared helper.

---

## Task 1: `'confession'` search hits — grouping, labels, and navigation

This is the spec's **hard acceptance criterion**, carried forward from the Plan 1 Task 6 review. Today a confession hit groups as a fake "book" (because `groupKeyFor` checks `bookId` first, and confession rows carry the BoC source id there), renders a broken cover thumbnail, and is unclickable (`onHit` has no branch).

**Files:**
- Create: `src/renderer/src/lib/searchGrouping.ts`
- Test: `src/renderer/src/lib/searchGrouping.test.ts`
- Modify: `src/shared/ipc.ts` (`SearchHit['kind']`, ~line 573)
- Modify: `src/main/services/search.ts` (`HitRow['kind']`, line 12)
- Modify: `src/renderer/src/components/library/SearchResults.tsx`
- Modify: `src/renderer/src/components/library/SearchView.tsx`

**Interfaces:**
- Consumes: `SearchHit` from `@shared/ipc`; `bocDocument`, `parseBocRef` from `@shared/bookOfConcord`.
- Produces:
  - `function groupKeyFor(h: SearchHit): string` — `"c:AC"` for confessions, `"b:<id>"` for book-backed hits, `"s:<ref>"` for scripture, `"notes"` otherwise.
  - `function groupTitleFor(h: SearchHit, bookTitle: (id: string) => string | undefined): string`
  - `function childLabelFor(h: SearchHit, pageOffset: number): string`

- [ ] **Step 1: Write the failing test**

Create `src/renderer/src/lib/searchGrouping.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { groupKeyFor, groupTitleFor, childLabelFor } from './searchGrouping'
import type { SearchHit } from '@shared/ipc'

const hit = (over: Partial<SearchHit> = {}): SearchHit => ({
  kind: 'page',
  bookId: null,
  ref: null,
  page: null,
  title: '',
  snippet: '',
  usedInCount: 0,
  ...over
})

describe('searchGrouping', () => {
  // Confession rows reuse search_fts.book_id for the BoC *source* id, so the confession
  // check must win over the bookId check or they group as a phantom library book.
  it('groups confession hits by document, not by their source id', () => {
    const h = hit({ kind: 'confession', bookId: 'src-1', ref: 'AC:6', title: 'Justification' })
    expect(groupKeyFor(h)).toBe('c:AC')
  })
  it('still groups book-backed hits by book', () => {
    expect(groupKeyFor(hit({ kind: 'page', bookId: 'b1' }))).toBe('b:b1')
    expect(groupKeyFor(hit({ kind: 'quote', bookId: 'b1' }))).toBe('b:b1')
  })
  it('still groups scripture by chapter ref and bundles notes', () => {
    expect(groupKeyFor(hit({ kind: 'scripture', ref: 'JHN:3' }))).toBe('s:JHN:3')
    expect(groupKeyFor(hit({ kind: 'note', ref: 'a/b.md' }))).toBe('notes')
  })

  it('titles a confession group with the document name', () => {
    const h = hit({ kind: 'confession', bookId: 'src-1', ref: 'AC:6', title: 'Justification' })
    expect(groupTitleFor(h, () => undefined)).toBe('Augsburg Confession')
  })
  it('titles a book group from the library, falling back to the hit title', () => {
    const h = hit({ kind: 'page', bookId: 'b1', title: 'Fallback' })
    expect(groupTitleFor(h, () => 'Real Title')).toBe('Real Title')
    expect(groupTitleFor(h, () => undefined)).toBe('Fallback')
  })

  it('labels a confession child with its section label', () => {
    const h = hit({ kind: 'confession', bookId: 'src-1', ref: 'AC:6', title: 'Justification' })
    expect(childLabelFor(h, 0)).toBe('Justification')
  })
  it('labels other kinds as before', () => {
    expect(childLabelFor(hit({ kind: 'note', title: 'My Note' }), 0)).toBe('My Note')
    expect(childLabelFor(hit({ kind: 'scripture', page: 16 }), 0)).toBe('v. 16')
    expect(childLabelFor(hit({ kind: 'page', bookId: 'b1', page: 30 }), 4)).toBe('p. 26')
    expect(childLabelFor(hit({ kind: 'quote', bookId: 'b1' }), 0)).toBe('Quote')
  })
})
```

- [ ] **Step 2: Run → FAIL**

Run: `npm test -- src/renderer/src/lib/searchGrouping.test.ts`
Expected: FAIL — `Failed to resolve import "./searchGrouping"`.

- [ ] **Step 3: Widen the two `kind` unions**

In `src/shared/ipc.ts`, on the `SearchHit` interface (~line 573):

```ts
  kind: 'page' | 'quote' | 'note' | 'scripture' | 'confession'
```

In `src/main/services/search.ts`, on `HitRow` (line 12):

```ts
  kind: 'page' | 'quote' | 'note' | 'scripture' | 'confession'
```

- [ ] **Step 4: Implement `searchGrouping.ts`**

```ts
import { bocDocument, parseBocRef } from '@shared/bookOfConcord'
import type { SearchHit } from '@shared/ipc'

/** The document a confession hit belongs to, from its "AC:6" ref.
 *  NB: `parseBocRef` returns `{ code, ordinal }` — the field is `code`, not `documentCode`. */
function confessionDocCode(h: SearchHit): string | null {
  if (!h.ref) return null
  return parseBocRef(h.ref)?.code ?? null
}

/** Group hits by document (confession), book (page/quote), chapter ref (scripture), or
 *  bundle notes together.
 *
 *  The confession check MUST come first: those rows reuse `book_id` for the BoC source id,
 *  so a `bookId`-first check groups them as a library book that doesn't exist. */
export function groupKeyFor(h: SearchHit): string {
  if (h.kind === 'confession') return `c:${confessionDocCode(h) ?? '?'}`
  if (h.bookId) return `b:${h.bookId}`
  if (h.kind === 'scripture' && h.ref) return `s:${h.ref}`
  return 'notes'
}

export function groupTitleFor(h: SearchHit, bookTitle: (id: string) => string | undefined): string {
  if (h.kind === 'confession') {
    const code = confessionDocCode(h)
    return (code ? bocDocument(code)?.title : undefined) ?? code ?? 'Confessions'
  }
  if (h.bookId) return bookTitle(h.bookId) ?? h.title
  if (h.kind === 'scripture') return h.title
  return 'Notes'
}

/** `pageOffset` is the book's front-matter offset, so PDF pages read as printed pages. */
export function childLabelFor(h: SearchHit, pageOffset: number): string {
  if (h.kind === 'note') return h.title || 'Note'
  if (h.kind === 'confession') return h.title || 'Section'
  if (h.kind === 'scripture') return h.page != null ? `v. ${h.page}` : '—'
  if (h.page != null) return `p. ${h.page - pageOffset}`
  return h.kind === 'quote' ? 'Quote' : '—'
}
```

- [ ] **Step 5: Run → PASS**

Run: `npm test -- src/renderer/src/lib/searchGrouping.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 6: Consume the helpers in `SearchResults.tsx`**

Delete the local `groupKeyFor` (lines 9–13) and the `childLabel` closure (lines 132–141). Import instead:

```ts
import { groupKeyFor, groupTitleFor, childLabelFor } from '../../lib/searchGrouping'
```

Replace the group-building block's title expression so it uses the helper:

```ts
  results.forEach((h, i) => {
    const key = groupKeyFor(h)
    let g = byKey.get(key)
    if (!g) {
      const title = groupTitleFor(h, (id) => books.find((b) => b.id === id)?.title)
      g = { key, title, bookId: h.bookId, kind: h.kind, items: [] }
      byKey.set(key, g)
      groups.push(g)
    }
    g.items.push({ h, i })
  })
```

Replace the `childLabel` call site (line 169) with:

```tsx
                      <span className="hit-child-loc">
                        {childLabelFor(h, books.find((b) => b.id === h.bookId)?.pageOffset ?? 0)}
                      </span>
```

- [ ] **Step 7: Fix `GroupThumb` for confessions**

A confession group's `bookId` is a BoC source id — passing it to `api.getCover` requests a cover that doesn't exist. Change the component to ignore `bookId` when the kind is `'confession'`. Add `BookMarked` to the lucide import at the top of the file, then:

```tsx
function GroupThumb({ bookId, kind, books }: { bookId: string | null; kind: string; books: Book[] }) {
  // A confession group's bookId is a BoC *source* id, not a library book — never look up a cover.
  const isConfession = kind === 'confession'
  const book = bookId && !isConfession ? books.find((b) => b.id === bookId) : undefined
  const [src, setSrc] = useState<string | null>(() => (book ? (getCachedCover(book.id) ?? null) : null))
```

and the fallback return:

```tsx
  if (src) return <img className="hit-thumb" src={src} alt="" draggable={false} />
  return (
    <div className="hit-thumb hit-thumb-fallback">
      {isConfession ? (
        <BookMarked size={15} />
      ) : bookId ? (
        <BookOpen size={15} />
      ) : kind === 'scripture' ? (
        <ScrollText size={15} />
      ) : (
        <FileText size={15} />
      )}
    </div>
  )
```

- [ ] **Step 8: Add the Confessions filter chip and the `onHit` branch in `SearchView.tsx`**

Extend `KINDS` (line 7):

```ts
const KINDS: { id: SearchKind; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'page', label: 'Books' },
  { id: 'quote', label: 'Quotes' },
  { id: 'note', label: 'Notes' },
  { id: 'scripture', label: 'Scripture' },
  { id: 'confession', label: 'Confessions' }
]
```

Add the store action and the dispatch branch. Near the other store hooks:

```ts
  const navigateBoc = useStore((s) => s.navigateBoc)
```

and add to `onHit` (after the scripture branch):

```ts
    else if (h.kind === 'confession' && h.ref) {
      const parsed = parseBocRef(h.ref)
      if (parsed) navigateBoc(parsed.code, parsed.ordinal)
    }
```

with the import:

```ts
import { parseBocRef } from '@shared/bookOfConcord'
```

- [ ] **Step 9: Typecheck and run the full suite**

Run: `npm run typecheck` — expected: clean, both configs.
Run: `npm test` — expected: all files pass, no regressions.

- [ ] **Step 10: Browser verify**

- Open Search, type a term you know appears in the Augsburg Confession (e.g. `justification`).
- Confirm: a group headed **Augsburg Confession** with a bookmark icon (not a blank/broken cover thumb), children labelled with section names.
- Click the **Confessions** filter chip → only confession hits remain.
- Click a child hit → a BoC pane opens/navigates to that section.
- `read_console_messages`: no errors (especially no failed `getCover` calls).
- Screenshot as proof.

- [ ] **Step 11: Commit**

```bash
git add src/renderer/src/lib/searchGrouping.ts src/renderer/src/lib/searchGrouping.test.ts \
  src/shared/ipc.ts src/main/services/search.ts \
  src/renderer/src/components/library/SearchResults.tsx \
  src/renderer/src/components/library/SearchView.tsx
git commit -m "Handle 'confession' search hits end-to-end in the renderer"
```

---

## Task 2: `boc` variant in `ProjectItem` (data + scoping)

**Files:**
- Modify: `src/shared/ipc.ts` (`ProjectItem`, line 520)
- Modify: `src/renderer/src/lib/noteFrontmatter.ts` (`isProjectItem`, line 29)
- Test: `src/renderer/src/lib/noteFrontmatter.test.ts` (extend)
- Modify: `src/renderer/src/store/useStore.ts` (`sameProjectItem`, line 71)
- Modify: `src/main/services/search.ts` (the `items` scope, ~line 45)
- Test: `src/main/services/search.boc.test.ts` (extend)

**Interfaces:**
- Consumes: `formatBocRef` from `@shared/bookOfConcord`.
- Produces: `ProjectItem` gains `| { kind: 'boc'; documentCode: string; ordinal: number }`.

- [ ] **Step 1: Write the failing frontmatter test**

Extend `src/renderer/src/lib/noteFrontmatter.test.ts`:

```ts
  it('round-trips a boc project item', () => {
    const raw = [
      '---',
      'type: project',
      'items: [{"kind":"boc","documentCode":"AC","ordinal":6}]',
      '---',
      '',
      'Body'
    ].join('\n')
    const { fm } = parseFrontMatter(raw)
    expect(fm.items).toEqual([{ kind: 'boc', documentCode: 'AC', ordinal: 6 }])
  })

  it('drops a malformed boc item', () => {
    const raw = ['---', 'items: [{"kind":"boc","documentCode":"AC"}]', '---', '', 'Body'].join('\n')
    expect(parseFrontMatter(raw).fm.items).toEqual([])
  })
```

(Match the file's existing import of `parseFrontMatter`.)

- [ ] **Step 2: Run → FAIL**

Run: `npm test -- src/renderer/src/lib/noteFrontmatter.test.ts`
Expected: FAIL — the first test gets `[]`, because `isProjectItem` rejects the unknown kind.

- [ ] **Step 3: Extend the union and the validator**

`src/shared/ipc.ts` (line 520):

```ts
export type ProjectItem =
  | { kind: 'book'; id: string }
  | { kind: 'note'; path: string }
  | { kind: 'scripture'; book: string; chapter: number }
  | { kind: 'boc'; documentCode: string; ordinal: number }
```

`src/renderer/src/lib/noteFrontmatter.ts` (line 29), add before the final `return false`:

```ts
  if (o.kind === 'boc') return typeof o.documentCode === 'string' && typeof o.ordinal === 'number'
```

- [ ] **Step 4: Run → PASS**

Run: `npm test -- src/renderer/src/lib/noteFrontmatter.test.ts`
Expected: PASS.

- [ ] **Step 5: Extend `sameProjectItem`**

`src/renderer/src/store/useStore.ts` (line 71), add before the final `return false`:

```ts
  if (a.kind === 'boc' && b.kind === 'boc') {
    return a.documentCode === b.documentCode && a.ordinal === b.ordinal
  }
```

- [ ] **Step 6: Write the failing search-scope test**

Extend `src/main/services/search.boc.test.ts` (reuse its existing in-memory-DB + indexed-source harness):

```ts
  it('scopes a search to a project’s BoC sections', () => {
    // Harness: index a source whose AC:6 section contains "justification".
    const hits = search('justification', {
      kind: 'all',
      items: [{ kind: 'boc', documentCode: 'AC', ordinal: 6 }]
    })
    expect(hits.map((h) => h.ref)).toContain('AC:6')
  })

  it('excludes BoC sections that are not in the project', () => {
    const hits = search('justification', {
      kind: 'all',
      items: [{ kind: 'boc', documentCode: 'AC', ordinal: 999 }]
    })
    expect(hits).toEqual([])
  })
```

- [ ] **Step 7: Run → FAIL**

Run: `npm test -- src/main/services/search.boc.test.ts`
Expected: FAIL — the first returns `[]`, because an items scope with no recognized kinds compiles to the `'0'` (match-nothing) predicate.

- [ ] **Step 8: Implement the scope branch**

In `src/main/services/search.ts`, inside `if (scope.items) { … }`, alongside the existing `scriptureRefs` block:

```ts
    const bocRefs = scope.items
      .filter((i) => i.kind === 'boc')
      .map((i) => formatBocRef(i.documentCode as BocDocumentCode, i.ordinal))
    bocRefs.forEach((r, i) => (params[`br${i}`] = r))
    if (bocRefs.length) {
      parts.push(
        `(search_fts.kind = 'confession' AND search_fts.ref IN (${bocRefs.map((_, i) => `@br${i}`).join(',')}))`
      )
    }
```

`formatBocRef` and `BocDocumentCode` are **already imported** at `search.ts:3` (used by `indexBocForSearch`) — no import change needed.

- [ ] **Step 9: Run → PASS**

Run: `npm test -- src/main/services/search.boc.test.ts`
Expected: PASS.
Run: `npm run typecheck` — clean.
Run: `npm test` — no regressions.

- [ ] **Step 10: Commit**

```bash
git add src/shared/ipc.ts src/renderer/src/lib/noteFrontmatter.ts \
  src/renderer/src/lib/noteFrontmatter.test.ts src/renderer/src/store/useStore.ts \
  src/main/services/search.ts src/main/services/search.boc.test.ts
git commit -m "Add 'boc' ProjectItem variant and scope project search to it"
```

---

## Task 3: BoC as a project source in `PanePicker` (UI — typecheck + browser)

Task 2 made a BoC project item representable and searchable; this makes it reachable. Today the picker's Confessions tab is hidden whenever `restrictToProject` is set (commit `04f9563` guarded it deliberately, since the item kind didn't exist yet).

**Files:**
- Modify: `src/renderer/src/components/library/PanePicker.tsx`

**Interfaces:**
- Consumes: `ProjectItem`'s `boc` variant (Task 2); `bocDocument` from `@shared/bookOfConcord`; `bocSectionLabel` from `../../lib/bocGrouping`; existing `addProjectItem`/`removeProjectItem` store actions.

- [ ] **Step 1: Add a label helper and the restricted-mode item list**

Near `scriptureLabel` (line ~29):

```tsx
/** Human label for a BoC project item, e.g. "AC §6". */
function bocItemLabel(item: { documentCode: string; ordinal: number }): string {
  return `${bocDocument(item.documentCode)?.abbreviation ?? item.documentCode} §${item.ordinal}`
}
```

Alongside `scriptureItems` (line ~100):

```tsx
  const bocItems = restrictToProject
    ? restrictToProject.filter((i): i is Extract<ProjectItem, { kind: 'boc' }> => i.kind === 'boc')
    : []
  const bocHits = bocItems.filter((b) => !ql || bocItemLabel(b).toLowerCase().includes(ql))
```

- [ ] **Step 2: Render the project's BoC sources**

In the restricted-mode `pp-scroll` block, directly after the Scripture section:

```tsx
              {bocHits.length > 0 && <div className="pp-sec">Confessions</div>}
              {bocHits.map((b) => (
                <div className="pp-row" key={`${b.documentCode}:${b.ordinal}`}>
                  <button
                    className="pp-item"
                    onClick={() => placeBoc(b.documentCode, b.ordinal)}
                    onContextMenu={(e) =>
                      onContextMenu(e, {
                        kind: 'boc',
                        documentCode: b.documentCode,
                        sectionOrdinal: b.ordinal,
                        bocSourceId
                      })
                    }
                  >
                    <BookMarked size={14} />
                    <span className="pp-item-title">{bocItemLabel(b)}</span>
                  </button>
                  <button
                    className="pp-remove"
                    title="Remove from project"
                    onClick={() => void removeProjectItem(b)}
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
```

- [ ] **Step 3: Un-hide the Confessions browse tab and make it add-aware**

Remove the `{!restrictToProject && (…)}` wrapper added in `04f9563` so the tab button always renders:

```tsx
            <button
              className={`pp-add-tab${browseTab === 'confessions' ? ' active' : ''}`}
              onClick={() => setBrowseTab('confessions')}
            >
              <BookMarked size={13} /> Confessions
            </button>
```

Also delete the now-stale comment above the `BrowseTab` type (`// 'confessions' is unrestricted-mode only …`).

In the Confessions browse panel, make the section button add-or-open, mirroring how the Notes/Library tabs behave, and suppress the context menu in restricted mode:

```tsx
                          <button
                            key={r.ordinal}
                            className="pp-item pp-boc-section"
                            title={
                              restrictToProject
                                ? `Add ${d.abbreviation} ${bocSectionLabel(r)} to this project`
                                : `Open ${d.abbreviation} ${bocSectionLabel(r)}`
                            }
                            onClick={() =>
                              restrictToProject
                                ? void addProjectItem({ kind: 'boc', documentCode: d.code, ordinal: r.ordinal })
                                : placeBoc(d.code, r.ordinal)
                            }
                            onContextMenu={(e) =>
                              restrictToProject
                                ? e.preventDefault()
                                : onContextMenu(e, {
                                    kind: 'boc',
                                    documentCode: d.code,
                                    sectionOrdinal: r.ordinal,
                                    bocSourceId
                                  })
                            }
                          >
                            <span className="pp-item-title">{bocSectionLabel(r)}</span>
                            {restrictToProject && <Plus size={12} className="pp-add-icon" />}
                          </button>
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck` — clean.

- [ ] **Step 5: Browser verify**

- Open a Project note; in its sibling pane the picker shows the project's sources.
- The **Confessions** browse tab is now visible in restricted mode; expand a document and click a section → it's added to the project (a `+` affordance, not a navigation).
- The added section appears under a **Confessions** heading in the top sources list, with a working remove (`X`).
- Type a query in the project search box → content matches from that BoC section appear (this exercises Task 2's scope through Task 1's renderer).
- Reload the app → the item survives (frontmatter round-trip).
- Screenshot.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/library/PanePicker.tsx
git commit -m "Allow Confession sections to be added to Projects from the picker"
```

---

## Task 4: Drag-and-drop (`application/x-loci-boc`)

**Files:**
- Modify: `src/renderer/src/components/library/ReferenceBocPanel.tsx` (drag handle)
- Modify: `src/renderer/src/components/library/PaneFrame.tsx` (`projectItemFromDrag`, line 14)

**Interfaces:**
- Consumes: `ProjectItem`'s `boc` variant (Task 2).
- Payload format: `application/x-loci-boc` carries `"<documentCode>:<ordinal>"` — the same shape `formatBocRef` produces, and the same convention `application/x-loci-scripture` uses (`"<book>:<chapter>"`).

- [ ] **Step 1: Extend the drop reader**

`src/renderer/src/components/library/PaneFrame.tsx`, replacing `projectItemFromDrag` (lines 13–22):

```tsx
/** Read whichever project-item drag payload is present on a drop event, if any. */
function projectItemFromDrag(
  e: React.DragEvent
): { kind: 'book' | 'note' | 'scripture' | 'boc'; value: string } | null {
  const bookId = e.dataTransfer.getData('application/x-loci-book')
  if (bookId) return { kind: 'book', value: bookId }
  const notePath = e.dataTransfer.getData('application/x-loci-note')
  if (notePath) return { kind: 'note', value: notePath }
  const scripture = e.dataTransfer.getData('application/x-loci-scripture')
  if (scripture) return { kind: 'scripture', value: scripture }
  const boc = e.dataTransfer.getData('application/x-loci-boc')
  if (boc) return { kind: 'boc', value: boc }
  return null
}
```

- [ ] **Step 2: Handle the dropped item**

In `onDropItem` (line 61), replace the trailing `else` with explicit branches so a malformed payload can't fall through into the scripture path:

```tsx
    if (dragged.kind === 'book') void addProjectItem({ kind: 'book', id: dragged.value })
    else if (dragged.kind === 'note') void addProjectItem({ kind: 'note', path: dragged.value })
    else if (dragged.kind === 'scripture') {
      const [book, chapterStr] = dragged.value.split(':')
      if (book && chapterStr) void addProjectItem({ kind: 'scripture', book, chapter: Number(chapterStr) })
    } else {
      const [documentCode, ordinalStr] = dragged.value.split(':')
      if (documentCode && ordinalStr) {
        void addProjectItem({ kind: 'boc', documentCode, ordinal: Number(ordinalStr) })
      }
    }
```

- [ ] **Step 3: Add the drag handle to `ReferenceBocPanel`**

Import `GripVertical` from `lucide-react`, then add as the first child of `.ref-bible-head` (mirroring `ReferenceBiblePanel.tsx:90-100`):

```tsx
        <span
          className="ref-drag-handle"
          draggable
          title="Drag this section into a project"
          onDragStart={(e) => {
            e.dataTransfer.setData('application/x-loci-boc', `${documentCode}:${sectionOrdinal}`)
            e.dataTransfer.effectAllowed = 'copy'
          }}
        >
          <GripVertical size={14} />
        </span>
```

The existing `.ref-drag-handle` CSS already covers this — no stylesheet change.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck` — clean.

- [ ] **Step 5: Browser verify**

- Open a Project note in one pane; open the **Confessions ref** sidebar tab.
- Drag its grip handle onto the project pane → the section is added to the project (appears in the picker's sources list, survives reload).
- Regression: drag a chapter from the **Bible** ref panel the same way → still adds a scripture item.
- Screenshot both.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/library/ReferenceBocPanel.tsx \
  src/renderer/src/components/library/PaneFrame.tsx
git commit -m "Add application/x-loci-boc drag-and-drop into Projects"
```

---

## Task 5: Shared `contentKindIcon()` / `kindLabel()` helper

The spec calls this **in scope, not deferred**: every surface duplicates its own kind→icon/label mapping, and Phase 2 will be a third kind hitting the same duplication.

**As-built note:** the spec names "`PaneFrame`'s icon/title chain" as a duplication site. The tabbed-panes merge moved that chain into `TabStrip.tsx`'s `tabTitle` — target `TabStrip`, not `PaneFrame`.

**Files:**
- Create: `src/renderer/src/lib/contentKind.tsx` (`.tsx` — it returns JSX)
- Test: `src/renderer/src/lib/contentKind.test.ts` (label logic only; icons aren't unit-testable here)
- Modify: `src/renderer/src/components/library/TabStrip.tsx`
- Modify: `src/renderer/src/components/library/SearchResults.tsx`

**Interfaces:**
- Produces:
  - `type ContentKind = 'pdf' | 'note' | 'bible' | 'boc' | 'quotes' | 'picker'`
  - `function contentKindIcon(kind: ContentKind, size?: number): React.ReactNode`
  - `function quoteGroupLabel(g: QuoteGroupRef): string`

Scope discipline: this task is a **pure refactor** — no behavior changes, no new features. If a call site's current output differs from the helper's, preserve the call site's output and note it; don't "fix" it here.

- [ ] **Step 1: Write the failing test**

Create `src/renderer/src/lib/contentKind.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { quoteGroupLabel } from './contentKind'

describe('quoteGroupLabel', () => {
  it('labels each quote-group type', () => {
    expect(quoteGroupLabel({ type: 'book', bookId: 'b', title: 'Institutes' })).toBe('Institutes')
    // `translation` is required on the scripture variant; `chapter` is the optional one
    // ("every chapter of this book" grouping mode).
    expect(quoteGroupLabel({ type: 'scripture', book: 'JHN', chapter: 3, translation: 'BSB', name: 'John' })).toBe(
      'John 3'
    )
    expect(quoteGroupLabel({ type: 'scripture', book: 'JHN', translation: 'BSB', name: 'John' })).toBe('John')
    expect(quoteGroupLabel({ type: 'commentary', sourceId: 's', displayName: 'Kretzmann' })).toBe('Kretzmann')
    expect(quoteGroupLabel({ type: 'boc', documentCode: 'AC', bocSourceId: 's', name: 'Augsburg' })).toBe('Augsburg')
    expect(quoteGroupLabel({ type: 'author', author: 'Luther' })).toBe('Luther')
    expect(quoteGroupLabel({ type: 'tag', tag: 'grace' })).toBe('#grace')
    // `tag` is a required string, so the fallback covers the empty-tag case, not a missing field.
    expect(quoteGroupLabel({ type: 'tag', tag: '' })).toBe('Untagged')
  })
})
```

- [ ] **Step 2: Run → FAIL**

Run: `npm test -- src/renderer/src/lib/contentKind.test.ts`
Expected: FAIL — unresolved import.

- [ ] **Step 3: Implement `contentKind.tsx`**

Lift the label chain verbatim from `TabStrip.tsx`'s `tabTitle` (lines 34–50) so behavior is identical:

```tsx
import { FileText, BookOpen, ScrollText, BookMarked, Quote, FilePlus } from 'lucide-react'
import type { QuoteGroupRef } from '../store/workspace'

export type ContentKind = 'pdf' | 'note' | 'bible' | 'boc' | 'quotes' | 'picker'

/** One icon per content kind, shared by the tab strip, the picker, and search results, so a
 *  Confession looks the same everywhere it appears. */
export function contentKindIcon(kind: ContentKind, size = 13): React.ReactNode {
  switch (kind) {
    case 'pdf':
      return <BookOpen size={size} />
    case 'note':
      return <FileText size={size} />
    case 'bible':
      return <ScrollText size={size} />
    case 'boc':
      return <BookMarked size={size} />
    case 'quotes':
      return <Quote size={size} />
    case 'picker':
      return <FilePlus size={size} />
  }
}

export function quoteGroupLabel(g: QuoteGroupRef): string {
  if (g.type === 'book') return g.title
  if (g.type === 'scripture') return g.chapter != null ? `${g.name} ${g.chapter}` : g.name
  if (g.type === 'commentary') return g.displayName
  if (g.type === 'boc') return g.name
  if (g.type === 'author') return g.author
  return g.tag ? `#${g.tag}` : 'Untagged'
}
```

- [ ] **Step 4: Run → PASS**

Run: `npm test -- src/renderer/src/lib/contentKind.test.ts`
Expected: PASS.

- [ ] **Step 5: Consume in `TabStrip.tsx`**

Rewrite `tabTitle` to delegate, keeping its exact return shape and fallback strings:

```tsx
function tabTitle(
  tab: Tab,
  books: { id: string; title: string }[],
  notes: { path: string; title: string }[]
): { icon: React.ReactNode; label: string } {
  if (tab.kind === 'pdf') {
    return {
      icon: contentKindIcon('pdf'),
      label: books.find((b) => b.id === tab.bookId)?.title ?? 'Document'
    }
  }
  if (tab.kind === 'note') {
    return {
      icon: contentKindIcon('note'),
      label: notes.find((n) => n.path === tab.notePath)?.title ?? 'Note'
    }
  }
  if (tab.kind === 'bible') {
    const label =
      tab.book && tab.chapter != null ? `${bookByCode(tab.book)?.name ?? tab.book} ${tab.chapter}` : 'Bible'
    return { icon: contentKindIcon('bible'), label }
  }
  if (tab.kind === 'boc') {
    const doc = tab.documentCode ? bocDocument(tab.documentCode) : undefined
    return {
      icon: contentKindIcon('boc'),
      label: doc?.abbreviation ?? tab.documentCode ?? 'Confessions'
    }
  }
  if (tab.kind === 'quotes') {
    return {
      icon: contentKindIcon('quotes'),
      label: tab.quotesGroup ? quoteGroupLabel(tab.quotesGroup) : 'Quotes'
    }
  }
  return { icon: contentKindIcon('picker'), label: 'New Tab' }
}
```

Drop the now-unused lucide imports from `TabStrip.tsx` (keep `Plus`/`X`, which its buttons still use).

- [ ] **Step 6: Consume in `SearchResults.tsx`**

Replace `GroupThumb`'s fallback icon chain with the shared helper:

```tsx
  if (src) return <img className="hit-thumb" src={src} alt="" draggable={false} />
  const iconKind: ContentKind = isConfession
    ? 'boc'
    : bookId
      ? 'pdf'
      : kind === 'scripture'
        ? 'bible'
        : 'note'
  return <div className="hit-thumb hit-thumb-fallback">{contentKindIcon(iconKind, 15)}</div>
```

- [ ] **Step 7: Typecheck and run the full suite**

Run: `npm run typecheck` — clean.
Run: `npm test` — no regressions.

- [ ] **Step 8: Browser verify (regression sweep — this task changes no behavior)**

- Open one tab of each kind (PDF, note, Bible, Confessions, a quote group, a blank picker) → every tab shows the same icon and label text as before.
- Search results → group thumbnails unchanged for books/notes/scripture, bookmark icon for confessions.
- Screenshot the tab strip with all kinds open.

- [ ] **Step 9: Commit**

```bash
git add src/renderer/src/lib/contentKind.tsx src/renderer/src/lib/contentKind.test.ts \
  src/renderer/src/components/library/TabStrip.tsx \
  src/renderer/src/components/library/SearchResults.tsx
git commit -m "Extract shared contentKindIcon/quoteGroupLabel helpers"
```

---

## Self-Review

**Spec coverage (§"Integration surfaces", items 1–5 + the targeted refactor):**
- 1. `PanePicker` Confessions browse section → **delivered in Plan 2** (`04f9563`); restricted-mode half → Task 3 ✓
- 2. `reference-boc` tab + `ReferenceBocPanel` + widening → **delivered in Plan 2** (`64473f4`) ✓
- 3. Search `'confession'` end-to-end, incl. the carried-forward `SearchHit.kind`/`groupKeyFor`/`onHit` acceptance criterion → Task 1 ✓ (all three named symbols are explicitly changed; `groupKeyFor` is additionally pinned by a unit test asserting confession-before-`bookId`)
- 4. Projects `ProjectItem` `boc` variant → Task 2 ✓ (union + validator + equality + search scoping)
- 5. Drag-and-drop `application/x-loci-boc` → Task 4 ✓
- Shared `contentKindIcon()`/`kindLabel()` refactor → Task 5 ✓ (spec's `kindLabel` is realized as `quoteGroupLabel`, since the only genuinely duplicated label logic is the quote-group chain — tab/book/note labels are single-source lookups, not duplication)

**Scope note:** the spec's DnD item lists `LibraryView`/`StandaloneNotesPanel`/`BacklinksPanel`/`ReferencePdfPanel` among the plumbing points. Those are *sources* of book/note drags and have no BoC content to drag — Task 4 touches only the two points that actually move a BoC section (`ReferenceBocPanel` as source, `PaneFrame` as sink). Not an omission.

**Type consistency:** `ProjectItem`'s `boc` member uses `{ documentCode, ordinal }` in Task 2 and is destructured with those exact names in Tasks 3 and 4. `SearchHit['kind']` gains `'confession'` in Task 1 and is relied on by Tasks 1/2/5. `formatBocRef`/`parseBocRef` produce and consume the same `"AC:6"` string in Task 1 (renderer), Task 2 (search scope), and Task 4 (drag payload). `ContentKind` (Task 5) is a distinct union from `SearchHit['kind']` and from `Tab['kind']` — deliberately, since it names *visual* kinds; Task 5 Step 6 maps between them explicitly.

**Verification honesty:** Tasks 1, 2, and 5 carry real vitest coverage (grouping helpers, frontmatter round-trip, search scoping, quote-group labels). Tasks 3 and 4 are typecheck + browser-gated because they are pure component wiring with no unit-testable seam — each names concrete browser checks rather than "it works." Task 1's browser step exists on top of its unit tests because the mislabeling bug is only visible in rendered output.
