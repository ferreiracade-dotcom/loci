# Library: Books and Articles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the Loci library into Books and Articles (one `books` table with a `kind` column, the folder deciding the kind), give articles journal details and an article citation, add Fill-from-DOI via Crossref, and remove "PDF" as a name for library items from the interface.

**Architecture:** Migration 25 adds `kind` plus nullable `journal/volume/issue/pages/doi` to `books`. A pure shared module (`src/shared/libraryKind.ts`) derives the kind from a file path and retargets a path to the other folder; `library.ts` uses it in import, sync (re-derive every sync) and a new `moveBook`. Citation gets an `'article'` source kind in `formatCitation`. Crossref lookup is a main-process `fetch` with a pure, fixture-tested parser. The renderer gains Books|Articles tabs on the Library page, a Books|Articles switch inside the right-hand "Library" pill, article fields + Fill-from-DOI + Move in the info drawer, and a wording sweep.

**Tech Stack:** Electron + electron-vite, React, zustand, better-sqlite3, vitest, TypeScript (Windows).

## Global Constraints

Copied from the approved spec (`docs/superpowers/specs/2026-10-10-library-books-and-articles-design.md`) and project conventions. Every task includes these.

- One table: articles live in `books` with `kind TEXT NOT NULL DEFAULT 'book'` (`'book' | 'article'`). No second table.
- The folder decides the kind. Vault: `pdfs/Books/…` is a book, `pdfs/Articles/…` is an article (sibling folder, created on demand). User's local PDF folder: any file under a folder named `Articles` (case-insensitive, any depth) is an article, everything else a book. `kind` is re-derived from the path on every library sync.
- Changing kind = moving the file to the other folder (same relative layout; name collision gets a `-<id8>` suffix as import already does); the row keeps its id, so quotes, highlights and shelves stay attached.
- Import copies into the vault folder matching the chosen kind.
- Article columns (nullable TEXT): `journal`, `volume`, `issue`, `pages` (range text such as `45–67`), `doi`. Shown in the drawer only when `kind='article'`.
- Fill from DOI: Crossref `https://api.crossref.org/works/<doi>`, no key; fills title, authors, journal, volume, issue, pages, year; user saves to confirm; fields stay hand-editable; offline/404 shows an inline error and changes nothing.
- Article citation (Chicago note, matching book style): `Author, "Title," *Journal* 12, no. 3 (1998): 45–67, 52.` Missing parts omitted cleanly (no `no.` without issue, no `: pages` without a range, quoted page last when known). Book citations unchanged.
- Naming: "PDF" leaves the interface where it names a library item. Keep "Export to PDF". Internal names (`pdf` tab kind, `pdf_path`, `PdfReader`, `ReferencePdfPanel`) are NOT renamed.
- The right-panel pill label becomes "Library"; its internal id stays `'books'` (see Decisions).
- Migration is idempotent (`PRAGMA table_info` guards); next free version is **25** (latest today is 24).
- Out of scope: web/HTML articles, automatic lookup by title, renaming internal identifiers, BibTeX/RIS.

Project constraints:

- No native-compiled dependencies (no Python/MSVC on this machine). Never run bare `npm install` or `npm ci`. No new dependencies are needed by this plan.
- Tests: `npm test -- <paths>` runs vitest through `scripts/test-native.mjs` (REQUIRED for any test that opens a better-sqlite3 database). Pure tests may use `npx vitest run <path>`. Typecheck: `npm run typecheck`.
- In Git Bash, Node may need `export PATH="/c/Program Files/nodejs:$PATH"` first.
- Avoid file names that differ only by case (Windows).
- Commit only the files listed in each task. Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- The user does all live GUI checks. Never launch or drive the running app; stop at typecheck + tests and hand over the checklist in Task 9.
- Other sessions may land work on `main`; locate every edit by the quoted context, not by line number.

## Decisions (spec ambiguities resolved)

1. **Right pill id stays `'books'`.** Only its label changes to "Library" (and the icon to lucide `Library`). The id is persisted in the `panel_layout.active_right_tab` column, is mapped from legacy ids in `lib/corpusMode.ts`, and is used by `ThreePanel` (`WIDE_RIGHT_TABS`); renaming it would need a data migration for zero user benefit.
2. **The Books|Articles switch in the pill is local to `ReferencePdfPanel`** (reusing the `.corpus-switch` CSS), not a new `CorpusMode`. `CorpusMode 'books'` belongs to the Quotes pill; adding `'articles'` there would ripple through quote grouping. The pill remembers its choice in the session key `refLibraryKind`.
3. **Library page Books|Articles = two more content tabs** in the existing `Books | Images | Videos` segmented control (it becomes `Books | Articles | Images | Videos`), with counts on Books and Articles. The existing `libraryTab` session key persists the choice.
4. **"Import asks Book or Article?"** is answered by the active tab: the button reads "Add books…" on the Books tab and "Add articles…" on the Articles tab, and the kind is passed to the import. No extra modal.
5. **Kind authority when a book has copies in both places:** the vault copy (`pdf_path`) decides; the local library copy (`local_path`) decides only when there is no vault path under `<vault>/pdfs`. Files outside both roots (the id-named cache, external originals) keep their stored kind.
6. **Move touches `pdf_path` and `local_path` only.** `source_path` follows when it equals a moved path; other external originals are never moved. The sidecar folder follows through the existing `moveSidecar`.
7. **Local-library layout for Move:** to Articles puts the file under `<local>/Articles/<same relative path>`; to Books removes every `Articles` directory segment from the relative path. Vault: swap the first segment `Books`↔`Articles`.
8. **Articles hide Series and Publisher fields** in the drawer (the data is untouched); Page offset stays (the printed-page maths is shared).
9. **Article bibliography entries** (`buildBibliography`) use the article format too, so a bibliography never prints a journal article as a book.
10. **Bookmarks:** `BookmarksBar` and the bookmarks manager contain no "PDF" wording (they show the tab title and the page label "Library"), so nothing changes there; the New Tab tiles, omnibox and History/hover subtitles are covered in Task 8.
11. **Shelf chip counts** (`shelves.count`) still count both kinds; shelves are shared between books and articles by design.

## File Structure

Create:

- `src/shared/libraryKind.ts` — pure: `kindFromPath`, `retargetPath`, `ofKind`, `KIND_LABEL`, `KIND_PLURAL`, `KindRoots`.
- `src/shared/libraryKind.test.ts` — its tests.
- `src/main/services/crossref.ts` — `normalizeDoi`, `parseCrossref`, `lookupDoi`.
- `src/main/services/crossref.test.ts` — its tests.
- `src/main/services/__fixtures__/crossrefSamples.ts` — Crossref response fixtures.
- `src/main/services/library.articles.test.ts` — DB + temp-folder integration tests (columns, sync kinds, import, move).
- `src/renderer/src/components/library/KindSwitch.tsx` — small Books|Articles segmented control for the pill.

Modify:

- `src/main/db/migrations.ts`, `src/main/db/migrations.test.ts`, `src/main/services/commentary.test.ts` — migration 25 and the two `24` assertions.
- `src/shared/ipc.ts` — `BookKind`, `Book`/`BookUpdate` fields, `ArticleFields`, `DoiLookupResult`, channels, `LociApi`.
- `src/preload/index.ts`, `src/main/ipc/index.ts` — wiring.
- `src/main/services/library.ts`, `src/main/services/sidecar.ts` — rowToBook, updateBook, sidecar fields, import/sync kinds, `moveBook`.
- `src/shared/citation.ts`, `src/shared/citation.test.ts`, `src/main/services/quotes.ts`, `src/main/services/quotes.test.ts` — article citation.
- `src/renderer/src/store/useStore.ts` — `importFiles(kind)`, `moveBook`.
- `src/renderer/src/components/library/BookInfoDrawer.tsx`, `LibraryView.tsx`, `ReferencePdfPanel.tsx`, `SearchResults.tsx`, `CommentaryPanel.tsx`, `CommentaryReviewQueue.tsx`, `QuotesPanel.tsx`; `components/navigation.ts`, `Wizard.tsx`, `Settings.tsx`.
- `src/renderer/src/components/chrome/tabRegistry.tsx`, `ChromeTabStrip.tsx`, `HistoryPage.tsx`, `newTabTiles.ts` (+ test), `omniboxSuggest.ts` (+ test).

---

### Task 1: Migration 25, Book fields, article metadata persistence (model: sonnet)

**Files:**
- Modify: `src/main/db/migrations.ts`
- Modify: `src/main/db/migrations.test.ts`
- Modify: `src/main/services/commentary.test.ts`
- Modify: `src/shared/ipc.ts`
- Modify: `src/main/services/library.ts`
- Modify: `src/main/services/sidecar.ts`
- Create: `src/main/services/library.articles.test.ts`

**Interfaces:**
- Produces (shared/ipc.ts): `export type BookKind = 'book' | 'article'`; `Book` gains `kind: BookKind; journal: string | null; volume: string | null; issue: string | null; pages: string | null; doi: string | null`; `BookUpdate` gains `journal?, volume?, issue?, pages?, doi?: string | null`.
- Produces (sidecar.ts): `SidecarData` gains optional `journal/volume/issue/pages/doi: string | null`; `metadata.json` now carries them.
- Produces: the test harness in `library.articles.test.ts` (mocks for `../db/connection`, `./config`, `./vaultsync`; `cfg`, `vault`, `local`, `dataDir`, `insertBook`) which Tasks 2 and 3 extend.

- [ ] **Step 1: Write the failing migration tests**

In `src/main/db/migrations.test.ts`, change `const LATEST = 24` to `const LATEST = 25`, and append this block at the end of the file:

```ts
describe('migration 25 (books kind + article fields)', () => {
  const bookColumns = (db: Database.Database): string[] =>
    (db.prepare('PRAGMA table_info(books)').all() as { name: string }[]).map((c) => c.name)

  it('adds kind (default book) and the five article columns', () => {
    const db = new Database(':memory:')
    runMigrations(db)
    const cols = bookColumns(db)
    for (const c of ['kind', 'journal', 'volume', 'issue', 'pages', 'doi']) expect(cols).toContain(c)
    db.prepare("INSERT INTO books (id, title, title_sanitized) VALUES ('b1', 'T', 'T')").run()
    const row = db.prepare("SELECT kind, journal, doi FROM books WHERE id = 'b1'").get() as {
      kind: string
      journal: string | null
      doi: string | null
    }
    expect(row).toEqual({ kind: 'book', journal: null, doi: null })
  })

  it('is idempotent when version 25 runs again on a database that already has the columns', () => {
    const db = new Database(':memory:')
    runMigrations(db)
    db.pragma('user_version = 24')
    expect(() => runMigrations(db)).not.toThrow()
    expect(db.pragma('user_version', { simple: true })).toBe(25)
    expect(bookColumns(db).filter((c) => c === 'kind')).toHaveLength(1)
  })
})
```

In `src/main/services/commentary.test.ts` change `expect(db.pragma('user_version', { simple: true })).toBe(24)` to `.toBe(25)`.

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- src/main/db/migrations.test.ts src/main/services/commentary.test.ts`
Expected: FAIL (`user_version` is 24, the `kind` column does not exist).

- [ ] **Step 3: Implement migration 25**

In `src/main/db/migrations.ts`, add this function directly after `addFathersCitation` (before the `// Append new migrations here` comment):

```ts
/** Books vs articles (version 25; idempotent). `kind` is derived from the file's folder on every
 *  library sync; the article columns are only filled for kind = 'article'. */
function addBookKindAndArticleFields(db: Database.Database): void {
  const have = new Set((db.prepare('PRAGMA table_info(books)').all() as { name: string }[]).map((c) => c.name))
  if (!have.has('kind')) db.exec("ALTER TABLE books ADD COLUMN kind TEXT NOT NULL DEFAULT 'book'")
  for (const col of ['journal', 'volume', 'issue', 'pages', 'doi'] as const) {
    if (!have.has(col)) db.exec(`ALTER TABLE books ADD COLUMN ${col} TEXT`)
  }
}
```

Then replace the end of the `migrations` array. Find:

```ts
      createDogmatics(db)
      createFathers(db)
      addFathersCitation(db)
    }
  }
]
```

Replace with:

```ts
      createDogmatics(db)
      createFathers(db)
      addFathersCitation(db)
    }
  },
  {
    version: 25,
    name: 'books-kind-and-article-fields',
    up: (db) => addBookKindAndArticleFields(db)
  }
]
```

- [ ] **Step 4: Run to verify the migration tests pass**

Run: `npm test -- src/main/db/migrations.test.ts src/main/services/commentary.test.ts`
Expected: PASS.

- [ ] **Step 5: Extend the shared types**

In `src/shared/ipc.ts`, find `export interface Book {` and insert immediately above it:

```ts
/** Whether a library item is a book or a journal article (the folder it lives in decides). */
export type BookKind = 'book' | 'article'

```

Inside `Book`, after the line `  tags: string[]` (the last field, before the closing brace of `Book`), add:

```ts
  kind: BookKind
  journal: string | null
  volume: string | null
  issue: string | null
  pages: string | null
  doi: string | null
```

Inside `BookUpdate`, after `  pageOffset?: number`, add:

```ts
  journal?: string | null
  volume?: string | null
  issue?: string | null
  pages?: string | null
  doi?: string | null
```

- [ ] **Step 6: Persist and return the new fields in `library.ts`**

1. In the `import type { Book, BookUpdate, ... } from '../../shared/ipc'` block add `BookKind,` after `Book,`.
2. In `interface BookRow`, after `  indexed: number` add:

```ts
  kind: string
  journal: string | null
  volume: string | null
  issue: string | null
  pages: string | null
  doi: string | null
```

3. In `rowToBook`, find:

```ts
    indexed: !!r.indexed,
    shelfIds,
    tags
  }
```

Replace with:

```ts
    indexed: !!r.indexed,
    shelfIds,
    tags,
    kind: (r.kind === 'article' ? 'article' : 'book') satisfies BookKind,
    journal: r.journal,
    volume: r.volume,
    issue: r.issue,
    pages: r.pages,
    doi: r.doi
  }
```

4. In `updateBook`, find `    pageOffset: 'page_offset'\n  }` inside `const columns: Record<keyof BookUpdate, string> = {` and replace with:

```ts
    pageOffset: 'page_offset',
    journal: 'journal',
    volume: 'volume',
    issue: 'issue',
    pages: 'pages',
    doi: 'doi'
  }
```

- [ ] **Step 7: Carry the fields in the sidecar**

In `src/main/services/sidecar.ts`:

1. In `interface SideRow` add after `  local_path: string | null`:

```ts
  journal: string | null
  volume: string | null
  issue: string | null
  pages: string | null
  doi: string | null
```

2. In `interface SidecarData` add after `  tags?: string[]`:

```ts
  journal?: string | null
  volume?: string | null
  issue?: string | null
  pages?: string | null
  doi?: string | null
```

3. In `writeSidecarForBook` change the SELECT list `status, page_offset, cover_path, pdf_path, local_path` to `status, page_offset, cover_path, pdf_path, local_path, journal, volume, issue, pages, doi`.
4. In the `meta` object, after `    pageOffset: r.page_offset,` add:

