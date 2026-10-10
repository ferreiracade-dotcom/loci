// Validate CCEL ThML volumes against Loci's parser (src/main/services/thml.ts) and curated author
// table (src/main/data/fathersAuthors.ts). Run it over a folder of real volumes to see, per
// volume, how many sections / footnotes / Scripture refs / page breaks parsed, which references
// failed, and which authors the files mention that the curated table has no dates for.
//
//   node tools/validate-thml.mjs <folder> [--authors-json <out.json>] [--strict]
//
//   <folder>             a directory of anf01.xml … npnf214.xml (e.g. .firecrawl/ccel)
//   --authors-json FILE  also write { authorId: { volumes, sections, div1Titles } } for every
//                        author found — the input for completing the curated author table
//   --strict             also exit 1 when an author the files name is missing from the curated table,
//                        or a div1 with readable text has no author (and no deliberate null override)
//
// Exit code: 1 when any volume fails to parse (or parses to zero sections); with --strict, also
// when authorship is incomplete. Pseudo-authors (FATHERS_NON_AUTHOR_IDS) are never reported.
//
// The parser is TypeScript, so this tool bundles it on the fly with esbuild (already present as a
// Vite dependency) into a temp file and imports that. Nothing is written into the repo.
import { build } from 'esbuild'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const args = process.argv.slice(2)
const strict = args.includes('--strict')
const jsonIdx = args.indexOf('--authors-json')
const authorsJson = jsonIdx >= 0 ? args[jsonIdx + 1] : null
const dir = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--authors-json')
if (!dir) {
  console.error('usage: node tools/validate-thml.mjs <folder> [--authors-json <out.json>] [--strict]')
  process.exit(2)
}

