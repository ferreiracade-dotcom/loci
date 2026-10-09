# Church Fathers (CCEL ThML) — Design

Date: 2026-10-09 · Status: approved

## Goal

A searchable, Scripture-linked Church Fathers corpus in Loci built from CCEL's ThML editions of
the Schaff series: ANF 1–10, NPNF¹ 1–14, NPNF² 1–14 (38 volumes). ThML is kept as the source of
truth — no Markdown conversion — because it carries parsed Scripture references (`osisRef`),
anchored endnotes, original page breaks, and a stable div hierarchy that Markdown would lose.

## v1 scope

1. Read + full-text search
2. Scripture cross-references (osisRef → structured refs)
3. Footnotes (popover) + original page numbers for citations ("ANF 1:6")
4. Quotes from selected text
5. Catena view — Fathers citing the Bible verses you're reading, grouped by verse, ordered by date
6. Author view — one page per Father: dates + all works across volumes

Out of scope: CCEL MP3 audio, Schaff's subject index browse, Notes/Graph wikilinks, in-app
downloader, Greek/Hebrew handling beyond pass-through.

## Source files

- `vault/fathers/<code>.xml` (e.g. `anf01.xml`, `npnf205.xml`), copied unchanged from
  `https://www.ccel.org/ccel/s/schaff/<code>.xml`. CCEL permits personal/non-profit use.
- Synced on startup like Confessions (`syncBocFolder` pattern): new or changed (mtime) files are
  (re)indexed; the mtime cache is shared via `shouldReindex`.

### ThML shape (observed in anf01.xml)

- `div1` (author group, e.g. "CLEMENT OF ROME") → `div2` (work) → `div3` (chapter); each div has
  `id` (e.g. `ii.ii.v`), `n`, `title`, `shorttitle`, `prev`/`next`.
- Each contained work has its own `ThML.head` with `electronicEdInfo/authorID` (e.g.
  `clement_rome`) and `DC.Title`.
- Inline: `scripRef osisRef="Bible:1Pet.5.1-1Pet.5.5" passage="1 Pet. v. 1-5"`,
  `note n="25" place="end"` (contains `p.endnote`), `pb n="vi"`, `index` (subject index),
  `i`, `span class="sc"`, `l`, `verse`, `p`, `h1–h4`.
- No author dates anywhere in the file.

## Architecture

Approach A: parse ThML at index time into SQLite.

### Parser — `src/main/services/thml.ts`

Pure module, no DB access. Input: XML string. Output:

```ts
interface ThmlVolume {
  code: string            // 'anf01'
  title: string           // DC.Title of the volume head
  sections: ThmlSection[]
}
interface ThmlSection {
  id: string              // CCEL div id, e.g. 'ii.ii.v'
  ordinal: number         // reading order within volume
  depth: number           // div level
  titles: string[]        // ancestor titles, outermost first, own title last
  shortTitle: string
  authorId: string | null // from enclosing contained-work head; fallback derived from div1 title
  workTitle: string | null
  editorial: boolean      // intro notes / prefaces / editor matter
  html: string            // sanitized display HTML (allow-list)
  text: string            // plain text for FTS (notes excluded)
  refs: ThmlRef[]
  notes: ThmlNote[]
  pages: ThmlPage[]
}
interface ThmlRef { anchor: string; osis: string; passage: string;
  book: string; chapterStart: number; verseStart: number | null;
  chapterEnd: number; verseEnd: number | null; charOffset: number }
interface ThmlNote { anchor: string; n: string; html: string }
interface ThmlPage { n: string; charOffset: number }
```

Rules:

- Streaming SAX parser, pure JS (`saxes`) — no native build.
- A section = the deepest `divN` that has text. Text in a parent div before its first child div
  becomes its own section (preface/intro) so nothing is dropped.
- `scripRef` → `<a class="scripref" data-osis="…">passage text</a>` + `ThmlRef`.
  Unparseable osisRef → kept as plain text, counted in a warnings list.
- `note` → `<sup class="fn" data-note="anchor">n</sup>` + `ThmlNote`; note text excluded from
  `text`.
- `pb` → `<span class="pb" data-page="n"></span>` + `ThmlPage`.
- `index` dropped. Allow-listed tags: `p, i, em, b, sup, sub, br, span.sc, h3–h4, blockquote,
  l` (→ line div), `verse` (→ div.verse). Unknown tags: keep text, drop tag, log warning.