```ts
    journal: r.journal,
    volume: r.volume,
    issue: r.issue,
    pages: r.pages,
    doi: r.doi,
```

- [ ] **Step 8: Write the integration test harness and first tests**

Create `src/main/services/library.articles.test.ts`:

```ts
import Database from 'better-sqlite3'
import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runMigrations } from '../db/migrations'

let db: Database.Database
let root: string
let dataDir: string
let vault: string
let local: string
const cfg = { vaultPath: '' as string | null, primaryLibraryPath: null as string | null, keepLocalCopies: false }

// library.ts reaches the database, the app-data dir and the config only through these modules;
// swap them so the tests never touch Electron (same pattern as quotes.test.ts).
vi.mock('../db/connection', () => ({
  getDb: () => db,
  getDataDir: () => dataDir
}))
vi.mock('./config', () => ({
  readConfig: () => ({ ...cfg }),
  localVaultDir: () => join(dataDir, 'vault')
}))
vi.mock('./vaultsync', () => ({ removeFromDrive: () => undefined }))

beforeEach(() => {
  db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
  root = mkdtempSync(join(tmpdir(), 'loci-lib-'))
  dataDir = join(root, 'data')
  vault = join(root, 'vault')
  local = join(root, 'local')
  for (const d of [dataDir, vault, local]) mkdirSync(d, { recursive: true })
  cfg.vaultPath = vault
  cfg.primaryLibraryPath = null
  cfg.keepLocalCopies = false
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

// Imported after the mocks are declared; vitest hoists vi.mock above this either way.
import { listBooks, updateBook } from './library'

function insertBook(id: string, title = id): void {
  db.prepare('INSERT INTO books (id, title, title_sanitized, date_added) VALUES (?, ?, ?, 0)').run(id, title, title)
}

describe('article fields', () => {
  it('lists an existing row as a book with empty article fields', () => {
    insertBook('b1')
    const [b] = listBooks()
    expect(b).toMatchObject({ kind: 'book', journal: null, volume: null, issue: null, pages: null, doi: null })
  })

  it('updateBook stores article details and listBooks returns them', () => {
    insertBook('b1')
    updateBook('b1', { journal: 'Concordia Journal', volume: '12', issue: '3', pages: '45–67', doi: '10.1000/xyz123' })
    const [b] = listBooks()
    expect(b).toMatchObject({
      journal: 'Concordia Journal',
      volume: '12',
      issue: '3',
      pages: '45–67',
      doi: '10.1000/xyz123'
    })
  })

  it('updateBook clears an article field with null', () => {
    insertBook('b1')
    updateBook('b1', { journal: 'CJ', issue: '3' })
    updateBook('b1', { issue: null })
    const [b] = listBooks()
    expect(b.journal).toBe('CJ')
    expect(b.issue).toBeNull()
  })
})
```

- [ ] **Step 9: Run the harness tests and the typecheck**

Run: `npm test -- src/main/services/library.articles.test.ts`
Expected: PASS (3 tests).
Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add src/main/db/migrations.ts src/main/db/migrations.test.ts src/main/services/commentary.test.ts src/shared/ipc.ts src/main/services/library.ts src/main/services/sidecar.ts src/main/services/library.articles.test.ts
git commit -m "feat(library): migration 25 adds book kind and article fields

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Kind from path, import into Books/Articles, sync assigns kind (model: sonnet)

**Files:**
- Create: `src/shared/libraryKind.ts`
- Create: `src/shared/libraryKind.test.ts`
- Modify: `src/main/services/library.ts`
- Modify: `src/main/services/library.articles.test.ts`
- Modify: `src/main/ipc/index.ts`, `src/preload/index.ts`, `src/shared/ipc.ts` (the `importFiles(kind?)` signature)
- Modify: `src/renderer/src/store/useStore.ts` (pass-through only, so the typecheck stays green)

**Interfaces:**
- Consumes: `BookKind`, `Book.kind` (Task 1).
- Produces (`src/shared/libraryKind.ts`):
  - `export interface KindRoots { vaultPdfs: string | null; localLibrary: string | null }`
  - `export function kindFromPath(file: string, roots: KindRoots): BookKind | null` (null when the file is under neither root)
  - `export const KIND_LABEL: Record<BookKind, string>` (`Book`/`Article`), `KIND_PLURAL` (`Books`/`Articles`)
  - `export function ofKind<T extends { kind: BookKind }>(items: T[], kind: BookKind): T[]`
  - (`retargetPath` is added in Task 3.)
- Produces (`library.ts`): `quickImport(paths, onProgress, kind?: BookKind)`; internal `kindRoots(vaultPath, local)`; `rederiveKinds()` run at the end of `syncLibrary`; `syncLibrary` now scans `pdfs/Books` and `pdfs/Articles`.
- Produces (`LociApi`): `importFiles(kind?: BookKind): Promise<ImportResult>`; store `importFiles(kind?: BookKind)`.

- [ ] **Step 1: Write the failing pure tests**

Create `src/shared/libraryKind.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { KIND_LABEL, KIND_PLURAL, kindFromPath, ofKind, type KindRoots } from './libraryKind'

const roots: KindRoots = { vaultPdfs: 'G:\\Drive\\Loci\\pdfs', localLibrary: 'D:\\Theology\\PDF' }

describe('kindFromPath (vault)', () => {
  it('pdfs/Books is a book', () => {
    expect(kindFromPath('G:\\Drive\\Loci\\pdfs\\Books\\A - B.pdf', roots)).toBe('book')
  })
  it('pdfs/Articles is an article, at any depth', () => {
    expect(kindFromPath('G:\\Drive\\Loci\\pdfs\\Articles\\A - B.pdf', roots)).toBe('article')
    expect(kindFromPath('G:\\Drive\\Loci\\pdfs\\Articles\\Journals\\CJ\\A - B.pdf', roots)).toBe('article')
  })
  it('is case-insensitive on the folder and the root, and accepts forward slashes', () => {
    expect(kindFromPath('g:/drive/loci/PDFS/ARTICLES/x.pdf', roots)).toBe('article')
  })
  it('any other vault pdf folder is a book', () => {
    expect(kindFromPath('G:\\Drive\\Loci\\pdfs\\Old\\x.pdf', roots)).toBe('book')
  })
  it('a file directly in pdfs is a book, and a folder called Articles NAMING the file is not a folder', () => {
    expect(kindFromPath('G:\\Drive\\Loci\\pdfs\\x.pdf', roots)).toBe('book')
    expect(kindFromPath('G:\\Drive\\Loci\\pdfs\\Books\\Articles.pdf', roots)).toBe('book')
  })
})

describe('kindFromPath (local library folder)', () => {
  it('a file in the root is a book', () => {
    expect(kindFromPath('D:\\Theology\\PDF\\Calvin - Institutes.pdf', roots)).toBe('book')
  })
  it('any directory named Articles at any depth makes an article (case-insensitive)', () => {
    expect(kindFromPath('D:\\Theology\\PDF\\Articles\\x.pdf', roots)).toBe('article')
    expect(kindFromPath('D:\\Theology\\PDF\\Luther\\ARTICLES\\2020\\x.pdf', roots)).toBe('article')
    expect(kindFromPath('D:\\Theology\\PDF\\articles\\x.pdf', roots)).toBe('article')
  })
  it('a directory that merely contains the word is not Articles', () => {
    expect(kindFromPath('D:\\Theology\\PDF\\Smalcald Articles\\x.pdf', roots)).toBe('book')
  })
})

describe('kindFromPath (outside both roots)', () => {
  it('returns null', () => {
    expect(kindFromPath('C:\\Users\\me\\Downloads\\x.pdf', roots)).toBeNull()
    expect(kindFromPath('x.pdf', { vaultPdfs: null, localLibrary: null })).toBeNull()
  })
  it('does not treat a sibling folder with the same prefix as inside the root', () => {
    expect(kindFromPath('D:\\Theology\\PDF-old\\Articles\\x.pdf', roots)).toBeNull()
  })
})

describe('labels and ofKind', () => {
  it('labels', () => {
    expect(KIND_LABEL).toEqual({ book: 'Book', article: 'Article' })
    expect(KIND_PLURAL).toEqual({ book: 'Books', article: 'Articles' })
  })
  it('filters by kind', () => {
    const items = [
      { id: 1, kind: 'book' as const },
      { id: 2, kind: 'article' as const }
    ]
    expect(ofKind(items, 'article').map((i) => i.id)).toEqual([2])
    expect(ofKind(items, 'book').map((i) => i.id)).toEqual([1])
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/shared/libraryKind.test.ts`
Expected: FAIL (module `./libraryKind` not found).

- [ ] **Step 3: Implement `libraryKind.ts`**

Create `src/shared/libraryKind.ts`:

```ts
// Books vs articles: the folder a file lives in decides its kind. Pure string logic (no Node
// `path`) so main and renderer can share it and tests run without Electron.

import type { BookKind } from './ipc'

export interface KindRoots {
  /** `<vault>/pdfs`, or null when no vault is configured. */
  vaultPdfs: string | null
  /** The user's local PDF library folder, or null. */
  localLibrary: string | null
}

export const KIND_LABEL: Record<BookKind, string> = { book: 'Book', article: 'Article' }
export const KIND_PLURAL: Record<BookKind, string> = { book: 'Books', article: 'Articles' }

export function ofKind<T extends { kind: BookKind }>(items: T[], kind: BookKind): T[] {
  return items.filter((i) => i.kind === kind)
}

/** The path segments of `file` below `root`, or null when `file` is not strictly inside it.
 *  Compares case-insensitively and treats `\` and `/` alike (Windows paths). */
function segmentsUnder(file: string, root: string | null): string[] | null {
  if (!root) return null
  const f = file.replace(/\\/g, '/')
  const r = root.replace(/\\/g, '/').replace(/\/+$/, '')
  if (f.length <= r.length + 1) return null
  if (f.slice(0, r.length).toLowerCase() !== r.toLowerCase() || f[r.length] !== '/') return null
  return f
    .slice(r.length + 1)
    .split('/')
    .filter(Boolean)
}

const isArticlesDir = (s: string): boolean => s.toLowerCase() === 'articles'

/**
 * The kind a file's location implies, or null when it is under neither root (the id-named cache
 * copy, an external original). Vault: `pdfs/Articles/**` is an article, anything else a book.
 * Local library: a file below ANY directory named `Articles` (case-insensitive, any depth) is an
 * article; the file name itself never counts.
 */
