// Berean Standard Bible (USFM) -> resources/scripture/BSB.json for Loci's bundled Scripture.
//
// Output: { "<CODE>": { "<chapter>": [[verse, "text"], ...] } }, keyed by the app's own book codes
// (src/shared/scriptureRef.ts), books in canonical order. Verses are [number, text] pairs, never
// assumed contiguous (the BSB omits e.g. Matthew 17:21). Plain verse text only: section headings,
// cross-reference lines, footnote bodies and USFM markup are stripped. Fails loudly on a book
// that is not one of the app's 66.
//
//   node tools/bsb-usfm-to-json.mjs [bsb_usfm.zip] [out.json]
//
// As Loci ships it (the BSB is public domain, dedicated 2023 by the Berean Bible Translation
// Committee; USFM from https://bereanbible.com/ -> tools/sources/bsb/bsb_usfm.zip, not committed):
//
//   node tools/bsb-usfm-to-json.mjs tools/sources/bsb/bsb_usfm.zip resources/scripture/BSB.json

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { SOURCES, OUT, loadBooks, makeBookResolver, readZip, parseUsfmBook } from './bsb-lib.mjs'

/** Serialize { code: { chapter: [[v, t]] } } one book per line (diff-friendly, still compact). */
export function stringifyBible(bible, order) {
  return '{\n' + order.filter((c) => bible[c]).map((c) => `${JSON.stringify(c)}:${JSON.stringify(bible[c])}`).join(',\n') + '\n}\n'
}

export function convertUsfmZip(zipBuf, books = loadBooks()) {
  const resolver = makeBookResolver(books)
  const zip = readZip(zipBuf)
  const bible = {}
  for (const [name, read] of zip) {
    if (!name.endsWith('.usfm')) continue
    const { code, chapters } = parseUsfmBook(read().toString('utf8'))
    resolver.byCode(code)
    if (bible[code]) throw new Error(`duplicate book ${code}`)
    bible[code] = chapters
  }
  for (const b of books) {
    if (!bible[b.code]) throw new Error(`missing book ${b.code}`)
    const have = Object.keys(bible[b.code]).length
    if (have !== b.chapters) throw new Error(`${b.code}: ${have} chapters, expected ${b.chapters}`)
  }
  return { bible, order: books.map((b) => b.code) }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [src = join(SOURCES, 'bsb_usfm.zip'), out = join(OUT, 'BSB.json')] = process.argv.slice(2)
  const { bible, order } = convertUsfmZip(readFileSync(src))
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, stringifyBible(bible, order))
  let chapters = 0
  let verses = 0
  for (const c of Object.values(bible)) {
    chapters += Object.keys(c).length
    for (const vs of Object.values(c)) verses += vs.length
  }
  console.log(`${out}: ${order.length} books, ${chapters} chapters, ${verses} verses`)
}
