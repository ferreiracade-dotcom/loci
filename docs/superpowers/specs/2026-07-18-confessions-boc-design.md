# Confessions Tab (Book of Concord) — Design Spec

Date: 2026-07-18
Status: Approved for planning

## Summary

Add a new left-nav tab, "Confessions," presenting the Book of Concord as a
reading experience that mirrors the Bible reader: a Document ↔ Section
structure (analogous to Book ↔ Chapter, where a "section" is any navigable
unit — Preface, Article, catechism part, Conclusion), multiple translation
sources, paragraph-precise highlight-to-quote, sidebar notes, full-text
search, clickable Scripture proof-text cross-references, and a Commentary
panel fed by the Reader's Edition's per-section study notes and editor's
introductions plus standalone expository books. The corpus is the full Book
of Concord including its three appendices (Catalog of Testimonies, Brief
Exhortation to Confession, Saxon Visitation Articles). Grounded in the actual
Concordia Reader's Edition EPUB (CPH, 2nd ed. 2018), inspected during design.

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
  Scripture, and a Commentary panel populated per-section.
- Reuse existing converter infrastructure (`epub-to-md.mjs`) for ingestion
  rather than hand-authoring a full book-length volume as Markdown.

## Non-goals

- Church Fathers content or its 3-level (Father → Work → Chapter) hierarchy —
  Phase 2, separate spec.
- Reverse cross-references (a Bible chapter showing which Confession sections
  cite it) — proof-text links are one-directional (Confession → Bible) only.
- Multi-source section-ordinal alignment (a second commentary source keyed to
  traditional numbers) — Plan 1 targets the Reader's Edition only; see
  "Remaining risks."
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

Grounded in the actual source: the Concordia Reader's Edition EPUB (CPH, 2nd
ed. 2018), inspected during design. Its markup cleanly separates the two
content layers — `<p class="ch_note">` paragraphs are the editorial study
notes ("Note: …"), and `<p class="indent">`/`indent1`/`noindent` paragraphs
are the confessional text, which already carries the traditional `[N]`
paragraph numbers inline (`[1] Our churches teach…`). See "Ingestion."

### Static reference structure — documents only

`src/shared/bookOfConcord.ts`, mirroring `scriptureRef.ts`'s `BOOKS` table,
but **listing only the documents, not their internal sections.** Unlike the
Bible (whose whole canon must be navigable offline before any text is
fetched), a BoC document is always read from a local source file that already
contains its full structure — so sections are *discovered from the indexed
source*, not pre-authored. This deliberately avoids hand-authoring every
article/section of all 14 documents (and the Apology's dual-numbering, the
Smalcald parts, the catechism sub-structure) into a static table that could
drift from the real text.

```ts
export type BocDocumentCode =
  | 'CR-AP' | 'CR-NI' | 'CR-ATH'          // the three Ecumenical Creeds
  | 'AC' | 'AP' | 'SA' | 'TR'             // Augsburg, Apology, Smalcald, Treatise
  | 'SC' | 'LC'                           // Small & Large Catechisms
  | 'FC-EP' | 'FC-SD'                     // Formula of Concord: Epitome, Solid Declaration
  | 'CT' | 'BEC' | 'SVA'                  // appendices (see below)

export interface BocDocumentDef {
  code: BocDocumentCode
  title: string          // "Augsburg Confession"
  abbreviation: string   // "AC"
  sortOrder: number      // nav order; creeds first, appendices last
}

export const BOC_DOCUMENTS: BocDocumentDef[]   // 14 entries (3 creeds + 8 confessions + 3 appendices)
```

The three **appendices** appear at the end of the Confessions nav, after the
Formula of Concord: `CT` Catalog of Testimonies, `BEC` A Brief Exhortation to
Confession, `SVA` Saxon Visitation Articles. All three ship in the Reader's
Edition and are historic appended matter of the Book of Concord.

### Sections (discovered) + primary text (translations)

A **section** is any navigable unit within a document — a Preface, a numbered
Article, a catechism commandment/petition, a Part header's leaf, a Conclusion.
Sections are discovered from the converted source during indexing, not
pre-declared.

