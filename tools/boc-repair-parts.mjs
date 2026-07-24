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
