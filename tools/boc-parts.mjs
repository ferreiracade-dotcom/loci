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
