# Confessions Tab (Book of Concord) — Design Spec

Date: 2026-07-18
Status: Approved for planning

## Summary

Add a new left-nav tab, "Confessions," presenting the Book of Concord as a
reading experience that mirrors the Bible reader: a Document ↔ Article
structure (analogous to Book ↔ Chapter), multiple translation sources,
highlight-to-quote, sidebar notes, full-text search, clickable Scripture
proof-text cross-references, and a Commentary panel fed by the Reader's
Edition's per-article notes plus standalone expository books.

This is Phase 1 of a two-phase plan. Phase 2 (a separate future spec) adds a
"Church Fathers" tab (Father → Work → Chapter, one level deeper) reusing the
same architectural pattern established here. Nothing in this spec needs to be
reworked for Phase 2 to land — Phase 2 is additive.

## Goals

- A new nav tab that behaves like a first-class sibling to Scripture, not a
  bolted-on afterthought — same picker style, same translation switcher, same
  highlight/notes/commentary/search UX users already know from Bible reading.
- **Full parity across every surface that already lists note/bible/pdf/quotes
  content** — not just its own reader. This includes the new-tab/empty-state/
  Projects-add-source picker, the right-sidebar "Reference" tab, search (type,
  backend indexing, filter UI, result grouping), Projects' addable-item types,
  and drag-and-drop — see "Components & Integration Surfaces" below.
- A data model general enough that Phase 2 (Church Fathers) is additive, not
  a rebuild, without over-building abstraction Phase 1 doesn't need.
- Full feature parity with Bible reading: highlight → citeable quote, sidebar
  notes, full-text search, clickable proof-text cross-references into
  Scripture, and a Commentary panel populated per-article.
- Reuse existing converter infrastructure (`epub-to-md.mjs` / `pdf-to-md.mjs`)
  for ingestion rather than hand-authoring a full book-length volume as
  Markdown.

## Non-goals

- Church Fathers content or its 3-level (Father → Work → Chapter) hierarchy —
  Phase 2, separate spec.
- Reverse cross-references (a Bible chapter showing which Confession articles
  cite it) — proof-text links are one-directional (Confession → Bible) only.
- Resolving the Apology of the Augsburg Confession's German/Latin
  dual-numbering quirk — flagged as a content-modeling detail to verify
  against source material during implementation, not solved here.
- Reworking the pane/tab container model. This spec targets today's pane
  model on `main`. A separate, unmerged `worktree-tabbed-panes` branch
  replaces panes with tabs (`TabKind` there currently mirrors `PaneKind`
  minus `'empty'`, plus `'picker'`); if that branch merges first, every
  integration surface in this spec that touches `PaneKind` needs an
  equivalent, separately-applied change to `TabKind` and that branch's own
  copies of the picker/reference/search wiring — no change to the reader or
  data model itself, just where `'boc'` gets registered.

## Current state (for context)

**Navigation has no router** — `src/renderer/src/components/ThreePanel.tsx`
is the whole shell (left icon rail, center area, right sidebar). Left-nav
items are a static array, `LEFT_VIEWS` in
`src/renderer/src/components/navigation.ts:22-31`, rendered by the generic
`IconRail` primitive. Selecting one calls `saveLayout({ activeLeftView: id })`
and `ThreePanel.centerNode()` (lines 100-118) switches on `activeLeftView` to
render the matching view component. The right sidebar (`RIGHT_TABS`, same
file, lines 35-43) works identically via a switch in `ThreePanel.tsx:215-235`.
Adding a new top-level tab is mechanically cheap: an array entry, an
empty-state entry, and a switch case.

**The center workspace is pane-based** — `CenterWorkspace.tsx`/`PaneFrame.tsx`
render up to 2 resizable panes. `PaneKind` (`useStore.ts:39`) is a hardcoded
discriminated union (`'note' | 'bible' | 'pdf' | 'empty' | 'quotes'`).

**Bible content is code-based, not DB-based** — `src/shared/scriptureRef.ts`
defines a static `BOOKS` table (66 books, USFM codes, chapter counts,
testament) plus reference-parsing regexes. Verse text is fetched from a
remote API (BSB via bible.helloao.org) and cached as JSON blobs keyed by
`(translation, book, chapter)` in `scripture_cache`. `versification.ts` has a
static per-book verse-count table used as a bounds check.