export function kindFromPath(file: string, roots: KindRoots): BookKind | null {
  const v = segmentsUnder(file, roots.vaultPdfs)
  if (v) return v.length > 1 && isArticlesDir(v[0]) ? 'article' : 'book'
  const l = segmentsUnder(file, roots.localLibrary)
  if (l) return l.slice(0, -1).some(isArticlesDir) ? 'article' : 'book'
  return null
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/shared/libraryKind.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing integration tests (sync + import)**

In `src/main/services/library.articles.test.ts` replace the first import line `import { mkdirSync, mkdtempSync, rmSync } from 'fs'` with:

```ts
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
```

Replace `import { listBooks, updateBook } from './library'` with:

```ts
import { listBooks, quickImport, syncLibrary, updateBook } from './library'
```

Add this helper after `insertBook`:

```ts
/** Write a fake PDF (importOneLocal never parses the bytes); a distinct length per file keeps
 *  the byte-size duplicate check in syncLibrary from treating two files as the same book. */
function writePdf(path: string, size: number): void {
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, Buffer.alloc(size, 1))
}

const kindsByTitle = (): Record<string, string> => Object.fromEntries(listBooks().map((b) => [b.title, b.kind]))
```

Append at the end of the file:

```ts
describe('syncLibrary assigns kind from the folder', () => {
  it('vault Books/Articles and local Articles/other are derived and local-only files are copied up', async () => {
    cfg.primaryLibraryPath = local
    writePdf(join(vault, 'pdfs', 'Books', 'Alpha - Bob.pdf'), 101)
    writePdf(join(vault, 'pdfs', 'Articles', 'Beta - Carl.pdf'), 102)
    writePdf(join(local, 'Articles', 'sub', 'Gamma - Dee.pdf'), 103)
    writePdf(join(local, 'Delta - Eve.pdf'), 104)

    await syncLibrary()

    expect(kindsByTitle()).toEqual({ Alpha: 'book', Beta: 'article', Gamma: 'article', Delta: 'book' })
    // Local-only files are uploaded into the vault folder matching their kind.
    expect(existsSync(join(vault, 'pdfs', 'Articles', 'Gamma - Dee.pdf'))).toBe(true)
    expect(existsSync(join(vault, 'pdfs', 'Books', 'Delta - Eve.pdf'))).toBe(true)
  })

  it('treats a local folder called ARTICLES (any case) as articles', async () => {
    cfg.primaryLibraryPath = local
    writePdf(join(local, 'ARTICLES', 'Zed - Yan.pdf'), 105)
    await syncLibrary()
    expect(kindsByTitle()).toEqual({ Zed: 'article' })
  })

  it('re-derives kind from the folder on every sync', async () => {
    writePdf(join(vault, 'pdfs', 'Articles', 'Beta - Carl.pdf'), 102)
    await syncLibrary()
    db.prepare("UPDATE books SET kind = 'book' WHERE title = 'Beta'").run()
    await syncLibrary()
    expect(kindsByTitle()).toEqual({ Beta: 'article' })
  })

  it('does not prune an article that is catalogued in pdfs/Articles', async () => {
    writePdf(join(vault, 'pdfs', 'Articles', 'Beta - Carl.pdf'), 102)
    await syncLibrary()
    const res = await syncLibrary()
    expect(res.removed).toBe(0)
    expect(listBooks()).toHaveLength(1)
  })
})

describe('quickImport copies into the chosen folder', () => {
  it('an article lands in pdfs/Articles', async () => {
    const src = join(root, 'ext', 'Zeta - Fay.pdf')
    writePdf(src, 201)
    const res = await quickImport([src], () => undefined, 'article')
    expect(res.imported).toBe(1)
    expect(existsSync(join(vault, 'pdfs', 'Articles', 'Zeta - Fay.pdf'))).toBe(true)
    expect(kindsByTitle()).toEqual({ Zeta: 'article' })
  })

  it('defaults to a book in pdfs/Books', async () => {
    const src = join(root, 'ext', 'Zeta - Fay.pdf')
    writePdf(src, 201)
    await quickImport([src], () => undefined)
    expect(existsSync(join(vault, 'pdfs', 'Books', 'Zeta - Fay.pdf'))).toBe(true)
    expect(kindsByTitle()).toEqual({ Zeta: 'book' })
  })

  it('a file already inside the vault keeps the kind its folder implies, whatever was asked', async () => {
    const src = join(vault, 'pdfs', 'Articles', 'Eta - Gus.pdf')
    writePdf(src, 202)
    await quickImport([src], () => undefined, 'book')
    expect(kindsByTitle()).toEqual({ Eta: 'article' })
  })
})
```

- [ ] **Step 6: Run to verify it fails**

Run: `npm test -- src/main/services/library.articles.test.ts`
Expected: FAIL (no `kind` assigned / `Articles` not scanned; `quickImport` ignores the third argument).

- [ ] **Step 7: Implement in `library.ts`**

1. Add imports. After the existing line `import * as search from './search'` add:

```ts
import { kindFromPath, type KindRoots } from '../../shared/libraryKind'
```

2. Add this helper directly above `/** Where this book will be read from, without actually opening it. */`:

```ts
/** The two roots the folder-decides-the-kind rule is evaluated against. */
function kindRoots(vaultPath: string | null, localLibrary: string | null): KindRoots {
  return { vaultPdfs: vaultPath ? join(vaultPath, 'pdfs') : null, localLibrary }
}
```

3. `importOneLocal` signature. Find:

```ts
async function importOneLocal(
  sourcePath: string,
  opts?: { skipDownload?: boolean }
): Promise<ImportOutcome> {
```

Replace with:

```ts
async function importOneLocal(
  sourcePath: string,
  opts?: { skipDownload?: boolean; kind?: BookKind }
): Promise<ImportOutcome> {
```

4. Decide the kind. Find:

```ts
    let pdfPath: string
    if (isInside(sourcePath, cfg.vaultPath)) {
```

Replace with:

```ts
    // The folder decides the kind. A file already in the vault keeps what its folder implies; one
    // coming from outside uses the kind the caller asked for, else what its local folder implies.
    const roots = kindRoots(cfg.vaultPath, cfg.primaryLibraryPath)
    const kind: BookKind = isInside(sourcePath, cfg.vaultPath)
      ? (kindFromPath(sourcePath, roots) ?? 'book')
      : (opts?.kind ?? kindFromPath(sourcePath, roots) ?? 'book')

    let pdfPath: string
    if (isInside(sourcePath, cfg.vaultPath)) {
```

5. Copy into the matching vault folder. Find:

```ts
      const booksDir = join(cfg.vaultPath, 'pdfs', 'Books')
      mkdirSync(booksDir, { recursive: true })
      const base = fileBaseFor(title, author, series, seriesNumber)
      let dest = join(booksDir, `${base}.pdf`)
      if (existsSync(dest)) dest = join(booksDir, `${base}-${id.slice(0, 8)}.pdf`)
```

Replace with:

```ts
      const targetDir = join(cfg.vaultPath, 'pdfs', kind === 'article' ? 'Articles' : 'Books')
      mkdirSync(targetDir, { recursive: true })
      const base = fileBaseFor(title, author, series, seriesNumber)
      let dest = join(targetDir, `${base}.pdf`)
      if (existsSync(dest)) dest = join(targetDir, `${base}-${id.slice(0, 8)}.pdf`)
```

6. Local offline copy of an article goes under `<local>/Articles`. Find:

```ts
          const dir = intoLibrary
            ? (cfg.primaryLibraryPath as string)
            : join(getDataDir(), 'pdf-cache')
```

Replace with:

```ts
          const libraryRoot = cfg.primaryLibraryPath as string
          const dir = intoLibrary
            ? kind === 'article'
              ? join(libraryRoot, 'Articles')
              : libraryRoot
            : join(getDataDir(), 'pdf-cache')
```

7. The INSERT. Find:

```ts
           (id, title, title_sanitized, author, series, series_number, series_abbr, year,
            publisher, city, page_offset, pdf_path, local_path, source_path, date_added, status,
            meta_fetched)
         VALUES
           (@id, @title, @san, @author, @series, @num, @abbr, @year, @publisher, @city,
            @offset, @pdf, @local, @source, @added, @status, @fetched)`
```

Replace with:

```ts
           (id, title, title_sanitized, author, series, series_number, series_abbr, year,
            publisher, city, page_offset, pdf_path, local_path, source_path, date_added, status,
            meta_fetched, kind, journal, volume, issue, pages, doi)
         VALUES
           (@id, @title, @san, @author, @series, @num, @abbr, @year, @publisher, @city,
            @offset, @pdf, @local, @source, @added, @status, @fetched, @kind, @journal, @volume,
            @issue, @pages, @doi)`
```

and in the `.run({ ... })` object, after `        fetched: 1` change to:

```ts
        fetched: 1,
        kind,
        journal: side?.journal ?? null,
        volume: side?.volume ?? null,
        issue: side?.issue ?? null,
        pages: side?.pages ?? null,
        doi: side?.doi ?? null
```

(The existing line is `        fetched: 1` followed by a newline and `      })`; keep the closing `})`.)

8. `quickImport`. Find:

```ts
export async function quickImport(
  paths: string[],
  onProgress: (p: ImportProgress) => void
): Promise<ImportResult> {
```

Replace with:

```ts
export async function quickImport(
  paths: string[],
  onProgress: (p: ImportProgress) => void,
  kind?: BookKind
): Promise<ImportResult> {
```

and `const outcome = await importOneLocal(paths[i])` with `const outcome = await importOneLocal(paths[i], { kind })`.

9. `syncLibrary` scans both vault folders. Find:

```ts
  const booksDir = join(cfg.vaultPath, 'pdfs', 'Books')
  const vaultFiles = existsSync(booksDir) ? walkPdfs(booksDir, NO_EXCLUDES) : []
```

Replace with:

```ts
  const booksDir = join(cfg.vaultPath, 'pdfs', 'Books')
  const articlesDir = join(cfg.vaultPath, 'pdfs', 'Articles')
  const vaultFiles = [booksDir, articlesDir].flatMap((d) => (existsSync(d) ? walkPdfs(d, NO_EXCLUDES) : []))
```

10. The prune guard counts both folders. Find:

```ts
        .prepare('SELECT COUNT(*) c FROM books WHERE pdf_path LIKE ?')
        .get(`${booksDir}%`) as { c: number }
```

Replace with:

```ts
        .prepare('SELECT COUNT(*) c FROM books WHERE pdf_path LIKE ? OR pdf_path LIKE ?')
        .get(`${booksDir}%`, `${articlesDir}%`) as { c: number }
```

11. Re-derive after the passes. Find:

```ts
  onProgress?.({ phase: 'done', done: 0, total: 0 })
  onChanged?.()
  return { added: titles.length, removed, total: bookCount(), titles }
}
```

Replace with:

```ts
  // The folder is the source of truth for kind: re-derive every row (Decision 5).
  rederiveKinds()

  onProgress?.({ phase: 'done', done: 0, total: 0 })
  onChanged?.()
  return { added: titles.length, removed, total: bookCount(), titles }
}

/** Set every row's kind from where its file lives. The vault copy decides when it is under
 *  `<vault>/pdfs`; otherwise the local library copy does. Rows whose files sit elsewhere (the
 *  id-named cache, external originals) keep their stored kind. Returns how many rows changed. */
export function rederiveKinds(): number {
  const cfg = readConfig()
  const roots = kindRoots(cfg.vaultPath, cfg.primaryLibraryPath)
  const rows = getDb().prepare('SELECT id, kind, pdf_path, local_path FROM books').all() as {
    id: string
    kind: string
    pdf_path: string | null
    local_path: string | null
  }[]
  const update = getDb().prepare('UPDATE books SET kind = ? WHERE id = ?')
  let changed = 0
  for (const r of rows) {
    const derived =
      (r.pdf_path ? kindFromPath(r.pdf_path, roots) : null) ??
      (r.local_path ? kindFromPath(r.local_path, roots) : null)
    if (derived && derived !== r.kind) {
      update.run(derived, r.id)
      changed++
    }
  }
  return changed
}
```

12. Update the doc comment above `syncLibrary` is optional; leave it.

- [ ] **Step 8: Thread the kind through IPC, preload, store**

1. `src/shared/ipc.ts`: in `LociApi` change `  importFiles(): Promise<ImportResult>` to `  importFiles(kind?: BookKind): Promise<ImportResult>`.
2. `src/preload/index.ts`: change `  importFiles: () => ipcRenderer.invoke(Channels.importFiles),` to `  importFiles: (kind) => ipcRenderer.invoke(Channels.importFiles, kind),`.
3. `src/main/ipc/index.ts`: add `BookKind,` to the `import type { ... } from '../../shared/ipc'` list. Change the handler header `ipcMain.handle(Channels.importFiles, async (e) => {` to `ipcMain.handle(Channels.importFiles, async (e, kind?: BookKind) => {`, change `title: 'Import PDFs',` to ``title: kind === 'article' ? 'Import articles' : 'Import books',``, and `const result = await library.quickImport(res.filePaths, notify)` to `const result = await library.quickImport(res.filePaths, notify, kind)`. (The `quickImport(library.collectSourcePdfs(), notify)` call in `importFromSource` stays as is: those files are inside the vault, so their folder decides.)
4. `src/renderer/src/store/useStore.ts`: in the store interface change `  importFiles: () => Promise<ImportResult>` to `  importFiles: (kind?: BookKind) => Promise<ImportResult>`; in the implementation change `    importFiles: async () => {` to `    importFiles: async (kind) => {` and `const result = await api.importFiles()` to `const result = await api.importFiles(kind)`. Add `BookKind` to the existing `import type { ... } from '@shared/ipc'` list in that file.

- [ ] **Step 9: Run tests and typecheck**

Run: `npm test -- src/main/services/library.articles.test.ts src/shared/libraryKind.test.ts`
Expected: PASS.
Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add src/shared/libraryKind.ts src/shared/libraryKind.test.ts src/main/services/library.ts src/main/services/library.articles.test.ts src/main/ipc/index.ts src/preload/index.ts src/shared/ipc.ts src/renderer/src/store/useStore.ts
git commit -m "feat(library): derive book/article kind from the folder; import and sync honour it

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Move to Articles / Move to Books (model: sonnet)

**Files:**
- Modify: `src/shared/libraryKind.ts`
- Modify: `src/shared/libraryKind.test.ts`
- Modify: `src/main/services/library.ts`
- Modify: `src/main/services/library.articles.test.ts`
- Modify: `src/shared/ipc.ts`, `src/preload/index.ts`, `src/main/ipc/index.ts`
- Modify: `src/renderer/src/store/useStore.ts`

**Interfaces:**
- Consumes: `KindRoots`, `kindFromPath`, `BookKind` (Task 2); `rowToBook`, `moveSidecar`, `writeSidecarForBook`, `invalidatePrimaryIndex`, `isInside` (existing in `library.ts`).
- Produces: `retargetPath(file: string, roots: KindRoots, to: BookKind): string | null` (null when the file is under neither root); `library.moveBook(id: string, to: BookKind): Book | null` (null when the id is unknown or a file move failed); channel `Channels.moveBook = 'library:moveBook'`; `LociApi.moveBook(id: string, kind: BookKind): Promise<Book | null>`; store action `moveBook(id: string, kind: BookKind): Promise<boolean>`.

- [ ] **Step 1: Write the failing pure tests for `retargetPath`**

In `src/shared/libraryKind.test.ts` change the import to include `retargetPath`:

```ts
import { KIND_LABEL, KIND_PLURAL, kindFromPath, ofKind, retargetPath, type KindRoots } from './libraryKind'
```

Append:

```ts
describe('retargetPath', () => {
  it('vault: swaps the first segment and keeps the rest of the layout', () => {
    expect(retargetPath('G:\\Drive\\Loci\\pdfs\\Books\\A - B.pdf', roots, 'article')).toBe(
      'G:\\Drive\\Loci\\pdfs\\Articles\\A - B.pdf'
    )
    expect(retargetPath('G:\\Drive\\Loci\\pdfs\\Articles\\CJ\\A - B.pdf', roots, 'book')).toBe(
      'G:\\Drive\\Loci\\pdfs\\Books\\CJ\\A - B.pdf'
    )
  })
  it('vault: a legacy folder is nested under the target', () => {
    expect(retargetPath('G:\\Drive\\Loci\\pdfs\\Old\\x.pdf', roots, 'article')).toBe(
      'G:\\Drive\\Loci\\pdfs\\Articles\\Old\\x.pdf'
    )
  })
  it('local: to article nests under <root>/Articles; to book removes every Articles segment', () => {
    expect(retargetPath('D:\\Theology\\PDF\\x.pdf', roots, 'article')).toBe('D:\\Theology\\PDF\\Articles\\x.pdf')
    expect(retargetPath('D:\\Theology\\PDF\\Luther\\x.pdf', roots, 'article')).toBe(
      'D:\\Theology\\PDF\\Articles\\Luther\\x.pdf'
    )
    expect(retargetPath('D:\\Theology\\PDF\\Articles\\Luther\\x.pdf', roots, 'book')).toBe(
      'D:\\Theology\\PDF\\Luther\\x.pdf'
    )
    expect(retargetPath('D:\\Theology\\PDF\\articles\\x.pdf', roots, 'book')).toBe('D:\\Theology\\PDF\\x.pdf')
  })
  it('local: a file already in an Articles folder is unchanged when moving to article', () => {
    expect(retargetPath('D:\\Theology\\PDF\\Articles\\x.pdf', roots, 'article')).toBe(
      'D:\\Theology\\PDF\\Articles\\x.pdf'
    )
  })
  it('keeps forward slashes when given forward slashes', () => {
    expect(retargetPath('G:/Drive/Loci/pdfs/Books/x.pdf', roots, 'article')).toBe(
      'G:\\Drive\\Loci\\pdfs'.replace(/\\/g, '/') + '/Articles/x.pdf'
    )
  })
  it('returns null outside both roots', () => {
    expect(retargetPath('C:\\tmp\\x.pdf', roots, 'article')).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/shared/libraryKind.test.ts`
Expected: FAIL (`retargetPath` is not exported).

- [ ] **Step 3: Implement `retargetPath`**

Append to `src/shared/libraryKind.ts`:

```ts
const trimRoot = (root: string): string => root.replace(/[\\/]+$/, '')

/**
 * Where `file` belongs once it is made a `to` item, keeping its relative layout, or null when the
 * file is under neither root. Vault: the first segment becomes `Books`/`Articles` (a legacy folder
 * is nested under the target). Local library: to article nests the path under `<root>/Articles`;
 * to book removes every `Articles` directory segment. The separator style of `file` is kept.
 */
export function retargetPath(file: string, roots: KindRoots, to: BookKind): string | null {
  const sep = file.includes('\\') ? '\\' : '/'
  const join = (root: string, segs: string[]): string =>
    [trimRoot(root).replace(/[\\/]/g, sep), ...segs].join(sep)

  const v = segmentsUnder(file, roots.vaultPdfs)
  if (v && roots.vaultPdfs) {
    const rest = v.length > 1 && /^(books|articles)$/i.test(v[0]) ? v.slice(1) : v
    return join(roots.vaultPdfs, [to === 'article' ? 'Articles' : 'Books', ...rest])
  }
  const l = segmentsUnder(file, roots.localLibrary)
  if (l && roots.localLibrary) {
    const dirs = l.slice(0, -1)
    const name = l[l.length - 1]
    if (to === 'article') {
      return join(roots.localLibrary, dirs.some(isArticlesDir) ? l : ['Articles', ...l])
    }
    return join(roots.localLibrary, [...dirs.filter((d) => !isArticlesDir(d)), name])
  }
  return null
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/shared/libraryKind.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing integration tests for `moveBook`**

In `src/main/services/library.articles.test.ts` extend the library import:

```ts
import { listBooks, moveBook, quickImport, syncLibrary, updateBook } from './library'
```

Append:

```ts
describe('moveBook', () => {
  async function seedVaultBook(dir: 'Books' | 'Articles', name: string): Promise<string> {
    writePdf(join(vault, 'pdfs', dir, name), 300)
    await syncLibrary()
    return (db.prepare('SELECT id FROM books').get() as { id: string }).id
  }

  it('moves a vault book to Articles, keeps the id and the quotes, updates path and kind', async () => {
    const id = await seedVaultBook('Books', 'Alpha - Bob.pdf')
    db.prepare("INSERT INTO quotes (id, book_id, text, created) VALUES ('q1', ?, 'a quote', 1)").run(id)

    const moved = moveBook(id, 'article')

    expect(moved).not.toBeNull()
    expect(moved?.id).toBe(id)
    expect(moved?.kind).toBe('article')
    expect(existsSync(join(vault, 'pdfs', 'Articles', 'Alpha - Bob.pdf'))).toBe(true)
    expect(existsSync(join(vault, 'pdfs', 'Books', 'Alpha - Bob.pdf'))).toBe(false)
    const row = db.prepare('SELECT pdf_path, kind FROM books WHERE id = ?').get(id) as { pdf_path: string; kind: string }
    expect(row).toEqual({ pdf_path: join(vault, 'pdfs', 'Articles', 'Alpha - Bob.pdf'), kind: 'article' })
    expect((db.prepare('SELECT COUNT(*) n FROM quotes WHERE book_id = ?').get(id) as { n: number }).n).toBe(1)
  })

  it('a name collision gets the -<id8> suffix', async () => {
    const id = await seedVaultBook('Books', 'Alpha - Bob.pdf')
    writePdf(join(vault, 'pdfs', 'Articles', 'Alpha - Bob.pdf'), 999) // already taken by another file
    const moved = moveBook(id, 'article')
    expect(moved?.kind).toBe('article')
    const row = db.prepare('SELECT pdf_path FROM books WHERE id = ?').get(id) as { pdf_path: string }
    expect(row.pdf_path).toBe(join(vault, 'pdfs', 'Articles', `Alpha - Bob-${id.slice(0, 8)}.pdf`))
    expect(existsSync(row.pdf_path)).toBe(true)
    expect(existsSync(join(vault, 'pdfs', 'Articles', 'Alpha - Bob.pdf'))).toBe(true) // the other file untouched
  })

  it('moves back to Books, and the next sync keeps the kind', async () => {
    const id = await seedVaultBook('Articles', 'Beta - Carl.pdf')
    expect(moveBook(id, 'book')?.kind).toBe('book')
    expect(existsSync(join(vault, 'pdfs', 'Books', 'Beta - Carl.pdf'))).toBe(true)
    await syncLibrary()
    expect(listBooks().map((b) => b.kind)).toEqual(['book'])
    expect(listBooks()).toHaveLength(1) // not re-catalogued as a second row
  })

  it('moves the local library copy too (into / out of an Articles folder)', async () => {
    cfg.primaryLibraryPath = local
    const id = await seedVaultBook('Books', 'Alpha - Bob.pdf')
    const localFile = join(local, 'Alpha - Bob.pdf')
    writePdf(localFile, 300)
    db.prepare('UPDATE books SET local_path = ? WHERE id = ?').run(localFile, id)

    moveBook(id, 'article')
    expect(existsSync(join(local, 'Articles', 'Alpha - Bob.pdf'))).toBe(true)
    expect(existsSync(localFile)).toBe(false)
    expect((db.prepare('SELECT local_path FROM books WHERE id = ?').get(id) as { local_path: string }).local_path).toBe(
      join(local, 'Articles', 'Alpha - Bob.pdf')
    )

    moveBook(id, 'book')
    expect(existsSync(localFile)).toBe(true)
  })

  it('returns null for an unknown id and is a no-op when the kind already matches', async () => {
    expect(moveBook('nope', 'article')).toBeNull()
    const id = await seedVaultBook('Books', 'Alpha - Bob.pdf')
    expect(moveBook(id, 'book')?.kind).toBe('book')
    expect(existsSync(join(vault, 'pdfs', 'Books', 'Alpha - Bob.pdf'))).toBe(true)
  })
})
```

- [ ] **Step 6: Run to verify it fails**

Run: `npm test -- src/main/services/library.articles.test.ts`
Expected: FAIL (`moveBook` is not exported).

- [ ] **Step 7: Implement `moveBook`**

In `src/main/services/library.ts` change the libraryKind import to `import { kindFromPath, retargetPath, type KindRoots } from '../../shared/libraryKind'`.

Insert this block directly above `export function updateBook(id: string, patch: BookUpdate): void {`:

```ts
/** Move `src` to `dest`, creating the destination folder. Rename first; copy + unlink when the
 *  rename fails (a local library on a different drive than the Drive vault). */
function moveFile(src: string, dest: string): void {
  mkdirSync(dirname(dest), { recursive: true })
  try {
    renameSync(src, dest)
  } catch {
    copyFileSync(src, dest)
    unlinkSync(src)
  }
}

/** `dest`, or `<name>-<id8><ext>` beside it when something already occupies that name. */
function collisionFree(dest: string, id: string): string {
  if (!existsSync(dest)) return dest
  const ext = extname(dest)
  return join(dirname(dest), `${basename(dest, ext)}-${id.slice(0, 8)}${ext}`)
}

/**
 * Change an item between book and article by moving its file to the other folder (vault and local
 * library copies), keeping the row id so quotes, highlights and shelves stay attached. The id-named
 * cache copy and files outside both roots are left alone. If a file move fails part-way, the paths
 * already moved are saved, `kind` is left unchanged (the next sync re-derives it from where the
 * files really are) and null is returned.
 */
export function moveBook(id: string, to: BookKind): Book | null {
  const db = getDb()
  const r = db
    .prepare('SELECT kind, pdf_path, local_path, source_path FROM books WHERE id = ?')
    .get(id) as
    | { kind: string; pdf_path: string | null; local_path: string | null; source_path: string | null }
    | undefined
  if (!r) return null
  if (r.kind === to) {
    return rowToBook(db.prepare('SELECT * FROM books WHERE id = ?').get(id) as BookRow)
  }

  const cfg = readConfig()
  const roots = kindRoots(cfg.vaultPath, cfg.primaryLibraryPath)
  const cacheDir = join(getDataDir(), 'pdf-cache')
  const moved = new Map<string, string>()
  let ok = true
  for (const p of [r.pdf_path, r.local_path]) {
    if (!p || moved.has(p) || isInside(p, cacheDir) || !existsSync(p)) continue
    const target = retargetPath(p, roots, to)
    if (!target || target === p) continue
    try {
      const dest = collisionFree(target, id)
      moveFile(p, dest)
      moved.set(p, dest)
    } catch (e) {
      ok = false
      logImport(`FAIL move ${p} :: ${(e as Error)?.message ?? String(e)}`)
      break
    }
  }
  const follow = (p: string | null): string | null => (p ? (moved.get(p) ?? p) : p)
  const newPdf = follow(r.pdf_path)
  const newLocal = follow(r.local_path)
  const newSource = follow(r.source_path)
  db.prepare(
    'UPDATE books SET kind = ?, pdf_path = ?, local_path = ?, source_path = ? WHERE id = ?'
  ).run(ok ? to : r.kind, newPdf, newLocal, newSource, id)

  // The sidecar folder follows the file name's folder; a no-op when only Books<->Articles changed.
  moveSidecar(r.pdf_path, newPdf)
  moveSidecar(r.local_path, newLocal)
  invalidatePrimaryIndex()
  writeSidecarForBook(id)
  if (!ok) return null
  return rowToBook(db.prepare('SELECT * FROM books WHERE id = ?').get(id) as BookRow)
}
```

- [ ] **Step 8: Run the library tests**

Run: `npm test -- src/main/services/library.articles.test.ts src/shared/libraryKind.test.ts`
Expected: PASS.

- [ ] **Step 9: IPC, preload, store**

1. `src/shared/ipc.ts`: in the channel map add after `  relinkBook: 'library:relinkBook',`:

```ts
  moveBook: 'library:moveBook',
```

and in `LociApi` after `  relinkBook(id: string): Promise<Book | null>` add:

```ts
  /** Move a book or article to the other folder (changes its kind); null if the move failed. */
  moveBook(id: string, kind: BookKind): Promise<Book | null>
```

2. `src/preload/index.ts`: after the `relinkBook:` line add:

```ts
  moveBook: (id, kind) => ipcRenderer.invoke(Channels.moveBook, id, kind),
```

3. `src/main/ipc/index.ts`: after the `Channels.relinkBook` handler block (ends with `return book\n  })`) add:

```ts
  ipcMain.handle(Channels.moveBook, (e, id: string, kind: BookKind) => {
    const book = library.moveBook(id, kind)
    e.sender.send(Channels.libraryChanged)
    return book
  })
