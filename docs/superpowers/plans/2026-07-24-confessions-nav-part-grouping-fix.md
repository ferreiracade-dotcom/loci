# Confessions Nav Part-Grouping Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the Confessions (Book of Concord) sidebar navigation so sections group under the correct part/article headers, matching the real Book of Concord structure (verified against bookofconcord.cph.org).

**Architecture:** Loci's Confessions nav has no static TOC tree — it's derived at index time by parsing `## ordinal | number | label | part` headings out of a Markdown file produced by `tools/boc-epub-to-md.mjs`, then grouping rows by `part` in the renderer (`groupByPart` in `BocPane.tsx`). The bug is entirely in how the converter computes each section's `part` field: `assignParts()`'s heuristic ("a divider is a heading with no body text of its own") breaks whenever a genuine top-level Article/Part heading also carries its own lead-in paragraph before its first sub-heading — which happens repeatedly in the Formula of Concord, Augsburg Confession, Smalcald Articles, Small Catechism, and Large Catechism. This plan extracts `assignParts()` into its own module with two additional structural rules, adds a regression test, and ships a one-time repair script that patches the *already-converted* Markdown (both the gitignored `tools/sources/` copies and the live vault files) without needing the source EPUB. It also fixes a UI inconsistency where `PanePicker.tsx`'s Confessions browser doesn't group by part at all (unlike `BocPane.tsx`'s sidebar).

**Tech Stack:** Node ESM scripts (`tools/*.mjs`, no build step), Vitest, React/TypeScript renderer.

## Global Constraints

- The Book of Concord corpus is fixed and closed (14 historical documents that never change) — hardcoding known structural labels (as the existing converter already does for e.g. Saxon Visitation Articles) is acceptable and is the established pattern in this codebase.
- `tools/sources/*.md` are gitignored (copyrighted converter output) — the repair script must work on them in place without needing the source EPUB.
- The live vault copy lives at `%APPDATA%\Loci\vault\confessions\Concordia Reader's Edition.md` and `%APPDATA%\Loci\vault\confessions-commentary\Concordia Reader's Edition Notes.md` — reaching real `%APPDATA%` (not the sandboxed view) requires `dangerouslyDisableSandbox: true` on the shell tool.
- Do not touch ordinal numbering anywhere in this plan — every fix is a `part`-field-only correction, so existing citations/highlights keyed by `(documentCode, ordinal)` are never invalidated.
- Match existing code style: no comments explaining *what* code does, only non-obvious *why* (this codebase's converter already follows this convention heavily — preserve it).

---

### Task 1: Extract `assignParts()` into a shared, tested module with the structural fix

**Files:**
- Create: `tools/boc-parts.mjs`
- Create: `tools/boc-parts.test.mjs`
- Modify: `tools/boc-epub-to-md.mjs:389-412` (delete old `assignParts`), and its import block near the top
- Modify: `vitest.config.ts`

**Interfaces:**
- Produces: `assignParts(docsOut: Map<string, Section[]>): void` where `Section = { number: string | null, label: string, part: string | null, body: unknown[] }` (mutates `.part` in place). Both `tools/boc-epub-to-md.mjs` (real converter) and Task 3's repair script import this.

- [ ] **Step 1: Write the failing test**

Create `tools/boc-parts.test.mjs`:

```js
import { describe, expect, it } from 'vitest'
import { assignParts } from './boc-parts.mjs'

function section(overrides) {
  return { number: null, label: '', part: null, body: [], ...overrides }
}

describe('assignParts', () => {
  it('treats an empty-body heading as a divider (existing behavior)', () => {
    const docsOut = new Map([
      ['SC', [
        section({ label: 'Preface', body: ['text'] }),
        section({ label: 'I. The Ten Commandments', body: [] }),
        section({ label: 'The First Commandment', body: ['text'] })
      ]]
    ])
    assignParts(docsOut)
    const [preface, divider, first] = docsOut.get('SC')
    expect(preface.part).toBeNull()
    expect(divider.part).toBeNull()
    expect(first.part).toBe('I. The Ten Commandments')
  })

  it('resets on a Roman-numeral-prefixed label even when it carries its own lead-in body text', () => {
    // Regression: Formula of Concord articles like "VII. The Holy Supper Of Christ" have their
    // own intro paragraph before "Status Of The Controversy", so the empty-body rule alone
    // wrongly kept them merged into the PRECEDING article's group.
    const docsOut = new Map([
      ['FC-EP', [
        section({ label: 'VI. The Third Use Of God’s Law', body: ['intro'] }),
        section({ label: 'Status Of The Controversy', body: ['text'] }),
        section({ label: 'VII. The Holy Supper Of Christ', body: ['intro'] }),
        section({ label: 'Status Of The Controversy', body: ['text'] }),
        section({ label: '[XII.] Other Factions And Sects', body: ['intro'] })
      ]]
    ])
    assignParts(docsOut)
    const [vi, viStatus, vii, viiStatus, xii] = docsOut.get('FC-EP')
    expect(vi.part).toBeNull()
    expect(viStatus.part).toBe('VI. The Third Use Of God’s Law')
    expect(vii.part).toBeNull()
    expect(viiStatus.part).toBe('VII. The Holy Supper Of Christ')
    expect(xii.part).toBeNull()
  })

  it('does not treat a numbered Article as a divider when it has its own `number` field (AC/Apology)', () => {
    // AC's real articles carry a separate `number` ("IV") with a plain-text label
    // ("Justification") — they must stay grouped under the preceding divider, never reset.
    const docsOut = new Map([
      ['AC', [
        section({ label: 'Chief Articles Of Faith', body: [] }),
        section({ number: 'IV', label: 'Justification', body: ['text'] }),
        section({ number: 'V', label: 'The Ministry', body: ['text'] })
      ]]
    ])
    assignParts(docsOut)
    const [divider, iv, v] = docsOut.get('AC')
    expect(divider.part).toBeNull()
    expect(iv.part).toBe('Chief Articles Of Faith')
    expect(v.part).toBe('Chief Articles Of Faith')
  })

  it('resets on the known one-off AC/Smalcald/Large-Catechism divider labels despite lead-in body text', () => {
    const docsOut = new Map([
      ['AC', [
        section({ number: 'XXI', label: 'Worship of the Saints', body: ['text'] }),
        section({ label: 'A Review of the Various Abuses That Have Been Corrected', body: ['lead-in'] }),
        section({ number: 'XXII', label: 'Both Kinds in the Sacrament', body: ['text'] })
      ]],
      ['SA', [
        section({ label: 'The Second Part', body: ['lead-in'] }),
        section({ number: 'I', label: 'The Chief Article', body: ['text'] }),
        section({ label: 'The Third Part', body: ['lead-in'] }),
        section({ number: 'I', label: 'Sin', body: ['text'] })
      ]],
      ['LC', [
        section({ label: 'Part 1', body: ['THE FIRST COMMANDMENT', 'text'] }),
        section({ label: 'The Second Commandment', body: ['text'] })
      ]]
    ])
    assignParts(docsOut)
    const [xxi, abuses, xxii] = docsOut.get('AC')
    expect(xxi.part).toBeNull()
    expect(abuses.part).toBeNull()
    expect(xxii.part).toBe('A Review of the Various Abuses That Have Been Corrected')

    const [secondPart, chiefArticle, thirdPart, sin] = docsOut.get('SA')
    expect(secondPart.part).toBeNull()
    expect(chiefArticle.part).toBe('The Second Part')
    expect(thirdPart.part).toBeNull()
    expect(sin.part).toBe('The Third Part')

    const [part1, secondCommandment] = docsOut.get('LC')
    expect(part1.part).toBeNull()
    expect(secondCommandment.part).toBe('Part 1')
  })

  it('resets the running part at each document boundary', () => {
    const docsOut = new Map([
      ['AC', [section({ label: 'Chief Articles Of Faith', body: [] }), section({ number: 'I', label: 'God', body: ['x'] })]],
      ['AP', [section({ number: 'I', label: 'God', body: ['x'] })]]
    ])
    assignParts(docsOut)
    expect(docsOut.get('AP')[0].part).toBeNull()
  })
})
```

- [ ] **Step 2: Update `vitest.config.ts` so this test file is collected**

Modify `vitest.config.ts` — change the `include` array:

```ts
    include: ['src/**/*.test.ts', 'tools/**/*.test.mjs']
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run tools/boc-parts.test.mjs`
Expected: FAIL — `Cannot find module './boc-parts.mjs'` (the module doesn't exist yet).

- [ ] **Step 4: Create `tools/boc-parts.mjs` with the fixed implementation**

```js
// Shared `part`-field assignment logic for the Book of Concord converter
// (boc-epub-to-md.mjs) and the one-time repair tool (boc-repair-parts.mjs) that patches
// already-converted output. Pulled into its own module so both can run identical logic and so
// it's unit-testable without needing a real EPUB (see boc-parts.test.mjs).

/** Document-specific top-level Article/Part headings that carry their own lead-in body text (so
 *  the empty-body heuristic below can't recognize them as dividers) but are still real
 *  part-dividers whose label should become the running part for what follows. The Book of
 *  Concord is a fixed, closed corpus of 14 historical documents, so hardcoding each one's known
 *  divider labels (verified against tools/sources/boc-primary.md and bookofconcord.cph.org) is
 *  safe and needs no maintenance for new content. Keyed by document code. */
const KNOWN_DIVIDER_LABELS = {
  AC: new Set(['A Review of the Various Abuses That Have Been Corrected']),
  SA: new Set(['The First Part', 'The Second Part', 'The Third Part']),
  LC: new Set(['Part 1', 'Part 2', 'Part 3', 'Part 4', '[Part 5]'])
}

/** A bare Roman-numeral-prefixed label ("I. Original Sin", "VI. The Third Use Of God's Law",
 *  optionally bracketed like "[XII.] Other Factions…") always marks a genuine top-level
 *  Article/chapter divider in the documents that bake their numbering directly into the label
 *  instead of using a separate `number` field (Small Catechism's six chapters; both Formula of
 *  Concord texts' twelve articles) — confirmed against the whole corpus to occur nowhere else,
 *  so this never misfires on AC/Apology/Smalcald's real numbered articles (those carry a
 *  non-null `number` and their labels don't start with a numeral). */
const NUMBERED_DIVIDER_RE = /^\[?[ivxlcdm]+\.\]?\s/i

function isDivider(code, section) {
  if (section.body.length === 0) return true
  if (section.number == null && NUMBERED_DIVIDER_RE.test(section.label)) return true
  return KNOWN_DIVIDER_LABELS[code]?.has(section.label) ?? false
}

/** Structural (not typographic) part-header detection: a part/article-title heading is,
 *  factually, one whose own section carries no body text — the label is a divider, and the real
 *  content lives in the sections that follow it, until the next such divider — UNLESS it's one
 *  of the known exceptions above (a genuine divider that also happens to carry its own lead-in
 *  body text). Runs as a post-pass over each document's finished section list (order preserved
 *  from parsing), since whether a heading has body text can only be known once every heading has
 *  been read. Resets the running part at each document boundary (each `sections` array is one
 *  document's).
 *
 *  A divider's OWN `part` field is left null (it doesn't belong to itself); its label becomes the
 *  running part attributed to every subsequent section, until the next divider replaces it. */
export function assignParts(docsOut) {
  for (const [code, sections] of docsOut) {
    let runningPart = null
    for (const s of sections) {
      if (isDivider(code, s)) {
        runningPart = s.label
        s.part = null
      } else {
        s.part = runningPart
      }
    }
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tools/boc-parts.test.mjs`
Expected: PASS (5 tests)

- [ ] **Step 6: Rewire `tools/boc-epub-to-md.mjs` to import the shared implementation**

Modify `tools/boc-epub-to-md.mjs`. Add the import near the top, right after the existing `node:child_process` import (around line 28):

```js
import { execFileSync } from 'node:child_process'
import { assignParts } from './boc-parts.mjs'
```

Then delete the old inline implementation entirely — remove this whole block (originally lines 389-412):

```js
/** Structural (not typographic) part-header detection: a part/article-title heading is,
 *  factually, one whose own section carries no body text — the label is a divider, and the
 *  real content lives in the sections that follow it, until the next such divider. This can
 *  only be known once every heading's body is fully collected, so it runs as a post-pass over
 *  each document's finished section list (order preserved from parsing) rather than being
 *  guessed inline while a heading is first seen. Resets the running part at each document
 *  boundary (each `sections` array is one document's).
 *
 *  A part heading's OWN `part` field is left null (it doesn't belong to itself); its label
 *  becomes the running part attributed to every subsequent text-bearing section, until the
 *  next empty-body heading replaces it. */
function assignParts(docsOut) {
  for (const sections of docsOut.values()) {
    let runningPart = null
    for (const s of sections) {
      if (s.body.length === 0) {
        runningPart = s.label
        s.part = null
      } else {
        s.part = runningPart
      }
    }
  }
}
```

The existing call site (`assignParts(docsOut)` inside `convert()`, right before `return docsOut`) stays exactly as-is — it now resolves to the imported function.

- [ ] **Step 7: Verify the converter script still parses with Node (syntax check only — it needs a real EPUB to run end-to-end, which this repo doesn't have on disk)**

Run: `node --check tools/boc-epub-to-md.mjs`
Expected: no output, exit code 0

- [ ] **Step 8: Commit**

```bash
git add tools/boc-parts.mjs tools/boc-parts.test.mjs tools/boc-epub-to-md.mjs vitest.config.ts
git commit -m "fix(confessions): correct part-divider detection for headings with lead-in body text"
```

---

### Task 2: One-time repair script for already-converted Markdown

**Files:**
- Create: `tools/boc-repair-parts.mjs`

**Interfaces:**
- Consumes: `assignParts` from `./boc-parts.mjs` (Task 1).
- Produces: a CLI script `node tools/boc-repair-parts.mjs <primary.md> <commentary.md>` that patches the `part` field of every `## ordinal | number | label | part` header line in both files in place, leaving all other content byte-identical in meaning (canonicalized whitespace only).

- [ ] **Step 1: Create `tools/boc-repair-parts.mjs`**

```js
// One-time repair tool: re-derives the `part` field for every section in an already-converted
// Book of Concord primary-text file (see boc-epub-to-md.mjs) using the CURRENT assignParts()
// logic, then patches just the `part` field of each `## ordinal | number | label | part` header
// line in place — in both the primary file and its paired commentary file (which carries an
// identical part per ordinal, since both are written from the same section list when the
// converter first runs). Body/note text is never touched, and ordinals are never renumbered.
//
// Use this after fixing a bug in assignParts() to correct output that's already been written
// (and, for the live app, already synced into the vault) without needing to re-run the whole
// EPUB conversion (which requires the source EPUB — not always at hand).
//
// Usage: node tools/boc-repair-parts.mjs <primary.md> <commentary.md>

import { readFileSync, writeFileSync } from 'node:fs'
import { assignParts } from './boc-parts.mjs'

const [primaryPath, commentaryPath] = process.argv.slice(2)
if (!primaryPath || !commentaryPath) {
  console.error('usage: node tools/boc-repair-parts.mjs <primary.md> <commentary.md>')
  process.exit(1)
}

// Only the 3 documents assignParts()'s KNOWN_DIVIDER_LABELS keys by code (boc-parts.mjs) need
// translating from the `# <title>` heading text a .md file actually carries; every other
// document's code is never looked up there, so an untranslated title works fine as its Map key.
const CODE_FOR_TITLE = {
  'Augsburg Confession': 'AC',
  'Smalcald Articles': 'SA',
  'Large Catechism': 'LC'
}

const HEADER_RE = /^## (\d+) \| ([^|]*)\| ([^|]*)\| (.*)$/
const DOC_RE = /^# (.+)$/

/** Parse a primary-text .md file into the `Map<code, section[]>` shape assignParts() expects,
 *  reconstructing each section's `body`-non-emptiness from the text between its header and the
 *  next one — the same signal the real converter's sections carry when assignParts() runs. */
function parseSections(text) {
  const docsOut = new Map()
  let code = null
  let current = null
  let bodyLines = []
  function flush() {
    if (current) current.body = bodyLines.filter((l) => l.trim().length > 0)
    bodyLines = []
  }
  for (const line of text.split('\n')) {
    const docM = DOC_RE.exec(line)
    if (docM) {
      flush()
      code = CODE_FOR_TITLE[docM[1]] ?? docM[1]
      current = null
      continue
    }
    const headM = HEADER_RE.exec(line)
    if (headM && code) {
      flush()
      current = { ordinal: Number(headM[1]), number: headM[2].trim() || null, label: headM[3].trim(), part: null }
      if (!docsOut.has(code)) docsOut.set(code, [])
      docsOut.get(code).push(current)
      continue
    }
    if (current) bodyLines.push(line)
  }
  flush()
  return docsOut
}

function patch(text, correctedPart) {
  let code = null
  return text
    .split('\n')
    .map((line) => {
      const docM = DOC_RE.exec(line)
      if (docM) {
        code = CODE_FOR_TITLE[docM[1]] ?? docM[1]
        return line
      }
      const headM = HEADER_RE.exec(line)
      if (headM && code) {
        const key = `${code}:${Number(headM[1])}`
        const part = correctedPart.has(key) ? correctedPart.get(key) : headM[4].trim()
        return `## ${headM[1]} | ${headM[2].trim()} | ${headM[3].trim()} | ${part ?? ''}`
      }
      return line
    })
    .join('\n')
}

const primaryText = readFileSync(primaryPath, 'utf8')
const docsOut = parseSections(primaryText)
assignParts(docsOut)

const correctedPart = new Map() // `${code}:${ordinal}` -> corrected part
for (const [code, sections] of docsOut) {
  for (const s of sections) correctedPart.set(`${code}:${s.ordinal}`, s.part)
}

writeFileSync(primaryPath, patch(primaryText, correctedPart), 'utf8')
writeFileSync(commentaryPath, patch(readFileSync(commentaryPath, 'utf8'), correctedPart), 'utf8')
console.error('repaired part fields in:\n  ' + primaryPath + '\n  ' + commentaryPath)
```

- [ ] **Step 2: Verify it runs cleanly against a syntax check**

Run: `node --check tools/boc-repair-parts.mjs`
Expected: no output, exit code 0

- [ ] **Step 3: Commit**

```bash
git add tools/boc-repair-parts.mjs
git commit -m "feat(confessions): add one-time repair script for converter part-field bugs"
```

---

### Task 3: Run the repair against the gitignored converter output and the live vault, with backups

**Files:**
- Modify (not tracked by git): `tools/sources/boc-primary.md`, `tools/sources/boc-commentary.md`
- Modify (outside the repo): `%APPDATA%\Loci\vault\confessions\Concordia Reader's Edition.md`, `%APPDATA%\Loci\vault\confessions-commentary\Concordia Reader's Edition Notes.md`

**Interfaces:**
- Consumes: `tools/boc-repair-parts.mjs` from Task 2.

- [ ] **Step 1: Back up the four target files**

```bash
cp "tools/sources/boc-primary.md" "tools/sources/boc-primary.md.bak"
cp "tools/sources/boc-commentary.md" "tools/sources/boc-commentary.md.bak"
cp "$APPDATA/Loci/vault/confessions/Concordia Reader's Edition.md" "$APPDATA/Loci/vault/confessions/Concordia Reader's Edition.md.bak"
cp "$APPDATA/Loci/vault/confessions-commentary/Concordia Reader's Edition Notes.md" "$APPDATA/Loci/vault/confessions-commentary/Concordia Reader's Edition Notes.md.bak"
```

Note: the `$APPDATA` copies require the shell tool's sandbox override (`dangerouslyDisableSandbox: true`) to reach the real, non-virtualized AppData — the default sandboxed shell sees a different, isolated copy of that path.

- [ ] **Step 2: Run the repair script against the gitignored `tools/sources/` copies**

```bash
node tools/boc-repair-parts.mjs "tools/sources/boc-primary.md" "tools/sources/boc-commentary.md"
```

Expected output: `repaired part fields in:` followed by both paths.

- [ ] **Step 3: Verify the known-broken cases are now fixed**

```bash
node -e "
const fs = require('fs');
const text = fs.readFileSync('tools/sources/boc-primary.md', 'utf8');
const lines = text.split('\n');
let doc = null;
for (const line of lines) {
  const docM = /^# (.+)\$/.exec(line);
  if (docM) { doc = docM[1]; continue; }
  const secM = /^## (\d+) \|/.exec(line);
  if (secM && (doc === 'Formula of Concord: Epitome' || doc === 'Augsburg Confession' || doc === 'Smalcald Articles' || doc === 'Small Catechism')) console.log(doc + ' | ' + line);
}
" | grep -E "VII\.|VIII\.|X\. Church|XI\.|XII\.|Abuses|Third Part|I\. The Ten"
```

Expected: `VII. The Holy Supper Of Christ`, `VIII. The Person Of Christ`, `X. Church Practices`, `XI...`, `[XII.]...` each now show their OWN label as part=empty (divider), and the AC's "A Review of the Various Abuses..." / Smalcald's "The Third Part" / Small Catechism's "I. The Ten Commandments" lines also show as their own dividers (empty trailing part field) rather than inheriting a stale previous part.

- [ ] **Step 4: Run the repair script against the live vault copies (requires `dangerouslyDisableSandbox: true`)**

```bash
node tools/boc-repair-parts.mjs "$APPDATA/Loci/vault/confessions/Concordia Reader's Edition.md" "$APPDATA/Loci/vault/confessions-commentary/Concordia Reader's Edition Notes.md"
```

Expected output: `repaired part fields in:` followed by both vault paths.

- [ ] **Step 5: Confirm the vault file's mtime updated (so `syncBocFolder()` will pick it up on next app launch)**

```bash
node -e "console.log(require('fs').statSync(process.argv[1]).mtime)" "$APPDATA/Loci/vault/confessions/Concordia Reader's Edition.md"
```

Expected: a timestamp from just now.

No commit for this task — the touched files are gitignored / outside the repo.

---

### Task 4: Share `groupByPart` between BocPane and PanePicker

**Files:**
- Modify: `src/renderer/src/lib/bocGrouping.ts`
- Modify: `src/renderer/src/components/library/BocPane.tsx:1-30`
- Modify: `src/renderer/src/components/library/PanePicker.tsx:26`, `:648-687`

**Interfaces:**
- Produces: `groupByPart(rows: BocSectionRow[]): PartGroup[]` and `export interface PartGroup { part: string | null; rows: BocSectionRow[] }`, exported from `src/renderer/src/lib/bocGrouping.ts`.
- Consumes (PanePicker.tsx only): existing `docSections: BocSectionRow[]` state, `d.abbreviation`, `placeBoc(code, ordinal)`, `onContextMenu`, `bocSourceId` — all already in scope in that file.

- [ ] **Step 1: Add `groupByPart` to `src/renderer/src/lib/bocGrouping.ts`**

Modify the top import line:

```ts
import type { BocCommentaryMatch, BocSectionRow } from '../../../shared/ipc'
```

Add at the end of the file:

```ts

export interface PartGroup {
  part: string | null
  rows: BocSectionRow[]
}

/** Group an ordinal-ordered section list into contiguous runs sharing the same `part` — parts
 *  appear as unbroken runs in reading order, so this reproduces the document's own part
 *  headings without needing a separate lookup. Shared by BocPane's nav rail and PanePicker's
 *  Confessions browser so both surfaces group sections the same way. */
export function groupByPart(rows: BocSectionRow[]): PartGroup[] {
  const groups: PartGroup[] = []
  for (const r of rows) {
    const last = groups[groups.length - 1]
    if (last && last.part === r.part) last.rows.push(r)
    else groups.push({ part: r.part, rows: [r] })
  }
  return groups
}
```

- [ ] **Step 2: Remove the local copy from `BocPane.tsx` and import the shared one**

Modify `src/renderer/src/components/library/BocPane.tsx`. Replace (original lines 10-28):

```tsx
import { bocSectionLabel } from '../../lib/bocGrouping'

interface PartGroup {
  part: string | null
  rows: BocSectionRow[]
}

/** Group an ordinal-ordered section list into contiguous runs sharing the same `part` — parts
 *  appear as unbroken runs in reading order, so this reproduces the document's own part
 *  headings without needing a separate lookup. */
function groupByPart(rows: BocSectionRow[]): PartGroup[] {
  const groups: PartGroup[] = []
  for (const r of rows) {
    const last = groups[groups.length - 1]
    if (last && last.part === r.part) last.rows.push(r)
    else groups.push({ part: r.part, rows: [r] })
  }
  return groups
}
```

with:

```tsx
import { bocSectionLabel, groupByPart } from '../../lib/bocGrouping'
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck:web`
Expected: no errors (BocPane.tsx's own `groupByPart(sections).map(...)` call site is unchanged, just resolved from the new import).

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/lib/bocGrouping.ts src/renderer/src/components/library/BocPane.tsx
git commit -m "refactor(confessions): share groupByPart between BocPane and PanePicker"
```

---

### Task 5: Group PanePicker's Confessions browser by part

**Files:**
- Modify: `src/renderer/src/components/library/PanePicker.tsx:26`, `:663-681`

**Interfaces:**
- Consumes: `groupByPart` from Task 4 (`../../lib/bocGrouping`).

- [ ] **Step 1: Import `groupByPart`**

Modify `src/renderer/src/components/library/PanePicker.tsx` line 26:

```tsx
import { bocSectionLabel, groupByPart } from '../../lib/bocGrouping'
```

- [ ] **Step 2: Render grouped sections instead of a flat list**

Replace (original lines 663-681):

```tsx
                      {open &&
                        docSections.map((r) => (
                          <button
                            key={r.ordinal}
                            className="pp-item pp-boc-section"
                            title={`Open ${d.abbreviation} ${bocSectionLabel(r)}`}
                            onClick={() => placeBoc(d.code, r.ordinal)}
                            onContextMenu={(e) =>
                              onContextMenu(e, {
                                kind: 'boc',
                                documentCode: d.code,
                                sectionOrdinal: r.ordinal,
                                bocSourceId
                              })
                            }
                          >
                            <span className="pp-item-title">{bocSectionLabel(r)}</span>
                          </button>
                        ))}
```

with:

```tsx
                      {open &&
                        groupByPart(docSections).map((g, gi) => (
                          <div key={gi}>
                            {g.part && (
                              <div className="sv-testament-head" style={{ padding: '6px 8px 2px' }}>
                                {g.part}
                              </div>
                            )}
                            {g.rows.map((r) => (
                              <button
                                key={r.ordinal}
                                className="pp-item pp-boc-section"
                                title={`Open ${d.abbreviation} ${bocSectionLabel(r)}`}
                                onClick={() => placeBoc(d.code, r.ordinal)}
                                onContextMenu={(e) =>
                                  onContextMenu(e, {
                                    kind: 'boc',
                                    documentCode: d.code,
                                    sectionOrdinal: r.ordinal,
                                    bocSourceId
                                  })
                                }
                              >
                                <span className="pp-item-title">{bocSectionLabel(r)}</span>
                              </button>
                            ))}
                          </div>
                        ))}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck:web`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/library/PanePicker.tsx
git commit -m "fix(confessions): group PanePicker's Confessions browser by part like BocPane"
```

---

### Task 6: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all tests pass, including the 5 new `boc-parts.test.mjs` cases and the existing `bocMarkdown.test.ts` suite (untouched, should be unaffected).

- [ ] **Step 2: Run the full typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Hand off a manual-verification checklist to the user**

The user should relaunch (or reload) Loci and check:
- Confessions sidebar → Formula of Concord: Epitome → Articles VII, VIII, X, XI, XII each now show as their own group headers (not merged into VI or IX).
- Confessions sidebar → Augsburg Confession → Articles XXII–XXVIII now appear under a distinct "A Review of the Various Abuses That Have Been Corrected" header, separate from "Chief Articles of Faith".
- Confessions sidebar → Smalcald Articles → the back half (Sin, Law, Repentance, … Human Traditions) now groups under "The Third Part", not the Second Part's subtitle.
- Confessions sidebar → Small Catechism → Ten Commandments / Creed / Lord's Prayer / Baptism / Confession / Sacrament of the Altar each show as their own top-level group.
- The "Add source" / new-tab Confessions browser (PanePicker) now shows the same part headers as the sidebar, instead of a flat list.

No commit for this task.

---

## Known remaining gap (out of scope for this plan)

Large Catechism's Part 2 (the Apostles' Creed) still doesn't sub-divide into "Article I / II / III" the way the reference site does — the whole Creed exposition (48 paragraphs) remains one section under the "Part 2" divider (which this plan does fix into its own group; previously it wasn't even recognized as a divider at all). Splitting it further would require detecting the three Creed-article boundaries by matching the literal Apostles' Creed wording embedded in the body text ("I believe in God the Father Almighty…", "And in Jesus Christ, His only Son…", "I believe in the Holy Spirit…") and would also need a small ordinal-renumbering pass across the rest of the document — meaningfully riskier than every fix in this plan (which are all part-field-only, zero ordinal shifts). Flagged here rather than attempted; the content remains fully readable in one click either way.
