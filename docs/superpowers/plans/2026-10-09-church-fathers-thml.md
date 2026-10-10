# Church Fathers (CCEL ThML) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A searchable, Scripture-linked Church Fathers corpus in Loci built from CCEL's ThML editions of the Schaff series (ANF 1–10, NPNF¹ 1–14, NPNF² 1–14 — 38 volumes): read, full-text search, Scripture cross-references, footnotes with original page numbers, quotes, a verse-by-verse catena, and an author view.

**Architecture:** ThML stays the source of truth in `vault/fathers/<code>.xml`. A pure streaming parser (`saxes`) turns each volume into reading-order sections (sanitized HTML, plain text, structured Scripture refs, footnotes, page breaks) at index time; `syncFathersFolder()` (mirroring `syncBocFolder`) writes them to new `fathers_*` SQLite tables and `search_fts` rows (`kind='father'`) on startup, one transaction per volume. The renderer gets a new `fathers` tab kind (drawer + reader + author page), a `fathers` corpus mode in the Commentary pill (the catena) and the Quotes pill, and a Fathers search kind.

**Tech Stack:** Electron 33 + electron-vite, React 18 + zustand, better-sqlite3 ^12 (FTS5), TypeScript (strict, `noUnusedLocals`), vitest ^4, `saxes@6.0.0` (new, pure JS).

Spec: `docs/superpowers/specs/2026-10-09-church-fathers-thml-design.md` (approved). This plan was written against the real CCEL files in `.firecrawl/ccel/` (all 38 volumes were present) and every code block below was compiled and tested in a scratch copy of the repo (typecheck clean, full suite green).

## Global Constraints

Every task's requirements implicitly include this section.

- **Platform/tooling:** Windows 11; Git Bash or PowerShell. Node on PATH may need prepending in spawned shells (`where node`); there is **no Python and no MSVC**, so nothing may compile native code.
- **One new dependency only: `saxes`, pinned exact `6.0.0`** (pure JS; depends only on `xmlchars`). Install with `npm install --save-exact --ignore-scripts saxes@6.0.0`. **Never run a bare `npm install` / `npm ci`**: the repo's `postinstall` (`electron-builder install-app-deps`) would try to rebuild `better-sqlite3`. After installing, `node_modules/better-sqlite3/build/Release/` must still contain `better_sqlite3.node`, `better_sqlite3.electron-abi130.node` and `better_sqlite3.plainnode-abi137.node` (the latter two are created by `scripts/test-native.mjs`).
- **Test commands (from `package.json`):** `npm test` = `node scripts/test-native.mjs`, which swaps the plain-Node `better-sqlite3` binary in, runs `vitest run <args>`, and always restores the Electron binary. **Anything that opens a `Database()` must be run through it:** `npm test -- <path> [<path>…]`. Pure tests (no DB) may also use `npx vitest run <path>`. Typecheck: `npm run typecheck` (= `typecheck:node` + `typecheck:web`, both `tsc --noEmit … --composite false`). `vitest.config.ts` includes `src/**/*.test.ts` and `tools/**/*.test.mjs`.
- **Real ThML volumes are NOT committed** (`.firecrawl/` is git-ignored). Tests use the small fixtures in `src/main/services/__fixtures__/thmlSamples.ts` (created in Task 3). Do not add any `.xml` file to the repo.
- **Live GUI checks are done by the user.** Do not launch or drive the app; stop at typecheck + tests and hand over the manual checklist (Task 12). Do not copy files into the user's real vault (`%APPDATA%\Loci`); the sandboxed shell sees a virtualized AppData.
- **Commits:** one commit per task, `git add` only the files that task lists (the working tree has unrelated untracked files such as `*.tsbuildinfo`). Every commit message ends with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; the commands below pass it as a second `-m`. Do not amend; do not push.
- **Line endings:** the working tree is CRLF (`core.autocrlf=true`); git normalizes. Use the Edit/Write tools; ignore "LF will be replaced by CRLF" warnings. Code blocks below are LF.
- **Concurrent work:** other sessions are landing Confessions work on `main`. Locate edits by the quoted context, not line numbers. The new migration is **version 20**; if `migrations.ts` already has a version 20 when you start Task 1, use the next free number everywhere "20" appears (including the `>= 20` assertion).
- **Spec facts that must hold verbatim:** vault folder `vault/fathers/<code>.xml` (`anf01.xml`, `npnf205.xml`); series ids `anf | npnf1 | npnf2`; volume status `indexed | error | unindexed`; FTS rows `kind='father'`, `book_id=<volume code>`, `ref=<CCEL section id>`, `page=<numeric start page or NULL>`, `title=<short title>`; tables `fathers_volumes`, `fathers_sections`, `fathers_scripture_refs`, `fathers_notes`, `fathers_pages`, `fathers_authors`; `quotes` columns `fathers_volume, fathers_section_id, fathers_page, fathers_paragraph`; tab `{ kind: 'fathers', … }`; session key `lastFathers`; `CorpusMode` gains `fathers`, `MODES_FOR_PILL` quotes += fathers and commentary += fathers; `SearchKind` gains `father`; quote citation `"Irenaeus, *Against Heresies* III.3 (ANF 1:415)"`, filed under `notes/fathers/<author>.md`; unparseable `osisRef` stays plain text and is counted; an author missing from the curated table is shown undated and sorted last; a malformed file sets `status='error'` with a message and other volumes still index.

## Decisions made while planning (where the spec was silent or contradicted by the real data)