```

4. `src/renderer/src/store/useStore.ts`: in the store interface after `  updateBook: (id: string, patch: BookUpdate) => Promise<void>` add:

```ts
  /** Move to the other folder (changes kind); resolves true on success. */
  moveBook: (id: string, kind: BookKind) => Promise<boolean>
```

and in the implementation after the `updateBook: async (id, patch) => { ... },` block add:

```ts
    moveBook: async (id, kind) => {
      const moved = await api.moveBook(id, kind)
      await get().refreshLibrary()
      return !!moved
    },
```

- [ ] **Step 10: Typecheck, then commit**

Run: `npm run typecheck`
Expected: no errors.

```bash
git add src/shared/libraryKind.ts src/shared/libraryKind.test.ts src/main/services/library.ts src/main/services/library.articles.test.ts src/shared/ipc.ts src/preload/index.ts src/main/ipc/index.ts src/renderer/src/store/useStore.ts
git commit -m "feat(library): move a book or article to the other folder

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Article citation formatting (model: haiku)

**Files:**
- Modify: `src/shared/citation.ts`
- Modify: `src/shared/citation.test.ts`
- Modify: `src/main/services/quotes.ts`
- Modify: `src/main/services/quotes.test.ts`
- Modify: `src/renderer/src/components/library/QuotesPanel.tsx`

**Interfaces:**
- Consumes: `Book.kind` and article fields (Task 1) at the DB level (`books.kind`, `journal`, `volume`, `issue`, `pages`).
- Produces (`shared/citation.ts`): `SourceKind` gains `'article'`; `CitationSource` gains optional `journal/volume/issue/pages: string | null`; `formatCitation` handles `kind: 'article'` for all four styles; `export interface BookLike`; `export function bookCitationSource(b: BookLike): CitationSource` used by `quotes.ts` and `QuotesPanel.tsx`.

- [ ] **Step 1: Write the failing tests**

In `src/shared/citation.test.ts` change the import line to:

```ts
import {
  bocLabel,
  bocCitation,
  bookCitationSource,
  formatCitation,
  fathersCitation,
  fathersSectionLabel,
  romanToInt,
  type CitationSource
} from './citation'
```

Append:

```ts
describe('article citations', () => {
  const art: CitationSource = {
    kind: 'article',
    authors: ['Jane Smith'],
    title: 'On Grace',
    publisher: null,
    city: null,
    year: 1998,
    journal: 'Concordia Journal',
    volume: '12',
    issue: '3',
    pages: '45–67'
  }

  it('footnote: full form with the quoted page last', () => {
    expect(formatCitation(art, 'footnote', 52)).toBe(
      'Jane Smith, "On Grace," *Concordia Journal* 12, no. 3 (1998): 45–67, 52.'
    )
  })
  it('footnote: no quoted page', () => {
    expect(formatCitation(art, 'footnote', null)).toBe(
      'Jane Smith, "On Grace," *Concordia Journal* 12, no. 3 (1998): 45–67.'
    )
  })
  it('footnote: omits "no." without an issue', () => {
    expect(formatCitation({ ...art, issue: null }, 'footnote', 52)).toBe(
      'Jane Smith, "On Grace," *Concordia Journal* 12 (1998): 45–67, 52.'
    )
  })
  it('footnote: omits ": pages" without a range but still ends with the quoted page', () => {
    expect(formatCitation({ ...art, pages: null }, 'footnote', 52)).toBe(
      'Jane Smith, "On Grace," *Concordia Journal* 12, no. 3 (1998), 52.'
    )
  })
  it('footnote: omits the volume and year cleanly', () => {
    expect(formatCitation({ ...art, volume: null, issue: null, year: null, pages: null }, 'footnote', null)).toBe(
      'Jane Smith, "On Grace," *Concordia Journal*.'
    )
  })
  it('footnote: only a title and author', () => {
    const bare: CitationSource = { kind: 'article', authors: ['Jane Smith'], title: 'On Grace', publisher: null, city: null, year: null }
    expect(formatCitation(bare, 'footnote', null)).toBe('Jane Smith, "On Grace."')
  })
  it('footnote: two authors and a missing author placeholder', () => {
    expect(formatCitation({ ...art, authors: ['Jane Smith', 'John Doe'] }, 'footnote', null)).toBe(
      'Jane Smith and John Doe, "On Grace," *Concordia Journal* 12, no. 3 (1998): 45–67.'
    )
    expect(formatCitation({ ...art, authors: [] }, 'footnote', null)).toContain('[author], "On Grace,"')
  })
  it('short note, author-date and bibliography', () => {
    expect(formatCitation(art, 'short', 52)).toBe('Smith, "On Grace," 52.')
    expect(formatCitation(art, 'short', null)).toBe('Smith, "On Grace."')
    expect(formatCitation(art, 'author-date', 52)).toBe('(Smith 1998, 52)')
    expect(formatCitation(art, 'bibliography', 52)).toBe(
      'Smith, Jane. "On Grace." *Concordia Journal* 12, no. 3 (1998): 45–67.'
    )
  })
  it('book citations are unchanged', () => {
    const book: CitationSource = {
      kind: 'book',
      authors: ['Martin Chemnitz'],
      title: 'Examination of the Council of Trent',
      publisher: 'Concordia',
      city: 'St. Louis',
      year: 1971
    }
    expect(formatCitation(book, 'footnote', 12)).toBe(
      'Martin Chemnitz, *Examination of the Council of Trent* (Concordia, 1971), 12.'
    )
  })
})

describe('bookCitationSource', () => {
  it('builds a book source by default', () => {
    expect(
      bookCitationSource({ author: 'A B', title: 'T', publisher: 'P', city: 'C', year: 1900 })
    ).toEqual({ kind: 'book', authors: ['A B'], title: 'T', publisher: 'P', city: 'C', year: 1900 })
  })
  it('builds an article source from kind = article', () => {
    const s = bookCitationSource({
      kind: 'article',
      author: 'A B & C D',
      title: 'T',
      publisher: null,
      city: null,
      year: 2001,
      journal: 'J',
      volume: '1',
      issue: null,
      pages: '2–3'
    })
    expect(s).toMatchObject({ kind: 'article', authors: ['A B', 'C D'], journal: 'J', volume: '1', issue: null, pages: '2–3' })
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/shared/citation.test.ts`
Expected: FAIL (`bookCitationSource` not exported; article not formatted).

- [ ] **Step 3: Implement in `citation.ts`**

