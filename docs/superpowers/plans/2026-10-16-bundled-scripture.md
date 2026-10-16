# Bundled Scripture (BSB, BLB, interlinear, topical index) Implementation Plan

**Goal:** Ship the Berean Standard Bible, Berean Literal Bible, the BSB word-level interlinear (Hebrew/Greek, Strong's, parsing) and the BSB topical index inside the installer, so Scripture reads fully offline. `bible.helloao.org` stays only for BSB audio links; ESV/NKJV/NASB via keys are unchanged.

**Spec / constraints (binding):**
- Raw sources live in `tools/sources/bsb/` (gitignored, already populated): `bsb_usfm.zip` (66 USFM books), `bsb_tables.tsv` (754k rows, one per original word), `bsb_topical_index.xlsx`, `blb.txt` (full-Bible BLB, `Genesis 1:1<TAB>text`, 3 header lines then a `Verse<TAB>…` header row). Never commit raw sources; commit only the converted outputs under `resources/scripture/`.
- All sources are public domain (BSB: Berean Bible Translation Committee, dedicated 2023; BLB file header states PD). No new runtime npm dependencies. Converters are dev tools in `tools/`, matching the style of the existing `tools/*.mjs|py` (docstring with usage, deterministic output, a short test where the repo already tests converters, e.g. `tools/boc-parts.test.mjs`).
- Book codes: output keyed by the app's own codes (`src/shared/scriptureRef.ts`, `bookByCode`). Map USFM/TSV book names to them; fail loudly on an unmapped book.
- Verse numbering follows the source. BSB omits some verses (e.g. Matt 17:21): store verses as `[number, text]` pairs, never assume contiguity.
- Plain verse text only: strip USFM markup, footnote bodies, `\r` cross-reference lines, headings, HTML fragments (`<p class=|hdg|>`, `<br />`, links). Normalise the odd characters (the BSB uses typographic quotes/apostrophes; keep them as proper Unicode, never `?`).
- Output budget: keep `resources/scripture/` committed size reasonable (target < 60 MB total). Interlinear is per-book JSON so it loads lazily.
- Highlights/quote saving stays BSB-only (`addScriptureHighlight` guard unchanged). Search indexing stays BSB-only.
- Never run, drive or screenshot the user's live app. Stop at typecheck + tests (`npm run typecheck`, `npx vitest run`); the user does live checks.
- Commit on branch `feat/bundled-scripture`; commit message trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Task 1: Converters and bundled data
Create converters that read `tools/sources/bsb/` and write into `resources/scripture/`:
- `BSB.json`, `BLB.json`: `{ "<CODE>": { "<chapter>": [[verse, "text"], ...] } }` (BLB covers OT+NT; text keeps its `[was]` supplied-word brackets as-is).
- `topics.json`: `{ "<Topic name>": ["Exodus 17:12", ...] }` as in the xlsx (read the xlsx without adding a runtime dep; python `zipfile`+XML parse or a dev-only approach is fine; shared strings + sheet1 XML are large but streamable). Keep refs as the source's strings.
- `interlinear/<CODE>.json`: per book `{ "<chapter>": { "<verse>": [ { o: original, t: translit, s: "H7225"|"G976", p: short parsing, e: BSB English for that word } ... ] } }`. Skip padding/blank rows in the TSV. Keep reading order (the tsv's `BSB Sort`/`Heb Sort`/`Greek Sort` columns: decide the right order for display and document it). Only include columns the reader will need.
- A `tools/README`-style docstring at the top of each converter (usage line + "as Loci ships it" example), like the existing converters. Add a small test (node or python, matching what the repo runs) covering: verse-pair extraction incl. a missing verse, markup stripping, book code mapping. Report sizes of all outputs and counts (books, chapters, verses, words) in the report.

## Task 2: Runtime bundled provider + packaging
- `electron-builder.yml`: add `resources/scripture` → `scripture` to `extraResources`.
- `src/main/services/scripture.ts`: add a `'bundled'` provider (extend `ScriptureProvider` in `src/shared/ipc.ts`). BSB and a new `BLB` ("Berean Literal Bible") are served from `resources/scripture/<ID>.json` (dev: repo `resources/scripture`; packaged: `process.resourcesPath/scripture`; mirror how `bundledCommentaryDir()` resolves). Load each translation file lazily once and keep it in memory. Bundled chapters never touch `scripture_cache`. Both are in `instantRegistry()`. Copyright strings: BSB `Berean Standard Bible (BSB). Public domain. berean.bible`; BLB: public domain, Berean Bible Translation Committee, literalbible.com (draft).
- BSB audio: keep the existing narrated-reading support, best-effort only: the chapter returns bundled verses immediately plus audio tracks from a cached helloao chapter if present; if absent, try one fetch of the helloao chapter with a short timeout (`AbortSignal.timeout(4000)`), cache the audio under the existing `scripture_cache` row shape so it is not refetched, and on any failure return no audio without throwing and without caching the failure. Offline must work with no error surfaced.
- Tests: bundled chapter read (BSB John 3, missing-verse chapter e.g. Matthew 17), BLB read, unknown book/chapter, offline audio failure path, registry contains BSB+BLB with no keys. Existing scripture/search tests must still pass.

## Task 3: Interlinear + topical services and IPC (no UI)
- `src/main/services/interlinear.ts`: `getInterlinearChapter(book, chapter)` reads `resources/scripture/interlinear/<CODE>.json` lazily (cache per book); `src/main/services/scriptureTopics.ts`: `searchScriptureTopics(query, limit)` (case-insensitive substring/prefix on topic name, ranked prefix first) and `getScriptureTopic(name)` returning its refs. Add typed shared interfaces and IPC channels (`getInterlinearChapter`, `searchScriptureTopics`, `getScriptureTopic`) following exactly how `getScriptureChapter` is wired (`src/shared/ipc.ts` channel table + api interface, `src/main/ipc/index.ts`, `src/preload`). No renderer UI.
- Tests for both services against small fixtures.