- `editorial` = title matches /introductory note|preface|introductory notice|elucidation/i, or
  section under the volume's front-matter div1.
- Parser returns `{ volume, warnings }`; never throws on content, only on non-XML input.

### Data model (new migration)

- `fathers_volumes(code PK, series, number, title, file_key, mtime, status, error, indexed_at)`
  — series ∈ `anf | npnf1 | npnf2`; status ∈ `indexed | error | unindexed`.
- `fathers_sections(volume_code, id, ordinal, depth, titles_json, short_title, author_id,
  work_title, editorial, html, text, PK(volume_code,id))`
- `fathers_scripture_refs(volume_code, section_id, anchor, osis, passage, book, chapter_start,
  verse_start, chapter_end, verse_end)` + index on `(book, chapter_start, chapter_end)`
- `fathers_notes(volume_code, section_id, anchor, n, html)`
- `fathers_pages(volume_code, section_id, n, char_offset)`
- `fathers_authors(id PK, name, sort_year, dates_label, bio)` — seeded from
  `src/main/data/fathersAuthors.ts` (curated, ~80 entries).
- `quotes` gains `fathers_volume, fathers_section_id, fathers_page, fathers_paragraph`.
- Search: rows in existing `search_fts` with `kind='father'`, `book_id=volume_code`,
  `ref=section id`, `page=page n of section start`, `title=short title`.

### Indexing — `src/main/services/fathersIndex.ts`

`syncFathersFolder()` scans `vault/fathers/*.xml` at startup (after Confessions), reindexes
changed volumes in a transaction (delete volume rows → insert), then rewrites its FTS rows.
Per-volume failures set `status='error'` and continue.

### Catena query

Given `(book, chapter)` and optional verse: refs whose range overlaps, joined to sections and
authors, grouped by verse, ordered by `sort_year` then volume/ordinal. Snippet = ~200 chars of
section text around the ref's `charOffset`.

## UI

- Left rail: `fathers` entry (icon `Church`/`Landmark`) → `showFathers()` focuses or opens a tab
  `{ kind: 'fathers', volumeCode, sectionId }`; last position kept in session (`lastFathers`).
- `FathersPane`: drawer with toggle **Volumes** (series → volume → author → work → section) /
  **Authors** (ordered by date; selecting opens author page: name, dates, works across
  volumes with links). Reader on the right.
- `FathersReader`: breadcrumb, section title, sanitized HTML. `a.scripref` click → show passage
  in Texts panel (bible mode). `sup.fn` → popover with note HTML. `span.pb` → faint margin
  label `p. N`. Editorial sections get an "Editor" tag. Selection → colour picker → quote.
- Right panel: `CorpusMode` gains `fathers`; `MODES_FOR_PILL`: quotes += fathers,
  commentary += fathers. Commentary/fathers = catena for the current Bible passage (same
  `commentaryLookup` trigger as Bible commentary). Clicking an entry opens a fathers tab.
- Quotes: citation "Author, *Work* Section (SERIES vol:page)", e.g.
  "Irenaeus, *Against Heresies* III.3 (ANF 1:415)"; filed under `notes/fathers/<author>.md`.
- Search: `SearchKind` += `father`; hits open the fathers tab at the section.

## Errors

- Unreadable/malformed file → volume `status='error'` + message shown in drawer; others index.
- Unparseable osisRef → plain text, counted.
- Author missing from curated table → shown undated, sorted last; listed by the validator.

## Testing

- Vitest, small hand-written ThML fixtures (real volumes not committed):
  parser hierarchy, parent-text sections, notes, pages, refs (single, range, cross-chapter,
  bad), unknown tags, editorial flag, author attribution.
- Index test against in-memory SQLite: sections, FTS rows, catena ordering by date.
- `tools/validate-thml.mjs`: run over all 38 real volumes → per-volume section/note/ref counts,
  failed refs, undated authors.
- Live GUI checks done by the user from a handed-over checklist.

## Delegation

Mechanical work (author table, fixtures, IPC/preload boilerplate, drawer/reader components,
tests scaffolding) goes to Sonnet/Haiku subagents; parser, design decisions and reviews stay in
the main session.