1. Change `export type SourceKind = 'book' | 'video' | 'image'` to `export type SourceKind = 'book' | 'article' | 'video' | 'image'`.
2. In `interface CitationSource` after `  url?: string | null` add:

```ts
  /** Article extras. */
  journal?: string | null
  volume?: string | null
  issue?: string | null
  /** Page range text, e.g. "45–67". */
  pages?: string | null
```

3. Insert this block directly above `const pagePart = (page: number | null): string => ...`:

```ts
const clean = (s: string | null | undefined): string => (s ?? '').trim()

/** `*Journal* 12, no. 3 (1998)` — each part only when present. */
function journalPart(src: CitationSource): string {
  const journal = clean(src.journal)
  const volume = clean(src.volume)
  const issue = clean(src.issue)
  let s = journal ? `*${journal}*` : ''
  if (volume) s = s ? `${s} ${volume}` : volume
  if (issue) s = s ? `${s}, no. ${issue}` : `no. ${issue}`
  if (src.year != null) s = s ? `${s} (${src.year})` : `(${src.year})`
  return s
}

/** `*Journal* 12, no. 3 (1998): 45–67, 52` — the page range and the quoted page are optional. */
function articleTail(src: CitationSource, page: number | null): string {
  let s = journalPart(src)
  const pages = clean(src.pages)
  if (pages) s += s ? `: ${pages}` : pages
  if (page != null) s += s ? `, ${page}` : String(page)
  return s
}

function formatArticle(src: CitationSource, style: CitationStyle, page: number | null): string {
  const name = title(src)
  switch (style) {
    case 'footnote': {
      const tail = articleTail(src, page)
      const who = authorsNote(src.authors)
      return tail ? `${who}, "${name}," ${tail}.` : `${who}, "${name}."`
    }
    case 'short': {
      const who = authorsShort(src.authors)
      return page != null ? `${who}, "${shortTitle(src)}," ${page}.` : `${who}, "${shortTitle(src)}."`
    }
    case 'author-date':
      return `(${authorsShort(src.authors)} ${yearStr(src)}${pagePart(page)})`
    case 'bibliography': {
      const tail = articleTail(src, null)
      const who = authorsBib(src.authors)
      return tail ? `${who}. "${name}." ${tail}.` : `${who}. "${name}."`
    }
  }
}

/** What a library item needs to be cited: the subset of a `books` row / `Book` used here. */
export interface BookLike {
  kind?: 'book' | 'article'
  author: string | null
  title: string
  publisher: string | null
  city: string | null
  year: number | null
  journal?: string | null
  volume?: string | null
  issue?: string | null
  pages?: string | null
}

/** The citation source for a library item — an article when its kind says so, else a book. */
export function bookCitationSource(b: BookLike): CitationSource {
  const base = {
    authors: parseAuthors(b.author),
    title: b.title,
    publisher: b.publisher,
    city: b.city,
    year: b.year
  }
  if (b.kind === 'article') {
    return {
      kind: 'article',
      ...base,
      journal: b.journal ?? null,
      volume: b.volume ?? null,
      issue: b.issue ?? null,
      pages: b.pages ?? null
    }
  }
  return { kind: 'book', ...base }
}

```

4. In `formatCitation`, directly after the `if (src.kind === 'video') { ... }` block (before `switch (style) {`), add:

```ts
  if (src.kind === 'article') return formatArticle(src, style, page)

```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/shared/citation.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing bibliography test**

In `src/main/services/quotes.test.ts` the `listAllQuotes, ...` import block imports from `./quotes`; add `buildBibliography` to that import list. Append at the end of the file:

```ts
describe('article bibliography entries', () => {
  it('prints a quoted article in article form and a quoted book in book form', () => {
    db.prepare(
      `INSERT INTO books (id, title, title_sanitized, author, year, kind, journal, volume, issue, pages)
       VALUES ('a1', 'On Grace', 'On Grace', 'Jane Smith', 1998, 'article', 'Concordia Journal', '12', '3', '45–67')`
    ).run()
    db.prepare(
      `INSERT INTO books (id, title, title_sanitized, author, publisher, city, year)
       VALUES ('b1', 'Loci Communes', 'Loci Communes', 'Martin Chemnitz', 'Concordia', 'St. Louis', 1989)`
    ).run()
    db.prepare("INSERT INTO quotes (id, book_id, text, created) VALUES ('q1', 'a1', 'x', 1)").run()
    db.prepare("INSERT INTO quotes (id, book_id, text, created) VALUES ('q2', 'b1', 'y', 1)").run()

    const entries = buildBibliography().map((e) => e.entry)

    expect(entries).toContain('Smith, Jane. "On Grace." *Concordia Journal* 12, no. 3 (1998): 45–67.')
    expect(entries).toContain('Chemnitz, Martin. *Loci Communes*. Concordia, 1989.')
  })
})
```

- [ ] **Step 6: Run to verify it fails**

Run: `npm test -- src/main/services/quotes.test.ts`
Expected: FAIL (the article prints as a book with `[publisher]` placeholders).

- [ ] **Step 7: Use `bookCitationSource` in `quotes.ts`**

1. In the citation import block at the top of `quotes.ts` (the one importing `formatCitation, parseAuthors, ...` from `'../../shared/citation'`) add `bookCitationSource`; remove `parseAuthors` and `type CitationSource` from that import only if the typecheck reports them unused after the edits below (they are used only by the two functions being replaced).
2. In `interface BookMetaRow` add after `  page_offset: number`:

```ts
  kind: string
  journal: string | null
  volume: string | null
  issue: string | null
  pages: string | null
```

3. Replace the whole `sourceFor` function:

```ts
function sourceFor(b: BookMetaRow): CitationSource {
  return {
    kind: 'book',
    authors: parseAuthors(b.author),
    title: b.title,
    publisher: b.publisher,
    city: b.city,
    year: b.year
  }
}
```

with:

```ts
function sourceFor(b: BookMetaRow): CitationSource {
  return bookCitationSource({ ...b, kind: b.kind === 'article' ? 'article' : 'book' })
}
```

4. In `bookMeta`, change the SQL string `'SELECT title, title_sanitized, author, publisher, city, year, page_offset FROM books WHERE id = ?'` to `'SELECT title, title_sanitized, author, publisher, city, year, page_offset, kind, journal, volume, issue, pages FROM books WHERE id = ?'`.
5. Replace the body of `buildBibliography` (from `const rows = getDb()` through `return items.map(...)`) with:

```ts
  const rows = getDb()
    .prepare(
      `SELECT b.title, b.author, b.publisher, b.city, b.year, b.kind, b.journal, b.volume, b.issue, b.pages,
              (SELECT COUNT(*) FROM quotes q WHERE q.book_id = b.id) AS qn
       FROM books b
       WHERE EXISTS (SELECT 1 FROM quotes q WHERE q.book_id = b.id)`
    )
    .all() as {
    title: string
    author: string | null
    publisher: string | null
    city: string | null
    year: number | null
    kind: string
    journal: string | null
    volume: string | null
    issue: string | null
    pages: string | null
    qn: number
  }[]
  const items = rows.map((r) => {
    const src = bookCitationSource({ ...r, kind: r.kind === 'article' ? 'article' : 'book' })
    const sortKey = (src.authors[0]?.trim().split(/\s+/).pop() || r.title).toLowerCase()
    return { entry: formatCitation(src, 'bibliography', null), quotes: r.qn, sortKey }
  })
  items.sort((a, b) => a.sortKey.localeCompare(b.sortKey))
  return items.map((x) => ({ entry: x.entry, quotes: x.quotes }))
}
```

(Keep the function's opening line `export function buildBibliography(): { entry: string; quotes: number }[] {` and its doc comment; the replacement above ends the function.)

- [ ] **Step 8: Use it in the renderer's QuotesPanel**

In `src/renderer/src/components/library/QuotesPanel.tsx`:

1. Change the citation import to `import { bookCitationSource, formatCitation, type CitationSource, type CitationStyle } from '@shared/citation'` (drop `parseAuthors`).
2. Replace the `sourceFromBook` function with:

```ts
function sourceFromBook(book: Book): CitationSource {
  return bookCitationSource(book)
}
```

- [ ] **Step 9: Run tests and typecheck**

Run: `npm test -- src/shared/citation.test.ts src/main/services/quotes.test.ts`
Expected: PASS.
Run: `npm run typecheck`
Expected: no errors (remove any import the compiler flags as unused).

- [ ] **Step 10: Commit**

```bash
git add src/shared/citation.ts src/shared/citation.test.ts src/main/services/quotes.ts src/main/services/quotes.test.ts src/renderer/src/components/library/QuotesPanel.tsx
git commit -m "feat(citation): cite articles in Chicago note style

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Crossref DOI lookup (model: haiku)

**Files:**
- Create: `src/main/services/crossref.ts`
- Create: `src/main/services/crossref.test.ts`
- Create: `src/main/services/__fixtures__/crossrefSamples.ts`
- Modify: `src/shared/ipc.ts`, `src/preload/index.ts`, `src/main/ipc/index.ts`

**Interfaces:**
- Produces (`shared/ipc.ts`):
  - `export interface ArticleFields { title: string | null; authors: string[]; journal: string | null; volume: string | null; issue: string | null; pages: string | null; year: number | null; doi: string }`
  - `export type DoiLookupResult = { ok: true; fields: ArticleFields } | { ok: false; error: string }`
  - channel `Channels.lookupDoi = 'library:lookupDoi'`; `LociApi.lookupDoi(doi: string): Promise<DoiLookupResult>`
- Produces (`crossref.ts`): `normalizeDoi(input: string): string | null`; `parseCrossref(body: unknown): ArticleFields | null`; `lookupDoi(raw: string): Promise<DoiLookupResult>`. Uses the global `fetch` in the main process, the same approach as `services/scripture.ts`.

- [ ] **Step 1: Add the shared types and channel**

In `src/shared/ipc.ts`, directly below the `BookUpdate` interface add:

```ts
/** Bibliographic fields a Crossref DOI lookup can fill into an article. */
export interface ArticleFields {
  title: string | null
  /** "First Last" order, one entry per author. */
  authors: string[]
  journal: string | null
  volume: string | null
  issue: string | null
  /** Page range with an en dash, e.g. "45–67". */
  pages: string | null
  year: number | null
  /** The normalised DOI (no URL prefix). */
  doi: string
}

export type DoiLookupResult = { ok: true; fields: ArticleFields } | { ok: false; error: string }
```

In the channel map add after `  moveBook: 'library:moveBook',`:

```ts
  lookupDoi: 'library:lookupDoi',
```

In `LociApi` after the `moveBook` declaration add:

```ts
  /** Look a DOI up on Crossref (no key). Never throws: failures come back as { ok: false }. */
  lookupDoi(doi: string): Promise<DoiLookupResult>
```

- [ ] **Step 2: Create the fixtures**

Create `src/main/services/__fixtures__/crossrefSamples.ts`:

```ts
// Trimmed real-shape Crossref `/works/<doi>` responses; no network in tests.

/** A normal journal article: array-valued titles, HTML in the title, hyphenated page range. */
export const CROSSREF_ARTICLE = {
  status: 'ok',
  'message-type': 'work',
  message: {
    DOI: '10.1000/xyz123',
    type: 'journal-article',
    title: ['On <i>Sola Gratia</i> &amp; the Lutheran Confessions'],
    author: [
      { given: 'Jane', family: 'Smith', sequence: 'first' },
      { given: 'John Q.', family: 'Doe', sequence: 'additional' }
    ],
    'container-title': ['Concordia Journal'],
    volume: '12',
    issue: '3',
    page: '45-67',
    issued: { 'date-parts': [[1998, 5]] }
  }
}

/** Sparse record: an organisation author, an e-location "page", no issue, year only in published-online. */
export const CROSSREF_SPARSE = {
  status: 'ok',
  message: {
    DOI: '10.2000/abc',
    title: ['A Short Note'],
    author: [{ name: 'Lutheran Church Commission' }],
    'short-container-title': ['LCC Rev'],
    volume: '7',
    page: 'e1234',
    'published-online': { 'date-parts': [[2021]] }
  }
}
```

- [ ] **Step 3: Write the failing tests**

Create `src/main/services/crossref.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CROSSREF_ARTICLE, CROSSREF_SPARSE } from './__fixtures__/crossrefSamples'
import { lookupDoi, normalizeDoi, parseCrossref } from './crossref'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('normalizeDoi', () => {
  it.each([
    ['10.1000/xyz123', '10.1000/xyz123'],
    ['  10.1000/xyz123  ', '10.1000/xyz123'],
    ['https://doi.org/10.1000/xyz123', '10.1000/xyz123'],
    ['http://dx.doi.org/10.1000/xyz123', '10.1000/xyz123'],
    ['doi.org/10.1000/xyz123', '10.1000/xyz123'],
    ['doi:10.1000/xyz123', '10.1000/xyz123'],
    ['DOI: 10.1000/xyz123', '10.1000/xyz123'],
    ['https://doi.org/10.1000%2Fxyz123', '10.1000/xyz123']
  ])('%s -> %s', (input, expected) => {
    expect(normalizeDoi(input)).toBe(expected)
  })

  it('rejects things that are not DOIs', () => {
    expect(normalizeDoi('')).toBeNull()
    expect(normalizeDoi('not a doi')).toBeNull()
    expect(normalizeDoi('https://example.com/10.1000/x')).toBeNull()
    expect(normalizeDoi('10.12/short-registrant')).toBeNull()
  })
})

describe('parseCrossref', () => {
  it('maps a journal article to the fields', () => {
    expect(parseCrossref(CROSSREF_ARTICLE)).toEqual({
      title: 'On Sola Gratia & the Lutheran Confessions',
      authors: ['Jane Smith', 'John Q. Doe'],
      journal: 'Concordia Journal',
      volume: '12',
      issue: '3',
      pages: '45–67',
      year: 1998,
      doi: '10.1000/xyz123'
    })
  })

  it('copes with a sparse record', () => {
    expect(parseCrossref(CROSSREF_SPARSE)).toEqual({
      title: 'A Short Note',
      authors: ['Lutheran Church Commission'],
      journal: 'LCC Rev',
      volume: '7',
      issue: null,
      pages: 'e1234',
      year: 2021,
      doi: '10.2000/abc'
    })
  })

  it('returns null for an unexpected body', () => {
    expect(parseCrossref(null)).toBeNull()
    expect(parseCrossref({})).toBeNull()
    expect(parseCrossref({ message: 'oops' })).toBeNull()
    expect(parseCrossref({ message: { title: ['x'] } })).toBeNull() // no DOI
  })
})

