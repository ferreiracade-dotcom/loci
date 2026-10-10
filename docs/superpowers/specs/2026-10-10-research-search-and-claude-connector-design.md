# Research Search & Claude Connector — Design

Replaces **Phase 9 (AI Assistant)** of `Loci-Build-Spec.md`. Status: design, not started.

## Why

The original Phase 9 put an in-app chat on the Claude API (pay-as-you-go, billed
separately from Pro). What the user actually needs from AI is:

1. **Finding sources** — "I'm researching deacons": sweep the whole indexed library and
   show what each source says, with citations.
2. **Quick questions from my books**, answered from and cited to the library.
3. **Essay structure and review** — done in the Claude Pro app via copy/paste (accepted).

None of this needs an API key. The library index already lives in Loci; the reasoning
can come from the user's existing **Claude Pro desktop app** through a local **MCP
connector** that queries that index. Result: **$0 beyond Pro**, best-available model,
and citations that are always real because Loci — not the model — produces them.

## Principles

- **Loci owns quotes and citations.** The model only ever refers to passage ids; the
  quote text and CMOS 18 citation come from Loci (`src/shared/citation.ts`). A model
  cannot invent a page number it never writes.
- **Voices stay separate.** Results are grouped and attributed by source; never blended
  into one synthesized position.
- **Recall over precision for research.** Show "maybe relevant" rather than silently
  dropping hits.
- **Retrieval is the product.** Better search improves the search tab, the connector,
  and Copy for Claude at once.
- **Role boundary** (carried over from the build spec): surface, quote, cross-reference;
  ground every theological claim in a cited passage; defer doctrinal authority to
  Scripture, the Confessions, and the user's pastor/church; say plainly when nothing
  relevant was found.

## Parts

### A. Search tab (Chrome-style results page) — no AI

Typing a query in the omnibox (see `docs/superpowers/mockups/2026-10-09-chrome-ui-mockup.html`)
and pressing Enter opens a **search tab** — a real tab: back/forward, bookmarkable
(star), restored with the session, Alt+Enter opens in a new tab. References
(`rom 3:28`, `AC IV`) still jump straight to the passage as the mockup does; free text
goes to the results page.

Results page layout:

- **Header:** query, hit count, scope chips (All · Scripture · Confessions · Fathers ·
  Dogmatics · Commentaries · My books · My quotes & notes).
- **Related searches** chips under the header — e.g. `deacon` → *diakonos*, *diaconus*,
  *Diakon*, *the Seven*, *Acts 6*, *1 Timothy 3:8–13*, *Phoebe*, *almsgiving*. Source:
  a curated, user-editable **term map** (JSON in the vault) seeded with core Lutheran /
  biblical vocabulary incl. Greek/Latin/German; later augmented by embedding neighbors
  (Part C). One click runs that search; a toggle "include related terms" ORs them in.
- **Best matches** — top ~10 across everything, ranked (BM25 now; hybrid in Part C),
  with highlighted snippets.
- **By source** — the "what do my sources say" view: one collapsible section per source
  (Book of Concord, Chemnitz, Walther, Kretzmann, …), each listing its hits with page /
  article. Sorted by hit strength.
- **Side panel (knowledge-panel analogue):** key Scripture passages among the hits;
  existing quotes you've already captured on this topic; an existing topic note if one
  matches.
- **Each hit:** snippet, source, location, citation on hover; click opens the passage in
  a new tab at the exact spot; actions: *Save as quote*, *Copy citation*, *Add to topic*.
- **Actions bar:** *Save as topic note* (Part D) · *Copy for Claude* (packages the query,
  related terms, and top N passages with citations) · *Research in Claude* (copies a
  ready prompt that tells Claude to use the Loci connector on this topic and opens the
  Claude app).

### B. Loci MCP connector for Claude desktop

A small stdio MCP server shipped inside the app.

**Runtime.** Launched by Claude desktop as `Loci.exe` with `ELECTRON_RUN_AS_NODE=1`
running `connector.js` — no separate Node install, and `better-sqlite3` matches the
Electron ABI already built for the app. Opens the Loci SQLite DB **read-only**; the DB is
already in WAL mode, so it works whether or not Loci is open.

**Setup.** Settings → *Connect to Claude desktop*: shows the config entry and, on
confirm, adds it to `%APPDATA%\Claude\claude_desktop_config.json` (backing up first).
Status line shows whether it's installed.

**Passage ids** — stable across reindexing (not FTS rowids):
`page:<bookId>:<page>`, `confession:<sourceId>:<ref>`, `scripture:<ref>`,
`quote:<id>`, `note:<vault-relative path>`.

