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

// Classify one line exactly as the app's canonical reader does (src/main/services/bocMarkdown.ts,
// parseBocMarkdown): a level-1 heading is a document title; a level-2 heading whose content splits
// into >=3 pipe fields with an integer ordinal >=1 and a non-empty label is a section header.
// Matching that tolerant split-and-trim contract (rather than a rigid positional regex that
// demands exact inter-pipe spacing) keeps this repair tool from silently skipping a header whose
// whitespace an editor had normalized — a skipped divider would otherwise cascade into overwriting
// a neighboring section's part. Returns null for anything that isn't a document/section heading.
const HEADING_RE = /^(#{1,6})\s+(?=\S)(.*)$/

function classifyLine(line) {
  const h = HEADING_RE.exec(line)
  if (!h) return null
  const level = h[1].length
  const content = h[2].trim()
  if (level === 1) return { kind: 'doc', title: content }
  if (level === 2) {
    const parts = content.split('|').map((s) => s.trim())
    const ordinal = Number(parts[0])
    if (parts.length >= 3 && Number.isInteger(ordinal) && ordinal >= 1 && parts[2]) {
      return { kind: 'header', ordinal, number: parts[1] || null, label: parts[2], part: parts[3] || null }
    }
  }
  return null
}

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
    const c = classifyLine(line)
    if (c?.kind === 'doc') {
      flush()
      code = CODE_FOR_TITLE[c.title] ?? c.title
      current = null
      continue
    }
    if (c?.kind === 'header' && code) {
      flush()
      current = { ordinal: c.ordinal, number: c.number, label: c.label, part: null }
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
      const c = classifyLine(line)
      if (c?.kind === 'doc') {
        code = CODE_FOR_TITLE[c.title] ?? c.title
        return line
      }
      if (c?.kind === 'header' && code) {
        const key = `${code}:${c.ordinal}`
        const part = correctedPart.has(key) ? correctedPart.get(key) : c.part
        return `## ${c.ordinal} | ${c.number ?? ''} | ${c.label} | ${part ?? ''}`
      }
      return line
    })
    .join('\n')
}

// Read BOTH inputs before writing EITHER, so a wrong/missing commentary path fails loudly up front
// instead of after the primary file has already been overwritten (a half-applied repair).
const primaryText = readFileSync(primaryPath, 'utf8')
const commentaryText = readFileSync(commentaryPath, 'utf8')

const docsOut = parseSections(primaryText)
assignParts(docsOut)

const correctedPart = new Map() // `${code}:${ordinal}` -> corrected part
for (const [code, sections] of docsOut) {
  for (const s of sections) correctedPart.set(`${code}:${s.ordinal}`, s.part)
}

writeFileSync(primaryPath, patch(primaryText, correctedPart), 'utf8')
writeFileSync(commentaryPath, patch(commentaryText, correctedPart), 'utf8')
console.error('repaired part fields in:\n  ' + primaryPath + '\n  ' + commentaryPath)