describe('lookupDoi', () => {
  const okResponse = (body: unknown): Response =>
    ({ ok: true, status: 200, json: async () => body }) as unknown as Response

  it('rejects a non-DOI without calling the network', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const res = await lookupDoi('hello')
    expect(res.ok).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('fetches the encoded Crossref URL and returns the fields', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse(CROSSREF_ARTICLE))
    vi.stubGlobal('fetch', fetchMock)
    const res = await lookupDoi('https://doi.org/10.1000/xyz123')
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.crossref.org/works/10.1000/xyz123')
    expect(res).toMatchObject({ ok: true, fields: { journal: 'Concordia Journal', year: 1998 } })
  })

  it('maps a 404 to a friendly error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 } as Response))
    expect(await lookupDoi('10.1000/missing')).toEqual({ ok: false, error: 'Crossref has no record of that DOI.' })
  })

  it('maps other HTTP failures and network errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 } as Response))
    expect(await lookupDoi('10.1000/x1')).toEqual({ ok: false, error: 'Crossref lookup failed (503).' })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    expect(await lookupDoi('10.1000/x1')).toEqual({
      ok: false,
      error: 'Could not reach Crossref — check your connection.'
    })
  })

  it('reports an unexpected response body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse({ message: {} })))
    expect(await lookupDoi('10.1000/x1')).toEqual({ ok: false, error: 'Crossref returned an unexpected response.' })
  })
})
```

- [ ] **Step 4: Run to verify it fails**

Run: `npx vitest run src/main/services/crossref.test.ts`
Expected: FAIL (module `./crossref` not found).

- [ ] **Step 5: Implement `crossref.ts`**

Create `src/main/services/crossref.ts`:

```ts
import type { ArticleFields, DoiLookupResult } from '../../shared/ipc'

// Crossref's public REST API needs no key. The global `fetch` is used the same way as in
// scripture.ts. A descriptive User-Agent is Crossref's request for polite clients.
const CROSSREF_WORKS = 'https://api.crossref.org/works/'
const USER_AGENT = 'Loci/1.0 (personal study app)'

/** Strip `https://doi.org/`, `dx.doi.org/`, `doi:` prefixes and whitespace; null if it is not a DOI. */
export function normalizeDoi(input: string): string | null {
  let s = input.trim().replace(/\s+/g, '')
  s = s.replace(/^doi:/i, '').replace(/^(?:https?:\/\/)?(?:dx\.)?doi\.org\//i, '')
  try {
    s = decodeURIComponent(s)
  } catch {
    /* keep it as typed */
  }
  return /^10\.\d{4,9}\/\S+$/.test(s) ? s : null
}

/** Crossref titles can carry JATS/HTML tags and entities. */
function plain(s: string): string {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)
const first = (v: unknown): string | null => (Array.isArray(v) ? str(v[0]) : str(v))

function yearOf(m: Record<string, unknown>): number | null {
  for (const key of ['issued', 'published-print', 'published-online']) {
    const parts = (m[key] as { 'date-parts'?: unknown[][] } | undefined)?.['date-parts']
    const y = parts?.[0]?.[0]
    if (typeof y === 'number' && Number.isFinite(y)) return y
  }
  return null
}

/** Map a Crossref `/works/<doi>` response body to article fields; null when it is not one. */
export function parseCrossref(body: unknown): ArticleFields | null {
  const m = (body as { message?: unknown } | null)?.message
  if (!m || typeof m !== 'object') return null
  const msg = m as Record<string, unknown>
  const doi = str(msg.DOI)
  if (!doi) return null

  const authors = (Array.isArray(msg.author) ? msg.author : [])
    .map((a: { given?: unknown; family?: unknown; name?: unknown }) =>
      str(a?.name) ?? [str(a?.given), str(a?.family)].filter(Boolean).join(' ')
    )
    .filter((n): n is string => !!n)

  const rawTitle = first(msg.title)
  const rawPages = str(msg.page)
  return {
    title: rawTitle ? plain(rawTitle) : null,
    authors,
    journal: first(msg['container-title']) ?? first(msg['short-container-title']),
    volume: str(msg.volume),
    issue: str(msg.issue),
    pages: rawPages ? rawPages.replace(/(\d)\s*[-–—]\s*(\d)/, '$1–$2') : null,
    year: yearOf(msg),
    doi
  }
}

/** Look a DOI up on Crossref. Never throws: every failure is returned as `{ ok: false, error }`. */
export async function lookupDoi(raw: string): Promise<DoiLookupResult> {
  const doi = normalizeDoi(raw)
  if (!doi) return { ok: false, error: 'That does not look like a DOI (it should start with 10.).' }
  const url = CROSSREF_WORKS + doi.split('/').map(encodeURIComponent).join('/')
  let res: Response
  try {
    res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } })
  } catch {
    return { ok: false, error: 'Could not reach Crossref — check your connection.' }
  }
  if (res.status === 404) return { ok: false, error: 'Crossref has no record of that DOI.' }
  if (!res.ok) return { ok: false, error: `Crossref lookup failed (${res.status}).` }
  let body: unknown
  try {
    body = await res.json()
  } catch {
    return { ok: false, error: 'Crossref returned an unexpected response.' }
  }
  const fields = parseCrossref(body)
  return fields ? { ok: true, fields } : { ok: false, error: 'Crossref returned an unexpected response.' }
}
```

- [ ] **Step 6: Run to verify it passes**

Run: `npx vitest run src/main/services/crossref.test.ts`
Expected: PASS. (If `10.1000/xyz123` fails the `\d{4,9}` check, that is a typo in the regex — `1000` is four digits and must pass.)

- [ ] **Step 7: Wire IPC and preload**

1. `src/preload/index.ts`: after the `moveBook:` line add `  lookupDoi: (doi) => ipcRenderer.invoke(Channels.lookupDoi, doi),`.
2. `src/main/ipc/index.ts`: add `import { lookupDoi } from '../services/crossref'` next to the other service imports, and after the `Channels.moveBook` handler add:

```ts
  ipcMain.handle(Channels.lookupDoi, (_e, doi: string) => lookupDoi(doi))
```

- [ ] **Step 8: Typecheck, then commit**

Run: `npm run typecheck`
Expected: no errors.

```bash
git add src/main/services/crossref.ts src/main/services/crossref.test.ts src/main/services/__fixtures__/crossrefSamples.ts src/shared/ipc.ts src/preload/index.ts src/main/ipc/index.ts
git commit -m "feat(library): look up article details from a DOI on Crossref

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Info drawer — article fields, Fill from DOI, Move (model: sonnet)

**Files:**
- Modify: `src/renderer/src/components/library/BookInfoDrawer.tsx`

**Interfaces:**
- Consumes: `Book.kind` and article fields, `BookUpdate` article keys (Task 1); store `moveBook(id, kind): Promise<boolean>` (Task 3); `api.lookupDoi(doi): Promise<DoiLookupResult>` (Task 5); `KIND_LABEL` from `@shared/libraryKind` (Task 2).
- Produces: nothing other tasks depend on. (No unit tests: renderer components are not unit-tested in this repo; verification is typecheck + the Task 9 checklist.)

- [ ] **Step 1: Imports and form shape**

1. In the `lucide-react` import add `ArrowRightLeft,` after `X,`.
2. After `import { BookCover } from './BookCover'` add:

```ts
import { KIND_LABEL } from '@shared/libraryKind'
```

3. Replace the `type Form = { ... }` block with:

```ts
type Form = {
  title: string
  authors: string[]
  series: string
  seriesNumber: string
  seriesAbbr: string
  year: string
  publisher: string
  pageOffset: string
  journal: string
  volume: string
  issue: string
  pages: string
  doi: string
}
```

4. In the `useState<Form>({ ... })` initial value, after `    pageOffset: '0'` add:

```ts
    pageOffset: '0',
    journal: '',
    volume: '',
    issue: '',
    pages: '',
    doi: ''
```

(i.e. replace the line `    pageOffset: '0'` with those six lines.)

5. In the `setForm({ ... })` inside the `useEffect`, replace `        pageOffset: book.pageOffset.toString()\n      })` with:

```ts
        pageOffset: book.pageOffset.toString(),
        journal: book.journal ?? '',
        volume: book.volume ?? '',
        issue: book.issue ?? '',
        pages: book.pages ?? '',
        doi: book.doi ?? ''
      })
```

6. Extend the resync key so a kind change or fetched article details refresh the form. Replace:

```ts
  const bookKey = book
    ? `${book.id}:${book.author ?? ''}:${book.series ?? ''}:${book.seriesNumber ?? ''}:${book.seriesAbbr ?? ''}:${book.year ?? ''}`
    : ''
```

with:

```ts
  const bookKey = book
    ? `${book.id}:${book.kind}:${book.author ?? ''}:${book.series ?? ''}:${book.seriesNumber ?? ''}:${book.seriesAbbr ?? ''}:${book.year ?? ''}`
    : ''
```

- [ ] **Step 2: State, handlers, save**

1. After `const refreshLibrary = useStore((s) => s.refreshLibrary)` add:

```ts
  const moveBook = useStore((s) => s.moveBook)
```

2. After `const [confirmDelete, setConfirmDelete] = useState(false)` add:

```ts
  const [doiBusy, setDoiBusy] = useState(false)
  const [doiError, setDoiError] = useState<string | null>(null)
  const [moveBusy, setMoveBusy] = useState(false)
  const [moveError, setMoveError] = useState<string | null>(null)
```

3. After the `removeAuthor` function (before `const saveMeta`) add:

```ts
  // Crossref fills the form only; nothing is stored until the user presses "Save details".
  const fillFromDoi = async (): Promise<void> => {
    setDoiBusy(true)
    setDoiError(null)
    try {
      const res = await api.lookupDoi(form.doi)
      if (!res.ok) {
        setDoiError(res.error)
        return
      }
      const f = res.fields
      setForm((cur) => ({
        ...cur,
        title: f.title ?? cur.title,
        authors: f.authors.length ? f.authors : cur.authors,
        journal: f.journal ?? cur.journal,
        volume: f.volume ?? cur.volume,
        issue: f.issue ?? cur.issue,
        pages: f.pages ?? cur.pages,
        year: f.year != null ? String(f.year) : cur.year,
        doi: f.doi
      }))
    } finally {
      setDoiBusy(false)
    }
  }

  const doMove = async (): Promise<void> => {
    setMoveBusy(true)
    setMoveError(null)
    try {
      const ok = await moveBook(book.id, book.kind === 'article' ? 'book' : 'article')
      if (!ok) setMoveError('Could not move the file. Check that its folder is available and try again.')
    } finally {
      setMoveBusy(false)
    }
  }
```

4. Replace the `saveMeta` body so article fields are saved only for articles. Find:

```ts
      publisher: form.publisher.trim() || null,
      pageOffset: Number(form.pageOffset) || 0
    })
  }
```

Replace with:

```ts
      publisher: form.publisher.trim() || null,
      pageOffset: Number(form.pageOffset) || 0,
      ...(book.kind === 'article'
        ? {
            journal: form.journal.trim() || null,
            volume: form.volume.trim() || null,
            issue: form.issue.trim() || null,
            pages: form.pages.trim() || null,
            doi: form.doi.trim() || null
          }
        : {})
    })
  }
```

- [ ] **Step 3: Labels by kind**

1. Replace `<h2 className="drawer-title">Book info</h2>` with `<h2 className="drawer-title">{KIND_LABEL[book.kind]} info</h2>`.
2. Replace `title="Re-derive title, author, and series from the PDF's file name"` with `title="Re-derive title, author, and series from the file name"`.
3. Replace `<Trash2 size={14} /> Delete book\n              </button>` text: find `<Trash2 size={14} /> Delete book` and replace with `<Trash2 size={14} /> Delete {KIND_LABEL[book.kind].toLowerCase()}`.
4. In the delete-confirm text replace `Delete “{book.title}”? Its PDF moves to the vault’s “deleted” folder\n                  (recoverable) and leaves your library and Drive folders.` with `Delete “{book.title}”? Its file moves to the vault’s “deleted” folder\n                  (recoverable) and leaves your library and Drive folders.`

- [ ] **Step 4: Article fields and Fill from DOI**

In the Details section, insert this block immediately after the closing `</datalist>` of `bi-author-options` (the one following the authors list) and before `<label className="set-label">Series</label>`:

```tsx
            {book.kind === 'article' && (
              <>
                <label className="set-label">DOI</label>
                <div className="author-row">
                  <input
                    className="field"
                    value={form.doi}
                    placeholder="10.1000/xyz123 or https://doi.org/…"
                    autoComplete="off"
                    onChange={(e) => {
                      set('doi', e.target.value)
                      setDoiError(null)
                    }}
                  />
                  <button
                    className="btn btn-sm"
                    disabled={doiBusy || !form.doi.trim()}
                    title="Fill title, authors, journal, volume, issue, pages and year from Crossref"
                    onClick={() => void fillFromDoi()}
                  >
                    <RefreshCw size={13} className={doiBusy ? 'spin' : ''} /> Fill from DOI
                  </button>
                </div>
                {doiError && (
                  <p className="folder-hint" role="alert">
                    {doiError}
                  </p>
                )}
                <label className="set-label">Journal</label>
                <input
                  className="field"
                  value={form.journal}
                  placeholder="e.g. Concordia Journal"
                  onChange={(e) => set('journal', e.target.value)}
                />
                <div className="field-grid">
                  <div>
                    <label className="set-label">Volume</label>
                    <input className="field" value={form.volume} onChange={(e) => set('volume', e.target.value)} />
                  </div>
                  <div>
                    <label className="set-label">Issue</label>
                    <input className="field" value={form.issue} onChange={(e) => set('issue', e.target.value)} />
                  </div>
                </div>
                <label className="set-label">Pages</label>
                <input
                  className="field"
                  value={form.pages}
                  placeholder="e.g. 45–67"
                  onChange={(e) => set('pages', e.target.value)}
                />
              </>
            )}
```

- [ ] **Step 5: Hide Series and Publisher for articles**

Wrap the Series block in `{book.kind !== 'article' && ( <> … </> )}`: it starts at `<label className="set-label">Series</label>` and ends at the closing `</div>` of the second `field-grid` that holds "Number in series" and "Abbreviation" (just before the `<div className="field-grid">` that holds Year and Page offset). Wrap the Publisher label + input (`<label className="set-label">Publisher</label>` through its `<input ... />`) the same way. Year and Page offset stay for both kinds.

- [ ] **Step 6: Move button**

In the "Reading" section, directly after the `{book.lastPage > 1 && <p ...>}` line add:

```tsx
            <button
              className="btn btn-sm bi-move"
              disabled={moveBusy}
              title="Moves the file to the other folder; quotes, highlights and shelves stay attached"
              onClick={() => void doMove()}
            >
              <ArrowRightLeft size={14} /> {book.kind === 'article' ? 'Move to Books' : 'Move to Articles'}
            </button>
            {moveError && (
              <p className="folder-hint" role="alert">
                {moveError}
              </p>
            )}
```

- [ ] **Step 7: Typecheck and commit**

Run: `npm run typecheck`
Expected: no errors.
Run: `npm test`
Expected: PASS (whole suite; no renderer behaviour tests are affected).