**Tools (read):**

| Tool | Input | Returns |
|---|---|---|
| `search_library` | `query`, optional `scope` (kinds, shelf, book ids), `limit` (default 20) | ranked hits: id, source title/author, location, snippet, citation |
| `get_passage` | `id`, optional `context` (± pages/paragraphs) | full passage text + citation |
| `list_sources` | optional filter (shelf, kind, text) | sources in the library with ids, so Claude can scope searches |
| `related_terms` | `term` | entries from the term map (Part A) |
| `get_topic` | `topic` | an existing topic note's contents |

**Tools (write) — via an inbox, never direct DB writes:**

| Tool | Effect |
|---|---|
| `save_quote` | `passage_id`, optional exact span, annotation, topic → quote entity |
| `add_to_topic` | `topic`, list of `{passage_id, note}` → appends to topic note |

Writes go as JSON files to `vault/inbox/claude/`; Loci (already watching the vault with
chokidar) imports them on next run or live, dedupes quotes by passage + span, sets
`ai_assisted: true`, and shows a toast ("Claude added 6 passages to *Deacons*"). This
avoids two processes writing the DB or the same markdown file at once.

**Server instructions** (sent to Claude on connect) carry the role boundary, plus:
expand queries across synonyms and Greek/Latin/German forms; group findings by source
and attribute; cite by passage id and quote only text returned by tools; say when the
library has nothing.

### C. Meaning search (embeddings) — second milestone

Keyword FTS misses passages that never use the query word ("the Seven who served
tables"). Add local, free embeddings:

- **Model:** small multilingual sentence-embedding model run with transformers.js (ONNX
  / WASM — no native build, per the no-MSVC constraint). Exact model chosen at plan time
  (must handle English + Greek/Latin/German reasonably; ~100–500 MB).
- **Chunks:** reuse existing index units (page, BoC paragraph, scripture chapter split
  to verses-groups, quote, note section) so ids stay the Part B ids.
- **Storage:** vectors as BLOBs in a new table; brute-force cosine in JS is fine at
  personal-library scale. Revisit (e.g. sqlite-vec) only if measured slow.
- **Ranking:** hybrid — reciprocal-rank fusion of BM25 and vector similarity.
- **Indexing:** background job with progress; incremental on import.
- Feeds the search tab, `search_library`, and related-terms suggestions.

### D. Topic notes (saved research)

"Loci" = commonplaces: a research sweep produces a **topic note**
(`vault/notes/topics/<topic>.md`) with frontmatter `topic`, `queries`, `last_run`, and
sections per source holding saved passages with citations. Re-running the topic shows
**"new since last run"** hits from books added later. Both the search tab and the
connector (`add_to_topic`) write here.

### E. Copy for Claude (kept, extended)

Existing plan stays; add an **Essay review package**: the essay note + passages it cites
+ top related passages from its topic, with a review prompt (structure, argument gaps,
unsupported claims, loose paraphrases, unused strong sources). User pastes into Pro.

## Removed from the original Phase 9

API key setting and `safeStorage` entry, AI mode toggle, cost meter, in-app chat panel /
bubble / inline "Ask Claude", Haiku auto transcript cleanup (transcripts stay raw; clean
via Copy for Claude). The Settings "AI Assistant" section becomes "Claude connector".

## Deferred (not in scope)

Optional in-app model via an OpenAI-compatible endpoint (Ollama local, Groq, OpenRouter,
Claude API). The connector + search tab cover the stated needs; revisit only if a real
gap appears. Note: local hardware (GTX 1050 Ti, 4 GB) limits local models to ~3–4B.

## Build order

1. **Search tab** on current FTS + term map (depends on the Chrome UI tab work).
2. **MCP connector** read tools + setup flow.
3. **Inbox write tools** + **topic notes**.
4. **Meaning search** (embeddings, hybrid ranking).
5. **Copy for Claude** essay package.

## Decisions

- **Term map seed:** start from the existing topic vocabulary in
  `src/shared/dogmaticsTopics.ts` (English/Latin/German per locus), add hand-curated
  entries for narrower subjects (e.g. deacons, church offices, Supper elements), and let
  the user add terms in-app. Embedding neighbors (Part C) supplement it later.
- **Ranking boost:** Scripture and the Confessions rank above other sources by default
  (norma normans / norma normata); toggleable on the results page.
- **Sequencing:** the search tab waits until the Chrome-style UI change has landed. The
  connector (steps 2–3) does not depend on it and may proceed independently.

## Open questions

- Pro usage-limit impact of large sweeps — measure once the connector exists.