**Commentary is the closest existing analog, but Bible-specific** — SQLite
tables `commentary_sources` (id, display_name, author, pdf_relative_path,
sort_order, status) and `commentary_excerpts` (source_id, book,
chapter_start/verse_start/chapter_end/verse_end, text, page_number,
confidence/flagged) — migration v14,
`src/main/db/migrations.ts:262-303`. Sources are canonical Markdown files in
a synced vault folder (`commentaries/`), produced offline by
`tools/pdf-to-md.mjs` / `tools/epub-to-md.mjs` and auto-indexed on startup
(mtime-based). Lookup is `lookupVerse(book, chapter, verse)`
(`commentary.ts:200-213`), a numeric range query. Clicking a verse
(`verseClicked`, `useStore.ts:932-941`) calls `api.lookupCommentary` and
switches the right sidebar to `CommentaryPanel.tsx`, which groups matches by
source. None of this generalizes past USFM book codes and numeric
chapter/verse ranges without changes.

**There is no generic "document/section" content type anywhere in the
codebase.** Every content family (Bible, Commentary, Library books) is a
concrete, Bible- or PDF-shaped table. This spec follows that existing idiom
— a parallel, concrete table pair for the Book of Concord — rather than
introducing a generic polymorphic schema.

## Data model

### Static reference structure

`src/shared/bookOfConcord.ts`, mirroring `scriptureRef.ts`'s `BOOKS` table.
The Book of Concord's document/article structure is fixed and stable across
translations (the same way Bible chapter/verse structure is stable across
translations), so it is authored once as a compiled TypeScript table, not
discovered dynamically:

```ts
export interface BocArticleDef {
  ordinal: number       // 1-based position — the canonical DB/range-query key
  number: string        // "I", "IV", "III.2" — display numbering (Roman numerals,
                        // part-qualified for SA), never used for ordering or storage
  label: string         // "Of Justification", "The Ten Commandments"
}

export interface BocDocumentDef {
  code: string          // 'CR-AP', 'CR-NI', 'CR-ATH' (the three creeds),
                        // 'AC', 'AP', 'SA', 'TR', 'SC', 'LC', 'FC-EP', 'FC-SD'
  title: string         // "Augsburg Confession"
  abbreviation: string
  articles: BocArticleDef[]
  sortOrder: number
}

export const BOC_DOCUMENTS: BocDocumentDef[]
```

**Ordinal vs. display number.** All DB columns (`boc_texts.article_ordinal`,
`boc_commentary_excerpts.article_start/article_end`) store the numeric
`ordinal`; range queries compare integers, exactly like chapter/verse
numbers. The Roman-numeral (or part-qualified) `number` string is resolved
through `BOC_DOCUMENTS` for display and citations only. Documents whose
internal structure isn't a flat article list — the Smalcald Articles (Parts
I–III, with articles inside Part III) and the catechisms (parts/chief
sections) — are flattened into one ordinal sequence per document, with the
part encoded in the display `number`/`label`.

Covers the three Ecumenical Creeds, Augsburg Confession, Apology, Smalcald
Articles, Treatise on the Power and Primacy of the Pope, Small Catechism,
Large Catechism, and the Formula of Concord (Epitome + Solid Declaration).

### Primary text (translations)

- **`boc_sources`** — mirrors `commentary_sources`: id, display_name (e.g.
  "Reader's Edition (CPH)", "Tappert", "Kolb-Wengert"), file_relative_path
  (vault path), sort_order, status.
- **`boc_texts`** — source_id (FK), document_code, article_ordinal, text
  (Markdown, with paragraph-anchor markers embedded inline — the article-level
  equivalent of verse markers inside a cached Bible chapter). One row per
  (source, document, article); a translation switch just re-queries this
  table for a different source_id, exactly like swapping Bible translations
  re-queries `scripture_cache` for a different translation key.

The Reader's Edition is dual-purpose: its confessional text becomes a
`boc_sources` row here, and its per-article notes (below) are extracted from
the same conversion pass into the commentary tables.

### Confessions commentary