```bash
git add src/renderer/src/components/library/BookInfoDrawer.tsx
git commit -m "feat(library): article fields, Fill from DOI and Move in the info drawer

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Library page Books | Articles tabs and the right-hand "Library" pill (model: sonnet)

**Files:**
- Modify: `src/renderer/src/components/library/LibraryView.tsx`
- Create: `src/renderer/src/components/library/KindSwitch.tsx`
- Modify: `src/renderer/src/components/library/ReferencePdfPanel.tsx`
- Modify: `src/renderer/src/components/navigation.ts`

**Interfaces:**
- Consumes: `ofKind`, `KIND_PLURAL` (Task 2); `store.importFiles(kind)` (Task 2); `Book.kind`.
- Produces: `KindSwitch({ kind, onChange, counts })` where `counts: Record<BookKind, number>`; session keys `libraryTab` (now also `'articles'`) and `refLibraryKind` (`'book' | 'article'`).

- [ ] **Step 1: Rename the pill (id unchanged, per Decision 1)**

In `src/renderer/src/components/navigation.ts` change the import to `import { Library, BookOpenText, MessageSquareQuote, Quote, FileText } from 'lucide-react'` (replacing `File`), and the entry `{ id: 'books', label: 'Books', icon: File },` to `{ id: 'books', label: 'Library', icon: Library },`.

- [ ] **Step 2: Create `KindSwitch.tsx`**

```tsx
import type { ReactNode } from 'react'
import type { BookKind } from '@shared/ipc'
import { KIND_PLURAL } from '@shared/libraryKind'

const KINDS: BookKind[] = ['book', 'article']

/** Books | Articles segmented control with counts; reuses the corpus-switch look of the other
 *  reference pills (but is local state, not a CorpusMode). */
