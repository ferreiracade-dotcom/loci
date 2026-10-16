// Berean Literal Bible (full-Bible text) -> resources/scripture/BLB.json for Loci's bundled Scripture.
//
// Input lines are "Genesis 1:1<TAB>text" after three header lines and a "Verse<TAB>..." column row.
// Output: { "<CODE>": { "<chapter>": [[verse, "text"], ...] } } keyed by the app's book codes,
// same shape as BSB.json. The text keeps the BLB's supplied-word brackets ("darkness [was] over")
// exactly as written. Fails loudly on a book name that is not one of the app's 66.
//
//   node tools/blb-to-json.mjs [blb.txt] [out.json]
//
// As Loci ships it (public domain per the file's own header; Berean Bible Translation Committee,
// literalbible.com; the file is a draft -> tools/sources/bsb/blb.txt, not committed):
//
//   node tools/blb-to-json.mjs tools/sources/bsb/blb.txt resources/scripture/BLB.json

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { SOURCES, OUT, loadBooks, makeBookResolver, parseBlb } from './bsb-lib.mjs'
import { stringifyBible } from './bsb-usfm-to-json.mjs'

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [src = join(SOURCES, 'blb.txt'), out = join(OUT, 'BLB.json')] = process.argv.slice(2)
  const books = loadBooks()
  const bible = parseBlb(readFileSync(src, 'utf8'), makeBookResolver(books))
  for (const b of books) {
    if (!bible[b.code]) throw new Error(`missing book ${b.code}`)
    const have = Object.keys(bible[b.code]).length
    if (have !== b.chapters) throw new Error(`${b.code}: ${have} chapters, expected ${b.chapters}`)
  }
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, stringifyBible(bible, books.map((b) => b.code)))
  let chapters = 0
  let verses = 0
  for (const c of Object.values(bible)) {
    chapters += Object.keys(c).length
    for (const vs of Object.values(c)) verses += vs.length
  }
  console.log(`${out}: ${books.length} books, ${chapters} chapters, ${verses} verses`)
}
