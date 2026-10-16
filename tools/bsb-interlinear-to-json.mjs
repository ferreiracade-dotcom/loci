// BSB word-level interlinear table -> resources/scripture/interlinear/<CODE>.json (one file per book).
//
// Each file: { "<chapter>": { "<verse>": [ { o, t, s, p, e }, ... ] } } where o is the original word
// (pointed Hebrew / Aramaic, accented Greek), t its transliteration, s the Strong's number
// ("H7225" / "G976"; "" when the source gives none), p the short parsing code ("N-fs",
// "V-Qal-Perf-3ms"), e the BSB English for that word. Words are in original-language reading order
// (Heb Sort / Greek Sort; see parseInterlinear in bsb-lib.mjs). Padding rows are dropped. Per-book
// files so the reader loads one book at a time.
//
//   node tools/bsb-interlinear-to-json.mjs [bsb_tables.tsv] [out-dir]
//
// As Loci ships it (BSB tables are public domain, Berean Bible Translation Committee;
// https://bereanbible.com/ -> tools/sources/bsb/bsb_tables.tsv, not committed):
//
//   node tools/bsb-interlinear-to-json.mjs tools/sources/bsb/bsb_tables.tsv resources/scripture/interlinear

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { SOURCES, OUT, loadBooks, makeBookResolver, parseInterlinear } from './bsb-lib.mjs'

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [src = join(SOURCES, 'bsb_tables.tsv'), outDir = join(OUT, 'interlinear')] = process.argv.slice(2)
  const books = loadBooks()
  const data = parseInterlinear(readFileSync(src, 'utf8'), makeBookResolver(books))
  mkdirSync(outDir, { recursive: true })
  let chapters = 0
  let verses = 0
  let words = 0
  for (const b of books) {
    const book = data[b.code]
    if (!book) throw new Error(`missing book ${b.code}`)
    writeFileSync(join(outDir, `${b.code}.json`), JSON.stringify(book) + '\n')
    for (const ch of Object.values(book)) {
      chapters++
      for (const vs of Object.values(ch)) {
        verses++
        words += vs.length
      }
    }
  }
  console.log(`${outDir}: ${books.length} books, ${chapters} chapters, ${verses} verses, ${words} words`)
}