export function KindSwitch({
  kind,
  onChange,
  counts
}: {
  kind: BookKind
  onChange: (k: BookKind) => void
  counts: Record<BookKind, number>
}): ReactNode {
  return (
    <div className="corpus-switch">
      {KINDS.map((k) => (
        <button
          key={k}
          className={`corpus-switch-btn${k === kind ? ' active' : ''}`}
          onClick={() => onChange(k)}
        >
          {KIND_PLURAL[k]} {counts[k]}
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: Rewrite `ReferencePdfPanel.tsx`**

Replace the file with (the body is the existing panel wrapped in the `ref-corpus-panel` column used by the other pills, with the kind filter added):

```tsx
import { useEffect, useMemo, useState } from 'react'
import { GripVertical, Search, Replace } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { api } from '../../lib/api'
import { bookMatchesQuery } from '../../lib/bookSearch'
import { PdfReader } from './PdfReader'
import { OpenInCenterButton } from './OpenInCenterButton'
import { BookListRow } from './LibraryView'
import { KindSwitch } from './KindSwitch'
import { KIND_PLURAL, ofKind } from '@shared/libraryKind'
import type { BookKind } from '@shared/ipc'

/** The Library pill: a book or article in the reference panel, with its own picker — independent
 *  of the center. A Books | Articles switch chooses which list the picker browses. */
export function ReferencePdfPanel() {
  const books = useStore((s) => s.books)
  const [kind, setKind] = useState<BookKind>('book')
  const [bookId, setBookId] = useState<string | null>(null)
  const [browsing, setBrowsing] = useState(true)
  const [q, setQ] = useState('')

  const counts = useMemo<Record<BookKind, number>>(
    () => ({ book: ofKind(books, 'book').length, article: ofKind(books, 'article').length }),
    [books]
  )

  // Clear the reference item once it's promoted to the center (avoids showing it twice).
  const clear = (): void => {
    setBookId(null)
    setBrowsing(true)
    void api.setSession('refPdf', '')
  }

  useEffect(() => {
    void api.getSession('refLibraryKind').then((v) => {
      if (v === 'book' || v === 'article') setKind(v)
    })
  }, [])

  // Restore the last reference item, if it still exists (and show the list it belongs to).
  useEffect(() => {
    void api.getSession('refPdf').then((id) => {
      const hit = id ? books.find((b) => b.id === id) : undefined
      if (hit) {
        setBookId(hit.id)
        setKind(hit.kind)
        setBrowsing(false)
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [books.length])

  const pick = (id: string): void => {
    setBookId(id)
    setBrowsing(false)
    setQ('')
    void api.setSession('refPdf', id)
  }

  const changeKind = (k: BookKind): void => {
    setKind(k)
    setBrowsing(true)
    setQ('')
    void api.setSession('refLibraryKind', k)
  }

  if (books.length === 0) {
    return <div className="quotes-empty">No books or articles yet</div>
  }

  const book = books.find((b) => b.id === bookId)
  const ofThisKind = ofKind(books, kind)
  const filtered = q.trim() ? ofThisKind.filter((b) => bookMatchesQuery(b, q)) : ofThisKind
  const plural = KIND_PLURAL[kind].toLowerCase()

  return (
    <div className="ref-corpus-panel">
      <KindSwitch kind={kind} onChange={changeKind} counts={counts} />
      <div className="ref-pdf">
        <div className="ref-pdf-head">
          {bookId && !browsing && (
            <span
              className="ref-drag-handle"
              draggable
              title="Drag this into a project"
              onDragStart={(e) => {
                e.dataTransfer.setData('application/x-loci-book', bookId)
                e.dataTransfer.effectAllowed = 'copy'
              }}
            >
              <GripVertical size={14} />
            </span>
          )}
          {bookId && !browsing ? (
            <>
              <span className="ref-pdf-title" title={book?.title}>
                {book?.title ?? 'Untitled'}
              </span>
              <button className="icon-btn" title={`Choose a different ${kind}`} onClick={() => setBrowsing(true)}>
                <Replace size={14} />
              </button>
            </>
          ) : (
            <div className="ref-pdf-search-wrap">
              <Search size={13} className="ref-pdf-search-icon" />
              <input
                className="ref-pdf-search"
                autoFocus
                placeholder={`Search ${plural}…`}
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
          )}
          <OpenInCenterButton content={bookId ? { kind: 'pdf', bookId } : null} onDone={clear} />
        </div>
        {browsing ? (
          <div className="ref-pdf-browse">
            {ofThisKind.length === 0 ? (
              <div className="pp-empty">No {plural} yet</div>
            ) : filtered.length === 0 ? (
              <div className="pp-empty">No matches.</div>
            ) : (
              <div className="list">
                {filtered.map((b) => (
                  <BookListRow
                    key={b.id}
                    book={b}
                    onRead={() => pick(b.id)}
                    onOpen={() => pick(b.id)}
                    onMenu={(e) => e.preventDefault()}
                  />
                ))}
              </div>
            )}
          </div>
        ) : bookId ? (
          <div className="ref-pdf-stage">
            <PdfReader key={bookId} bookId={bookId} embedded />
          </div>
        ) : (
          <div className="quotes-empty">Pick a {kind} above to view it here.</div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: `LibraryView.tsx` — imports and tab model**

1. In the `lucide-react` import list replace `  MessageSquareQuote\n} from 'lucide-react'` with `  MessageSquareQuote,\n  FileText\n} from 'lucide-react'`.
2. Replace `import type { Book, PdfSource, ReadingStatus } from '@shared/ipc'` with:

```ts
import type { Book, BookKind, PdfSource, ReadingStatus } from '@shared/ipc'
import { KIND_PLURAL, ofKind } from '@shared/libraryKind'
```

3. Replace the `type ContentTab` and `CONTENT_TABS` declarations with:

```ts
type ContentTab = 'books' | 'articles' | 'images' | 'videos'
const CONTENT_TABS: { id: ContentTab; label: string; icon: typeof BookOpen }[] = [
  { id: 'books', label: 'Books', icon: BookOpen },
  { id: 'articles', label: 'Articles', icon: FileText },
  { id: 'images', label: 'Images', icon: ImageIcon },
  { id: 'videos', label: 'Videos', icon: Video }
]
```

4. In `LibraryView`, directly after `const bodyRef = useRef<HTMLDivElement>(null)` add:

```ts
  // Books and Articles share this page's list/grid, shelves, search and grouping; the active tab
  // picks which kind is shown (and which kind "Add…" imports).
  const isLibraryTab = contentTab === 'books' || contentTab === 'articles'
  const kind: BookKind = contentTab === 'articles' ? 'article' : 'book'
  const inKind = useMemo(() => ofKind(books, kind), [books, kind])
  const tabCounts = useMemo(
    () => ({ books: ofKind(books, 'book').length, articles: ofKind(books, 'article').length }),
    [books]
  )
  const plural = KIND_PLURAL[kind].toLowerCase()
```

5. In the session restore change `if (v === 'images' || v === 'videos') setContentTab(v)` to `if (v === 'articles' || v === 'images' || v === 'videos') setContentTab(v)`.

- [ ] **Step 5: `LibraryView.tsx` — filtering, import, wording**

1. Replace the `filtered` memo:

```ts
  const filtered = useMemo(
    () => (activeShelf ? books.filter((b) => b.shelfIds.includes(activeShelf)) : books),
    [books, activeShelf]
  )
```

with:

```ts
  const filtered = useMemo(
    () => (activeShelf ? inKind.filter((b) => b.shelfIds.includes(activeShelf)) : inKind),
    [inKind, activeShelf]
  )
```

2. In `doImportFiles` change `const res = await importFiles()` to `const res = await importFiles(kind)`.
3. Replace every `contentTab === 'books'` with `isLibraryTab` (the file has exactly three such comparisons — in the toolbar-left block, the toolbar-right block and the body ternary; confirm with `grep -n "contentTab === 'books'" src/renderer/src/components/library/LibraryView.tsx` before and `isLibraryTab` after). The CONTENT_TABS `contentTab === t.id` comparison stays.
4. Tab buttons with counts. Find:

```tsx
                  <Icon size={14} /> {t.label}
                </button>
```

Replace with:

```tsx
                  <Icon size={14} /> {t.label}
                  {(t.id === 'books' || t.id === 'articles') && <span className="chip-n"> {tabCounts[t.id]}</span>}
                </button>
```

5. The Add button. Find:

```tsx
                title="Books in your local and Drive folders are added automatically — use this to import PDFs from elsewhere"
                onClick={() => void doImportFiles()}
              >
                <FolderInput size={14} /> Add PDFs…
              </button>
```

Replace with:

```tsx
                title={`${KIND_PLURAL[kind]} in your local and Drive folders are added automatically — use this to import files from elsewhere`}
                onClick={() => void doImportFiles()}
              >
                <FolderInput size={14} /> Add {plural}…
              </button>
```

6. Search placeholder: `placeholder="Search books…"` becomes ``placeholder={`Search ${plural}…`}``.
7. Group tooltip: `title="Group books by"` becomes `title="Group by"`.
8. "All" chip: `All <span className="chip-n">{books.length}</span>` becomes `All <span className="chip-n">{inKind.length}</span>`.
9. Replace the whole body `EmptyState` element (the one with `title={ query.trim() ? 'No books match' : ...`) with:

```tsx
          <EmptyState
            icon={kind === 'article' ? FileText : BookOpen}
            title={
              query.trim()
                ? `No ${plural} match`
                : inKind.length === 0
                  ? `No ${plural} yet`
                  : `No ${plural} on this shelf`
            }
            subtitle={
              query.trim()
                ? `Nothing matches “${query.trim()}”.`
                : inKind.length === 0
                  ? kind === 'article'
                    ? 'Put article files in an “Articles” folder in your local library or Drive vault and they appear here automatically — or use “Add articles…” above.'
                    : 'Add files to your local library or Drive folder and they appear here automatically — or use “Add books…” above.'
                  : `Try another shelf, or add more ${plural}.`
            }
          />
```

10. Context-menu entry: replace `<Info size={14} /> Book info…` with `<Info size={14} /> {mb.kind === 'article' ? 'Article info…' : 'Book info…'}`.

- [ ] **Step 6: Typecheck and commit**

Run: `npm run typecheck`
Expected: no errors (`File` is no longer imported in `navigation.ts`; `useEffect`/`useMemo` imports in `ReferencePdfPanel` are all used).
Run: `npm test`
Expected: PASS (`corpusMode.test.ts` still passes: the pill id and `MODES_FOR_PILL.books = []` are unchanged).

```bash
git add src/renderer/src/components/library/LibraryView.tsx src/renderer/src/components/library/KindSwitch.tsx src/renderer/src/components/library/ReferencePdfPanel.tsx src/renderer/src/components/navigation.ts
git commit -m "feat(library): Books | Articles tabs on the Library page and in the Library pill

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Remaining "PDF" wording sweep (model: haiku)

**Files:**
- Modify: `src/renderer/src/components/chrome/tabRegistry.tsx`, `ChromeTabStrip.tsx`, `HistoryPage.tsx`
- Modify: `src/renderer/src/components/chrome/newTabTiles.ts`, `newTabTiles.test.ts`
- Modify: `src/renderer/src/components/chrome/omniboxSuggest.ts`, `omniboxSuggest.test.ts`
- Modify: `src/renderer/src/components/Wizard.tsx`, `Settings.tsx`
- Modify: `src/renderer/src/components/library/CommentaryPanel.tsx`, `CommentaryReviewQueue.tsx`, `QuotesPanel.tsx`, `SearchResults.tsx`
- Modify: `src/main/ipc/index.ts`

**Interfaces:**
- Consumes: `KIND_LABEL`, `KIND_PLURAL` (Task 2); `Book.kind`.
- Produces: `TabKindDef.subtitle` becomes `(tab: Tab, ctx?: { books: { id: string; kind?: BookKind }[] }) => string`; optional `kind?: BookKind` on the `books` element types of `TitleContext`, `TileInput` and `OmniData`.

- [ ] **Step 1: Write the failing tests**

In `src/renderer/src/components/chrome/newTabTiles.test.ts` add inside `describe('buildTiles', ...)` (as a new `it`):

```ts
  it('labels a revisited library item by its kind', () => {
    const { recent } = buildTiles({
      ...base,
      history: [visit({ kind: 'pdf', bookId: 'a1' }, 'On Grace', '2026-10-09T10:00:00Z')],
      books: [{ id: 'a1', title: 'On Grace', lastPage: 1, lastOpened: null, pageOffset: 0, status: 'unread', kind: 'article' }],
      lastBible: null,
      lastBoc: null
    })
    expect(recent.map((t) => `${t.title}|${t.subtitle}`)).toEqual(['On Grace|Article'])
  })
```

In `src/renderer/src/components/chrome/omniboxSuggest.test.ts` add inside `describe('buildSuggestions', ...)`:

```ts
  it('hints a book or an article by its kind', () => {
    const withKinds: OmniData = {
      ...data,
      tabs: [],
      bookmarks: [],
      notes: [],
      books: [
        { id: 'a1', title: 'On Grace', kind: 'article' },
        { id: 'b9', title: 'On Grace and Free Will', kind: 'book' }
      ]
    }
    const hints = Object.fromEntries(buildSuggestions('on grace', withKinds).map((s) => [s.label, s.hint]))
    expect(hints['On Grace']).toBe('Article')
    expect(hints['On Grace and Free Will']).toBe('Book')
  })
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/renderer/src/components/chrome/newTabTiles.test.ts src/renderer/src/components/chrome/omniboxSuggest.test.ts`
Expected: FAIL (subtitle is `Library`, hint is `Library`; also a TS error is irrelevant to vitest).

- [ ] **Step 3: New Tab tiles**

In `src/renderer/src/components/chrome/newTabTiles.ts`:

1. Add `import { KIND_LABEL } from '@shared/libraryKind'` and `import type { BookKind } from '@shared/ipc'` with the other imports at the top (add only the ones not already imported).
2. In `TileInput`, change the `books:` element type to `{ id: string; title: string; lastPage: number; lastOpened: number | null; pageOffset: number; status: string; kind?: BookKind }[]`.
3. In `buildTiles`, change:

```ts
    const subtitle = RECENT_SUBTITLES[c.kind] ?? 'Quotes'
```

to:

```ts
    const bookKind = c.kind === 'pdf' ? bookById.get(c.bookId)?.kind : undefined
    const subtitle = bookKind ? KIND_LABEL[bookKind] : (RECENT_SUBTITLES[c.kind] ?? 'Quotes')
```

- [ ] **Step 4: Omnibox**

In `src/renderer/src/components/chrome/omniboxSuggest.ts`:

1. Add `import { KIND_LABEL } from '@shared/libraryKind'` and `BookKind` type import (from `'@shared/ipc'`) if not present.
2. In `OmniData`, change `books: { id: string; title: string }[]` to `books: { id: string; title: string; kind?: BookKind }[]`.
3. In the `data.books.map((b) => ({ ... }))` suggestion, change `hint: 'Library',` to `hint: b.kind ? KIND_LABEL[b.kind] : 'Library',`.

- [ ] **Step 5: Tab subtitle and breadcrumb (`tabRegistry.tsx` and its callers)**

1. Imports: add `import type { BookKind } from '@shared/ipc'` (merge with the existing `import type { ProjectItem } from '@shared/ipc'` line: `import type { BookKind, ProjectItem } from '@shared/ipc'`) and `import { KIND_LABEL, KIND_PLURAL } from '@shared/libraryKind'`.
2. `TitleContext.books` becomes `books: { id: string; title: string; kind?: BookKind }[]`.
3. In `TabKindDef` change `  subtitle: (tab: Tab) => string` to:

```ts
  /** Secondary line for hover cards and the History page. `ctx` lets a kind look up details
   *  (a library tab says Book or Article). */
  subtitle: (tab: Tab, ctx?: { books: { id: string; kind?: BookKind }[] }) => string
```

(and delete the old one-line doc comment above it, which is now duplicated).
4. The `pdf` entry: replace

```ts
    subtitle: () => 'Library · PDF',
```

with:

```ts
    subtitle: (tab, ctx) => {
      const kind = ctx?.books.find((b) => b.id === tab.bookId)?.kind
      return kind ? `Library · ${KIND_LABEL[kind]}` : 'Library'
    },
```

and replace `breadcrumb: (tab, ctx) => ['Library', TAB_REGISTRY.pdf.title(tab, ctx)]` with:

```ts
    breadcrumb: (tab, ctx) => {
      const kind = ctx.books.find((b) => b.id === tab.bookId)?.kind
      const title = TAB_REGISTRY.pdf.title(tab, ctx)
      return kind ? ['Library', KIND_PLURAL[kind], title] : ['Library', title]
    }
```

5. Callers (pass the books so the subtitle can name the kind):
   - `ChromeTabStrip.tsx`, `HoverCard`: change `{def.subtitle(tab)}` to `{def.subtitle(tab, ctx)}` (`ctx: TitleContext` is already a prop).
   - `ChromeTabStrip.tsx`, the `match` function: change `def.subtitle(t)` to `def.subtitle(t, ctx)`.
   - `HistoryPage.tsx`: both `def.subtitle(asTab)` calls become `def.subtitle(asTab, { books })`. The `books` list is already read at the top of `HistoryPage` via `useStore((s) => s.books)`; if a call sits inside a child component that has no `books`, add `const books = useStore((s) => s.books)` to that component (import `useStore` there if needed) rather than threading a prop.

- [ ] **Step 6: Wizard, Settings, panels, dialogs**

Exact replacements:

- `Wizard.tsx`: `Drop a PDF into the vault’s Books folder and Loci adds it automatically.` becomes `Drop a book into the vault’s Books folder (or an article into its Articles folder) and Loci adds it automatically.`
- `Wizard.tsx`: `<strong>On:</strong> imported PDFs are saved both to this machine and the Drive` becomes `<strong>On:</strong> imported books and articles are saved both to this machine and the Drive`.
- `Wizard.tsx`: `label="Existing local PDF folder (optional)"` becomes `label="Existing library folder (optional)"`.
- `Wizard.tsx`: the hint `Already keep PDFs on this PC? Point Loci at that folder and it reads those files directly — fast, no copying. Books here are added automatically and mirrored to your Drive vault.` becomes `Already keep books and articles on this PC? Point Loci at that folder and it reads those files directly — fast, no copying. Files here are added automatically and mirrored to your Drive vault; anything inside a folder named “Articles” is filed as an article. (They are still PDF files.)`
- `Settings.tsx`: `<strong>On:</strong> imported PDFs are saved to this machine and the Drive vault,` becomes `<strong>On:</strong> imported books and articles are saved to this machine and the Drive vault,`.
- `CommentaryPanel.tsx`: `title="View in PDF"` becomes `title="Open in Library"`, and `<ExternalLink size={12} /> View in PDF` becomes `<ExternalLink size={12} /> Open in Library`.
- `CommentaryReviewQueue.tsx`: `<ExternalLink size={13} /> View in PDF` becomes `<ExternalLink size={13} /> Open in Library`; the comment `"View in PDF"` on the `bookId` prop is updated to `"Open in Library"`.
- `QuotesPanel.tsx`: the tooltip `the printed page may differ from the PDF page. Set it in Book Info.` becomes `the printed page may differ from the file’s page. Set it in the info panel.`; the empty state `Select text in the PDF and click <b>Add quote</b> to capture it here.` becomes `Select text while reading and click <b>Add quote</b> to capture it here.`
- `src/main/ipc/index.ts`: `title: 'Locate this book’s PDF',` becomes `title: 'Locate this file',` (the `filters: [{ name: 'PDF', ... }]` entries stay: they name the file format).

Do NOT change: `Export to PDF` titles (`NoteEditor.tsx`, `RichNoteEditor.tsx`), the `PdfReader.tsx` messages (`Could not open this PDF — …`; the spec accepts file-oriented wording), internal identifiers.

- [ ] **Step 7: Search results: show an Article tag on article groups**

In `src/renderer/src/components/library/SearchResults.tsx`, in the group header, directly after `<span className="hit-group-title">{g.title}</span>` add:

```tsx
              {g.bookId && books.find((b) => b.id === g.bookId)?.kind === 'article' && (
                <span className="hit-group-kind">Article</span>
              )}
```

(`books` is already in scope: it is the `books` prop passed to `GroupThumb` in the same component. Reuse the `hit-group-count` styling by adding this rule to `src/renderer/src/styles/app.css`, directly after the existing `.hit-group-count` rule — find it with `grep -n "hit-group-count" src/renderer/src/styles/app.css`:

```css
.hit-group-kind {
  font-size: 10px;
  color: var(--muted);
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  padding: 0 6px;
  margin-left: 6px;
}
```

Add `src/renderer/src/styles/app.css` to this task's commit.)

- [ ] **Step 8: Verify and sweep**

Run: `npx vitest run src/renderer/src/components/chrome/newTabTiles.test.ts src/renderer/src/components/chrome/omniboxSuggest.test.ts`
Expected: PASS.
Run: `npm run typecheck`
Expected: no errors.
Sweep for leftovers (user-visible strings only):

Run: `grep -rnE "(View in PDF|Add PDFs|No PDFs|Library · PDF|local PDF folder|imported PDFs|Import PDFs|Select text in the PDF)" src`
Expected: no output.
Run: `grep -rnE "\bPDFs?\b" src/renderer/src --include=*.tsx --include=*.ts | grep -vE "Export to PDF|PdfReader|pdfjs|\.test\.|//|\* "`
Expected: only file-format mentions (`Could not open this PDF…`, `Failed to render this PDF.`, the `pdf` tab-kind literals, `name: 'PDF'` dialog filters) remain; fix anything else that names a library item.

- [ ] **Step 9: Commit**

```bash
git add src/renderer/src/components/chrome/tabRegistry.tsx src/renderer/src/components/chrome/ChromeTabStrip.tsx src/renderer/src/components/chrome/HistoryPage.tsx src/renderer/src/components/chrome/newTabTiles.ts src/renderer/src/components/chrome/newTabTiles.test.ts src/renderer/src/components/chrome/omniboxSuggest.ts src/renderer/src/components/chrome/omniboxSuggest.test.ts src/renderer/src/components/Wizard.tsx src/renderer/src/components/Settings.tsx src/renderer/src/components/library/CommentaryPanel.tsx src/renderer/src/components/library/CommentaryReviewQueue.tsx src/renderer/src/components/library/QuotesPanel.tsx src/renderer/src/components/library/SearchResults.tsx src/renderer/src/styles/app.css src/main/ipc/index.ts
git commit -m "feat(library): take PDF out of the interface wording; Library · Book/Article labels

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Final verification and manual GUI checklist (model: haiku)

**Files:** none modified (unless verification finds a defect, in which case fix it in the owning task's files and commit separately).

**Interfaces:** none.

- [ ] **Step 1: Full typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 2: Full test suite**

Run: `npm test`
Expected: all tests PASS, including `library.articles.test.ts`, `crossref.test.ts`, `libraryKind.test.ts`, `citation.test.ts`, `migrations.test.ts`, `quotes.test.ts`, `corpusMode.test.ts`, `newTabTiles.test.ts`, `omniboxSuggest.test.ts`.

- [ ] **Step 3: Confirm scope**

Run: `git status --short`
Expected: clean (everything committed). Run `git log --oneline -9` and confirm eight feature commits with the `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` trailer.

- [ ] **Step 4: Hand the user this live-check checklist (do NOT launch the app)**

Tell the user to run `npm run dev` themselves and check:

1. **Startup and migration.** App opens with the existing library intact; every existing item shows under **Books**; Articles is empty. After the first sync nothing was re-imported or lost (counts unchanged).
2. **Articles by folder (vault).** Drop a PDF into `<vault>/pdfs/Articles/`, restart or wait for sync: it appears under **Articles** (count updates), not Books.
3. **Articles by folder (local).** Put a PDF in a folder called `articles` (any case, any depth) under the local library folder: it is filed as an Article and copied to the vault's `pdfs/Articles/`. A PDF elsewhere in that folder stays a Book.
4. **Add button.** On the Books tab it reads "Add books…", on the Articles tab "Add articles…"; an article imported from Downloads lands in `<vault>/pdfs/Articles/` and shows under Articles.
5. **Info drawer (article).** Title reads "Article info"; Journal / Volume / Issue / Pages / DOI show; Series and Publisher are hidden. Edit and Save details; reopen and confirm they stuck.
6. **Fill from DOI.** Paste `10.1000/182` or a real article DOI (also try `https://doi.org/…` and `doi:…` forms): title, authors, journal, volume, issue, pages, year fill in; nothing is saved until Save details. Disconnect the network or enter a bogus DOI: an inline error appears and the fields are unchanged.
7. **Move.** "Move to Books" on an article (and "Move to Articles" on a book): the file moves between `pdfs/Articles` and `pdfs/Books` (and the local library's `Articles` folder if present), the item switches tabs, and its quotes, highlights and shelves are still attached. Re-sync afterwards: it stays where it was moved and is not duplicated.
8. **Citation.** Add a quote from an article at a known page: the footnote reads `Author, "Title," *Journal* 12, no. 3 (1998): 45–67, 52.`; clear Issue and Pages and see the pieces drop out cleanly. A book quote still cites as before. Bibliography export lists the article in article form.
9. **Right panel.** The pill is labelled **Library**; inside is a Books | Articles switch with counts; empty states read "No books yet" / "No articles yet", and "No books or articles yet" when both are empty.
10. **Wording.** Tab hover card and History show "Library · Book" / "Library · Article"; omnibox breadcrumb shows Library › Articles › title; the omnibox suggestion hint and New Tab "Recent" tiles say Book or Article; Setup wizard reads "Existing library folder"; commentary excerpt button reads "Open in Library"; "Export to PDF" is unchanged.
11. **Search.** A hit group from an article shows a small "Article" tag.

- [ ] **Step 5: Report**

Report to the user: tasks done, test/typecheck results, the Decisions list above, and the checklist. No commit in this task.

---

## Self-Review

**1. Spec coverage**

- One table + `kind` column, default `'book'`: Task 1.
- Folder decides kind (vault `Books`/`Articles`, local `Articles` case-insensitive any depth), re-derived each sync: Task 2 (`kindFromPath`, `rederiveKinds`, sync scans both vault folders, prune guard counts both).
- Move to Articles/Books (same relative layout, `-<id8>` collision suffix, same id so quotes/shelves stay): Task 3 (`retargetPath`, `moveBook`, tests assert quotes remain and suffix).
- Import asks Book or Article and copies into the matching vault folder: Task 2 (`quickImport(kind)`) + Task 7 (tab-driven Add button; Decision 4).
- Article fields journal/volume/issue/pages/doi, shown only for articles: Tasks 1 (columns/types/sidecar) and 6 (drawer).
- Fill from DOI via Crossref with inline error and no changes on failure: Task 5 (parser/fetch/IPC) and Task 6 (UI; fills the form only).
- Citation format incl. missing parts: Task 4 (tests cover each omission; bibliography also handled).
- Naming: Library page Books|Articles with counts and empty states (Task 7); tab subtitle/breadcrumb (Task 8); pill "Library" + switch + "No books or articles yet" (Task 7); wizard (Task 8); New Tab/omnibox (Task 8; bookmarks audited, nothing to change, Decision 10); "View in PDF" → "Open in Library" and kept "Export to PDF" (Task 8).
- Data/migration idempotent with `PRAGMA table_info`, version 25: Task 1. Search groups show kind label: Task 8 Step 7.
- Testing section: kind-from-path (Task 2), article citation incl. missing parts (Task 4), Crossref fixture mapping (Task 5), migration idempotency (Task 1), sync assigns kinds / move / import integration (Tasks 2-3), typecheck + full suite + user checklist (Task 9).

**2. Placeholder scan:** no TBD/TODO/"handle edge cases"; every code step shows code. The only judgement left to the implementer is mechanical (which import the compiler flags as unused in Task 4 Step 7, which HistoryPage child needs `books` in Task 8 Step 5), each with an explicit rule.

**3. Type consistency:** `BookKind` (Task 1) is used by `KindRoots`/`kindFromPath`/`retargetPath`/`ofKind` (Tasks 2-3), `quickImport(paths, onProgress, kind?)` and `importFiles(kind?)` (Task 2), `moveBook(id, kind)` in library.ts / `LociApi` / store (Task 3), `ArticleFields`/`DoiLookupResult` (Task 5) consumed by the drawer (Task 6). `bookCitationSource`/`BookLike` (Task 4) match `Book` field names (`journal/volume/issue/pages`) and the `books` row columns used in `quotes.ts`. `KIND_LABEL`/`KIND_PLURAL`/`ofKind` (Task 2) are the names used in Tasks 6-8. `subtitle(tab, ctx?)` (Task 8) is called with `{ books }` / `ctx` everywhere it is defined. Pill id `'books'` is unchanged everywhere.

**Execution handoff**

Plan complete and saved to `docs/superpowers/plans/2026-10-10-library-books-and-articles.md`. Two execution options:

1. **Subagent-Driven (recommended)** — a fresh subagent per task, review between tasks, fast iteration
2. **Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints
