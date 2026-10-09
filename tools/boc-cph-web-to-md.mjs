// Rebuild the Book of Concord Markdown from CPH's online edition
// (https://bookofconcord.cph.org — the same "Concordia: The Lutheran Confessions" translation
// the Reader's Edition EPUB carries, but as clean per-section HTML with `[N]` paragraph
// markers and none of the EPUB conversion's spacing/part glitches).
//
// The WEBSITE is the structural authority: one section per site page, in nav order, with the
// nav group (e.g. "Chief Articles of Faith", "Part 1: The Ten Commandments") as the part.
// Everything still taken from the EPUB is reshaped onto that skeleton:
//   - commentary (study notes + editor's introductions; the site has none) is re-keyed from
//     the EPUB's finer-grained ordinals to the site section whose text contains it — several
//     EPUB sections (e.g. each Small Catechism commandment) fold into one site page;
//   - the Saxon Visitation Articles (absent from the site) are rebuilt site-style, the way the
//     FC Epitome is laid out: one section per article with its "false doctrine" antithesis
//     folded in, instead of the EPUB's separate antithesis sections.
// Output uses the heading contract parseBocMarkdown expects (`# <Document>`, then
// `## ordinal | number | label | part`), with the SAME ordinals in both files.
//
// Usage:
//   node tools/boc-cph-web-to-md.mjs <epub-primary.md> <epub-commentary.md> [outDir]
//
//   <epub-primary.md>     Existing EPUB-derived primary file (boc-epub-to-md.mjs output, or
//                         the vault's "confessions/Concordia Reader's Edition.md").
//   <epub-commentary.md>  Its commentary twin (keyed to the SAME ordinals).
//   [outDir]              Defaults to tools/sources/. Writes boc-primary-cph.md,
//                         boc-commentary-cph.md and boc-cph-ordinal-map.json there.
//
// Fetched pages are cached in tools/sources/cph-web-cache/ (one request per page, ~1/s), so
// re-runs are offline. The site's text and this tool's output are COPYRIGHTED (Concordia
// Publishing House). tools/sources/ is gitignored — personal use only, never commit output.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const BASE = 'https://bookofconcord.cph.org'
const HERE = dirname(fileURLToPath(import.meta.url))
const CACHE = join(HERE, 'sources', 'cph-web-cache')
// The site answers non-browser user agents with a 302 to an S3 error page.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36'

// --- Fetch + cache ------------------------------------------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export async function fetchPage(path) {
  const file = join(CACHE, path.replace(/^\/+/, '').replace(/\//g, '__') + '.html')
  if (existsSync(file)) return readFileSync(file, 'utf8')
  mkdirSync(CACHE, { recursive: true })
  const res = await fetch(BASE + path, { headers: { 'User-Agent': UA }, redirect: 'follow' })
  if (!res.ok) throw new Error(`${res.status} ${path}`)
  const html = await res.text()
  if (!html.includes('data-copy-target="article"')) throw new Error(`not an article page: ${path}`)
  writeFileSync(file, html)
  await sleep(1000)
  return html
}

// --- Site structure -----------------------------------------------------------------------------
// First path segment (two for the creeds, which the site groups under one slug) → document.
const SLUG_TO_CODE = {
  'preface': 'PREF',
  'ecumenical-creeds/apostles-creed': 'CR-AP',
  'ecumenical-creeds/nicene-creed': 'CR-NI',
  'ecumenical-creeds/athanasian-creed': 'CR-ATH',
  'augsburg-confession': 'AC',
  'apology-augsburg-confession': 'AP',
  'smalcald-articles': 'SA',
  'power-and-primacy-of-the-pope': 'TR',
  'small-catechism': 'SC',
  'large-catechism': 'LC',
  'formula-of-concord-epitome': 'FC-EP',
  'formula-of-concord-solid-declaration': 'FC-SD',
  'catalog-of-testimonies': 'CT',
  'exhortation-to-confession': 'BEC'
}
// Canonical `# <Document>` headings (must resolve via documentCodeFromName — see
// src/shared/bookOfConcord.ts), in BOC_DOCUMENTS order.
export const DOC_TITLES = {
  'PREF': 'Preface to the Book of Concord',
  'CR-AP': "Apostles' Creed",
  'CR-NI': 'Nicene Creed',
  'CR-ATH': 'Athanasian Creed',
  'AC': 'Augsburg Confession',
  'AP': 'Apology of the Augsburg Confession',
  'SA': 'Smalcald Articles',
  'TR': 'Treatise on the Power and Primacy of the Pope',
  'SC': 'Small Catechism',
  'LC': 'Large Catechism',
  'FC-EP': 'Formula of Concord: Epitome',
  'FC-SD': 'Formula of Concord: Solid Declaration',
  'CT': 'Catalog of Testimonies',
  'BEC': 'A Brief Exhortation to Confession',
  'SVA': 'Saxon Visitation Articles'
}

export function codeForPath(path) {
  const segs = path.replace(/^\/en\//, '').split('/')
  return SLUG_TO_CODE[segs.slice(0, 2).join('/')] ?? SLUG_TO_CODE[segs[0]] ?? null
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
export function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1)))
    return ENTITIES[e.toLowerCase()] ?? m
  })
}

/** Inline HTML → one line of plain text (the reader renders plain text, not Markdown). */
export function inlineText(html) {
  return decodeEntities(html.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ''))
    .replace(/\s+/g, ' ').trim()
}

/**
 * The site nav as an ordered page list. Each entry: { path, code, part } where `part` is the
 * label of the nav group the page sits in (null at a document's top level). The nav is a
 * nested <ul>/<li>; a group is either a bare <span> or a page that also has children.
 */
export function parseNav(html) {
  const first = html.indexOf('<li class="document"')
  const start = html.lastIndexOf('<ul', first)
  const end = html.indexOf('</nav>', first)
  const root = { label: null, href: null, children: [], parent: null }
  let cur = root
  let capture = null // 'a' | 'span' while collecting a label
  let buf = ''
  for (const m of html.slice(start, end).matchAll(/<(\/?)(li|a|span)\b([^>]*)>|([^<]+)/g)) {
    const [, close, tag, attrs, text] = m
    if (text !== undefined) { if (capture) buf += text; continue }
    if (tag === 'li') {
      if (!close) { const n = { label: null, href: null, children: [], parent: cur }; cur.children.push(n); cur = n }
      else cur = cur.parent
    } else if (!close) {
      if (cur.label === null && !capture && !/chevron/.test(attrs)) {
        capture = tag; buf = ''
        const href = /href="([^"]+)"/.exec(attrs)
        if (tag === 'a' && href) cur.href = href[1]
      }
    } else if (capture === tag) {
      const label = inlineText(buf)
      if (label) cur.label = label
      capture = null
    }
  }
  const out = []
  const walk = (node, depth) => {
    for (const c of node.children) {
      // depth 0 = document entries, depth 1 = a document's own pages (no part); deeper pages
      // take their enclosing group's label as the part.
      if (c.href) out.push({ path: c.href, code: codeForPath(c.href), part: depth >= 2 ? node.label : null })
      walk(c, depth + 1)
    }
  }
  walk(root, 0)
  return out.filter((e) => e.code)
}

/** One site page → { number, label, text }. */
export function parsePage(html) {
  const a = html.indexOf('data-copy-target="article"')
  let body = html.slice(html.indexOf('>', a) + 1, html.indexOf('</article>', a))
  body = body.replace(/<header>[\s\S]*?<\/header>/, '').replace(/<button\b[\s\S]*?<\/button>/g, '')
  let number = null
  let label = null
  const h1 = /<h1\b[^>]*>([\s\S]*?)<\/h1>/.exec(body)
  if (h1) {
    const num = /<span class="article-number">([\s\S]*?)<\/span>/.exec(h1[1])
    const name = /<span class="article-name">([\s\S]*?)<\/span>/.exec(h1[1])
    if (num && name) {
      number = inlineText(num[1]).replace(/^Articles?\s+/i, '') || null
      label = inlineText(name[1])
    } else {
      label = inlineText(h1[1])
    }
    body = body.slice(0, h1.index) + body.slice(h1.index + h1[0].length)
  }
  const paras = []
  for (const m of body.matchAll(/<(h[2-6]|p)\b[^>]*>([\s\S]*?)<\/\1>/g)) {
    const t = inlineText(m[2])
    if (t) paras.push(t)
  }
  return { number, label, text: paras.join('\n\n') }
}

