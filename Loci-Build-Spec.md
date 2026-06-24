# Loci — Complete Build Specification (Final)

> *Loci* — from Melanchthon's *Loci Communes Theologici* (1521), the common places
> where Scripture and confession are gathered around a topic. A personal theological
> library and reading-notes desktop app for a Confessional Lutheran doing serious study.
> Hand this document to Claude Code and build it **phase by phase**, confirming each
> phase works before the next.

---

## 0. Overview

**Loci** is a Windows desktop application that unifies a PDF book library,
a video-transcript reader, and an image library with an Obsidian-style linked-notes
system: backlinks, tags, full-text search, automatic CMOS 18 citations, Scripture
and Confessions indexing, native text-to-speech, and an optional AI research-and-
writing assistant.

The primary user is a Confessional Lutheran. Default content, tags, shelves, example
data, and the assistant's orientation reflect this. Scripture is the norming norm and
the Book of Concord its faithful exposition; the app and its AI are study aids that
**surface and organize what the sources say** — they never adjudicate doctrine.

### Core principles
- **Files are the source of truth.** Markdown notes, PDFs, images, entity pages, and
  highlight/quote sidecars live in the vault folder (a Google Drive synced folder).
- **SQLite is a local, rebuildable index** — never synced, never canonical.
- **Local-first.** The app always reads local files instantly; Drive syncs in the
  background; a separate local snapshot guards against bad syncs.
- **Every source has a linked note** where its highlights and auto-cited quotes gather.
- **Quotes are first-class entities** — reusing a quote never creates a duplicate.
- **AI is optional and cost-controlled** — a free "Copy for Claude" path always works;
  the in-app API assistant is opt-in and metered. It is a research and writing aid,
  never a doctrinal authority.

### Cost posture (important)
- Out of the box the app costs **$0 beyond existing subscriptions**: native TTS,
  "Copy for Claude," local + Drive storage.
- The only optional paid component is the **Claude API** (pay-as-you-go, billed by
  Anthropic separately from a Claude Pro subscription — Pro does **not** include API
  access). It is off unless the user adds a key, and every call is shown in a cost meter.
- **Speechify is not used.** **No paid embeddings.** **No video files stored.**

---

## 1. Tech Stack

