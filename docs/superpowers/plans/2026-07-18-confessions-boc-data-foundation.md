# Confessions (Book of Concord) — Plan 1: Data Foundation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the backend that lets the app ingest, store, look up, and search Book of Concord (BoC) primary text and per-article commentary — no UI yet, everything provable by `vitest`.

**Architecture:** Mirror the existing Bible + Commentary backend. A static compiled document/article table (`bookOfConcord.ts`, like `scriptureRef.ts`'s `BOOKS`), a new SQLite migration (four tables in the shape of `commentary_sources`/`commentary_excerpts`), a pure Markdown parser (`parseBocMarkdown`, like `parseCommentaryMarkdown`), a query service (`boc.ts`, like `commentary.ts`), a vault-folder indexer (`bocIndex.ts`, like `commentaryIndex.ts`), search indexing, and the IPC surface.

**Tech Stack:** TypeScript, Electron (main/preload/renderer split), `better-sqlite3`, `vitest` (logic-level, in-memory DB via `vi.mock('../db/connection')`).

## This is Plan 1 of 3

The full Confessions feature (spec: `docs/superpowers/specs/2026-07-18-confessions-boc-design.md`) is delivered in three sequential plans, each independently testable:

- **Plan 1 — Data Foundation (this document):** static table, migration, parser, service, indexer, search indexing, IPC. Deliverable: drop a BoC Markdown file in the vault → it indexes → articles and commentary are queryable and searchable. Proven by tests + a manual IPC smoke check.
- **Plan 2 — Reader & Nav (future):** `'boc'` pane kind + store, `BocReader`, `BocLibraryView`, left-nav wiring, `ReferenceBocPanel`, the `CommentaryPanel` parameterization, notes, `bocCitation()`, the quotes migration + highlight-to-quote flow. Deliverable: you can read the Book of Concord in the app with translations, commentary, notes, and citeable highlights.
- **Plan 3 — Full Integration Surfaces (future):** `PanePicker`, search filter UI + result grouping, Projects (`ProjectItem`), drag-and-drop, and the shared `contentKindIcon()`/`kindLabel()` refactor. Deliverable: BoC appears everywhere other content kinds do.

Plan 2 and Plan 3 depend on interfaces locked here (the `boc.ts` service signatures, the `BocDocumentCode` type, the ref-string format). They are written after Plan 1 lands so their file/line references are real.

## Global Constraints

- **Migration discipline:** append new migrations to the `migrations` array in `src/main/db/migrations.ts`; never edit a shipped migration. The next free version is **18** (current max is 17). The index is rebuildable from the vault, so forward-only is fine.
- **Test command:** the whole suite runs via `npm test` (→ `node scripts/test-native.mjs`). A single file runs via `npx vitest run <path>`; a single test via `npx vitest run <path> -t "<name>"`.
- **DB test harness:** unit tests never touch Electron. Use an in-memory DB and mock the connection module, exactly as `src/main/services/commentary.test.ts:14-17` does:
  ```ts
  vi.mock('../db/connection', () => ({ getDb: () => db, getDataDir: () => dataDir }))
  ```
  with `db = new Database(':memory:'); db.pragma('foreign_keys = ON'); runMigrations(db)` in `beforeEach`.
- **Pure parsers:** parsing/format logic lives in pure, I/O-free functions so it is directly unit-testable (the `parseCommentaryMarkdown` precedent).
- **Ref-string format (canonical, used across all three plans):** a BoC reference is `"<CODE>:<ordinal>"`, e.g. `"AC:4"`. The display form (`"AC IV"`) is resolved through `BOC_DOCUMENTS` and is never stored.
- **Article ordinals are the storage/query key.** All DB columns store the integer `ordinal`; Roman-numeral / part-qualified display strings live only in `BOC_DOCUMENTS`.
- **Document codes:** `CR-AP` (Apostles' Creed), `CR-NI` (Nicene Creed), `CR-ATH` (Athanasian Creed), `AC`, `AP`, `SA`, `TR`, `SC`, `LC`, `FC-EP`, `FC-SD`.

---

## File Structure

- **Create** `src/shared/bookOfConcord.ts` — static `BOC_DOCUMENTS` table + pure helpers (`bocDocument`, `bocArticle`, `documentCodeFromName`, `parseBocRef`, `formatBocRef`). Shared by main + renderer, no I/O.
- **Create** `src/shared/bookOfConcord.test.ts` — table-integrity + helper tests.
- **Modify** `src/main/db/migrations.ts` — append migration v18 (four BoC tables).
- **Modify** `src/main/db/migrations.test.ts` if it exists, else assert schema inside the service test.
- **Create** `src/main/services/bocMarkdown.ts` — pure `parseBocMarkdown(markdown)` → `BocChunk[]`.
- **Create** `src/main/services/bocMarkdown.test.ts`.
- **Create** `src/main/services/boc.ts` — source/text/commentary CRUD + `lookupBocArticle` + `getArticle`.
- **Create** `src/main/services/boc.test.ts`.
- **Create** `src/main/services/bocIndex.ts` — `syncBocFolder`, `indexBocSource` (vault → DB).
- **Create** `src/main/services/bocIndex.test.ts`.
- **Modify** `src/main/services/search.ts` — add `'confession'` `SearchKind`, index/remove BoC rows.
- **Modify** `src/main/services/search.test.ts` if it exists, else create `src/main/services/search.boc.test.ts`.
- **Modify** `src/shared/ipc.ts` — `Channels` entries + `Api` methods for BoC lookup/list/index.
- **Modify** `src/preload/index.ts` — preload bindings.
- **Modify** `src/main/ipc/index.ts` — `ipcMain.handle` registrations.
- **Modify** `src/main/index.ts` — call `syncBocFolder()` on startup (next to `syncCommentaryFolder`).
- **Create** `tools/boc-epub-to-md.mjs` (Task 8) — offline converter producing the documented Markdown contract.

---

## Task 1: Static Book of Concord table

**Files:**
- Create: `src/shared/bookOfConcord.ts`
- Test: `src/shared/bookOfConcord.test.ts`

**Interfaces:**
- Produces:
  - `type BocDocumentCode = 'CR-AP'|'CR-NI'|'CR-ATH'|'AC'|'AP'|'SA'|'TR'|'SC'|'LC'|'FC-EP'|'FC-SD'`
  - `interface BocArticleDef { ordinal: number; number: string; label: string }`
  - `interface BocDocumentDef { code: BocDocumentCode; title: string; abbreviation: string; sortOrder: number; articles: BocArticleDef[] }`
  - `const BOC_DOCUMENTS: BocDocumentDef[]`
  - `function bocDocument(code: string): BocDocumentDef | undefined`
  - `function bocArticle(code: string, ordinal: number): BocArticleDef | undefined`
  - `function documentCodeFromName(name: string): BocDocumentCode | undefined` (matches title or abbreviation, case-insensitive)
  - `function parseBocRef(ref: string): { code: BocDocumentCode; ordinal: number } | null` (parses `"AC:4"`)
  - `function formatBocRef(code: BocDocumentCode, ordinal: number): string` (returns `"AC:4"`)

- [ ] **Step 1: Write the failing test**

Create `src/shared/bookOfConcord.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  BOC_DOCUMENTS,
  bocDocument,
  bocArticle,
  documentCodeFromName,
  parseBocRef,
  formatBocRef
} from './bookOfConcord'

describe('BOC_DOCUMENTS table integrity', () => {
  it('has all 11 documents with unique codes and sortOrders', () => {
    const codes = BOC_DOCUMENTS.map((d) => d.code)
    expect(codes).toEqual([
      'CR-AP', 'CR-NI', 'CR-ATH', 'AC', 'AP', 'SA', 'TR', 'SC', 'LC', 'FC-EP', 'FC-SD'
    ])
    expect(new Set(codes).size).toBe(codes.length)
    const orders = BOC_DOCUMENTS.map((d) => d.sortOrder)
    expect(new Set(orders).size).toBe(orders.length)
  })

  it('gives every document a contiguous 1-based ordinal sequence', () => {
    for (const doc of BOC_DOCUMENTS) {
      expect(doc.articles.length).toBeGreaterThan(0)
      doc.articles.forEach((a, i) => expect(a.ordinal).toBe(i + 1))
    }
  })

  it('gives the Augsburg Confession its 28 articles', () => {
    expect(bocDocument('AC')?.articles.length).toBe(28)
    expect(bocArticle('AC', 4)?.label).toMatch(/justif/i)
    expect(bocArticle('AC', 4)?.number).toBe('IV')
  })
})

describe('helpers', () => {
  it('resolves a document by title or abbreviation, case-insensitively', () => {
    expect(documentCodeFromName('Augsburg Confession')).toBe('AC')
    expect(documentCodeFromName('augsburg confession')).toBe('AC')
    expect(documentCodeFromName('AC')).toBe('AC')
    expect(documentCodeFromName('Nicene Creed')).toBe('CR-NI')
    expect(documentCodeFromName('nonsense')).toBeUndefined()
  })

  it('round-trips a ref string', () => {
    expect(formatBocRef('AC', 4)).toBe('AC:4')
    expect(parseBocRef('AC:4')).toEqual({ code: 'AC', ordinal: 4 })
    expect(parseBocRef('AC:0')).toBeNull()
    expect(parseBocRef('ZZ:4')).toBeNull()
    expect(parseBocRef('garbage')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/shared/bookOfConcord.test.ts`
Expected: FAIL — `Cannot find module './bookOfConcord'`.

- [ ] **Step 3: Write the implementation**

Create `src/shared/bookOfConcord.ts`. Author the full table. The three creeds, the Augsburg Confession (28 articles), the Smalcald Articles, the Treatise, the catechisms, and the Formula (Epitome + Solid Declaration, 12 articles each) are authored here. **Author each document's article list against a printed Book of Concord (Kolb-Wengert or Tappert) and confirm the counts** — the test above pins AC=28 and the contiguous-ordinal rule; add equivalent count assertions per document as you author them. Part-structured documents (Smalcald Articles Parts I–III; the catechisms' chief parts) are flattened into one ordinal run per document, with the part encoded in the `number`/`label` display strings (e.g. `{ ordinal: 5, number: 'III.1', label: 'Part III, Article 1: Sin' }`).

```ts
// Book of Concord reference grammar — shared by main (index/lookup) and renderer
// (reader + citation). Pure, no I/O. Mirrors scriptureRef.ts's BOOKS table.
//
// The document/article structure is fixed across translations, so it's authored once
// here. All storage/lookup uses the integer `ordinal`; the Roman-numeral / part-qualified
// `number` string is display-only.

export type BocDocumentCode =
  | 'CR-AP' | 'CR-NI' | 'CR-ATH'
  | 'AC' | 'AP' | 'SA' | 'TR' | 'SC' | 'LC' | 'FC-EP' | 'FC-SD'

export interface BocArticleDef {
  /** 1-based position within the document — the DB/lookup key. */
  ordinal: number
  /** Display numbering: Roman numeral, or part-qualified (e.g. "III.1"). Never stored. */
  number: string
  label: string
}

export interface BocDocumentDef {
  code: BocDocumentCode
  title: string
  abbreviation: string
  /** Order in the Book of Concord (creeds first). */
  sortOrder: number
  articles: BocArticleDef[]
}

// Helper: build a plain Roman-numeral article run from [label, label, …].
const roman = ['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII','XIII','XIV',
  'XV','XVI','XVII','XVIII','XIX','XX','XXI','XXII','XXIII','XXIV','XXV','XXVI','XXVII','XXVIII']
function articles(labels: string[]): BocArticleDef[] {
  return labels.map((label, i) => ({ ordinal: i + 1, number: roman[i] ?? String(i + 1), label }))
}

export const BOC_DOCUMENTS: BocDocumentDef[] = [
  { code: 'CR-AP', title: "Apostles' Creed", abbreviation: 'Ap. Creed', sortOrder: 1,
    articles: articles(['The First Article', 'The Second Article', 'The Third Article']) },
  { code: 'CR-NI', title: 'Nicene Creed', abbreviation: 'Nic. Creed', sortOrder: 2,
    articles: articles(['The First Article', 'The Second Article', 'The Third Article']) },
  { code: 'CR-ATH', title: 'Athanasian Creed', abbreviation: 'Ath. Creed', sortOrder: 3,
    // The Athanasian Creed is traditionally numbered as 40+ verses, not articles;
    // author the ordinal run to match the chosen edition's verse numbering.
    articles: articles(['…author per edition…']) },
  { code: 'AC', title: 'Augsburg Confession', abbreviation: 'AC', sortOrder: 4,
    articles: articles([
      'Of God', 'Of Original Sin', 'Of the Son of God', 'Of Justification',
      'Of the Ministry', 'Of the New Obedience', 'Of the Church',
      'What the Church Is', 'Of Baptism', "Of the Lord's Supper", 'Of Confession',
      'Of Repentance', 'Of the Use of the Sacraments', 'Of Ecclesiastical Order',
      'Of Ecclesiastical Usages', 'Of Civil Affairs', "Of Christ's Return to Judgment",
      'Of Free Will', 'Of the Cause of Sin', 'Of Good Works', 'Of the Worship of the Saints',
      'Of Both Kinds in the Sacrament', 'Of the Marriage of Priests', 'Of the Mass',
      'Of Confession', 'Of the Distinction of Meats', 'Of Monastic Vows',
      'Of Ecclesiastical Power'
    ]) },
  // AP, SA, TR, SC, LC, FC-EP, FC-SD — author each against the printed Book of Concord,
  // flattening parts into one ordinal run per document as described above. Each gets a
  // count assertion in the test file.
]

const byCode = new Map(BOC_DOCUMENTS.map((d) => [d.code, d]))

export function bocDocument(code: string): BocDocumentDef | undefined {
  return byCode.get(code as BocDocumentCode)
}

export function bocArticle(code: string, ordinal: number): BocArticleDef | undefined {
  return bocDocument(code)?.articles.find((a) => a.ordinal === ordinal)
}

export function documentCodeFromName(name: string): BocDocumentCode | undefined {
  const n = name.trim().toLowerCase()
  const hit = BOC_DOCUMENTS.find(
    (d) => d.title.toLowerCase() === n || d.abbreviation.toLowerCase() === n || d.code.toLowerCase() === n
  )
  return hit?.code
}

export function formatBocRef(code: BocDocumentCode, ordinal: number): string {
  return `${code}:${ordinal}`
}

export function parseBocRef(ref: string): { code: BocDocumentCode; ordinal: number } | null {
  const m = /^([A-Z-]+):(\d+)$/.exec(ref.trim())
  if (!m) return null
  const doc = bocDocument(m[1])
  const ordinal = Number(m[2])
  if (!doc || ordinal < 1 || !doc.articles.some((a) => a.ordinal === ordinal)) return null
  return { code: doc.code, ordinal }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/shared/bookOfConcord.test.ts`
Expected: PASS. (The `CR-ATH` placeholder article list still satisfies the contiguous-ordinal rule; replace `'…author per edition…'` with the real verse list before Step 5.)

- [ ] **Step 5: Author the remaining documents and their count assertions**

Fill in `AP`, `SA`, `TR`, `SC`, `LC`, `FC-EP`, `FC-SD` and the Athanasian Creed's real numbering. For each, add a count assertion to the test file mirroring the AC one (e.g. `expect(bocDocument('FC-EP')?.articles.length).toBe(12)`). Re-run the test file; expected PASS with no `'…author per edition…'` strings remaining.

- [ ] **Step 6: Commit**

```bash
git add src/shared/bookOfConcord.ts src/shared/bookOfConcord.test.ts
git commit -m "Add static Book of Concord document/article table"
```

---

## Task 2: Database migration (BoC tables)

**Files:**
- Modify: `src/main/db/migrations.ts` (append after the v17 object at line ~336)
- Test: `src/main/services/boc.test.ts` (created here; the migration is asserted via its schema)

**Interfaces:**
- Produces four tables: `boc_sources`, `boc_texts`, `boc_commentary_sources`, `boc_commentary_excerpts`, at `user_version = 18`.

- [ ] **Step 1: Write the failing test**

Create `src/main/services/boc.test.ts` with only the schema check for now:

```ts
import Database from 'better-sqlite3'
import { describe, expect, it, beforeEach } from 'vitest'
import { runMigrations } from '../db/migrations'

let db: Database.Database
beforeEach(() => {
  db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
})

describe('migration v18', () => {
  it('creates the four BoC tables and reaches version 18+', () => {
    expect(db.pragma('user_version', { simple: true })).toBeGreaterThanOrEqual(18)
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((r: any) => r.name)
    expect(tables).toContain('boc_sources')
    expect(tables).toContain('boc_texts')
    expect(tables).toContain('boc_commentary_sources')
    expect(tables).toContain('boc_commentary_excerpts')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/services/boc.test.ts`
Expected: FAIL — tables not found.

- [ ] **Step 3: Append the migration**

In `src/main/db/migrations.ts`, add after the version-17 object (before the closing `]` at line 337):

```ts
  ,{
    version: 18,
    name: 'book-of-concord',
    up: (db) => {
      // Book of Concord: primary text (one row per translation × document × article) and
      // per-article commentary, both rebuildable from the vault. Mirrors the commentary
      // tables but keyed to (document_code, article ordinal) instead of USFM book +
      // chapter/verse. Kept as separate tables so Bible-only invariants (66-book bounds,
      // testament grouping) never see a BoC document code.
      db.exec(`
        CREATE TABLE boc_sources (
          id                  TEXT PRIMARY KEY,
          display_name        TEXT NOT NULL,
          author              TEXT,
          md_relative_path    TEXT NOT NULL UNIQUE,
          sort_order          INTEGER NOT NULL DEFAULT 0,
          indexed_at          TEXT,
          status              TEXT NOT NULL DEFAULT 'unindexed'
        );

        CREATE TABLE boc_texts (
          id               TEXT PRIMARY KEY,
          source_id        TEXT NOT NULL REFERENCES boc_sources(id) ON DELETE CASCADE,
          document_code    TEXT NOT NULL,
          article_ordinal  INTEGER NOT NULL,
          text             TEXT NOT NULL
        );
        CREATE UNIQUE INDEX idx_boc_texts_key ON boc_texts(source_id, document_code, article_ordinal);
        CREATE INDEX idx_boc_texts_lookup ON boc_texts(document_code, article_ordinal);

        CREATE TABLE boc_commentary_sources (
          id                  TEXT PRIMARY KEY,
          display_name        TEXT NOT NULL,
          author              TEXT,
          md_relative_path    TEXT NOT NULL UNIQUE,
          sort_order          INTEGER NOT NULL DEFAULT 0,
          indexed_at          TEXT,
          status              TEXT NOT NULL DEFAULT 'unindexed'
        );

        CREATE TABLE boc_commentary_excerpts (
          id               TEXT PRIMARY KEY,
          source_id        TEXT NOT NULL REFERENCES boc_commentary_sources(id) ON DELETE CASCADE,
          document_code    TEXT NOT NULL,
          article_start    INTEGER NOT NULL,
          article_end      INTEGER NOT NULL,
          text             TEXT NOT NULL,
          header_raw       TEXT
        );
        CREATE INDEX idx_boc_excerpts_lookup ON boc_commentary_excerpts(document_code, article_start, article_end);
        CREATE INDEX idx_boc_excerpts_source ON boc_commentary_excerpts(source_id);
      `)
    }
  }
```

(Note: the leading `,` joins the previous array element. If you prefer, drop the leading comma and add a trailing comma to the v17 object instead — match whichever the surrounding code uses.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/main/services/boc.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/db/migrations.ts src/main/services/boc.test.ts
git commit -m "Add Book of Concord DB migration (v18)"
```

---

## Task 3: Markdown parser (`parseBocMarkdown`)

**Files:**
- Create: `src/main/services/bocMarkdown.ts`
- Test: `src/main/services/bocMarkdown.test.ts`

**Interfaces:**
- Consumes: `documentCodeFromName` from `../../shared/bookOfConcord`.
- Produces:
  - `interface BocChunk { documentCode: BocDocumentCode; articleStart: number; articleEnd: number; text: string; headerRaw: string }`
  - `function parseBocMarkdown(markdown: string): BocChunk[]`

**Markdown contract** (the tested seam between the converter and the app):
```
# Augsburg Confession        <- level-1 heading sets the current document (name or code)
## 1                         <- an article ordinal opens an excerpt; body runs to next heading
## 1-3                       <- an ordinal range is allowed (article_start..article_end)
```
A `##` heading that isn't an integer or integer-range, under a known document, ends the current chunk without opening a new one (matches `parseCommentaryMarkdown`'s stray-heading handling). Text before the first article is dropped as front matter.

- [ ] **Step 1: Write the failing test**

Create `src/main/services/bocMarkdown.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { parseBocMarkdown } from './bocMarkdown'

describe('parseBocMarkdown', () => {
  it('parses documents and single-article excerpts', () => {
    const md = [
      '# Augsburg Confession',
      '## 1',
      'Our churches teach that there is one divine essence…',
      '## 2',
      'Original sin is truly sin…'
    ].join('\n')
    const chunks = parseBocMarkdown(md)
    expect(chunks).toEqual([
      { documentCode: 'AC', articleStart: 1, articleEnd: 1,
        text: 'Our churches teach that there is one divine essence…', headerRaw: '1' },
      { documentCode: 'AC', articleStart: 2, articleEnd: 2,
        text: 'Original sin is truly sin…', headerRaw: '2' }
    ])
  })

  it('parses an article range', () => {
    const chunks = parseBocMarkdown('# Augsburg Confession\n## 22-24\nCovered together.')
    expect(chunks[0]).toMatchObject({ documentCode: 'AC', articleStart: 22, articleEnd: 24 })
  })

  it('switches documents on a new level-1 heading', () => {
    const chunks = parseBocMarkdown('# Nicene Creed\n## 1\nA\n# Augsburg Confession\n## 1\nB')
    expect(chunks.map((c) => c.documentCode)).toEqual(['CR-NI', 'AC'])
  })

  it('drops front matter and stray headings, and ignores unknown documents', () => {
    expect(parseBocMarkdown('preamble\n## 1\nno document set yet')).toEqual([])
    const chunks = parseBocMarkdown('# Augsburg Confession\n## 1\nA\n## Notes\nstray\n## 2\nB')
    expect(chunks.map((c) => c.articleStart)).toEqual([1, 2])
    expect(chunks[0].text).toBe('A')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/services/bocMarkdown.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `src/main/services/bocMarkdown.ts`:

```ts
import { documentCodeFromName, type BocDocumentCode } from '../../shared/bookOfConcord'

/** One article-keyed BoC chunk (primary text or commentary body). Pure output of
 *  parseBocMarkdown; the indexer supplies the file text and persists the result. */
export interface BocChunk {
  documentCode: BocDocumentCode
  articleStart: number
  articleEnd: number
  text: string
  headerRaw: string
}

const HEADING_RE = /^(#{1,6})\s+(.*\S)\s*$/
const ARTICLE_RE = /^(\d+)(?:-(\d+))?$/

export function parseBocMarkdown(markdown: string): BocChunk[] {
  let document: BocDocumentCode | null = null
  const chunks: BocChunk[] = []
  let current: BocChunk | null = null

  const flush = (): void => {
    if (current) {
      current.text = current.text.trim()
      chunks.push(current)
      current = null
    }
  }

  for (const rawLine of markdown.split(/\r?\n/)) {
    const heading = HEADING_RE.exec(rawLine)
    if (!heading) {
      if (current) current.text += (current.text ? '\n' : '') + rawLine
      continue
    }
    const level = heading[1].length
    const content = heading[2].trim()

    if (level === 1) {
      flush()
      document = documentCodeFromName(content) ?? null
      continue
    }

    // level >= 2: an article ordinal / range opens an excerpt against the current document.
    const m = ARTICLE_RE.exec(content)
    if (document && m) {
      flush()
      const start = Number(m[1])
      const end = m[2] ? Number(m[2]) : start
      current = { documentCode: document, articleStart: start, articleEnd: end, text: '', headerRaw: content }
      continue
    }

    // Stray heading (a section title, or an ordinal with no document set): end the current
    // excerpt so its title doesn't leak into the previous article; open nothing.
    flush()
  }

  flush()
  return chunks
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/main/services/bocMarkdown.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/services/bocMarkdown.ts src/main/services/bocMarkdown.test.ts
git commit -m "Add pure Book of Concord Markdown parser"
```

---

## Task 4: Query service (`boc.ts`)

**Files:**
- Create: `src/main/services/boc.ts`
- Test: extend `src/main/services/boc.test.ts` (created in Task 2)

**Interfaces:**
- Consumes: `getDb` from `../db/connection`; `crypto.randomUUID`; `BocSource` and `BocCommentaryMatch` imported from `../../shared/ipc` (defined there in Step 3 below, next to `CommentaryMatch` at `ipc.ts:699` — this matches how `commentary.ts:10-14` imports `CommentaryMatch` from `ipc.ts`, keeping the types on the renderer-reachable side of the main/renderer boundary).
- Produces (types, added to `src/shared/ipc.ts`):
  - `interface BocSource { id: string; displayName: string; author: string | null; mdRelativePath: string; sortOrder: number; status: string }`
  - `interface BocCommentaryMatch { excerptId: string; sourceId: string; sourceDisplayName: string; sourceAuthor: string | null; sortOrder: number; text: string; articleStart: number; articleEnd: number }`
- Produces (functions, in `boc.ts`):
  - `createSource(input): BocSource` and `createCommentarySource(input): BocSource`
  - `replaceTexts(sourceId, chunks: { documentCode; articleStart; articleEnd; text }[]): void` (writes one `boc_texts` row per ordinal in each chunk's range)
  - `replaceCommentaryExcerpts(sourceId, chunks): void`
  - `getArticle(documentCode, ordinal, sourceId): string | null`
  - `listSources(): BocSource[]` and `listCommentarySources(): BocSource[]`
  - `lookupBocArticle(documentCode: string, ordinal: number): BocCommentaryMatch[]`

- [ ] **Step 1: Write the failing tests**

Append to `src/main/services/boc.test.ts` (after the migration `describe`). First add the connection mock at the top of the file — insert these lines **above** the existing `import { runMigrations }` line and adjust imports:

```ts
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, vi } from 'vitest'

let dataDir: string
vi.mock('../db/connection', () => ({ getDb: () => db, getDataDir: () => dataDir }))
```

Extend `beforeEach`/`afterEach` to set `dataDir = mkdtempSync(join(tmpdir(), 'loci-boc-'))` and `rmSync(dataDir, { recursive: true, force: true })`. Then add:

```ts
import * as boc from './boc'

describe('boc service', () => {
  it('stores texts per ordinal and reads one back', () => {
    const src = boc.createSource({ displayName: "Reader's Edition", author: 'CPH', mdRelativePath: 're.md' })
    boc.replaceTexts(src.id, [
      { documentCode: 'AC', articleStart: 1, articleEnd: 1, text: 'One divine essence.' },
      { documentCode: 'AC', articleStart: 2, articleEnd: 2, text: 'Original sin.' }
    ])
    expect(boc.getArticle('AC', 1, src.id)).toBe('One divine essence.')
    expect(boc.getArticle('AC', 99, src.id)).toBeNull()
  })

  it('expands an article range into one text row per ordinal', () => {
    const src = boc.createSource({ displayName: 'T', author: null, mdRelativePath: 't.md' })
    boc.replaceTexts(src.id, [{ documentCode: 'AC', articleStart: 22, articleEnd: 24, text: 'Shared.' }])
    expect(boc.getArticle('AC', 22, src.id)).toBe('Shared.')
    expect(boc.getArticle('AC', 24, src.id)).toBe('Shared.')
  })

  it('looks up commentary whose range covers an article, ordered by source sort_order', () => {
    const a = boc.createCommentarySource({ displayName: 'A', author: null, mdRelativePath: 'a.md', sortOrder: 1 })
    const b = boc.createCommentarySource({ displayName: 'B', author: null, mdRelativePath: 'b.md', sortOrder: 0 })
    boc.replaceCommentaryExcerpts(a.id, [{ documentCode: 'AC', articleStart: 1, articleEnd: 5, text: 'A on 1-5', headerRaw: '1-5' }])
    boc.replaceCommentaryExcerpts(b.id, [{ documentCode: 'AC', articleStart: 4, articleEnd: 4, text: 'B on 4', headerRaw: '4' }])
    const matches = boc.lookupBocArticle('AC', 4)
    expect(matches.map((m) => m.text)).toEqual(['B on 4', 'A on 1-5'])
    expect(boc.lookupBocArticle('AC', 10)).toEqual([])
  })

  it('replaceTexts is idempotent for a source (re-index replaces, not appends)', () => {
    const src = boc.createSource({ displayName: 'T', author: null, mdRelativePath: 't2.md' })
    boc.replaceTexts(src.id, [{ documentCode: 'AC', articleStart: 1, articleEnd: 1, text: 'first' }])
    boc.replaceTexts(src.id, [{ documentCode: 'AC', articleStart: 1, articleEnd: 1, text: 'second' }])
    expect(boc.getArticle('AC', 1, src.id)).toBe('second')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/main/services/boc.test.ts`
Expected: FAIL — `./boc` not found.

- [ ] **Step 3: Write the implementation**

First add the two interfaces to `src/shared/ipc.ts`, next to `CommentaryMatch` (line 699):

```ts
export interface BocSource {
  id: string
  displayName: string
  author: string | null
  mdRelativePath: string
  sortOrder: number
  status: string
}

export interface BocCommentaryMatch {
  excerptId: string
  sourceId: string
  sourceDisplayName: string
  sourceAuthor: string | null
  sortOrder: number
  text: string
  articleStart: number
  articleEnd: number
}
```

Then create `src/main/services/boc.ts`:

```ts
import { randomUUID } from 'crypto'
import { getDb } from '../db/connection'
import type { BocSource, BocCommentaryMatch } from '../../shared/ipc'

interface NewSource {
  displayName: string
  author: string | null
  mdRelativePath: string
  sortOrder?: number
}

interface TextChunk { documentCode: string; articleStart: number; articleEnd: number; text: string }
interface CommentaryChunk extends TextChunk { headerRaw: string }

function insertSource(table: 'boc_sources' | 'boc_commentary_sources', input: NewSource): BocSource {
  const id = randomUUID()
  getDb()
    .prepare(`INSERT INTO ${table} (id, display_name, author, md_relative_path, sort_order) VALUES (?, ?, ?, ?, ?)`)
    .run(id, input.displayName, input.author, input.mdRelativePath, input.sortOrder ?? 0)
  return { id, displayName: input.displayName, author: input.author, mdRelativePath: input.mdRelativePath, sortOrder: input.sortOrder ?? 0, status: 'unindexed' }
}

export function createSource(input: NewSource): BocSource {
  return insertSource('boc_sources', input)
}
export function createCommentarySource(input: NewSource): BocSource {
  return insertSource('boc_commentary_sources', input)
}

export function replaceTexts(sourceId: string, chunks: TextChunk[]): void {
  const db = getDb()
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM boc_texts WHERE source_id = ?').run(sourceId)
    const ins = db.prepare(
      'INSERT OR REPLACE INTO boc_texts (id, source_id, document_code, article_ordinal, text) VALUES (?, ?, ?, ?, ?)'
    )
    for (const c of chunks) {
      for (let ord = c.articleStart; ord <= c.articleEnd; ord++) {
        ins.run(randomUUID(), sourceId, c.documentCode, ord, c.text)
      }
    }
  })
  tx()
}

export function replaceCommentaryExcerpts(sourceId: string, chunks: CommentaryChunk[]): void {
  const db = getDb()
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM boc_commentary_excerpts WHERE source_id = ?').run(sourceId)
    const ins = db.prepare(
      `INSERT INTO boc_commentary_excerpts (id, source_id, document_code, article_start, article_end, text, header_raw)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    for (const c of chunks) {
      ins.run(randomUUID(), sourceId, c.documentCode, c.articleStart, c.articleEnd, c.text, c.headerRaw)
    }
  })
  tx()
}

export function getArticle(documentCode: string, ordinal: number, sourceId: string): string | null {
  const row = getDb()
    .prepare('SELECT text FROM boc_texts WHERE document_code = ? AND article_ordinal = ? AND source_id = ?')
    .get(documentCode, ordinal, sourceId) as { text: string } | undefined
  return row?.text ?? null
}

function listFrom(table: 'boc_sources' | 'boc_commentary_sources'): BocSource[] {
  return (getDb()
    .prepare(`SELECT id, display_name, author, md_relative_path, sort_order, status FROM ${table} ORDER BY sort_order, display_name`)
    .all() as any[])
    .map((r) => ({ id: r.id, displayName: r.display_name, author: r.author, mdRelativePath: r.md_relative_path, sortOrder: r.sort_order, status: r.status }))
}

export function listSources(): BocSource[] { return listFrom('boc_sources') }
export function listCommentarySources(): BocSource[] { return listFrom('boc_commentary_sources') }

export function lookupBocArticle(documentCode: string, ordinal: number): BocCommentaryMatch[] {
  const rows = getDb()
    .prepare(
      `SELECT e.id, e.source_id, s.display_name, s.author, s.sort_order,
              e.text, e.article_start, e.article_end
       FROM boc_commentary_excerpts e
       JOIN boc_commentary_sources s ON s.id = e.source_id
       WHERE e.document_code = ? AND e.article_start <= ? AND e.article_end >= ?
       ORDER BY s.sort_order, e.article_start`
    )
    .all(documentCode, ordinal, ordinal) as any[]
  return rows.map((r) => ({
    excerptId: r.id, sourceId: r.source_id, sourceDisplayName: r.display_name,
    sourceAuthor: r.author, sortOrder: r.sort_order, text: r.text,
    articleStart: r.article_start, articleEnd: r.article_end
  }))
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/main/services/boc.test.ts`
Expected: PASS (all describes).

- [ ] **Step 5: Commit**

```bash
git add src/main/services/boc.ts src/main/services/boc.test.ts
git commit -m "Add Book of Concord query service (texts + commentary lookup)"
```

---

## Task 5: Vault indexer (`bocIndex.ts`)

**Files:**
- Create: `src/main/services/bocIndex.ts`
- Test: `src/main/services/bocIndex.test.ts`

**Interfaces:**
- Consumes: `parseBocMarkdown` (Task 3); `boc.ts` service (Task 4); `getDb`, `getDataDir` from `../db/connection`; new folder accessors added to `../services/config`.
- Produces:
  - In `src/main/services/config.ts`, two new accessors modeled exactly on `commentaryVaultDir()` (line 63): `bocVaultDir()` → `join(localVaultDir(), 'confessions')` and `bocCommentaryVaultDir()` → `join(localVaultDir(), 'confessions-commentary')`.
  - `interface BocIndexSummary { textRows: number; excerptRows: number }`
  - `async function indexBocText(sourceId: string, absPath: string): Promise<BocIndexSummary>`
  - `async function indexBocCommentary(sourceId: string, absPath: string): Promise<BocIndexSummary>`
  - `async function syncBocFolder(): Promise<void>` — scan `bocVaultDir()` (primary text) and `bocCommentaryVaultDir()` (commentary), register unseen files, (re)index by mtime.

The vault layout is settled: `commentaryVaultDir()` in `src/main/services/config.ts:63` returns `join(localVaultDir(), 'commentaries')`, and `localVaultDir()` (line 57) is `join(getDataDir(), 'vault')`. The two BoC folders are siblings of `commentaries/` under the same vault. `syncBocFolder` mirrors `syncCommentaryFolder` in `commentaryIndex.ts:64` (same mtime-skip via `loadIndexMtimes`, same createSource-on-first-sight). Read that function fully before writing.

- [ ] **Step 1: Write the failing test**

Create `src/main/services/bocIndex.test.ts` using the in-memory-DB + mock pattern, writing a temp `.md` file and asserting rows land:

```ts
import Database from 'better-sqlite3'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { runMigrations } from '../db/migrations'

let db: Database.Database
let vaultDir: string

// indexBocText takes an absolute path directly, so the vault-dir accessor doesn't matter
// for this test — mock only what boc.ts needs. (syncBocFolder's folder-scan test, added
// alongside, additionally sets getDataDir so join(getDataDir(),'vault','confessions') resolves
// into a temp dir the test populates.)
vi.mock('../db/connection', () => ({ getDb: () => db, getDataDir: () => vaultDir }))

beforeEach(() => {
  db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
  vaultDir = mkdtempSync(join(tmpdir(), 'loci-boc-vault-'))
})
afterEach(() => rmSync(vaultDir, { recursive: true, force: true }))

import * as boc from './boc'
import { indexBocText } from './bocIndex'

describe('indexBocText', () => {
  it('parses a file and writes text rows', async () => {
    const src = boc.createSource({ displayName: 'RE', author: null, mdRelativePath: 'confessions/re.md' })
    const p = join(vaultDir, 're.md')
    writeFileSync(p, '# Augsburg Confession\n## 1\nOne divine essence.\n## 2\nOriginal sin.')
    const summary = await indexBocText(src.id, p)
    expect(summary.textRows).toBe(2)
    expect(boc.getArticle('AC', 1, src.id)).toBe('One divine essence.')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/services/bocIndex.test.ts`
Expected: FAIL — `./bocIndex` not found.

- [ ] **Step 3: Write the implementation**

Create `src/main/services/bocIndex.ts`. Model `syncBocFolder` on `commentaryIndex.ts`'s `syncCommentaryFolder` (read that file first for the exact fs/mtime/registration idiom). Minimum for the test:

```ts
import { readFile } from 'fs/promises'
import { parseBocMarkdown } from './bocMarkdown'
import { replaceTexts, replaceCommentaryExcerpts } from './boc'

export interface BocIndexSummary { textRows: number; excerptRows: number }

export async function indexBocText(sourceId: string, absPath: string): Promise<BocIndexSummary> {
  const md = await readFile(absPath, 'utf8')
  const chunks = parseBocMarkdown(md)
  replaceTexts(sourceId, chunks.map((c) => ({
    documentCode: c.documentCode, articleStart: c.articleStart, articleEnd: c.articleEnd, text: c.text
  })))
  const textRows = chunks.reduce((n, c) => n + (c.articleEnd - c.articleStart + 1), 0)
  return { textRows, excerptRows: 0 }
}

export async function indexBocCommentary(sourceId: string, absPath: string): Promise<BocIndexSummary> {
  const md = await readFile(absPath, 'utf8')
  const chunks = parseBocMarkdown(md)
  replaceCommentaryExcerpts(sourceId, chunks)
  return { textRows: 0, excerptRows: chunks.length }
}

// syncBocFolder(): discover/register/re-index the two vault folders. Mirror
// syncCommentaryFolder in commentaryIndex.ts — same mtime > indexed_at skip logic,
// same createSource-on-first-sight registration, then call indexBocText /
// indexBocCommentary and stamp indexed_at. Left to implement against that file's
// exact accessors.
export async function syncBocFolder(): Promise<void> {
  // …author following commentaryIndex.ts…
}
```

Implement `syncBocFolder` fully following the commentary precedent (don't ship the stub). Add a test for it mirroring `commentaryIndex.test.ts` if that file demonstrates the folder-scan assertions.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/main/services/bocIndex.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire startup sync**

In `src/main/index.ts`, next to the existing `syncCommentaryFolder` call (line ~145), add:

```ts
import { syncBocFolder } from './services/bocIndex'
// …
  setTimeout(() => void syncBocFolder().catch(() => {}), 2500)
```

- [ ] **Step 6: Commit**

```bash
git add src/main/services/bocIndex.ts src/main/services/bocIndex.test.ts src/main/index.ts
git commit -m "Add Book of Concord vault indexer + startup sync"
```

---

## Task 6: Search indexing for BoC content

**Files:**
- Modify: `src/shared/ipc.ts` (`SearchKind` union, line ~524)
- Modify: `src/main/services/search.ts` (add index/remove for the `'confession'` kind)
- Test: create `src/main/services/search.boc.test.ts`

**Interfaces:**
- Consumes: the `search_fts` table (existing) and its `kind`/`ref` columns; `boc.ts` data.
- Produces: `'confession'` added to `SearchKind`; `indexBocForSearch(sourceId)` / `removeBocFromSearch(sourceId)` (match the naming of the existing per-kind functions in `search.ts` — read the file first and mirror them exactly).

Read `src/main/services/search.ts` end-to-end first. It defines the FTS `kind` literals and per-kind index/remove helpers; add a `'confession'` branch that indexes each `boc_texts` row's `text` with `kind = 'confession'` and `ref = formatBocRef(documentCode, ordinal)`. Wire the index call into `indexBocText` (Task 5) so re-indexing a source refreshes its search rows.

- [ ] **Step 1: Write the failing test**

Create `src/main/services/search.boc.test.ts` mirroring the in-memory-DB harness. Insert a `boc_texts` row via the `boc` service, call the new index function, then assert `search(query, { kind: 'confession' })` (or the service's search entry point — confirm its name in `search.ts`) returns the row. Model the assertions on how `commentary` content is asserted in the existing search tests if present; otherwise assert directly against `search_fts`.

```ts
// harness identical to boc.test.ts (in-memory db + connection mock) …
import * as boc from './boc'
import { indexBocForSearch } from './search'

it('indexes BoC text into search_fts under the confession kind', () => {
  const src = boc.createSource({ displayName: 'RE', author: null, mdRelativePath: 're.md' })
  boc.replaceTexts(src.id, [{ documentCode: 'AC', articleStart: 4, articleEnd: 4, text: 'Justification by faith alone' }])
  indexBocForSearch(src.id)
  const rows = db.prepare("SELECT ref FROM search_fts WHERE kind = 'confession' AND search_fts MATCH 'justification'").all()
  expect(rows).toContainEqual({ ref: 'AC:4' })
})
```

(Adjust the assertion to `search_fts`'s real column set — check whether `ref` is a stored column or reconstructed; the existing commentary indexing in `search.ts` is the template.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/services/search.boc.test.ts`
Expected: FAIL — `indexBocForSearch` not exported.

- [ ] **Step 3: Add `'confession'` to `SearchKind` and implement indexing**

In `src/shared/ipc.ts` extend the union (line ~524): `export type SearchKind = 'all' | 'page' | 'quote' | 'note' | 'scripture' | 'confession'`. In `src/main/services/search.ts` add `indexBocForSearch` / `removeBocFromSearch` following the existing per-kind helpers, and include `'confession'` wherever the `kind` filter is applied.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/main/services/search.boc.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire the index call into the indexer and commit**

Call `indexBocForSearch(sourceId)` at the end of `indexBocText` (Task 5's file). Re-run `npx vitest run src/main/services/bocIndex.test.ts src/main/services/search.boc.test.ts`; expected PASS.

```bash
git add src/shared/ipc.ts src/main/services/search.ts src/main/services/search.boc.test.ts src/main/services/bocIndex.ts
git commit -m "Index Book of Concord text into full-text search"
```

---

## Task 7: IPC surface

**Files:**
- Modify: `src/shared/ipc.ts` (`Channels` map ~line 86; `Api` interface ~line 331)
- Modify: `src/preload/index.ts` (~line 99)
- Modify: `src/main/ipc/index.ts` (~line 357)

**Interfaces:**
- Produces on `window.api`:
  - `lookupBocArticle(documentCode: string, ordinal: number): Promise<BocCommentaryMatch[]>`
  - `getBocArticle(documentCode: string, ordinal: number, sourceId: string): Promise<string | null>`
  - `listBocSources(): Promise<BocSource[]>`
  - `listBocCommentarySources(): Promise<BocSource[]>`

Read the three files' commentary entries first (`lookupCommentary` is the exact template across all three) and mirror them. `BocSource`/`BocCommentaryMatch` already live in `src/shared/ipc.ts` (added in Task 4), so both the `Api` interface here and the renderer consumers in Plan 2 can import them directly — the same arrangement as `CommentaryMatch`.

- [ ] **Step 1: Add the channel constants**

In `src/shared/ipc.ts` `Channels`:

```ts
  lookupBocArticle: 'boc:lookupArticle',
  getBocArticle: 'boc:getArticle',
  listBocSources: 'boc:listSources',
  listBocCommentarySources: 'boc:listCommentarySources',
```

- [ ] **Step 2: Add the `Api` methods**

In the `Api` interface (mirror the `lookupCommentary` line), using the shared types:

```ts
  lookupBocArticle(documentCode: string, ordinal: number): Promise<BocCommentaryMatch[]>
  getBocArticle(documentCode: string, ordinal: number, sourceId: string): Promise<string | null>
  listBocSources(): Promise<BocSource[]>
  listBocCommentarySources(): Promise<BocSource[]>
```

`BocSource` and `BocCommentaryMatch` were already added to `ipc.ts` in Task 4 Step 3, so they're in scope here — no new type definitions needed.

- [ ] **Step 3: Add the preload bindings**

In `src/preload/index.ts` (mirror `lookupCommentary`):

```ts
  lookupBocArticle: (documentCode, ordinal) => ipcRenderer.invoke(Channels.lookupBocArticle, documentCode, ordinal),
  getBocArticle: (documentCode, ordinal, sourceId) => ipcRenderer.invoke(Channels.getBocArticle, documentCode, ordinal, sourceId),
  listBocSources: () => ipcRenderer.invoke(Channels.listBocSources),
  listBocCommentarySources: () => ipcRenderer.invoke(Channels.listBocCommentarySources),
```

- [ ] **Step 4: Add the main handlers**

In `src/main/ipc/index.ts` (mirror the `lookupCommentary` handler at line 357), importing from `../services/boc`:

```ts
  ipcMain.handle(Channels.lookupBocArticle, (_e, documentCode: string, ordinal: number) =>
    boc.lookupBocArticle(documentCode, ordinal))
  ipcMain.handle(Channels.getBocArticle, (_e, documentCode: string, ordinal: number, sourceId: string) =>
    boc.getArticle(documentCode, ordinal, sourceId))
  ipcMain.handle(Channels.listBocSources, () => boc.listSources())
  ipcMain.handle(Channels.listBocCommentarySources, () => boc.listCommentarySources())
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors. (This is the acceptance test for the IPC wiring — it has no runtime unit test; the renderer consumers arrive in Plan 2.)

- [ ] **Step 6: Commit**

```bash
git add src/shared/ipc.ts src/preload/index.ts src/main/ipc/index.ts src/main/services/boc.ts
git commit -m "Expose Book of Concord lookup/list over IPC"
```

---

## Task 8: Offline converter (`boc-epub-to-md.mjs`)

**Files:**
- Create: `tools/boc-epub-to-md.mjs`
- (No unit test — the tool's *output contract* is already tested by `parseBocMarkdown`; this task is validated by round-tripping a real sample.)

**Interfaces:**
- Produces two Markdown files from one source EPUB/PDF: a primary-text file (the `# Document` / `## ordinal` contract from Task 3) and a commentary file (same contract, bodies = editorial notes).

**Known risk (from the spec):** the exact rule for separating confessional text from editorial notes depends on the actual Reader's Edition file's markup and can't be finalized until that file is inspected. This task is therefore validated against a real sample, not a fixture.

- [ ] **Step 1: Scaffold from the existing converter**

Copy the structure of `tools/epub-to-md.mjs` (EPUB unzip, TOC parse, HTML→Markdown, noise stripping). Read it first. Reuse its machinery; replace the Bible-book heading detection with document detection via `documentCodeFromName`, and article-ordinal detection.

- [ ] **Step 2: Emit the two-file output**

Emit `# <Document title>` at each document boundary and `## <ordinal>` at each article, to the primary file. Route editorial-note blocks (detected via the source's footnote/sidebar markup — determine the selector by inspecting the real file, as the existing tool does for ACCS's `<a class="apnf">`) to the commentary file under the same `## <ordinal>` heading.

- [ ] **Step 3: Round-trip validation**

Convert a real Reader's Edition sample, then run the output through the parser to confirm it's well-formed:

```bash
node -e "import('./src/main/services/bocMarkdown.js')" # (or a tiny scratch script)
```
Concretely: write a throwaway script that reads the produced `.md`, calls `parseBocMarkdown`, and prints per-document article counts. Compare those counts against `BOC_DOCUMENTS` — a mismatch means the converter dropped or mis-split articles. Iterate the detection rule until counts match.

- [ ] **Step 4: Commit**

```bash
git add tools/boc-epub-to-md.mjs
git commit -m "Add Book of Concord EPUB-to-Markdown converter"
```

---

## Self-Review

**Spec coverage (Plan 1 scope only — Reader/Nav and Integration Surfaces are Plans 2–3):**
- Static reference structure → Task 1 ✓
- Four DB tables → Task 2 ✓
- `parseBocMarkdown` → Task 3 ✓
- `lookupBocArticle` + text storage/translations → Task 4 ✓
- Vault indexer + startup sync → Task 5 ✓
- Search backend (`SearchKind` + indexing) → Task 6 ✓ (search *UI* is Plan 3)
- IPC surface → Task 7 ✓
- Ingestion converter → Task 8 ✓ (with the flagged detection-rule risk)
- Quotes migration (`boc_source_id`/`boc_ref`) → **deferred to Plan 2**, where the highlight-to-quote flow that writes those columns lives. Noted here so it isn't lost.
- `bocCitation()`, `BocReader`, pane kind, nav, Reference panel, notes → **Plan 2.**
- PanePicker, Projects, drag-and-drop, shared icon/label helper → **Plan 3.**

**Type consistency:** `BocDocumentCode`, `BocChunk`, `BocSource`, `BocCommentaryMatch`, and the `"CODE:ordinal"` ref format are used identically across Tasks 1→7. `replaceTexts`/`replaceCommentaryExcerpts`/`lookupBocArticle`/`getArticle` signatures match between the Task 4 interface block, its implementation, and the Task 7 handlers.

**Placeholder note:** the only intentionally-unfilled content is the per-document article authoring in Task 1 (Steps 3+5) and the converter's note-detection selector in Task 8 — both are genuine source-verification/inspection steps with concrete acceptance tests (article counts pinned in the test file; parser round-trip counts), not hand-waves. The `syncBocFolder` body and the search index/remove helpers are marked "author following <existing file>" because their exact idiom must match code the implementer will read; each still has a passing test as its gate.