async function loadModules() {
  const out = mkdtempSync(join(tmpdir(), 'loci-validate-thml-'))
  const outfile = join(out, 'bundle.mjs')
  await build({
    stdin: {
      contents:
        "export * from './src/main/services/thml'\n" +
        "export * from './src/main/data/fathersAuthors'\n" +
        "export * from './src/shared/fathers'\n",
      resolveDir: repo,
      loader: 'ts'
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile,
    logLevel: 'error',
    // The authors module only type-imports better-sqlite3; keep any runtime require external.
    external: ['better-sqlite3']
  })
  const mod = await import(pathToFileURL(outfile).href)
  rmSync(out, { recursive: true, force: true })
  return mod
}

const {
  parseThml, slugifyAuthor, FATHERS_AUTHORS, FATHERS_AUTHOR_OVERRIDES, FATHERS_NON_AUTHOR_IDS,
  correctedAuthor, parseFathersCode
} = await loadModules()
const known = new Set(FATHERS_AUTHORS.map((a) => a.id))

const files = readdirSync(dir)
  .filter((f) => /\.xml$/i.test(f) && parseFathersCode(f.replace(/\.xml$/i, '')))
  .sort()
if (files.length === 0) {
  console.error(`no anf*/npnf* .xml volumes found in ${dir}`)
  process.exit(2)
}

const pad = (s, n) => String(s).padEnd(n)
const num = (n, w) => String(n).padStart(w)
console.log(
  `${pad('volume', 9)}${num('secs', 6)}${num('editor', 7)}${num('notes', 7)}${num('refs', 7)}${num('inNote', 7)}${num('pages', 7)}${num('noPg', 6)}${num('badRef', 7)}${num('apocr', 7)}${num('ms', 7)}`
)

const failures = []
const authorsSeen = new Map() // id -> { volumes:Set, sections:number, div1Titles:Set }
const suspects = []
const unattributed = []
const unknownTags = new Map()
const badOsisSamples = new Map()
let totals = { sections: 0, notes: 0, refs: 0, pages: 0, bad: 0, apocrypha: 0 }

for (const f of files) {
  const code = f.replace(/\.xml$/i, '').toLowerCase()
  const t0 = Date.now()
  let result
  try {
    result = parseThml(readFileSync(join(dir, f), 'utf8'), code)
  } catch (e) {
    failures.push([code, e.message])
    console.log(`${pad(code, 9)}  PARSE ERROR: ${e.message}`)
    continue
  }
  const { volume, warnings } = result
  const s = volume.sections
  const sum = (fn) => s.reduce((n, x) => n + fn(x), 0)
  const refs = sum((x) => x.refs.length)
  const inNote = sum((x) => x.refs.filter((r) => r.inNote).length)
  const bad = warnings.filter((w) => w.kind === 'bad-osis').reduce((n, w) => n + w.count, 0)
  const apocrypha = warnings.filter((w) => w.kind === 'non-canon-ref').reduce((n, w) => n + w.count, 0)
  console.log(
    `${pad(code, 9)}${num(s.length, 6)}${num(s.filter((x) => x.editorial).length, 7)}${num(sum((x) => x.notes.length), 7)}${num(refs, 7)}${num(inNote, 7)}${num(sum((x) => x.pages.length), 7)}${num(s.filter((x) => !x.startPage).length, 6)}${num(bad, 7)}${num(apocrypha, 7)}${num(Date.now() - t0, 7)}`
  )
  totals.sections += s.length
  totals.notes += sum((x) => x.notes.length)
  totals.refs += refs
  totals.pages += sum((x) => x.pages.length)
  totals.bad += bad
  totals.apocrypha += apocrypha
  if (s.length === 0) failures.push([code, 'parsed but produced 0 sections'])

  for (const w of warnings) {
    if (w.kind === 'unknown-tag') unknownTags.set(w.detail, (unknownTags.get(w.detail) ?? 0) + w.count)
    if (w.kind === 'bad-osis' && w.detail !== '(missing)') {
      const list = badOsisSamples.get(code) ?? []
      if (list.length < 5) list.push(w.detail)
      badOsisSamples.set(code, list)
    }
  }

  // Authors seen (as stored: after overrides), and div1s whose head disagrees with their title.
  const div1 = new Map() // div1 id -> { title, authors:Set, parsed:Set, editorial, sections }
  for (const sec of s) {
    const id = correctedAuthor(code, sec.id, sec.authorId)
    if (id) {
      const a = authorsSeen.get(id) ?? { volumes: new Set(), sections: 0, div1Titles: new Set() }
      a.volumes.add(code)
      a.sections++
      a.div1Titles.add(sec.titles[0])
      authorsSeen.set(id, a)
    }
    const key = sec.id.replace(/~\d+$/, '').split('.')[0]
    const d = div1.get(key) ?? { title: sec.titles[0], authors: new Set(), parsed: new Set(), sections: 0, allEditorial: true }
    d.authors.add(id)
    d.parsed.add(sec.authorId)
    d.sections++
    if (!sec.editorial) d.allEditorial = false
    div1.set(key, d)
  }
  for (const [key, d] of div1) {
    if (`${code}:${key}` in FATHERS_AUTHOR_OVERRIDES) continue // already settled by hand
    const real = [...d.authors].filter(Boolean)
    // A div1 whose readable sections no author is attached to (multi-author NPNF volumes).
    if (!d.allEditorial && real.length === 0) unattributed.push(`${code}:${key}  "${d.title}" (${d.sections} sections)`)
    if (!code.startsWith('anf')) continue
    const slug = slugifyAuthor(d.title)
    if (real.length > 1) suspects.push(`${code}:${key} "${d.title}" has several authors: ${real.join(', ')}`)
    else if (real.length === 1 && real[0] !== slug && known.has(slug)) {
      suspects.push(`${code}:${key} "${d.title}": head says "${real[0]}" but the title suggests "${slug}" — add '${code}:${key}': '${slug}' to FATHERS_AUTHOR_OVERRIDES`)
    }
  }
}

console.log(
  `${pad('TOTAL', 9)}${num(totals.sections, 6)}${num('', 7)}${num(totals.notes, 7)}${num(totals.refs, 7)}${num('', 7)}${num(totals.pages, 7)}${num('', 6)}${num(totals.bad, 7)}${num(totals.apocrypha, 7)}`
)
console.log('\ncolumns: editor = editorial sections; inNote = refs inside footnotes; noPg = sections with no start page;')
console.log('         badRef = unparseable osisRef; apocr = deuterocanonical refs (left as plain text, not an error)')

const undated = [...authorsSeen.keys()].filter((id) => !known.has(id)).sort()
console.log(`\nAuthors found: ${authorsSeen.size}; in the curated table: ${authorsSeen.size - undated.length}`)
console.log(undated.length ? `Undated (add to src/main/data/fathersAuthors.ts): ${undated.join(', ')}` : 'Undated authors: none')
if (suspects.length) {
  console.log(`\nMixed or suspect author attributions (review; several authors in one div1 is often legitimate):\n  ${suspects.join('\n  ')}`)
}
if (unattributed.length) {
  console.log(`\nDiv1s with readable text and NO author (add an entry to FATHERS_AUTHOR_OVERRIDES, or null if it truly has none):\n  ${unattributed.join('\n  ')}`)
}
if (unknownTags.size) console.log(`\nUnknown tags (text kept, tag dropped): ${[...unknownTags].map(([t, n]) => `${t}×${n}`).join(', ')}`)
if (badOsisSamples.size) {
  console.log('\nSample unparseable osisRef values:')
  for (const [code, list] of badOsisSamples) console.log(`  ${code}: ${list.join(' | ')}`)
}
if (failures.length) {
  console.log('\nFAILED:')
  for (const [code, msg] of failures) console.log(`  ${code}: ${msg}`)
}

if (authorsJson) {
  const out = {}
  for (const [id, a] of [...authorsSeen].sort(([x], [y]) => x.localeCompare(y))) {
    out[id] = { volumes: [...a.volumes].sort(), sections: a.sections, div1Titles: [...a.div1Titles].sort() }
  }
  writeFileSync(authorsJson, JSON.stringify(out, null, 2))
  console.log(`\nWrote ${authorsSeen.size} authors to ${authorsJson}`)
}

process.exit(failures.length > 0 || (strict && (undated.length > 0 || unattributed.length > 0)) ? 1 : 0)