1. **Footnote references are indexed.** In the real files ~99 % of `scripRef`s are inside `<note>` elements (anf01: 2 982 of 3 005; npnf101: 2 164 of 2 179) — they are the editors' identification of the verses the Father quotes. Excluding note text (as the spec's `text` rule requires) must not exclude note *references*, or the catena would be empty for most of ANF/NPNF. So `ThmlRef` gains `inNote`, a footnote ref's `charOffset` is the footnote **marker's** position in the section text, `fathers_scripture_refs` gains `in_note` and `char_offset` columns (the spec's catena snippet needs the offset), and catena entries carry `inNote` ("in a footnote").
2. **`ThmlSection.startPage`** (the page label in force where the section begins) is added; the spec needs it for the FTS `page` column and for citations of selections made before the first in-section page break. Stored as `fathers_sections.start_page`.
3. **More tags than the spec lists.** The real files also use `div4`–`div5`, plain `div`, `a`, `name`, `cite`, `attr`, `q`, `table/tr/td`, `ul/ol/li`, `h5/h6`, `scripCom`, `insertIndex`, `img`, `hr`. Sections go to depth 6; headings `h1–h3 → <h3>`, `h4–h6 → <h4>`; lists and tables are kept; `a/name/cite/attr/q/span(non-sc)/div` are unwrapped silently; `index/insertIndex/scripCom/img/hr/style` are dropped; anything else warns (`unknown-tag`) and is unwrapped.
4. **Deuterocanonical references** (`Sir`, `Wis`, `Tob`, `Bar`, `Jdt`, Maccabees, …) cannot be opened in Loci's 66-book Bible. They stay plain text and are counted separately (`non-canon-ref`), not as errors. Three further `osisRef` shapes are handled: chapter-only (`Bible:Num.16`), space-separated lists (`Bible:Isa.64.4 Bible:1Cor.2.9` → two refs sharing an anchor) and the `Bible.lxx:` prefix.
5. **Author attribution** (the spec says only "from the enclosing contained-work head; fallback derived from div1 title"). Real facts: a contained work's `<ThML.head>` sits immediately *before* the `div1`/`div2` it describes and scopes that div and its descendants; NPNF volumes have no such heads (their div1s are works, and the volume names one `DC.Creator … Author`); front-matter divs get junk head ids (`title_page`); a few heads are simply wrong (anf01's Barnabas and Papias heads say `ignatius`); multi-author NPNF² volumes name no author at all. Rules: nearest head → (ANF only) slug of the div1 title → (NPNF) the volume's single `DC.Creator` author → none; an editorial depth-1 div never takes a head author; then `fathersAuthors.ts` applies `FATHERS_AUTHOR_OVERRIDES` (per `volume:div1-id`, value an id or `null`) and `FATHERS_NON_AUTHOR_IDS`. `tools/validate-thml.mjs` lists everything still unattributed so the table can be completed (Task 7).
6. **`editorial`** = any ancestor-or-self title matches an "always editorial" pattern (introductory note/notice, elucidations, excursus, prolegomena, indexes, title pages, contents, …), or a depth ≤ 2 title is a preface/introduction. A depth-3 "Preface." (Irenaeus's own, in *Against Heresies* III) is **not** editorial. The catena excludes editorial sections.
7. **`work_title` is always stored** (the head's title, else the div2 title in ANF / the div1 title in NPNF) so the Authors view can group on it.
8. **Fathers volumes are not mirrored to Drive** (`vaultsync.ts` `SUBDIRS` is unchanged), exactly like `confessions/`: 38 files × 4–6 MB, and the index is rebuilt locally.
9. **Quotes are anchored by `(volume, section)` with no foreign key**, so re-indexing a volume can never cascade-delete a user's quote; the citation is recomputed from the index on every read.
10. **`verseClicked` no longer re-pins the Commentary pill to Bible when it is pinned to Fathers** — the catena reads the same `commentaryLookup`, so a verse click should update it, not switch corpus.
11. **Parsing cost:** ~0.25–1.5 s per volume (≈20 s for all 38) of synchronous main-process work. The sync starts 3.5 s after launch and yields to the event loop between volumes; moving it to a worker is out of scope.

## Tasks at a glance

| # | Task | Model | Needs |
|---|---|---|---|
| 1 | Dependency, migration, curated author table | sonnet | — |
| 2 | OSIS parser and shared Fathers helpers | sonnet | — |
| 3 | ThML parser + fixtures | **opus** | 2 |
| 4 | Indexer, FTS rows, startup wiring | sonnet | 1, 2, 3 |
| 5 | Query services and read-side IPC | sonnet | 1, 2 |
| 6 | Quotes backend: citation, `addFathersQuote`, quote IPC | sonnet | 5 |
| 7 | Validator tool + complete author table | sonnet | 1, 2, 3 (can run in parallel with 5–6) |
| 8 | FathersReader | sonnet | 2, 5 |
| 9 | Fathers shell: tab kind, rail, store, pane, author page | sonnet | 5, 8 |
| 10 | Corpus mode `fathers`: catena + Fathers quotes | sonnet | 6, 9 |
| 11 | Search UI | haiku | 4, 9 |
| 12 | Final verification and hand-over | haiku | all |

Tasks 1–6 are main-process/shared and fully covered by automated tests; 8–11 are renderer work verified by typecheck, the pure-logic unit tests and the manual checklist in Task 12.

## File Structure

New files (all created in the task named in brackets):

| File | Responsibility |
|---|---|
| `src/shared/osis.ts` [2] | `parseOsisRef` — OSIS → structured passages (shared by parser and reader) |
| `src/shared/fathers.ts` [2] | series/volume-code helpers and labels (`ANF 1`, `NPNF¹ 4`) |
| `src/main/services/thml.ts` [3] | pure ThML → sections parser (no DB) |
| `src/main/services/__fixtures__/thmlSamples.ts` [3] | small hand-written ThML fixtures |
| `src/main/data/fathersAuthors.ts` [1, 7] | curated author table, per-div1 overrides, non-author ids, `correctedAuthor`, `seedFathersAuthors` |
| `src/main/services/fathersIndex.ts` [4] | `syncFathersFolder`, per-volume transactional write, FTS rows |
| `src/main/services/fathers.ts` [5] | read side: volumes, sections, authors, catena, citation metadata |
| `tools/validate-thml.mjs` [7] | run the parser over real volumes; report counts, failures, undated/unattributed authors |
| `src/renderer/src/lib/fathersReaderUtils.ts` [8] | `passageFromOsis` (clicked scripture link → Bible target) |
| `src/renderer/src/components/library/FathersReader.tsx` [8] | section reader: sanitized HTML, footnote popover, page labels, quote selection |
| `src/renderer/src/lib/fathersGrouping.ts` [9] | volume sections → author → work runs for the drawer |
| `src/renderer/src/components/library/FathersPane.tsx` [9, 10] | tab body: Volumes/Authors drawer + reader / author page |
| `src/renderer/src/components/library/FathersAuthorPage.tsx` [9] | one author's page |
| `src/renderer/src/lib/fathersCatena.ts` [10] | which passage the catena shows |
| `src/renderer/src/components/library/FathersCatenaPanel.tsx` [10] | Commentary pill, Fathers mode |
| `src/renderer/src/components/library/FathersQuotesPanel.tsx` [10] | Quotes pill, Fathers mode |

Modified files: `package.json`/`package-lock.json` [1], `src/main/db/migrations.ts` [1], `src/main/services/config.ts` [4], `src/main/services/search.ts` [4], `src/main/index.ts` [4], `src/shared/ipc.ts` [4, 5, 6], `src/shared/citation.ts` [6], `src/main/services/quotes.ts` [6], `src/main/ipc/index.ts` + `src/preload/index.ts` [5, 6], `src/renderer/src/store/workspace.ts` [9], `src/renderer/src/store/useStore.ts` [9, 10], `src/renderer/src/components/{navigation.ts,ThreePanel.tsx}` [9], `…/library/{PaneFrame,TabStrip,ReferenceBiblePanel}.tsx` [9], `src/renderer/src/lib/corpusMode.ts`, `…/library/{CorpusSwitch,CommentaryReferencePanel,QuotesReferencePanel}.tsx` [10], `…/library/{SearchView,SearchResults}.tsx` [11], `src/renderer/src/styles/app.css` [8, 9, 10], plus tests beside each.

Existing patterns this mirrors (read them if anything below is unclear): `src/main/services/bocIndex.ts` (`syncBocFolder`, mtime cache, `shouldReindex` from `commentaryIndex.ts`), `src/main/services/boc.ts`, `src/main/services/search.ts` (`indexBocForSearch`), `src/renderer/src/components/library/{BocPane,BocReader,BocQuotesPanel}.tsx`, `src/renderer/src/store/useStore.ts` (`navigateBoc`, `showConfessions`).

---


### Task 1: Dependency, migration, curated author table (model: sonnet)

**Files:**
- Modify: `package.json`, `package-lock.json` (via the install command only)
- Modify: `src/main/db/migrations.ts` (append migration 20 `church-fathers`)
- Modify: `src/main/services/commentary.test.ts:66`, `src/main/services/quotes.test.ts:43` (the two exact-version assertions `toBe(19)`)
- Create: `src/main/data/fathersAuthors.ts`
- Test: `src/main/data/fathersAuthors.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces (used by Tasks 4, 5, 6, 7):
  - tables `fathers_volumes(code PK, series, number, title, file_key, mtime, status, error, indexed_at)`, `fathers_sections(volume_code, id, ordinal, depth, titles_json, short_title, author_id, work_title, editorial, start_page, html, text; PK(volume_code,id))`, `fathers_scripture_refs(volume_code, section_id, anchor, osis, passage, book, chapter_start, verse_start, chapter_end, verse_end, in_note, char_offset)`, `fathers_notes(volume_code, section_id, anchor, n, html)`, `fathers_pages(volume_code, section_id, n, char_offset)`, `fathers_authors(id PK, name, sort_year, dates_label, bio)`; `quotes` columns `fathers_volume, fathers_section_id, fathers_page, fathers_paragraph`.
  - from `src/main/data/fathersAuthors.ts`: `interface FatherAuthor { id: string; name: string; sortYear: number; datesLabel: string; bio: string }`, `FATHERS_AUTHORS: FatherAuthor[]` (ascending by `sortYear`, then `name`), `FATHERS_AUTHOR_OVERRIDES: Record<string, string | null>` (key `"<volumeCode>:<div1 id>"`), `FATHERS_NON_AUTHOR_IDS: ReadonlySet<string>`, `correctedAuthor(volumeCode: string, sectionId: string, parsed: string | null): string | null`, `seedFathersAuthors(db: Database.Database): void`.

The table below the data file ships **17 real entries** (enough to exercise everything). The complete list is produced in Task 7 from the real files.

- [ ] **Step 1: Install the dependency without running install scripts**

```bash
npm install --save-exact --ignore-scripts saxes@6.0.0
git diff --stat
ls node_modules/better-sqlite3/build/Release/*.node
```

Expected: `git diff --stat` lists only `package.json` and `package-lock.json`; `package.json` now has `"saxes": "6.0.0"` (no caret) under `dependencies`; the `.node` listing still shows `better_sqlite3.node` (plus the two cached ABI variants if `npm test` has ever been run).

- [ ] **Step 2: Write the failing test**

**Create `src/main/data/fathersAuthors.test.ts`**

```ts
import Database from 'better-sqlite3'
import { beforeEach, describe, expect, it } from 'vitest'
import { runMigrations } from '../db/migrations'
import {
  correctedAuthor,
  FATHERS_AUTHORS,
  FATHERS_AUTHOR_OVERRIDES,
  FATHERS_NON_AUTHOR_IDS,
  seedFathersAuthors
} from './fathersAuthors'

let db: Database.Database
beforeEach(() => {
  db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
})

describe('migration: church-fathers', () => {
  it('creates the fathers tables and the quote columns', () => {
    expect(db.pragma('user_version', { simple: true })).toBeGreaterThanOrEqual(20)
    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map(
      (r) => r.name
    )
    for (const t of [
      'fathers_volumes', 'fathers_sections', 'fathers_scripture_refs', 'fathers_notes',
      'fathers_pages', 'fathers_authors'
    ]) {
      expect(tables).toContain(t)
    }
    const cols = (db.prepare('PRAGMA table_info(quotes)').all() as { name: string }[]).map((c) => c.name)
    for (const c of ['fathers_volume', 'fathers_section_id', 'fathers_page', 'fathers_paragraph']) {
      expect(cols).toContain(c)
    }
    const refCols = (db.prepare('PRAGMA table_info(fathers_scripture_refs)').all() as { name: string }[]).map(
      (c) => c.name
    )
    expect(refCols).toEqual(
      expect.arrayContaining(['in_note', 'char_offset', 'chapter_start', 'verse_end', 'book'])
    )
  })

  it('cascades section deletion to refs, notes and pages', () => {
    db.prepare("INSERT INTO fathers_volumes (code, series, number, file_key) VALUES ('anf01','anf',1,'k')").run()
    db.prepare(
      `INSERT INTO fathers_sections (volume_code, id, ordinal, depth, titles_json, short_title, html, text)
       VALUES ('anf01','a',0,1,'[]','A','<p>x</p>','x')`
    ).run()
    db.prepare(
      `INSERT INTO fathers_scripture_refs (volume_code, section_id, anchor, osis, passage, book, chapter_start, chapter_end)
       VALUES ('anf01','a','r1','Bible:Gen.1.1','Gen. i. 1','GEN',1,1)`
    ).run()
    db.prepare("INSERT INTO fathers_notes VALUES ('anf01','a','n1','1','<p>n</p>')").run()
    db.prepare("INSERT INTO fathers_pages VALUES ('anf01','a','5',0)").run()
    db.prepare("DELETE FROM fathers_sections WHERE volume_code='anf01'").run()
    for (const t of ['fathers_scripture_refs', 'fathers_notes', 'fathers_pages']) {
      expect((db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n).toBe(0)
    }
  })
})

describe('FATHERS_AUTHORS', () => {
  it('has unique snake_case ids and complete entries', () => {
    const ids = FATHERS_AUTHORS.map((a) => a.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const a of FATHERS_AUTHORS) {
      expect(a.id).toMatch(/^[a-z][a-z0-9_]*$/)
      expect(a.name.trim()).not.toBe('')
      expect(a.datesLabel.trim()).not.toBe('')
      expect(a.bio.trim()).not.toBe('')
      expect(Number.isInteger(a.sortYear)).toBe(true)
      expect(a.sortYear).toBeGreaterThan(0)
      expect(a.sortYear).toBeLessThan(900)
    }
  })

  it('is sorted ascending by sortYear, then name', () => {
    const sorted = [...FATHERS_AUTHORS].sort((a, b) => a.sortYear - b.sortYear || a.name.localeCompare(b.name))
    expect(FATHERS_AUTHORS.map((a) => a.id)).toEqual(sorted.map((a) => a.id))
  })

  it('author overrides use volume:div1-id keys and point at known authors (or null = unattributed)', () => {
    const ids = new Set(FATHERS_AUTHORS.map((a) => a.id))
    for (const [key, authorId] of Object.entries(FATHERS_AUTHOR_OVERRIDES)) {
      expect(key).toMatch(/^(?:anf\d{2}|npnf[12]\d{2}):[a-z0-9]+$/)
      if (authorId !== null) expect(ids.has(authorId)).toBe(true)
    }
  })

  it('keeps non-author ids out of the curated table', () => {
    for (const a of FATHERS_AUTHORS) expect(FATHERS_NON_AUTHOR_IDS.has(a.id)).toBe(false)
  })
})

describe('correctedAuthor', () => {
  it('applies a per-div1 override to every section under that div1, including duplicate-id sections', () => {
    expect(correctedAuthor('anf01', 'vi.ii.x', 'ignatius')).toBe('barnabas')
    expect(correctedAuthor('anf01', 'vi', 'ignatius')).toBe('barnabas')
    expect(correctedAuthor('anf01', 'vi~2', 'ignatius')).toBe('barnabas')
  })
  it('turns CCEL pseudo-authors into null and leaves real ones alone', () => {
    expect(correctedAuthor('anf03', 'i', 'title_page')).toBeNull()
    expect(correctedAuthor('anf07', 'x.i', 'anonymous')).toBeNull()
    expect(correctedAuthor('anf01', 'ii.ii', 'clement_rome')).toBe('clement_rome')
    expect(correctedAuthor('anf01', 'i', null)).toBeNull()
  })
})

describe('seedFathersAuthors', () => {
  it('inserts every curated author', () => {
    seedFathersAuthors(db)
    const n = (db.prepare('SELECT COUNT(*) AS n FROM fathers_authors').get() as { n: number }).n
    expect(n).toBe(FATHERS_AUTHORS.length)
    expect(db.prepare("SELECT name, sort_year FROM fathers_authors WHERE id='irenaeus'").get()).toEqual({
      name: 'Irenaeus',
      sort_year: 202
    })
  })

  it('is idempotent and overwrites edited rows', () => {
    seedFathersAuthors(db)
    db.prepare("UPDATE fathers_authors SET name = 'stale' WHERE id = 'irenaeus'").run()
    seedFathersAuthors(db)
    const n = (db.prepare('SELECT COUNT(*) AS n FROM fathers_authors').get() as { n: number }).n
    expect(n).toBe(FATHERS_AUTHORS.length)
    expect((db.prepare("SELECT name FROM fathers_authors WHERE id='irenaeus'").get() as { name: string }).name).toBe(
      'Irenaeus'
    )
  })
})
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npm test -- src/main/data/fathersAuthors.test.ts`
Expected: FAIL — `Failed to resolve import "./fathersAuthors"` (and the migration does not exist yet).

- [ ] **Step 4: Add the migration**

Append after the `boc-quotes` migration (the last array element):

**Edit `src/main/db/migrations.ts`** (context lines locate each change; line numbers are indicative only)

```diff
--- a/src/main/db/migrations.ts
+++ b/src/main/db/migrations.ts
@@ -419,6 +419,108 @@
         ALTER TABLE quotes ADD COLUMN boc_paragraph INTEGER;
       `)
     }
+  },
+  {
+    version: 20,
+    name: 'church-fathers',
+    up: (db) => {
+      // Church Fathers (CCEL ThML, Schaff's ANF/NPNF series). The vault's fathers/*.xml files
+      // are the source of truth; everything here is a rebuildable index of them, so a volume is
+      // re-indexed by deleting its rows and re-inserting (fathersIndex.ts). Kept apart from the
+      // Bible-commentary and Book of Concord tables for the same reason those are apart.
+      //
+      // fathers_scripture_refs.in_note: ~99% of the files' scripRefs sit inside footnotes (the
+      // editors' cross-references), so footnote refs are indexed too; char_offset is where the
+      // reference — or, for a footnote ref, its marker — sits in the section's plain text.
+      //
+      // fathers_authors is reseeded from src/main/data/fathersAuthors.ts on every sync (it is
+      // curated data, not user data), so edits there need no further migration.
+      //
+      // quotes: a Fathers quote is anchored by (volume, section) — deliberately NOT a foreign
+      // key, so re-indexing a volume can never cascade-delete the user's quotes — plus the page
+      // (a printed page label such as "415" or "xiv") and paragraph captured at quote time.
+      db.exec(`
+        CREATE TABLE fathers_volumes (
+          code        TEXT PRIMARY KEY,
+          series      TEXT NOT NULL,
+          number      INTEGER NOT NULL,
+          title       TEXT NOT NULL DEFAULT '',
+          file_key    TEXT NOT NULL,
+          mtime       INTEGER,
+          status      TEXT NOT NULL DEFAULT 'unindexed',
+          error       TEXT,
+          indexed_at  TEXT
+        );
+
+        CREATE TABLE fathers_sections (
+          volume_code  TEXT NOT NULL REFERENCES fathers_volumes(code) ON DELETE CASCADE,
+          id           TEXT NOT NULL,
+          ordinal      INTEGER NOT NULL,
+          depth        INTEGER NOT NULL,
+          titles_json  TEXT NOT NULL,
+          short_title  TEXT NOT NULL,
+          author_id    TEXT,
+          work_title   TEXT,
+          editorial    INTEGER NOT NULL DEFAULT 0,
+          start_page   TEXT,
+          html         TEXT NOT NULL,
+          text         TEXT NOT NULL,
+          PRIMARY KEY (volume_code, id)
+        );
+        CREATE INDEX idx_fathers_sections_order ON fathers_sections(volume_code, ordinal);
+        CREATE INDEX idx_fathers_sections_author ON fathers_sections(author_id);
+
+        CREATE TABLE fathers_scripture_refs (
+          volume_code    TEXT NOT NULL,
+          section_id     TEXT NOT NULL,
+          anchor         TEXT NOT NULL,
+          osis           TEXT NOT NULL,
+          passage        TEXT NOT NULL,
+          book           TEXT NOT NULL,
+          chapter_start  INTEGER NOT NULL,
+          verse_start    INTEGER,
+          chapter_end    INTEGER NOT NULL,
+          verse_end      INTEGER,
+          in_note        INTEGER NOT NULL DEFAULT 0,
+          char_offset    INTEGER NOT NULL DEFAULT 0,
+          FOREIGN KEY (volume_code, section_id) REFERENCES fathers_sections(volume_code, id) ON DELETE CASCADE
+        );
+        CREATE INDEX idx_fathers_refs_lookup ON fathers_scripture_refs(book, chapter_start, chapter_end);
+        CREATE INDEX idx_fathers_refs_section ON fathers_scripture_refs(volume_code, section_id);
+
+        CREATE TABLE fathers_notes (
+          volume_code  TEXT NOT NULL,
+          section_id   TEXT NOT NULL,
+          anchor       TEXT NOT NULL,
+          n            TEXT NOT NULL,
+          html         TEXT NOT NULL,
+          FOREIGN KEY (volume_code, section_id) REFERENCES fathers_sections(volume_code, id) ON DELETE CASCADE
+        );
+        CREATE INDEX idx_fathers_notes_section ON fathers_notes(volume_code, section_id);
+
+        CREATE TABLE fathers_pages (
+          volume_code  TEXT NOT NULL,
+          section_id   TEXT NOT NULL,
+          n            TEXT NOT NULL,
+          char_offset  INTEGER NOT NULL,
+          FOREIGN KEY (volume_code, section_id) REFERENCES fathers_sections(volume_code, id) ON DELETE CASCADE
+        );
+        CREATE INDEX idx_fathers_pages_section ON fathers_pages(volume_code, section_id);
+
+        CREATE TABLE fathers_authors (
+          id           TEXT PRIMARY KEY,
+          name         TEXT NOT NULL,
+          sort_year    INTEGER,
+          dates_label  TEXT,
+          bio          TEXT
+        );
+
+        ALTER TABLE quotes ADD COLUMN fathers_volume TEXT;
+        ALTER TABLE quotes ADD COLUMN fathers_section_id TEXT;
+        ALTER TABLE quotes ADD COLUMN fathers_page TEXT;
+        ALTER TABLE quotes ADD COLUMN fathers_paragraph INTEGER;
+      `)
+    }
   }
 ]
 
```

- [ ] **Step 5: Create the author data module**

**Create `src/main/data/fathersAuthors.ts`**

```ts
// Curated Church Fathers author table. CCEL's ThML files carry NO author dates, so the Authors
// view and the catena's date ordering come from here, keyed by CCEL's `authorID` (the value in a
// contained work's <ThML.head><electronicEdInfo><authorID>).
//
// Reseeded into the fathers_authors table on every sync (seedFathersAuthors), so editing this
// file needs no migration. An author the files mention but this table lacks is still shown —
// undated and sorted last — and tools/validate-thml.mjs lists them so the table can be completed.
import type Database from 'better-sqlite3'

export interface FatherAuthor {
  /** CCEL authorID, e.g. 'irenaeus'. */
  id: string
  name: string
  /** Approximate year used only for ordering (death year, or floruit for the obscure). */
  sortYear: number
  /** Human date label shown beside the name, e.g. 'c. 130–c. 202'. */
  datesLabel: string
  /** One or two plain sentences for the author page. */
  bio: string
}

/** Ascending by sortYear (then name). A unit test enforces this. */
export const FATHERS_AUTHORS: FatherAuthor[] = [
  {
    id: 'clement_rome',
    name: 'Clement of Rome',
    sortYear: 99,
    datesLabel: 'fl. c. 96',
    bio: 'Bishop of Rome at the end of the first century, traditionally the author of the First Epistle to the Corinthians.'
  },
  {
    id: 'ignatius',
    name: 'Ignatius of Antioch',
    sortYear: 108,
    datesLabel: 'c. 35–c. 108',
    bio: 'Bishop of Antioch who was taken to Rome for martyrdom and wrote seven letters to churches on the way.'
  },
  {
    id: 'barnabas',
    name: 'Barnabas (Epistle of)',
    sortYear: 130,
    datesLabel: 'c. 70–135',
    bio: 'Name attached to an early Christian letter that reads the Old Testament as pointing to Christ; its real author is unknown.'
  },
  {
    id: 'papias',
    name: 'Papias of Hierapolis',
    sortYear: 130,
    datesLabel: 'c. 60–c. 130',
    bio: 'Bishop of Hierapolis who collected the sayings of the apostles; his work survives only in quotations by later writers.'
  },
  {
    id: 'hermas',
    name: 'Hermas',
    sortYear: 150,
    datesLabel: 'fl. 2nd century',
    bio: 'Roman Christian, author of The Shepherd, a visionary work on repentance that was widely read in the early church.'
  },
  {
    id: 'polycarp',
    name: 'Polycarp of Smyrna',
    sortYear: 155,
    datesLabel: 'c. 69–c. 155',
    bio: 'Bishop of Smyrna who knew the apostle John according to Irenaeus; martyred in old age.'
  },
  {
    id: 'justin_martyr',
    name: 'Justin Martyr',
    sortYear: 165,
    datesLabel: 'c. 100–c. 165',
    bio: 'Philosopher turned Christian apologist in Rome who defended the faith to the emperor and was martyred there.'
  },
  {
    id: 'tatian',
    name: 'Tatian',
    sortYear: 180,
    datesLabel: 'c. 120–c. 180',
    bio: 'Syrian pupil of Justin Martyr, author of an Address to the Greeks and the Diatessaron gospel harmony.'
  },
  {
    id: 'irenaeus',
    name: 'Irenaeus',
    sortYear: 202,
    datesLabel: 'c. 130–c. 202',
    bio: 'Bishop of Lyons who wrote Against Heresies, the main answer to Gnosticism and a key witness to the apostolic tradition.'
  },
  {
    id: 'clement_alex',
    name: 'Clement of Alexandria',
    sortYear: 215,
    datesLabel: 'c. 150–c. 215',
    bio: 'Head of the catechetical school in Alexandria who sought to show Christianity as the true philosophy.'
  },
  {
    id: 'tertullian',
    name: 'Tertullian',
    sortYear: 220,
    datesLabel: 'c. 155–c. 220',
    bio: 'Carthaginian lawyer turned theologian, the first major Christian writer in Latin.'
  },
  {
    id: 'origen',
    name: 'Origen',
    sortYear: 254,
    datesLabel: 'c. 185–c. 254',
    bio: 'Alexandrian scholar and teacher, the most prolific early biblical commentator and a pioneer of systematic theology.'
  },
  {
    id: 'cyprian',
    name: 'Cyprian',
    sortYear: 258,
    datesLabel: 'c. 200–258',
    bio: 'Bishop of Carthage who wrote on the unity of the church and was martyred under Valerian.'
  },
  {
    id: 'athanasius',
    name: 'Athanasius',
    sortYear: 373,
    datesLabel: 'c. 296–373',
    bio: 'Bishop of Alexandria and chief defender of the full deity of Christ at and after the Council of Nicaea.'
  },
  {
    id: 'chrysostom',
    name: 'John Chrysostom',
    sortYear: 407,
    datesLabel: 'c. 347–407',
    bio: 'Archbishop of Constantinople renowned for his expository preaching, from which he took the name "golden mouth".'
  },
  {
    id: 'jerome',
    name: 'Jerome',
    sortYear: 420,
    datesLabel: 'c. 347–420',
    bio: 'Scholar who translated the Bible into Latin (the Vulgate) and wrote extensive commentaries and letters.'
  },
  {
    id: 'augustine',
    name: 'Augustine',
    sortYear: 430,
    datesLabel: '354–430',
    bio: 'Bishop of Hippo whose Confessions, City of God and anti-Pelagian writings shaped Western theology.'
  }
]

/**
 * CCEL's contained-work head sometimes names the wrong author (anf01's Epistle of Barnabas and
 * Fragments of Papias both say "ignatius"), and multi-author NPNF volumes carry no head at all.
 * Key: `${volumeCode}:${div1 id}`; value: the authorID for every section under that div1, or
 * `null` when the div1 has no single author. tools/validate-thml.mjs lists the candidates.
 */
export const FATHERS_AUTHOR_OVERRIDES: Record<string, string | null> = {
  'anf01:vi': 'barnabas',
  'anf01:vii': 'papias',
  'anf03:iv': 'tertullian' // div1 "Apologetic." — heads there say "apologetic"
}

/**
 * authorIDs CCEL puts on heads that are not people: collections, front matter, appendices. A
 * section carrying one is stored with no author (it lists under "Unattributed" in the drawer
 * and never in the Authors view).
 */
export const FATHERS_NON_AUTHOR_IDS: ReadonlySet<string> = new Set([
  'anonymous',
  'early_liturgies',
  'appendix',
  'title_page',
  'title_pages',
  'second_title_page'
])

/** The authorID a section is stored under: the per-div1 override if there is one, else what the
 *  parser read from the files, with CCEL's pseudo-authors turned into null. A `null` override is
 *  deliberate (a div1 with no single author). `sectionId` may carry the parser's '~2' suffix. */
export function correctedAuthor(volumeCode: string, sectionId: string, parsed: string | null): string | null {
  const key = `${volumeCode}:${sectionId.replace(/~\d+$/, '').split('.')[0]}`
  if (key in FATHERS_AUTHOR_OVERRIDES) return FATHERS_AUTHOR_OVERRIDES[key]
  return parsed && FATHERS_NON_AUTHOR_IDS.has(parsed) ? null : parsed
}

/** Upsert the curated table into fathers_authors. Idempotent; edits to the table propagate. */
export function seedFathersAuthors(db: Database.Database): void {
  const upsert = db.prepare(
    `INSERT INTO fathers_authors (id, name, sort_year, dates_label, bio) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name, sort_year = excluded.sort_year,
       dates_label = excluded.dates_label, bio = excluded.bio`
  )
  db.transaction(() => {
    for (const a of FATHERS_AUTHORS) upsert.run(a.id, a.name, a.sortYear, a.datesLabel, a.bio)
  })()
}
```

- [ ] **Step 6: Relax the two exact-version assertions**

Two existing tests assert the schema version is exactly 19, which a new migration necessarily breaks. They are testing "migration 19 happened", so make them `toBeGreaterThanOrEqual(19)`:

**Edit `src/main/services/commentary.test.ts`** (context lines locate each change; line numbers are indicative only)

```diff
--- a/src/main/services/commentary.test.ts
+++ b/src/main/services/commentary.test.ts
@@ -63,7 +63,7 @@
 describe('migrations', () => {
   it('runs twice without error and lands on the latest version', () => {
     expect(() => runMigrations(db)).not.toThrow()
-    expect(db.pragma('user_version', { simple: true })).toBe(19)
+    expect(db.pragma('user_version', { simple: true })).toBeGreaterThanOrEqual(19)
   })
 
   it('migration 14 does not fail when the user already created a "commentary" tag', () => {
```

**Edit `src/main/services/quotes.test.ts`** (context lines locate each change; line numbers are indicative only)

```diff
--- a/src/main/services/quotes.test.ts
+++ b/src/main/services/quotes.test.ts
@@ -40,7 +40,7 @@
 
 describe('migration v19', () => {
   it('adds the BoC quote columns and reaches version 19', () => {
-    expect(db.pragma('user_version', { simple: true })).toBe(19)
+    expect(db.pragma('user_version', { simple: true })).toBeGreaterThanOrEqual(19)
     const cols = (db.prepare('PRAGMA table_info(quotes)').all() as { name: string }[]).map((c) => c.name)
     for (const c of [
       'boc_source_id',
```

- [ ] **Step 7: Run the tests**

Run: `npm test -- src/main/data/fathersAuthors.test.ts src/main/services/commentary.test.ts src/main/services/quotes.test.ts src/main/services/boc.test.ts`
Expected: PASS — `fathersAuthors.test.ts` 10 tests; the other three files unchanged and green.

- [ ] **Step 8: Typecheck and commit**

```bash
npm run typecheck:node
git add package.json package-lock.json src/main/db/migrations.ts src/main/data/fathersAuthors.ts src/main/data/fathersAuthors.test.ts src/main/services/commentary.test.ts src/main/services/quotes.test.ts
git commit -m "feat(fathers): add saxes, fathers_* schema and curated author table" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: typecheck prints nothing (exit 0).

---

### Task 2: OSIS parser and shared Fathers helpers (model: sonnet)

**Files:**
- Create: `src/shared/osis.ts`, `src/shared/fathers.ts`
- Test: `src/shared/osis.test.ts`, `src/shared/fathers.test.ts`

**Interfaces:**
- Consumes: `bookByCode` from `src/shared/scriptureRef.ts` (existing; USFM codes and chapter counts).
- Produces:
  - `src/shared/osis.ts`: `interface OsisPassage { book: string /* USFM */; chapterStart: number; verseStart: number | null; chapterEnd: number; verseEnd: number | null }`, `type OsisParse = { kind: 'ok'; passages: OsisPassage[] } | { kind: 'non-canon'; book: string } | { kind: 'bad' }`, `parseOsisRef(osis: string): OsisParse`.
  - `src/shared/fathers.ts`: `type FathersSeries = 'anf' | 'npnf1' | 'npnf2'`, `FATHERS_SERIES_LABEL: Record<FathersSeries, string>` (`ANF`, `NPNF¹`, `NPNF²`), `FATHERS_SERIES_ORDER: FathersSeries[]`, `parseFathersCode(code: string): { series: FathersSeries; number: number } | null`, `fathersVolumeLabel(code: string): string`.

- [ ] **Step 1: Write the failing tests**

**Create `src/shared/osis.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { parseOsisRef } from './osis'

const ok = (osis: string) => {
  const r = parseOsisRef(osis)
  if (r.kind !== 'ok') throw new Error(`expected ok for ${osis}, got ${r.kind}`)
  return r.passages
}

describe('parseOsisRef', () => {
  it('parses a single verse', () => {
    expect(ok('Bible:John.3.16')).toEqual([
      { book: 'JHN', chapterStart: 3, verseStart: 16, chapterEnd: 3, verseEnd: 16 }
    ])
  })

  it('parses a same-chapter range', () => {
    expect(ok('Bible:1Pet.5.1-1Pet.5.5')).toEqual([
      { book: '1PE', chapterStart: 5, verseStart: 1, chapterEnd: 5, verseEnd: 5 }
    ])
  })

  it('parses a cross-chapter range', () => {
    expect(ok('Bible:Ps.23.1-Ps.24.10')).toEqual([
      { book: 'PSA', chapterStart: 23, verseStart: 1, chapterEnd: 24, verseEnd: 10 }
    ])
  })

  it('accepts the bare-verse and C.V range shorthands', () => {
    expect(ok('Bible:Matt.5.3-12')).toEqual([
      { book: 'MAT', chapterStart: 5, verseStart: 3, chapterEnd: 5, verseEnd: 12 }
    ])
    expect(ok('Bible:Matt.5.3-6.2')).toEqual([
      { book: 'MAT', chapterStart: 5, verseStart: 3, chapterEnd: 6, verseEnd: 2 }
    ])
  })

  it('parses chapter-only references with null verses', () => {
    expect(ok('Bible:Num.16')).toEqual([
      { book: 'NUM', chapterStart: 16, verseStart: null, chapterEnd: 16, verseEnd: null }
    ])
  })

  it('parses a book-only reference as the whole book', () => {
    expect(ok('Bible:Jude')).toEqual([
      { book: 'JUD', chapterStart: 1, verseStart: null, chapterEnd: 1, verseEnd: null }
    ])
    expect(ok('Bible:Ps')).toEqual([
      { book: 'PSA', chapterStart: 1, verseStart: null, chapterEnd: 150, verseEnd: null }
    ])
  })

  it('returns one passage per space-separated element', () => {
    expect(ok('Bible:Isa.64.4 Bible:1Cor.2.9')).toEqual([
      { book: 'ISA', chapterStart: 64, verseStart: 4, chapterEnd: 64, verseEnd: 4 },
      { book: '1CO', chapterStart: 2, verseStart: 9, chapterEnd: 2, verseEnd: 9 }
    ])
  })

  it('accepts the LXX prefix and variant book spellings', () => {
    expect(ok('Bible.lxx:Isa.7.9')[0].book).toBe('ISA')
    expect(ok('Bible:1Kings.1.1')[0].book).toBe('1KI')
    expect(ok('Bible:Jon.1.1')[0].book).toBe('JON')
    expect(ok('Bible:Phlm.1.5')[0].book).toBe('PHM')
  })

  it('maps the OSIS book ids of the 66-book canon', () => {
    const ids = [
      'Gen', 'Exod', 'Lev', 'Num', 'Deut', 'Josh', 'Judg', 'Ruth', '1Sam', '2Sam', '1Kgs', '2Kgs',
      '1Chr', '2Chr', 'Ezra', 'Neh', 'Esth', 'Job', 'Ps', 'Prov', 'Eccl', 'Song', 'Isa', 'Jer',
      'Lam', 'Ezek', 'Dan', 'Hos', 'Joel', 'Amos', 'Obad', 'Jonah', 'Mic', 'Nah', 'Hab', 'Zeph',
      'Hag', 'Zech', 'Mal', 'Matt', 'Mark', 'Luke', 'John', 'Acts', 'Rom', '1Cor', '2Cor', 'Gal',
      'Eph', 'Phil', 'Col', '1Thess', '2Thess', '1Tim', '2Tim', 'Titus', 'Phlm', 'Heb', 'Jas',
      '1Pet', '2Pet', '1John', '2John', '3John', 'Jude', 'Rev'
    ]
    expect(ids).toHaveLength(66)
    for (const id of ids) expect(parseOsisRef(`Bible:${id}.1.1`).kind).toBe('ok')
  })

  it('reports deuterocanonical books as non-canon', () => {
    expect(parseOsisRef('Bible:Sir.1.1')).toEqual({ kind: 'non-canon', book: 'Sir' })
    expect(parseOsisRef('Bible:Wis.3.1')).toEqual({ kind: 'non-canon', book: 'Wis' })
    expect(parseOsisRef('Bible:2Macc.7.28')).toEqual({ kind: 'non-canon', book: '2Macc' })
  })

  it('keeps the canonical elements of a mixed list', () => {
    expect(ok('Bible:Matt.1.1 Bible:Tob.1.1')).toHaveLength(1)
  })

  it('rejects garbage, unknown books, out-of-range chapters and reversed ranges', () => {
    for (const bad of [
      '',
      '   ',
      'garbage',
      'Bible:Foo.1.1',
      'Bible:John.99.1',
      'Bible:John.0.1',
      'Bible:John.3.16-John.3.1',
      'Bible:John.3-John.2',
      'Bible:John.3.1-Matt.5.1',
      'Bible:John.3.1-2-3'
    ]) {
      expect(parseOsisRef(bad)).toEqual({ kind: 'bad' })
    }
  })
})
```

**Create `src/shared/fathers.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { fathersVolumeLabel, parseFathersCode } from './fathers'

describe('parseFathersCode', () => {
  it('decodes the three CCEL series', () => {
    expect(parseFathersCode('anf01')).toEqual({ series: 'anf', number: 1 })
    expect(parseFathersCode('anf10')).toEqual({ series: 'anf', number: 10 })
    expect(parseFathersCode('npnf105')).toEqual({ series: 'npnf1', number: 5 })
    expect(parseFathersCode('npnf214')).toEqual({ series: 'npnf2', number: 14 })
  })

  it('is case-insensitive and trims', () => {
    expect(parseFathersCode(' ANF03 ')).toEqual({ series: 'anf', number: 3 })
  })

  it('rejects anything else', () => {
    expect(parseFathersCode('anf1')).toBeNull()
    expect(parseFathersCode('npnf301')).toBeNull()
    expect(parseFathersCode('npnf01')).toBeNull()
    expect(parseFathersCode('readme')).toBeNull()
    expect(parseFathersCode('')).toBeNull()
  })
})

describe('fathersVolumeLabel', () => {
  it('labels volumes with the series and number', () => {
    expect(fathersVolumeLabel('anf01')).toBe('ANF 1')
    expect(fathersVolumeLabel('npnf104')).toBe('NPNF¹ 4')
    expect(fathersVolumeLabel('npnf212')).toBe('NPNF² 12')
  })

  it('passes an unknown code through', () => {
    expect(fathersVolumeLabel('zzz')).toBe('zzz')
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/shared/osis.test.ts src/shared/fathers.test.ts`
Expected: FAIL — cannot resolve `./osis` / `./fathers`.

- [ ] **Step 3: Implement**

**Create `src/shared/osis.ts`**

```ts
// OSIS scripture-reference parsing for ThML `scripRef osisRef="…"` attributes. Pure; shared by
// the ThML parser (main) and the Fathers reader (renderer, to open a clicked reference).
//
// Handles the shapes CCEL actually emits: `Bible:John.3.16`, ranges (`Bible:1Pet.5.1-1Pet.5.5`,
// cross-chapter, and the `-12` verse shorthand), chapter-only (`Bible:Num.16`), book-only
// (`Bible:Jude`), the LXX prefix (`Bible.lxx:Isa.7.9`), and space-separated lists
// (`Bible:Isa.64.4 Bible:1Cor.2.9`). Books are returned as the 3-letter USFM codes used
// everywhere else in Loci (scriptureRef.ts). Deuterocanonical books are recognised but reported
// as `non-canon` because Loci's Bible navigation covers the 66-book canon only.
import { bookByCode } from './scriptureRef'

export interface OsisPassage {
  /** USFM code, e.g. "1PE". */
  book: string
  chapterStart: number
  /** null = the whole chapter (or whole book when the range spans chapters). */
  verseStart: number | null
  chapterEnd: number
  verseEnd: number | null
}

export type OsisParse =
  | { kind: 'ok'; passages: OsisPassage[] }
  | { kind: 'non-canon'; book: string }
  | { kind: 'bad' }

const OSIS_TO_USFM: Record<string, string> = {
  Gen: 'GEN', Exod: 'EXO', Lev: 'LEV', Num: 'NUM', Deut: 'DEU', Josh: 'JOS', Judg: 'JDG',
  Ruth: 'RUT', '1Sam': '1SA', '2Sam': '2SA', '1Kgs': '1KI', '2Kgs': '2KI', '1Chr': '1CH',
  '2Chr': '2CH', Ezra: 'EZR', Neh: 'NEH', Esth: 'EST', Job: 'JOB', Ps: 'PSA', Prov: 'PRO',
  Eccl: 'ECC', Song: 'SNG', Isa: 'ISA', Jer: 'JER', Lam: 'LAM', Ezek: 'EZK', Dan: 'DAN',
  Hos: 'HOS', Joel: 'JOL', Amos: 'AMO', Obad: 'OBA', Jonah: 'JON', Mic: 'MIC', Nah: 'NAM',
  Hab: 'HAB', Zeph: 'ZEP', Hag: 'HAG', Zech: 'ZEC', Mal: 'MAL', Matt: 'MAT', Mark: 'MRK',
  Luke: 'LUK', John: 'JHN', Acts: 'ACT', Rom: 'ROM', '1Cor': '1CO', '2Cor': '2CO', Gal: 'GAL',
  Eph: 'EPH', Phil: 'PHP', Col: 'COL', '1Thess': '1TH', '2Thess': '2TH', '1Tim': '1TI',
  '2Tim': '2TI', Titus: 'TIT', Phlm: 'PHM', Heb: 'HEB', Jas: 'JAS', '1Pet': '1PE', '2Pet': '2PE',
  '1John': '1JN', '2John': '2JN', '3John': '3JN', Jude: 'JUD', Rev: 'REV',
  // Variant spellings seen in the CCEL files.
  Jon: 'JON', '1Kings': '1KI', '2Kings': '2KI', Philem: 'PHM', Cant: 'SNG', Eccles: 'ECC'
}

const NON_CANON = new Set([
  'Tob', 'Jdt', 'AddEsth', 'Wis', 'Sir', 'Bar', 'EpJer', 'PrAzar', 'Sus', 'Bel',
  '1Macc', '2Macc', '3Macc', '4Macc', '1Esd', '2Esd', 'PrMan', 'Ps151'
])

/** `Bible:` or a translation-qualified `Bible.lxx:` prefix. */
const PREFIX_RE = /^Bible(?:\.[A-Za-z0-9]+)?:/i

interface Point {
  book: string
  chapter: number | null
  verse: number | null
}

type PointResult = { ok: Point } | { nonCanon: string } | null

function validate(p: Point): PointResult {
  const def = bookByCode(p.book)
  if (!def) return null
  if (p.chapter !== null && (p.chapter < 1 || p.chapter > def.chapters)) return null
  if (p.verse !== null && p.verse < 1) return null
  return { ok: p }
}

function parsePoint(raw: string): PointResult {
  const m = /^([1-4]?[A-Za-z]+)(?:\.(\d+)(?:\.(\d+))?)?$/.exec(raw.replace(PREFIX_RE, ''))
  if (!m) return null
  const usfm = OSIS_TO_USFM[m[1]]
  if (!usfm) return NON_CANON.has(m[1]) ? { nonCanon: m[1] } : null
  return validate({
    book: usfm,
    chapter: m[2] ? Number(m[2]) : null,
    verse: m[3] ? Number(m[3]) : null
  })
}

/** The right-hand side of a range may be a full point, `C.V`, or a bare number (a verse when the
 *  start named a verse, otherwise a chapter). */
function parseEnd(raw: string, start: Point): PointResult {
  const s = raw.replace(PREFIX_RE, '')
  if (/^\d+$/.test(s)) {
    const n = Number(s)
    return start.verse !== null
      ? validate({ book: start.book, chapter: start.chapter, verse: n })
      : validate({ book: start.book, chapter: n, verse: null })
  }
  const cv = /^(\d+)\.(\d+)$/.exec(s)
  if (cv) return validate({ book: start.book, chapter: Number(cv[1]), verse: Number(cv[2]) })
  return parsePoint(s)
}

function toPassage(a: Point, b: Point | null): OsisPassage | null {
  const def = bookByCode(a.book)
  if (!def) return null
  if (b === null) {
    if (a.chapter === null) {
      return { book: a.book, chapterStart: 1, verseStart: null, chapterEnd: def.chapters, verseEnd: null }
    }
    return { book: a.book, chapterStart: a.chapter, verseStart: a.verse, chapterEnd: a.chapter, verseEnd: a.verse }
  }
  if (b.book !== a.book || a.chapter === null) return null
  const ce = b.chapter ?? a.chapter
  if (ce < a.chapter) return null
  if (ce === a.chapter && a.verse !== null && b.verse !== null && b.verse < a.verse) return null
  return { book: a.book, chapterStart: a.chapter, verseStart: a.verse, chapterEnd: ce, verseEnd: b.verse }
}

/** Parse an `osisRef` attribute value into one passage per space-separated element. A list with
 *  at least one canonical element is `ok` (unusable siblings are dropped); otherwise the result
 *  says whether the problem was a deuterocanonical book or plain garbage. */
export function parseOsisRef(osis: string): OsisParse {
  const elements = osis.trim().split(/\s+/).filter(Boolean)
  if (elements.length === 0) return { kind: 'bad' }
  const passages: OsisPassage[] = []
  let nonCanon: string | null = null
  for (const el of elements) {
    const parts = el.split('-')
    if (parts.length > 2) continue
    const a = parsePoint(parts[0])
    if (a === null) continue
    if ('nonCanon' in a) {
      nonCanon = a.nonCanon
      continue
    }
    let b: Point | null = null
    if (parts.length === 2) {
      const end = parseEnd(parts[1], a.ok)
      if (end === null || 'nonCanon' in end) continue
      b = end.ok
    }
    const passage = toPassage(a.ok, b)
    if (passage) passages.push(passage)
  }
  if (passages.length > 0) return { kind: 'ok', passages }
  return nonCanon !== null ? { kind: 'non-canon', book: nonCanon } : { kind: 'bad' }
}
```

**Create `src/shared/fathers.ts`**

```ts
// Church Fathers (CCEL ThML) — pure helpers shared by main, preload types and the renderer.

export type FathersSeries = 'anf' | 'npnf1' | 'npnf2'

/** Display label per series. NPNF uses the Chicago-style superscript series numeral. */
export const FATHERS_SERIES_LABEL: Record<FathersSeries, string> = {
  anf: 'ANF',
  npnf1: 'NPNF¹',
  npnf2: 'NPNF²'
}

/** Series ordering used wherever volumes are listed. */
export const FATHERS_SERIES_ORDER: FathersSeries[] = ['anf', 'npnf1', 'npnf2']

/** Decode a CCEL volume code: 'anf01' -> anf/1, 'npnf105' -> npnf1/5, 'npnf214' -> npnf2/14.
 *  Returns null for anything else (so stray files in the folder are ignored). */
export function parseFathersCode(code: string): { series: FathersSeries; number: number } | null {
  const c = code.trim().toLowerCase()
  const anf = /^anf(\d{2})$/.exec(c)
  if (anf) return { series: 'anf', number: Number(anf[1]) }
  const npnf = /^npnf([12])(\d{2})$/.exec(c)
  if (npnf) return { series: npnf[1] === '1' ? 'npnf1' : 'npnf2', number: Number(npnf[2]) }
  return null
}

/** "ANF 1", "NPNF¹ 14"; an unrecognised code is returned unchanged. */
export function fathersVolumeLabel(code: string): string {
  const p = parseFathersCode(code)
  return p ? `${FATHERS_SERIES_LABEL[p.series]} ${p.number}` : code
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/shared/osis.test.ts src/shared/fathers.test.ts`
Expected: PASS — 12 + 5 tests.

- [ ] **Step 5: Typecheck and commit**

```bash
npm run typecheck
git add src/shared/osis.ts src/shared/osis.test.ts src/shared/fathers.ts src/shared/fathers.test.ts
git commit -m "feat(fathers): OSIS reference parser and shared volume helpers" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---


### Task 3: ThML parser (model: opus)

**Files:**
- Create: `src/main/services/thml.ts`
- Create: `src/main/services/__fixtures__/thmlSamples.ts`
- Test: `src/main/services/thml.test.ts`

**Interfaces:**
- Consumes: `saxes` (Task 1), `parseOsisRef` (Task 2).
- Produces (used by Tasks 4, 7):
  - `interface ThmlRef { anchor: string; osis: string; passage: string; book: string; chapterStart: number; verseStart: number | null; chapterEnd: number; verseEnd: number | null; inNote: boolean; charOffset: number }`
  - `interface ThmlNote { anchor: string; n: string; html: string }`, `interface ThmlPage { n: string; charOffset: number }`
  - `interface ThmlSection { id; ordinal; depth; titles: string[]; shortTitle; authorId: string | null; workTitle: string | null; editorial: boolean; startPage: string | null; html: string; text: string; refs: ThmlRef[]; notes: ThmlNote[]; pages: ThmlPage[] }`
  - `interface ThmlVolume { code: string; title: string; sections: ThmlSection[] }`, `interface ThmlWarning { kind: 'unknown-tag' | 'bad-osis' | 'non-canon-ref'; detail: string; count: number }`, `interface ThmlResult { volume: ThmlVolume; warnings: ThmlWarning[] }`
  - `parseThml(xml: string, code: string): ThmlResult`, `class ThmlParseError extends Error`, `slugifyAuthor(title: string): string`, `isEditorialTitles(titles: string[]): boolean`
  - fixtures: `miniThml(bodyXml, opts?)`, `ANF_MINI` (code `anf01`), `NPNF_MINI` (code `npnf101`).

**Rules the code implements** (all in comments in `thml.ts`; the tests pin them):
- A section is the deepest `divN` (1–6) that has text; text in a parent before its first child becomes its own section (id = the div's id; a *second* section from the same div — text after the last child — gets `~2`, `~3` …).
- `ThML.head` before `<ThML.body>` = the volume (title from the first `DC.Title` without `sub`, authors from `DC.Creator sub="Author" scheme="ccel"`); a head inside the body attaches to the **next** div opened and scopes it and its descendants.
- `scripRef` with a usable `osisRef` → `<a class="scripref" data-osis="…">` + one `ThmlRef` per passage; footnote refs are recorded with `inNote` and the footnote marker's offset. Unusable → plain text + warning.
- `note` → `<sup class="fn" data-note="anchor">n</sup>` + `ThmlNote`; note text is not in `text`.
- `pb` → `<span class="pb" data-page="n"></span>` + `ThmlPage`; `n` comes from `n`, else from `id="…-Page_v"` / `href=".../Page_27.html"`.
- Output is allow-listed by construction: no source attributes are copied (only `class="sc"`, `class="scripref"`, `data-osis`, `data-note`, `data-page`), all text is escaped.
- Never throws on content; throws `ThmlParseError` only for non-ThML / malformed XML.

- [ ] **Step 1: Create the fixtures**

**Create `src/main/services/__fixtures__/thmlSamples.ts`**

```ts
// Small hand-written ThML fixtures shaped like CCEL's real files (see thml.ts for the facts they
// mirror). The real volumes are 4–6 MB each and are NOT committed.

/** Wrap body markup in a minimal ThML volume (volume head + <ThML.body>). */
export function miniThml(
  bodyXml: string,
  opts: { title?: string; authors?: string[] } = {}
): string {
  const creators = (opts.authors ?? [])
    .map((a) => `<DC.Creator scheme="ccel" sub="Author">${a}</DC.Creator>`)
    .join('')
  return `<?xml version="1.0" encoding="UTF-8"?>
<ThML>
<ThML.head>
<electronicEdInfo>
<authorID>schaff</authorID>
<DC><DC.Title>${opts.title ?? 'ANF99. Test Volume'}</DC.Title>${creators}</DC>
</electronicEdInfo>
</ThML.head>
<ThML.body xml:space="preserve">
${bodyXml}
</ThML.body>
</ThML>`
}

/** An ANF-style volume (code 'anf01'): author-grouped div1s, contained-work heads that precede
 *  the div they describe, a head with a WRONG authorID (Barnabas -> "ignatius", as in the real
 *  anf01), footnotes, page breaks, and every scripRef flavour. */
export const ANF_MINI = `<?xml version="1.0" encoding="UTF-8"?>
<!-- fixture: miniature ANF-style volume -->
<ThML>
<ThML.head>
<electronicEdInfo>
  <authorID>schaff</authorID>
  <bookID>anf01</bookID>
  <DC>
    <DC.Title>ANF01. The Apostolic Fathers with Justin Martyr and Irenaeus</DC.Title>
    <DC.Title sub="short">ANF (V1)</DC.Title>
    <DC.Creator scheme="ccel" sub="Editor">schaff</DC.Creator>
    <DC.Creator scheme="ccel" sub="Author">irenaeus</DC.Creator>
  </DC>
</electronicEdInfo>
</ThML.head>
<ThML.body xml:space="preserve">

<div1 id="i" n="i" title="Title Page" shorttitle="Title Page">
<p id="i-p1">Ante-Nicene Fathers, Volume I.</p>
<div2 id="i.i" n="i" title="Preface" shorttitle="Preface">
<pb n="v" href="/ccel/schaff/anf01/Page_v.html" id="i.i-Page_v" />
<p id="i.i-p1">This edition<note anchored="yes" id="i.i-p1.1" n="1" place="end"><p class="endnote" id="i.i-p1.2">A note on the <i>edition</i>.</p></note> is a reprint.</p>
</div2>
</div1>

<ThML.head>
<electronicEdInfo>
  <authorID>clement_rome</authorID>
  <DC><DC.Title>First Epistle to the Corinthians</DC.Title></DC>
</electronicEdInfo>
</ThML.head>
<div1 id="ii" n="ii" title="CLEMENT OF ROME" shorttitle="CLEMENT OF ROME">
<p id="ii-p1">Intro text under the author heading.</p>
<div2 id="ii.i" n="i" title="Introductory Note to the First Epistle of Clement" shorttitle="Introductory Note">
<p id="ii.i-p1">Written by the editor.</p>
</div2>
<div2 id="ii.ii" n="ii" title="First Epistle to the Corinthians" shorttitle="First Epistle to the Corinthians">
<h2 id="ii.ii-p0.1">The First Epistle of Clement</h2>
<div3 id="ii.ii.i" n="i" title="Chapter I.—The salutation." shorttitle="Chapter I.—The salutation.">
<pb n="5" href="/ccel/schaff/anf01/Page_5.html" id="ii.ii.i-Page_5" />
<p id="ii.ii.i-p1">The church of God <scripRef id="ii.ii.i-p1.1" osisRef="Bible:1Cor.1.2" parsed="|1Cor|1|2|0|0" passage="1 Cor. i. 2">sojourning at Rome</scripRef>, and see <scripRef id="ii.ii.i-p1.2" osisRef="Bible:1Pet.5.1-1Pet.5.5" passage="1 Pet. v. 1-5">1 Pet. v. 1-5</scripRef>.</p>
<index id="ii.ii.i-p1.3" subject1="Clement" type="subject" />
<p id="ii.ii.i-p2">The <span class="sc" id="ii.ii.i-p2.1">ms.</span> reads <i>thus</i>.<note anchored="yes" id="ii.ii.i-p2.2" n="2" place="end"><p class="endnote" id="ii.ii.i-p2.3">Greek differs.</p></note></p>
</div3>
<div3 id="ii.ii.ii" n="ii" title="Chapter II.—Humility." shorttitle="Chapter II.—Humility.">
<pb n="6" href="/ccel/schaff/anf01/Page_6.html" id="ii.ii.ii-Page_6" />
<p id="ii.ii.ii-p1">See <scripRef id="ii.ii.ii-p1.1" osisRef="Bible:Ps.23" passage="Ps. xxiii">Psalm 23</scripRef>, <scripRef id="ii.ii.ii-p1.2" osisRef="Bible:Sir.1.1" passage="Ecclus. i. 1">Ecclus. i. 1</scripRef> and <scripRef id="ii.ii.ii-p1.3" osisRef="garbage" passage="oops">oops</scripRef>.</p>
</div3>
</div2>
</div1>

<ThML.head>
<electronicEdInfo>
  <authorID>ignatius</authorID>
  <DC><DC.Title>Epistle of Barnabas</DC.Title></DC>
</electronicEdInfo>
</ThML.head>
<div1 id="vi" n="vi" title="BARNABAS" shorttitle="BARNABAS">
<div2 id="vi.ii" n="ii" title="The Epistle of Barnabas" shorttitle="The Epistle of Barnabas">
<p id="vi.ii-p1">Barnabas wrote of the covenant.</p>
</div2>
</div1>

<div1 id="ix" n="ix" title="IRENÆUS" shorttitle="IRENÆUS">
<div2 id="ix.i" n="i" title="Introductory Note to Irenæus Against Heresies" shorttitle="Introductory Note">
<p id="ix.i-p1">Editorial introduction to Irenæus.</p>
</div2>
<ThML.head>
<electronicEdInfo>
  <authorID>irenaeus</authorID>
  <DC><DC.Title>Against Heresies: Book III</DC.Title></DC>
</electronicEdInfo>
</ThML.head>
<div2 id="ix.ii" n="ii" title="Against Heresies: Book III" shorttitle="Against Heresies: Book III">
<div3 id="ix.ii.i" n="i" title="Preface." shorttitle="Preface.">
<pb n="414" href="/ccel/schaff/anf01/Page_414.html" id="ix.ii.i-Page_414" />
<p id="ix.ii.i-p1">Preface of Irenæus to the third book.</p>
</div3>
<div3 id="ix.ii.ii" n="ii" title="Chapter III.—Apostolic succession." shorttitle="Chapter III.—Apostolic succession.">
<pb n="415" href="/ccel/schaff/anf01/Page_415.html" id="ix.ii.ii-Page_415" />
<p id="ix.ii.ii-p1">The tradition of succession; see <scripRef id="ix.ii.ii-p1.1" osisRef="Bible:Rom.16.3-Rom.16.4" passage="Rom. xvi. 3">Rom. 16:3</scripRef> and <scripRef id="ix.ii.ii-p1.2" osisRef="Bible:Isa.64.4 Bible:1Cor.2.9" passage="Isa. lxiv. 4; 1 Cor. ii. 9">Isa. 64:4; 1 Cor. 2:9</scripRef>.</p>
</div3>
</div2>
</div1>

</ThML.body>
</ThML>
`

/** An NPNF-style volume (code 'npnf101'): div1s are works, no contained-work heads (the volume
 *  names a single DC.Creator author), page breaks that carry the page only in id/href,
 *  place="foot" notes, a scripRef inside a note, and a mid-paragraph page break. */
export const NPNF_MINI = `<?xml version="1.0" encoding="UTF-8"?>
<ThML>
<ThML.head>
<electronicEdInfo>
  <publisherID>ccel</publisherID>
  <authorID>schaff</authorID>
  <bookID>npnf101</bookID>
  <DC>
    <DC.Title>NPNF1-01. The Confessions and Letters of St. Augustine,
with a Sketch of his Life and Work</DC.Title>
    <DC.Title sub="short">NPNF (V1-01)</DC.Title>
    <DC.Creator scheme="short-form" sub="Editor">Philip Schaff</DC.Creator>
    <DC.Creator scheme="ccel" sub="Editor">schaff</DC.Creator>
    <DC.Creator scheme="ccel" sub="Author">augustine</DC.Creator>
  </DC>
</electronicEdInfo>
</ThML.head>
<ThML.body xml:space="preserve">
<div1 id="ii" progress="0.18%" shorttitle="" title="Preface"><pb href="/ccel/schaff/npnf101/Page_v.html" id="ii-Page_v" />
<p id="ii-p1">Preface by the editor.</p>
</div1>
<div1 id="vi" progress="4.42%" shorttitle="" title="The Confessions"><pb href="/ccel/schaff/npnf101/Page_27.html" id="vi-Page_27" />
<div2 id="vi.i" shorttitle="" title="Book I">
<div3 id="vi.i.i" shorttitle="" title="Chapter I.—Great art Thou.">
<p id="vi.i.i-p1">Great art Thou, O Lord<note anchored="yes" id="vi.i.i-p1.1" n="1" place="foot"><p class="endnote" id="vi.i.i-p1.2">Cf. <scripRef id="vi.i.i-p1.3" osisRef="Bible:Ps.145.3" passage="Ps. cxlv. 3">Ps. cxlv. 3</scripRef>.</p></note>, and greatly to be praised.<pb n="28" href="/ccel/schaff/npnf101/Page_28.html" id="vi.i.i-Page_28" /> Thou awakest us to delight in Thy praise; <scripRef id="vi.i.i-p1.4" osisRef="Bible:1Cor.1.2" passage="1 Cor. i. 2">saints</scripRef>.</p>
</div3>
</div2>
</div1>
</ThML.body>
</ThML>
`
```

- [ ] **Step 2: Write the failing parser tests**

**Create `src/main/services/thml.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { ThmlParseError, isEditorialTitles, parseThml, slugifyAuthor } from './thml'
import type { ThmlSection } from './thml'
import { ANF_MINI, NPNF_MINI, miniThml } from './__fixtures__/thmlSamples'

const anf = parseThml(ANF_MINI, 'anf01')
const npnf = parseThml(NPNF_MINI, 'npnf101')
const byId = (secs: ThmlSection[], id: string): ThmlSection => {
  const s = secs.find((x) => x.id === id)
  if (!s) throw new Error(`no section ${id}`)
  return s
}

describe('parseThml — volume and hierarchy', () => {
  it('reads the volume title from the first plain DC.Title and strips the "ANF01." prefix', () => {
    expect(anf.volume.code).toBe('anf01')
    expect(anf.volume.title).toBe('The Apostolic Fathers with Justin Martyr and Irenaeus')
    expect(npnf.volume.title).toBe('The Confessions and Letters of St. Augustine, with a Sketch of his Life and Work')
  })

  it('emits sections in reading order with ordinals, depth and ancestor titles', () => {
    expect(anf.volume.sections.map((s) => s.id)).toEqual([
      'i', 'i.i', 'ii', 'ii.i', 'ii.ii', 'ii.ii.i', 'ii.ii.ii', 'vi.ii', 'ix.i', 'ix.ii.i', 'ix.ii.ii'
    ])
    expect(anf.volume.sections.map((s) => s.ordinal)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    const ch = byId(anf.volume.sections, 'ix.ii.ii')
    expect(ch.depth).toBe(3)
    expect(ch.titles).toEqual(['IRENÆUS', 'Against Heresies: Book III', 'Chapter III.—Apostolic succession.'])
    expect(ch.shortTitle).toBe('Chapter III.—Apostolic succession.')
  })

  it('turns text in a parent div before its first child into its own section — nothing is dropped', () => {
    const s = byId(anf.volume.sections, 'ii')
    expect(s.depth).toBe(1)
    expect(s.text).toBe('Intro text under the author heading.')
    expect(anf.volume.sections.map((x) => x.text).join('\n')).toContain('Written by the editor.')
  })

  it('does not emit sections for divs with no direct text', () => {
    const ids = anf.volume.sections.map((s) => s.id)
    expect(ids).not.toContain('vi') // BARNABAS div1 only wraps a div2
    expect(ids).not.toContain('ix.ii') // Book III div2 only wraps chapters
  })

  it('keeps trailing text after the last child as another section of the same div', () => {
    const xml = miniThml(
      `<div1 id="a" title="A"><p>Before.</p><div2 id="a.i" title="Child"><p>Inside.</p></div2><p>After.</p></div1>`
    )
    const { volume } = parseThml(xml, 'anf99')
    expect(volume.sections.map((s) => [s.id, s.text])).toEqual([
      ['a', 'Before.'],
      ['a.i', 'Inside.'],
      ['a~2', 'After.']
    ])
  })

  it('disambiguates a repeated div id', () => {
    const xml = miniThml(`<div1 id="a" title="A"><p>One.</p></div1><div1 id="a" title="A"><p>Two.</p></div1>`)
    expect(parseThml(xml, 'anf99').volume.sections.map((s) => s.id)).toEqual(['a', 'a~2'])
  })

  it('handles divs nested to depth 5', () => {
    const xml = miniThml(
      `<div1 id="a" title="A"><div2 id="a.b" title="B"><div3 id="a.b.c" title="C"><div4 id="a.b.c.d" title="D"><div5 id="a.b.c.d.e" title="E"><p>Deep.</p></div5></div4></div3></div2></div1>`
    )
    const s = parseThml(xml, 'anf99').volume.sections[0]
    expect(s.depth).toBe(5)
    expect(s.titles).toEqual(['A', 'B', 'C', 'D', 'E'])
  })
})

describe('parseThml — author attribution and editorial flag', () => {
  it('uses the contained-work head that precedes a div, scoped to that div and its descendants', () => {
    const clement = byId(anf.volume.sections, 'ii.ii.i')
    expect(clement.authorId).toBe('clement_rome')
    expect(clement.workTitle).toBe('First Epistle to the Corinthians')
    const iren = byId(anf.volume.sections, 'ix.ii.ii')
    expect(iren.authorId).toBe('irenaeus')
    expect(iren.workTitle).toBe('Against Heresies: Book III')
  })

  it('does not let a div2 head leak onto its earlier sibling', () => {
    const intro = byId(anf.volume.sections, 'ix.i') // before the Book III head
    expect(intro.workTitle).toBeNull()
  })

  it('falls back to a slug of the div1 title in ANF volumes (IRENÆUS -> irenaeus)', () => {
    expect(byId(anf.volume.sections, 'ix.i').authorId).toBe('irenaeus')
    expect(slugifyAuthor('IRENÆUS')).toBe('irenaeus')
    expect(slugifyAuthor('CLEMENT OF ROME')).toBe('clement_of_rome')
    expect(slugifyAuthor('Tertullian')).toBe('tertullian')
  })

  it('reports what the head says even when it is wrong (Barnabas head says ignatius)', () => {
    expect(byId(anf.volume.sections, 'vi.ii').authorId).toBe('ignatius')
  })

  it('falls back to the volume\'s single DC.Creator author in NPNF volumes, but not for editorial front matter', () => {
    expect(byId(npnf.volume.sections, 'vi.i.i').authorId).toBe('augustine')
    expect(byId(npnf.volume.sections, 'ii').authorId).toBeNull()
  })

  it('gives front matter no author in ANF volumes', () => {
    expect(byId(anf.volume.sections, 'i').authorId).toBeNull()
    expect(byId(anf.volume.sections, 'i.i').authorId).toBeNull()
  })

  it('ignores a junk head author on a front-matter div1 (CCEL uses "title_page")', () => {
    const xml = miniThml(
      `<ThML.head><electronicEdInfo><authorID>title_page</authorID><DC><DC.Title>Title Page</DC.Title></DC></electronicEdInfo></ThML.head>` +
        `<div1 id="i" title="Title Page"><p>Text.</p></div1>`
    )
    expect(parseThml(xml, 'anf03').volume.sections[0].authorId).toBeNull()
  })

  it('does not guess an author when a volume names several', () => {
    const xml = miniThml(`<div1 id="a" title="The Treatise"><p>Text.</p></div1>`, {
      title: 'NPNF2-01. Test',
      authors: ['eusebius', 'socrates']
    })
    expect(parseThml(xml, 'npnf201').volume.sections[0].authorId).toBeNull()
  })

  it('flags editorial sections', () => {
    const e = (id: string) => byId(anf.volume.sections, id).editorial
    expect(e('i')).toBe(true) // Title Page
    expect(e('i.i')).toBe(true) // Preface under front matter
    expect(e('ii.i')).toBe(true) // Introductory Note
    expect(e('ix.i')).toBe(true)
    expect(e('ii')).toBe(false)
    expect(e('ii.ii.i')).toBe(false)
    expect(byId(npnf.volume.sections, 'ii').editorial).toBe(true) // top-level Preface
  })

  it("does not flag a Father's own chapter-level Preface as editorial", () => {
    expect(byId(anf.volume.sections, 'ix.ii.i').editorial).toBe(false)
    expect(isEditorialTitles(['IRENÆUS', 'Against Heresies: Book III', 'Preface.'])).toBe(false)
    expect(isEditorialTitles(['Preface'])).toBe(true)
    expect(isEditorialTitles(['CLEMENT', 'Work', 'Elucidations'])).toBe(true)
    expect(isEditorialTitles(['Subject Indexes'])).toBe(true)
    expect(isEditorialTitles(['Prolegomena: St. Augustin’s Life and Work'])).toBe(true)
    // CCEL titles carry trailing periods and plural forms.
    for (const t of ['Title Page.', 'Title Pages.', 'Second Title Page.', 'Series Title', 'Contents',
      'General Introduction.', 'Bibliographical Introduction.', 'Excursus on the History of the Roman Law',
      'Appended Note on the Eastern Editions']) {
      expect(isEditorialTitles([t])).toBe(true)
    }
    expect(isEditorialTitles(['The Confessions', 'Book I', 'Introduction'])).toBe(false) // depth 3 = the author's own
  })
})

describe('parseThml — scripture references', () => {
  it('records single, range and list references with structured fields', () => {
    const s = byId(anf.volume.sections, 'ii.ii.i')
    expect(s.refs).toHaveLength(2)
    expect(s.refs[0]).toMatchObject({
      anchor: 'ii.ii.i-p1.1', osis: 'Bible:1Cor.1.2', passage: '1 Cor. i. 2',
      book: '1CO', chapterStart: 1, verseStart: 2, chapterEnd: 1, verseEnd: 2
    })
    expect(s.refs[1]).toMatchObject({
      book: '1PE', chapterStart: 5, verseStart: 1, chapterEnd: 5, verseEnd: 5
    })
    const list = byId(anf.volume.sections, 'ix.ii.ii').refs
    expect(list.map((r) => [r.book, r.chapterStart, r.verseStart])).toEqual([
      ['ROM', 16, 3], ['ISA', 64, 4], ['1CO', 2, 9]
    ])
    expect(list[1].anchor).toBe(list[2].anchor)
  })

  it('records a chapter-only reference with null verses', () => {
    const r = byId(anf.volume.sections, 'ii.ii.ii').refs[0]
    expect(r).toMatchObject({ book: 'PSA', chapterStart: 23, verseStart: null, chapterEnd: 23, verseEnd: null })
  })

  it('charOffset points at the start of the reference in the section text', () => {
    const s = byId(anf.volume.sections, 'ii.ii.i')
    expect(s.text.slice(s.refs[0].charOffset)).toMatch(/^sojourning at Rome/)
    expect(s.text.slice(s.refs[1].charOffset)).toMatch(/^1 Pet\. v\. 1-5/)
  })

  it('renders a usable reference as a.scripref and keeps the list osis verbatim', () => {
    const s = byId(anf.volume.sections, 'ix.ii.ii')
    expect(s.html).toContain('<a class="scripref" data-osis="Bible:Rom.16.3-Rom.16.4">Rom. 16:3</a>')
    expect(s.html).toContain('data-osis="Bible:Isa.64.4 Bible:1Cor.2.9"')
  })

  it('leaves deuterocanonical and unparseable references as plain text and counts them', () => {
    const s = byId(anf.volume.sections, 'ii.ii.ii')
    expect(s.html).toContain('Ecclus. i. 1 and oops.')
    expect(s.html).not.toContain('Ecclus. i. 1</a>')
    expect(s.refs).toHaveLength(1)
    expect(anf.warnings).toEqual([
      { kind: 'bad-osis', detail: 'garbage', count: 1 },
      { kind: 'non-canon-ref', detail: 'Sir', count: 1 }
    ])
  })
})

describe('parseThml — notes, page breaks, display HTML', () => {
  it('replaces a note with a numbered marker and keeps note text out of the section text', () => {
    const s = byId(anf.volume.sections, 'ii.ii.i')
    expect(s.html).toContain('<sup class="fn" data-note="ii.ii.i-p2.2">2</sup>')
    expect(s.notes).toEqual([{ anchor: 'ii.ii.i-p2.2', n: '2', html: '<p>Greek differs.</p>' }])
    expect(s.text).not.toContain('Greek differs')
    expect(byId(anf.volume.sections, 'i.i').text).toBe('This edition is a reprint.')
  })

  it('keeps inline formatting inside a note and renders scripture links inside notes', () => {
    expect(byId(anf.volume.sections, 'i.i').notes[0].html).toBe('<p>A note on the <i>edition</i>.</p>')
    const s = byId(npnf.volume.sections, 'vi.i.i')
    expect(s.notes[0].html).toBe('<p>Cf. <a class="scripref" data-osis="Bible:Ps.145.3">Ps. cxlv. 3</a>.</p>')
  })

  it('records references inside footnotes (inNote) anchored at the footnote marker', () => {
    const s = byId(npnf.volume.sections, 'vi.i.i')
    expect(s.refs.map((r) => [r.book, r.inNote])).toEqual([
      ['PSA', true],
      ['1CO', false]
    ])
    // The marker follows "Great art Thou, O Lord" in the text.
    expect(s.text.slice(0, s.refs[0].charOffset)).toBe('Great art Thou, O Lord')
    expect(s.text.slice(s.refs[1].charOffset)).toMatch(/^saints/)
    // Footnote text itself stays out of the searchable text.
    expect(s.text).not.toContain('Cf.')
  })

  it('records page breaks with char offsets and a start page', () => {
    const s = byId(anf.volume.sections, 'ix.ii.ii')
    expect(s.pages).toEqual([{ n: '415', charOffset: 0 }])
    expect(s.startPage).toBe('415')
    expect(s.html.startsWith('<span class="pb" data-page="415"></span>')).toBe(true)
  })

  it('derives the page from id/href when <pb> has no n attribute, and tracks a mid-paragraph break', () => {
    const s = byId(npnf.volume.sections, 'vi.i.i')
    expect(s.startPage).toBe('27') // from <pb href=".../Page_27.html"> in the div1, before this section
    expect(s.pages).toHaveLength(1)
    expect(s.pages[0].n).toBe('28')
    expect(s.text.slice(s.pages[0].charOffset)).toMatch(/^ Thou awakest/)
    expect(s.html).toContain('praised.<span class="pb" data-page="28"></span> Thou awakest')
  })

  it('drops index markers, images and scripCom, and unwraps a, q, name, cite', () => {
    const xml = miniThml(
      `<div1 id="a" title="A"><p>Hi<index id="x" subject1="s" type="subject"/> <a href="#x">link</a> <q>q</q> <name id="n">Nm</name> <cite id="c">Ct</cite><img src="x.png"/><scripCom id="s" osisRef="Bible:Rev.1.1" type="Citation"/>.</p></div1>`
    )
    const s = parseThml(xml, 'anf99')
    expect(s.volume.sections[0].html).toBe('<p>Hi link q Nm Ct.</p>')
    expect(s.warnings).toEqual([])
  })

  it('emits only allow-listed tags and maps headings, lists, tables, lines and verses', () => {
    const xml = miniThml(
      `<div1 id="a" title="A"><p>One <b>bold</b> <em>em</em> H<sub>2</sub>O x<sup>2</sup><br/>after <font color="red">fonty</font>.</p>` +
        `<h1>H1</h1><h4>H4</h4><h6>H6</h6><blockquote><p>Quote</p></blockquote>` +
        `<ul><li>one</li><li>two</li></ul><table><tr><td colspan="2">cell</td></tr></table>` +
        `<l>Line one</l><verse>Verse one</verse><div class="Center"><p>Centered</p></div><hr class="W30"/></div1>`
    )
    const { volume, warnings } = parseThml(xml, 'anf99')
    expect(volume.sections[0].html).toBe(
      '<p>One <b>bold</b> <em>em</em> H<sub>2</sub>O x<sup>2</sup><br>after fonty.</p>' +
        '<h3>H1</h3><h4>H4</h4><h4>H6</h4><blockquote><p>Quote</p></blockquote>' +
        '<ul><li>one</li><li>two</li></ul><table><tr><td>cell</td></tr></table>' +
        '<div class="l">Line one</div><div class="verse">Verse one</div><p>Centered</p>'
    )
    expect(volume.sections[0].text.split('\n')).toEqual([
      'One bold em H2O x2', 'after fonty.', 'H1', 'H4', 'H6', 'Quote', 'one', 'two', 'cell',
      'Line one', 'Verse one', 'Centered'
    ])
    expect(warnings).toEqual([{ kind: 'unknown-tag', detail: 'font', count: 1 }])
  })

  it('never emits attributes from the source or unescaped markup', () => {
    const xml = miniThml(
      `<div1 id="a" title="A"><p onclick="evil()" style="x">5 &lt; 6 &amp; 7 <script>alert("x")</script></p></div1>`
    )
    const html = parseThml(xml, 'anf99').volume.sections[0].html
    expect(html).not.toMatch(/onclick|style=|<script/)
    expect(html).toBe('<p>5 &lt; 6 &amp; 7 alert(&quot;x&quot;)</p>')
  })

  it('collapses source line-wrapping to single spaces', () => {
    const xml = miniThml(`<div1 id="a" title="A"><p>one\n   two\n\n three</p></div1>`)
    expect(parseThml(xml, 'anf99').volume.sections[0].text).toBe('one two three')
  })
})

describe('parseThml — input errors', () => {
  it('throws ThmlParseError for non-XML and non-ThML input', () => {
    expect(() => parseThml('this is not xml', 'anf01')).toThrow(ThmlParseError)
    expect(() => parseThml('<html><body/></html>', 'anf01')).toThrow(ThmlParseError)
    expect(() => parseThml('', 'anf01')).toThrow(ThmlParseError)
  })

  it('throws ThmlParseError for malformed XML', () => {
    expect(() => parseThml('<ThML><ThML.body><div1 id="a"><p>oops</div1></ThML.body></ThML>', 'anf01')).toThrow(
      ThmlParseError
    )
  })

  it('returns an empty volume (not an error) for a ThML file with no divs', () => {
    const r = parseThml(miniThml(''), 'anf99')
    expect(r.volume.sections).toEqual([])
    expect(r.volume.title).toBe('Test Volume')
  })
})
```

- [ ] **Step 3: Run them to verify they fail**

Run: `npx vitest run src/main/services/thml.test.ts`
Expected: FAIL — cannot resolve `./thml`.

- [ ] **Step 4: Implement the parser**

**Create `src/main/services/thml.ts`**

```ts
// ThML (CCEL's Theological Markup Language) parser for the Schaff Church Fathers volumes.
//
// Pure: XML string in, sections out — no database, no filesystem, no Electron. A streaming SAX
// pass (`saxes`, pure JS, so no native build) turns each volume into reading-order sections with
// sanitized display HTML, plain text for full-text search, structured Scripture references,
// footnotes and original page breaks. See docs/superpowers/specs/2026-10-09-church-fathers-thml-design.md.
//
// Real-data facts this module encodes (observed in CCEL's anf01–anf10 / npnf101–104):
//  - A contained work's `<ThML.head>` sits immediately BEFORE the div it describes (a div1 or a
//    div2), inside `<ThML.body>`. It scopes that div and its descendants only.
//  - Heads are sometimes wrong (anf01's Barnabas and Papias heads say authorID "ignatius"); the
//    parser reports what the file says and fathersIndex.ts applies curated overrides.
//  - ANF groups by author at div1 ("CLEMENT OF ROME"); NPNF div1s are works ("The Confessions")
//    and carry no per-work heads, so a single-author volume falls back to its DC.Creator.
//  - Depth goes to div5; `<pb>` carries its page in `n` (anf) or only in `id`/`href` (npnf).
import { SaxesParser } from 'saxes'
import { parseOsisRef } from '../../shared/osis'

export interface ThmlRef {
  /** The scripRef element's id (shared by every passage of one osisRef list). */
  anchor: string
  osis: string
  passage: string
  /** USFM code. */
  book: string
  chapterStart: number
  verseStart: number | null
  chapterEnd: number
  verseEnd: number | null
  /** True when the reference sits inside a footnote. Footnotes are the editors' cross-references
   *  and hold ~99% of all scripRefs in the Schaff volumes, so a catena built from body text
   *  alone would be nearly empty. */
  inNote: boolean
  /** Offset into the section's `text` where the reference starts — or, for a footnote
   *  reference, where the footnote marker sits. */
  charOffset: number
}
export interface ThmlNote {
  anchor: string
  n: string
  html: string
}
export interface ThmlPage {
  n: string
  charOffset: number
}
export interface ThmlSection {
  /** CCEL div id, e.g. 'ii.ii.v'. A second section from the same div gets '~2', '~3'… */
  id: string
  /** Reading order within the volume. */
  ordinal: number
  /** div level (1–6). */
  depth: number
  /** Ancestor titles, outermost first, own title last. */
  titles: string[]
  shortTitle: string
  authorId: string | null
  workTitle: string | null
  editorial: boolean
  /** Page label in force where the section begins (null if the volume has no page breaks yet). */
  startPage: string | null
  html: string
  text: string
  refs: ThmlRef[]
  notes: ThmlNote[]
  pages: ThmlPage[]
}
export interface ThmlVolume {
  code: string
  title: string
  sections: ThmlSection[]
}
export interface ThmlWarning {
  kind: 'unknown-tag' | 'bad-osis' | 'non-canon-ref'
  detail: string
  count: number
}
export interface ThmlResult {
  volume: ThmlVolume
  warnings: ThmlWarning[]
}

export class ThmlParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ThmlParseError'
  }
}

// ---------- small helpers ----------

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }
const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ESC[c])
const norm = (s: string | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim()

/** 'IRENÆUS' -> 'irenaeus', 'CLEMENT OF ROME' -> 'clement_of_rome'. */
export function slugifyAuthor(title: string): string {
  return title
    .replace(/Æ/g, 'AE')
    .replace(/æ/g, 'ae')
    .replace(/Œ/g, 'OE')
    .replace(/œ/g, 'oe')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

/** "ANF01. The Apostolic Fathers…" / "NPNF1-01. The Confessions…" -> the bare title. */
function cleanVolumeTitle(raw: string): string {
  return norm(raw).replace(/^(?:ANF|NPNF[12]?)[-\s]?\d+\.\s+/i, '')
}

// A title that is the editor's rather than the Father's, at any depth.
const ALWAYS_EDITORIAL =
  /introductory\s+(?:note|notice)|elucidations?|excursus|appended\s+note|prolegomena|(?:translator|editor)[’']?s?\s+(?:preface|note|introduction)|\bindex(?:es)?\b|^(?:second\s+)?title\s+pages?\.?$|^series\s+title$|^contents\.?$|^table\s+of\s+contents\.?$/i
// A preface/introduction is editorial only when it heads the volume or a work (depth ≤ 2): a
// Father's own "Preface." at chapter level (Irenaeus, Against Heresies III) is his text.
const TOP_LEVEL_EDITORIAL =
  /^(?:general\s+|bibliographical\s+)?(?:preface|introduction)\b|^advertisement\b/i

export function isEditorialTitles(titles: string[]): boolean {
  return titles.some((t, i) => ALWAYS_EDITORIAL.test(t) || (i <= 1 && TOP_LEVEL_EDITORIAL.test(t)))
}

// ---------- output sink (sanitized HTML + plain text) ----------

class Sink {
  html = ''
  text = ''
  private atStart = true

  constructor(private readonly trackText: boolean) {}

  addText(raw: string): void {
    let t = raw.replace(/\s+/g, ' ')
    if (this.atStart) t = t.replace(/^ /, '')
    if (!t) return
    this.html += esc(t)
    this.atStart = false
    if (this.trackText) {
      if (this.text === '' || /[ \n]$/.test(this.text)) t = t.replace(/^ /, '')
      this.text += t
    }
  }
  openInline(h: string): void {
    this.html += h
  }
  closeInline(h: string): void {
    this.html += h
  }
  /** Markup with no text of its own; `visible` marks it as content (footnote marker). */
  raw(h: string, visible: boolean): void {
    this.html += h
    if (visible) this.atStart = false
  }
  openBlock(h: string): void {
    this.html += h
    this.boundary()
  }
  endBlock(h: string): void {
    this.html += h
    this.boundary()
  }
  lineBreak(): void {
    this.html += '<br>'
    this.boundary()
  }
  /** A block edge with no markup of its own (a transparent <div>). */
  boundary(): void {
    this.atStart = true
    if (!this.trackText || this.text === '' || this.text.endsWith('\n')) return
    this.text = this.text.replace(/ +$/, '') + '\n'
  }
}

// ---------- tag tables ----------

const DIV_RE = /^div[1-6]$/
/** Tags whose subtree is discarded (index markers, scripCom citations, images, rules). */
const DROP = new Set(['index', 'insertIndex', 'scripCom', 'img', 'hr', 'style'])
/** Tags unwrapped silently: text kept, tag dropped. */
const UNWRAP_INLINE = new Set(['a', 'name', 'cite', 'attr', 'q', 'ThML.body', 'ThML'])
const BLOCK_OUT: Record<string, string> = {
  p: 'p', blockquote: 'blockquote', ul: 'ul', ol: 'ol', li: 'li', table: 'table', tr: 'tr', td: 'td',
  th: 'th', h1: 'h3', h2: 'h3', h3: 'h3', h4: 'h4', h5: 'h4', h6: 'h4'
}
const INLINE_OUT: Record<string, string> = { i: 'i', em: 'em', b: 'b', strong: 'b', sup: 'sup', sub: 'sub' }

type Elem =
  | { kind: 'drop' }
  | { kind: 'unwrap'; block: boolean }
  | { kind: 'out'; close: string; block: boolean; emitted: boolean }
  | { kind: 'div' }
  | { kind: 'note' }
  | { kind: 'scripref'; wrapped: boolean }

interface DivFrame {
  id: string
  depth: number
  titles: string[]
  shortTitle: string
  authorId: string | null
  workTitle: string | null
  editorial: boolean
}
interface Builder {
  frame: DivFrame
  sink: Sink
  refs: ThmlRef[]
  notes: ThmlNote[]
  pages: ThmlPage[]
  prevPage: string | null
}

type Attrs = Record<string, string>

/** Parse one ThML volume. `code` is the CCEL volume code ('anf01', 'npnf105') — it decides how
 *  author attribution falls back when a div has no contained-work head. Throws ThmlParseError
 *  only for input that is not well-formed ThML; odd content never throws, it produces warnings. */
export function parseThml(xml: string, code: string): ThmlResult {
  if (!/<ThML[\s>]/.test(xml.slice(0, 50000))) throw new ThmlParseError('Not a ThML document (no <ThML> root)')

  const isAnf = /^anf/i.test(code)
  const sections: ThmlSection[] = []
  const warnings = new Map<string, ThmlWarning>()
  const warn = (kind: ThmlWarning['kind'], detail: string): void => {
    const key = `${kind}|${detail}`
    const w = warnings.get(key)
    if (w) w.count++
    else warnings.set(key, { kind, detail, count: 1 })
  }

  const frames: DivFrame[] = []
  const elems: Elem[] = []
  const idUses = new Map<string, number>()
  let builder: Builder | null = null
  let noteCtx: { anchor: string; n: string; sink: Sink; offset: number } | null = null
  let currentPage: string | null = null
  let dropDepth = 0
  let scripDepth = 0
  let anonDivs = 0

  // ThML.head state
  let bodySeen = false
  let headDepth = 0
  let head: { authorId: string | null; title: string | null; creators: string[] } = {
    authorId: null,
    title: null,
    creators: []
  }
  let capture: 'authorID' | 'title' | 'creator' | null = null
  let captureText = ''
  let volumeTitle = ''
  let volumeAuthors: string[] = []
  let pendingHead: { authorId: string | null; title: string | null } | null = null

  const volumeAuthor = (): string | null => (volumeAuthors.length === 1 ? volumeAuthors[0] : null)

  const ensureBuilder = (): Builder | null => {
    if (builder) return builder
    const frame = frames[frames.length - 1]
    if (!frame) return null
    builder = { frame, sink: new Sink(true), refs: [], notes: [], pages: [], prevPage: currentPage }
    return builder
  }
  /** The sink content should currently go to (creating the section builder on demand). */
  const sink = (): Sink | null => {
    const b = ensureBuilder()
    if (!b) return null
    return noteCtx ? noteCtx.sink : b.sink
  }
  /** Like sink() but never creates a builder (used when closing tags). */
  const curSink = (): Sink | null => (builder ? (noteCtx ? noteCtx.sink : builder.sink) : null)

  const flushSection = (): void => {
    const b = builder
    builder = null
    noteCtx = null
    if (!b) return
    const text = b.sink.text.replace(/\s+$/, '')
    if (!text.trim()) return
    const uses = idUses.get(b.frame.id) ?? 0
    idUses.set(b.frame.id, uses + 1)
    const id = uses === 0 ? b.frame.id : `${b.frame.id}~${uses + 1}`
    const clamp = (n: number): number => Math.min(n, text.length)
    const pages = b.pages.map((p) => ({ n: p.n, charOffset: clamp(p.charOffset) }))
    sections.push({
      id,
      ordinal: sections.length,
      depth: b.frame.depth,
      titles: b.frame.titles,
      shortTitle: b.frame.shortTitle,
      authorId: b.frame.authorId,
      workTitle: b.frame.workTitle,
      editorial: b.frame.editorial,
      startPage: pages.length > 0 && pages[0].charOffset === 0 ? pages[0].n : b.prevPage,
      html: b.sink.html.trim(),
      text,
      refs: b.refs.map((r) => ({ ...r, charOffset: clamp(r.charOffset) })),
      notes: b.notes,
      pages
    })
  }

  const openDiv = (name: string, a: Attrs): void => {
    flushSection() // the parent's text so far becomes its own section
    const depth = Number(name.slice(3))
    const parent = frames[frames.length - 1]
    const title = norm(a.title) || norm(a.shorttitle) || norm(a.n) || a.id || ''
    const titles = [...(parent?.titles ?? []), title]
    const editorial = isEditorialTitles(titles)
    // CCEL gives front-matter divs junk head ids ('title_page', 'second_title_page'): never an author.
    const headAuthor = editorial && depth === 1 ? null : (pendingHead?.authorId ?? null)
    let authorId = headAuthor ?? parent?.authorId ?? null
    if (!headAuthor && !parent) {
      authorId = editorial ? null : isAnf ? slugifyAuthor(title) || null : volumeAuthor()
    }
    frames.push({
      id: a.id || `div${depth}-${++anonDivs}`,
      depth,
      titles,
      shortTitle: norm(a.shorttitle) || title,
      authorId,
      workTitle: pendingHead?.title ?? parent?.workTitle ?? null,
      editorial
    })
    pendingHead = null
  }

  const handlePb = (a: Attrs): void => {
    const n =
      norm(a.n) ||
      /Page_([A-Za-z0-9]+)(?:\.html)?$/.exec(a.id ?? '')?.[1] ||
      /Page_([A-Za-z0-9]+)\.html$/.exec(a.href ?? '')?.[1]
    if (!n || noteCtx) return
    const b = ensureBuilder()
    if (b) {
      b.pages.push({ n, charOffset: b.sink.text.length })
      b.sink.raw(`<span class="pb" data-page="${esc(n)}"></span>`, false)
    }
    currentPage = n
  }

  const openScripRef = (a: Attrs): void => {
    const s = sink()
    const osis = norm(a.osisRef)
    const nested = scripDepth > 0
    const res = !s || nested ? ({ kind: 'bad' } as const) : parseOsisRef(osis)
    if (!s || res.kind !== 'ok') {
      if (s && !nested) {
        if (res.kind === 'non-canon') warn('non-canon-ref', res.book)
        else warn('bad-osis', osis || '(missing)')
      }
      elems.push({ kind: 'scripref', wrapped: false })
      return
    }
    s.openInline(`<a class="scripref" data-osis="${esc(osis)}">`)
    scripDepth++
    elems.push({ kind: 'scripref', wrapped: true })
    if (builder) {
      const anchor = a.id || `${builder.frame.id}-r${builder.refs.length + 1}`
      const passage = norm(a.passage) || osis
      for (const p of res.passages) {
        builder.refs.push({
          anchor,
          osis,
          passage,
          book: p.book,
          chapterStart: p.chapterStart,
          verseStart: p.verseStart,
          chapterEnd: p.chapterEnd,
          verseEnd: p.verseEnd,
          inNote: noteCtx !== null,
          charOffset: noteCtx ? noteCtx.offset : builder.sink.text.length
        })
      }
    }
  }

  const openNote = (a: Attrs): void => {
    const b = ensureBuilder()
    if (!b || noteCtx) {
      dropDepth++
      elems.push({ kind: 'drop' })
      return
    }
    const idx = b.notes.length + 1
    const anchor = a.id || `${b.frame.id}-n${idx}`
    const n = norm(a.n) || String(idx)
    noteCtx = { anchor, n, sink: new Sink(false), offset: b.sink.text.length }
    b.sink.raw(`<sup class="fn" data-note="${esc(anchor)}">${esc(n)}</sup>`, true)
    elems.push({ kind: 'note' })
  }

  // ----- head handling -----
  const headOpen = (name: string, a: Attrs): void => {
    headDepth++
    if (name === 'authorID') {
      capture = 'authorID'
      captureText = ''
    } else if (name === 'DC.Title' && !a.sub && head.title === null) {
      capture = 'title'
      captureText = ''
    } else if (name === 'DC.Creator' && a.sub === 'Author' && a.scheme === 'ccel') {
      capture = 'creator'
      captureText = ''
    }
  }
  const headClose = (): void => {
    if (capture) {
      const v = norm(captureText)
      if (v) {
        if (capture === 'authorID') head.authorId = v
        else if (capture === 'title') head.title = v
        else if (!head.creators.includes(v)) head.creators.push(v)
      }
      capture = null
    }
    headDepth--
    if (headDepth === 0) {
      if (bodySeen) pendingHead = { authorId: head.authorId, title: head.title }
      else {
        volumeTitle = head.title ?? ''
        volumeAuthors = head.creators
      }
    }
  }

  // ----- SAX handlers -----
  const onOpen = (tag: { name: string; attributes: Attrs }): void => {
    const { name } = tag
    const a = tag.attributes
    if (headDepth > 0) return headOpen(name, a)
    if (name === 'ThML.head') {
      headDepth = 1
      head = { authorId: null, title: null, creators: [] }
      return
    }
    if (dropDepth > 0) {
      dropDepth++
      elems.push({ kind: 'drop' })
      return
    }
    if (name === 'ThML.body') bodySeen = true
    if (DIV_RE.test(name)) {
      openDiv(name, a)
      elems.push({ kind: 'div' })
      return
    }
    if (DROP.has(name)) {
      dropDepth++
      elems.push({ kind: 'drop' })
      return
    }
    if (name === 'pb') {
      handlePb(a)
      elems.push({ kind: 'unwrap', block: false })
      return
    }
    if (name === 'note') return openNote(a)
    if (name === 'scripRef') return openScripRef(a)
    if (name === 'span') {
      if (a.class === 'sc') {
        const s = sink()
        s?.openInline('<span class="sc">')
        elems.push({ kind: 'out', close: '</span>', block: false, emitted: !!s })
      } else elems.push({ kind: 'unwrap', block: false })
      return
    }
    if (name in BLOCK_OUT || name === 'l' || name === 'verse') {
      const s = sink()
      const tagName = BLOCK_OUT[name]
      const open = tagName ? `<${tagName}>` : `<div class="${name === 'l' ? 'l' : 'verse'}">`
      const close = tagName ? `</${tagName}>` : '</div>'
      s?.openBlock(open)
      elems.push({ kind: 'out', close, block: true, emitted: !!s })
      return
    }
    if (name in INLINE_OUT) {
      const s = sink()
      s?.openInline(`<${INLINE_OUT[name]}>`)
      elems.push({ kind: 'out', close: `</${INLINE_OUT[name]}>`, block: false, emitted: !!s })
      return
    }
    if (name === 'br') {
      sink()?.lineBreak()
      elems.push({ kind: 'unwrap', block: false })
      return
    }
    if (name === 'div' || name === 'center') {
      sink()?.boundary()
      elems.push({ kind: 'unwrap', block: true })
      return
    }
    if (!UNWRAP_INLINE.has(name)) warn('unknown-tag', name)
    elems.push({ kind: 'unwrap', block: false })
  }

  const onClose = (): void => {
    if (headDepth > 0) return headClose()
    const el = elems.pop()
    if (!el) return
    switch (el.kind) {
      case 'drop':
        dropDepth--
        break
      case 'unwrap':
        if (el.block) curSink()?.boundary()
        break
      case 'out': {
        const s = curSink()
        if (s && el.emitted) {
          if (el.block) s.endBlock(el.close)
          else s.closeInline(el.close)
        }
        break
      }
      case 'div':
        flushSection()
        frames.pop()
        break
      case 'note':
        if (builder && noteCtx) {
          builder.notes.push({ anchor: noteCtx.anchor, n: noteCtx.n, html: noteCtx.sink.html.trim() })
        }
        noteCtx = null
        break
      case 'scripref':
        if (el.wrapped) {
          curSink()?.closeInline('</a>')
          scripDepth--
        }
        break
    }
  }

  const onText = (t: string): void => {
    if (headDepth > 0) {
      if (capture) captureText += t
      return
    }
    if (dropDepth > 0 || !t) return
    if (!builder && !/\S/.test(t)) return
    sink()?.addText(t)
  }

  const parser = new SaxesParser()
  parser.on('error', (e) => {
    throw new ThmlParseError(`Invalid ThML XML: ${e.message}`)
  })
  parser.on('opentag', onOpen)
  parser.on('closetag', onClose)
  parser.on('text', onText)
  parser.on('cdata', onText)
  parser.write(xml).close()

  return {
    volume: { code, title: cleanVolumeTitle(volumeTitle) || code, sections },
    warnings: [...warnings.values()].sort((a, b) => b.count - a.count || a.detail.localeCompare(b.detail))
  }
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/main/services/thml.test.ts`
Expected: PASS — 34 tests. (If a literal differs only in whitespace, fix the implementation, not the test: the tests encode the documented rules.)

- [ ] **Step 6: Typecheck and commit**

```bash
npm run typecheck:node
git add src/main/services/thml.ts src/main/services/thml.test.ts src/main/services/__fixtures__/thmlSamples.ts
git commit -m "feat(fathers): ThML parser (saxes) with sanitized HTML, refs, notes and pages" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Real-data smoke test happens in Task 7 (`tools/validate-thml.mjs` over `.firecrawl/ccel`): during planning the same code parsed all 38 real volumes with no errors.

---


### Task 4: Indexer, full-text search rows, startup wiring (model: sonnet)

**Files:**
- Create: `src/main/services/fathersIndex.ts`
- Modify: `src/main/services/config.ts` (add `fathersVaultDir`)
- Modify: `src/main/services/search.ts` (`HitRow` kind, `indexFathersForSearch`, `removeFathersFromSearch`)
- Modify: `src/shared/ipc.ts` (`SearchKind` and `SearchHit.kind` gain `'father'`)
- Modify: `src/main/index.ts` (startup timer)
- Test: `src/main/services/fathersIndex.test.ts`

**Interfaces:**
- Consumes: `parseThml` / `ThmlVolume` / `ThmlWarning` (Task 3); `seedFathersAuthors`, `correctedAuthor` (Task 1); `parseFathersCode`, `FathersSeries` (Task 2); `shouldReindex` from `commentaryIndex.ts` (existing); the `fathers_*` tables (Task 1).
- Produces:
  - `fathersVaultDir(): string` = `join(localVaultDir(), 'fathers')`
  - `indexFathersForSearch(volumeCode: string): void`, `removeFathersFromSearch(volumeCode: string): void` in `search.ts`
  - from `fathersIndex.ts`: `parseVolumeFile(fileName: string): { code: string; series: FathersSeries; number: number } | null`, `deriveWorkTitle(series, workTitle: string | null, titles: string[]): string`, `writeFathersVolume(info, volume, mtime): void`, `indexFathersVolume(info, absPath, mtime): Promise<{ sections: number; warnings: ThmlWarning[] }>`, `syncFathersFolder(): Promise<void>`
  - `search(query, { kind: 'father' })` returns hits `{ kind: 'father', bookId: <volume code>, ref: <section id>, page: <number|null>, title: <short title> }`.

Behaviour (mirrors `syncBocFolder`): all `*.xml` files whose names parse as volume codes are registered first (status `unindexed`, so the drawer can list them immediately); each is then re-indexed when its mtime (whole seconds, cached in `fathers-index-mtimes.json` in the data dir) changed or its DB status is `unindexed`; a failure records `status='error'` + message and the volume is **not** retried until its file changes; between volumes the loop yields to the event loop.

- [ ] **Step 1: Write the failing test**

**Create `src/main/services/fathersIndex.test.ts`**

```ts
import Database from 'better-sqlite3'
import { existsSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runMigrations } from '../db/migrations'
import { FATHERS_AUTHORS } from '../data/fathersAuthors'
import { ANF_MINI, NPNF_MINI } from './__fixtures__/thmlSamples'

let db: Database.Database
let dataDir: string
vi.mock('../db/connection', () => ({ getDb: () => db, getDataDir: () => dataDir }))

beforeEach(() => {
  db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
  dataDir = mkdtempSync(join(tmpdir(), 'loci-fathers-index-'))
})

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true })
})

import { deriveWorkTitle, parseVolumeFile, syncFathersFolder } from './fathersIndex'
import { search } from './search'

const fathersDir = (): string => join(dataDir, 'vault', 'fathers')
function writeVolume(fileName: string, xml: string): string {
  mkdirSync(fathersDir(), { recursive: true })
  const p = join(fathersDir(), fileName)
  writeFileSync(p, xml)
  return p
}
const count = (sql: string, ...args: unknown[]): number =>
  (db.prepare(sql).get(...args) as { n: number }).n

describe('parseVolumeFile', () => {
  it('accepts CCEL volume file names and decodes series and number', () => {
    expect(parseVolumeFile('anf01.xml')).toEqual({ code: 'anf01', series: 'anf', number: 1 })
    expect(parseVolumeFile('NPNF105.XML')).toEqual({ code: 'npnf105', series: 'npnf1', number: 5 })
    expect(parseVolumeFile('npnf214.xml')).toEqual({ code: 'npnf214', series: 'npnf2', number: 14 })
  })
  it('rejects anything else', () => {
    for (const f of ['readme.xml', 'anf1.xml', 'anf01.html', 'anf01', 'npnf301.xml', '_author_ids.json']) {
      expect(parseVolumeFile(f)).toBeNull()
    }
  })
})

describe('deriveWorkTitle', () => {
  it('prefers a contained-work head title', () => {
    expect(deriveWorkTitle('anf', 'Against Heresies: Book III', ['IRENÆUS', 'x'])).toBe('Against Heresies: Book III')
  })
  it('falls back to the div2 title in ANF and the div1 title in NPNF', () => {
    expect(deriveWorkTitle('anf', null, ['IRENÆUS', 'Introductory Note'])).toBe('Introductory Note')
    expect(deriveWorkTitle('anf', null, ['Title Page'])).toBe('Title Page')
    expect(deriveWorkTitle('npnf1', null, ['The Confessions', 'Book I', 'Chapter I'])).toBe('The Confessions')
  })
})

describe('syncFathersFolder', () => {
  it('does nothing (and does not throw) when the vault has no fathers folder', async () => {
    await syncFathersFolder()
    expect(count('SELECT COUNT(*) AS n FROM fathers_volumes')).toBe(0)
  })

  it('indexes volumes: sections, refs, notes, pages, authors and the volume rows', async () => {
    writeVolume('anf01.xml', ANF_MINI)
    writeVolume('npnf101.xml', NPNF_MINI)
    writeVolume('readme.xml', '<x/>') // ignored
    await syncFathersFolder()

    expect(db.prepare('SELECT code, series, number, title, status, error FROM fathers_volumes ORDER BY code').all()).toEqual([
      {
        code: 'anf01', series: 'anf', number: 1,
        title: 'The Apostolic Fathers with Justin Martyr and Irenaeus', status: 'indexed', error: null
      },
      {
        code: 'npnf101', series: 'npnf1', number: 1,
        title: 'The Confessions and Letters of St. Augustine, with a Sketch of his Life and Work',
        status: 'indexed', error: null
      }
    ])
    expect(count("SELECT COUNT(*) AS n FROM fathers_sections WHERE volume_code='anf01'")).toBe(11)
    expect(count("SELECT COUNT(*) AS n FROM fathers_sections WHERE volume_code='npnf101'")).toBe(2)
    expect(count("SELECT COUNT(*) AS n FROM fathers_scripture_refs WHERE volume_code='anf01'")).toBe(6)
    expect(count("SELECT COUNT(*) AS n FROM fathers_scripture_refs WHERE volume_code='npnf101' AND in_note=1")).toBe(1)
    expect(count("SELECT COUNT(*) AS n FROM fathers_notes WHERE volume_code='anf01'")).toBe(2)
    expect(count("SELECT COUNT(*) AS n FROM fathers_pages WHERE volume_code='anf01'")).toBe(5)
    expect(count('SELECT COUNT(*) AS n FROM fathers_authors')).toBe(FATHERS_AUTHORS.length)
    expect(existsSync(join(dataDir, 'fathers-index-mtimes.json'))).toBe(true)
  })

  it('stores structured refs and the editorial / start-page columns', async () => {
    writeVolume('anf01.xml', ANF_MINI)
    await syncFathersFolder()
    expect(
      db
        .prepare(
          `SELECT book, chapter_start AS cs, verse_start AS vs, chapter_end AS ce, verse_end AS ve, in_note AS inNote
           FROM fathers_scripture_refs WHERE section_id = 'ix.ii.ii' ORDER BY char_offset, book`
        )
        .all()
    ).toEqual([
      { book: 'ROM', cs: 16, vs: 3, ce: 16, ve: 4, inNote: 0 },
      { book: '1CO', cs: 2, vs: 9, ce: 2, ve: 9, inNote: 0 },
      { book: 'ISA', cs: 64, vs: 4, ce: 64, ve: 4, inNote: 0 }
    ])
    const sec = db
      .prepare("SELECT editorial, start_page AS sp, work_title AS wt FROM fathers_sections WHERE id = 'ix.i'")
      .get()
    expect(sec).toEqual({ editorial: 1, sp: '6', wt: 'Introductory Note to Irenæus Against Heresies' })
  })

  it('applies the curated author override over a wrong CCEL head (Barnabas -> barnabas)', async () => {
    writeVolume('anf01.xml', ANF_MINI)
    await syncFathersFolder()
    const authorOf = (id: string): string | null =>
      (db.prepare("SELECT author_id AS a FROM fathers_sections WHERE volume_code='anf01' AND id=?").get(id) as { a: string | null }).a
    expect(authorOf('vi.ii')).toBe('barnabas')
    expect(authorOf('ii.ii.i')).toBe('clement_rome')
    expect(authorOf('ix.ii.ii')).toBe('irenaeus')
    expect(authorOf('i')).toBeNull()
  })

  it('writes father rows into search_fts with volume, section, start page and title', async () => {
    writeVolume('anf01.xml', ANF_MINI)
    await syncFathersFolder()
    expect(count("SELECT COUNT(*) AS n FROM search_fts WHERE kind='father' AND book_id='anf01'")).toBe(11)
    expect(
      db
        .prepare("SELECT ref, page, title FROM search_fts WHERE kind='father' AND search_fts MATCH 'succession*'")
        .all()
    ).toEqual([{ ref: 'ix.ii.ii', page: 415, title: 'Chapter III.—Apostolic succession.' }])
    // A roman-numeral start page cannot be a numeric hit page.
    expect(
      (db.prepare("SELECT page FROM search_fts WHERE kind='father' AND ref='i.i'").get() as { page: unknown }).page
    ).toBeNull()
  })

  it('surfaces father hits through search(), scoped by kind', async () => {
    writeVolume('anf01.xml', ANF_MINI)
    await syncFathersFolder()
    const hits = search('tradition succession', { kind: 'father' })
    expect(hits).toHaveLength(1)
    expect(hits[0]).toMatchObject({
      kind: 'father', bookId: 'anf01', ref: 'ix.ii.ii', page: 415, title: 'Chapter III.—Apostolic succession.'
    })
    expect(hits[0].snippet).toContain('⟦')
    expect(search('tradition succession', { kind: 'page' })).toEqual([])
    expect(search('tradition succession', { kind: 'all' })).toHaveLength(1)
  })

  it('skips an unchanged file and re-indexes it (replacing, not duplicating) when its mtime changes', async () => {
    const p = writeVolume('anf01.xml', ANF_MINI)
    await syncFathersFolder()
    db.prepare("DELETE FROM fathers_sections WHERE volume_code='anf01' AND id='ii'").run()

    await syncFathersFolder() // unchanged mtime, status indexed: skipped
    expect(count("SELECT COUNT(*) AS n FROM fathers_sections WHERE volume_code='anf01'")).toBe(10)

    const later = new Date(Date.now() + 10_000)
    utimesSync(p, later, later)
    await syncFathersFolder()
    expect(count("SELECT COUNT(*) AS n FROM fathers_sections WHERE volume_code='anf01'")).toBe(11)
    expect(count("SELECT COUNT(*) AS n FROM fathers_scripture_refs WHERE volume_code='anf01'")).toBe(6)
    expect(count("SELECT COUNT(*) AS n FROM search_fts WHERE kind='father' AND book_id='anf01'")).toBe(11)
  })

  it('re-indexes a volume the database says is unindexed even when the mtime cache matches', async () => {
    writeVolume('anf01.xml', ANF_MINI)
    await syncFathersFolder()
    db.prepare("DELETE FROM fathers_sections WHERE volume_code='anf01'").run()
    db.prepare("UPDATE fathers_volumes SET status='unindexed' WHERE code='anf01'").run()
    await syncFathersFolder()
    expect(count("SELECT COUNT(*) AS n FROM fathers_sections WHERE volume_code='anf01'")).toBe(11)
  })

  it('records a malformed volume as status=error with a message and still indexes the others', async () => {
    writeVolume('anf01.xml', ANF_MINI)
    const bad = writeVolume('anf02.xml', 'this is definitely not xml')
    await syncFathersFolder()
    const rows = db.prepare('SELECT code, status, error FROM fathers_volumes ORDER BY code').all() as {
      code: string; status: string; error: string | null
    }[]
    expect(rows.map((r) => [r.code, r.status])).toEqual([['anf01', 'indexed'], ['anf02', 'error']])
    expect(rows[1].error).toMatch(/ThML/)
    expect(count("SELECT COUNT(*) AS n FROM fathers_sections WHERE volume_code='anf02'")).toBe(0)

    // Not retried while the file is unchanged ...
    await syncFathersFolder()
    expect((db.prepare("SELECT status FROM fathers_volumes WHERE code='anf02'").get() as { status: string }).status).toBe('error')

    // ... but picked up once the file is replaced.
    writeFileSync(bad, ANF_MINI)
    const later = new Date(Date.now() + 20_000)
    utimesSync(bad, later, later)
    await syncFathersFolder()
    expect(
      db.prepare("SELECT status, error FROM fathers_volumes WHERE code='anf02'").get()
    ).toEqual({ status: 'indexed', error: null })
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- src/main/services/fathersIndex.test.ts`
Expected: FAIL — cannot resolve `./fathersIndex`.

- [ ] **Step 3: Add `fathersVaultDir`**

**Edit `src/main/services/config.ts`** (context lines locate each change; line numbers are indicative only)

```diff
--- a/src/main/services/config.ts
+++ b/src/main/services/config.ts
@@ -75,6 +75,12 @@
   return join(localVaultDir(), 'confessions-commentary')
 }
 
+/** The vault's Church Fathers folder: CCEL ThML volumes (anf01.xml … npnf214.xml) copied in
+ *  unchanged. Local to this device like `confessions/`; not mirrored to Drive (vaultsync). */
+export function fathersVaultDir(): string {
+  return join(localVaultDir(), 'fathers')
+}
+
 export function readConfig(): LociConfig {
   const p = configPath()
   if (!existsSync(p)) return { ...defaults }
```

- [ ] **Step 4: Add the FTS functions and widen the search kinds**

**Edit `src/main/services/search.ts`** (context lines locate each change; line numbers are indicative only)

```diff
--- a/src/main/services/search.ts
+++ b/src/main/services/search.ts
@@ -9,7 +9,7 @@
 }
 
 interface HitRow {
-  kind: 'page' | 'quote' | 'note' | 'scripture' | 'confession'
+  kind: 'page' | 'quote' | 'note' | 'scripture' | 'confession' | 'father'
   bookId: string | null
   ref: string | null
   page: number | null
@@ -222,6 +222,37 @@
   getDb().prepare("DELETE FROM search_fts WHERE kind = 'confession' AND book_id = ?").run(sourceId)
 }
 
+/**
+ * Index a Church Fathers volume's sections for search — one `search_fts` row per
+ * `fathers_sections` row. `book_id` is the volume code ('anf01'), `ref` the CCEL section id,
+ * `page` the numeric printed page the section starts on (null for roman-numeral front matter),
+ * and `title` the section's short title. Replaces the volume's previous rows.
+ */
+export function indexFathersForSearch(volumeCode: string): void {
+  const db = getDb()
+  const rows = db
+    .prepare(
+      `SELECT id, short_title AS title, start_page AS startPage, text
+       FROM fathers_sections WHERE volume_code = ? ORDER BY ordinal`
+    )
+    .all(volumeCode) as { id: string; title: string; startPage: string | null; text: string }[]
+  db.transaction(() => {
+    db.prepare("DELETE FROM search_fts WHERE kind = 'father' AND book_id = ?").run(volumeCode)
+    const ins = db.prepare(
+      "INSERT INTO search_fts (content, kind, book_id, ref, page, title) VALUES (?, 'father', ?, ?, ?, ?)"
+    )
+    for (const r of rows) {
+      if (!r.text.trim()) continue
+      const page = r.startPage && /^\d+$/.test(r.startPage) ? Number(r.startPage) : null
+      ins.run(r.text, volumeCode, r.id, page, r.title)
+    }
+  })()
+}
+
+export function removeFathersFromSearch(volumeCode: string): void {
+  getDb().prepare("DELETE FROM search_fts WHERE kind = 'father' AND book_id = ?").run(volumeCode)
+}
+
 export function unindexedBooks(): { id: string; title: string }[] {
   return getDb()
     .prepare('SELECT id, title FROM books WHERE indexed = 0 AND pdf_path IS NOT NULL')
```

**Edit `src/shared/ipc.ts`** (context lines locate each change; line numbers are indicative only)

```diff
--- a/src/shared/ipc.ts
+++ b/src/shared/ipc.ts
@@ -590,7 +628,7 @@
   | { type: 'note'; path: string }
   | null
 
-export type SearchKind = 'all' | 'page' | 'quote' | 'note' | 'scripture' | 'confession'
+export type SearchKind = 'all' | 'page' | 'quote' | 'note' | 'scripture' | 'confession' | 'father'
 
 export interface SearchScope {
   kind: SearchKind
@@ -602,7 +640,7 @@
 }
 
 export interface SearchHit {
-  kind: 'page' | 'quote' | 'note' | 'scripture' | 'confession'
+  kind: 'page' | 'quote' | 'note' | 'scripture' | 'confession' | 'father'
   bookId: string | null
   ref: string | null
   page: number | null
```

- [ ] **Step 5: Create the indexer**

**Create `src/main/services/fathersIndex.ts`**

```ts
import { existsSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'fs'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { getDataDir, getDb } from '../db/connection'
import { fathersVaultDir } from './config'
import { shouldReindex } from './commentaryIndex'
import { indexFathersForSearch } from './search'
import { parseThml } from './thml'
import type { ThmlVolume, ThmlWarning } from './thml'
import { correctedAuthor, seedFathersAuthors } from '../data/fathersAuthors'
import { parseFathersCode } from '../../shared/fathers'
import type { FathersSeries } from '../../shared/fathers'

export interface FathersVolumeInfo {
  code: string
  series: FathersSeries
  number: number
}

/** 'anf01.xml' -> { code: 'anf01', series: 'anf', number: 1 }; null for any other file name. */
export function parseVolumeFile(fileName: string): FathersVolumeInfo | null {
  const m = /^(.+)\.xml$/i.exec(fileName)
  if (!m) return null
  const code = m[1].toLowerCase()
  const parsed = parseFathersCode(code)
  return parsed ? { code, ...parsed } : null
}

/**
 * The work a section belongs to, always non-null so the Authors view can group on it. A
 * contained-work head's title wins. Without one: ANF groups by author at div1 so the work is the
 * div2 title; NPNF div1s are the works themselves.
 */
export function deriveWorkTitle(series: FathersSeries, workTitle: string | null, titles: string[]): string {
  if (workTitle) return workTitle
  if (series === 'anf') return titles[1] ?? titles[0] ?? ''
  return titles[0] ?? ''
}

export interface FathersIndexSummary {
  sections: number
  warnings: ThmlWarning[]
}

/** Replace one volume's rows (sections, refs, notes, pages) in a single transaction, update its
 *  volume row, and rewrite its search rows. */
export function writeFathersVolume(
  info: FathersVolumeInfo,
  volume: ThmlVolume,
  mtime: number
): void {
  const db = getDb()
  db.transaction(() => {
    for (const t of ['fathers_scripture_refs', 'fathers_notes', 'fathers_pages', 'fathers_sections']) {
      db.prepare(`DELETE FROM ${t} WHERE volume_code = ?`).run(info.code)
    }
    const insSection = db.prepare(
      `INSERT INTO fathers_sections
         (volume_code, id, ordinal, depth, titles_json, short_title, author_id, work_title, editorial,
          start_page, html, text)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
    )
    const insRef = db.prepare(
      `INSERT INTO fathers_scripture_refs
         (volume_code, section_id, anchor, osis, passage, book, chapter_start, verse_start,
          chapter_end, verse_end, in_note, char_offset)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
    )
    const insNote = db.prepare(
      'INSERT INTO fathers_notes (volume_code, section_id, anchor, n, html) VALUES (?,?,?,?,?)'
    )
    const insPage = db.prepare(
      'INSERT INTO fathers_pages (volume_code, section_id, n, char_offset) VALUES (?,?,?,?)'
    )
    for (const s of volume.sections) {
      insSection.run(
        info.code, s.id, s.ordinal, s.depth, JSON.stringify(s.titles), s.shortTitle,
        correctedAuthor(info.code, s.id, s.authorId),
        deriveWorkTitle(info.series, s.workTitle, s.titles),
        s.editorial ? 1 : 0, s.startPage, s.html, s.text
      )
      for (const r of s.refs) {
        insRef.run(
          info.code, s.id, r.anchor, r.osis, r.passage, r.book, r.chapterStart, r.verseStart,
          r.chapterEnd, r.verseEnd, r.inNote ? 1 : 0, r.charOffset
        )
      }
      for (const n of s.notes) insNote.run(info.code, s.id, n.anchor, n.n, n.html)
      for (const p of s.pages) insPage.run(info.code, s.id, p.n, p.charOffset)
    }
    db.prepare(
      `UPDATE fathers_volumes
       SET title = ?, mtime = ?, status = 'indexed', error = NULL, indexed_at = ? WHERE code = ?`
    ).run(volume.title, mtime, new Date().toISOString(), info.code)
    indexFathersForSearch(info.code)
  })()
}

/** Parse and index one volume file. Throws on unreadable / non-ThML input (the caller records
 *  that as the volume's error status). */
export async function indexFathersVolume(
  info: FathersVolumeInfo,
  absPath: string,
  mtime: number
): Promise<FathersIndexSummary> {
  const xml = await readFile(absPath, 'utf8')
  const { volume, warnings } = parseThml(xml, info.code)
  writeFathersVolume(info, volume, mtime)
  return { sections: volume.sections.length, warnings }
}

function ensureVolumeRow(info: FathersVolumeInfo, fileKey: string): { status: string } {
  const db = getDb()
  db.prepare(
    `INSERT OR IGNORE INTO fathers_volumes (code, series, number, title, file_key, status)
     VALUES (?, ?, ?, ?, ?, 'unindexed')`
  ).run(info.code, info.series, info.number, info.code, fileKey)
  return db.prepare('SELECT status FROM fathers_volumes WHERE code = ?').get(info.code) as { status: string }
}

function markVolumeError(code: string, mtime: number, message: string): void {
  getDb()
    .prepare(
      `UPDATE fathers_volumes SET status = 'error', error = ?, mtime = ?, indexed_at = ? WHERE code = ?`
    )
    .run(message.slice(0, 500), mtime, new Date().toISOString(), code)
}

/** Local, rebuildable record of the mtime (whole seconds) each volume file had when last indexed
 *  on THIS device — same rationale and format as boc-index-mtimes.json in bocIndex.ts. */
function indexMtimesPath(): string {
  return join(getDataDir(), 'fathers-index-mtimes.json')
}
function loadIndexMtimes(): Record<string, number> {
  try {
    return JSON.parse(readFileSync(indexMtimesPath(), 'utf8')) as Record<string, number>
  } catch {
    return {}
  }
}
function saveIndexMtimes(mtimes: Record<string, number>): void {
  const path = indexMtimesPath()
  const tmp = `${path}.tmp`
  writeFileSync(tmp, JSON.stringify(mtimes, null, 2))
  renameSync(tmp, path)
}

/**
 * Discover and index the ThML volumes in the vault's `fathers/` folder. Called at startup, after
 * the Confessions sync, and mirrors `syncBocFolder` (bocIndex.ts): new files register as volumes,
 * a volume is (re)indexed when its file's mtime changed or the database says it never indexed
 * (`shouldReindex`, shared with commentary sync), and failures are best-effort. Unlike the
 * Markdown corpora, a failure is recorded on the volume (`status='error'` + message, shown in the
 * Fathers drawer) so one bad file neither blocks the others nor fails silently. An errored volume
 * is not retried until its file changes.
 */
export async function syncFathersFolder(): Promise<void> {
  seedFathersAuthors(getDb())
  const folder = fathersVaultDir()
  if (!existsSync(folder)) return
  let files: string[]
  try {
    files = readdirSync(folder).sort()
  } catch {
    return
  }
  const mtimes = loadIndexMtimes()
  // Register every volume first, so the drawer lists them all ("indexing…") while they are parsed
  // one by one below.
  for (const fileName of files) {
    const info = parseVolumeFile(fileName)
    if (info) ensureVolumeRow(info, `fathers/${fileName}`)
  }
  for (const fileName of files) {
    const info = parseVolumeFile(fileName)
    if (!info) continue
    const abs = join(folder, fileName)
    let mtime: number
    try {
      mtime = Math.floor(statSync(abs).mtimeMs / 1000)
    } catch {
      continue // vanished between listing and stat — skip this pass
    }
    const key = `fathers/${fileName}`
    const row = ensureVolumeRow(info, key)
    if (!shouldReindex(mtimes[key], mtime, row.status)) continue
    try {
      await indexFathersVolume(info, abs, mtime)
    } catch (e) {
      markVolumeError(
        info.code,
        mtime,
        e instanceof Error ? e.message : String(e)
      )
    }
    mtimes[key] = mtime
    saveIndexMtimes(mtimes)
    // Parsing a 5 MB volume is synchronous; yield between volumes so the window stays responsive.
    await new Promise<void>((resolve) => setImmediate(resolve))
  }
}
```

- [ ] **Step 6: Start the sync at launch**

**Edit `src/main/index.ts`** (context lines locate each change; line numbers are indicative only)

```diff
--- a/src/main/index.ts
+++ b/src/main/index.ts
@@ -18,6 +18,7 @@
 import { syncVault } from './services/vaultsync'
 import { syncCommentaryFolder } from './services/commentaryIndex'
 import { syncBocFolder } from './services/bocIndex'
+import { syncFathersFolder } from './services/fathersIndex'
 import { Channels } from '../shared/ipc'
 
 /** One-time whole-library sidecar write, triggered by a flag file, run off the boot path. */
@@ -147,6 +148,9 @@
   // Same auto-register + index, for the Book of Concord's confessions/ + confessions-commentary/
   // vault folders. Staggered a beat after the commentary sync so the two don't contend.
   setTimeout(() => void syncBocFolder().catch(() => {}), 2500)
+  // Church Fathers (CCEL ThML) volumes in the vault's fathers/ folder. Parsing a 5 MB volume is
+  // synchronous, so this starts last and yields between volumes (see syncFathersFolder).
+  setTimeout(() => void syncFathersFolder().catch(() => {}), 3500)
 
   // Keep the Drive backup fresh during long sessions (best-effort, skips when offline).
   setInterval(() => {
```

- [ ] **Step 7: Run the tests (new file plus everything that touches search / the DB)**

Run: `npm test -- src/main/services src/main/data`
Expected: PASS — `fathersIndex.test.ts` 13 tests; all existing service tests still green.

- [ ] **Step 8: Typecheck and commit**

```bash
npm run typecheck
git add src/main/services/fathersIndex.ts src/main/services/fathersIndex.test.ts src/main/services/config.ts src/main/services/search.ts src/shared/ipc.ts src/main/index.ts
git commit -m "feat(fathers): index CCEL ThML volumes from the vault on startup, with FTS rows" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Query services and read-side IPC (model: sonnet)

**Files:**
- Create: `src/main/services/fathers.ts`
- Modify: `src/shared/ipc.ts` (`FathersSeries` import, six channels, six `LociApi` methods, the `Fathers*` types)
- Modify: `src/main/ipc/index.ts` (six handlers), `src/preload/index.ts` (six bridge methods)
- Test: `src/main/services/fathers.test.ts`

**Interfaces:**
- Consumes: the `fathers_*` tables (Task 1), `bookByCode` (existing), `FathersSeries` (Task 2).
- Produces (the IPC contract used by every renderer task):
  - types in `src/shared/ipc.ts`: `FathersVolume`, `FathersSectionSummary`, `FathersNote`, `FathersSection`, `FathersAuthorSummary`, `FathersWork`, `FathersAuthor`, `FathersCatenaEntry`, `FathersCatenaGroup` (shapes in the code below)
  - `Channels`: `listFathersVolumes 'fathers:listVolumes'`, `listFathersSections`, `getFathersSection`, `listFathersAuthors`, `getFathersAuthor`, `fathersCatena`
  - `LociApi`: `listFathersVolumes(): Promise<FathersVolume[]>`, `listFathersSections(volumeCode): Promise<FathersSectionSummary[]>`, `getFathersSection(volumeCode, sectionId): Promise<FathersSection | null>`, `listFathersAuthors(): Promise<FathersAuthorSummary[]>`, `getFathersAuthor(authorId): Promise<FathersAuthor | null>`, `fathersCatena(book, chapter, verse?): Promise<FathersCatenaGroup[]>`
  - `src/main/services/fathers.ts`: `listVolumes`, `listSections`, `getSection`, `listAuthors`, `getAuthor`, `catena`, `citeMeta(volumeCode, sectionId): FathersCiteMeta | null` (`{ authorName: string | null; workTitle: string | null; shortTitle: string; series: FathersSeries; volume: number }`, used by Task 6), and pure helpers `snippetAround`, `pageAt`, `humanizeAuthorId`.

Catena semantics (tested): a ref matches when its range contains the verse (or, with no verse, overlaps the chapter; whole-chapter refs match every verse); editorial sections are excluded; results are ordered by author `sort_year` (undated last), then volume, then reading order; one entry per (section, verse-group); a chapter-level query groups by the verse each ref starts on, the chapter-level group (`verse: null`) first.

- [ ] **Step 1: Write the failing test**

**Create `src/main/services/fathers.test.ts`**

```ts
import Database from 'better-sqlite3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { runMigrations } from '../db/migrations'

let db: Database.Database
vi.mock('../db/connection', () => ({ getDb: () => db, getDataDir: () => '' }))

beforeEach(() => {
  db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
})

import {
  catena, citeMeta, getAuthor, getSection, humanizeAuthorId, listAuthors, listSections, listVolumes,
  pageAt, snippetAround
} from './fathers'

// ---- row helpers (raw SQL, so these tests do not depend on the parser) ----
function volume(code: string, series: string, number: number, status = 'indexed', error: string | null = null): void {
  db.prepare(
    'INSERT INTO fathers_volumes (code, series, number, title, file_key, status, error) VALUES (?,?,?,?,?,?,?)'
  ).run(code, series, number, `Volume ${code}`, `fathers/${code}.xml`, status, error)
}
function author(id: string, name: string, year: number | null, dates: string | null = null, bio: string | null = null): void {
  db.prepare('INSERT INTO fathers_authors (id, name, sort_year, dates_label, bio) VALUES (?,?,?,?,?)').run(
    id, name, year, dates, bio
  )
}
function section(
  vol: string, id: string, ordinal: number,
  o: { author?: string | null; work?: string | null; title?: string; editorial?: boolean; text?: string; startPage?: string | null; titles?: string[]; html?: string } = {}
): void {
  db.prepare(
    `INSERT INTO fathers_sections
       (volume_code, id, ordinal, depth, titles_json, short_title, author_id, work_title, editorial, start_page, html, text)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(
    vol, id, ordinal, 1, JSON.stringify(o.titles ?? [o.title ?? id]), o.title ?? id, o.author ?? null,
    o.work === undefined ? 'Work' : o.work, o.editorial ? 1 : 0, o.startPage ?? null,
    o.html ?? '<p>x</p>', o.text ?? 'some text'
  )
}
function ref(
  vol: string, sec: string,
  o: { book?: string; cs: number; vs: number | null; ce?: number; ve?: number | null; off?: number; passage?: string; inNote?: boolean }
): void {
  db.prepare(
    `INSERT INTO fathers_scripture_refs
       (volume_code, section_id, anchor, osis, passage, book, chapter_start, verse_start, chapter_end, verse_end, in_note, char_offset)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(
    vol, sec, `${sec}-r`, 'Bible:x', o.passage ?? 'p', o.book ?? 'JHN', o.cs, o.vs, o.ce ?? o.cs,
    o.ve === undefined ? o.vs : o.ve, o.inNote ? 1 : 0, o.off ?? 0
  )
}

describe('pure helpers', () => {
  it('humanizeAuthorId title-cases an id', () => {
    expect(humanizeAuthorId('clement_rome')).toBe('Clement Rome')
    expect(humanizeAuthorId('justin-martyr')).toBe('Justin Martyr')
    expect(humanizeAuthorId('hermas')).toBe('Hermas')
  })

  it('snippetAround returns the whole text when it is short', () => {
    expect(snippetAround('short text\nhere', 3)).toBe('short text here')
  })

  it('snippetAround windows long text on whole words with ellipses around the offset', () => {
    const text = Array.from({ length: 100 }, (_, i) => `w${String(i).padStart(3, '0')}`).join(' ')
    const s = snippetAround(text, text.indexOf('w050'))
    expect(s.startsWith('…')).toBe(true)
    expect(s.endsWith('…')).toBe(true)
    expect(s).toContain('w050')
    expect(s.slice(1)).toMatch(/^w\d{3} /) // no partial first word
    expect(s.length).toBeLessThanOrEqual(210)
  })

  it('snippetAround clamps an offset past the end', () => {
    expect(snippetAround('abc def', 999)).toBe('abc def')
  })

  it('pageAt picks the last page break at or before the offset, else the start page', () => {
    const pages = [{ n: '6', charOffset: 100 }, { n: '7', charOffset: 300 }]
    expect(pageAt(pages, 50, '5')).toBe('5')
    expect(pageAt(pages, 100, '5')).toBe('6')
    expect(pageAt(pages, 299, '5')).toBe('6')
    expect(pageAt(pages, 5000, '5')).toBe('7')
    expect(pageAt([], 10, null)).toBeNull()
  })
})

describe('listVolumes', () => {
  it('orders ANF, NPNF¹, NPNF² by number and counts sections', () => {
    volume('npnf201', 'npnf2', 1)
    volume('npnf102', 'npnf1', 2)
    volume('anf10', 'anf', 10)
    volume('anf02', 'anf', 2, 'error', 'bad xml')
    section('anf10', 'a', 0)
    section('anf10', 'b', 1)
    const v = listVolumes()
    expect(v.map((x) => x.code)).toEqual(['anf02', 'anf10', 'npnf102', 'npnf201'])
    expect(v[0]).toMatchObject({ status: 'error', error: 'bad xml', sectionCount: 0 })
    expect(v[1]).toMatchObject({ series: 'anf', number: 10, sectionCount: 2 })
  })
})

describe('listSections / getSection', () => {
  beforeEach(() => {
    volume('anf01', 'anf', 1)
    author('irenaeus', 'Irenaeus of Lyons', 202)
    section('anf01', 'a', 0, { author: 'irenaeus', work: 'Against Heresies: Book I', title: 'Preface', titles: ['IRENÆUS', 'Preface'], startPage: '414' })
    section('anf01', 'b', 1, { author: 'mystery_man', work: 'W', title: 'Chapter I', html: '<p>hello</p>' })
    section('anf01', 'c', 2, { author: null, title: 'Index', editorial: true })
    db.prepare("INSERT INTO fathers_notes VALUES ('anf01','b','n2','2','<p>second</p>')").run()
    db.prepare("INSERT INTO fathers_notes VALUES ('anf01','b','n1','1','<p>first</p>')").run()
  })

  it('lists sections in reading order with author names, falling back to a derived name', () => {
    const s = listSections('anf01')
    expect(s.map((x) => x.id)).toEqual(['a', 'b', 'c'])
    expect(s[0]).toMatchObject({
      authorId: 'irenaeus', authorName: 'Irenaeus of Lyons', titles: ['IRENÆUS', 'Preface'],
      shortTitle: 'Preface', startPage: '414', editorial: false
    })
    expect(s[1]).toMatchObject({ authorId: 'mystery_man', authorName: 'Mystery Man' })
    expect(s[2]).toMatchObject({ authorId: null, authorName: null, editorial: true })
    expect(listSections('nope')).toEqual([])
  })

  it('returns a full section with notes in order, volume info and prev/next ids', () => {
    const s = getSection('anf01', 'b')!
    expect(s).toMatchObject({
      id: 'b', volumeCode: 'anf01', series: 'anf', volumeNumber: 1, volumeTitle: 'Volume anf01',
      html: '<p>hello</p>', prevId: 'a', nextId: 'c'
    })
    expect(s.notes.map((n) => n.anchor)).toEqual(['n2', 'n1']) // insertion order, not alphabetical
    expect(getSection('anf01', 'a')!.prevId).toBeNull()
    expect(getSection('anf01', 'c')!.nextId).toBeNull()
  })

  it('returns null for an unknown section', () => {
    expect(getSection('anf01', 'zzz')).toBeNull()
    expect(getSection('nope', 'a')).toBeNull()
  })
})

describe('listAuthors / getAuthor', () => {
  beforeEach(() => {
    volume('anf01', 'anf', 1)
    volume('npnf101', 'npnf1', 1)
    author('irenaeus', 'Irenaeus of Lyons', 202, 'c. 130–c. 202', 'Bishop of Lyons.')
    author('augustine', 'Augustine of Hippo', 430, '354–430')
    section('anf01', 'i1', 0, { author: 'irenaeus', work: 'Against Heresies: Book I' })
    section('anf01', 'i2', 1, { author: 'irenaeus', work: 'Against Heresies: Book I' })
    section('anf01', 'i3', 2, { author: 'irenaeus', work: 'Against Heresies: Book II' })
    section('anf01', 'i4', 3, { author: 'irenaeus', work: 'Against Heresies: Book II', editorial: true })
    section('npnf101', 'a1', 0, { author: 'augustine', work: 'The Confessions' })
    section('npnf101', 'u1', 1, { author: 'unknown_one', work: 'Treatise' })
    section('npnf101', 'e1', 2, { author: 'only_editorial', work: 'Prolegomena', editorial: true })
  })

  it('lists authors oldest first, undated last, skipping authors with only editorial sections', () => {
    const a = listAuthors()
    expect(a.map((x) => x.id)).toEqual(['irenaeus', 'augustine', 'unknown_one'])
    expect(a[0]).toMatchObject({ name: 'Irenaeus of Lyons', datesLabel: 'c. 130–c. 202', sortYear: 202, workCount: 2, sectionCount: 3 })
    expect(a[2]).toMatchObject({ name: 'Unknown One', datesLabel: null, sortYear: null })
  })

  it('returns an author page with works across volumes and a link to each first section', () => {
    const a = getAuthor('irenaeus')!
    expect(a).toMatchObject({ name: 'Irenaeus of Lyons', bio: 'Bishop of Lyons.', datesLabel: 'c. 130–c. 202' })
    expect(a.works).toEqual([
      { volumeCode: 'anf01', series: 'anf', volumeNumber: 1, volumeTitle: 'Volume anf01', workTitle: 'Against Heresies: Book I', firstSectionId: 'i1', sectionCount: 2 },
      { volumeCode: 'anf01', series: 'anf', volumeNumber: 1, volumeTitle: 'Volume anf01', workTitle: 'Against Heresies: Book II', firstSectionId: 'i3', sectionCount: 1 }
    ])
  })

  it('builds a page for an author missing from the curated table, and null for one with nothing', () => {
    expect(getAuthor('unknown_one')).toMatchObject({ name: 'Unknown One', bio: null, datesLabel: null })
    expect(getAuthor('nobody')).toBeNull()
  })
})

describe('catena', () => {
  beforeEach(() => {
    volume('anf01', 'anf', 1)
    volume('npnf101', 'npnf1', 1)
    author('late', 'Late Father', 400, '–400')
    author('early', 'Early Father', 100)
    author('mid', 'Mid Father', 150)
    // The EARLY author lives in the volume that sorts LAST, so only date ordering puts it first.
    section('anf01', 'a1', 0, { author: 'late', title: 'A1', text: 'x '.repeat(100) + 'Jn 3:16 here' })
    section('npnf101', 'b1', 0, { author: 'early', title: 'B1' })
    section('anf01', 'a2', 1, { author: 'mid', title: 'A2' })
    section('anf01', 'a3', 2, { author: 'late', title: 'A3 editorial', editorial: true })
    section('anf01', 'a4', 3, { author: 'late', title: 'A4' })
    section('anf01', 'a5', 4, { author: null, title: 'A5 undated' })
    ref('anf01', 'a1', { cs: 3, vs: 16, off: 200, passage: 'John iii. 16' })
    ref('npnf101', 'b1', { cs: 3, vs: 14, ve: 17 }) // range 14–17 contains 16
    ref('anf01', 'a2', { cs: 3, vs: null }) // whole chapter
    ref('anf01', 'a3', { cs: 3, vs: 16 }) // editorial: excluded
    ref('anf01', 'a4', { cs: 4, vs: 1 }) // other chapter
    ref('anf01', 'a5', { cs: 3, vs: 16, inNote: true })
    ref('anf01', 'a1', { book: 'ROM', cs: 3, vs: 16 }) // other book
    db.prepare("INSERT INTO fathers_pages VALUES ('anf01','a1','9',50)").run()
    db.prepare("INSERT INTO fathers_pages VALUES ('anf01','a1','10',150)").run()
    db.prepare("UPDATE fathers_sections SET start_page = '8' WHERE volume_code='anf01' AND id='a1'").run()
  })

  it('returns one group for a verse: refs whose range contains it, earliest author first, undated last', () => {
    const g = catena('JHN', 3, 16)
    expect(g).toHaveLength(1)
    expect(g[0]).toMatchObject({ verse: 16, label: 'John 3:16' })
    expect(g[0].entries.map((e) => [e.sectionId, e.authorName])).toEqual([
      ['b1', 'Early Father'],
      ['a2', 'Mid Father'],
      ['a1', 'Late Father'],
      ['a5', null]
    ])
  })

  it('fills in snippet, printed page, passage and the footnote flag', () => {
    const e = catena('JHN', 3, 16)[0].entries
    const a1 = e.find((x) => x.sectionId === 'a1')!
    expect(a1).toMatchObject({ passage: 'John iii. 16', page: '10', inNote: false, volumeCode: 'anf01', series: 'anf', volumeNumber: 1 })
    expect(a1.snippet).toContain('Jn 3:16')
    expect(e.find((x) => x.sectionId === 'a5')!.inNote).toBe(true)
  })

  it('excludes editorial sections, other chapters and other books', () => {
    const ids = catena('JHN', 3, 16)[0].entries.map((e) => e.sectionId)
    expect(ids).not.toContain('a3')
    expect(ids).not.toContain('a4')
  })

  it('groups a chapter-level query by the verse each reference starts on, chapter-level group first', () => {
    const groups = catena('JHN', 3)
    expect(groups.map((g) => [g.verse, g.label])).toEqual([
      [null, 'John 3'],
      [14, 'John 3:14'],
      [16, 'John 3:16']
    ])
    expect(groups[0].entries.map((e) => e.sectionId)).toEqual(['a2'])
    expect(groups[2].entries.map((e) => e.sectionId)).toEqual(['a1', 'a5'])
  })

  it('keeps one entry per section within a group', () => {
    ref('anf01', 'a1', { cs: 3, vs: 16, off: 10 })
    ref('anf01', 'a1', { cs: 3, vs: 16, off: 20 })
    expect(catena('JHN', 3, 16)[0].entries.filter((e) => e.sectionId === 'a1')).toHaveLength(1)
  })

  it('matches a reference that spans chapters', () => {
    section('anf01', 'a6', 5, { author: 'mid', title: 'A6' })
    ref('anf01', 'a6', { cs: 2, vs: 20, ce: 4, ve: 3 })
    expect(catena('JHN', 3, 16)[0].entries.map((e) => e.sectionId)).toContain('a6')
    expect(catena('JHN', 5, 1)).toEqual([])
  })

  it('returns nothing for a passage no Father cites', () => {
    expect(catena('REV', 22, 21)).toEqual([])
  })
})

describe('citeMeta', () => {
  it('returns what a citation needs, or null for an unknown section', () => {
    volume('anf01', 'anf', 1)
    author('irenaeus', 'Irenaeus of Lyons', 202)
    section('anf01', 's', 0, { author: 'irenaeus', work: 'Against Heresies: Book III', title: 'Chapter III.—Succession.' })
    expect(citeMeta('anf01', 's')).toEqual({
      authorName: 'Irenaeus of Lyons', workTitle: 'Against Heresies: Book III',
      shortTitle: 'Chapter III.—Succession.', series: 'anf', volume: 1
    })
    expect(citeMeta('anf01', 'zzz')).toBeNull()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- src/main/services/fathers.test.ts`
Expected: FAIL — cannot resolve `./fathers`.

- [ ] **Step 3: Add the shared types**

**Edit `src/shared/ipc.ts`** (context lines locate each change; line numbers are indicative only)

```diff
--- a/src/shared/ipc.ts
+++ b/src/shared/ipc.ts
@@ -1,5 +1,6 @@
 // Shared IPC contract — imported by main, preload, and renderer.
 // The renderer never touches Node/fs directly; everything goes through this surface.
+import type { FathersSeries } from './fathers'
 
 export const Channels = {
   getAppState: 'app:getState',
@@ -806,6 +844,103 @@
   sectionEnd: number
 }
 
+// ---------- Church Fathers (CCEL ThML) ----------
+
+export interface FathersVolume {
+  /** CCEL code, e.g. 'anf01', 'npnf105'. */
+  code: string
+  series: FathersSeries
+  number: number
+  title: string
+  status: 'indexed' | 'error' | 'unindexed'
+  /** Why indexing failed, when status is 'error'. */
+  error: string | null
+  sectionCount: number
+}
+export interface FathersSectionSummary {
+  /** CCEL div id, e.g. 'ix.ii.ii'. */
+  id: string
+  ordinal: number
+  depth: number
+  /** Ancestor titles, outermost first, own title last. */
+  titles: string[]
+  shortTitle: string
+  authorId: string | null
+  /** Curated name, or one derived from the id when the author table lacks it. */
+  authorName: string | null
+  workTitle: string | null
+  /** Editor's matter (introductory notes, prefaces, indexes) rather than a Father's text. */
+  editorial: boolean
+  /** Printed page the section starts on ('415', or a roman numeral for front matter). */
+  startPage: string | null
+}
+export interface FathersNote {
+  anchor: string
+  n: string
+  /** Sanitized HTML (allow-listed tags only). */
+  html: string
+}
+export interface FathersSection extends FathersSectionSummary {
+  volumeCode: string
+  series: FathersSeries
+  volumeNumber: number
+  volumeTitle: string
+  /** Sanitized display HTML (allow-listed tags only). */
+  html: string
+  notes: FathersNote[]
+  prevId: string | null
+  nextId: string | null
+}
+export interface FathersAuthorSummary {
+  id: string
+  name: string
+  datesLabel: string | null
+  sortYear: number | null
+  workCount: number
+  sectionCount: number
+}
+export interface FathersWork {
+  volumeCode: string
+  series: FathersSeries
+  volumeNumber: number
+  volumeTitle: string
+  workTitle: string
+  firstSectionId: string
+  sectionCount: number
+}
+export interface FathersAuthor {
+  id: string
+  name: string
+  sortYear: number | null
+  datesLabel: string | null
+  bio: string | null
+  works: FathersWork[]
+}
+export interface FathersCatenaEntry {
+  volumeCode: string
+  series: FathersSeries
+  volumeNumber: number
+  sectionId: string
+  sectionTitle: string
+  workTitle: string
+  authorId: string | null
+  authorName: string | null
+  datesLabel: string | null
+  /** The citation as the Father's text prints it, e.g. "1 Pet. v. 1-5". */
+  passage: string
+  /** The reference sits in an editor's footnote rather than the Father's own text. */
+  inNote: boolean
+  /** Printed page of the reference. */
+  page: string | null
+  snippet: string
+}
+export interface FathersCatenaGroup {
+  /** The verse the group's references start on; null = chapter-level. */
+  verse: number | null
+  label: string
+  entries: FathersCatenaEntry[]
+}
+
 export interface Quote {
   id: string
   bookId: string
```

- [ ] **Step 4: Implement the service**

**Create `src/main/services/fathers.ts`**

```ts
// Read-side queries for the Church Fathers corpus (volumes, sections, authors, the Scripture
// catena). Pure SQL over the tables fathersIndex.ts fills; nothing here touches the filesystem.
import { getDb } from '../db/connection'
import { bookByCode } from '../../shared/scriptureRef'
import type { FathersSeries } from '../../shared/fathers'
import type {
  FathersAuthor,
  FathersAuthorSummary,
  FathersCatenaEntry,
  FathersCatenaGroup,
  FathersNote,
  FathersSection,
  FathersSectionSummary,
  FathersVolume,
  FathersWork
} from '../../shared/ipc'

/** ANF, then NPNF¹, then NPNF², each by volume number. */
const SERIES_ORDER_SQL = "CASE v.series WHEN 'anf' THEN 0 WHEN 'npnf1' THEN 1 ELSE 2 END"

/** 'clement_rome' -> 'Clement Rome': the display name for an author missing from the curated table. */
export function humanizeAuthorId(id: string): string {
  return id
    .split(/[_-]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ')
}

/** About `size` characters of `text` around `offset`, trimmed to whole words with ellipses. */
export function snippetAround(text: string, offset: number, size = 200): string {
  const flat = text.replace(/\n/g, ' ') // same length as `text`, so offsets stay valid
  const start = Math.max(0, Math.min(offset, flat.length) - Math.floor(size * 0.4))
  const end = Math.min(flat.length, start + size)
  let s = flat.slice(start, end)
  if (start > 0) s = s.replace(/^\S*\s/, '')
  if (end < flat.length) s = s.replace(/\s\S*$/, '')
  return `${start > 0 ? '…' : ''}${s.trim()}${end < flat.length ? '…' : ''}`
}

/** The printed page in force at `offset`: the last page break at or before it, else the page the
 *  section started on. `pages` must be ascending by charOffset. */
export function pageAt(
  pages: { n: string; charOffset: number }[],
  offset: number,
  startPage: string | null
): string | null {
  let current = startPage
  for (const p of pages) {
    if (p.charOffset <= offset) current = p.n
    else break
  }
  return current
}

// ---------- volumes and sections ----------

export function listVolumes(): FathersVolume[] {
  const rows = getDb()
    .prepare(
      `SELECT v.code, v.series, v.number, v.title, v.status, v.error,
              (SELECT COUNT(*) FROM fathers_sections s WHERE s.volume_code = v.code) AS sectionCount
       FROM fathers_volumes v ORDER BY ${SERIES_ORDER_SQL}, v.number`
    )
    .all() as {
    code: string
    series: FathersSeries
    number: number
    title: string
    status: FathersVolume['status']
    error: string | null
    sectionCount: number
  }[]
  return rows
}

interface SummaryRow {
  id: string
  ordinal: number
  depth: number
  titles_json: string
  short_title: string
  author_id: string | null
  author_name: string | null
  work_title: string | null
  editorial: number
  start_page: string | null
}

function rowToSummary(r: SummaryRow): FathersSectionSummary {
  let titles: string[] = []
  try {
    titles = JSON.parse(r.titles_json) as string[]
  } catch {
    titles = []
  }
  return {
    id: r.id,
    ordinal: r.ordinal,
    depth: r.depth,
    titles,
    shortTitle: r.short_title,
    authorId: r.author_id,
    authorName: r.author_id ? (r.author_name ?? humanizeAuthorId(r.author_id)) : null,
    workTitle: r.work_title,
    editorial: r.editorial === 1,
    startPage: r.start_page
  }
}

/** Every section of one volume in reading order, without the (large) html / text. */
export function listSections(volumeCode: string): FathersSectionSummary[] {
  const rows = getDb()
    .prepare(
      `SELECT s.id, s.ordinal, s.depth, s.titles_json, s.short_title, s.author_id, a.name AS author_name,
              s.work_title, s.editorial, s.start_page
       FROM fathers_sections s LEFT JOIN fathers_authors a ON a.id = s.author_id
       WHERE s.volume_code = ? ORDER BY s.ordinal`
    )
    .all(volumeCode) as SummaryRow[]
  return rows.map(rowToSummary)
}

export function getSection(volumeCode: string, sectionId: string): FathersSection | null {
  const db = getDb()
  const r = db
    .prepare(
      `SELECT s.id, s.ordinal, s.depth, s.titles_json, s.short_title, s.author_id, a.name AS author_name,
              s.work_title, s.editorial, s.start_page, s.html,
              v.series, v.number AS volumeNumber, v.title AS volumeTitle
       FROM fathers_sections s
       JOIN fathers_volumes v ON v.code = s.volume_code
       LEFT JOIN fathers_authors a ON a.id = s.author_id
       WHERE s.volume_code = ? AND s.id = ?`
    )
    .get(volumeCode, sectionId) as
    | (SummaryRow & { html: string; series: FathersSeries; volumeNumber: number; volumeTitle: string })
    | undefined
  if (!r) return null
  const notes = db
    .prepare('SELECT anchor, n, html FROM fathers_notes WHERE volume_code = ? AND section_id = ? ORDER BY rowid')
    .all(volumeCode, sectionId) as FathersNote[]
  const prev = db
    .prepare(
      'SELECT id FROM fathers_sections WHERE volume_code = ? AND ordinal < ? ORDER BY ordinal DESC LIMIT 1'
    )
    .get(volumeCode, r.ordinal) as { id: string } | undefined
  const next = db
    .prepare('SELECT id FROM fathers_sections WHERE volume_code = ? AND ordinal > ? ORDER BY ordinal LIMIT 1')
    .get(volumeCode, r.ordinal) as { id: string } | undefined
  return {
    ...rowToSummary(r),
    volumeCode,
    series: r.series,
    volumeNumber: r.volumeNumber,
    volumeTitle: r.volumeTitle,
    html: r.html,
    notes,
    prevId: prev?.id ?? null,
    nextId: next?.id ?? null
  }
}

// ---------- authors ----------

/** Authors with indexed (non-editorial) sections, oldest first; undated authors sort last. An
 *  author the files mention but the curated table lacks is included under a derived name. */
export function listAuthors(): FathersAuthorSummary[] {
  const rows = getDb()
    .prepare(
      `SELECT s.author_id AS id, a.name, a.dates_label AS datesLabel, a.sort_year AS sortYear,
              COUNT(DISTINCT s.volume_code || '|' || s.work_title) AS workCount, COUNT(*) AS sectionCount
       FROM fathers_sections s LEFT JOIN fathers_authors a ON a.id = s.author_id
       WHERE s.author_id IS NOT NULL AND s.editorial = 0
       GROUP BY s.author_id
       ORDER BY (a.sort_year IS NULL), a.sort_year, COALESCE(a.name, s.author_id)`
    )
    .all() as {
    id: string
    name: string | null
    datesLabel: string | null
    sortYear: number | null
    workCount: number
    sectionCount: number
  }[]
  return rows.map((r) => ({ ...r, name: r.name ?? humanizeAuthorId(r.id) }))
}

export function getAuthor(authorId: string): FathersAuthor | null {
  const db = getDb()
  const a = db
    .prepare('SELECT id, name, sort_year AS sortYear, dates_label AS datesLabel, bio FROM fathers_authors WHERE id = ?')
    .get(authorId) as
    | { id: string; name: string; sortYear: number | null; datesLabel: string | null; bio: string | null }
    | undefined
  const rows = db
    .prepare(
      `SELECT s.volume_code AS volumeCode, v.series, v.number AS volumeNumber, v.title AS volumeTitle,
              s.work_title AS workTitle, MIN(s.ordinal) AS firstOrdinal, COUNT(*) AS sectionCount
       FROM fathers_sections s JOIN fathers_volumes v ON v.code = s.volume_code
       WHERE s.author_id = ? AND s.editorial = 0
       GROUP BY s.volume_code, s.work_title
       ORDER BY ${SERIES_ORDER_SQL}, v.number, firstOrdinal`
    )
    .all(authorId) as (Omit<FathersWork, 'firstSectionId' | 'workTitle'> & {
    workTitle: string | null
    firstOrdinal: number
  })[]
  if (!a && rows.length === 0) return null
  const firstId = db.prepare('SELECT id FROM fathers_sections WHERE volume_code = ? AND ordinal = ?')
  const works: FathersWork[] = rows.map((r) => ({
    volumeCode: r.volumeCode,
    series: r.series,
    volumeNumber: r.volumeNumber,
    volumeTitle: r.volumeTitle,
    workTitle: r.workTitle ?? '',
    firstSectionId: (firstId.get(r.volumeCode, r.firstOrdinal) as { id: string }).id,
    sectionCount: r.sectionCount
  }))
  return {
    id: authorId,
    name: a?.name ?? humanizeAuthorId(authorId),
    sortYear: a?.sortYear ?? null,
    datesLabel: a?.datesLabel ?? null,
    bio: a?.bio ?? null,
    works
  }
}

// ---------- the Scripture catena ----------

const CATENA_LIMIT = 600

/**
 * The Fathers on a Bible passage: every indexed reference whose range contains the given verse
 * (or, with no verse, overlaps the chapter), grouped by the verse it starts on and ordered by
 * author date (undated last), then volume and reading order. Editorial sections are excluded.
 * One entry per (section, verse group) — the earliest reference in it. Footnote references (the
 * editors' cross-references, which is most of them) are included, flagged `inNote`.
 */
export function catena(book: string, chapter: number, verse?: number | null): FathersCatenaGroup[] {
  const db = getDb()
  const v = verse ?? null
  const rows = db
    .prepare(
      `SELECT r.volume_code AS volumeCode, r.section_id AS sectionId, r.passage, r.in_note AS inNote,
              r.chapter_start AS cs, r.verse_start AS vs, r.char_offset AS off,
              s.short_title AS sectionTitle, s.work_title AS workTitle, s.author_id AS authorId,
              s.text, s.start_page AS startPage,
              v.series, v.number AS volumeNumber, a.name AS authorName, a.dates_label AS datesLabel
       FROM fathers_scripture_refs r
       JOIN fathers_sections s ON s.volume_code = r.volume_code AND s.id = r.section_id
       JOIN fathers_volumes v ON v.code = r.volume_code
       LEFT JOIN fathers_authors a ON a.id = s.author_id
       WHERE r.book = @book AND s.editorial = 0
         AND (r.chapter_start < @ch OR (r.chapter_start = @ch AND (@v IS NULL OR COALESCE(r.verse_start, 0) <= @v)))
         AND (r.chapter_end > @ch OR (r.chapter_end = @ch AND (@v IS NULL OR COALESCE(r.verse_end, 9999) >= @v)))
       ORDER BY (a.sort_year IS NULL), a.sort_year, r.volume_code, s.ordinal, r.char_offset
       LIMIT ${CATENA_LIMIT}`
    )
    .all({ book, ch: chapter, v }) as {
    volumeCode: string
    sectionId: string
    passage: string
    inNote: number
    cs: number
    vs: number | null
    off: number
    sectionTitle: string
    workTitle: string | null
    authorId: string | null
    text: string
    startPage: string | null
    series: FathersSeries
    volumeNumber: number
    authorName: string | null
    datesLabel: string | null
  }[]

  const pageStmt = db.prepare(
    'SELECT n, char_offset AS charOffset FROM fathers_pages WHERE volume_code = ? AND section_id = ? ORDER BY char_offset'
  )
  const pageCache = new Map<string, { n: string; charOffset: number }[]>()
  const pagesFor = (volumeCode: string, sectionId: string): { n: string; charOffset: number }[] => {
    const key = `${volumeCode}|${sectionId}`
    let p = pageCache.get(key)
    if (!p) {
      p = pageStmt.all(volumeCode, sectionId) as { n: string; charOffset: number }[]
      pageCache.set(key, p)
    }
    return p
  }

  const bookName = bookByCode(book)?.name ?? book
  const groups = new Map<number | null, FathersCatenaGroup>()
  const seen = new Set<string>()
  for (const r of rows) {
    // A reference that starts in an earlier chapter belongs to the chapter-level group.
    const groupVerse = v !== null ? v : r.cs === chapter ? r.vs : null
    const dedupe = `${groupVerse}|${r.volumeCode}|${r.sectionId}`
    if (seen.has(dedupe)) continue
    seen.add(dedupe)
    let g = groups.get(groupVerse)
    if (!g) {
      g = {
        verse: groupVerse,
        label: groupVerse === null ? `${bookName} ${chapter}` : `${bookName} ${chapter}:${groupVerse}`,
        entries: []
      }
      groups.set(groupVerse, g)
    }
    const entry: FathersCatenaEntry = {
      volumeCode: r.volumeCode,
      series: r.series,
      volumeNumber: r.volumeNumber,
      sectionId: r.sectionId,
      sectionTitle: r.sectionTitle,
      workTitle: r.workTitle ?? '',
      authorId: r.authorId,
      authorName: r.authorId ? (r.authorName ?? humanizeAuthorId(r.authorId)) : null,
      datesLabel: r.datesLabel,
      passage: r.passage,
      inNote: r.inNote === 1,
      page: pageAt(pagesFor(r.volumeCode, r.sectionId), r.off, r.startPage),
      snippet: snippetAround(r.text, r.off)
    }
    g.entries.push(entry)
  }
  return [...groups.values()].sort((a, b) => (a.verse ?? -1) - (b.verse ?? -1))
}

// ---------- citation metadata (used by quotes.ts) ----------

export interface FathersCiteMeta {
  authorName: string | null
  workTitle: string | null
  shortTitle: string
  series: FathersSeries
  volume: number
}

/** What a Fathers citation needs about a section, or null if the section is not indexed. */
export function citeMeta(volumeCode: string, sectionId: string): FathersCiteMeta | null {
  const r = getDb()
    .prepare(
      `SELECT s.author_id AS authorId, a.name AS authorName, s.work_title AS workTitle,
              s.short_title AS shortTitle, v.series, v.number AS volume
       FROM fathers_sections s
       JOIN fathers_volumes v ON v.code = s.volume_code
       LEFT JOIN fathers_authors a ON a.id = s.author_id
       WHERE s.volume_code = ? AND s.id = ?`
    )
    .get(volumeCode, sectionId) as
    | {
        authorId: string | null
        authorName: string | null
        workTitle: string | null
        shortTitle: string
        series: FathersSeries
        volume: number
      }
    | undefined
  if (!r) return null
  return {
    authorName: r.authorId ? (r.authorName ?? humanizeAuthorId(r.authorId)) : null,
    workTitle: r.workTitle,
    shortTitle: r.shortTitle,
    series: r.series,
    volume: r.volume
  }
}
```

- [ ] **Step 5: Run the test**

Run: `npm test -- src/main/services/fathers.test.ts`
Expected: PASS — 20 tests.

- [ ] **Step 6: Add the channels, API surface, bridge and handlers**

**Edit `src/shared/ipc.ts`** (context lines locate each change; line numbers are indicative only)

```diff
--- a/src/shared/ipc.ts
+++ b/src/shared/ipc.ts
@@ -103,6 +106,13 @@
   listBocSources: 'boc:listSources',
   listBocCommentarySources: 'boc:listCommentarySources',
 
+  listFathersVolumes: 'fathers:listVolumes',
+  listFathersSections: 'fathers:listSections',
+  getFathersSection: 'fathers:getSection',
+  listFathersAuthors: 'fathers:listAuthors',
+  getFathersAuthor: 'fathers:getAuthor',
+  fathersCatena: 'fathers:catena',
+
   // main → renderer events
   importProgress: 'library:importProgress',
   libraryChanged: 'library:libraryChanged',
@@ -368,6 +382,17 @@
   listBocSources(): Promise<BocSource[]>
   listBocCommentarySources(): Promise<BocSource[]>
 
+  /** Church Fathers volumes (ANF/NPNF) present in the vault, with index status. */
+  listFathersVolumes(): Promise<FathersVolume[]>
+  /** Every section of a volume in reading order (no html/text), for the navigation drawer. */
+  listFathersSections(volumeCode: string): Promise<FathersSectionSummary[]>
+  getFathersSection(volumeCode: string, sectionId: string): Promise<FathersSection | null>
+  /** Authors with indexed sections, oldest first (undated last). */
+  listFathersAuthors(): Promise<FathersAuthorSummary[]>
+  getFathersAuthor(authorId: string): Promise<FathersAuthor | null>
+  /** The Fathers on a Bible passage, grouped by verse and ordered by author date. */
+  fathersCatena(book: string, chapter: number, verse?: number | null): Promise<FathersCatenaGroup[]>
+
   /** Subscribe to import progress; returns an unsubscribe function. */
   onImportProgress(cb: (p: ImportProgress) => void): () => void
   /** Subscribe to commentary indexing progress; returns an unsubscribe function. */
```

**Edit `src/preload/index.ts`** (context lines locate each change; line numbers are indicative only)

```diff
--- a/src/preload/index.ts
+++ b/src/preload/index.ts
@@ -126,6 +128,13 @@
   listBocSources: () => ipcRenderer.invoke(Channels.listBocSources),
   listBocCommentarySources: () => ipcRenderer.invoke(Channels.listBocCommentarySources),
 
+  listFathersVolumes: () => ipcRenderer.invoke(Channels.listFathersVolumes),
+  listFathersSections: (v) => ipcRenderer.invoke(Channels.listFathersSections, v),
+  getFathersSection: (v, s) => ipcRenderer.invoke(Channels.getFathersSection, v, s),
+  listFathersAuthors: () => ipcRenderer.invoke(Channels.listFathersAuthors),
+  getFathersAuthor: (id) => ipcRenderer.invoke(Channels.getFathersAuthor, id),
+  fathersCatena: (book, chapter, verse) => ipcRenderer.invoke(Channels.fathersCatena, book, chapter, verse),
+
   onImportProgress: (cb) => {
     const listener = (_e: IpcRendererEvent, p: ImportProgress): void => cb(p)
     ipcRenderer.on(Channels.importProgress, listener)
```

**Edit `src/main/ipc/index.ts`** (context lines locate each change; line numbers are indicative only)

```diff
--- a/src/main/ipc/index.ts
+++ b/src/main/ipc/index.ts
@@ -31,6 +32,7 @@
 import * as commentary from '../services/commentary'
 import * as commentaryIndex from '../services/commentaryIndex'
 import * as boc from '../services/boc'
+import * as fathers from '../services/fathers'
 import { deleteCorrectionsForSource } from '../services/commentaryCorrections'
 import { syncVault } from '../services/vaultsync'
 import {
@@ -405,4 +409,13 @@
   ipcMain.handle(Channels.listBocDocumentSections, (_e, d: string, s: string) => boc.listSections(d, s))
   ipcMain.handle(Channels.listBocSources, () => boc.listSources())
   ipcMain.handle(Channels.listBocCommentarySources, () => boc.listCommentarySources())
+
+  ipcMain.handle(Channels.listFathersVolumes, () => fathers.listVolumes())
+  ipcMain.handle(Channels.listFathersSections, (_e, v: string) => fathers.listSections(v))
+  ipcMain.handle(Channels.getFathersSection, (_e, v: string, s: string) => fathers.getSection(v, s))
+  ipcMain.handle(Channels.listFathersAuthors, () => fathers.listAuthors())
+  ipcMain.handle(Channels.getFathersAuthor, (_e, id: string) => fathers.getAuthor(id))
+  ipcMain.handle(Channels.fathersCatena, (_e, book: string, chapter: number, verse?: number | null) =>
+    fathers.catena(book, chapter, verse)
+  )
 }
```

- [ ] **Step 7: Typecheck and commit**

```bash
npm run typecheck
git add src/main/services/fathers.ts src/main/services/fathers.test.ts src/shared/ipc.ts src/main/ipc/index.ts src/preload/index.ts
git commit -m "feat(fathers): volume, section, author and catena queries with IPC" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Quotes backend — citation, `addFathersQuote`, quote IPC (model: sonnet)

**Files:**
- Modify: `src/shared/citation.ts` (+ `src/shared/citation.test.ts`)
- Modify: `src/main/services/quotes.ts` (+ `src/main/services/quotes.test.ts`)
- Modify: `src/shared/ipc.ts` (channels `addFathersQuote`/`listFathersQuotes`, two `LociApi` methods, `FathersQuoteInput`)
- Modify: `src/main/ipc/index.ts`, `src/preload/index.ts`

**Interfaces:**
- Consumes: `citeMeta` (Task 5), `FATHERS_SERIES_LABEL`/`FathersSeries` (Task 2), the `quotes.fathers_*` columns (Task 1), existing helpers in `quotes.ts` (`upsertQuoteBlock`, `buildBlock`, `reindexQuote`, `rowToQuote`, `buildQuoteListCtx`, `sanitizeName`).
- Produces:
  - `src/shared/citation.ts`: `interface FathersCiteRef { authorName: string | null; workTitle: string | null; shortTitle: string; series: FathersSeries; volume: number; page: string | null }`, `romanToInt(s): number | null`, `fathersSectionLabel(workTitle, shortTitle): { work: string; label: string }`, `fathersCitation(r: FathersCiteRef): string`
  - `src/shared/ipc.ts`: `interface FathersQuoteInput { volumeCode: string; sectionId: string; page: string | null; paragraph: number | null; text: string; color?: string }`; `LociApi.addFathersQuote(input): Promise<Quote>`, `LociApi.listFathersQuotes(volumeCode): Promise<Quote[]>`
  - `quotes.ts`: `addFathersQuote(input): Quote`, `listFathersQuotes(volumeCode): Quote[]`; `citationForRow` gains the Fathers branch (so `listAllQuotes`/`listFathersQuotes` recompute the citation from the index each time).

Citation rule (tested): `"<author>, *<work>* <book>.<chapter> (<SERIES> <vol>:<page>)"` — the work has a trailing `: Book III` split off as the book numeral (kept as printed), the chapter number comes from a leading `Chapter/Section/Article/Letter/…` numeral converted to arabic; with neither, the first clause of the section title (≤ 40 chars) unless it just repeats the work; author omitted when unknown; `:page` omitted when unknown.

- [ ] **Step 1: Write the failing citation tests**

**Edit `src/shared/citation.test.ts`** (context lines locate each change; line numbers are indicative only)

```diff
--- a/src/shared/citation.test.ts
+++ b/src/shared/citation.test.ts
@@ -1,5 +1,5 @@
 import { describe, expect, it } from 'vitest'
-import { bocLabel, bocCitation } from './citation'
+import { bocLabel, bocCitation, fathersCitation, fathersSectionLabel, romanToInt } from './citation'
 
 describe('bocCitation', () => {
   const base = { abbreviation: 'AC', sectionNumber: 'IV', sectionLabel: 'Justification', sourceName: "Reader's Edition" }
@@ -17,3 +17,74 @@
     expect(bocCitation(pref)).toBe("AC, Preface (Reader's Edition)")
   })
 })
+
+describe('fathersCitation', () => {
+  const base = {
+    authorName: 'Irenaeus',
+    workTitle: 'Against Heresies: Book III',
+    shortTitle: 'Chapter III.—Apostolic succession.',
+    series: 'anf' as const,
+    volume: 1,
+    page: '415'
+  }
+
+  it('cites author, italic work, book.chapter and series volume:page', () => {
+    expect(fathersCitation(base)).toBe('Irenaeus, *Against Heresies* III.3 (ANF 1:415)')
+  })
+
+  it('uses the NPNF series labels', () => {
+    expect(
+      fathersCitation({
+        authorName: 'Augustine of Hippo', workTitle: 'The Confessions', shortTitle: 'Chapter I.—Great art Thou.',
+        series: 'npnf1', volume: 1, page: '45'
+      })
+    ).toBe('Augustine of Hippo, *The Confessions* 1 (NPNF¹ 1:45)')
+    expect(
+      fathersCitation({ ...base, series: 'npnf2', volume: 4, page: null, workTitle: 'On the Incarnation', shortTitle: 'Section 7.' })
+    ).toBe('Irenaeus, *On the Incarnation* 7 (NPNF² 4)')
+  })
+
+  it('omits the author when unknown and the page when unknown', () => {
+    expect(fathersCitation({ ...base, authorName: null, page: null })).toBe('*Against Heresies* III.3 (ANF 1)')
+  })
+
+  it('handles a work with no book number and a non-numbered section', () => {
+    expect(
+      fathersCitation({
+        ...base, authorName: 'Clement of Rome', workTitle: 'First Epistle to the Corinthians',
+        shortTitle: 'Chapter XLII.—The apostles.', page: '16'
+      })
+    ).toBe('Clement of Rome, *First Epistle to the Corinthians* 42 (ANF 1:16)')
+    expect(fathersCitation({ ...base, shortTitle: 'Preface.', page: '414' })).toBe(
+      'Irenaeus, *Against Heresies* III (ANF 1:414)'
+    )
+  })
+
+  it('falls back to the first clause of the section title when it has no number, and drops it when it is the work', () => {
+    expect(
+      fathersCitation({ ...base, workTitle: 'Epistle of Barnabas', shortTitle: 'Introductory Note to the Epistle of Barnabas', page: '137' })
+    ).toBe('Irenaeus, *Epistle of Barnabas* Introductory Note to the Epistle of… (ANF 1:137)')
+    expect(fathersCitation({ ...base, workTitle: 'Epistle of Barnabas', shortTitle: 'Epistle of Barnabas', page: '137' })).toBe(
+      'Irenaeus, *Epistle of Barnabas* (ANF 1:137)'
+    )
+  })
+})
+
+describe('fathersSectionLabel / romanToInt', () => {
+  it('splits a "Book N" suffix off the work title', () => {
+    expect(fathersSectionLabel('Against Heresies: Book III', 'Chapter III.—x')).toEqual({ work: 'Against Heresies', label: 'III.3' })
+    expect(fathersSectionLabel('Stromata - Book 7', 'Chapter 12')).toEqual({ work: 'Stromata', label: '7.12' })
+  })
+
+  it('does not treat a bare "Book I" work as having an empty name', () => {
+    expect(fathersSectionLabel('Book I', 'Chapter 2').work).toBe('Book I')
+  })
+
+  it('converts roman numerals', () => {
+    expect(romanToInt('IV')).toBe(4)
+    expect(romanToInt('XLII')).toBe(42)
+    expect(romanToInt('MCMXC')).toBe(1990)
+    expect(romanToInt('xii')).toBeNull()
+    expect(romanToInt('')).toBeNull()
+  })
+})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/shared/citation.test.ts`
Expected: FAIL — `fathersCitation` / `romanToInt` / `fathersSectionLabel` are not exported.

- [ ] **Step 3: Implement the citation helpers**

**Edit `src/shared/citation.ts`** (context lines locate each change; line numbers are indicative only)

```diff
--- a/src/shared/citation.ts
+++ b/src/shared/citation.ts
@@ -2,6 +2,9 @@
 // Notes–bibliography style by default, with author–date as an alternate.
 // Missing fields render as [bracketed] placeholders the UI highlights in amber.
 
+import { FATHERS_SERIES_LABEL } from './fathers'
+import type { FathersSeries } from './fathers'
+
 export type SourceKind = 'book' | 'video' | 'image'
 export type CitationStyle = 'footnote' | 'short' | 'bibliography' | 'author-date'
 
@@ -186,3 +189,71 @@
 export function bocCitation(r: BocCiteRef): string {
   return `${bocLabel(r)} (${r.sourceName})`
 }
+
+// ---------- Church Fathers references ----------
+// "Irenaeus, *Against Heresies* III.3 (ANF 1:415)": author, italicised work, the section's
+// book/chapter numbers when it has them, then the series, volume and printed page.
+
+export interface FathersCiteRef {
+  authorName: string | null
+  /** The work as CCEL titles it, e.g. "Against Heresies: Book III". */
+  workTitle: string | null
+  /** The section's short title, e.g. "Chapter III.—Apostolic succession." */
+  shortTitle: string
+  series: FathersSeries
+  volume: number
+  /** Printed page ('415', 'xiv'), if known. */
+  page: string | null
+}
+
+/** Roman numeral -> integer; null if `s` is not a well-formed uppercase numeral. */
+export function romanToInt(s: string): number | null {
+  if (!/^[IVXLCDM]+$/.test(s)) return null
+  const v: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 }
+  let total = 0
+  for (let i = 0; i < s.length; i++) {
+    const cur = v[s[i]]
+    const next = i + 1 < s.length ? v[s[i + 1]] : 0
+    total += cur < next ? -cur : cur
+  }
+  return total
+}
+
+const WORK_BOOK_RE = /^(.*?)[\s:,—–-]*\b[Bb]ook\s+([IVXLCDM]+|\d+)\s*$/
+const SECTION_NUMBER_RE =
+  /^(?:[Cc]hapter|[Cc]hap\.|[Ss]ection|[Aa]rticle|[Ll]etter|[Ee]pistle|[Hh]omily|[Ss]ermon|[Bb]ook|[Pp]art)\s+([IVXLCDM]+|\d+)(?![A-Za-z])/
+
+/** Split a CCEL work title and section title into the cited work name and a locator:
+ *  ("Against Heresies: Book III", "Chapter III.—Apostolic succession.") -> ("Against Heresies", "III.3").
+ *  The locator is the book numeral as printed, then the chapter as an arabic number; with neither
+ *  it falls back to the section title's first clause ("Preface"), or "" if that is the work itself. */
+export function fathersSectionLabel(
+  workTitle: string | null,
+  shortTitle: string
+): { work: string; label: string } {
+  let work = (workTitle ?? shortTitle).trim()
+  let book = ''
+  const wb = WORK_BOOK_RE.exec(work)
+  if (wb && wb[1].trim()) {
+    work = wb[1].trim()
+    book = wb[2]
+  }
+  let chapter = ''
+  const sn = SECTION_NUMBER_RE.exec(shortTitle.trim())
+  if (sn) chapter = /^\d+$/.test(sn[1]) ? sn[1] : String(romanToInt(sn[1]) ?? sn[1])
+  let label = [book, chapter].filter(Boolean).join('.')
+  if (!label) {
+    const head = shortTitle.split(/[.—–:]/)[0].trim()
+    const short = head.length > 40 ? `${head.slice(0, 40).replace(/\s+\S*$/, '')}…` : head
+    label = head.toLowerCase() === work.toLowerCase() ? '' : short
+  }
+  return { work, label }
+}
+
+/** "Irenaeus, *Against Heresies* III.3 (ANF 1:415)". */
+export function fathersCitation(r: FathersCiteRef): string {
+  const { work, label } = fathersSectionLabel(r.workTitle, r.shortTitle)
+  const who = r.authorName ? `${r.authorName}, ` : ''
+  const where = `${FATHERS_SERIES_LABEL[r.series]} ${r.volume}${r.page ? `:${r.page}` : ''}`
+  return `${who}*${work}*${label ? ` ${label}` : ''} (${where})`
+}
```

- [ ] **Step 4: Run them**

Run: `npx vitest run src/shared/citation.test.ts`
Expected: PASS — 11 tests.

- [ ] **Step 5: Write the failing quote tests**

**Edit `src/main/services/quotes.test.ts`** (context lines locate each change; line numbers are indicative only)

```diff
--- a/src/main/services/quotes.test.ts
+++ b/src/main/services/quotes.test.ts
@@ -323,3 +323,131 @@
     expect(listBocQuotesForDocument('AP')).toEqual([])
   })
 })
+
+// ---------- Church Fathers quotes ----------
+import { existsSync, readFileSync } from 'fs'
+import { addFathersQuote, deleteQuote, listFathersQuotes, setQuoteCitation } from './quotes'
+
+function seedFathers(): void {
+  db.prepare(
+    "INSERT INTO fathers_volumes (code, series, number, title, file_key, status) VALUES ('anf01','anf',1,'Apostolic Fathers','fathers/anf01.xml','indexed')"
+  ).run()
+  db.prepare(
+    "INSERT INTO fathers_authors (id, name, sort_year, dates_label, bio) VALUES ('irenaeus','Irenaeus',202,'c. 130–c. 202','Bishop of Lyons.')"
+  ).run()
+  const sec = db.prepare(
+    `INSERT INTO fathers_sections
+       (volume_code, id, ordinal, depth, titles_json, short_title, author_id, work_title, editorial, start_page, html, text)
+     VALUES ('anf01', ?, ?, 3, '[]', ?, ?, ?, 0, '415', '<p>x</p>', 'x')`
+  )
+  sec.run('ix.ii.i', 0, 'Preface.', 'irenaeus', 'Against Heresies: Book III')
+  sec.run('ix.ii.ii', 1, 'Chapter III.—Apostolic succession.', 'irenaeus', 'Against Heresies: Book III')
+  sec.run('x.i', 2, 'Chapter I.—Orphan.', null, 'Fragments')
+}
+
+function reinsertSuccessionSection(): void {
+  db.prepare(
+    `INSERT INTO fathers_sections
+       (volume_code, id, ordinal, depth, titles_json, short_title, author_id, work_title, editorial, start_page, html, text)
+     VALUES ('anf01', 'ix.ii.ii', 1, 3, '[]', 'Chapter III.—Apostolic succession.', 'irenaeus', 'Against Heresies: Book III', 0, '415', '<p>x</p>', 'x')`
+  ).run()
+}
+
+describe('addFathersQuote', () => {
+  it('creates a Fathers quote cited "Author, *Work* III.3 (ANF 1:415)" and files it under notes/fathers/<author>.md', () => {
+    seedFathers()
+    const q = addFathersQuote({
+      volumeCode: 'anf01', sectionId: 'ix.ii.ii', page: '415', paragraph: 2,
+      text: 'the tradition of the apostles'
+    })
+    expect(q.bookId).toBe('')
+    expect(q.citation).toBe('Irenaeus, *Against Heresies* III.3 (ANF 1:415)')
+    expect(q.notePath).toBe('notes/fathers/Irenaeus.md')
+
+    const row = db
+      .prepare('SELECT book_id, fathers_volume, fathers_section_id, fathers_page, fathers_paragraph FROM quotes WHERE id = ?')
+      .get(q.id)
+    expect(row).toEqual({
+      book_id: null, fathers_volume: 'anf01', fathers_section_id: 'ix.ii.ii', fathers_page: '415', fathers_paragraph: 2
+    })
+
+    const note = readFileSync(join(dataDir, 'vault', 'notes', 'fathers', 'Irenaeus.md'), 'utf-8')
+    expect(note).toContain('type: fathers-note')
+    expect(note).toContain('> the tradition of the apostles')
+    expect(note).toContain('— Irenaeus, *Against Heresies* III.3 (ANF 1:415)')
+  })
+
+  it('omits the page from the citation when the reader could not tell', () => {
+    seedFathers()
+    const q = addFathersQuote({ volumeCode: 'anf01', sectionId: 'ix.ii.ii', page: null, paragraph: null, text: 'x' })
+    expect(q.citation).toBe('Irenaeus, *Against Heresies* III.3 (ANF 1)')
+  })
+
+  it('files a section with no author under "Unattributed" and omits the author from the citation', () => {
+    seedFathers()
+    const q = addFathersQuote({ volumeCode: 'anf01', sectionId: 'x.i', page: '9', paragraph: 1, text: 'orphan text' })
+    expect(q.notePath).toBe('notes/fathers/Unattributed.md')
+    expect(q.citation).toBe('*Fragments* 1 (ANF 1:9)')
+  })
+
+  it('throws for a section that is not indexed', () => {
+    seedFathers()
+    expect(() =>
+      addFathersQuote({ volumeCode: 'anf01', sectionId: 'nope', page: null, paragraph: null, text: 'x' })
+    ).toThrow(/not found/)
+  })
+
+  it('recomputes the citation on a later independent read and honours a hand-edited override', () => {
+    seedFathers()
+    const q = addFathersQuote({ volumeCode: 'anf01', sectionId: 'ix.ii.ii', page: '415', paragraph: 1, text: 'x' })
+    expect(listAllQuotes().find((x) => x.id === q.id)?.citation).toBe('Irenaeus, *Against Heresies* III.3 (ANF 1:415)')
+    setQuoteCitation(q.id, 'My own citation')
+    expect(listAllQuotes().find((x) => x.id === q.id)?.citation).toBe('My own citation')
+  })
+
+  it('survives re-indexing: deleting and re-inserting the volume sections keeps the quote', () => {
+    seedFathers()
+    const q = addFathersQuote({ volumeCode: 'anf01', sectionId: 'ix.ii.ii', page: '415', paragraph: 1, text: 'x' })
+    db.prepare("DELETE FROM fathers_sections WHERE volume_code = 'anf01'").run()
+    expect((db.prepare('SELECT COUNT(*) AS n FROM quotes').get() as { n: number }).n).toBe(1)
+    // With the section gone the citation degrades to empty rather than throwing ...
+    expect(listAllQuotes().find((x) => x.id === q.id)?.citation).toBe('')
+    // ... and comes back once the volume is indexed again.
+    reinsertSuccessionSection()
+    expect(listAllQuotes().find((x) => x.id === q.id)?.citation).toBe('Irenaeus, *Against Heresies* III.3 (ANF 1:415)')
+  })
+
+  it('deleting the quote removes its block, prunes the empty note file and drops the row', () => {
+    seedFathers()
+    const q = addFathersQuote({ volumeCode: 'anf01', sectionId: 'ix.ii.ii', page: '415', paragraph: 1, text: 'x' })
+    deleteQuote(q.id)
+    expect(existsSync(join(dataDir, 'vault', 'notes', 'fathers', 'Irenaeus.md'))).toBe(false)
+    expect((db.prepare('SELECT COUNT(*) AS n FROM quotes').get() as { n: number }).n).toBe(0)
+  })
+
+  it('indexes the quote text for search', () => {
+    seedFathers()
+    addFathersQuote({ volumeCode: 'anf01', sectionId: 'ix.ii.ii', page: '415', paragraph: 1, text: 'unmistakable phrase' })
+    const hits = db.prepare("SELECT ref FROM search_fts WHERE kind='quote' AND search_fts MATCH 'unmistakable'").all()
+    expect(hits).toHaveLength(1)
+  })
+})
+
+describe('listFathersQuotes', () => {
+  it('returns one volume quotes in reading order, then oldest first, excluding other volumes', () => {
+    seedFathers()
+    db.prepare(
+      "INSERT INTO fathers_volumes (code, series, number, title, file_key, status) VALUES ('anf02','anf',2,'Second','fathers/anf02.xml','indexed')"
+    ).run()
+    db.prepare(
+      `INSERT INTO fathers_sections (volume_code, id, ordinal, depth, titles_json, short_title, author_id, work_title, editorial, html, text)
+       VALUES ('anf02', 'z', 0, 1, '[]', 'Z', 'irenaeus', 'W', 0, '', 'x')`
+    ).run()
+    const later = addFathersQuote({ volumeCode: 'anf01', sectionId: 'ix.ii.ii', page: '415', paragraph: 1, text: 'later section' })
+    const earlier = addFathersQuote({ volumeCode: 'anf01', sectionId: 'ix.ii.i', page: '414', paragraph: 1, text: 'earlier section' })
+    addFathersQuote({ volumeCode: 'anf02', sectionId: 'z', page: '1', paragraph: 1, text: 'other volume' })
+    expect(listFathersQuotes('anf01').map((q) => q.id)).toEqual([earlier.id, later.id])
+    expect(listFathersQuotes('anf02')).toHaveLength(1)
+    expect(listFathersQuotes('npnf101')).toEqual([])
+  })
+})
```

- [ ] **Step 6: Run them to verify they fail**

Run: `npm test -- src/main/services/quotes.test.ts`
Expected: FAIL — `addFathersQuote` / `listFathersQuotes` are not exported from `./quotes`.

- [ ] **Step 7: Add the input type, then implement the service functions**

**Edit `src/shared/ipc.ts`** (context lines locate each change; line numbers are indicative only)

```diff
--- a/src/shared/ipc.ts
+++ b/src/shared/ipc.ts
@@ -499,6 +524,19 @@
   color?: string
 }
 
+/** Capture a selection from a Church Fathers section as a quote (`addFathersQuote`). */
+export interface FathersQuoteInput {
+  volumeCode: string
+  /** CCEL section id within the volume, e.g. 'ix.ii.ii'. */
+  sectionId: string
+  /** Printed page the selection starts on ('415', 'xiv'), if the reader could tell. */
+  page: string | null
+  /** 1-based paragraph index within the section, if known. */
+  paragraph: number | null
+  text: string
+  color?: string
+}
+
 /** Rows for the Quotes nav section: everything that has at least one saved quote. */
 /** Fill in any group list the main process didn't send. During development the renderer
  *  hot-reloads while the main process does not, so a freshly-reloaded renderer can briefly talk
```

**Edit `src/main/services/quotes.ts`** (context lines locate each change; line numbers are indicative only)

```diff
--- a/src/main/services/quotes.ts
+++ b/src/main/services/quotes.ts
@@ -4,8 +4,10 @@
 import { getDb } from '../db/connection'
 import { localVaultDir } from './config'
 import * as search from './search'
+import * as fathers from './fathers'
 import {
   bocCitation,
+  fathersCitation,
   formatCitation,
   parseAuthors,
   scriptureCitation,
@@ -20,6 +22,7 @@
   Annotation,
   BocQuoteInput,
   CommentaryQuoteInput,
+  FathersQuoteInput,
   NewQuote,
   NewScriptureHighlight,
   Quote,
@@ -59,6 +62,10 @@
   boc_section_number: string | null
   boc_section_label: string | null
   boc_paragraph: number | null
+  fathers_volume: string | null
+  fathers_section_id: string | null
+  fathers_page: string | null
+  fathers_paragraph: number | null
 }
 
 /** Parse a stored canonical ref like "JHN 3:16-18" into its parts. */
@@ -394,6 +401,12 @@
       return bocCitationOf(doc.abbreviation, r.boc_section_number, r.boc_section_label, r.boc_paragraph, src)
     }
   }
+  if (r.fathers_volume && r.fathers_section_id) {
+    // Author / work / series are read from the index each time, so a corrected author table or a
+    // re-indexed volume is reflected; only the page was captured at quote time.
+    const meta = fathers.citeMeta(r.fathers_volume, r.fathers_section_id)
+    if (meta) return fathersCitation({ ...meta, page: r.fathers_page })
+  }
   return ''
 }
 
@@ -1030,6 +1043,84 @@
   return rowToQuote(row)
 }
 
+// Church Fathers quotes live in one note per author, under notes/fathers/.
+function fathersNoteRel(authorName: string): string {
+  return `notes/fathers/${sanitizeName(authorName)}.md`
+}
+
+function ensureFathersNote(vault: string, authorName: string): string {
+  const rel = fathersNoteRel(authorName)
+  const abs = join(vault, rel)
+  if (!existsSync(abs)) {
+    mkdirSync(dirname(abs), { recursive: true })
+    const fm =
+      `---\n` +
+      `title: ${authorName.replace(/\r?\n/g, ' ')}\n` +
+      `type: fathers-note\n` +
+      `---\n\n# ${authorName}\n`
+    writeFileSync(abs, fm, 'utf-8')
+  }
+  return rel
+}
+
+/**
+ * Capture a selection from a Church Fathers section as a quote, cited "Irenaeus, *Against
+ * Heresies* III.3 (ANF 1:415)" and filed under notes/fathers/<author>.md (quotes with no known
+ * author go under "Unattributed"). Anchored by (volume, section) — not a foreign key, so
+ * re-indexing a volume never deletes the user's quotes.
+ */
+export function addFathersQuote(input: FathersQuoteInput): Quote {
+  const vault = localVaultDir()
+  if (!vault) throw new Error('No vault')
+  const meta = fathers.citeMeta(input.volumeCode, input.sectionId)
+  if (!meta) throw new Error('Church Fathers section not found')
+
+  const id = randomUUID()
+  const color = input.color ?? 'amber'
+  const citation = fathersCitation({ ...meta, page: input.page })
+
+  const rel = ensureFathersNote(vault, meta.authorName ?? 'Unattributed')
+  upsertQuoteBlock(vault, rel, id, buildBlock(id, input.text, citation, []))
+
+  getDb()
+    .prepare(
+      `INSERT INTO quotes
+         (id, book_id, text, page, color, note_path, used_in, created,
+          fathers_volume, fathers_section_id, fathers_page, fathers_paragraph)
+       VALUES (?, NULL, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)`
+    )
+    .run(
+      id,
+      input.text,
+      color,
+      rel,
+      JSON.stringify([rel]),
+      Date.now(),
+      input.volumeCode,
+      input.sectionId,
+      input.page,
+      input.paragraph
+    )
+
+  reindexQuote(id)
+  const row = getDb().prepare('SELECT * FROM quotes WHERE id = ?').get(id) as QuoteRow
+  return rowToQuote(row)
+}
+
+/** Every quote captured from one Fathers volume, in reading order (then oldest first). */
+export function listFathersQuotes(volumeCode: string): Quote[] {
+  const rows = getDb()
+    .prepare(
+      `SELECT q.* FROM quotes q
+       LEFT JOIN fathers_sections s ON s.volume_code = q.fathers_volume AND s.id = q.fathers_section_id
+       WHERE q.fathers_volume = ?
+       ORDER BY COALESCE(s.ordinal, 1000000000), q.created`
+    )
+    .all(volumeCode) as QuoteRow[]
+  const ctx = buildQuoteListCtx()
+  return rows.map((r) => rowToQuote(r, ctx))
+}
+
 /** All saved commentary quotes for a source, ordered by chapter then verse (for the panel). */
 export function listCommentaryQuotes(sourceId: string): Quote[] {
   const rows = getDb()
```

- [ ] **Step 8: Run them**

Run: `npm test -- src/main/services/quotes.test.ts`
Expected: PASS — 22 tests (22 in total, 9 of them new).

- [ ] **Step 9: Wire the channels, API, bridge and handlers**

**Edit `src/shared/ipc.ts`** (context lines locate each change; line numbers are indicative only)

```diff
--- a/src/shared/ipc.ts
+++ b/src/shared/ipc.ts
@@ -55,6 +56,8 @@
   listAllQuotes: 'quotes:listAll',
   addBocQuote: 'quotes:addBoc',
   addBocCommentaryQuote: 'quotes:addBocCommentary',
+  addFathersQuote: 'quotes:addFathers',
+  listFathersQuotes: 'quotes:listFathers',
   saveNote: 'notes:save',
   readNote: 'notes:read',
   listStandaloneNotes: 'notes:listStandalone',
@@ -289,6 +299,10 @@
   /** Capture a Book of Concord commentary excerpt as a quote (anchored to the commentary
    *  source rather than the primary-text source). */
   addBocCommentaryQuote(input: BocQuoteInput): Promise<Quote>
+  /** Capture a selection from a Church Fathers section as a quote, cited "Author, *Work* III.3 (ANF 1:415)". */
+  addFathersQuote(input: FathersQuoteInput): Promise<Quote>
+  /** Every quote captured from one Fathers volume, in reading order. */
+  listFathersQuotes(volumeCode: string): Promise<Quote[]>
   saveNote(path: string, content: string): Promise<void>
   readNote(path: string): Promise<string>
   listStandaloneNotes(): Promise<NoteSummary[]>
```

**Edit `src/preload/index.ts`** (context lines locate each change; line numbers are indicative only)

```diff
--- a/src/preload/index.ts
+++ b/src/preload/index.ts
@@ -61,6 +61,8 @@
   listAllQuotes: () => ipcRenderer.invoke(Channels.listAllQuotes),
   addBocQuote: (input) => ipcRenderer.invoke(Channels.addBocQuote, input),
   addBocCommentaryQuote: (input) => ipcRenderer.invoke(Channels.addBocCommentaryQuote, input),
+  addFathersQuote: (input) => ipcRenderer.invoke(Channels.addFathersQuote, input),
+  listFathersQuotes: (volumeCode) => ipcRenderer.invoke(Channels.listFathersQuotes, volumeCode),
   saveNote: (path, content) => ipcRenderer.invoke(Channels.saveNote, path, content),
   readNote: (path) => ipcRenderer.invoke(Channels.readNote, path),
   listStandaloneNotes: () => ipcRenderer.invoke(Channels.listStandaloneNotes),
```

**Edit `src/main/ipc/index.ts`** (context lines locate each change; line numbers are indicative only)

```diff
--- a/src/main/ipc/index.ts
+++ b/src/main/ipc/index.ts
@@ -11,6 +11,7 @@
   CommentaryQuoteInput,
   CommentarySourceUpdate,
   ExportOptions,
+  FathersQuoteInput,
   ImportProgress,
   IndexedPage,
   NewCommentarySource,
@@ -266,6 +268,8 @@
   ipcMain.handle(Channels.addBocCommentaryQuote, (_e, input: BocQuoteInput) =>
     quotes.addBocCommentaryQuote(input)
   )
+  ipcMain.handle(Channels.addFathersQuote, (_e, input: FathersQuoteInput) => quotes.addFathersQuote(input))
+  ipcMain.handle(Channels.listFathersQuotes, (_e, volumeCode: string) => quotes.listFathersQuotes(volumeCode))
 
   // --- Notes (Phase 2c) ---
   ipcMain.handle(Channels.saveNote, (_e, path: string, content: string) =>
```

- [ ] **Step 10: Typecheck, full main-process tests, commit**

```bash
npm run typecheck
npm test -- src/main src/shared
git add src/shared/citation.ts src/shared/citation.test.ts src/shared/ipc.ts src/main/services/quotes.ts src/main/services/quotes.test.ts src/main/ipc/index.ts src/preload/index.ts
git commit -m "feat(fathers): quote capture with 'Author, *Work* III.3 (ANF 1:415)' citations" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---


### Task 7: Validator tool and the complete author table (model: sonnet)

**Files:**
- Create: `tools/validate-thml.mjs`
- Modify: `src/main/data/fathersAuthors.ts` (more `FATHERS_AUTHORS` entries, more `FATHERS_AUTHOR_OVERRIDES`, possibly more `FATHERS_NON_AUTHOR_IDS`)
- Test: `src/main/data/fathersAuthors.test.ts` (already written in Task 1 — it enforces id uniqueness, sort order and completeness of every entry)

**Interfaces:**
- Consumes: `parseThml`, `slugifyAuthor` (Task 3), `FATHERS_AUTHORS`, `FATHERS_AUTHOR_OVERRIDES`, `FATHERS_NON_AUTHOR_IDS`, `correctedAuthor` (Task 1), `parseFathersCode` (Task 2). The `.mjs` tool cannot import TypeScript directly, so it bundles those modules on the fly with `esbuild` (already installed as a Vite dependency) into a temp file and imports that; nothing is written into the repo.
- Produces: `node tools/validate-thml.mjs <folder> [--authors-json <out.json>] [--strict]`. Output per volume: sections, editorial sections, footnotes, Scripture refs, refs inside footnotes, page breaks, sections with no start page, unparseable refs, deuterocanonical refs, milliseconds; then totals, undated authors, mixed/suspect attributions, div1s with readable text and **no author**, unknown tags, sample bad `osisRef`s and any failed volume. Exit code 1 if any volume fails to parse (or yields 0 sections); with `--strict` also when an author is missing from the curated table or a readable div1 has no author.

- [ ] **Step 1: Create the validator**

**Create `tools/validate-thml.mjs`**

```js
// Validate CCEL ThML volumes against Loci's parser (src/main/services/thml.ts) and curated author
// table (src/main/data/fathersAuthors.ts). Run it over a folder of real volumes to see, per
// volume, how many sections / footnotes / Scripture refs / page breaks parsed, which references
// failed, and which authors the files mention that the curated table has no dates for.
//
//   node tools/validate-thml.mjs <folder> [--authors-json <out.json>] [--strict]
//
//   <folder>             a directory of anf01.xml … npnf214.xml (e.g. .firecrawl/ccel)
//   --authors-json FILE  also write { authorId: { volumes, sections, div1Titles } } for every
//                        author found — the input for completing the curated author table
//   --strict             also exit 1 when an author the files name is missing from the curated table,
//                        or a div1 with readable text has no author (and no deliberate null override)
//
// Exit code: 1 when any volume fails to parse (or parses to zero sections); with --strict, also
// when authorship is incomplete. Pseudo-authors (FATHERS_NON_AUTHOR_IDS) are never reported.
//
// The parser is TypeScript, so this tool bundles it on the fly with esbuild (already present as a
// Vite dependency) into a temp file and imports that. Nothing is written into the repo.
import { build } from 'esbuild'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const args = process.argv.slice(2)
const strict = args.includes('--strict')
const jsonIdx = args.indexOf('--authors-json')
const authorsJson = jsonIdx >= 0 ? args[jsonIdx + 1] : null
const dir = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--authors-json')
if (!dir) {
  console.error('usage: node tools/validate-thml.mjs <folder> [--authors-json <out.json>] [--strict]')
  process.exit(2)
}

async function loadModules() {
  const out = mkdtempSync(join(tmpdir(), 'loci-validate-thml-'))
  const outfile = join(out, 'bundle.mjs')
  await build({
    stdin: {
      contents:
        "export * from './src/main/services/thml'\n" +
        "export * from './src/main/data/fathersAuthors'\n" +
        "export * from './src/shared/fathers'\n",
      resolveDir: repo,
      loader: 'ts'
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile,
    logLevel: 'error',
    // The authors module only type-imports better-sqlite3; keep any runtime require external.
    external: ['better-sqlite3']
  })
  const mod = await import(pathToFileURL(outfile).href)
  rmSync(out, { recursive: true, force: true })
  return mod
}

const {
  parseThml, slugifyAuthor, FATHERS_AUTHORS, FATHERS_AUTHOR_OVERRIDES, FATHERS_NON_AUTHOR_IDS,
  correctedAuthor, parseFathersCode
} = await loadModules()
const known = new Set(FATHERS_AUTHORS.map((a) => a.id))

const files = readdirSync(dir)
  .filter((f) => /\.xml$/i.test(f) && parseFathersCode(f.replace(/\.xml$/i, '')))
  .sort()
if (files.length === 0) {
  console.error(`no anf*/npnf* .xml volumes found in ${dir}`)
  process.exit(2)
}

const pad = (s, n) => String(s).padEnd(n)
const num = (n, w) => String(n).padStart(w)
console.log(
  `${pad('volume', 9)}${num('secs', 6)}${num('editor', 7)}${num('notes', 7)}${num('refs', 7)}${num('inNote', 7)}${num('pages', 7)}${num('noPg', 6)}${num('badRef', 7)}${num('apocr', 7)}${num('ms', 7)}`
)

const failures = []
const authorsSeen = new Map() // id -> { volumes:Set, sections:number, div1Titles:Set }
const suspects = []
const unattributed = []
const unknownTags = new Map()
const badOsisSamples = new Map()
let totals = { sections: 0, notes: 0, refs: 0, pages: 0, bad: 0, apocrypha: 0 }

for (const f of files) {
  const code = f.replace(/\.xml$/i, '').toLowerCase()
  const t0 = Date.now()
  let result
  try {
    result = parseThml(readFileSync(join(dir, f), 'utf8'), code)
  } catch (e) {
    failures.push([code, e.message])
    console.log(`${pad(code, 9)}  PARSE ERROR: ${e.message}`)
    continue
  }
  const { volume, warnings } = result
  const s = volume.sections
  const sum = (fn) => s.reduce((n, x) => n + fn(x), 0)
  const refs = sum((x) => x.refs.length)
  const inNote = sum((x) => x.refs.filter((r) => r.inNote).length)
  const bad = warnings.filter((w) => w.kind === 'bad-osis').reduce((n, w) => n + w.count, 0)
  const apocrypha = warnings.filter((w) => w.kind === 'non-canon-ref').reduce((n, w) => n + w.count, 0)
  console.log(
    `${pad(code, 9)}${num(s.length, 6)}${num(s.filter((x) => x.editorial).length, 7)}${num(sum((x) => x.notes.length), 7)}${num(refs, 7)}${num(inNote, 7)}${num(sum((x) => x.pages.length), 7)}${num(s.filter((x) => !x.startPage).length, 6)}${num(bad, 7)}${num(apocrypha, 7)}${num(Date.now() - t0, 7)}`
  )
  totals.sections += s.length
  totals.notes += sum((x) => x.notes.length)
  totals.refs += refs
  totals.pages += sum((x) => x.pages.length)
  totals.bad += bad
  totals.apocrypha += apocrypha
  if (s.length === 0) failures.push([code, 'parsed but produced 0 sections'])

  for (const w of warnings) {
    if (w.kind === 'unknown-tag') unknownTags.set(w.detail, (unknownTags.get(w.detail) ?? 0) + w.count)
    if (w.kind === 'bad-osis' && w.detail !== '(missing)') {
      const list = badOsisSamples.get(code) ?? []
      if (list.length < 5) list.push(w.detail)
      badOsisSamples.set(code, list)
    }
  }

  // Authors seen (as stored: after overrides), and div1s whose head disagrees with their title.
  const div1 = new Map() // div1 id -> { title, authors:Set, parsed:Set, editorial, sections }
  for (const sec of s) {
    const id = correctedAuthor(code, sec.id, sec.authorId)
    if (id) {
      const a = authorsSeen.get(id) ?? { volumes: new Set(), sections: 0, div1Titles: new Set() }
      a.volumes.add(code)
      a.sections++
      a.div1Titles.add(sec.titles[0])
      authorsSeen.set(id, a)
    }
    const key = sec.id.replace(/~\d+$/, '').split('.')[0]
    const d = div1.get(key) ?? { title: sec.titles[0], authors: new Set(), parsed: new Set(), sections: 0, allEditorial: true }
    d.authors.add(id)
    d.parsed.add(sec.authorId)
    d.sections++
    if (!sec.editorial) d.allEditorial = false
    div1.set(key, d)
  }
  for (const [key, d] of div1) {
    if (`${code}:${key}` in FATHERS_AUTHOR_OVERRIDES) continue // already settled by hand
    const real = [...d.authors].filter(Boolean)
    // A div1 whose readable sections no author is attached to (multi-author NPNF volumes).
    if (!d.allEditorial && real.length === 0) unattributed.push(`${code}:${key}  "${d.title}" (${d.sections} sections)`)
    if (!code.startsWith('anf')) continue
    const slug = slugifyAuthor(d.title)
    if (real.length > 1) suspects.push(`${code}:${key} "${d.title}" has several authors: ${real.join(', ')}`)
    else if (real.length === 1 && real[0] !== slug && known.has(slug)) {
      suspects.push(`${code}:${key} "${d.title}": head says "${real[0]}" but the title suggests "${slug}" — add '${code}:${key}': '${slug}' to FATHERS_AUTHOR_OVERRIDES`)
    }
  }
}

console.log(
  `${pad('TOTAL', 9)}${num(totals.sections, 6)}${num('', 7)}${num(totals.notes, 7)}${num(totals.refs, 7)}${num('', 7)}${num(totals.pages, 7)}${num('', 6)}${num(totals.bad, 7)}${num(totals.apocrypha, 7)}`
)
console.log('\ncolumns: editor = editorial sections; inNote = refs inside footnotes; noPg = sections with no start page;')
console.log('         badRef = unparseable osisRef; apocr = deuterocanonical refs (left as plain text, not an error)')

const undated = [...authorsSeen.keys()].filter((id) => !known.has(id)).sort()
console.log(`\nAuthors found: ${authorsSeen.size}; in the curated table: ${authorsSeen.size - undated.length}`)
console.log(undated.length ? `Undated (add to src/main/data/fathersAuthors.ts): ${undated.join(', ')}` : 'Undated authors: none')
if (suspects.length) {
  console.log(`\nMixed or suspect author attributions (review; several authors in one div1 is often legitimate):\n  ${suspects.join('\n  ')}`)
}
if (unattributed.length) {
  console.log(`\nDiv1s with readable text and NO author (add an entry to FATHERS_AUTHOR_OVERRIDES, or null if it truly has none):\n  ${unattributed.join('\n  ')}`)
}
if (unknownTags.size) console.log(`\nUnknown tags (text kept, tag dropped): ${[...unknownTags].map(([t, n]) => `${t}×${n}`).join(', ')}`)
if (badOsisSamples.size) {
  console.log('\nSample unparseable osisRef values:')
  for (const [code, list] of badOsisSamples) console.log(`  ${code}: ${list.join(' | ')}`)
}
if (failures.length) {
  console.log('\nFAILED:')
  for (const [code, msg] of failures) console.log(`  ${code}: ${msg}`)
}

if (authorsJson) {
  const out = {}
  for (const [id, a] of [...authorsSeen].sort(([x], [y]) => x.localeCompare(y))) {
    out[id] = { volumes: [...a.volumes].sort(), sections: a.sections, div1Titles: [...a.div1Titles].sort() }
  }
  writeFileSync(authorsJson, JSON.stringify(out, null, 2))
  console.log(`\nWrote ${authorsSeen.size} authors to ${authorsJson}`)
}

process.exit(failures.length > 0 || (strict && (undated.length > 0 || unattributed.length > 0)) ? 1 : 0)
```

- [ ] **Step 2: Run it over the real volumes and generate the author list**

```bash
node tools/validate-thml.mjs .firecrawl/ccel --authors-json .firecrawl/ccel/_author_ids.json
```

Expected (numbers are from the 38 volumes present while this plan was written): 38 rows, no `PARSE ERROR` and no `FAILED:` section, `TOTAL` ≈ 19 400 sections, ≈ 130 000 footnotes and ≈ 93 000 Scripture refs (for ANF the `inNote` column is ≈ 99 % of `refs` — that is why footnote refs are indexed), `badRef` well under 1 % of refs, and:

```
Authors found: 55; in the curated table: 17
Undated (add to src/main/data/fathersAuthors.ts): <the ids listed in Step 3>
```

`.firecrawl/ccel/_author_ids.json` (git-ignored) is `{ "<authorId>": { "volumes": [...], "sections": n, "div1Titles": [...] } }` — the input for the next step. If a volume reports `PARSE ERROR`, stop and fix the parser (Task 3) — do not paper over it in the data.

- [ ] **Step 3: Complete the curated author table (data entry — dispatch a Sonnet helper for this step)**

Goal: after this step `node tools/validate-thml.mjs .firecrawl/ccel --strict` exits 0 and prints `Undated authors: none` and no `Div1s with readable text and NO author` entries (a `null` override counts as settled).

Procedure, in this order:

1. **Authors still undated** (from Step 2; the ids as CCEL spells them):

   @@UNDATED@@

   For each id add one object to `FATHERS_AUTHORS` in `src/main/data/fathersAuthors.ts`, keeping the array **sorted ascending by `sortYear`, then `name`** (the test enforces it):

   ```ts
   {
     id: 'tertullian',               // exactly the CCEL authorID
     name: 'Tertullian',             // the form a reader expects: 'Gregory of Nyssa', 'Minucius Felix'
     sortYear: 220,                  // integer; death year, or floruit for the obscure — used only for ordering
     datesLabel: 'c. 155–c. 220',    // en dash; 'c.' for approximate; 'fl. c. 180' when only floruit is known
     bio: 'One or two plain, factual sentences.'
   }
   ```

   **Do not guess dates.** If you are not certain, look the person up (Catholic Encyclopedia / the CCEL author page / Wikipedia via the `firecrawl` skill) or use a deliberately broad label (`fl. 3rd century`) and say "little is known" in the bio. The CCEL author index `https://www.ccel.org/index/author/<letter>` also lists dates.
2. **Pseudo-authors** — ids that are not people (translator ids, collections, front matter). `anonymous`, `early_liturgies`, `appendix`, `title_page`, `title_pages`, `second_title_page` are already in `FATHERS_NON_AUTHOR_IDS`; add any further such id there instead of to the table. `rutherford_an` (translator of *The Passion of the Scillitan Martyrs*) is one; decide `zosimus` and `theodotus` (pseudonymous / Gnostic excerpts) the same way — a real attribution is preferable when the work has a named author.
3. **Wrong or mixed attributions** — read the validator's `Mixed or suspect author attributions` list. For `anf07:v "Asterius Urbanus"` (two ids for one person) add `'anf07:v': 'asterius_urbanus'` to `FATHERS_AUTHOR_OVERRIDES` and keep a single table entry. `anf06:vi "Anatolius and Minor Writers."` legitimately has several authors (each work has its own head) — leave it.
4. **Div1s with readable text and no author** — these are mostly multi-author NPNF² volumes (no heads) and collections. For each `volume:div1` the validator prints, add `'<volume>:<div1 id>': '<authorId>'` to `FATHERS_AUTHOR_OVERRIDES` (adding the author to the table first), or `null` when the div1 is a collection / has no single author. Suggested mapping (verify each against the printed title):

   | key | author |
   |---|---|
   | `npnf202:ii` / `npnf202:iii` | `socrates` (Socrates Scholasticus, c. 380–after 439) / `sozomen` (c. 400–c. 450) |
   | `npnf203:iv` / `npnf203:v` / `npnf203:vi` | `theodoret` (c. 393–c. 458) / `null` (Jerome *and* Gennadius — or `jerome`) / `rufinus` (c. 345–411) |
   | `npnf207:ii` / `npnf207:iii`, `npnf207:iv` | `cyril_jerusalem` (c. 313–386) / `gregory_nazianzen` (329–390) |
   | `npnf209:iii` | `john_damascus` (c. 675–c. 749) |
   | `npnf211:ii` / `:iii` / `:iv` | `sulpitius_severus` (c. 363–c. 425) / `vincent_lerins` (d. c. 445) / `cassian` (c. 360–c. 435) |
   | `npnf212:ii` / `:iii`, `npnf213:ii` | `leo_great` (c. 400–461) / `gregory_great` (c. 540–604) |
   | `npnf213:iii` | `null` (Ephraim *and* Aphrahat in one div1) |
   | `npnf214:*` (the Seven Ecumenical Councils and canons) | `null` |
   | `anf05:vii`, `anf07:viii`, `anf07:ix`, `anf07:xi`, `anf08:iii`, `anf08:vii`–`anf08:x`, `anf09:*` (apocrypha, Didache, Apostolic Constitutions, Nicene Creed, Decretals, Syriac documents) | `null` |

5. Re-run the validator until clean.

- [ ] **Step 4: Verify**

```bash
node tools/validate-thml.mjs .firecrawl/ccel --strict
echo "exit=$?"
npm test -- src/main/data/fathersAuthors.test.ts src/main/services/fathersIndex.test.ts
```

Expected: `Undated authors: none`, no `Div1s with readable text and NO author` section, `exit=0` (the `--strict` flag makes both conditions fail the run); the data tests pass (the sorted/unique/complete assertions are what catch typos in the data).

- [ ] **Step 5: Commit**

```bash
npm run typecheck:node
git add tools/validate-thml.mjs src/main/data/fathersAuthors.ts
git commit -m "feat(fathers): validate-thml tool and the full curated author table" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---


### Task 8: FathersReader — sanitized HTML, footnote popover, page labels, scripture links (model: sonnet)

**Files:**
- Create: `src/renderer/src/lib/fathersReaderUtils.ts`, `src/renderer/src/components/library/FathersReader.tsx`
- Modify: `src/renderer/src/styles/app.css` (append the reader styles)
- Test: `src/renderer/src/lib/fathersReaderUtils.test.ts`

**Interfaces:**
- Consumes: `LociApi.getFathersSection` / `FathersSection` / `FathersNote` (Task 5), `parseOsisRef` (Task 2), `FATHERS_SERIES_LABEL` (Task 2), existing CSS classes `scripture-reader`, `sr-head`, `sr-title`, `sr-abbr`, `sr-body`, `sr-text`, `scripture-hl-pop`, `shp-swatch`.
- Produces:
  - `passageFromOsis(osis: string): { book: string; chapter: number; highlight: number[] } | null`
  - `interface FathersQuoteCapture { text: string; page: string | null; paragraph: number | null; color: string }`
  - `<FathersReader volumeCode sectionId onNavigate(sectionId) onPassage(book, chapter, highlight) onQuote?(capture) onAuthor?(authorId) compact? />` — fully prop-driven (no store access) so the pane (Task 9) and the quote wiring (Task 10) plug in.

Behaviour: header with prev/next, section title, an "Editor" tag for editorial sections, `ANF 1 · p. 415`; breadcrumb (volume › author (link) › work); the section HTML is injected as built by the parser's allow-list (safe by construction); `a.scripref` click → `onPassage` (first passage of the `osisRef`, in-chapter range highlighted); `sup.fn` click → popover with the note HTML (links inside it work too); `span.pb` shows a faint margin label `p. N` (CSS); selecting text shows the colour picker (same swatches as `BocReader`), and the capture carries the **printed page in force at the selection start** (the last preceding `span.pb`, else the section's `startPage`) and the 1-based paragraph index.

- [ ] **Step 1: Write the failing test for the pure helper**

**Create `src/renderer/src/lib/fathersReaderUtils.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { passageFromOsis } from './fathersReaderUtils'

describe('passageFromOsis', () => {
  it('opens a single verse and highlights it', () => {
    expect(passageFromOsis('Bible:John.3.16')).toEqual({ book: 'JHN', chapter: 3, highlight: [16] })
  })

  it('highlights every verse of an in-chapter range', () => {
    expect(passageFromOsis('Bible:1Pet.5.1-1Pet.5.5')).toEqual({ book: '1PE', chapter: 5, highlight: [1, 2, 3, 4, 5] })
  })

  it('opens a chapter-only reference with no highlight', () => {
    expect(passageFromOsis('Bible:Num.16')).toEqual({ book: 'NUM', chapter: 16, highlight: [] })
  })

  it('opens a cross-chapter range at its first chapter without highlighting', () => {
    expect(passageFromOsis('Bible:Ps.23.1-Ps.24.10')).toEqual({ book: 'PSA', chapter: 23, highlight: [] })
  })

  it('uses the first passage of a list', () => {
    expect(passageFromOsis('Bible:Isa.64.4 Bible:1Cor.2.9')).toEqual({ book: 'ISA', chapter: 64, highlight: [4] })
  })

  it('returns null for deuterocanonical or unparseable values', () => {
    expect(passageFromOsis('Bible:Sir.1.1')).toBeNull()
    expect(passageFromOsis('garbage')).toBeNull()
    expect(passageFromOsis('')).toBeNull()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/renderer/src/lib/fathersReaderUtils.test.ts`
Expected: FAIL — cannot resolve `./fathersReaderUtils`.

- [ ] **Step 3: Implement the helper**

**Create `src/renderer/src/lib/fathersReaderUtils.ts`**

```ts
import { parseOsisRef } from '../../../shared/osis'

export interface PassageTarget {
  /** USFM code. */
  book: string
  chapter: number
  /** Verses to highlight in the chapter (empty = none). */
  highlight: number[]
}

/** Where a clicked `a.scripref[data-osis]` should open: the first passage of the osisRef, with its
 *  verses highlighted when it stays within one chapter. null if the value cannot be parsed. */
export function passageFromOsis(osis: string): PassageTarget | null {
  const parsed = parseOsisRef(osis)
  if (parsed.kind !== 'ok') return null
  const p = parsed.passages[0]
  const highlight: number[] = []
  if (p.verseStart !== null && p.chapterStart === p.chapterEnd) {
    const end = Math.min(p.verseEnd ?? p.verseStart, p.verseStart + 199)
    for (let v = p.verseStart; v <= end; v++) highlight.push(v)
  }
  return { book: p.book, chapter: p.chapterStart, highlight }
}
```

- [ ] **Step 4: Run it**

Run: `npx vitest run src/renderer/src/lib/fathersReaderUtils.test.ts`
Expected: PASS — 6 tests.

- [ ] **Step 5: Create the reader component**

**Create `src/renderer/src/components/library/FathersReader.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { api } from '../../lib/api'
import { passageFromOsis } from '../../lib/fathersReaderUtils'
import { FATHERS_SERIES_LABEL } from '@shared/fathers'
import type { FathersNote, FathersSection } from '@shared/ipc'

export interface FathersQuoteCapture {
  text: string
  /** Printed page the selection starts on ('415', 'xiv'), if known. */
  page: string | null
  /** 1-based index of the paragraph the selection starts in, if any. */
  paragraph: number | null
  color: string
}

interface Props {
  volumeCode: string
  sectionId: string
  /** Navigate to another section of the same volume (prev/next). */
  onNavigate: (sectionId: string) => void
  /** A scripture link was clicked: show this passage in the Texts panel. */
  onPassage: (book: string, chapter: number, highlight: number[]) => void
  /** When provided, selecting text offers the colour picker and reports the capture. */
  onQuote?: (capture: FathersQuoteCapture) => void
  /** When provided, the author in the breadcrumb is a link to their page. */
  onAuthor?: (authorId: string) => void
  /** Slim header for the split pane beside a note. */
  compact?: boolean
}

// Highlight palette — mirrors BocReader / ScriptureReader. The Fathers text is the user's own
// public-domain file, so highlighting is always on.
const HL_COLORS: { name: string; tint: string }[] = [
  { name: 'amber', tint: 'rgba(232, 182, 86, 0.34)' },
  { name: 'emerald', tint: 'rgba(110, 200, 150, 0.30)' },
  { name: 'sky', tint: 'rgba(120, 180, 240, 0.30)' },
  { name: 'rose', tint: 'rgba(240, 140, 165, 0.30)' },
  { name: 'violet', tint: 'rgba(186, 150, 236, 0.32)' }
]

interface HlSel {
  text: string
  page: string | null
  paragraph: number | null
  x: number
  y: number
}

/** The printed page in force at `node`: the last page-break marker before it, else the page the
 *  section started on. Page breaks are empty `span.pb[data-page]` elements in the section HTML. */
function pageForNode(root: HTMLElement, node: Node, startPage: string | null): string | null {
  let page = startPage
  for (const pb of Array.from(root.querySelectorAll<HTMLElement>('span.pb'))) {
    if (pb.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING) page = pb.dataset.page ?? page
    else break
  }
  return page
}

/** 1-based index of the paragraph containing `node` among the section's paragraphs, or null. */
function paragraphForNode(root: HTMLElement, node: Node): number | null {
  const el = node.nodeType === 1 ? (node as Element) : node.parentElement
  const p = el?.closest('p')
  if (!p || !root.contains(p)) return null
  return Array.from(root.querySelectorAll('p')).indexOf(p) + 1
}

/** One Church Fathers section: breadcrumb, sanitized HTML, footnote popovers, scripture links,
 *  printed-page margin labels and selection-to-quote. The HTML is built by the ThML parser from
 *  an allow-list of tags (see thml.ts), so it is safe to inject. */
export function FathersReader({
  volumeCode,
  sectionId,
  onNavigate,
  onPassage,
  onQuote,
  onAuthor,
  compact = false
}: Props) {
  const [section, setSection] = useState<FathersSection | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pop, setPop] = useState<{ note: FathersNote; x: number; y: number } | null>(null)
  const [hlSel, setHlSel] = useState<HlSel | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const textRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)
    void api
      .getFathersSection(volumeCode, sectionId)
      .then((s) => {
        if (!alive) return
        setSection(s)
        setLoading(false)
        if (!s) setError('Could not load this section.')
      })
      .catch(() => {
        if (!alive) return
        setLoading(false)
        setError('Could not load this section.')
      })
    return () => {
      alive = false
    }
  }, [volumeCode, sectionId])

  useEffect(() => {
    setPop(null)
    setHlSel(null)
    scrollRef.current?.scrollTo({ top: 0 })
  }, [section])

  /** Click handling shared by the section body and the footnote popover: scripture links open the
   *  passage in the Texts panel; footnote markers open the popover. Returns true if it handled it. */
  const handleClick = (e: React.MouseEvent): boolean => {
    const target = e.target as Element
    const link = target.closest?.('a.scripref') as HTMLElement | null
    if (link) {
      e.preventDefault()
      const p = passageFromOsis(link.dataset.osis ?? '')
      if (p) onPassage(p.book, p.chapter, p.highlight)
      return true
    }
    const fn = target.closest?.('sup.fn') as HTMLElement | null
    const body = scrollRef.current
    if (fn && section && body) {
      const note = section.notes.find((n) => n.anchor === fn.dataset.note)
      if (note) {
        const r = fn.getBoundingClientRect()
        const host = body.getBoundingClientRect()
        setPop({ note, x: r.left - host.left + body.scrollLeft, y: r.bottom - host.top + body.scrollTop + 6 })
      }
      return true
    }
    return false
  }

  const onTextClick = (e: React.MouseEvent): void => {
    // A drag-to-select leaves a non-collapsed selection; that is a highlight, not a click.
    if (window.getSelection()?.isCollapsed === false) return
    if (!handleClick(e)) setPop(null)
  }

  const onBodyMouseUp = (e: React.MouseEvent): void => {
    if (!onQuote) return
    const t = e.target as Element
    if (t.closest?.('.scripture-hl-pop') || t.closest?.('.fathers-note-pop')) return
    const sel = window.getSelection()
    const body = scrollRef.current
    const text = textRef.current
    if (!sel || sel.isCollapsed || sel.rangeCount === 0 || !body || !text || !section) {
      setHlSel(null)
      return
    }
    const range = sel.getRangeAt(0)
    if (!text.contains(range.commonAncestorContainer)) {
      setHlSel(null)
      return
    }
    const picked = sel.toString().trim()
    if (!picked) {
      setHlSel(null)
      return
    }
    const rect = range.getBoundingClientRect()
    const host = body.getBoundingClientRect()
    setHlSel({
      text: picked,
      page: pageForNode(text, range.startContainer, section.startPage),
      paragraph: paragraphForNode(text, range.startContainer),
      x: rect.left - host.left + body.scrollLeft + rect.width / 2,
      y: rect.bottom - host.top + body.scrollTop + 6
    })
  }

  const pickColor = (color: string): void => {
    if (!hlSel || !onQuote) return
    onQuote({ text: hlSel.text, page: hlSel.page, paragraph: hlSel.paragraph, color })
    window.getSelection()?.removeAllRanges()
    setHlSel(null)
  }

  const title = section ? section.shortTitle || section.titles[section.titles.length - 1] || section.id : ''
  const volLabel = section ? `${FATHERS_SERIES_LABEL[section.series]} ${section.volumeNumber}` : ''

  return (
    <div className={`scripture-reader fathers-reader${compact ? ' compact' : ''}`}>
      <div className="sr-head">
        <button
          className="icon-btn"
          title="Previous section"
          disabled={!section?.prevId}
          onClick={() => section?.prevId && onNavigate(section.prevId)}
        >
          <ChevronLeft size={16} />
        </button>
        <span className="sr-title">{title}</span>
        {section?.editorial && <span className="fathers-tag">Editor</span>}
        <span className="sr-abbr">
          {volLabel}
          {section?.startPage ? ` · p. ${section.startPage}` : ''}
        </span>
        <button
          className="icon-btn"
          title="Next section"
          disabled={!section?.nextId}
          onClick={() => section?.nextId && onNavigate(section.nextId)}
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {section && (
        <div className="fathers-crumbs">
          <span>{section.volumeTitle}</span>
          {section.authorName && (
            <>
              <span className="fathers-crumb-sep">›</span>
              {onAuthor && section.authorId ? (
                <button className="fathers-crumb-link" onClick={() => onAuthor(section.authorId as string)}>
                  {section.authorName}
                </button>
              ) : (
                <span>{section.authorName}</span>
              )}
            </>
          )}
          {section.workTitle && (
            <>
              <span className="fathers-crumb-sep">›</span>
              <span>{section.workTitle}</span>
            </>
          )}
        </div>
      )}

      <div
        className="sr-body"
        ref={scrollRef}
        onMouseUp={onBodyMouseUp}
        onMouseDown={(e) => {
          if (!(e.target as Element).closest?.('.fathers-note-pop')) setHlSel(null)
        }}
      >
        {loading ? (
          <div className="sr-loading">
            <Loader2 size={18} className="spin" /> Loading…
          </div>
        ) : error ? (
          <div className="sr-error">{error}</div>
        ) : section ? (
          <div
            ref={textRef}
            className="sr-text fathers-text"
            onClick={onTextClick}
            dangerouslySetInnerHTML={{ __html: section.html }}
          />
        ) : null}

        {pop && (
          <div
            className="fathers-note-pop"
            style={{ left: Math.max(8, pop.x - 12), top: pop.y }}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              handleClick(e)
              e.stopPropagation()
            }}
          >
            <button className="fathers-note-close" title="Close" onClick={() => setPop(null)}>
              ×
            </button>
            <div className="fathers-note-n">Note {pop.note.n}</div>
            <div dangerouslySetInnerHTML={{ __html: pop.note.html }} />
          </div>
        )}

        {hlSel && (
          <div
            className="scripture-hl-pop"
            style={{ left: hlSel.x, top: hlSel.y }}
            onMouseDown={(e) => {
              e.preventDefault()
              e.stopPropagation()
            }}
          >
            {HL_COLORS.map((c) => (
              <button
                key={c.name}
                className="shp-swatch"
                style={{ background: c.tint }}
                title={`Quote (${c.name})`}
                onClick={() => pickColor(c.name)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Add the reader styles**

**Append to the end of `src/renderer/src/styles/app.css`**

```css
/* ---- Church Fathers reader (CCEL ThML) ---- */
.fathers-tag {
  display: inline-block;
  margin-left: 6px;
  padding: 0 6px;
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  color: var(--muted);
  font-family: var(--font-ui);
  font-size: 10px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  vertical-align: 1px;
}

/* Reader */
.fathers-crumbs {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding: 6px 18px;
  border-bottom: 1px solid var(--border);
  color: var(--muted);
  font-family: var(--font-ui);
  font-size: 11.5px;
}
.fathers-crumb-sep {
  opacity: 0.6;
}
.fathers-crumb-link {
  padding: 0;
  background: transparent;
  border: 0;
  color: var(--accent);
  font: inherit;
  cursor: pointer;
}
.fathers-crumb-link:hover {
  text-decoration: underline;
}
.fathers-text {
  position: relative;
}
.fathers-text p {
  margin: 0 0 0.9em;
}
.fathers-text h3 {
  margin: 1.1em 0 0.5em;
  font-size: 1.1em;
}
.fathers-text h4 {
  margin: 1em 0 0.4em;
  font-size: 1em;
  font-style: italic;
}
.fathers-text .sc {
  font-variant: small-caps;
}
.fathers-text .l,
.fathers-text .verse {
  padding-left: 1.4em;
  text-indent: -1.4em;
}
.fathers-text blockquote {
  margin: 0.8em 0 0.8em 1.2em;
  padding-left: 0.9em;
  border-left: 2px solid var(--border-strong);
}
.fathers-text table {
  border-collapse: collapse;
  margin: 0.6em 0;
}
.fathers-text td,
.fathers-text th {
  padding: 2px 8px;
  border: 1px solid var(--border);
  font-size: 0.9em;
}
.fathers-text a.scripref {
  color: var(--accent);
  text-decoration: underline dotted;
  text-underline-offset: 3px;
  cursor: pointer;
}
.fathers-text a.scripref:hover {
  text-decoration-style: solid;
}
.fathers-text sup.fn {
  margin-left: 1px;
  padding: 0 2px;
  color: var(--gold);
  font-family: var(--font-ui);
  font-size: 0.65em;
  cursor: pointer;
  user-select: none;
}
.fathers-text sup.fn:hover {
  color: var(--accent);
}
/* Original page breaks: a faint "p. N" label in the margin at the point the page turns. */
.fathers-text .pb {
  position: relative;
  display: inline-block;
  width: 0;
  height: 0;
}
.fathers-text .pb::before {
  content: 'p. ' attr(data-page);
  position: absolute;
  right: 0.6em;
  top: -0.9em;
  white-space: nowrap;
  color: var(--muted);
  font-family: var(--font-ui);
  font-size: 10.5px;
  opacity: 0.7;
  user-select: none;
}
.fathers-note-pop {
  position: absolute;
  z-index: 25;
  width: min(380px, calc(100% - 24px));
  max-height: 260px;
  overflow: auto;
  padding: 10px 28px 10px 12px;
  background: var(--card);
  border: 1px solid var(--border-strong);
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28);
  color: var(--text);
  font-family: var(--font-read);
  font-size: 14px;
  line-height: 1.55;
  user-select: text;
}
.fathers-note-pop p {
  margin: 0 0 0.5em;
}
.fathers-note-pop a.scripref {
  color: var(--accent);
  text-decoration: underline dotted;
  cursor: pointer;
}
.fathers-note-n {
  margin-bottom: 4px;
  color: var(--gold);
  font-family: var(--font-ui);
  font-size: 10.5px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.fathers-note-close {
  position: absolute;
  top: 4px;
  right: 6px;
  padding: 0 6px;
  background: transparent;
  border: 0;
  color: var(--muted);
  font-size: 16px;
  cursor: pointer;
}

```

- [ ] **Step 7: Typecheck and commit**

```bash
npm run typecheck
git add src/renderer/src/lib/fathersReaderUtils.ts src/renderer/src/lib/fathersReaderUtils.test.ts src/renderer/src/components/library/FathersReader.tsx src/renderer/src/styles/app.css
git commit -m "feat(fathers): section reader with footnote popovers, page labels and scripture links" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

The reader's DOM behaviour (popover placement, selection → page) is covered by the manual checklist in Task 12; the test environment is Node (no DOM).

---

### Task 9: Fathers shell — tab kind, rail entry, store, drawer pane, author page, scripture → Texts (model: sonnet)

**Files:**
- Modify: `src/renderer/src/store/workspace.ts` (+ `workspace.test.ts`), `src/renderer/src/store/useStore.ts`
- Modify: `src/renderer/src/components/navigation.ts`, `src/renderer/src/components/ThreePanel.tsx`
- Modify: `src/renderer/src/components/library/PaneFrame.tsx`, `TabStrip.tsx`, `ReferenceBiblePanel.tsx`
- Create: `src/renderer/src/lib/fathersGrouping.ts` (+ `fathersGrouping.test.ts`), `src/renderer/src/components/library/FathersPane.tsx`, `FathersAuthorPage.tsx`
- Modify: `src/renderer/src/styles/app.css` (drawer / author-page styles)

**Interfaces:**
- Consumes: `FathersReader`, `FathersQuoteCapture` (Task 8); `api.listFathersVolumes/listFathersSections/listFathersAuthors/getFathersAuthor` and their types (Task 5); `FATHERS_SERIES_LABEL`, `FATHERS_SERIES_ORDER`, `fathersVolumeLabel` (Task 2); existing `useOpenElsewhereMenu`, `OpenElsewhere` content kinds, `activeTab`, `setTabContent`, `focusTab`, `saveLayout`, `setRefMode`.
- Produces:
  - tab kind `'fathers'` with fields `fathersVolume?`, `fathersSection?`, `fathersAuthor?`; `TabContent` variant `{ kind: 'fathers'; fathersVolume?; fathersSection?; fathersAuthor? }` (reader when volume+section are set, author page when `fathersAuthor` is set, empty pane otherwise)
  - store: `navigateFathers(volumeCode, sectionId): void` (reuses the focused or any existing Fathers tab, else opens one; stores session `lastFathers`), `openFathersAuthor(authorId): void`, `showFathers(): Promise<void>` (rail entry; resumes `lastFathers`), `showPassageInTexts(book, chapter, highlight?): void` (sets `refBibleTarget`, pins the Texts pill to Bible, opens + widens the right panel), state `refBibleTarget`
  - `groupFathersSections(sections): FathersAuthorGroup[]` (contiguous author runs → contiguous work runs), `sectionLabel(s)`
  - left-rail entry `{ id: 'fathers', label: 'Church Fathers', icon: Landmark }`

Drawer behaviour: toggle **Volumes** (series → volume → author → work → section; a volume row shows ⚠ with the error message if `status='error'`, "(indexing…)" while `unindexed`; the lists refresh every 5 s while any volume is unindexed or none exist yet, so the drawer fills in during the startup sync) / **Authors** (oldest first, dates beside the name; selecting opens the author page). Collapsed state and the toggle are remembered in session keys `fathersNavCollapsed` / `fathersNavView`.

- [ ] **Step 1: Write the failing tests**

**Edit `src/renderer/src/store/workspace.test.ts`** (context lines locate each change; line numbers are indicative only)

```diff
--- a/src/renderer/src/store/workspace.test.ts
+++ b/src/renderer/src/store/workspace.test.ts
@@ -216,6 +216,20 @@
       quotesGroup: group
     })
     expect(tabContent({ ...base, kind: 'picker' })).toEqual({ kind: 'picker' })
+    expect(
+      tabContent({ ...base, kind: 'fathers', fathersVolume: 'anf01', fathersSection: 'ix.ii.ii' })
+    ).toEqual({ kind: 'fathers', fathersVolume: 'anf01', fathersSection: 'ix.ii.ii', fathersAuthor: undefined })
+  })
+
+  it('opens a Fathers tab, and setTabContent swaps reader <-> author page without leaking fields', () => {
+    let ws: Workspace = EMPTY_WORKSPACE
+    const opened = openTab(ws, { kind: 'fathers', fathersVolume: 'anf01', fathersSection: 'a' })
+    ws = opened.ws
+    expect(ws.tabs[0]).toMatchObject({ kind: 'fathers', fathersVolume: 'anf01', fathersSection: 'a' })
+    ws = setTabContent(ws, opened.tabId, { kind: 'fathers', fathersAuthor: 'irenaeus' })
+    expect(ws.tabs[0].fathersAuthor).toBe('irenaeus')
+    expect(ws.tabs[0].fathersVolume).toBeUndefined()
+    expect(ws.tabs[0].fathersSection).toBeUndefined()
   })
 
   it('round-trips through openTab: duplicating a lone tab produces an equivalent tab in the new pane', () => {
```

**Create `src/renderer/src/lib/fathersGrouping.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { groupFathersSections, sectionLabel } from './fathersGrouping'
import type { FathersSectionSummary } from '../../../shared/ipc'

const sec = (id: string, ordinal: number, o: Partial<FathersSectionSummary> = {}): FathersSectionSummary => ({
  id, ordinal, depth: 2, titles: [id], shortTitle: id, authorId: null, authorName: null,
  workTitle: null, editorial: false, startPage: null, ...o
})

describe('groupFathersSections', () => {
  it('groups contiguous sections by author then work, preserving reading order', () => {
    const groups = groupFathersSections([
      sec('t', 0, { editorial: true }),
      sec('c1', 1, { authorId: 'clement_rome', authorName: 'Clement of Rome', workTitle: 'First Epistle' }),
      sec('c2', 2, { authorId: 'clement_rome', authorName: 'Clement of Rome', workTitle: 'First Epistle' }),
      sec('c3', 3, { authorId: 'clement_rome', authorName: 'Clement of Rome', workTitle: 'Second Epistle' }),
      sec('i1', 4, { authorId: 'irenaeus', authorName: 'Irenaeus of Lyons', workTitle: 'Against Heresies' })
    ])
    expect(groups.map((g) => g.authorName)).toEqual(['Unattributed', 'Clement of Rome', 'Irenaeus of Lyons'])
    expect(groups[1].works.map((w) => [w.workTitle, w.sections.map((s) => s.id)])).toEqual([
      ['First Epistle', ['c1', 'c2']],
      ['Second Epistle', ['c3']]
    ])
  })

  it('starts a new group when an author returns later, keeping the runs apart', () => {
    const a = { authorId: 'a', authorName: 'A', workTitle: 'W' }
    const groups = groupFathersSections([
      sec('1', 0, a),
      sec('2', 1, { authorId: 'b', authorName: 'B', workTitle: 'W' }),
      sec('3', 2, a)
    ])
    expect(groups.map((g) => g.authorId)).toEqual(['a', 'b', 'a'])
    expect(new Set(groups.map((g) => g.key)).size).toBe(3)
  })

  it('returns [] for an empty volume and gives a missing work title the empty string', () => {
    expect(groupFathersSections([])).toEqual([])
    expect(groupFathersSections([sec('x', 0)])[0].works[0].workTitle).toBe('')
  })
})

describe('sectionLabel', () => {
  it('prefers the short title, then the last ancestor title, then the id', () => {
    expect(sectionLabel({ shortTitle: 'Chapter I', titles: ['A', 'B'], id: 'x' })).toBe('Chapter I')
    expect(sectionLabel({ shortTitle: '', titles: ['A', 'B'], id: 'x' })).toBe('B')
    expect(sectionLabel({ shortTitle: '', titles: [], id: 'x' })).toBe('x')
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/renderer/src/store/workspace.test.ts src/renderer/src/lib/fathersGrouping.test.ts`
Expected: FAIL — `fathersGrouping` cannot be resolved; the new workspace test fails on the unknown `'fathers'` kind (TypeScript is not checked by vitest, but `tabContent` returns `undefined` for it).

- [ ] **Step 3: Implement the tab kind and the grouping helper**

**Edit `src/renderer/src/store/workspace.ts`** (context lines locate each change; line numbers are indicative only)

```diff
--- a/src/renderer/src/store/workspace.ts
+++ b/src/renderer/src/store/workspace.ts
@@ -1,6 +1,6 @@
 import type { NoteSummary } from '@shared/ipc'
 
-export type TabKind = 'note' | 'bible' | 'pdf' | 'quotes' | 'picker' | 'boc'
+export type TabKind = 'note' | 'bible' | 'pdf' | 'quotes' | 'picker' | 'boc' | 'fathers'
 
 /** A group of saved quotes opened in the center: a PDF, a Bible chapter, or a commentary source. */
 export type QuoteGroupRef =
@@ -28,6 +28,11 @@
   documentCode?: string
   sectionOrdinal?: number
   bocSourceId?: string
+  /** Church Fathers: the volume code + CCEL section id being read ... */
+  fathersVolume?: string
+  fathersSection?: string
+  /** ... or, instead, the author whose page is shown. All three unset = the empty Fathers pane. */
+  fathersAuthor?: string
 }
 
 /** A pane: which tabs live in it (via `Tab.paneId`) plus which one is active. */
@@ -50,6 +55,7 @@
   | { kind: 'bible'; book: string; chapter: number; highlight?: number[]; translation?: string }
   | { kind: 'quotes'; quotesGroup: QuoteGroupRef }
   | { kind: 'boc'; documentCode: string; sectionOrdinal: number; bocSourceId?: string }
+  | { kind: 'fathers'; fathersVolume?: string; fathersSection?: string; fathersAuthor?: string }
   | { kind: 'picker' }
 
 /** The content a tab is currently showing, independent of its id/pane/order. */
@@ -65,6 +71,13 @@
       return { kind: 'quotes', quotesGroup: tab.quotesGroup! }
     case 'boc':
       return { kind: 'boc', documentCode: tab.documentCode!, sectionOrdinal: tab.sectionOrdinal!, bocSourceId: tab.bocSourceId }
+    case 'fathers':
+      return {
+        kind: 'fathers',
+        fathersVolume: tab.fathersVolume,
+        fathersSection: tab.fathersSection,
+        fathersAuthor: tab.fathersAuthor
+      }
     case 'picker':
       return { kind: 'picker' }
   }
```

**Create `src/renderer/src/lib/fathersGrouping.ts`**

```ts
import type { FathersSectionSummary } from '../../../shared/ipc'

export interface FathersWorkGroup {
  /** '' when the section carries no work title. */
  workTitle: string
  sections: FathersSectionSummary[]
}
export interface FathersAuthorGroup {
  /** Stable React key: the author (or 'unattributed') plus where the run starts. */
  key: string
  authorId: string | null
  /** Display name; 'Unattributed' for front matter and collections with no single author. */
  authorName: string
  works: FathersWorkGroup[]
}

/**
 * Group a volume's reading-order section list into contiguous author runs, each split into
 * contiguous work runs — the Volumes drawer's "author → work → section" tree. Runs rather than a
 * map, so a volume that returns to an author later (or interleaves unattributed front matter)
 * keeps its reading order instead of merging distant sections.
 */
export function groupFathersSections(sections: FathersSectionSummary[]): FathersAuthorGroup[] {
  const groups: FathersAuthorGroup[] = []
  for (const s of sections) {
    let g = groups[groups.length - 1]
    if (!g || g.authorId !== s.authorId) {
      g = {
        key: `${s.authorId ?? 'unattributed'}@${s.ordinal}`,
        authorId: s.authorId,
        authorName: s.authorId ? (s.authorName ?? s.authorId) : 'Unattributed',
        works: []
      }
      groups.push(g)
    }
    const work = s.workTitle ?? ''
    let w = g.works[g.works.length - 1]
    if (!w || w.workTitle !== work) {
      w = { workTitle: work, sections: [] }
      g.works.push(w)
    }
    w.sections.push(s)
  }
  return groups
}

/** A section's row label in the drawer: its short title, else its last ancestor title, else its id. */
export function sectionLabel(s: Pick<FathersSectionSummary, 'shortTitle' | 'titles' | 'id'>): string {
  return s.shortTitle || s.titles[s.titles.length - 1] || s.id
}
```

- [ ] **Step 4: Run them**

Run: `npx vitest run src/renderer/src/store/workspace.test.ts src/renderer/src/lib/fathersGrouping.test.ts`
Expected: PASS — workspace 21 tests (one extended, one new), grouping 4 tests.

- [ ] **Step 5: Store state and actions**

**Edit `src/renderer/src/store/useStore.ts`** (context lines locate each change; line numbers are indicative only)

```diff
--- a/src/renderer/src/store/useStore.ts
+++ b/src/renderer/src/store/useStore.ts
@@ -170,6 +171,9 @@
    *  Mirrored to the session store under `refMode:<pill>`; deliberately NOT in PanelLayout,
    *  which is a database row. */
   refModes: Partial<Record<RefPill, CorpusMode>>
+  /** A passage another surface (a Fathers scripture link) asked the Texts-pill Bible to show.
+   *  A fresh object per request, so asking for the same passage twice still re-navigates. */
+  refBibleTarget: { book: string; chapter: number; highlight: number[] } | null
 
   // --- Center workspace ---
   /** Every open tab across both panes; the source of truth. */
@@ -294,6 +300,18 @@
    *  not the primary text — they live in separate tables). */
   addBocCommentaryQuote: (input: BocQuoteInput) => Promise<void>
 
+  // --- Church Fathers ---
+  /** Route a volume/section into a Fathers pane: reuse the focused or any existing Fathers tab,
+   *  otherwise open one. */
+  navigateFathers: (volumeCode: string, sectionId: string) => void
+  /** Same routing, but to an author's page. */
+  openFathersAuthor: (authorId: string) => void
+  /** Open/focus the Fathers as a center pane (left-rail "Church Fathers" entry), resuming where
+   *  the user left off. */
+  showFathers: () => Promise<void>
+  /** Show a passage in the Texts pill's Bible (a scripture link was clicked in a Father). */
+  showPassageInTexts: (book: string, chapter: number, highlight?: number[]) => void
+
   // --- Center workspace ---
   /** Create a new tab (duplicates allowed) and focus it; returns the new tab's id. */
   openTab: (content: TabContent, opts?: { paneId?: string; activate?: boolean }) => string
@@ -417,6 +435,7 @@
     bocLookup: null,
     bocMatches: [],
     refModes: {},
+    refBibleTarget: null,
     tabs: [],
     paneOrder: [],
     activePaneId: null,
@@ -1126,6 +1152,74 @@
       set({ noteReloadToken: get().noteReloadToken + 1 })
     },
 
+    // --- Church Fathers ---
+    // In-place navigation, like navigateBoc: the focused tab if it is already a Fathers tab,
+    // else any existing Fathers tab (so a catena click does not pile up tabs), else a new one.
+    navigateFathers: (volumeCode, sectionId) => {
+      const { activePaneId } = get()
+      const current = activePaneId
+        ? activeTab({ tabs: get().tabs, paneOrder: get().paneOrder, activePaneId }, activePaneId)
+        : undefined
+      const existing = current?.kind === 'fathers' ? current : get().tabs.find((t) => t.kind === 'fathers')
+      const content: TabContent = { kind: 'fathers', fathersVolume: volumeCode, fathersSection: sectionId }
+      if (existing) {
+        get().setTabContent(existing.id, content)
+        get().focusTab(existing.id)
+      } else {
+        get().openTab(content)
+      }
+      get().saveLayout({ activeLeftView: 'reading' })
+      void api.setSession('lastFathers', JSON.stringify({ volumeCode, sectionId }))
+    },
+
+    openFathersAuthor: (authorId) => {
+      const { activePaneId } = get()
+      const current = activePaneId
+        ? activeTab({ tabs: get().tabs, paneOrder: get().paneOrder, activePaneId }, activePaneId)
+        : undefined
+      const existing = current?.kind === 'fathers' ? current : get().tabs.find((t) => t.kind === 'fathers')
+      const content: TabContent = { kind: 'fathers', fathersAuthor: authorId }
+      if (existing) {
+        get().setTabContent(existing.id, content)
+        get().focusTab(existing.id)
+      } else {
+        get().openTab(content)
+      }
+      get().saveLayout({ activeLeftView: 'reading' })
+    },
+
+    showFathers: async () => {
+      const existing = get().tabs.find((t) => t.kind === 'fathers')
+      if (existing) {
+        get().focusTab(existing.id)
+        get().saveLayout({ activeLeftView: 'reading' })
+        return
+      }
+      // Resume where the user left off; with no history the pane opens on its volume list.
+      let content: TabContent = { kind: 'fathers' }
+      const last = await api.getSession('lastFathers')
+      if (last) {
+        try {
+          const p = JSON.parse(last) as { volumeCode?: string; sectionId?: string }
+          if (p.volumeCode && p.sectionId) {
+            content = { kind: 'fathers', fathersVolume: p.volumeCode, fathersSection: p.sectionId }
+          }
+        } catch {
+          /* ignore malformed session value */
+        }
+      }
+      get().openTab(content)
+      get().saveLayout({ activeLeftView: 'reading' })
+    },
+
+    showPassageInTexts: (book, chapter, highlight = []) => {
+      set({ refBibleTarget: { book, chapter, highlight } })
+      get().setRefMode('texts', 'bible')
+      // Same patch as ThreePanel.selectRightTab: open the panel and give a reader pill room.
+      const widen = (get().layout?.notesWidth ?? 0) < 460 ? { notesWidth: 560 } : {}
+      get().saveLayout({ activeRightTab: 'texts', notesCollapsed: false, ...widen })
+    },
+
     openTab: (content, opts) => {
       const currentWs: Workspace = { tabs: get().tabs, paneOrder: get().paneOrder, activePaneId: get().activePaneId }
       const { ws: next, tabId } = pureOpenTab(currentWs, content, opts)
```

- [ ] **Step 6: Rail entry, tab routing, tab title**

**Edit `src/renderer/src/components/navigation.ts`** (context lines locate each change; line numbers are indicative only)

```diff
--- a/src/renderer/src/components/navigation.ts
+++ b/src/renderer/src/components/navigation.ts
@@ -11,7 +11,8 @@
   File,
   BookOpenText,
   MessageSquareQuote,
-  Quote
+  Quote,
+  Landmark
 } from 'lucide-react'
 import type { LucideIcon } from 'lucide-react'
 import type { RailItem } from './IconRail'
@@ -24,6 +25,7 @@
   { id: 'search', label: 'Search', icon: Search },
   { id: 'scripture', label: 'Scripture', icon: ScrollText },
   { id: 'confessions', label: 'Confessions', icon: BookMarked },
+  { id: 'fathers', label: 'Church Fathers', icon: Landmark },
   { id: 'graph', label: 'Graph', icon: Network },
   { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
   { id: 'pages', label: 'Pages', icon: Files }
@@ -77,6 +79,11 @@
     title: 'Book of Concord',
     subtitle: 'Pick a document from the reader to begin — the Augsburg Confession opens by default.'
   },
+  fathers: {
+    icon: Landmark,
+    title: 'Church Fathers',
+    subtitle: 'Pick a volume or an author from the drawer to begin reading the Ante-Nicene and Nicene Fathers.'
+  },
   graph: {
     icon: Network,
     title: 'Graph view',
```

**Edit `src/renderer/src/components/ThreePanel.tsx`** (context lines locate each change; line numbers are indicative only)

```diff
--- a/src/renderer/src/components/ThreePanel.tsx
+++ b/src/renderer/src/components/ThreePanel.tsx
@@ -39,6 +39,7 @@
   const tabs = useStore((s) => s.tabs)
   const paneOrder = useStore((s) => s.paneOrder)
   const showConfessions = useStore((s) => s.showConfessions)
+  const showFathers = useStore((s) => s.showFathers)
   const activePaneId = useStore((s) => s.activePaneId)
   const ref = useRef<HTMLDivElement>(null)
 
@@ -47,6 +48,7 @@
   const selectLeftView = (id: string): void => {
     if (id === 'scripture') void showScripture()
     else if (id === 'confessions') void showConfessions()
+    else if (id === 'fathers') void showFathers()
     else saveLayout({ activeLeftView: id })
   }
 
@@ -61,7 +63,9 @@
         ? 'scripture'
         : focusedTab.kind === 'boc'
           ? 'confessions'
-          : focusedTab.kind === 'note'
+          : focusedTab.kind === 'fathers'
+            ? 'fathers'
+            : focusedTab.kind === 'note'
             ? 'notes'
             : layout.activeLeftView
       : layout.activeLeftView
```

**Edit `src/renderer/src/components/library/PaneFrame.tsx`** (context lines locate each change; line numbers are indicative only)

```diff
--- a/src/renderer/src/components/library/PaneFrame.tsx
+++ b/src/renderer/src/components/library/PaneFrame.tsx
@@ -5,6 +5,7 @@
 import { PdfReader } from './PdfReader'
 import { BiblePane } from './BiblePane'
 import { BocPane } from './BocPane'
+import { FathersPane } from './FathersPane'
 import { PanePicker } from './PanePicker'
 import { QuoteGroupPane } from './QuoteGroupPane'
 import { TabStrip } from './TabStrip'
@@ -81,6 +82,8 @@
     body = <PdfReader key={tab.id} bookId={tab.bookId} embedded />
   } else if (tab?.kind === 'note' && tab.notePath) {
     body = <RichNoteEditor key={tab.id} path={tab.notePath} />
+  } else if (tab?.kind === 'fathers') {
+    body = <FathersPane key={tab.id} tab={tab} />
   } else if (tab?.kind === 'quotes' && tab.quotesGroup) {
     body = <QuoteGroupPane key={tab.id} group={tab.quotesGroup} />
   } else if (tab?.kind === 'bible' && tab.book && tab.chapter != null) {
```

**Edit `src/renderer/src/components/library/TabStrip.tsx`** (context lines locate each change; line numbers are indicative only)

```diff
--- a/src/renderer/src/components/library/TabStrip.tsx
+++ b/src/renderer/src/components/library/TabStrip.tsx
@@ -1,10 +1,11 @@
 import { useState } from 'react'
 import type { PointerEvent as ReactPointerEvent } from 'react'
-import { FileText, BookOpen, ScrollText, BookMarked, Quote, FilePlus, Plus, X } from 'lucide-react'
+import { FileText, BookOpen, ScrollText, BookMarked, Quote, FilePlus, Plus, X, Landmark } from 'lucide-react'
 import { useStore, tabsForPane } from '../../store/useStore'
 import type { Tab } from '../../store/useStore'
 import { bookByCode } from '@shared/scriptureRef'
 import { bocDocument } from '@shared/bookOfConcord'
+import { fathersVolumeLabel } from '@shared/fathers'
 
 export interface HoverTarget {
   paneId: string
@@ -30,6 +31,11 @@
     const doc = tab.documentCode ? bocDocument(tab.documentCode) : undefined
     return { icon: <BookMarked size={13} />, label: doc?.abbreviation ?? tab.documentCode ?? 'Confessions' }
   }
+  if (tab.kind === 'fathers') {
+    // Volume code only: the tab strip has no section titles, and the author page is just "Fathers".
+    const label = tab.fathersVolume && !tab.fathersAuthor ? fathersVolumeLabel(tab.fathersVolume) : 'Church Fathers'
+    return { icon: <Landmark size={13} />, label }
+  }
   if (tab.kind === 'quotes') {
     const g = tab.quotesGroup
     const label = !g
```

- [ ] **Step 7: The Texts panel honours a requested passage**

`refBibleTarget` is consumed (cleared) once applied, so reopening the Texts pill later does not replay it.

**Edit `src/renderer/src/components/library/ReferenceBiblePanel.tsx`** (context lines locate each change; line numbers are indicative only)

```diff
--- a/src/renderer/src/components/library/ReferenceBiblePanel.tsx
+++ b/src/renderer/src/components/library/ReferenceBiblePanel.tsx
@@ -58,6 +58,15 @@
     void api.setSession('refBibleLoc', JSON.stringify({ book: b, chapter: c }))
   }
 
+  // Another surface (a scripture link in the Church Fathers reader) asked for a passage.
+  const refBibleTarget = useStore((s) => s.refBibleTarget)
+  useEffect(() => {
+    if (!refBibleTarget) return
+    navigate(refBibleTarget.book, refBibleTarget.chapter, refBibleTarget.highlight)
+    useStore.setState({ refBibleTarget: null }) // consumed: do not replay on a later mount
+    // eslint-disable-next-line react-hooks/exhaustive-deps
+  }, [refBibleTarget])
+
   const pickTranslation = (id: string): void => {
     setTranslation(id)
     void api.setSession('refBibleTranslation', id)
```

- [ ] **Step 8: The pane and the author page**

**Create `src/renderer/src/components/library/FathersAuthorPage.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { api } from '../../lib/api'
import { FATHERS_SERIES_LABEL } from '@shared/fathers'
import type { FathersAuthor, FathersWork } from '@shared/ipc'

/** One Father's page: name, dates, a short bio, and every work indexed from the vault's
 *  volumes, grouped by volume, each linking to where the work begins. */
export function FathersAuthorPage({
  authorId,
  onOpenWork
}: {
  authorId: string
  onOpenWork: (volumeCode: string, sectionId: string) => void
}) {
  const [author, setAuthor] = useState<FathersAuthor | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    setLoading(true)
    void api
      .getFathersAuthor(authorId)
      .then((a) => {
        if (!alive) return
        setAuthor(a)
        setLoading(false)
      })
      .catch(() => {
        if (!alive) return
        setAuthor(null)
        setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [authorId])

  if (loading) {
    return (
      <div className="sr-loading">
        <Loader2 size={18} className="spin" /> Loading…
      </div>
    )
  }
  if (!author) return <div className="sr-error">No works indexed for this author.</div>

  const byVolume = new Map<string, FathersWork[]>()
  for (const w of author.works) {
    const list = byVolume.get(w.volumeCode) ?? []
    list.push(w)
    byVolume.set(w.volumeCode, list)
  }

  return (
    <div className="fathers-author sr-body">
      <div className="sr-text">
        <h2 className="fathers-author-name">{author.name}</h2>
        {author.datesLabel && <div className="fathers-author-dates">{author.datesLabel}</div>}
        {author.bio && <p className="fathers-author-bio">{author.bio}</p>}
        {author.works.length === 0 ? (
          <p className="fathers-author-bio">No indexed works.</p>
        ) : (
          [...byVolume.entries()].map(([code, works]) => (
            <div key={code} className="fathers-author-vol">
              <div className="fathers-author-vol-head">
                {FATHERS_SERIES_LABEL[works[0].series]} {works[0].volumeNumber} — {works[0].volumeTitle}
              </div>
              {works.map((w) => (
                <button
                  key={`${code}|${w.workTitle}|${w.firstSectionId}`}
                  className="fathers-author-work"
                  onClick={() => onOpenWork(w.volumeCode, w.firstSectionId)}
                >
                  <span>{w.workTitle || '(untitled)'}</span>
                  <span className="fathers-author-count">{w.sectionCount}</span>
                </button>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
```

**Create `src/renderer/src/components/library/FathersPane.tsx`**

```tsx
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Landmark,
  PanelLeftClose,
  PanelLeftOpen
} from 'lucide-react'
import { useStore } from '../../store/useStore'
import type { Tab } from '../../store/useStore'
import { api } from '../../lib/api'
import { FATHERS_SERIES_LABEL, FATHERS_SERIES_ORDER } from '@shared/fathers'
import type { FathersAuthorSummary, FathersSectionSummary, FathersVolume } from '@shared/ipc'
import { groupFathersSections, sectionLabel } from '../../lib/fathersGrouping'
import { FathersReader } from './FathersReader'
import { FathersAuthorPage } from './FathersAuthorPage'
import { useOpenElsewhereMenu } from './OpenElsewhere'

type NavView = 'volumes' | 'authors'

/** The Church Fathers in a center workspace pane: a collapsible drawer (Volumes tree / Authors
 *  list) beside the reader or an author page. Navigation updates *this* tab only. */
export function FathersPane({ tab }: { tab: Tab }) {
  const navigateFathers = useStore((s) => s.navigateFathers)
  const openFathersAuthor = useStore((s) => s.openFathersAuthor)
  const showPassageInTexts = useStore((s) => s.showPassageInTexts)
  const { onContextMenu, menu } = useOpenElsewhereMenu()

  const volumeCode = tab.fathersVolume
  const sectionId = tab.fathersSection
  const authorId = tab.fathersAuthor

  const [volumes, setVolumes] = useState<FathersVolume[] | null>(null)
  const [authors, setAuthors] = useState<FathersAuthorSummary[] | null>(null)
  const [navView, setNavView] = useState<NavView>('volumes')
  // Panes are narrower than a full-center view, so default the drawer to its rail.
  const [navCollapsed, setNavCollapsed] = useState(true)
  const [expandedVolume, setExpandedVolume] = useState<string | null>(volumeCode ?? null)
  const [sectionsByVolume, setSectionsByVolume] = useState<Record<string, FathersSectionSummary[]>>({})
  const [collapsedAuthors, setCollapsedAuthors] = useState<Set<string>>(new Set())

  const signature = useRef('')
  const refresh = useCallback(async () => {
    const [v, a] = await Promise.all([api.listFathersVolumes(), api.listFathersAuthors()])
    // A re-indexed volume has a different section list: drop the cached trees when anything moved.
    const sig = JSON.stringify(v.map((x) => [x.code, x.status, x.sectionCount]))
    if (signature.current && signature.current !== sig) setSectionsByVolume({})
    signature.current = sig
    setVolumes(v)
    setAuthors(a)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // The startup sync indexes volumes one by one in the background: keep refreshing while the list
  // is empty or any volume is still waiting, so the drawer fills in without reopening the pane.
  const needsPoll = volumes === null || volumes.length === 0 || volumes.some((v) => v.status === 'unindexed')
  useEffect(() => {
    if (!needsPoll) return
    const t = window.setInterval(() => void refresh(), 5000)
    return () => window.clearInterval(t)
  }, [needsPoll, refresh])

  useEffect(() => {
    void api.getSession('fathersNavCollapsed').then((v) => setNavCollapsed(v !== '0'))
    void api.getSession('fathersNavView').then((v) => setNavView(v === 'authors' ? 'authors' : 'volumes'))
  }, [])

  // Keep the expanded volume following the tab (a catena click or search hit can change it).
  useEffect(() => {
    if (volumeCode) setExpandedVolume(volumeCode)
  }, [volumeCode])

  // Load a volume's section list the first time it is expanded.
  useEffect(() => {
    if (!expandedVolume || sectionsByVolume[expandedVolume]) return
    let alive = true
    void api.listFathersSections(expandedVolume).then((rows) => {
      if (alive) setSectionsByVolume((prev) => ({ ...prev, [expandedVolume]: rows }))
    })
    return () => {
      alive = false
    }
  }, [expandedVolume, sectionsByVolume])

  const toggleNav = (next: boolean): void => {
    setNavCollapsed(next)
    void api.setSession('fathersNavCollapsed', next ? '1' : '0')
  }
  const pickView = (v: NavView): void => {
    setNavView(v)
    void api.setSession('fathersNavView', v)
  }
  const toggleAuthorGroup = (key: string): void =>
    setCollapsedAuthors((prev) => {
      const n = new Set(prev)
      if (n.has(key)) n.delete(key)
      else n.add(key)
      return n
    })

  const volumesNav = (
    <div className="sv-testament">
      {volumes === null ? (
        <div className="sr-loading" style={{ height: 'auto', padding: '6px 8px' }}>
          Loading…
        </div>
      ) : volumes.length === 0 ? (
        <div className="quotes-empty">
          No volumes found. Copy CCEL ThML files (anf01.xml …) into the vault&apos;s <b>fathers</b> folder and
          restart Loci.
        </div>
      ) : (
        FATHERS_SERIES_ORDER.map((series) => {
          const inSeries = volumes.filter((v) => v.series === series)
          if (inSeries.length === 0) return null
          return (
            <div key={series}>
              <div className="sv-testament-head">{FATHERS_SERIES_LABEL[series]}</div>
              {inSeries.map((v) => (
                <div key={v.code} className="sv-book-wrap">
                  <button
                    className={`sv-book${volumeCode === v.code ? ' active' : ''}`}
                    title={v.status === 'error' ? `Failed to index: ${v.error ?? 'unknown error'}` : v.title}
                    onClick={() => setExpandedVolume(expandedVolume === v.code ? null : v.code)}
                  >
                    <span className="fathers-vol-num">{v.number}</span> {v.title || v.code}
                    {v.status === 'error' && <AlertTriangle size={12} className="fathers-vol-warn" />}
                    {v.status === 'unindexed' && <span className="fathers-vol-pending"> (indexing…)</span>}
                  </button>
                  {v.status === 'error' && expandedVolume === v.code && (
                    <div className="fathers-vol-error">{v.error ?? 'This volume failed to index.'}</div>
                  )}
                  {expandedVolume === v.code && v.status === 'indexed' && (
                    <div style={{ paddingLeft: 8 }}>
                      {(sectionsByVolume[v.code] ? groupFathersSections(sectionsByVolume[v.code]) : null)?.map((g) => {
                        const open = !collapsedAuthors.has(g.key)
                        return (
                          <div key={g.key}>
                            <button
                              className="sv-testament-head fathers-author-head"
                              onClick={() => toggleAuthorGroup(g.key)}
                            >
                              {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />} {g.authorName}
                            </button>
                            {open &&
                              g.works.map((w, wi) => (
                                <div key={wi}>
                                  {w.workTitle && <div className="fathers-work-head">{w.workTitle}</div>}
                                  {w.sections.map((s) => (
                                    <button
                                      key={s.id}
                                      className={`sv-book${volumeCode === v.code && sectionId === s.id ? ' active' : ''}`}
                                      style={{ fontSize: 12.5 }}
                                      title={s.titles.join(' › ')}
                                      onClick={() => navigateFathers(v.code, s.id)}
                                      onContextMenu={(e) =>
                                        onContextMenu(e, {
                                          kind: 'fathers',
                                          fathersVolume: v.code,
                                          fathersSection: s.id
                                        })
                                      }
                                    >
                                      {sectionLabel(s)}
                                      {s.editorial && <span className="fathers-tag"> Editor</span>}
                                    </button>
                                  ))}
                                </div>
                              ))}
                          </div>
                        )
                      }) ?? (
                        <div className="sr-loading" style={{ height: 'auto', padding: '6px 8px' }}>
                          Loading…
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )
        })
      )}
    </div>
  )

  const authorsNav = (
    <div className="sv-testament">
      {authors === null ? (
        <div className="sr-loading" style={{ height: 'auto', padding: '6px 8px' }}>
          Loading…
        </div>
      ) : authors.length === 0 ? (
        <div className="quotes-empty">No authors indexed yet.</div>
      ) : (
        authors.map((a) => (
          <button
            key={a.id}
            className={`sv-book${authorId === a.id ? ' active' : ''}`}
            title={`${a.workCount} work${a.workCount === 1 ? '' : 's'}`}
            onClick={() => openFathersAuthor(a.id)}
          >
            {a.name}
            {a.datesLabel && <span className="fathers-dates"> {a.datesLabel}</span>}
          </button>
        ))
      )}
    </div>
  )

  let main: React.ReactNode
  if (authorId) {
    main = (
      <FathersAuthorPage
        authorId={authorId}
        onOpenWork={(code, sectionId2) => navigateFathers(code, sectionId2)}
      />
    )
  } else if (volumeCode && sectionId) {
    main = (
      <FathersReader
        volumeCode={volumeCode}
        sectionId={sectionId}
        onNavigate={(id) => navigateFathers(volumeCode, id)}
        onPassage={(book, chapter, highlight) => showPassageInTexts(book, chapter, highlight)}
        onAuthor={(id) => openFathersAuthor(id)}
        compact
      />
    )
  } else {
    main = (
      <div className="sr-loading" style={{ flexDirection: 'column' }}>
        <Landmark size={22} />
        <div>Choose a volume or an author from the drawer.</div>
        {navCollapsed && (
          <button className="btn btn-sm" onClick={() => toggleNav(false)}>
            Open drawer
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="scripture-view">
      {navCollapsed ? (
        <div className="sv-nav-rail">
          <button className="rail-btn" title="Show volumes and authors" onClick={() => toggleNav(false)}>
            <PanelLeftOpen size={16} />
          </button>
        </div>
      ) : (
        <div className="sv-nav">
          <div className="sv-nav-top">
            <div className="sv-nav-bar">
              <span className="sv-nav-title">Church Fathers</span>
              <button className="icon-btn" title="Hide drawer" onClick={() => toggleNav(true)}>
                <PanelLeftClose size={15} />
              </button>
            </div>
            <div className="seg tiny fathers-nav-toggle">
              <button className={`seg-btn${navView === 'volumes' ? ' active' : ''}`} onClick={() => pickView('volumes')}>
                Volumes
              </button>
              <button className={`seg-btn${navView === 'authors' ? ' active' : ''}`} onClick={() => pickView('authors')}>
                Authors
              </button>
            </div>
          </div>
          <div className="sv-books">{navView === 'volumes' ? volumesNav : authorsNav}</div>
        </div>
      )}

      <div className="sv-main">{main}</div>
      {menu}
    </div>
  )
}
```

- [ ] **Step 9: Drawer and author-page styles**

**Append to the end of `src/renderer/src/styles/app.css`**

```css
/* ---- Church Fathers drawer and author page ---- */
.fathers-nav-toggle {
  margin: 8px 8px 4px;
}
.fathers-vol-num {
  display: inline-block;
  min-width: 1.4em;
  color: var(--gold);
  font-family: var(--font-ui);
  font-size: 11px;
}
.fathers-vol-warn {
  margin-left: 6px;
  color: var(--accent);
  vertical-align: -1px;
}
.fathers-vol-pending,
.fathers-dates {
  color: var(--muted);
  font-size: 11px;
}
.fathers-vol-error {
  margin: 2px 8px 6px 24px;
  color: var(--accent);
  font-family: var(--font-ui);
  font-size: 11.5px;
  line-height: 1.4;
}
.fathers-author-head {
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
  background: transparent;
  border: 0;
  cursor: pointer;
  text-align: left;
}
.fathers-work-head {
  padding: 4px 8px 2px 14px;
  color: var(--muted);
  font-family: var(--font-ui);
  font-size: 11px;
  font-style: italic;
}
/* Author page */
.fathers-author-name {
  margin: 0 0 2px;
  font-family: var(--font-title);
}
.fathers-author-dates {
  color: var(--gold);
  font-family: var(--font-ui);
  font-size: 13px;
}
.fathers-author-bio {
  margin: 12px 0 18px;
}
.fathers-author-vol {
  margin-bottom: 14px;
}
.fathers-author-vol-head {
  margin-bottom: 4px;
  color: var(--muted);
  font-family: var(--font-ui);
  font-size: 12px;
}
.fathers-author-work {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  padding: 6px 8px;
  background: transparent;
  border: 0;
  border-radius: 6px;
  color: var(--text);
  font-family: var(--font-read);
  font-size: 15px;
  text-align: left;
  cursor: pointer;
}
.fathers-author-work:hover {
  background: var(--accent-12);
}
.fathers-author-count {
  color: var(--muted);
  font-family: var(--font-ui);
  font-size: 11.5px;
}

```

- [ ] **Step 10: Typecheck, run the renderer tests, commit**

```bash
npm run typecheck
npx vitest run src/renderer
git add src/renderer/src/store/workspace.ts src/renderer/src/store/workspace.test.ts src/renderer/src/store/useStore.ts src/renderer/src/components/navigation.ts src/renderer/src/components/ThreePanel.tsx src/renderer/src/components/library/PaneFrame.tsx src/renderer/src/components/library/TabStrip.tsx src/renderer/src/components/library/ReferenceBiblePanel.tsx src/renderer/src/lib/fathersGrouping.ts src/renderer/src/lib/fathersGrouping.test.ts src/renderer/src/components/library/FathersPane.tsx src/renderer/src/components/library/FathersAuthorPage.tsx src/renderer/src/styles/app.css
git commit -m "feat(fathers): Church Fathers tab with volumes/authors drawer, reader and author page" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---


### Task 10: Reference-panel corpus mode `fathers` — catena and Fathers quotes (model: sonnet)

**Files:**
- Modify: `src/renderer/src/lib/corpusMode.ts` (+ `corpusMode.test.ts`)
- Modify: `src/renderer/src/components/library/CorpusSwitch.tsx`, `CommentaryReferencePanel.tsx`, `QuotesReferencePanel.tsx`, `FathersPane.tsx`
- Modify: `src/renderer/src/store/useStore.ts`
- Create: `src/renderer/src/lib/fathersCatena.ts` (+ `fathersCatena.test.ts`), `src/renderer/src/components/library/FathersCatenaPanel.tsx`, `FathersQuotesPanel.tsx`
- Modify: `src/renderer/src/styles/app.css` (catena styles)

**Interfaces:**
- Consumes: `api.fathersCatena`, `api.listFathersVolumes`, `api.listFathersQuotes`, `api.addFathersQuote`, `FathersCatenaGroup`, `FathersQuoteInput` (Tasks 5, 6); `navigateFathers` (Task 9); `FathersQuoteCapture` (Task 8); existing `QuoteCard`/`makeQuoteCardHandlers` (`QuotesPanel.tsx`), `commentaryLookup` and `scripturePassage` in the store.
- Produces:
  - `CorpusMode` gains `'fathers'`; `MODES_FOR_PILL.quotes = ['books','bible','confessions','fathers']`, `MODES_FOR_PILL.commentary = ['bible','confessions','fathers']` (Texts unchanged); `modeForTabKind('fathers') === 'fathers'`; the switch label "Fathers"
  - `resolveCatenaTarget(lookup, passage): { book; chapter; verse: number | null } | null` — a clicked verse wins while the reader is still on its chapter; otherwise the open chapter at chapter level
  - `<FathersCatenaPanel />` (Commentary pill, Fathers mode), `<FathersQuotesPanel />` (Quotes pill, Fathers mode; follows the focused Fathers tab's volume)
  - store `addFathersQuote(input: FathersQuoteInput): Promise<void>` (bumps `noteReloadToken`); `verseClicked` no longer re-pins Commentary→Bible while it is pinned to Fathers; a persisted `refMode:<pill>` of `'fathers'` is restored
  - `FathersPane` passes `onQuote` to the reader, completing select → colour → quote.

- [ ] **Step 1: Write the failing tests**

**Edit `src/renderer/src/lib/corpusMode.test.ts`** (context lines locate each change; line numbers are indicative only)

```diff
--- a/src/renderer/src/lib/corpusMode.test.ts
+++ b/src/renderer/src/lib/corpusMode.test.ts
@@ -6,6 +6,7 @@
     expect(modeForTabKind('pdf')).toBe('books')
     expect(modeForTabKind('bible')).toBe('bible')
     expect(modeForTabKind('boc')).toBe('confessions')
+    expect(modeForTabKind('fathers')).toBe('fathers')
   })
   it('returns null for kinds with no corpus', () => {
     expect(modeForTabKind('note')).toBeNull()
@@ -38,6 +39,12 @@
     expect(resolveCorpusMode(both, null, undefined)).toBe('bible')
   })
 
+  it('follows a focused Fathers tab on the pills that offer it, and ignores it on Texts', () => {
+    expect(resolveCorpusMode(['bible', 'confessions', 'fathers'], null, 'fathers')).toBe('fathers')
+    expect(resolveCorpusMode(['books', 'bible', 'confessions', 'fathers'], null, 'fathers')).toBe('fathers')
+    expect(resolveCorpusMode(both, null, 'fathers')).toBe('bible') // Texts has no Fathers mode
+  })
+
   it('ignores a focused kind the pill cannot offer', () => {
     // A PDF is focused but Texts has no books mode — do not blank, keep the default.
     expect(resolveCorpusMode(both, null, 'pdf')).toBe('bible')
@@ -68,9 +75,9 @@
   })
 
   it('offers a mode list for every pill, and single-mode pills offer none', () => {
-    expect(MODES_FOR_PILL.quotes).toEqual(['books', 'bible', 'confessions'])
+    expect(MODES_FOR_PILL.quotes).toEqual(['books', 'bible', 'confessions', 'fathers'])
     expect(MODES_FOR_PILL.texts).toEqual(['bible', 'confessions'])
-    expect(MODES_FOR_PILL.commentary).toEqual(['bible', 'confessions'])
+    expect(MODES_FOR_PILL.commentary).toEqual(['bible', 'confessions', 'fathers'])
     expect(MODES_FOR_PILL.notes).toEqual([])
     expect(MODES_FOR_PILL.books).toEqual([])
   })
```

**Create `src/renderer/src/lib/fathersCatena.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { resolveCatenaTarget } from './fathersCatena'

describe('resolveCatenaTarget', () => {
  const lookup = { book: 'JHN', chapter: 3, verse: 16 }

  it('uses the clicked verse when the reader is still on its chapter', () => {
    expect(resolveCatenaTarget(lookup, { book: 'JHN', chapter: 3 })).toEqual({ book: 'JHN', chapter: 3, verse: 16 })
  })

  it('uses the clicked verse when no Bible passage is open', () => {
    expect(resolveCatenaTarget(lookup, null)).toEqual({ book: 'JHN', chapter: 3, verse: 16 })
  })

  it('follows the open chapter at chapter level when the clicked verse is elsewhere', () => {
    expect(resolveCatenaTarget(lookup, { book: 'JHN', chapter: 4 })).toEqual({ book: 'JHN', chapter: 4, verse: null })
    expect(resolveCatenaTarget(lookup, { book: 'ROM', chapter: 3 })).toEqual({ book: 'ROM', chapter: 3, verse: null })
  })

  it('shows the open chapter when nothing was clicked', () => {
    expect(resolveCatenaTarget(null, { book: 'ROM', chapter: 8 })).toEqual({ book: 'ROM', chapter: 8, verse: null })
  })

  it('has no target with neither a click nor an open passage', () => {
    expect(resolveCatenaTarget(null, null)).toBeNull()
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/renderer/src/lib/corpusMode.test.ts src/renderer/src/lib/fathersCatena.test.ts`
Expected: FAIL — `modeForTabKind('fathers')` is `null`, `MODES_FOR_PILL` lacks `fathers`, `./fathersCatena` cannot be resolved.

- [ ] **Step 3: Implement the mode logic**

**Edit `src/renderer/src/lib/corpusMode.ts`** (context lines locate each change; line numbers are indicative only)

```diff
--- a/src/renderer/src/lib/corpusMode.ts
+++ b/src/renderer/src/lib/corpusMode.ts
@@ -1,16 +1,17 @@
 /** Which corpus a multi-mode reference panel is currently showing. */
-export type CorpusMode = 'books' | 'bible' | 'confessions'
+export type CorpusMode = 'books' | 'bible' | 'confessions' | 'fathers'
 
 /** The five reference-panel pills. */
 export type RefPill = 'quotes' | 'notes' | 'books' | 'texts' | 'commentary'
 
 /** Modes each pill can offer. An empty list means the pill is single-mode and shows no switch. */
 export const MODES_FOR_PILL: Record<RefPill, CorpusMode[]> = {
-  quotes: ['books', 'bible', 'confessions'],
+  quotes: ['books', 'bible', 'confessions', 'fathers'],
   notes: [],
   books: [],
   texts: ['bible', 'confessions'],
-  commentary: ['bible', 'confessions']
+  // Commentary/fathers is the catena: the Fathers on the Bible passage you are reading.
+  commentary: ['bible', 'confessions', 'fathers']
 }
 
 /** The corpus implied by a focused centre tab, or null for tabs that have none. */
@@ -18,6 +19,7 @@
   if (kind === 'pdf') return 'books'
   if (kind === 'bible') return 'bible'
   if (kind === 'boc') return 'confessions'
+  if (kind === 'fathers') return 'fathers'
   return null
 }
 
```

**Create `src/renderer/src/lib/fathersCatena.ts`**

```ts
export interface CatenaTarget {
  /** USFM code. */
  book: string
  chapter: number
  /** null = the whole chapter. */
  verse: number | null
}

/**
 * Which passage the Fathers catena should show. A clicked verse (`commentaryLookup`, the same
 * trigger Bible commentary uses) wins — but only while it is still in the chapter the reader is
 * on; once the reader moves to another chapter the catena follows it at chapter level rather
 * than showing a stale verse. With nothing clicked and no Bible open there is no target.
 */
export function resolveCatenaTarget(
  lookup: { book: string; chapter: number; verse: number } | null,
  passage: { book: string; chapter: number } | null
): CatenaTarget | null {
  if (lookup && (!passage || (passage.book === lookup.book && passage.chapter === lookup.chapter))) {
    return { book: lookup.book, chapter: lookup.chapter, verse: lookup.verse }
  }
  if (passage) return { book: passage.book, chapter: passage.chapter, verse: null }
  return null
}
```

- [ ] **Step 4: Run them**

Run: `npx vitest run src/renderer/src/lib/corpusMode.test.ts src/renderer/src/lib/fathersCatena.test.ts`
Expected: PASS — corpusMode 12 tests, fathersCatena 5 tests.

- [ ] **Step 5: Store changes**

**Edit `src/renderer/src/store/useStore.ts`** (context lines locate each change; line numbers are indicative only)

```diff
--- a/src/renderer/src/store/useStore.ts
+++ b/src/renderer/src/store/useStore.ts
@@ -16,6 +16,7 @@
   BocCommentaryMatch,
   BocQuoteInput,
   CommentaryMatch,
+  FathersQuoteInput,
   ImportProgress,
   ImportResult,
   NewQuote,
@@ -275,6 +279,8 @@
   // --- Reference panel pins ---
   /** Pin a reference pill to a corpus mode. Persisted to the session store. */
   setRefMode: (pill: RefPill, mode: CorpusMode) => void
+  /** Capture a selection from a Church Fathers section as a quote. */
+  addFathersQuote: (input: FathersQuoteInput) => Promise<void>
 
   // --- Book of Concord (Confessions) ---
   /** Route a document/section into a BoC pane: reuse the existing BoC pane if there is one,
@@ -499,7 +518,7 @@
       await Promise.all(
         (['quotes', 'texts', 'commentary'] as RefPill[]).map(async (pill) => {
           const v = await api.getSession(`refMode:${pill}`)
-          if (v === 'books' || v === 'bible' || v === 'confessions') pins[pill] = v
+          if (v === 'books' || v === 'bible' || v === 'confessions' || v === 'fathers') pins[pill] = v
         })
       )
       set({ refModes: pins })
@@ -969,8 +988,9 @@
       set({ commentaryMatches: matches })
       get().saveLayout({ activeRightTab: 'commentary', notesCollapsed: false })
       // A click on a verse is a request for *this* passage's commentary — more specific than
-      // whatever the pill was pinned to, so it re-pins.
-      get().setRefMode('commentary', 'bible')
+      // whatever the pill was pinned to, so it re-pins. Except a pin on Fathers: the catena
+      // follows the same click (it reads `commentaryLookup`), so leave it be.
+      if (get().refModes.commentary !== 'fathers') get().setRefMode('commentary', 'bible')
     },
 
     showScripture: async () => {
@@ -1047,6 +1067,12 @@
       void api.setSession(`refMode:${pill}`, mode)
     },
 
+    addFathersQuote: async (input) => {
+      await api.addFathersQuote(input)
+      // Bump the shared token so the Quotes panel reloads.
+      set({ noteReloadToken: get().noteReloadToken + 1 })
+    },
+
     // --- Book of Concord (Confessions) ---
     // In-place navigation, like navigateScripture: if the active tab is already showing the BoC
     // reader, it navigates there. Only explicit "open" actions create a new tab.
```

- [ ] **Step 6: Switch label and the two panels**

**Edit `src/renderer/src/components/library/CorpusSwitch.tsx`** (context lines locate each change; line numbers are indicative only)

```diff
--- a/src/renderer/src/components/library/CorpusSwitch.tsx
+++ b/src/renderer/src/components/library/CorpusSwitch.tsx
@@ -5,7 +5,8 @@
 const MODE_LABELS: Record<CorpusMode, string> = {
   books: 'Books',
   bible: 'Bible',
-  confessions: 'Confessions'
+  confessions: 'Confessions',
+  fathers: 'Fathers'
 }
 
 /** The mode a pill should show, plus the setter that pins it. Auto-follows the focused centre
```

**Create `src/renderer/src/components/library/FathersCatenaPanel.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { api } from '../../lib/api'
import { resolveCatenaTarget } from '../../lib/fathersCatena'
import { FATHERS_SERIES_LABEL } from '@shared/fathers'
import { bookByCode } from '@shared/scriptureRef'
import type { FathersCatenaGroup } from '@shared/ipc'

/** The Commentary pill's Fathers mode: a catena — what the Church Fathers say on the Bible
 *  passage you are reading, grouped by verse and ordered by author date. It follows the same
 *  trigger as Bible commentary (the last verse clicked), falling back to the open chapter. */
export function FathersCatenaPanel() {
  const lookup = useStore((s) => s.commentaryLookup)
  const passage = useStore((s) => s.scripturePassage)
  const navigateFathers = useStore((s) => s.navigateFathers)

  const target = resolveCatenaTarget(lookup, passage)
  const key = target ? `${target.book}|${target.chapter}|${target.verse ?? ''}` : ''
  const [groups, setGroups] = useState<FathersCatenaGroup[] | null>(null)

  useEffect(() => {
    if (!target) {
      setGroups(null)
      return
    }
    let alive = true
    setGroups(null)
    void api
      .fathersCatena(target.book, target.chapter, target.verse)
      .then((g) => {
        if (alive) setGroups(g)
      })
      .catch(() => {
        if (alive) setGroups([])
      })
    return () => {
      alive = false
    }
    // `key` captures every field of `target` that matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  if (!target) {
    return <div className="quotes-empty">Open a Bible chapter, or click a verse, to see what the Fathers say.</div>
  }

  const bookName = bookByCode(target.book)?.name ?? target.book
  const headLabel = `${bookName} ${target.chapter}${target.verse != null ? `:${target.verse}` : ''}`

  return (
    <div className="fathers-catena">
      <div className="fathers-catena-head">Fathers on {headLabel}</div>
      {groups === null ? (
        <div className="sr-loading" style={{ height: 'auto', padding: 12 }}>
          <Loader2 size={16} className="spin" /> Loading…
        </div>
      ) : groups.length === 0 ? (
        <div className="quotes-empty">
          No Fathers cite {headLabel} in the indexed volumes.
        </div>
      ) : (
        groups.map((g) => (
          <div key={g.verse ?? 'chapter'} className="fathers-catena-group">
            {(target.verse == null || groups.length > 1) && (
              <div className="fathers-catena-verse">{g.label}</div>
            )}
            {g.entries.map((e) => (
              <button
                key={`${e.volumeCode}|${e.sectionId}`}
                className="fathers-catena-entry"
                title="Open in the Church Fathers reader"
                onClick={() => navigateFathers(e.volumeCode, e.sectionId)}
              >
                <div className="fathers-catena-who">
                  <span className="fathers-catena-author">{e.authorName ?? 'Unattributed'}</span>
                  {e.datesLabel && <span className="fathers-dates"> {e.datesLabel}</span>}
                </div>
                <div className="fathers-catena-work">
                  {e.workTitle ? `${e.workTitle} — ` : ''}
                  {e.sectionTitle}
                </div>
                <div className="fathers-catena-snippet">{e.snippet}</div>
                <div className="fathers-catena-meta">
                  {FATHERS_SERIES_LABEL[e.series]} {e.volumeNumber}
                  {e.page ? `, p. ${e.page}` : ''} · {e.passage}
                  {e.inNote ? ' · in a footnote' : ''}
                </div>
              </button>
            ))}
          </div>
        ))
      )}
    </div>
  )
}
```

**Create `src/renderer/src/components/library/FathersQuotesPanel.tsx`**

```tsx
import { useCallback, useEffect, useState } from 'react'
import { Landmark } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { api } from '../../lib/api'
import { fathersVolumeLabel } from '@shared/fathers'
import type { FathersVolume, Quote } from '@shared/ipc'
import { QuoteCard, makeQuoteCardHandlers } from './QuotesPanel'

/**
 * Church Fathers quotes, location-anchored like BocQuotesPanel: it follows the focused Fathers
 * tab's volume (or whichever volume you pick) and lists that volume's saved quotes. Quotes carry
 * their own citation ("Irenaeus, *Against Heresies* III.3 (ANF 1:415)"), so book is null.
 */
export function FathersQuotesPanel() {
  const tabs = useStore((s) => s.tabs)
  const paneOrder = useStore((s) => s.paneOrder)
  const activePaneId = useStore((s) => s.activePaneId)
  const noteReloadToken = useStore((s) => s.noteReloadToken)

  const focusedTabId = paneOrder.find((p) => p.id === activePaneId)?.activeTabId
  const focusedTab = tabs.find((t) => t.id === focusedTabId)

  const [volumes, setVolumes] = useState<FathersVolume[]>([])
  const [volumeCode, setVolumeCode] = useState<string>('')
  const [quotes, setQuotes] = useState<Quote[]>([])

  useEffect(() => {
    void api.listFathersVolumes().then((v) => {
      const indexed = v.filter((x) => x.status === 'indexed')
      setVolumes(indexed)
      setVolumeCode((cur) => cur || indexed[0]?.code || '')
    })
  }, [])

  // Follow the focused Fathers tab's volume.
  useEffect(() => {
    if (focusedTab?.kind === 'fathers' && focusedTab.fathersVolume) setVolumeCode(focusedTab.fathersVolume)
  }, [focusedTab?.kind, focusedTab?.fathersVolume])

  const reload = useCallback(async () => {
    setQuotes(volumeCode ? await api.listFathersQuotes(volumeCode) : [])
  }, [volumeCode])

  useEffect(() => {
    void reload()
  }, [reload, noteReloadToken])

  const handlers = makeQuoteCardHandlers({
    setQuotes,
    refresh: reload,
    onDelete: (id) => void api.deleteQuote(id).then(reload)
  })

  if (volumes.length === 0) {
    return <div className="quotes-empty">No Church Fathers volumes indexed yet.</div>
  }

  return (
    <div className="quotes-list">
      <div className="qn-head">
        <Landmark size={14} />
        <select className="book-select" value={volumeCode} onChange={(e) => setVolumeCode(e.target.value)}>
          {volumes.map((v) => (
            <option key={v.code} value={v.code}>
              {fathersVolumeLabel(v.code)} — {v.title}
            </option>
          ))}
        </select>
      </div>
      {quotes.length === 0 ? (
        <div className="quotes-empty">
          No quotes from {fathersVolumeLabel(volumeCode)} yet. Select text in the Church Fathers reader and
          pick a colour to capture it here.
        </div>
      ) : (
        quotes.map((q) => <QuoteCard key={q.id} q={q} book={null} style="footnote" handlers={handlers} />)
      )}
    </div>
  )
}
```

**Edit `src/renderer/src/components/library/CommentaryReferencePanel.tsx`** (context lines locate each change; line numbers are indicative only)

```diff
--- a/src/renderer/src/components/library/CommentaryReferencePanel.tsx
+++ b/src/renderer/src/components/library/CommentaryReferencePanel.tsx
@@ -2,14 +2,22 @@
 import { CorpusSwitch, useCorpusMode } from './CorpusSwitch'
 import { CommentaryPanel } from './CommentaryPanel'
 import { BocCommentaryPanel } from './BocCommentaryPanel'
+import { FathersCatenaPanel } from './FathersCatenaPanel'
 
-/** The Commentary pill: commentary for the last verse or section clicked. */
+/** The Commentary pill: commentary for the last verse or section clicked — or, in Fathers mode,
+ *  the catena of what the Church Fathers say on the open passage. */
 export function CommentaryReferencePanel(): ReactNode {
   const { mode } = useCorpusMode('commentary')
   return (
     <div className="ref-corpus-panel">
       <CorpusSwitch pill="commentary" />
-      {mode === 'confessions' ? <BocCommentaryPanel /> : <CommentaryPanel />}
+      {mode === 'confessions' ? (
+        <BocCommentaryPanel />
+      ) : mode === 'fathers' ? (
+        <FathersCatenaPanel />
+      ) : (
+        <CommentaryPanel />
+      )}
     </div>
   )
 }
```

**Edit `src/renderer/src/components/library/QuotesReferencePanel.tsx`** (context lines locate each change; line numbers are indicative only)

```diff
--- a/src/renderer/src/components/library/QuotesReferencePanel.tsx
+++ b/src/renderer/src/components/library/QuotesReferencePanel.tsx
@@ -3,6 +3,7 @@
 import { QuotesPanel } from './QuotesPanel'
 import { ScriptureHighlightsPanel } from './ScriptureHighlightsPanel'
 import { BocQuotesPanel } from './BocQuotesPanel'
+import { FathersQuotesPanel } from './FathersQuotesPanel'
 
 /** The Quotes pill: quotes for whatever you have open, per corpus. */
 export function QuotesReferencePanel(): ReactNode {
@@ -14,6 +15,8 @@
         <ScriptureHighlightsPanel />
       ) : mode === 'confessions' ? (
         <BocQuotesPanel />
+      ) : mode === 'fathers' ? (
+        <FathersQuotesPanel />
       ) : (
         <QuotesPanel />
       )}
```

- [ ] **Step 7: Wire quote capture in the pane**

**Edit `src/renderer/src/components/library/FathersPane.tsx`**

Find:

```tsx
  const showPassageInTexts = useStore((s) => s.showPassageInTexts)
```

Replace with:

```tsx
  const showPassageInTexts = useStore((s) => s.showPassageInTexts)
  const addFathersQuote = useStore((s) => s.addFathersQuote)
```

Find:

```tsx
        onAuthor={(id) => openFathersAuthor(id)}
        compact
```

Replace with:

```tsx
        onAuthor={(id) => openFathersAuthor(id)}
        onQuote={(q) =>
          void addFathersQuote({
            volumeCode,
            sectionId,
            page: q.page,
            paragraph: q.paragraph,
            text: q.text,
            color: q.color
          })
        }
        compact
```

- [ ] **Step 8: Catena styles**

**Append to the end of `src/renderer/src/styles/app.css`**

```css
/* Catena (Commentary pill, Fathers mode) */
.fathers-catena {
  padding: 8px 10px 20px;
}
.fathers-catena-head {
  margin-bottom: 8px;
  color: var(--gold);
  font-family: var(--font-title);
  font-size: 12px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.fathers-catena-verse {
  margin: 12px 0 4px;
  color: var(--muted);
  font-family: var(--font-ui);
  font-size: 11.5px;
  font-weight: 600;
}
.fathers-catena-entry {
  display: block;
  width: 100%;
  margin-bottom: 6px;
  padding: 8px 10px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text);
  text-align: left;
  cursor: pointer;
}
.fathers-catena-entry:hover {
  border-color: var(--accent);
}
.fathers-catena-author {
  font-family: var(--font-ui);
  font-size: 12.5px;
  font-weight: 600;
}
.fathers-catena-work {
  margin-top: 1px;
  color: var(--muted);
  font-family: var(--font-ui);
  font-size: 11.5px;
}
.fathers-catena-snippet {
  margin: 5px 0;
  font-family: var(--font-read);
  font-size: 13.5px;
  line-height: 1.5;
}
.fathers-catena-meta {
  color: var(--muted);
  font-family: var(--font-ui);
  font-size: 10.5px;
}
```

- [ ] **Step 9: Typecheck, run all tests, commit**

```bash
npm run typecheck
npm test
git add src/renderer/src/lib/corpusMode.ts src/renderer/src/lib/corpusMode.test.ts src/renderer/src/lib/fathersCatena.ts src/renderer/src/lib/fathersCatena.test.ts src/renderer/src/store/useStore.ts src/renderer/src/components/library/CorpusSwitch.tsx src/renderer/src/components/library/CommentaryReferencePanel.tsx src/renderer/src/components/library/QuotesReferencePanel.tsx src/renderer/src/components/library/FathersCatenaPanel.tsx src/renderer/src/components/library/FathersQuotesPanel.tsx src/renderer/src/components/library/FathersPane.tsx src/renderer/src/styles/app.css
git commit -m "feat(fathers): catena in the Commentary pill and Fathers quotes in the Quotes pill" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Search — Fathers kind, hits open the reader at the section (model: haiku)

**Files:**
- Modify: `src/renderer/src/components/library/SearchView.tsx`, `src/renderer/src/components/library/SearchResults.tsx`

**Interfaces:**
- Consumes: `SearchKind`/`SearchHit.kind` `'father'` and the FTS rows (Task 4); `navigateFathers` (Task 9); `fathersVolumeLabel` (Task 2). Hit shape: `bookId` = volume code, `ref` = CCEL section id, `page` = numeric start page or `null`, `title` = short title.
- Produces: a **Fathers** scope button; Fathers hits grouped per volume (titled `ANF 1`, `NPNF¹ 4`, …, with the Landmark icon rather than a book cover), each row labelled `<section title> · p. N`; clicking a hit calls `navigateFathers(volumeCode, sectionId)`.

The backend half (FTS rows, `search(…, { kind: 'father' })`) is already tested in Task 4; this task is UI only, verified by typecheck and the manual checklist.

- [ ] **Step 1: Scope button and hit handler**

**Edit `src/renderer/src/components/library/SearchView.tsx`** (context lines locate each change; line numbers are indicative only)

```diff
--- a/src/renderer/src/components/library/SearchView.tsx
+++ b/src/renderer/src/components/library/SearchView.tsx
@@ -11,7 +11,8 @@
   { id: 'quote', label: 'Quotes' },
   { id: 'note', label: 'Notes' },
   { id: 'scripture', label: 'Scripture' },
-  { id: 'confession', label: 'Confessions' }
+  { id: 'confession', label: 'Confessions' },
+  { id: 'father', label: 'Fathers' }
 ]
 
 export function SearchView({ compact = false }: { compact?: boolean }) {
@@ -31,6 +32,7 @@
   const openNote = useStore((s) => s.openNote)
   const navigateScripture = useStore((s) => s.navigateScripture)
   const navigateBoc = useStore((s) => s.navigateBoc)
+  const navigateFathers = useStore((s) => s.navigateFathers)
   const setActiveHit = useStore((s) => s.setActiveHit)
   const markCameFromSearch = useStore((s) => s.markCameFromSearch)
   const indexing = useStore((s) => s.indexing)
@@ -64,6 +66,9 @@
       // ref is "<document code>:<section ordinal>" (formatBocRef); bookId is the BoC source id.
       const parsed = parseBocRef(h.ref)
       if (parsed) navigateBoc(parsed.code, parsed.ordinal, h.bookId ?? undefined)
+    } else if (h.kind === 'father' && h.bookId && h.ref) {
+      // bookId is the volume code ('anf01'), ref the CCEL section id (indexFathersForSearch).
+      navigateFathers(h.bookId, h.ref)
     }
   }
 
```

- [ ] **Step 2: Group, title and label Fathers hits**

**Edit `src/renderer/src/components/library/SearchResults.tsx`** (context lines locate each change; line numbers are indicative only)

```diff
--- a/src/renderer/src/components/library/SearchResults.tsx
+++ b/src/renderer/src/components/library/SearchResults.tsx
@@ -1,13 +1,15 @@
 import { useEffect, useRef, useState } from 'react'
-import { BookOpen, FileText, ScrollText, ChevronRight, ChevronDown } from 'lucide-react'
+import { BookOpen, FileText, ScrollText, ChevronRight, ChevronDown, Landmark } from 'lucide-react'
 import { useStore } from '../../store/useStore'
 import { api } from '../../lib/api'
 import { getCachedCover, setCachedCover } from '../../lib/coverCache'
 import { bocDocument, parseBocRef } from '@shared/bookOfConcord'
+import { fathersVolumeLabel } from '@shared/fathers'
 import type { Book, SearchHit } from '@shared/ipc'
 
-/** Group hits by book (page/quote), by BoC document (confession), by chapter ref (scripture), or bundle notes together. */
+/** Group hits by book (page/quote), by BoC document (confession), by Fathers volume (father), by chapter ref (scripture), or bundle notes together. */
 function groupKeyFor(h: SearchHit): string {
+  if (h.kind === 'father') return `f:${h.bookId ?? ''}`
   if (h.kind === 'confession') return `c:${parseBocRef(h.ref ?? '')?.code ?? h.bookId ?? ''}`
   if (h.bookId) return `b:${h.bookId}`
   if (h.kind === 'scripture' && h.ref) return `s:${h.ref}`
@@ -59,7 +61,15 @@
   if (src) return <img className="hit-thumb" src={src} alt="" draggable={false} />
   return (
     <div className="hit-thumb hit-thumb-fallback">
-      {bookId ? <BookOpen size={15} /> : kind === 'scripture' || kind === 'confession' ? <ScrollText size={15} /> : <FileText size={15} />}
+      {bookId ? (
+        <BookOpen size={15} />
+      ) : kind === 'father' ? (
+        <Landmark size={15} />
+      ) : kind === 'scripture' || kind === 'confession' ? (
+        <ScrollText size={15} />
+      ) : (
+        <FileText size={15} />
+      )}
     </div>
   )
 }
@@ -112,15 +122,18 @@
     let g = byKey.get(key)
     if (!g) {
       // Confession hits carry a BoC source id in bookId (not a library book), so title them by document.
+      // Fathers hits carry a volume code in bookId (not a library book): title the group by volume.
       const title =
-        h.kind === 'confession'
+        h.kind === 'father'
+          ? fathersVolumeLabel(h.bookId ?? '')
+          : h.kind === 'confession'
           ? (bocDocument(parseBocRef(h.ref ?? '')?.code ?? '')?.title ?? h.title)
           : h.bookId
             ? (books.find((b) => b.id === h.bookId)?.title ?? h.title)
             : h.kind === 'scripture'
               ? h.title
               : 'Notes'
-      g = { key, title, bookId: h.kind === 'confession' ? null : h.bookId, kind: h.kind, items: [] }
+      g = { key, title, bookId: h.kind === 'confession' || h.kind === 'father' ? null : h.bookId, kind: h.kind, items: [] }
       byKey.set(key, g)
       groups.push(g)
     }
@@ -139,6 +152,7 @@
     if (h.kind === 'note') return h.title || 'Note'
     if (h.kind === 'scripture') return h.page != null ? `v. ${h.page}` : '—'
     if (h.kind === 'confession') return h.title || 'Section'
+    if (h.kind === 'father') return `${h.title || 'Section'}${h.page != null ? ` · p. ${h.page}` : ''}`
     if (h.page != null) {
       // Show the book's printed page (PDF page minus its front-matter offset).
       const book = books.find((b) => b.id === h.bookId)
```

- [ ] **Step 3: Typecheck, run the renderer tests, commit**

```bash
npm run typecheck
npx vitest run src/renderer
git add src/renderer/src/components/library/SearchView.tsx src/renderer/src/components/library/SearchResults.tsx
git commit -m "feat(fathers): Fathers search scope; hits open the reader at the section" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Final verification and hand-over (model: haiku)

**Files:** none changed (unless verification finds a defect — fix it in the task that owns the file and re-run).

**Interfaces:** consumes everything above; produces the install steps and the manual checklist for the user. **Do not launch the app and do not copy files into the real vault** (memory: the user performs every live check; the sandbox sees a virtualized AppData).

- [ ] **Step 1: Full automated verification**

```bash
npm run typecheck
npm test
node tools/validate-thml.mjs .firecrawl/ccel --strict
git status --short
```

Expected: typecheck silent; `npm test` all green (the suite was 293 tests / 31 files with this feature when the plan was written, before Task 7's data additions — new totals will be slightly higher only if the data task added tests); validator exit 0 with `Undated authors: none`; `git status` shows only the pre-existing unrelated untracked files (`*.tsbuildinfo`, the other plan) — nothing from this feature uncommitted.

- [ ] **Step 2: Production build sanity (bundles `saxes` into the main process)**

Run: `npm run build`
Expected: typecheck passes and `electron-vite build` finishes with no errors (output goes to the git-ignored `out/`). If it fails to resolve `saxes`, confirm it is under `dependencies` (not `devDependencies`) in `package.json`.

- [ ] **Step 3: Hand the user the install steps and the checklist (paste both into your final message)**

Install the volumes into the real vault (PowerShell, run by the user — all 38 volumes are already in `D:\Code\Loci\.firecrawl\ccel`):

```powershell
New-Item -ItemType Directory -Force "$env:APPDATA\Loci\vault\fathers" | Out-Null
Copy-Item D:\Code\Loci\.firecrawl\ccel\*.xml "$env:APPDATA\Loci\vault\fathers\"
Get-ChildItem "$env:APPDATA\Loci\vault\fathers" | Measure-Object   # expect Count = 38
```

(Volumes can also be fetched individually from `https://www.ccel.org/ccel/s/schaff/<code>.xml` — codes `anf01`–`anf10`, `npnf101`–`npnf114`, `npnf201`–`npnf214`. CCEL permits personal / non-profit use.) Then start Loci with `npm run dev`; indexing begins ~3.5 s after launch, takes roughly 1–2 minutes for all 38, and the Fathers drawer fills in as volumes finish.

Manual checklist for the user:

1. **Startup indexing.** Launch with the 38 files in place. App stays responsive. Open **Church Fathers** (rail, Landmark icon): the drawer lists ANF, NPNF¹, NPNF² volumes, each "(indexing…)" at first, then ready; no ⚠ rows.
2. **Error handling.** Put a junk file named `anf99.xml` (any text) in the folder and relaunch: the drawer shows `anf99` with ⚠ and the error text on click; every other volume is unaffected. Delete it afterwards.
3. **Volumes tree.** Expand ANF 1: author groups (Clement of Rome, …, Irenaeus) containing works containing sections; "Editor" tags on introductory notes/prefaces; clicking a section opens it in the reader; prev/next buttons walk the volume.
4. **Authors view.** Toggle **Authors**: authors ordered by date with dates beside the names; none undated except pseudo-authors; clicking one shows name, dates, bio and works across volumes; clicking a work opens its first section.
5. **Reader.** Open ANF 1 → Irenaeus → *Against Heresies* Book III. Text is readable (small caps, italics, line/verse blocks). Faint margin labels `p. 414`, `p. 415`… appear where the printed pages turn; the header shows the start page. Footnote markers (`¹`) open a popover with the note; a Scripture link inside the popover works; clicking elsewhere closes it.
6. **Scripture links.** Click a dotted-underlined reference (e.g. `1 Pet. v. 1-5`): the right panel switches to **Texts → Bible** at that passage with the verses highlighted. Click a second one: it navigates. A deuterocanonical reference (Sir., Wisd.) is plain text, not a link.
7. **Quotes.** Select a sentence in the reader → colour swatches → pick one. The right panel **Quotes → Fathers** shows the quote with the citation `Irenaeus, *Against Heresies* III.3 (ANF 1:415)` (page matching the margin label at the start of your selection). A file `notes/fathers/Irenaeus.md` exists in the vault with the quote block. Delete the quote; the file disappears.
8. **Catena.** Open John 3 in Scripture and click verse 16. Right panel → **Commentary → Fathers** (the switch): "Fathers on John 3:16" with entries ordered by author date (Justin/Irenaeus before Augustine…), each with snippet, volume/page, passage, and "in a footnote" where applicable. Click an entry: the Fathers tab opens at that section. Click another verse: the catena updates and the pill stays on Fathers. With no verse clicked, the catena shows the open chapter grouped by verse.
9. **Pill following.** Focus a Fathers tab with the Commentary/Quotes pills unpinned: both switch to Fathers automatically; Texts stays on Bible/Confessions.
10. **Search.** Search view → **Fathers** scope → search `apostolic succession` (or any phrase): hits grouped per volume ("ANF 1"), rows show section title and `p. N`; clicking a hit opens the reader at that section. **All** scope includes Fathers hits.
11. **Persistence.** Close and reopen the app: the Fathers tab restores on the same section; the rail entry resumes where you left off; drawer collapse state and Volumes/Authors choice are remembered.
12. **Confessions/Bible unaffected.** Open a Book of Concord document and a Bible chapter; their panels, commentary and quotes behave as before.

- [ ] **Step 4: Report**

Report: tasks completed, test/typecheck/build results, the validator's final summary, and any checklist item you could not verify automatically (all of 1–12 are manual).

---

## Self-review

**Spec coverage**

| Spec requirement | Task |
|---|---|
| Read + full-text search | 4 (FTS rows), 8–9 (reader/drawer), 11 (search UI) |
| Scripture cross-references (osisRef → structured refs) | 2, 3, 4, 8 (click → Texts), 5/10 (catena) |
| Footnotes (popover) + original page numbers | 3 (notes, pages, startPage), 8 |
| Quotes from selected text | 6, 8, 10 |
| Catena (grouped by verse, ordered by date) | 5 (query), 10 (panel) |
| Author view (dates + works across volumes) | 1/7 (table), 5 (`getAuthor`), 9 |
| ThML parser interfaces + rules (SAX, sections, parent text, refs, notes, pb, index dropped, allow-list, editorial, never throws on content) | 3 |
| Data model (six tables + quotes columns) | 1; FTS `kind='father'` fields | 4 |
| `syncFathersFolder`, per-volume transaction, error status, shared `shouldReindex` | 4 |
| Left-rail entry, `showFathers`, `lastFathers` | 9 |
| `CorpusMode` fathers, `MODES_FOR_PILL` additions | 10 |
| Citation format and `notes/fathers/<author>.md` | 6 |
| `SearchKind` += `father`; hits open the tab | 4 (type), 11 |
| Errors: malformed file, bad osisRef counted, undated author last | 4, 3, 5 (`listAuthors` ordering), 7 |
| `tools/validate-thml.mjs` | 7 |
| Tests: parser, index (in-memory SQLite), catena date ordering | 3, 4, 5 |
| Live GUI checks by the user | 12 |

**Placeholder scan:** none — every code step shows complete code (generated from the verified tree); the only non-code step is the author-table data entry in Task 7, which gives the exact procedure, entry format, ids and the machine check that decides when it is done.

**Type consistency:** names used across tasks are the ones defined where each is introduced — `parseOsisRef`/`OsisPassage` (2), `ThmlSection`/`ThmlRef.inNote`/`startPage` (3), `correctedAuthor`/`seedFathersAuthors`/`FATHERS_AUTHOR_OVERRIDES` (1), `writeFathersVolume`/`syncFathersFolder` (4), `FathersSection`/`FathersCatenaGroup`/`citeMeta` (5), `fathersCitation`/`FathersQuoteInput` (6), `FathersQuoteCapture` (8), `navigateFathers`/`openFathersAuthor`/`showFathers`/`showPassageInTexts`/`refBibleTarget` (9), `addFathersQuote` (store, 10). Task order keeps every file compiling at each commit: the Fathers pane (9) only imports the reader (8); the quote store action and the pane's `onQuote` wiring arrive together (10); `SearchKind` is widened in 4, before its UI in 11.
