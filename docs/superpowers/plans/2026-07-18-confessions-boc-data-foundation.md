# Confessions (Book of Concord) — Plan 1: Data Foundation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the backend that lets the app ingest, store, look up, and search Book of Concord (BoC) primary text and per-section commentary — no UI yet, everything provable by `vitest`.

**Architecture:** Mirror the existing Bible + Commentary backend. A small static *documents-only* table (`bookOfConcord.ts`, like `scriptureRef.ts`'s `BOOKS` but without per-document section lists — sections are discovered from the source), a new SQLite migration (four tables shaped like `commentary_sources`/`commentary_excerpts`), a pure Markdown parser (`parseBocMarkdown`, like `parseCommentaryMarkdown`), a query service (`boc.ts`, like `commentary.ts`), a vault-folder indexer (`bocIndex.ts`, like `commentaryIndex.ts`), search indexing, the IPC surface, and the offline EPUB converter.

**Tech Stack:** TypeScript, Electron (main/preload/renderer split), `better-sqlite3`, `vitest` (logic-level, in-memory DB via `vi.mock('../db/connection')`). No Python available on this machine — the converter is Node (`.mjs`).

## This is Plan 1 of 3

Spec: `docs/superpowers/specs/2026-07-18-confessions-boc-design.md` (read the Data model + Ingestion sections before starting — they were rewritten against the actual Concordia Reader's Edition EPUB).

- **Plan 1 — Data Foundation (this document):** static documents table, migration, parser, service, indexer, search indexing, IPC, converter. Deliverable: convert the Reader's Edition EPUB → drop the Markdown in the vault → it indexes → sections and commentary are queryable and searchable.
- **Plan 2 — Reader & Nav (future):** `'boc'` pane kind + store, `BocReader`, `BocLibraryView`, left-nav wiring, `ReferenceBocPanel`, `CommentaryPanel` parameterization, notes, `bocCitation()`, the quotes migration + highlight-to-quote flow.
- **Plan 3 — Full Integration Surfaces (future):** `PanePicker`, search filter UI + result grouping, Projects (`ProjectItem`), drag-and-drop, shared `contentKindIcon()`/`kindLabel()` refactor.

Plans 2–3 depend on interfaces locked here; they're written after Plan 1 lands so their file/line refs are real.

## Global Constraints

- **Migration discipline:** append to the `migrations` array in `src/main/db/migrations.ts`; never edit a shipped migration. Next free version is **18** (current max 17). Index is rebuildable from the vault — forward-only is fine.
- **Test command:** whole suite via `npm test` (→ `node scripts/test-native.mjs`). Single file: `npx vitest run <path>`. Single test: `npx vitest run <path> -t "<name>"`.
- **DB test harness:** never touch Electron. In-memory DB + mock the connection module exactly as `src/main/services/commentary.test.ts:14-17` does: `vi.mock('../db/connection', () => ({ getDb: () => db, getDataDir: () => dataDir }))`, with `db = new Database(':memory:'); db.pragma('foreign_keys = ON'); runMigrations(db)` in `beforeEach`.
- **Pure parsers:** parsing/format logic lives in pure, I/O-free functions (the `parseCommentaryMarkdown` precedent).
- **Document codes (14, in nav order):** `CR-AP`, `CR-NI`, `CR-ATH`, `AC`, `AP`, `SA`, `TR`, `SC`, `LC`, `FC-EP`, `FC-SD`, `CT` (Catalog of Testimonies), `BEC` (Brief Exhortation to Confession), `SVA` (Saxon Visitation Articles). (3 creeds + 8 confessions + 3 appendices = 14.)
- **Section model:** a *section* is any navigable unit (Preface, Article, catechism part, Conclusion, appendix section). Sections are **discovered from the source**, never pre-authored. The static table lists documents only.
- **Ref-string format:** `"<CODE>:<sectionOrdinal>"`, e.g. `"AC:4"`. `sectionOrdinal` is a 1-based integer, the canonical storage/query key. The display number (`"IV"`, `"II (I)"`) and paragraph number come from stored fields / the highlighted `[N]` marker, resolved for citation only.
- **Markdown heading contract (converter output ↔ parser input):** a section heading is
  `## <ordinal> | <number> | <label> | <part>`
  — pipe-separated, ordinal required (integer), the other three may be empty. Examples:
  `## 4 | IV | Justification | Chief Articles of Faith` ,
  `## 1 |  | Preface | ` ,
  `## 5 | II (I) | Original Sin | ` .
  The `[N]` paragraph markers stay inline in the body text.
- **Source EPUB:** `D:/Theology/Concordia_ The Lutheran Confessions-A Readers Edition ... .epub` (extracted copy already in the session scratchpad under `boc-epub/`). Copyrighted — never commit the EPUB or its converted Markdown to git; converted `.md` files live in the user's vault, and `tools/sources/` is git-ignored (Task 8).

---

## File Structure

- **Create** `src/shared/bookOfConcord.ts` — static `BOC_DOCUMENTS` (documents only) + pure helpers.
- **Create** `src/shared/bookOfConcord.test.ts`.
- **Modify** `src/main/db/migrations.ts` — append migration v18 (four BoC tables).
- **Create** `src/main/services/bocMarkdown.ts` — pure `parseBocMarkdown`.
- **Create** `src/main/services/bocMarkdown.test.ts`.
- **Create** `src/main/services/boc.ts` — source/section/commentary CRUD + `lookupBocSection` + `getSection`.
- **Create** `src/main/services/boc.test.ts`.
- **Create** `src/main/services/bocIndex.ts` — `syncBocFolder`, `indexBocSections`, `indexBocCommentary`.
- **Create** `src/main/services/bocIndex.test.ts`.
- **Modify** `src/main/services/config.ts` — `bocVaultDir()`, `bocCommentaryVaultDir()`.
- **Modify** `src/main/services/search.ts` — `'confession'` `SearchKind`, index/remove BoC rows.
- **Create** `src/main/services/search.boc.test.ts`.
- **Modify** `src/shared/ipc.ts` — `BocSource`/`BocCommentaryMatch` types, `Channels`, `Api`, `SearchKind`.
- **Modify** `src/preload/index.ts`, `src/main/ipc/index.ts`, `src/main/index.ts`.
- **Create** `tools/boc-epub-to-md.mjs` — offline converter.

---

## Task 1: Static documents table

**Files:**
- Create: `src/shared/bookOfConcord.ts`
- Test: `src/shared/bookOfConcord.test.ts`

**Interfaces:**
- Produces:
  - `type BocDocumentCode = 'CR-AP'|'CR-NI'|'CR-ATH'|'AC'|'AP'|'SA'|'TR'|'SC'|'LC'|'FC-EP'|'FC-SD'|'CT'|'BEC'|'SVA'`
  - `interface BocDocumentDef { code: BocDocumentCode; title: string; abbreviation: string; sortOrder: number }`
  - `const BOC_DOCUMENTS: BocDocumentDef[]` (14 entries, sortOrder 1..14 in the order above)
  - `function bocDocument(code: string): BocDocumentDef | undefined`
  - `function documentCodeFromName(name: string): BocDocumentCode | undefined` (matches title or abbreviation or code, case-insensitive; also accepts the Reader's Edition heading spellings — see the alias note in Step 3)
  - `function parseBocRef(ref: string): { code: BocDocumentCode; ordinal: number } | null`
  - `function formatBocRef(code: BocDocumentCode, ordinal: number): string`

Note: no per-document section list, no `BocArticleDef` — sections are discovered by the indexer.

- [ ] **Step 1: Write the failing test**

Create `src/shared/bookOfConcord.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  BOC_DOCUMENTS, bocDocument, documentCodeFromName, parseBocRef, formatBocRef
} from './bookOfConcord'

describe('BOC_DOCUMENTS', () => {
  it('lists all 14 documents in nav order with unique codes and 1..14 sortOrder', () => {
    expect(BOC_DOCUMENTS.map((d) => d.code)).toEqual([
      'CR-AP','CR-NI','CR-ATH','AC','AP','SA','TR','SC','LC','FC-EP','FC-SD','CT','BEC','SVA'
    ])
    expect(new Set(BOC_DOCUMENTS.map((d) => d.code)).size).toBe(14)
    expect(BOC_DOCUMENTS.map((d) => d.sortOrder)).toEqual([...Array(14)].map((_, i) => i + 1))
  })
  it('puts the three appendices last', () => {
    expect(BOC_DOCUMENTS.slice(-3).map((d) => d.code)).toEqual(['CT','BEC','SVA'])
  })
})

describe('helpers', () => {
  it('resolves a document by title, abbreviation, code, or Reader\'s Edition heading spelling', () => {
    expect(documentCodeFromName('Augsburg Confession')).toBe('AC')
    expect(documentCodeFromName('augsburg confession')).toBe('AC')
    expect(documentCodeFromName('AC')).toBe('AC')
    expect(documentCodeFromName('The Augsburg Confession (1530)')).toBe('AC')
    expect(documentCodeFromName('The Creed of Athanasius')).toBe('CR-ATH')
    expect(documentCodeFromName('Catalog of Testimonies')).toBe('CT')
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

Run: `npx vitest run src/shared/bookOfConcord.test.ts` → FAIL (module not found).

- [ ] **Step 3: Write the implementation**

Create `src/shared/bookOfConcord.ts`:

```ts
// Book of Concord document registry — shared by main (index/lookup) and renderer
// (reader + citation). Pure, no I/O. Mirrors scriptureRef.ts's BOOKS, but lists ONLY
// the documents; a document's sections (Preface, Articles, Conclusion, catechism parts,
// appendix sections) are discovered from the indexed source, not pre-authored here.

export type BocDocumentCode =
  | 'CR-AP' | 'CR-NI' | 'CR-ATH'
  | 'AC' | 'AP' | 'SA' | 'TR' | 'SC' | 'LC' | 'FC-EP' | 'FC-SD'
  | 'CT' | 'BEC' | 'SVA'

export interface BocDocumentDef {
  code: BocDocumentCode
  title: string
  abbreviation: string
  sortOrder: number
  /** Extra name spellings the converter's `# <Document>` heading may use (from the
   *  Reader's Edition ToC), beyond title/abbreviation/code. Case-insensitive. */
  aliases?: string[]
}

export const BOC_DOCUMENTS: BocDocumentDef[] = [
  { code: 'CR-AP',  title: "Apostles' Creed",       abbreviation: "Ap. Creed",  sortOrder: 1,  aliases: ["The Apostles' Creed"] },
  { code: 'CR-NI',  title: 'Nicene Creed',          abbreviation: 'Nic. Creed', sortOrder: 2,  aliases: ['The Nicene Creed'] },
  { code: 'CR-ATH', title: 'Athanasian Creed',      abbreviation: 'Ath. Creed', sortOrder: 3,  aliases: ['The Creed of Athanasius'] },
  { code: 'AC',     title: 'Augsburg Confession',   abbreviation: 'AC',  sortOrder: 4,  aliases: ['The Augsburg Confession', 'The Augsburg Confession (1530)'] },
  { code: 'AP',     title: 'Apology of the Augsburg Confession', abbreviation: 'Ap', sortOrder: 5, aliases: ['The Apology of the Augsburg Confession', 'The Apology of the Augsburg Confession (1531)'] },
  { code: 'SA',     title: 'Smalcald Articles',     abbreviation: 'SA',  sortOrder: 6,  aliases: ['The Smalcald Articles', 'The Smalcald Articles (1537)'] },
  { code: 'TR',     title: 'Treatise on the Power and Primacy of the Pope', abbreviation: 'Tr', sortOrder: 7, aliases: ['The Power and Primacy of the Pope', 'The Power and Primacy of the Pope (1537)'] },
  { code: 'SC',     title: 'Small Catechism',       abbreviation: 'SC',  sortOrder: 8,  aliases: ['The Small Catechism', 'The Small Catechism (1529)', 'Enchiridion: The Small Catechism'] },
  { code: 'LC',     title: 'Large Catechism',       abbreviation: 'LC',  sortOrder: 9,  aliases: ['The Large Catechism', 'The Large Catechism (1529)'] },
  { code: 'FC-EP',  title: 'Formula of Concord: Epitome', abbreviation: 'FC Ep', sortOrder: 10, aliases: ['The Formula of Concord, Epitome', 'The Formula of Concord, Epitome (1577)', 'Epitome'] },
  { code: 'FC-SD',  title: 'Formula of Concord: Solid Declaration', abbreviation: 'FC SD', sortOrder: 11, aliases: ['The Formula of Concord, Solid Declaration', 'The Formula of Concord, Solid Declaration (1577)', 'Solid Declaration'] },
  { code: 'CT',     title: 'Catalog of Testimonies', abbreviation: 'Cat. Test.', sortOrder: 12, aliases: ['Appendix A: Catalog of Testimonies'] },
  { code: 'BEC',    title: 'A Brief Exhortation to Confession', abbreviation: 'Brief Exh.', sortOrder: 13, aliases: ['Appendix B: A Brief Exhortation to Confession'] },
  { code: 'SVA',    title: 'Saxon Visitation Articles', abbreviation: 'SVA', sortOrder: 14, aliases: ['Appendix C: Saxon Visitation Articles'] }
]
// 14 documents: 3 Ecumenical Creeds + Augsburg/Apology/Smalcald/Treatise/Small Cat/
// Large Cat/FC Epitome/FC Solid Declaration (8) + 3 appendices (CT/BEC/SVA).
```

```ts
const byCode = new Map(BOC_DOCUMENTS.map((d) => [d.code, d]))

export function bocDocument(code: string): BocDocumentDef | undefined {
  return byCode.get(code as BocDocumentCode)
}

export function documentCodeFromName(name: string): BocDocumentCode | undefined {
  const n = name.trim().toLowerCase()
  const hit = BOC_DOCUMENTS.find((d) =>
    d.title.toLowerCase() === n ||
    d.abbreviation.toLowerCase() === n ||
    d.code.toLowerCase() === n ||
    (d.aliases ?? []).some((a) => a.toLowerCase() === n))
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
  if (!doc || ordinal < 1) return null
  return { code: doc.code, ordinal }
}
```

- [ ] **Step 4: Run → PASS** (`npx vitest run src/shared/bookOfConcord.test.ts`).

- [ ] **Step 5: Commit**

```bash
git add src/shared/bookOfConcord.ts src/shared/bookOfConcord.test.ts
git commit -m "Add Book of Concord documents registry"
```

---

## Task 2: Database migration (BoC tables)

**Files:**
- Modify: `src/main/db/migrations.ts` (append after the v17 object at line ~336)
- Test: `src/main/services/boc.test.ts` (created here; schema asserted)

**Interfaces:**
- Produces `boc_sources`, `boc_texts`, `boc_commentary_sources`, `boc_commentary_excerpts` at `user_version = 18`.

- [ ] **Step 1: Write the failing test**

Create `src/main/services/boc.test.ts`:

```ts
import Database from 'better-sqlite3'
import { describe, expect, it, beforeEach } from 'vitest'
import { runMigrations } from '../db/migrations'

let db: Database.Database
beforeEach(() => {
  db = new Database(':memory:'); db.pragma('foreign_keys = ON'); runMigrations(db)
})

describe('migration v18', () => {
  it('creates the four BoC tables and reaches version 18+', () => {
    expect(db.pragma('user_version', { simple: true })).toBeGreaterThanOrEqual(18)
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r: any) => r.name)
    for (const t of ['boc_sources','boc_texts','boc_commentary_sources','boc_commentary_excerpts'])
      expect(tables).toContain(t)
  })
})
```

- [ ] **Step 2: Run → FAIL** (`npx vitest run src/main/services/boc.test.ts`).

- [ ] **Step 3: Append the migration**

In `src/main/db/migrations.ts`, add after the version-17 object (match the array's existing comma style):

```ts
  {
    version: 18,
    name: 'book-of-concord',
    up: (db) => {
      // Book of Concord: primary text (one row per translation × document × section) and
      // per-section commentary. Sections are discovered from the source, so section_number
      // and section_label are stored per row rather than derived from a static table.
      // Kept separate from the Bible commentary tables so 66-book invariants never see a
      // BoC document code.
      db.exec(`
        CREATE TABLE boc_sources (
          id                TEXT PRIMARY KEY,
          display_name      TEXT NOT NULL,
          author            TEXT,
          md_relative_path  TEXT NOT NULL UNIQUE,
          sort_order        INTEGER NOT NULL DEFAULT 0,
          indexed_at        TEXT,
          status            TEXT NOT NULL DEFAULT 'unindexed'
        );

        CREATE TABLE boc_texts (
          id               TEXT PRIMARY KEY,
          source_id        TEXT NOT NULL REFERENCES boc_sources(id) ON DELETE CASCADE,
          document_code    TEXT NOT NULL,
          section_ordinal  INTEGER NOT NULL,
          section_number   TEXT,
          section_label    TEXT NOT NULL,
          section_part     TEXT,
          text             TEXT NOT NULL
        );
        CREATE UNIQUE INDEX idx_boc_texts_key ON boc_texts(source_id, document_code, section_ordinal);
        CREATE INDEX idx_boc_texts_lookup ON boc_texts(document_code, section_ordinal);

        CREATE TABLE boc_commentary_sources (
          id                TEXT PRIMARY KEY,
          display_name      TEXT NOT NULL,
          author            TEXT,
          md_relative_path  TEXT NOT NULL UNIQUE,
          sort_order        INTEGER NOT NULL DEFAULT 0,
          indexed_at        TEXT,
          status            TEXT NOT NULL DEFAULT 'unindexed'
        );

        CREATE TABLE boc_commentary_excerpts (
          id               TEXT PRIMARY KEY,
          source_id        TEXT NOT NULL REFERENCES boc_commentary_sources(id) ON DELETE CASCADE,
          document_code    TEXT NOT NULL,
          section_start    INTEGER NOT NULL,
          section_end      INTEGER NOT NULL,
          text             TEXT NOT NULL,
          header_raw       TEXT
        );
        CREATE INDEX idx_boc_excerpts_lookup ON boc_commentary_excerpts(document_code, section_start, section_end);
        CREATE INDEX idx_boc_excerpts_source ON boc_commentary_excerpts(source_id);
      `)
    }
  }
```

- [ ] **Step 4: Run → PASS.**
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
- Consumes: `documentCodeFromName`, `type BocDocumentCode` from `../../shared/bookOfConcord`.
- Produces:
  - `interface BocSection { documentCode: BocDocumentCode; ordinal: number; number: string | null; label: string; part: string | null; text: string; headerRaw: string }`
  - `function parseBocMarkdown(markdown: string): BocSection[]`

Contract: `# <Document>` (level-1) sets the current document via `documentCodeFromName`. `## <ordinal> | <number> | <label> | <part>` opens a section (see Global Constraints). Empty `number`/`part` fields → `null`. Body text (including `[N]` markers) runs to the next heading. A `##` heading that doesn't match the pipe contract, or any heading before a document is set, ends the current section without opening one. Sections with empty bodies are still returned (the commentary indexer may emit note-less section headings for ordinal alignment — callers filter as needed).

- [ ] **Step 1: Write the failing test**

Create `src/main/services/bocMarkdown.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { parseBocMarkdown } from './bocMarkdown'

describe('parseBocMarkdown', () => {
  it('parses sections with ordinal/number/label/part and preserves [N] markers', () => {
    const md = [
      '# Augsburg Confession',
      '## 1 |  | Preface | ',
      '[1] Most invincible Emperor…',
      '## 4 | IV | Justification | Chief Articles of Faith',
      '[1] Our churches teach that people cannot be justified… [2] People are…'
    ].join('\n')
    expect(parseBocMarkdown(md)).toEqual([
      { documentCode: 'AC', ordinal: 1, number: null, label: 'Preface', part: null,
        text: '[1] Most invincible Emperor…', headerRaw: '1 |  | Preface | ' },
      { documentCode: 'AC', ordinal: 4, number: 'IV', label: 'Justification', part: 'Chief Articles of Faith',
        text: '[1] Our churches teach that people cannot be justified… [2] People are…',
        headerRaw: '4 | IV | Justification | Chief Articles of Faith' }
    ])
  })

  it('keeps the Apology dual-numbering verbatim in section_number', () => {
    const s = parseBocMarkdown('# Apology of the Augsburg Confession\n## 5 | II (I) | Original Sin | \nbody')
    expect(s[0]).toMatchObject({ documentCode: 'AP', ordinal: 5, number: 'II (I)', label: 'Original Sin' })
  })

  it('switches documents on a new level-1 heading', () => {
    const s = parseBocMarkdown('# Nicene Creed\n## 1 | I | First Article | \nA\n# Augsburg Confession\n## 1 | I | God | \nB')
    expect(s.map((x) => x.documentCode)).toEqual(['CR-NI', 'AC'])
  })

  it('drops content before any document and ignores non-contract headings', () => {
    expect(parseBocMarkdown('preamble\n## 4 | IV | Justification | \nno document set')).toEqual([])
    const s = parseBocMarkdown('# Augsburg Confession\n## 1 | I | God | \nA\n## Random Title\nstray\n## 2 | II | Original Sin | \nB')
    expect(s.map((x) => x.ordinal)).toEqual([1, 2])
    expect(s[0].text).toBe('A')
  })

  it('returns empty-body sections (ordinal alignment for the commentary file)', () => {
    const s = parseBocMarkdown('# Augsburg Confession\n## 3 | III | The Son of God | \n## 4 | IV | Justification | \nnote')
    expect(s.map((x) => ({ ord: x.ordinal, text: x.text }))).toEqual([
      { ord: 3, text: '' }, { ord: 4, text: 'note' }
    ])
  })
})
```

- [ ] **Step 2: Run → FAIL** (module not found).

- [ ] **Step 3: Write the implementation**

Create `src/main/services/bocMarkdown.ts`:

```ts
import { documentCodeFromName, type BocDocumentCode } from '../../shared/bookOfConcord'

export interface BocSection {
  documentCode: BocDocumentCode
  ordinal: number
  number: string | null
  label: string
  part: string | null
  text: string
  headerRaw: string
}

const HEADING_RE = /^(#{1,6})\s+(.*\S)\s*$/

export function parseBocMarkdown(markdown: string): BocSection[] {
  let document: BocDocumentCode | null = null
  const sections: BocSection[] = []
  let current: BocSection | null = null

  const flush = (): void => {
    if (current) { current.text = current.text.trim(); sections.push(current); current = null }
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

    // level >= 2: try the pipe contract "ordinal | number | label | part".
    const parts = content.split('|').map((s) => s.trim())
    const ordinal = Number(parts[0])
    if (document && parts.length >= 3 && Number.isInteger(ordinal) && ordinal >= 1 && parts[2]) {
      flush()
      current = {
        documentCode: document,
        ordinal,
        number: parts[1] ? parts[1] : null,
        label: parts[2],
        part: parts[3] ? parts[3] : null,
        text: '',
        headerRaw: content
      }
      continue
    }

    // Non-contract heading (stray title, or no document set): end current, open nothing.
    flush()
  }

  flush()
  return sections
}
```

- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit**

```bash
git add src/main/services/bocMarkdown.ts src/main/services/bocMarkdown.test.ts
git commit -m "Add pure Book of Concord Markdown parser (discovered sections)"
```

---

## Task 4: Query service (`boc.ts`)

**Files:**
- Create: `src/main/services/boc.ts`
- Modify: `src/shared/ipc.ts` (add `BocSource` + `BocCommentaryMatch` interfaces next to `CommentaryMatch` at line ~699)
- Test: extend `src/main/services/boc.test.ts`

**Interfaces:**
- Consumes: `getDb` from `../db/connection`; `randomUUID` from `crypto`; `BocSource`, `BocCommentaryMatch` from `../../shared/ipc` (the `commentary.ts:10-14` arrangement — types on the renderer-reachable side).
- Produces (types in `ipc.ts`):
  - `interface BocSource { id: string; displayName: string; author: string | null; mdRelativePath: string; sortOrder: number; status: string }`
  - `interface BocSectionRow { ordinal: number; number: string | null; label: string; part: string | null; text: string }`
  - `interface BocCommentaryMatch { excerptId: string; sourceId: string; sourceDisplayName: string; sourceAuthor: string | null; sortOrder: number; text: string; sectionStart: number; sectionEnd: number }`
- Produces (functions in `boc.ts`):
  - `createSource(input): BocSource`, `createCommentarySource(input): BocSource`
  - `replaceSections(sourceId, sections: { documentCode; ordinal; number; label; part; text }[]): void`
  - `replaceCommentaryExcerpts(sourceId, excerpts: { documentCode; sectionStart; sectionEnd; text; headerRaw }[]): void`
  - `getSection(documentCode, ordinal, sourceId): BocSectionRow | null`
  - `listSections(documentCode, sourceId): BocSectionRow[]` (ordered by ordinal — powers the reader's section picker)
  - `listSources(): BocSource[]`, `listCommentarySources(): BocSource[]`
  - `lookupBocSection(documentCode, ordinal): BocCommentaryMatch[]`

- [ ] **Step 1: Write the failing tests**

Add the connection mock + temp dir to `boc.test.ts`'s top (above `import { runMigrations }`), extend `beforeEach`/`afterEach` with `dataDir`, then append:

```ts
import { mkdtempSync, rmSync } from 'fs'; import { tmpdir } from 'os'; import { join } from 'path'
import { afterEach, vi } from 'vitest'
let dataDir: string
vi.mock('../db/connection', () => ({ getDb: () => db, getDataDir: () => dataDir }))
// beforeEach: dataDir = mkdtempSync(join(tmpdir(), 'loci-boc-'))   afterEach: rmSync(dataDir, {recursive:true,force:true})

import * as boc from './boc'

describe('boc service', () => {
  it('stores sections and reads one back with its display fields', () => {
    const src = boc.createSource({ displayName: "Reader's Edition", author: 'CPH', mdRelativePath: 're.md' })
    boc.replaceSections(src.id, [
      { documentCode: 'AC', ordinal: 1, number: null, label: 'Preface', part: null, text: 'Most invincible…' },
      { documentCode: 'AC', ordinal: 4, number: 'IV', label: 'Justification', part: 'Chief Articles of Faith', text: '[1] Our churches…' }
    ])
    expect(boc.getSection('AC', 4, src.id)).toEqual({
      ordinal: 4, number: 'IV', label: 'Justification', part: 'Chief Articles of Faith', text: '[1] Our churches…'
    })
    expect(boc.getSection('AC', 99, src.id)).toBeNull()
    expect(boc.listSections('AC', src.id).map((s) => s.ordinal)).toEqual([1, 4])
  })

  it('replaceSections is idempotent per source', () => {
    const src = boc.createSource({ displayName: 'T', author: null, mdRelativePath: 't.md' })
    boc.replaceSections(src.id, [{ documentCode: 'AC', ordinal: 1, number: 'I', label: 'God', part: null, text: 'first' }])
    boc.replaceSections(src.id, [{ documentCode: 'AC', ordinal: 1, number: 'I', label: 'God', part: null, text: 'second' }])
    expect(boc.getSection('AC', 1, src.id)?.text).toBe('second')
  })

  it('looks up commentary whose range covers a section, ordered by source sort_order', () => {
    const a = boc.createCommentarySource({ displayName: 'A', author: null, mdRelativePath: 'a.md', sortOrder: 1 })
    const b = boc.createCommentarySource({ displayName: 'B', author: null, mdRelativePath: 'b.md', sortOrder: 0 })
    boc.replaceCommentaryExcerpts(a.id, [{ documentCode: 'AC', sectionStart: 1, sectionEnd: 5, text: 'A on 1-5', headerRaw: '' }])
    boc.replaceCommentaryExcerpts(b.id, [{ documentCode: 'AC', sectionStart: 4, sectionEnd: 4, text: 'B on 4', headerRaw: '' }])
    expect(boc.lookupBocSection('AC', 4).map((m) => m.text)).toEqual(['B on 4', 'A on 1-5'])
    expect(boc.lookupBocSection('AC', 10)).toEqual([])
  })
})
```

- [ ] **Step 2: Run → FAIL** (`./boc` not found).

- [ ] **Step 3: Add the shared types, then implement the service**

In `src/shared/ipc.ts`, next to `CommentaryMatch` (line ~699), add:

```ts
export interface BocSource {
  id: string; displayName: string; author: string | null
  mdRelativePath: string; sortOrder: number; status: string
}
export interface BocSectionRow {
  ordinal: number; number: string | null; label: string; part: string | null; text: string
}
export interface BocCommentaryMatch {
  excerptId: string; sourceId: string; sourceDisplayName: string; sourceAuthor: string | null
  sortOrder: number; text: string; sectionStart: number; sectionEnd: number
}
```

Create `src/main/services/boc.ts`:

```ts
import { randomUUID } from 'crypto'
import { getDb } from '../db/connection'
import type { BocSource, BocSectionRow, BocCommentaryMatch } from '../../shared/ipc'

interface NewSource { displayName: string; author: string | null; mdRelativePath: string; sortOrder?: number }
interface SectionInput { documentCode: string; ordinal: number; number: string | null; label: string; part: string | null; text: string }
interface ExcerptInput { documentCode: string; sectionStart: number; sectionEnd: number; text: string; headerRaw: string }

function insertSource(table: 'boc_sources' | 'boc_commentary_sources', input: NewSource): BocSource {
  const id = randomUUID()
  getDb().prepare(`INSERT INTO ${table} (id, display_name, author, md_relative_path, sort_order) VALUES (?,?,?,?,?)`)
    .run(id, input.displayName, input.author, input.mdRelativePath, input.sortOrder ?? 0)
  return { id, displayName: input.displayName, author: input.author, mdRelativePath: input.mdRelativePath, sortOrder: input.sortOrder ?? 0, status: 'unindexed' }
}
export function createSource(i: NewSource): BocSource { return insertSource('boc_sources', i) }
export function createCommentarySource(i: NewSource): BocSource { return insertSource('boc_commentary_sources', i) }

export function replaceSections(sourceId: string, sections: SectionInput[]): void {
  const db = getDb()
  db.transaction(() => {
    db.prepare('DELETE FROM boc_texts WHERE source_id = ?').run(sourceId)
    const ins = db.prepare(`INSERT INTO boc_texts
      (id, source_id, document_code, section_ordinal, section_number, section_label, section_part, text)
      VALUES (?,?,?,?,?,?,?,?)`)
    for (const s of sections)
      ins.run(randomUUID(), sourceId, s.documentCode, s.ordinal, s.number, s.label, s.part, s.text)
  })()
}

export function replaceCommentaryExcerpts(sourceId: string, excerpts: ExcerptInput[]): void {
  const db = getDb()
  db.transaction(() => {
    db.prepare('DELETE FROM boc_commentary_excerpts WHERE source_id = ?').run(sourceId)
    const ins = db.prepare(`INSERT INTO boc_commentary_excerpts
      (id, source_id, document_code, section_start, section_end, text, header_raw) VALUES (?,?,?,?,?,?,?)`)
    for (const e of excerpts)
      ins.run(randomUUID(), sourceId, e.documentCode, e.sectionStart, e.sectionEnd, e.text, e.headerRaw)
  })()
}

function rowToSection(r: any): BocSectionRow {
  return { ordinal: r.section_ordinal, number: r.section_number, label: r.section_label, part: r.section_part, text: r.text }
}

export function getSection(documentCode: string, ordinal: number, sourceId: string): BocSectionRow | null {
  const r = getDb().prepare(
    `SELECT section_ordinal, section_number, section_label, section_part, text
     FROM boc_texts WHERE document_code = ? AND section_ordinal = ? AND source_id = ?`
  ).get(documentCode, ordinal, sourceId)
  return r ? rowToSection(r) : null
}

export function listSections(documentCode: string, sourceId: string): BocSectionRow[] {
  return (getDb().prepare(
    `SELECT section_ordinal, section_number, section_label, section_part, text
     FROM boc_texts WHERE document_code = ? AND source_id = ? ORDER BY section_ordinal`
  ).all(documentCode, sourceId) as any[]).map(rowToSection)
}

function listFrom(table: 'boc_sources' | 'boc_commentary_sources'): BocSource[] {
  return (getDb().prepare(
    `SELECT id, display_name, author, md_relative_path, sort_order, status FROM ${table} ORDER BY sort_order, display_name`
  ).all() as any[]).map((r) => ({
    id: r.id, displayName: r.display_name, author: r.author, mdRelativePath: r.md_relative_path, sortOrder: r.sort_order, status: r.status
  }))
}
export function listSources(): BocSource[] { return listFrom('boc_sources') }
export function listCommentarySources(): BocSource[] { return listFrom('boc_commentary_sources') }

export function lookupBocSection(documentCode: string, ordinal: number): BocCommentaryMatch[] {
  return (getDb().prepare(
    `SELECT e.id, e.source_id, s.display_name, s.author, s.sort_order, e.text, e.section_start, e.section_end
     FROM boc_commentary_excerpts e JOIN boc_commentary_sources s ON s.id = e.source_id
     WHERE e.document_code = ? AND e.section_start <= ? AND e.section_end >= ?
     ORDER BY s.sort_order, e.section_start`
  ).all(documentCode, ordinal, ordinal) as any[]).map((r) => ({
    excerptId: r.id, sourceId: r.source_id, sourceDisplayName: r.display_name, sourceAuthor: r.author,
    sortOrder: r.sort_order, text: r.text, sectionStart: r.section_start, sectionEnd: r.section_end
  }))
}
```

- [ ] **Step 4: Run → PASS** (`npx vitest run src/main/services/boc.test.ts`).
- [ ] **Step 5: Commit**

```bash
git add src/main/services/boc.ts src/main/services/boc.test.ts src/shared/ipc.ts
git commit -m "Add Book of Concord query service (sections + commentary lookup)"
```

---

## Task 5: Vault indexer (`bocIndex.ts`)

**Files:**
- Create: `src/main/services/bocIndex.ts`
- Modify: `src/main/services/config.ts` (add `bocVaultDir`, `bocCommentaryVaultDir`)
- Modify: `src/main/index.ts` (startup sync)
- Test: `src/main/services/bocIndex.test.ts`

**Interfaces:**
- Consumes: `parseBocMarkdown` (Task 3); `boc.ts` (Task 4); `getDataDir` from `../db/connection`; `localVaultDir` from `./config`.
- Produces:
  - In `config.ts`, modeled on `commentaryVaultDir()` (line 63): `bocVaultDir()` → `join(localVaultDir(), 'confessions')`; `bocCommentaryVaultDir()` → `join(localVaultDir(), 'confessions-commentary')`.
  - `interface BocIndexSummary { sections: number; excerpts: number }`
  - `async function indexBocSections(sourceId, absPath): Promise<BocIndexSummary>` — parse → `replaceSections` (drops empty-body sections: primary text always has a body) → `indexBocForSearch(sourceId)` (Task 6).
  - `async function indexBocCommentary(sourceId, absPath): Promise<BocIndexSummary>` — parse → `replaceCommentaryExcerpts` for non-empty-body sections (single-section excerpts: sectionStart = sectionEnd = ordinal).
  - `async function syncBocFolder(): Promise<void>` — scan `bocVaultDir()` (primary) + `bocCommentaryVaultDir()` (commentary), register unseen files as sources, (re)index by mtime. Mirror `syncCommentaryFolder` (`commentaryIndex.ts:64`) exactly — same `loadIndexMtimes` skip logic and createSource-on-first-sight. Read that function before writing.

The vault layout is settled: `commentaryVaultDir()` (`config.ts:63`) = `join(localVaultDir(), 'commentaries')`; `localVaultDir()` (line 57) = `join(getDataDir(), 'vault')`. The two BoC folders are siblings of `commentaries/`.

- [ ] **Step 1: Write the failing test**

Create `src/main/services/bocIndex.test.ts`. `indexBocSections` takes an absolute path, so only `getDataDir` needs mocking here:

```ts
import Database from 'better-sqlite3'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'; import { join } from 'path'
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { runMigrations } from '../db/migrations'

let db: Database.Database; let dataDir: string
vi.mock('../db/connection', () => ({ getDb: () => db, getDataDir: () => dataDir }))
beforeEach(() => { db = new Database(':memory:'); db.pragma('foreign_keys = ON'); runMigrations(db); dataDir = mkdtempSync(join(tmpdir(),'loci-boc-')) })
afterEach(() => rmSync(dataDir, { recursive: true, force: true }))

import * as boc from './boc'
import { indexBocSections, indexBocCommentary } from './bocIndex'

describe('bocIndex', () => {
  it('indexes primary-text sections', async () => {
    const src = boc.createSource({ displayName: 'RE', author: null, mdRelativePath: 'confessions/re.md' })
    const p = join(dataDir, 're.md')
    writeFileSync(p, '# Augsburg Confession\n## 4 | IV | Justification | \n[1] Our churches teach…')
    expect((await indexBocSections(src.id, p)).sections).toBe(1)
    expect(boc.getSection('AC', 4, src.id)?.label).toBe('Justification')
  })

  it('indexes commentary, skipping note-less sections', async () => {
    const src = boc.createCommentarySource({ displayName: 'RE-notes', author: null, mdRelativePath: 'confessions-commentary/re.md' })
    const p = join(dataDir, 're-notes.md')
    writeFileSync(p, '# Augsburg Confession\n## 3 | III | The Son of God | \n## 4 | IV | Justification | \nNote: the church stands or falls…')
    expect((await indexBocCommentary(src.id, p)).excerpts).toBe(1)
    expect(boc.lookupBocSection('AC', 4)[0].text).toContain('stands or falls')
    expect(boc.lookupBocSection('AC', 3)).toEqual([])
  })
})
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement**

Add to `config.ts` the two accessors. Create `bocIndex.ts`:

```ts
import { readFile } from 'fs/promises'
import { parseBocMarkdown } from './bocMarkdown'
import { replaceSections, replaceCommentaryExcerpts } from './boc'
import { indexBocForSearch } from './search'

export interface BocIndexSummary { sections: number; excerpts: number }

export async function indexBocSections(sourceId: string, absPath: string): Promise<BocIndexSummary> {
  const parsed = parseBocMarkdown(await readFile(absPath, 'utf8')).filter((s) => s.text)
  replaceSections(sourceId, parsed.map((s) => ({
    documentCode: s.documentCode, ordinal: s.ordinal, number: s.number, label: s.label, part: s.part, text: s.text
  })))
  indexBocForSearch(sourceId)
  return { sections: parsed.length, excerpts: 0 }
}

export async function indexBocCommentary(sourceId: string, absPath: string): Promise<BocIndexSummary> {
  const parsed = parseBocMarkdown(await readFile(absPath, 'utf8')).filter((s) => s.text)
  replaceCommentaryExcerpts(sourceId, parsed.map((s) => ({
    documentCode: s.documentCode, sectionStart: s.ordinal, sectionEnd: s.ordinal, text: s.text, headerRaw: s.headerRaw
  })))
  return { sections: 0, excerpts: parsed.length }
}

// syncBocFolder(): mirror syncCommentaryFolder in commentaryIndex.ts — scan bocVaultDir()
// (→ createSource + indexBocSections) and bocCommentaryVaultDir() (→ createCommentarySource
// + indexBocCommentary), skipping files whose mtime <= indexed_at. Implement fully against
// that file's idiom; do not ship a stub.
export async function syncBocFolder(): Promise<void> {
  // …author following commentaryIndex.ts…
}
```

> `indexBocForSearch` doesn't exist until Task 6. To keep Task 5's test green now, either implement Task 6 first, or add a temporary no-op `export function indexBocForSearch(_: string): void {}` in `search.ts` and replace it in Task 6. Prefer doing Task 6 immediately after this step so the import resolves against the real function.

Implement `syncBocFolder` fully. Add a `syncBocFolder` folder-scan test mirroring `commentaryIndex.test.ts` (write files into `join(getDataDir(),'vault','confessions')`, call it, assert sources + rows).

- [ ] **Step 4: Run → PASS.**

- [ ] **Step 5: Wire startup sync**

In `src/main/index.ts`, next to `syncCommentaryFolder` (line ~145):

```ts
import { syncBocFolder } from './services/bocIndex'
  setTimeout(() => void syncBocFolder().catch(() => {}), 2500)
```

- [ ] **Step 6: Commit**

```bash
git add src/main/services/bocIndex.ts src/main/services/bocIndex.test.ts src/main/services/config.ts src/main/index.ts
git commit -m "Add Book of Concord vault indexer + startup sync"
```

---

## Task 6: Search indexing

**Files:**
- Modify: `src/shared/ipc.ts` (`SearchKind`, line ~524)
- Modify: `src/main/services/search.ts`
- Test: `src/main/services/search.boc.test.ts`

**Interfaces:**
- Produces: `'confession'` added to `SearchKind`; `indexBocForSearch(sourceId: string): void` / `removeBocFromSearch(sourceId: string): void` (mirror the existing per-kind helpers in `search.ts` — read it first). Index each `boc_texts` row for the source with `kind = 'confession'`, `ref = formatBocRef(documentCode, section_ordinal)`, and the section text as the searchable content.

- [ ] **Step 1: Write the failing test**

Create `src/main/services/search.boc.test.ts` (in-memory-DB harness as in `boc.test.ts`):

```ts
// harness: db + vi.mock('../db/connection', {getDb, getDataDir}) + runMigrations …
import * as boc from './boc'
import { indexBocForSearch } from './search'

it('indexes BoC section text into search_fts under the confession kind', () => {
  const src = boc.createSource({ displayName: 'RE', author: null, mdRelativePath: 're.md' })
  boc.replaceSections(src.id, [{ documentCode: 'AC', ordinal: 4, number: 'IV', label: 'Justification', part: null, text: 'Justification by faith alone' }])
  indexBocForSearch(src.id)
  const rows = db.prepare("SELECT ref FROM search_fts WHERE kind='confession' AND search_fts MATCH 'justification'").all()
  expect(rows).toContainEqual({ ref: 'AC:4' })
})
```

Adjust the assertion to `search_fts`'s real columns — read `search.ts`'s existing commentary/scripture indexing and mirror its row shape exactly (the `ref`/`kind` columns already exist; confirm whether `ref` is stored or reconstructed).

- [ ] **Step 2: Run → FAIL** (`indexBocForSearch` not exported).

- [ ] **Step 3: Implement**

`SearchKind` in `ipc.ts` → add `'confession'`. In `search.ts`, add `indexBocForSearch`/`removeBocFromSearch` mirroring the per-kind helpers, and include `'confession'` wherever the `kind` filter is applied. If Task 5 added a temporary no-op, replace it.

- [ ] **Step 4: Run → PASS.** Re-run Task 5's suite too: `npx vitest run src/main/services/bocIndex.test.ts src/main/services/search.boc.test.ts`.
- [ ] **Step 5: Commit**

```bash
git add src/shared/ipc.ts src/main/services/search.ts src/main/services/search.boc.test.ts
git commit -m "Index Book of Concord sections into full-text search"
```

---

## Task 7: IPC surface

**Files:**
- Modify: `src/shared/ipc.ts` (`Channels` ~line 86; `Api` ~line 331)
- Modify: `src/preload/index.ts` (~line 99); `src/main/ipc/index.ts` (~line 357)

**Interfaces (on `window.api`):**
- `lookupBocSection(documentCode: string, ordinal: number): Promise<BocCommentaryMatch[]>`
- `getBocSection(documentCode: string, ordinal: number, sourceId: string): Promise<BocSectionRow | null>`
- `listBocDocumentSections(documentCode: string, sourceId: string): Promise<BocSectionRow[]>`
- `listBocSources(): Promise<BocSource[]>`
- `listBocCommentarySources(): Promise<BocSource[]>`

`BocSource`/`BocSectionRow`/`BocCommentaryMatch` are already in `ipc.ts` (Task 4). `lookupCommentary` (all three files) is the exact template.

- [ ] **Step 1: `Channels`** — add `lookupBocSection: 'boc:lookupSection'`, `getBocSection: 'boc:getSection'`, `listBocDocumentSections: 'boc:listDocumentSections'`, `listBocSources: 'boc:listSources'`, `listBocCommentarySources: 'boc:listCommentarySources'`.
- [ ] **Step 2: `Api`** — add the five method signatures above (import the types if not already in scope).
- [ ] **Step 3: preload** — mirror `lookupCommentary`:

```ts
  lookupBocSection: (d, o) => ipcRenderer.invoke(Channels.lookupBocSection, d, o),
  getBocSection: (d, o, s) => ipcRenderer.invoke(Channels.getBocSection, d, o, s),
  listBocDocumentSections: (d, s) => ipcRenderer.invoke(Channels.listBocDocumentSections, d, s),
  listBocSources: () => ipcRenderer.invoke(Channels.listBocSources),
  listBocCommentarySources: () => ipcRenderer.invoke(Channels.listBocCommentarySources),
```

- [ ] **Step 4: main handlers** — import `* as boc from '../services/boc'`, mirror the `lookupCommentary` handler:

```ts
  ipcMain.handle(Channels.lookupBocSection, (_e, d: string, o: number) => boc.lookupBocSection(d, o))
  ipcMain.handle(Channels.getBocSection, (_e, d: string, o: number, s: string) => boc.getSection(d, o, s))
  ipcMain.handle(Channels.listBocDocumentSections, (_e, d: string, s: string) => boc.listSections(d, s))
  ipcMain.handle(Channels.listBocSources, () => boc.listSources())
  ipcMain.handle(Channels.listBocCommentarySources, () => boc.listCommentarySources())
```

- [ ] **Step 5: Typecheck** — `npm run typecheck` → no errors (acceptance test for the wiring; renderer consumers are Plan 2).
- [ ] **Step 6: Commit**

```bash
git add src/shared/ipc.ts src/preload/index.ts src/main/ipc/index.ts
git commit -m "Expose Book of Concord lookup/list over IPC"
```

---

## Task 8: Offline converter (`boc-epub-to-md.mjs`)

**Files:**
- Create: `tools/boc-epub-to-md.mjs`
- Modify: `.gitignore` (add `tools/sources/`)
- No unit test — validated by round-tripping real output through `parseBocMarkdown` and comparing section counts to the ToC.

**Interfaces:**
- Input: the Reader's Edition EPUB. Output: two Markdown files following the heading contract — a primary-text file (→ `confessions/` vault folder) and a commentary file (→ `confessions-commentary/`).

**Detection rule (settled from the actual EPUB — see spec Ingestion table):**
- Document boundary: a `ch_h`/heading whose text resolves via `documentCodeFromName` (use the `aliases`).
- Section boundary: `<p class="article">` (number, e.g. "ARTICLE IV") + following `<p class="ch_h1a">` (label); or a `<p class="ch_h">` for Preface/Conclusion/part & section headers. Assign `ordinal` by increasing counter within the document; carry the last part header into the `part` field.
- `<p class="ch_note">` → commentary file body for the current section.
- `<p class="indent">`/`indent1`/`noindent`/`left`/`bq`/`ext` → primary-text body for the current section, preserving `[N]` markers.
- Each document's Editor's Introduction (its intro spine section) → commentary body attached to the document's first section.

- [ ] **Step 1: Scaffold from `tools/epub-to-md.mjs`** — read it first; reuse unzip / TOC parse / HTML→Markdown / entity handling. Import `documentCodeFromName` (or inline the alias map if importing TS from `.mjs` is awkward — the existing tool's approach governs).

- [ ] **Step 2: Emit both files** per the contract and detection rule. Extracted copy of the EPUB is already in the session scratchpad (`boc-epub/`); point the tool at `D:/Theology/Concordia_…Readers Edition….epub` for real runs.

- [ ] **Step 3: Round-trip validation** — write a throwaway Node script that runs each produced `.md` through `parseBocMarkdown` and prints per-document section counts. Compare against the ToC section list (dump it from `boc-epub/toc.ncx`). Manually spot-check the catechisms, the Catalog of Testimonies, and the Saxon Visitation Articles (varied layouts — likeliest mis-splits). Iterate the detection rule until counts match and spot-checks read correctly.

- [ ] **Step 4: `.gitignore`** — add `tools/sources/` so no copyrighted EPUB/derived Markdown is committed. Commit only the tool:

```bash
git add tools/boc-epub-to-md.mjs .gitignore
git commit -m "Add Book of Concord EPUB-to-Markdown converter"
```

---

## Task 9: PDF converter (`boc-pdf-to-md.mjs`) — added after the EPUB path

**Context:** many BoC translations and commentaries are PDFs, not EPUBs. The app
side is format-agnostic (it consumes the Markdown contract), so this is
converter-only tooling. Build this AFTER Task 8 validates, and once the specific
PDF source files are identified (they live under `D:/Theology`).

**Files:**
- Create: `tools/boc-pdf-to-md.mjs` (scaffold from the existing `tools/pdf-to-md.mjs`).
- No unit test — validated by round-trip vs the source's ToC, same as Task 8.

**Design (single-purpose sources — the common case the user expects):**
- The user picks the source TYPE at convert time: `--type=translation` (all body
  text → primary-text file) or `--type=commentary` (all body text → commentary
  file). No in-file text/note split — that's the whole simplification vs. the EPUB.
- Detect document + section boundaries from text/font patterns, reusing
  `pdf-to-md.mjs`'s existing heading/line-grouping machinery: document titles
  (the same 14 name→code aliases as Task 8) and section headers ("ARTICLE
  <roman>", "PART <n>", catechism headings, "Preface"/"Conclusion"). Emit the
  same `# Document` / `## ordinal | number | label | part` contract.
- Preserve any traditional `[N]` paragraph numbers the PDF text carries.

**Dual-purpose PDFs (the hard case, deferred per-source):** if a specific PDF
turns out to interleave confessional text and notes without markup to separate
them, it needs font/geometry heuristics or hand-tuned per-source rules — inspect
that file individually (the way the Reader's Edition EPUB was inspected) before
converting it. Do NOT try to build a general dual-purpose-PDF splitter up front.

**Validation:** run against a real PDF, round-trip through `parseBocMarkdown`,
compare section counts to the PDF's ToC. Commit only the tool + `.gitignore`;
never the PDFs or their converted Markdown (copyrighted).

---

## Self-Review

**Spec coverage (Plan 1 scope):**
- Documents-only static table → Task 1 ✓
- Four DB tables (section columns) → Task 2 ✓
- `parseBocMarkdown` (discovered sections, pipe contract) → Task 3 ✓
- `boc.ts` (sections, translations, `lookupBocSection`) → Task 4 ✓
- Vault indexer + startup sync → Task 5 ✓
- Search backend (`'confession'` kind) → Task 6 ✓ (search UI is Plan 3)
- IPC → Task 7 ✓
- EPUB converter with settled detection rule → Task 8 ✓
- PDF converter (translations/commentaries) → Task 9 (added; built after Task 8 validates + PDF sources identified) ✓
- Appendices (CT/BEC/SVA) → in the Task 1 table + Task 8 conversion ✓
- Editor's Introductions → commentary → Task 8 detection rule + Task 5 commentary indexing ✓
- Paragraph-precise citation → `[N]` markers preserved through Tasks 3–5; `bocCitation()` itself is **Plan 2** (quotes) ✓
- Quotes migration (`boc_source_id`/`boc_ref`), `BocReader`, pane kind, nav, Reference panel, notes → **Plan 2**
- PanePicker, Projects, drag-and-drop, shared icon/label helper → **Plan 3**

**Type consistency:** `BocDocumentCode`, `BocSection` (parser) vs `BocSectionRow` (service/IPC row) vs `SectionInput` (service arg) are distinct-by-design and used consistently. `lookupBocSection` / `getSection` / `listSections` signatures match across Task 4 impl, Task 5 caller, and Task 7 handlers. Ref format `CODE:ordinal` identical in Tasks 1, 6, 7.

**Known soft spots flagged in-plan, not placeholders:** Task 5's `indexBocForSearch` ordering dependency on Task 6 (do Task 6 immediately after Task 5, or use the temporary no-op), and Task 8's manual spot-checks (no automated gate — inherent to converting a real copyrighted source). Each has a concrete resolution instruction.