| Concern | Choice |
|---|---|
| Shell | Electron (Windows desktop) |
| UI | React + TypeScript |
| Index | SQLite + FTS5 (local app-data dir, **not** synced) |
| Semantic retrieval | Local on-device embeddings (e.g. all-MiniLM via transformers.js/ONNX), free; FTS5 keyword fallback |
| Canonical data | Markdown files + sidecar JSON in the vault folder |
| Books | PDF only (PDF.js + pdfjs-dist). EPUB deferred to a future release |
| Note editor | CodeMirror |
| Video | yt-dlp (YouTube metadata + captions → transcript). No media files stored |
| Text-to-speech | Web Speech API (built into Electron's Chromium) — free, offline |
| AI assistant | Optional: Anthropic Claude API (`claude-sonnet-4-6`; `claude-haiku-4-5` for bulk) + always-free "Copy for Claude" |
| Scripture text | Bundled public-domain translations + user-supplied licensed text |
| PDF export | paged.js → Electron print-to-PDF |
| Sync | Google Drive for Desktop (passive) + separate local backup snapshot |
| Auto-update | electron-updater (needs a release host, e.g. GitHub Releases) |
| File watching | chokidar |
| Secrets | Electron `safeStorage` (API key); bcrypt (password) |
| Cover art / metadata | Google Books API |

---

## 2. Storage Architecture

### Vault folder (synced to Google Drive)
```
/vault/
  notes/
    <Book Title>/<note>.md           ← book notes (Book Page, Chapter, Topic)
    <Video Title>/<note>.md          ← video-transcript notes
    Images/<Image Title> — Notes.md  ← image notes
    standalone/<note>.md             ← topical & essay notes
  media/
    images/
  pages/
    authors/<name>.md
    denominations/<name>.md
    topics/<topic>.md
  highlights/
    <source>.highlights.json         ← quote/highlight entities (canonical)
  pdfs/
    cache/                           ← cached copies of external PDFs
```

### Local app-data (NOT synced, rebuildable)
```
%APPDATA%/Loci/
  index.sqlite        ← FTS5, tags, backlinks, embeddings, quotes table,
                        scripture/confessions index, metadata, session state,
                        panel sizes, password hash, API cost ledger
  config.json         ← settings, translation choice, rate card, backup path
```

### Separate local backup (NOT the Drive folder)
- On app close, and on a periodic timer while open, copy the entire vault to a
  **second local folder** chosen in Settings → Vault Health.
- Keep **one snapshot, overwritten each time** (user's choice).
- Result: three copies at rest — working vault, Drive cloud copy, local snapshot —
  so one accidental deletion or bad sync cannot wipe everything.
- A "Back up now" button and last-backup timestamp shown in Vault Health.

### Rules
- Canonical-to-files: quotes/highlights → highlights sidecar JSON; reading status,
  note-wide tags, citations, `ai_assisted` flag → `.md` frontmatter.
- Incremental re-index on launch by modified timestamp; manual full reindex in
  Vault Health. Reindexing never loses data because files are canonical.
- Last-write-wins for notes; Drive's version history handles recovery; ignore Drive
  conflict-copy files. No DB conflict banner (the DB is local).
- **Windows-safe filenames:** sanitize titles for folder names (strip/replace
  `: / \ ? * " < > |`), keep the original title in frontmatter, map sanitized↔original
  in SQLite.

### Quote entities (first-class) — canonical home = highlights sidecar JSON
Each object in `/vault/highlights/<source>.highlights.json`:
`id` · `text` · `anchor` (page/timestamp + char offset) · `color` ·
`tags` (quote-level) · `source` (title/author/page-or-timestamp) ·
`used_in` (array of note paths). SQLite mirrors these in a `quotes` table keyed by
`id`; the JSON is the truth and survives reindex. Anchors re-locate by fuzzy text
match near the stored offset; unmatched quotes are listed under **Detached
highlights** rather than dropped.

---

## 3. Visual Design — "Candlelit Study" (confirmed)

Reviewed against warm variations and two art-led directions; this original was
deliberately kept.

- **Mode:** dark only. A private study lit by a reading lamp — warm, not neon.
- **Palette:** base `#161310` · sidebar `#1e1a15` · panel `#231f19` · card `#2a251e` ·
  accent amber `#c9a96e` · muted gold `#8b6e42` · text `#e8dcc8` · muted `#665c47` ·
  borders `#2e2820` / `#3d3528`.
- **Type:** Playfair Display (titles/headings), Inter (UI), Crimson Pro (reading
  surfaces and quote blocks). Reading/UI fonts must include **polytonic Greek and
  extended-Latin** coverage (Crimson Pro covers Greek; verify any substitute) so
  bracketed glosses like *(δικαιοσύνη)* or *(Anfechtung)* render correctly.
- **Layout:** three panels — Left Sidebar | Center | Right Notes Panel.
- **Draggable dividers:** thin 2px at rest; on hover within 6px, `col-resize` cursor
  + a 3-dot grab handle; amber 40% during drag; 6px transparent hit-target overlay;
  min/max (left 48–320px, center ≥300px, notes 48–480px, results 220–400px); sizes
  persisted to SQLite.
- **Collapsible sidebars** to an icon rail (left: Library, Notes, Search, Scripture,
  Graph, Dashboard, Pages; right: Book Notes, Standalone Notes, Backlinks, Tags).
- **Drawers** (Book Info, Citation editor, Export preview, Add Video, Quick Capture,
  Start an Essay) slide from the right ~380px over the notes panel; Esc/click-out to
  dismiss; one at a time.

---

## 4. Build Phases

Each phase is a working milestone. Build, run, and verify before advancing.

### Phase 0 — Foundation & Shell
Electron + React + TS scaffold; electron-builder packaging. Three-panel layout with
draggable dividers and collapse-to-icon-rail (persisted). SQLite (FTS5) in app-data;
migrations. First-launch wizard (§5) and password lock (bcrypt; no forgot-password,
documented; no timeout). Settings framework; `safeStorage` for the API key. Session
restore (open source + page/scroll, open note + scroll, active tab, sidebar states,
cover-size, library view, search query+scope, panel sizes); missing file → soft
"Locate file" banner. **Empty states** for a vault with no content yet.
**Deliverable:** an unlockable, resizable, persistent shell.

### Phase 1 — Library Core (Books, PDF only) + Backup
Vault structure; files-as-truth wiring; Windows-safe filename sanitizing. PDF import
(cache external PDFs to `/vault/pdfs/cache/`, re-cache if newer). Metadata + cover art
(Google Books API; placeholder/upload fallback). Per book: title, author, year,
publisher, genre, reading status (Unread/Reading/Finished), cover, tags, shelves
(many-to-many), PDF path, quote count, **page offset** (PDF index → printed page).
Library views: **Grid** (cover + title; status badge; hover author/year/quotes;
double-click opens) with adjustable **cover-size slider** (~90–200px, persisted) ·
**List** · group-by Author/Genre/Tag/Shelf. **Content tabs** Books/Images/Videos
(latter two later). Shelf filtering + breadcrumb; view/size carry across shelves.
Shelf assignment three ways: drag-drop (multi-select with count badge), Move-to-Shelf
checkboxes in Book Info, right-click menu. **Drive sync indicator** (Synced/Syncing/
Offline + popover). **Local backup snapshot** on close (§2). Background indexing with
progress on large imports.
**Deliverable:** a browsable, organized, backed-up book library.

### Phase 2 — PDF Reading, Notes & Quote Entities
PDF.js viewer (nav/zoom/fit). **Per-book resume** — reopening any book returns to its
last page. Highlight → **quote entity** (stable `id` in the sidecar) → formatted quote
block in the linked note + CMOS 18 citation (engine in Phase 4; stub until then).
**Auto-linked source note:** opening any source auto-opens its note **collapsed to a
pinned title bar** at the top of the notes panel (icon + title + expand chevron + amber
quote-count badge); highlights flow in even when collapsed (badge increments + toast);
auto-create with frontmatter if absent; never overwrite; max two collapsed source
notes (third replaces oldest, saving first). **Quote-level tags (highlights notes
only):** a `＋` button beneath each quote block attaches a tag to that quote entity
only (chips, removable). **Reuse by `id`** (invisible marker), appending the note path
to `used_in`; citation renders from the entity. **Tag isolation:** quote-level tags do
not travel on reuse; a reusing note's note-wide tags do not write back. CodeMirror
editor with fixed toolbar (H1–H3, B/I/strike, bullet/numbered/blockquote, code, link,
image, font-size, citation Footnote↔Inline, preview toggle, export, auto-save
indicator) + live markdown shortcuts. Note types: Book Page/Chapter/Topic tabs.
Standalone & essay notes in `/vault/notes/standalone/`. `[[wiki links]]` autocomplete
(notes/books/videos/images/pages); `#tags` autocomplete; left-click same-panel (back
button), right-click Open-in-Split-Pane (two max); broken links red + click-to-fix +
Vault Health report. Backlinks section. Auto-save (~800ms) + indicator. Quick-capture
drawer (Ctrl+Shift+N).
**Deliverable:** read PDFs, capture tagged quote entities, write linked notes.

### Phase 3 — Search & Indexing (quote deduplication, Unicode-clean)
FTS5 over extracted PDF text; incremental reindex on change. Extraction + index must be
**Unicode-clean and accent-aware** so polytonic Greek and accented Latin/German extract
and search intact. Live dropdown (top ~5, ~300ms) + Enter → full results. Scope: all by
default; filter by book/shelf/author/tag/content-type; persists. **Quote dedup:** all
occurrences of one quote `id` collapse to a single result with a "used in N notes"
indicator. **"Matched where" signal:** distinguishes a quote-level tag in a highlights
note ("matched #justification in Large Catechism — highlights") from a note-wide tag on
a reusing note ("matched #law-gospel in <Essay>"). Persistent split view: results list
(~280px, retains scroll, active highlighted) | viewer; each entry shows title+thumb,
page/timestamp, amber-highlighted snippet, **→ Jump**.
**Deliverable:** fast, scoped, deduplicated search.

### Phase 4 — Citations & Academic Export
**CMOS 18 engine** (18th ed., Sept 2024): omit place of publication for books ≥1900
(`Author First Last, *Title* (Publisher, Year), Page.`); include city pre-1900; up to
two authors in notes then "et al." (six in bibliography, then first three + et al.);
shortened citations replace "ibid."; default notes-bibliography (footnotes), inline
toggle = author-date (consistent per note, re-rendered without data loss); formats for
book / video / image; printed page via page offset (amber "verify page" if unset);
missing fields as amber `[placeholder]`; auto-cite on every quote insert, editable
inline. **Copy a single formatted citation** to clipboard; **plain-text bibliography
export**. AI-content disclosure: `ai_assisted: true` frontmatter; inserted Claude text
always an attributed, timestamped blockquote; export offers a CMOS 18 AI-use note if
flagged. **Academic PDF export** via paged.js → Electron print: scope = note / all book
notes / selection / entity page / all; cover page ("Notes by <name>", date); serif
type; amber quote blocks; `[[links]]` as plain text; inline images; **real footnotes at
page bottom** (paged.js); **toggleable bibliography** (on by default, alphabetical by
author, editable in the export-preview drawer).
**Deliverable:** auto-cited quotes; academic-PDF export.

### Phase 5 — Video Transcripts (YouTube URL → read like a book)
**No video files are stored.** Add Video drawer: paste a **YouTube URL** → yt-dlp
fetches title, channel, upload date, thumbnail, and **captions → transcript**. Fields:
title, author/speaker, channel, year, tags, shelf. If a video has **no captions**, the
user may paste a `.txt`/`.srt` transcript manually (SRT → timestamped blocks). Transcript
indexed in FTS5 with timestamps. **Videos tab** in the library — same grid/list, shelf
filtering, sort, cover-size slider as books (entries are transcript records, not media).
**Transcript viewer** (center): header (title, speaker·channel·year, status badge, and
an **Open in YouTube** button that opens the URL at the current timestamp via `&t=`)
over the transcript as scrollable reading text with clickable amber **timestamp badges**.
Text selection → quote entity → linked note + CMOS citation; quotes persist; per-quote
tagging as in books. Notes panel identical to books (Video Page / Section / Topic).
Transcript results appear in search with timestamps. **Transcript cleanup** (punctuation/
caps/paragraphs, timestamps preserved): runs automatically only if AI mode is on (Haiku);
otherwise transcripts stay raw, and the user may clean one via "Copy for Claude." A
setting disables auto-cleanup even when API is on.
**Deliverable:** YouTube talks read, searched, highlighted, and cited like books.

### Phase 6 — Text-to-Speech (native, free)
Web Speech API only. Reads the current source's text (PDF or transcript) from the
current position onward, from the indexed text. **Word-level amber highlight** tracks
the spoken word. TTS toolbar: play/pause, stop, prev/next sentence, speed
(0.75×–2×), system-voice selector, progress. Reads source text only (sidebars/notes
excluded). **Mixed-language handling:** reads the English; bracketed non-Latin-script
glosses (Greek) are skipped cleanly rather than mispronounced; Latin/German (Latin
script) read inline as-is.
**Deliverable:** free, offline read-aloud with synced highlighting.

### Phase 7 — Entity Pages & Auto-Assembly
Author / Denomination / Topic pages (`.md`, frontmatter + free body). Author header:
name, born/died, tradition, nationality, bio, **aliases**, portrait. Auto-assembly on
two triggers (background on matching import/save/delete via chokidar; and on page open):
case-insensitive, trims, matches aliases, no partials. **Source Material** (Books/Videos/
Images, sorted by year, count + "Auto" badges, clickable). **Notes** (Book/Video/Image
notes, sorted by last edited). Manual customization coexists: header, body, **pinned key
quotes**, custom sections (＋); auto sections marked "Auto," not edited in place.
Denomination pages assemble tag-matched sources + tradition-matched author pages + tagged
notes; Topic pages assemble tagged sources + notes linking the topic + tagged quotes.
`author_links` table (`page_id`, `source_id`, `source_type`, `note_paths`, `last_updated`,
`page_type`) maintained by the watcher; pages read from it on open. Backlinks, tags,
Linked Library Items (thumbnails + type badges) on every page.
**Deliverable:** self-assembling author/topic/denomination indexes.

### Phase 8 — Scripture & Confessions Index
**Reference recognition:** a parser scans note text for Scripture references
(e.g. "Rom. 3:28", "John 1:14", ranges and lists) and Book of Concord citations using
standard sigla (AC, Ap, SA, Tr, SC, LC, FC Ep, FC SD + article/section, e.g. "FC SD III",
"AC IV", "LC I.1"). Recognized references are indexed in SQLite and rendered as subtle
clickable links in notes.
**Indexes & views:** a Scripture index (left-sidebar **Scripture** view) lists books/
chapters with counts — "find every note touching Romans 3" — and a parallel Confessions
index by document/article. Clicking a reference lists all notes (and quotes) citing it.
**Hover verse text:** hovering a recognized reference shows the verse text in a small
popover. Translation is **user-selectable** in Settings → Scripture:
- Bundled **public-domain** translations (e.g. KJV, ASV, World English Bible, German
  Luther 1545, Latin Vulgate) ship with the app and need no key.
- For **copyrighted** translations (e.g. ESV), the user supplies their own licensed
  text file (the app does not redistribute copyrighted translations); a "use my own"
  importer maps it to the verse index.
- Confessions hover text uses a bundled/optional public-domain edition where available;
  otherwise references stay index-and-link only.
References also act as a tag-like facet: an entity-style **Scripture passage** and
**Confession article** can gather their citing notes automatically, like Topic pages.
**Deliverable:** every Scripture and Confessions reference is searchable, cross-linked,
and hover-readable in your chosen translation.

### Phase 9 — AI Assistant (dual mode: free Copy + optional API)
Two paths; the user chooses. The Claude API is pay-as-you-go, billed by Anthropic
separately (Pro does not include it).

**Copy for Claude (free, always available).** On any note, selection, or quote, a
button copies the text + source context (title, author, page/timestamp, citation),
formatted, to the clipboard — ready to paste into the user's Claude Pro desktop app.
No key, no cost.

**Ask in-app (Claude API, opt-in, metered).** Active only when an API key is set
(Settings → AI Assistant, `safeStorage`). Uses `claude-sonnet-4-6` for answers,
`claude-haiku-4-5` for bulk (e.g. transcript cleanup). **Retrieval, not full-context:**
chunk + embed each source with a **local, free** embedding model (FTS5 keyword fallback);
send only the top-K relevant chunks, each tagged with source + page/timestamp; "current
note" sends the full note; show "Based on N passages from <scope>" with passages
expandable. Three access modes: floating bubble → 320×400 draggable window; dedicated
panel (Ctrl+Shift+A, resizable, min 260px); inline "Ask Claude" on selection. Scope
selector: Current book / <Shelf> / Whole vault / Current note (persists per session;
change = new session divider).

**Capabilities:** summarize; suggest related quotes (referencing existing quote `id`s,
extending `used_in`, capturing new entities when needed); expand/clarify/rephrase a
selection; answer theological questions **grounded in and cited from retrieved
passages**; critique and strengthen writing; **Start an Essay** (below); insert into
note (attributed, timestamped blockquote → sets `ai_assisted`).

**Start an Essay** (button in the AI panel and File → New → Essay) — two stages:
*Stage 1 Preparation* (whole-library/vault scope): user enters topic + optional thesis;
Claude recommends what to read in two clearly separated groups — **In your library**
(clickable sources, with chapters/articles/pages and the reason) and **Not in your
library** (key works the tradition treats it in that the user lacks, e.g. "Walther,
*Law and Gospel*, theses XXV–XXVI" — **name + location + reason only**, self-contained,
no acquisition lookup, marked "not in library"). On confirm, create an essay note in
`/vault/notes/standalone/` pre-seeded with a working thesis line, a source-drawn outline,
a **"Sources to read" checklist** (both groups; in-library entries clickable/tickable),
and any already-captured relevant quotes with citations. *Stage 2 Composition:* the
essay note's scope defaults to the chosen **shelf**; user can widen manually.

**Role boundary** (enforce in the system prompt): a research and writing assistant for a
Confessional Lutheran library that surfaces, quotes, and cross-references in-scope
sources; grounds every substantive theological claim in a cited retrieved passage;
attributes positions to their sources; distinguishes quotation from paraphrase;
recommends what to read and scaffolds/strengthens the user's writing; **defers doctrinal
authority to Scripture, the Confessions, and the user's pastor/church**, and does not
write the user's argument or thesis. If retrieval finds nothing relevant, it says so
plainly rather than answering from general knowledge.

**AI mode toggle** (Settings): "Copy only / Copy + API." **Default each launch: Copy +
API** (assistant ready whenever a key is set). With no key, in-app "Ask" affordances are
hidden and only "Copy for Claude" appears — fully usable at $0.

**Cost meter** (visible whenever API mode is active): shows **both session total and
month-to-date** (e.g. "Session $0.04 · This month $1.12"), computed from token usage at
rates stored in config (editable); click for a breakdown by day and feature; optional
soft monthly cap with warning (off by default).

**UI:** user right / Claude left with amber sparkle; amber-bordered quotes; streaming
with animated dot; Clear conversation.
**Deliverable:** free copy-out plus an optional, fully metered, source-grounded assistant.

### Phase 10 — Dashboard, Images & Media Embedding
**Dashboard:** reading-status ring; total quotes; notes over time (monthly bars); most
active tags; **Recently Active** (same grid/list, ~12 most recent, timestamps,
clickable); header stats (books, quotes, notes, pages). **Images tab:** import JPG/PNG/
TIFF/scanned-PDF images (manuscripts, maps, diagrams); grid with thumbnail/title/tags/
source; opening an image auto-loads its linked note; **Add Image Reference** inserts a
CMOS-cited reference block + embedded thumbnail. **Media embedding in notes:** drag-drop
image → inline; paste YouTube URL → inline iframe; `[[media:filename]]` for vault images.
**Deliverable:** library stats, image library, rich-media notes.

### Phase 11 — Polish & Ship
electron-updater (release host, e.g. GitHub Releases; silent background, "Updated to
vX.Y.Z" toast). **Tag management** view: rename/merge/delete tags across the vault for
both note-wide and quote-level tags. **Vault Health:** manual reindex, broken-links
report, detached-highlights list, backup controls. Command palette (Ctrl+P). Graph view
stub. Finalize shortcuts (Ctrl+F search, Ctrl+Shift+N capture, Ctrl+B/I, Ctrl+[ / Ctrl+]
collapse, Ctrl+Shift+A AI, Ctrl+P palette). **Windows reality notes:** an unsigned build
trips SmartScreen on first launch (expected for personal use); keep yt-dlp updatable.
Document out-of-scope items in Help.
**Deliverable:** a shippable, self-updating v1.

---

## 5. First-Launch Wizard
1. Choose the **vault folder** (recommend a Google Drive for Desktop synced folder).
2. Choose a **PDF source folder**.
3. Choose a **local backup folder** (separate from the vault).
4. **Set a password.**
5. Auto-import PDFs → extract text → FTS5 + local embeddings.
6. Fetch metadata + cover art (Google Books API).
7. (Optional) add a **Claude API key**; choose AI mode (default Copy + API).
8. Choose a default **Scripture translation** (bundled public-domain set, or import your own).
9. Default **shelves**: Lutheran Confessions, Church Fathers, Currently Reading, Reference.
10. Default **tags**: `#theology #confessional #liturgy #catechism #law-gospel
    #sacraments #history #christology`.
11. Default **topic pages**: Law & Gospel, Justification, Baptism, Lord's Supper,
    Christology, Confession & Absolution.
12. Default **denomination page**: Lutheran (Confessional).
13. Note: **OCR and EPUB are out of scope for v1** — scanned-only PDFs won't be
    searchable; EPUB books aren't imported yet.

---

## 6. Security & Sync
- Password on launch (bcrypt in local SQLite); lock screen before vault loads; no
  forgot-password (reset by deleting the hash, documented); no session timeout.
- Passive Drive sync; app always reads local files; last-write-wins; sync indicator
  reflects Drive state; separate local backup snapshot guards against bad syncs.

---

## 7. Out of Scope (v1)
Mobile app · Google Drive OAuth (folder-path sync only) · **EPUB** (PDF only for now) ·
**OCR** for scanned PDFs/images · stored video files / Whisper / external video players
(YouTube-URL transcripts only) · Speechify / paid TTS · paid embeddings (local only) ·
audio-file support · collaboration / multi-user · interactive graph view (stub) ·
redistribution of copyrighted Bible translations or Confessions editions (public-domain
bundled; copyrighted = user-supplied) · external acquisition lookup for not-in-library
recommendations (name-and-reason only).

---

## 8. Build Notes for Claude Code
- Build **phase by phase**; run each milestone before the next.
- Keep **files canonical** and **SQLite rebuildable** — verify a wiped index rebuilds
  from the vault (including quote entities and the scripture/confessions index) after
  every indexing phase.
- Establish **draggable-divider** and **icon-rail** primitives in Phase 0; reuse them.
- Treat **quotes as entities from Phase 2**; search dedup (Phase 3) and AI quote
  suggestions (Phase 9) depend on `id` + `used_in`.
- Make extraction/index **Unicode-clean** (Phase 3) so Greek/Latin/German glosses survive.
- Validate citations against **actual CMOS 18 rules**, not approximations.
- AI is **optional and metered**: zero cost with no key (Copy for Claude + native TTS);
  with a key, every call shows in the session + month-to-date meter. Use **local, free
  embeddings**. The assistant **cites retrieved passages, recommends rather than
  acquires, and never adjudicates doctrine or writes the user's argument.**
- Do **not** redistribute copyrighted Bible translations or Confessions editions; bundle
  public-domain texts and let the user supply licensed ones.
```

