# Reference Sidebar Consolidation — Design

**Status:** approved 2026-07-20, ready for planning.

## Problem

The right-hand reference panel's tab strip has grown to nine pills:

`Book Quotes · Bible Quotes · Notes · Backlinks · Books · Bible · Commentary · Confessions · Confessions ref`

Three problems, in order of severity:

1. **The strip is organised by corpus, not by task.** "Book Quotes" and "Bible Quotes" are the
   same activity — reading quotes attached to whatever you have open — split across two pills
   purely because the underlying tables differ. Same for the two commentary pills.
2. **Adding a corpus multiplies pills.** Landing the Book of Concord added three tabs. A fourth
   corpus would add three more. The axis of growth is wrong.
3. **`Confessions` and `Confessions ref` sit adjacent and are indistinguishable by name.** One is
   section commentary, the other an independent reader. This was raised as "what's confessions
   ref though?" — the name failed at its only job.

The nine pills also stopped fitting: they shrank to a uniform 56px with labels spilling outside
their borders (fixed separately in `1d586ff`, but that fix only buys room — it doesn't address
the axis of growth).

## Solution

Reorganise the strip **by task**, with corpus as a mode *inside* a panel rather than a pill of its
own. Five pills:

`Quotes · Notes · Books · Texts · Commentary`

| Pill | Modes | Composed from |
|---|---|---|
| **Quotes** | Books · Bible · Confessions | `QuotesPanel`, `ScriptureHighlightsPanel`, **new BoC quotes panel** |
| **Notes** | — | `StandaloneNotesPanel` (unchanged) |
| **Books** | — | `ReferencePdfPanel` (unchanged) |
| **Texts** | Bible · Confessions | `ReferenceBiblePanel`, `ReferenceBocPanel` |
| **Commentary** | Bible · Confessions | `CommentaryPanel`, `BocCommentaryPanel` |

Adding a corpus now adds *modes*, not pills — the strip stays at five.

### Why "Books" stays a separate pill

A PDF reader is a different kind of object from a scripture/confessions reader: different
navigation (pages vs chapters/sections), different chrome, no shared location model. Folding it
into "Texts" would put two unrelated UIs behind one switch. Decided deliberately, not by omission.

### Switching model

One shared `CorpusSwitch` — a segmented control at the top of any multi-mode panel.

- **Auto-follow, until you take control:** the mode mirrors the focused centre tab's kind —
  `pdf` → Books, `bible` → Bible, `boc` → Confessions.
- **Sticky override:** clicking a mode pins it for that pill. Auto-follow stops for that pill and
  the choice persists across restarts, alongside the rest of the layout state.

Each pill pins independently — pinning Commentary to Bible leaves Quotes still following.

A transient override (resetting on the next tab change) was considered and rejected. The argument
for it was that a pin leaves the panel in a state whose cause isn't visible; that argument fails,
because `CorpusSwitch` sits at the top of the panel displaying the active mode — the state is on
screen. Meanwhile transient has a real cost: it makes deliberate comparison impossible, since
reading AC IV against Bible commentary means re-picking the mode every time focus moves.

**Accepted cost:** a pinned mode can look broken. Commentary pinned to Bible while you read the
Confessions shows "Click a verse to see commentary" — accurate, but easy to misread as a failure.
The existing empty-state copy is the mitigation; each mode's empty state must name its corpus
("Click a *verse*…" vs "Click a *section*…") so the panel explains itself. No extra banner.

When the focused tab's kind has no corresponding mode (e.g. a note is focused, and the Quotes
panel has no Notes mode), the panel keeps its current mode rather than blanking.

## What this removes

**The Backlinks pill is deleted**, along with `BacklinksPanel`.

This removes real functionality — "what links to this note" has no other home in the UI.
`StandaloneNotesPanel` reuses the `backlinks-list` CSS class but does not show backlinks, so
nothing else covers it. Accepted as a deliberate trade: the pill was rarely reached and the strip
budget is better spent elsewhere.

The `notes.backlinks` service and its IPC channel **stay**. They are inert without a caller, cost
nothing, and are the natural foundation if backlinks return (e.g. inside the note editor, which is
where they arguably belong). Removing them would be the harder change to reverse.

## What this adds

**A BoC quotes reference panel** — the Confessions mode of the Quotes pill. No such component
exists: `ScriptureHighlightsPanel` is Bible-only and `QuotesPanel` is book-only. This is genuinely
new work rather than consolidation, and is the largest single piece.

It follows the pattern of `ScriptureHighlightsPanel`: location-anchored to the focused BoC tab's
document, listing that document's quotes grouped by section, reusing `QuoteCard` and
`makeQuoteCardHandlers` so drag/copy/tags/annotations behave identically. Data comes from the
`listBocQuotes(bocSourceId, documentCode)` IPC added in `5b80540`.

## Migration

`activeRightTab` is persisted in the layout. Six of the nine ids disappear. Without a mapping the
user silently lands on a fallback tab, losing their place.

| Old id | New pill | New mode |
|---|---|---|
| `book-notes` | `quotes` | books |
| `scripture-highlights` | `quotes` | bible |
| `standalone-notes` | `notes` | — |
| `backlinks` | `notes` | — (panel deleted; nearest surviving home) |
| `reference-pdf` | `books` | — |
| `reference-bible` | `texts` | bible |
| `reference-boc` | `texts` | confessions |
| `commentary` | `commentary` | bible |
| `boc-commentary` | `commentary` | confessions |

Applied when reading the persisted layout, so it is a pure read-path normalisation — no migration
of stored data, and a stale value from an older build still resolves.

`WIDE_RIGHT_TABS` in `ThreePanel` (which widens the panel for reader-like tabs) must be updated to
the new ids: `books`, `texts`, `commentary`.

## Architecture

Each merged pill is a **thin wrapper**: it owns the mode state, renders `CorpusSwitch`, and renders
the existing panel unchanged as the mode body. The existing panels are not rewritten — they keep
their own data loading and their own behaviour. This keeps the blast radius small and means a bug
in the consolidation cannot corrupt a panel that works today.

```
ReferencePanel (pill)
├── CorpusSwitch          ← shared; mode state + auto-follow
└── <mode body>           ← existing panel component, untouched
```

`CorpusSwitch` is presentational: it takes the available modes, the active mode, and an onChange.
The auto-follow rule lives in one place — a small hook (`useCorpusMode`) reading the focused tab's
kind from the store — so all three pills follow identical rules and the rule is unit-testable
without rendering anything.

## Testing

Matches the codebase's existing constraint: logic-level `vitest` only, no component-render infra.

- **Unit-testable, and where the real risk is:** the tab-id migration map (every legacy id resolves
  to a valid pill+mode) and the mode-resolution rule (`useCorpusMode`'s pure core: given focused
  tab kind, the pill's pinned mode if any, and the current mode — which mode wins). Both are pure
  functions and both are exactly the kind of mapping that breaks silently. The pin case matters
  most: a pinned mode must survive a tab change, and an unpinned one must not.
- **Not unit-testable:** the wrappers themselves, which are composition only.
- **Verified in the running app** over CDP (`playwright-core` against the renderer's debug port —
  the technique established on 2026-07-20): the strip renders five pills on one row; each pill's
  switch changes the body; auto-follow tracks the focused tab; a persisted legacy id resolves to
  the right pill and mode.

## Non-goals

- Renaming or restructuring the **left** rail.
- Changing any panel's internal behaviour — the bodies are moved, not rewritten.
- Restoring backlinks in another location. If wanted, that is its own piece of work.
- A Confessions mode for the **Books** pill, or any merge of the PDF reader.
