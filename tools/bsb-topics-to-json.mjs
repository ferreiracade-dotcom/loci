// BSB topical index (xlsx) -> resources/scripture/topics.json for Loci's bundled Scripture.
//
// Output: { "<Topic name>": ["Exodus 17:12", "Revelation 13:16–18", ...] } in the spreadsheet's
// order; references stay the source's strings. The index merges Torrey's, Nave's, OpenBible.info
// and BibleHub topics; a topic listed under several sources is merged and de-duplicated. The
// per-verse context text in the sheet is dropped. Reads the xlsx directly (zip + XML, no
// dependency).
//
//   node tools/bsb-topics-to-json.mjs [bsb_topical_index.xlsx] [out.json]
//
// As Loci ships it (license unconfirmed: merges Torrey's/Nave's/OpenBible.info/BibleHub topics; see NOTICE.md; from bereanbible.com ->
// tools/sources/bsb/bsb_topical_index.xlsx, not committed):
//
//   node tools/bsb-topics-to-json.mjs tools/sources/bsb/bsb_topical_index.xlsx resources/scripture/topics.json

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { SOURCES, OUT, readZip, parseSharedStrings, parseTopics } from './bsb-lib.mjs'

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [src = join(SOURCES, 'bsb_topical_index.xlsx'), out = join(OUT, 'topics.json')] = process.argv.slice(2)
  const zip = readZip(readFileSync(src))
  const strings = parseSharedStrings(zip.get('xl/sharedStrings.xml')().toString('utf8'))
  const topics = parseTopics(zip.get('xl/worksheets/sheet1.xml')().toString('utf8'), strings)
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, '{\n' + Object.entries(topics).map(([k, v]) => `${JSON.stringify(k)}:${JSON.stringify(v)}`).join(',\n') + '\n}\n')
  const refs = Object.values(topics).reduce((n, v) => n + v.length, 0)
  console.log(`${out}: ${Object.keys(topics).length} topics, ${refs} references`)
}
