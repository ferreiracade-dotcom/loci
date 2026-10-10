# Library: Books and Articles — Design

Date: 2026-10-10 · Status: approved

## Goal

Stop calling library items "PDFs" in the interface and split the library into **Books** and
**Articles**. Articles are PDFs like books (read, highlight, quote, search, shelves, tags) but carry
journal details and cite as articles.

## Decisions

- **One table.** Articles live in the existing `books` table with a `kind` column
  (`'book' | 'article'`, default `'book'`). No second table; every existing library feature keeps
  working for articles unchanged.
- **The folder decides the kind.**
  - Vault: `pdfs/Books/…` → book; `pdfs/Articles/…` → article (new sibling folder, created on demand).
  - The user's local PDF folder: any file under a folder named `Articles` (case-insensitive, at any
    depth) → article; everything else → book.
  - `kind` is re-derived from the path on every library sync, so the folder is the source of truth.
- **Changing kind = moving the file.** The info drawer gets **Move to Articles / Move to Books**,
  which moves the file to the other folder (same relative layout; name collision → `-<id8>` suffix,
  as import already does) and updates the row's paths and `kind`. Quotes, highlights and shelves
  stay attached (same row id).
- **Import asks "Book or Article?"** and copies into the matching vault folder.
- **Article fields** (nullable columns on `books`): `journal`, `volume`, `issue`, `pages` (page
  range text, e.g. `45–67`), `doi`. Shown in the info drawer only when `kind='article'`; title,
  author, year, tags, shelves shared with books.
- **Fill from DOI** (article drawer): user pastes a DOI → Loci queries Crossref
  (`https://api.crossref.org/works/<doi>`, no key) and fills title, authors, journal, volume, issue,
  pages, year. User confirms/overwrites by saving; fields remain hand-editable. Offline/404 → inline
  error, nothing changed.
- **Citation** for a quote from an article (Chicago note style, matching existing book style):
  `Author, "Title," *Journal* 12, no. 3 (1998): 45–67, 52.` — missing parts are omitted cleanly
  (no `no.` without issue, no `: pages` without range, quoted page last when known). Book citations
  unchanged.

## Naming ("PDF" leaves the interface)

- Library page: two sections / a **Books | Articles** switch with counts; empty states
  "No books yet" / "No articles yet".
- Tab subtitle and breadcrumbs: "Library · Book" / "Library · Article" (was "Library · PDF").
- Right-panel pill **Books** → **Library**, containing a **Books | Articles** switch
  (same corpus-switch pattern as other pills); empty state "No books or articles yet".
- Setup wizard: "Existing local PDF folder" → "Existing library folder", hint text reworded to
  books and articles (still PDF files).
- New Tab tiles / omnibox / bookmarks labels that say PDF → Book/Article by kind.
- Unchanged where PDF names the file format: "Export to PDF", reader error messages about the
  file ("Could not open this file…" acceptable), "View in PDF" → "Open in Library".
- Internal names (`pdf` tab kind, `pdf_path`, `PdfReader`) stay — renaming them is churn with no
  user benefit.

## Data / migration

- New idempotent migration (next free version): `ALTER TABLE books ADD COLUMN kind TEXT NOT NULL
  DEFAULT 'book'`, `journal`, `volume`, `issue`, `pages`, `doi` (TEXT, nullable), each guarded by
  `PRAGMA table_info`. Existing rows stay books; the next sync re-derives kind from paths.
- Search index rows unchanged (kind not needed for FTS); search result groups show the item's kind
  label.

## Out of scope

Web/HTML articles; automatic metadata lookup by title; renaming internal identifiers; BibTeX/RIS
import.

## Testing

- Unit: kind-from-path rules (vault and local folder, nested, case-insensitive); article citation
  formatting incl. missing parts; Crossref response → fields mapping (fixture JSON, no network);
  migration idempotency.
- Integration (temp DB + temp folders): sync assigns kinds; Move to Articles/Books moves the file,
  updates paths/kind, keeps quotes; import into the chosen folder.
- Typecheck + full suite; live GUI checks by the user from a handed-over checklist.