- **`boc_sources`** — mirrors `commentary_sources`: id, display_name (e.g.
  "Reader's Edition (CPH)", "Tappert", "Kolb-Wengert"), md_relative_path
  (vault path), sort_order, status.
- **`boc_texts`** — source_id (FK), document_code, section_ordinal (1-based
  nav position within the document, assigned in file order during
  conversion — the canonical numeric key for range queries), section_number
  (nullable display string: `"IV"`, `"II (I)"` for the Apology's dual
  numbering, `"III.1"` for Smalcald Part III Article 1, or null for a
  Preface), section_label (`"Justification"`, `"Preface"`), section_part
  (nullable grouping label, e.g. `"Part III"` or `"The Ten Commandments"`,
  for the reader to group sections under a heading), text (Markdown, with the
  `[N]` paragraph markers preserved inline — the section-level equivalent of
  verse markers in a cached Bible chapter). One row per (source, document,
  section). A translation switch just re-queries this table for a different
  source_id, exactly like swapping Bible translations re-queries
  `scripture_cache`.

The Reader's Edition is dual-purpose: its confessional text becomes a
`boc_sources` row here, and its `ch_note` study notes are extracted from the
same conversion pass into the commentary tables (below), sharing one
`section_ordinal` space so a note lines up with its section.

### Confessions commentary

- **`boc_commentary_sources`** — identical shape to `commentary_sources`.
- **`boc_commentary_excerpts`** — source_id (FK), document_code,
  section_start, section_end, text, header_raw. Same range-keyed shape as
  `commentary_excerpts`, keyed to (document_code, section ordinal range)
  instead of (book, chapter/verse range). A commentary source can cover the
  whole Book of Concord (the Reader's Edition's study notes + editor's
  introductions) or a single document (an expository book on just the
  Augsburg Confession) — same pattern as Kretzmann (whole Bible) vs. RHB's
  Hebrews commentary today. Each document's **Editor's Introduction** is
  indexed here too, attached to the document's first section.

Lookup: `lookupBocSection(documentCode, sectionOrdinal)` — same range-query
shape as `lookupVerse`.

**Cross-source ordinal alignment (flagged for later).** `section_ordinal` is
defined by the primary source's file order. The Reader's Edition supplies both
the primary text and its own notes in one conversion pass, so their ordinals
align by construction. A *second* commentary source (an expository book) that
refers to sections by traditional number would need its numbers mapped to the
primary source's ordinals at index time. Plan 1 targets the Reader's Edition
only (self-consistent); multi-source alignment is a documented follow-up, not
a Plan 1 concern.

### Quotes (highlight-to-quote storage)

The `quotes` table is not generic — each quote family has its own columns,
added by migration: `book_id` (book quotes), `scripture_ref` +
`scripture_translation` (scripture highlights, migration v11),
`commentary_source_id` + `commentary_ref` (commentary quotes, migration
v16). BoC highlights follow the same pattern with a new migration adding
**`boc_source_id`** (FK → `boc_sources`, identifying which translation the
quoted text came from) and **`boc_ref`** (canonical ref string). The ref is
paragraph-precise: `<CODE>:<sectionOrdinal>` locates the section, and the
citation appends the highlighted `[N]` paragraph number(s), rendering as e.g.
**"AC IV, 2 (Reader's Edition)"** — the traditional citation form, made
possible because the `[N]` markers are preserved in the section text.
Citation auto-generation extends the existing book / scripture / commentary
chain with a `bocCitation()` branch; `citation_override` (migration v17)
applies unchanged.

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

**The Markdown contract is the format-agnostic seam.** Everything downstream
(`parseBocMarkdown`, the indexer, service, search, IPC) consumes only the
canonical Markdown (`# Document` / `## ordinal | number | label | part`), so a
source's original format is entirely a *converter* concern. Two source formats
exist, each with its own converter, both emitting the same contract:

- **EPUB (e.g. the Reader's Edition) — `boc-epub-to-md.mjs`.** Rich CSS classes
  make the text-vs-note split clean (table below). The Reader's Edition is the
  one *dual-purpose* source (primary text + study notes interleaved), which the
  classes disambiguate.
- **PDF (most other translations and commentaries) — a `boc-pdf-to-md.mjs`
  variant of the existing `pdf-to-md.mjs`.** PDFs have no CSS classes, so
  section boundaries are detected from text/font patterns ("ARTICLE IV", "PART
  III", catechism headings) the way `pdf-to-md.mjs` already detects Bible
  `chap:verse` markers. Crucially, PDF sources are **single-purpose** — a
  translation is entirely primary text, a commentary is entirely commentary —
  so there is *no in-file text/note split* to perform; the user picks the
  source type (translation vs commentary) at convert time and all body text
  routes to the one corresponding file. This makes PDF conversion structurally
  simpler than the EPUB dual-split, at the cost of less reliable
  section-boundary detection (may need light per-source tuning, as the old
  commentary PDF pipeline did). A PDF that were itself dual-purpose (text +
  notes interleaved without markup to separate them) would be the hard case;
  see Open questions.

The EPUB detection rule — the open risk in the first draft — is now **settled
by inspecting the actual EPUB.** The Reader's Edition's per-element CSS classes
are unambiguous:

| Class | Meaning | Routed to |
|---|---|---|
| `article` + `ch_h1a` | "ARTICLE IV" + "Justification" (number + title) | opens a section |
| `ch_h` | Preface / Conclusion / part & section headers | opens a section |
| `ch_note` | editorial study note ("Note: …") | commentary file |
| `indent` / `indent1` / `noindent` / `left` / `bq` / `ext` | confessional text, with `[N]` markers | primary-text file |
| `toc1` / `toc2` (in the ToC file only) | Editor's Introduction headings | drive intro extraction → commentary |

**Output:** two Markdown files from one conversion pass, both using the
contract `# <Document>` (resolves via `documentCodeFromName`) → `## <section
heading>` (e.g. `## Article IV: Justification`, `## Preface`; the parser
assigns `section_ordinal` by file order and parses the display number/label
from the heading). The primary-text file's section bodies are the confessional
paragraphs (with `[N]` preserved); the commentary file's section bodies are
the `ch_note` study notes, plus each document's Editor's Introduction attached
to its first section. Both share the same ordinal space by construction.

Either converter is validated by round-tripping its output through
`parseBocMarkdown` and comparing per-document section counts against the
source's own table of contents (which gives the authoritative section list) —
a mismatch means a section was dropped or mis-split.

**Plan scope note:** Plan 1's Task 8 builds the EPUB converter (Reader's
Edition). The PDF converter for additional translations/commentaries is a
sibling task (Task 9, or a Plan 1 addendum) done after the EPUB path
validates; it changes no app-side code — only tooling that emits the same
Markdown contract.

## Components & Integration Surfaces

- **New pane kind `'boc'`** — added to the `PaneKind` union alongside `note`
  / `bible` / `pdf` / `quotes` / `empty`, with content fields
  `{ documentCode, sectionOrdinal, bocSourceId }` (mirroring how a `bible`
  pane carries `book`/`chapter`/`translation`). Kept as its own concrete kind
  rather than a premature generic "document" kind; Phase 2 (Church Fathers)
  can add its own kind or extend this once its actual needs are known.
- **`BocReader.tsx`**, modeled directly on `ScriptureReader.tsx`: Document
  picker → Section picker (mirroring Book → Chapter; sections grouped under
  their `section_part` heading where present, e.g. Smalcald's three Parts, the
  catechisms' chief parts), a translation dropdown populated from `boc_sources`
  for the current document, section text rendered with the `[N]` paragraph
  numbers as a gutter (mirroring verse numbers), inline or margin clickable
  proof-text cross-references (reusing `findReferences`/scripture navigation to
  jump into the Bible reader), and highlight-to-quote reusing the existing
  selection→quote flow with a paragraph-precise citation key. On section
  change, calls `lookupBocSection` to populate the right-sidebar Commentary
  panel — the same flow as `verseClicked` → `lookupCommentary` today.
- **Left nav** — a `confessions` entry in `LEFT_VIEWS`, a `case` in
  `ThreePanel.centerNode()` rendering `BocLibraryView` (a picker grid of the
  14 documents, like the Bible book grid), and its own `CENTER_EMPTY`
  placeholder entry.
- **Citation format** — `bocCitation()` alongside `scriptureCitation()` in
  `src/shared/citation.ts`, e.g. `"AC IV, 2 (Reader's Edition)"` (document
  abbreviation + section number + highlighted paragraph number).
- **Notes** — same right-sidebar note editor, keyed to a boc section ref,
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
   **Plan 1 built the backend half** (the `'confession'` `SearchKind` value +
   `indexBocForSearch`/`removeBocFromSearch`, which store rows with the BoC
   source id in the reused `book_id` column and `ref` = `formatBocRef(...)`).
   **Plan 3 acceptance criterion (carried forward from Task 6 review):** the
   renderer read-path was intentionally left untouched, so once BoC content is
   indexed, a `'confession'` hit currently groups as a fake "book"
   (`SearchResults.groupKeyFor` checks `bookId` first) and is unclickable
   (`SearchView.onHit` has no `'confession'` branch). Plan 3 MUST extend
   `SearchHit.kind` (`ipc.ts`), `HitRow.kind` (`search.ts`), and
   `SearchResults.tsx`'s `groupKeyFor`/`childLabel`/icon plus `SearchView.tsx`'s
   `onHit` to handle `'confession'` explicitly (open the BoC reader at the
   `ref`'d section). Treat this as a hard acceptance test for the Plan 3 search
   surface, not an optional polish.
4. **Projects (`ProjectItem` union)** — Projects can currently hold
   `book`/`note`/`scripture` items (not even `quotes` yet). A `boc` variant
   needs to be added here for a Confession section to be addable to a
   Project at all — the data-level counterpart to #1's picker UI.
5. **Drag-and-drop** — a new `application/x-loci-boc` MIME type, plumbed
   through the same set/read points as `-book`/`-note`/`-scripture`
   (`LibraryView.tsx`, `StandaloneNotesPanel.tsx`, `BacklinksPanel.tsx`,
   `ReferenceBiblePanel.tsx`, `ReferencePdfPanel.tsx`, and `PaneFrame.tsx`'s
   drop handler), so a Confession section can be dragged onto a Project or a
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
  `commentaryMarkdown.test.ts` / `commentary.test.ts` — including section
  discovery (ordinal-by-file-order, number/label parsing from the heading).
- `lookupBocSection` range-query tests mirroring `lookupVerse` tests.
- Store-level tests for the new `boc` pane kind and nav wiring.
- Search indexing/removal tests for the new `SearchKind` value, written
  fresh against an in-memory DB (there is no existing `search.ts` test
  suite to mirror — `library.test.ts`'s in-memory-DB setup is the pattern
  to follow).
- `PanePicker`'s new `'boc'` hit/place dispatch is a React component and
  can't be tested with the existing logic-level infra; its dispatch mapping
  is extracted into a small pure helper (content-from-hit) and that helper
  is tested directly.

## Resolved during design (was: open risks)

- **Converter text/note distinction** — RESOLVED by inspecting the actual
  Reader's Edition EPUB. The `ch_note` vs. `indent*` CSS-class split (see the
  Ingestion table) is unambiguous; no heuristic guessing needed.
- **Numbering quirks (Apology dual-numbering, Smalcald parts, catechism
  structure)** — RESOLVED by the documents-only static table + discovered
  sections. Because sections come from the source and store their own
  `section_number` string, the Apology's `"II (I)"` dual numbering and
  Smalcald's `"III.1"` part-qualified numbers are captured verbatim from the
  text; nothing is hand-flattened into a static table that could drift.
- **Article-count authorship** — ELIMINATED. `BOC_DOCUMENTS` lists only the
  14 documents (titles + order), which are trivially verifiable; the per-
  document section lists that would have needed source-verification are no
  longer authored at all.

## Remaining risks

- **Cross-source ordinal alignment** — a second commentary source that refers
  to sections by traditional number needs number→ordinal mapping at index
  time. Plan 1 targets the Reader's Edition only (self-consistent); flagged
  as a follow-up.
- **Heading-parse coverage** — the converter must correctly open a section for
  every navigable unit (Preface, each Article, Conclusion, part leaves,
  appendix sections) across all 14 documents' varied layouts. Guarded by the
  round-trip section-count check against the ToC, but the varied catechism /
  Catalog-of-Testimonies / Saxon-Visitation layouts are where mis-splits are
  most likely and warrant a manual spot-check after conversion.