- **`boc_commentary_sources`** — identical shape to `commentary_sources`.
- **`boc_commentary_excerpts`** — source_id (FK), document_code,
  article_start, article_end, text, page_number, confidence/flagged. Same
  range-keyed shape as `commentary_excerpts`, just keyed to
  (document_code, article_start/end) instead of (book,
  chapter_start/verse_start/chapter_end/verse_end). A commentary source can
  cover the whole Book of Concord (the Reader's Edition) or a single document
  (an expository book on just the Augsburg Confession) — same pattern as
  Kretzmann (whole Bible) vs. RHB's Hebrews commentary (one book) today.

Lookup: `lookupBocArticle(documentCode, articleOrdinal)` — same range-query
shape as `lookupVerse`.

### Quotes (highlight-to-quote storage)

The `quotes` table is not generic — each quote family has its own columns,
added by migration: `book_id` (book quotes), `scripture_ref` +
`scripture_translation` (scripture highlights, migration v11),
`commentary_source_id` + `commentary_ref` (commentary quotes, migration
v16). BoC highlights follow the same pattern with a new migration adding
**`boc_source_id`** (FK → `boc_sources`, identifying which translation the
quoted text came from) and **`boc_ref`** (canonical ref string, e.g.
`AC:IV.2`). Citation auto-generation extends the existing book / scripture /
commentary chain with a `bocCitation()` branch; `citation_override`
(migration v17) applies unchanged.

**No copyright gate.** `ScriptureReader` gates highlight-to-quote to
`provider === 'free-use'` because copyrighted API-served translations must
never be persisted (API terms). That gate must NOT be copied into
`BocReader`: BoC sources are user-owned local files, and migration v16's
commentary quotes already set the precedent — copyrighted text captured as a
quote "stays local, just like the vault + index it's drawn from." All BoC
translations are quotable.

**Shared code, separate tables.** Bible commentary and Confessions
commentary have identical shapes (source registry + range-keyed excerpts +
lookup-by-reference + panel display) but are kept as separate concrete SQL
tables — bending `commentary_excerpts`'s `book` column to also accept BoC
document codes risks quietly breaking Bible-only invariants used elsewhere
(66-book bounds checks via `VERSE_COUNTS`, testament grouping). Instead, the
query/indexing logic is refactored into one shared, parameterized module
(column mapping + table name as config), and `CommentaryPanel` becomes a
shared component parameterized by which lookup function and citation
formatter to use. Two tables, one implementation.

## Ingestion

Extend `epub-to-md.mjs` / `pdf-to-md.mjs` with a new detection mode for
Document/Article-structured sources, using TOC parsing to find document
boundaries — the same technique the tool already uses to detect Bible-book
boundaries, and the same pattern it already uses to auto-detect RHB-style vs.
ACCS-style commentary layouts internally. Output convention:
`# Document` (must resolve to a `BOC_DOCUMENTS` code) → `## Article N`
headings, mirroring the existing `# Book` / `## chap:verse` convention.

**Known risk, flagged rather than solved here:** the Reader's Edition
interleaves confessional text and editorial notes within the same source
(footnotes, sidebars, or similarly-styled blocks). The converter must
distinguish "this is confessional text" from "this is an editorial note"
within one file — likely via CSS class or footnote markup, the same way the
existing tool detects ACCS's structural markers (`<a class="apnf">`,
`int_niv1` vs. other spine files). The exact detection rule can't be nailed
down until the actual Reader's Edition EPUB/PDF structure is inspected.
Expected output: two Markdown files from one conversion pass — a
primary-text file (feeds `boc_texts`) and a commentary file (feeds
`boc_commentary_excerpts`).

## Components & Integration Surfaces

- **New pane kind `'boc'`** — added to the `PaneKind` union alongside `note`
  / `bible` / `pdf` / `quotes` / `empty`, with content fields
  `{ documentCode, articleOrdinal, bocSourceId }` (mirroring how a `bible`
  pane carries `book`/`chapter`/`translation`). Kept as its own concrete kind
  rather than a premature generic "document" kind; Phase 2 (Church Fathers)
  can add its own kind or extend this once its actual needs are known.
- **`BocReader.tsx`**, modeled directly on `ScriptureReader.tsx`: Document
  picker → Article picker (mirroring Book → Chapter), a translation dropdown
  populated from `boc_sources` for the current document, article text
  rendered with a paragraph-anchor gutter (mirroring verse numbers), inline
  or margin clickable proof-text cross-references (reusing
  `findReferences`/scripture navigation to jump into the Bible reader), and
  highlight-to-quote reusing the existing selection→quote flow with a
  generalized citation key (e.g. `AC:IV.2`). On article change, calls
  `lookupBocArticle` to populate the right-sidebar Commentary panel — the
  same flow as `verseClicked` → `lookupCommentary` today.
- **Left nav** — a `confessions` entry in `LEFT_VIEWS`, a `case` in
  `ThreePanel.centerNode()` rendering `BocLibraryView` (a picker grid of the
  ~10 documents, like the Bible book grid), and its own `CENTER_EMPTY`
  placeholder entry.
- **Citation format** — `bocCitation()` alongside `scriptureCitation()` in
  `src/shared/citation.ts`, e.g. `"AC IV, 2 (Reader's Edition)"`.
- **Notes** — same right-sidebar note editor, keyed to a boc article ref,
  following the existing Scripture-notes attachment pattern exactly.

Beyond its own reader, every existing content kind (`note`/`bible`/`pdf`/
`quotes`) also surfaces in several shared places across the app. `'boc'`
needs to reach the same surfaces, not just its own tab:

1. **`PanePicker.tsx`** — the single component behind *all three* of the
   new-tab picker, the whole-workspace-empty picker
   (`CenterWorkspace.tsx`, when no panes are open), and the Projects
   add-source picker (`PaneFrame.tsx`'s empty-pane case, with
   `restrictToProject` set). Needs a `'boc'` entry in the `AddTab` union, a
   "Confessions" browse section, a tab-strip button, and a dispatch branch
   in `onHit`/`place`.
2. **Right sidebar "Reference" tab strip (`RIGHT_TABS`)** — a new
   `reference-boc` tab id, a new `ReferenceBocPanel.tsx` (mirroring
   `ReferenceBiblePanel`/`ReferencePdfPanel` — a full-article reference view
   alongside whatever's open in the center), a branch in `ThreePanel.tsx`'s
   tab switch, and inclusion in the sidebar-widening logic that today
   special-cases `reference-pdf`/`reference-bible`/`commentary`.
3. **Search** — a new `SearchKind` value end-to-end: the type in
   `shared/ipc.ts`, indexing/removal functions in `main/services/search.ts`,
   a "Confessions" option in `SearchView.tsx`'s All/Books/Quotes/Notes/
   Scripture filter strip, and grouping/icon/label branches in
   `SearchResults.tsx`. `boc_texts` and `boc_commentary_excerpts` both feed
   the existing `search_fts` table.
4. **Projects (`ProjectItem` union)** — Projects can currently hold
   `book`/`note`/`scripture` items (not even `quotes` yet). A `boc` variant
   needs to be added here for a Confession article to be addable to a
   Project at all — the data-level counterpart to #1's picker UI.
5. **Drag-and-drop** — a new `application/x-loci-boc` MIME type, plumbed
   through the same set/read points as `-book`/`-note`/`-scripture`
   (`LibraryView.tsx`, `StandaloneNotesPanel.tsx`, `BacklinksPanel.tsx`,
   `ReferenceBiblePanel.tsx`, `ReferencePdfPanel.tsx`, and `PaneFrame.tsx`'s
   drop handler), so a Confession article can be dragged onto a Project or a
   note the same way a Bible passage can today.

**Targeted refactor, in scope:** there is no shared `contentKindIcon()`/
`kindLabel()` helper anywhere — every surface above (`PanePicker`,
`SearchResults`' `GroupThumb`, `PaneFrame`'s icon/title chain,
`QuoteGroupPane`'s title logic) duplicates its own ad hoc kind→icon/label
mapping. Adding `'boc'` means touching all of them by hand regardless of
whether this refactor happens; Phase 2 will be a *third* kind hitting the
same duplication. Extracting one shared helper is small, bounded, and
directly serves "appears everywhere consistently" — done as part of this
work, not deferred.

## Testing approach

Matches this codebase's existing pattern — logic-level `vitest`, no
component-rendering infra:

- `parseBocMarkdown` / `bocIndex` tests mirroring
  `commentaryMarkdown.test.ts` / `commentary.test.ts`.
- `lookupBocArticle` range-query tests mirroring `lookupVerse` tests.
- Store-level tests for the new `boc` pane kind and nav wiring.
- Search indexing/removal tests for the new `SearchKind` value, written
  fresh against an in-memory DB (there is no existing `search.ts` test
  suite to mirror — `library.test.ts`'s in-memory-DB setup is the pattern
  to follow).
- `PanePicker`'s new `'boc'` hit/place dispatch is a React component and
  can't be tested with the existing logic-level infra; its dispatch mapping
  is extracted into a small pure helper (content-from-hit) and that helper
  is tested directly.

## Open questions / risks

- **Converter text/note distinction** (see Ingestion) — needs the actual
  Reader's Edition EPUB/PDF in hand to determine the detection rule.
- **Numbering quirks across documents** — the Apology of the Augsburg
  Confession has a well-known German/Latin article-numbering discrepancy
  across editions; the Smalcald Articles and the catechisms have
  part-based rather than flat-article structure (handled by the
  ordinal-flattening rule in the data model, but the exact flattened lists
  need authoring). `BOC_DOCUMENTS`'s article lists need to be checked
  against the actual translation sources before being finalized, and
  `bocCitation()`'s format may need a documented convention for showing
  both Apology numberings.
- **Article-count table authorship** — `BOC_DOCUMENTS` must be hand-verified
  against a source text once during implementation (article counts, labels,
  sort order), the same one-time authoring cost `scriptureRef.ts`'s `BOOKS`
  table already paid for the Bible.