// --- EPUB Markdown (same heading contract as src/main/services/bocMarkdown.ts) ----------------
export function parseContractMd(md) {
  const docs = new Map() // code → sections[]
  const codeByTitle = new Map(Object.entries(DOC_TITLES).map(([c, t]) => [t.toLowerCase(), c]))
  let code = null
  let cur = null
  for (const line of md.split(/\r?\n/)) {
    const h = /^(#{1,6})\s+(?=\S)(.*)$/.exec(line)
    if (h && h[1].length === 1) {
      cur = null
      code = codeByTitle.get(h[2].trim().toLowerCase()) ?? null
      if (code && !docs.has(code)) docs.set(code, [])
      continue
    }
    if (h) {
      const parts = h[2].split('|').map((x) => x.trim())
      const ordinal = Number(parts[0])
      cur = null
      if (code && parts.length >= 3 && Number.isInteger(ordinal) && ordinal >= 1 && parts[2]) {
        cur = { ordinal, number: parts[1] || null, label: parts[2], part: parts[3] || null, text: '' }
        docs.get(code).push(cur)
      }
      continue
    }
    if (cur) cur.text += (cur.text ? '\n' : '') + line
  }
  for (const secs of docs.values()) for (const s of secs) s.text = s.text.trim()
  return docs
}

// --- Alignment: EPUB section → site section by shared word 6-grams ----------------------------
const words = (t) => t.toLowerCase().replace(/\[\d+\]/g, ' ').replace(/[^a-z]+/g, ' ').trim().split(' ').filter(Boolean)
function shingles(t) {
  const w = words(t)
  const out = new Set()
  for (let i = 0; i + 6 <= w.length; i++) out.add(w.slice(i, i + 6).join(' '))
  return out
}

/**
 * Map every EPUB ordinal of one document to a site ordinal. A section whose text the site
 * mostly contains (>= half its 6-grams) goes to the site section sharing the most. Anything
 * else — a bare part heading, or Reader's Edition editorial text the converter filed as
 * primary (introductions, excursuses, sidebars) — goes to the site section with the same
 * label, failing that to the target of the next confidently matched section (then the
 * previous), so its commentary lands at the start of the material it introduces. `editorial`
 * lists those sections that still carry real text, for carrying into the commentary.
 */
export function alignDocument(oldSecs, newSecs) {
  const newSh = newSecs.map((s) => shingles(s.text))
  const map = new Map()
  const editorial = []
  for (const o of oldSecs) {
    const sh = shingles(o.text)
    if (sh.size === 0) continue
    let best = -1
    let bestScore = 0
    newSh.forEach((ns, i) => {
      let n = 0
      for (const x of sh) if (ns.has(x)) n++
      if (n > bestScore) { bestScore = n; best = i }
    })
    if (bestScore / sh.size >= 0.5) map.set(o.ordinal, newSecs[best].ordinal)
    else if (words(o.text).length >= 25) editorial.push(o)
  }
  const norm = (t) => t.toLowerCase().replace(/[‘’]/g, "'").replace(/[^a-z']+/g, ' ').trim()
  const confident = new Map(map)
  const placed = []
  for (let i = 0; i < oldSecs.length; i++) {
    const o = oldSecs[i]
    if (map.has(o.ordinal)) continue
    const byLabel = newSecs.find((n) => norm(n.label) === norm(o.label))
    const next = oldSecs.slice(i + 1).find((x) => confident.has(x.ordinal))
    const prev = oldSecs.slice(0, i).reverse().find((x) => confident.has(x.ordinal))
    const to = byLabel ? byLabel.ordinal : next ? confident.get(next.ordinal) : prev ? confident.get(prev.ordinal) : newSecs[0]?.ordinal
    if (to !== undefined) map.set(o.ordinal, to)
    if (o.text) placed.push({ ordinal: o.ordinal, label: o.label, to, how: byLabel ? 'label' : 'neighbour' })
  }
  return { map, placed, editorial }
}

// --- Saxon Visitation Articles: EPUB → site-style layout ---------------------------------------
// The EPUB gives Articles I–IV, then four "FALSE AND ERRONEOUS DOCTRINE OF THE CALVINISTS
// Concerning …" sections in the same subject order. Fold each antithesis into its article.
const SVA_KEYS = [['supper', 'supper'], ['person of christ', 'person of christ'], ['baptism', 'baptism'], ['predestination', 'predestination']]
export function restructureSva(oldSecs) {
  const fixMarkers = (t) => t.replace(/\[(\d+)\](?=[^\s\d])/g, '[$1] ')
  const articles = oldSecs.filter((s) => s.number)
  const antitheses = oldSecs.filter((s) => !s.number)
  if (articles.length !== 4 || antitheses.length !== 4) throw new Error(`SVA: expected 4+4 sections, got ${articles.length}+${antitheses.length}`)
  const map = new Map()
  const sections = articles.map((a, i) => {
    const [articleKey, antiKey] = SVA_KEYS[i]
    const anti = antitheses.find((x) => x.label.toLowerCase().includes(antiKey))
    if (!a.label.toLowerCase().includes(articleKey) || !anti) throw new Error(`SVA: can't pair article ${a.number} "${a.label}"`)
    map.set(a.ordinal, i + 1)
    map.set(anti.ordinal, i + 1)
    const antiHeading = anti.label.replace(/:$/, '').replace(/\s+/g, ' ')
    return { ordinal: i + 1, number: a.number, label: a.label, part: null, text: [fixMarkers(a.text), antiHeading, fixMarkers(anti.text)].filter(Boolean).join('\n\n') }
  })
  return { sections, map }
}

// --- Output -------------------------------------------------------------------------------------
export function renderContractMd(docs) {
  const lines = []
  for (const code of Object.keys(DOC_TITLES)) {
    const secs = docs.get(code)
    if (!secs?.length) continue
    lines.push(`# ${DOC_TITLES[code]}`, '')
    for (const s of secs) {
      lines.push(`## ${s.ordinal} | ${s.number ?? ''} | ${s.label} | ${s.part ?? ''}`, '')
      if (s.text) lines.push(s.text, '')
    }
  }
  return lines.join('\n')
}

async function main() {
  const [primaryArg, commentaryArg, outDirArg] = process.argv.slice(2)
  if (!primaryArg || !commentaryArg) {
    console.error('usage: node tools/boc-cph-web-to-md.mjs <epub-primary.md> <epub-commentary.md> [outDir]')
    process.exit(1)
  }
  const outDir = outDirArg || join(HERE, 'sources')

  // 1. Site skeleton + text.
  const nav = parseNav(await fetchPage('/en/augsburg-confession/preface'))
  const site = new Map()
  for (const entry of nav) {
    const page = parsePage(await fetchPage(entry.path))
    if (!site.has(entry.code)) site.set(entry.code, [])
    const secs = site.get(entry.code)
    secs.push({ ordinal: secs.length + 1, number: page.number, label: page.label ?? entry.path, part: entry.part, text: page.text })
  }

  // 2. EPUB → site ordinal maps.
  const oldPrimary = parseContractMd(readFileSync(primaryArg, 'utf8'))
  const oldCommentary = parseContractMd(readFileSync(commentaryArg, 'utf8'))
  const maps = {}
  const editorialByDoc = {}
  const report = []
  for (const [code, oldSecs] of oldPrimary) {
    if (code === 'SVA') {
      const sva = restructureSva(oldSecs)
      site.set('SVA', sva.sections)
      maps[code] = sva.map
      continue
    }
    const newSecs = site.get(code)
    if (!newSecs) { report.push(`!! ${code}: in the EPUB but not on the site — dropped`); continue }
    const { map, placed, editorial } = alignDocument(oldSecs, newSecs)
    maps[code] = map
    editorialByDoc[code] = editorial
    for (const u of placed) report.push(`?  ${code} ${u.ordinal} "${u.label}" → ${u.to} (no text match; placed by ${u.how})`)
  }

  // 3. Commentary re-keyed onto the site skeleton; folded sections concatenate in EPUB order,
  //    each EPUB section's editorial primary text (titled) ahead of its study notes.
  const newCommentary = new Map()
  for (const code of new Set([...oldCommentary.keys(), ...Object.keys(editorialByDoc)])) {
    const map = maps[code]
    const target = site.get(code)
    if (!map || !target) { report.push(`!! ${code}: commentary has no site target — dropped`); continue }
    const entries = [
      ...(editorialByDoc[code] ?? []).map((s) => ({ ordinal: s.ordinal, rank: 0, text: `${s.label}

${s.text}` })),
      ...(oldCommentary.get(code) ?? []).map((s) => ({ ordinal: s.ordinal, rank: 1, text: s.text }))
    ].sort((a, b) => a.ordinal - b.ordinal || a.rank - b.rank)
    for (const e of editorialByDoc[code] ?? []) report.push(`>> ${code} ${e.ordinal} "${e.label}": editorial text moved to commentary of ${map.get(e.ordinal)}`)
    const byNew = new Map()
    for (const s of entries) {
      if (!s.text) continue
      const to = map.get(s.ordinal)
      if (to === undefined) { report.push(`!! ${code} commentary ${s.ordinal}: no mapping — dropped`); continue }
      byNew.set(to, [...(byNew.get(to) ?? []), s.text])
    }
    newCommentary.set(code, target.filter((t) => byNew.has(t.ordinal)).map((t) => ({ ...t, text: byNew.get(t.ordinal).join('\n\n') })))
  }

  mkdirSync(outDir, { recursive: true })
  writeFileSync(join(outDir, 'boc-primary-cph.md'), renderContractMd(site))
  writeFileSync(join(outDir, 'boc-commentary-cph.md'), renderContractMd(newCommentary))
  writeFileSync(join(outDir, 'boc-cph-ordinal-map.json'), JSON.stringify(Object.fromEntries(Object.entries(maps).map(([c, m]) => [c, Object.fromEntries(m)])), null, 2))
  const count = (d) => [...d.values()].reduce((n, s) => n + s.length, 0)
  console.log(`site: ${count(site)} sections in ${site.size} documents; commentary: ${count(newCommentary)} sections`)
  for (const line of report) console.log(line)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main()
