// ThML (CCEL's Theological Markup Language) parser for the Schaff Church Fathers volumes.
//
// Pure: XML string in, sections out — no database, no filesystem, no Electron. A streaming SAX
// pass (`saxes`, pure JS, so no native build) turns each volume into reading-order sections with
// sanitized display HTML, plain text for full-text search, structured Scripture references,
// footnotes and original page breaks. See docs/superpowers/specs/2026-10-09-church-fathers-thml-design.md.
//
// Real-data facts this module encodes (observed in CCEL's anf01–anf10 / npnf101–104):
//  - A contained work's `<ThML.head>` sits immediately BEFORE the div it describes (a div1 or a
//    div2), inside `<ThML.body>`. It scopes that div and its descendants only.
//  - Heads are sometimes wrong (anf01's Barnabas and Papias heads say authorID "ignatius"); the
//    parser reports what the file says and fathersIndex.ts applies curated overrides.
//  - ANF groups by author at div1 ("CLEMENT OF ROME"); NPNF div1s are works ("The Confessions")
//    and carry no per-work heads, so a single-author volume falls back to its DC.Creator.
//  - Depth goes to div5; `<pb>` carries its page in `n` (anf) or only in `id`/`href` (npnf).
import { SaxesParser } from 'saxes'
import { parseOsisRef } from '../../shared/osis'

export interface ThmlRef {
  /** The scripRef element's id (shared by every passage of one osisRef list). */
  anchor: string
  osis: string
  passage: string
  /** USFM code. */
  book: string
  chapterStart: number
  verseStart: number | null
  chapterEnd: number
  verseEnd: number | null
  /** True when the reference sits inside a footnote. Footnotes are the editors' cross-references
   *  and hold ~99% of all scripRefs in the Schaff volumes, so a catena built from body text
   *  alone would be nearly empty. */
  inNote: boolean
  /** Offset into the section's `text` where the reference starts — or, for a footnote
   *  reference, where the footnote marker sits. */
  charOffset: number
}
export interface ThmlNote {
  anchor: string
  n: string
  html: string
}
export interface ThmlPage {
  n: string
  charOffset: number
}
export interface ThmlSection {
  /** CCEL div id, e.g. 'ii.ii.v'. A second section from the same div gets '~2', '~3'… */
  id: string
  /** Reading order within the volume. */
  ordinal: number
  /** div level (1–6). */
  depth: number
  /** Ancestor titles, outermost first, own title last. */
  titles: string[]
  shortTitle: string
  authorId: string | null
  workTitle: string | null
  editorial: boolean
  /** Page label in force where the section begins (null if the volume has no page breaks yet). */
  startPage: string | null
  html: string
  text: string
  refs: ThmlRef[]
  notes: ThmlNote[]
  pages: ThmlPage[]
}
export interface ThmlVolume {
  code: string
  title: string
  sections: ThmlSection[]
}
export interface ThmlWarning {
  kind: 'unknown-tag' | 'bad-osis' | 'non-canon-ref'
  detail: string
  count: number
}
export interface ThmlResult {
  volume: ThmlVolume
  warnings: ThmlWarning[]
}

export class ThmlParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ThmlParseError'
  }
}

// ---------- small helpers ----------

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }
const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ESC[c])
const norm = (s: string | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim()

/** 'IRENÆUS' -> 'irenaeus', 'CLEMENT OF ROME' -> 'clement_of_rome'. */
export function slugifyAuthor(title: string): string {
  return title
    .replace(/Æ/g, 'AE')
    .replace(/æ/g, 'ae')
    .replace(/Œ/g, 'OE')
    .replace(/œ/g, 'oe')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

/** "ANF01. The Apostolic Fathers…" / "NPNF1-01. The Confessions…" -> the bare title. */
function cleanVolumeTitle(raw: string): string {
  return norm(raw).replace(/^(?:ANF|NPNF[12]?)[-\s]?\d+\.\s+/i, '')
}

// A title that is the editor's rather than the Father's, at any depth.
const ALWAYS_EDITORIAL =
  /introductory\s+(?:note|notice)|elucidations?|excursus|appended\s+note|prolegomena|(?:translator|editor)[’']?s?\s+(?:preface|note|introduction)|\bindex(?:es)?\b|^(?:second\s+)?title\s+pages?\.?$|^series\s+title$|^contents\.?$|^table\s+of\s+contents\.?$/i
// A preface/introduction is editorial only when it heads the volume or a work (depth ≤ 2): a
// Father's own "Preface." at chapter level (Irenaeus, Against Heresies III) is his text.
const TOP_LEVEL_EDITORIAL =
  /^(?:general\s+|bibliographical\s+)?(?:preface|introduction)\b|^advertisement\b/i

export function isEditorialTitles(titles: string[]): boolean {
  return titles.some((t, i) => ALWAYS_EDITORIAL.test(t) || (i <= 1 && TOP_LEVEL_EDITORIAL.test(t)))
}

// ---------- output sink (sanitized HTML + plain text) ----------

class Sink {
  html = ''
  text = ''
  private atStart = true

  constructor(private readonly trackText: boolean) {}

  addText(raw: string): void {
    let t = raw.replace(/\s+/g, ' ')
    if (this.atStart) t = t.replace(/^ /, '')
    if (!t) return
    this.html += esc(t)
    this.atStart = false
    if (this.trackText) {
      if (this.text === '' || /[ \n]$/.test(this.text)) t = t.replace(/^ /, '')
      this.text += t
    }
  }
  openInline(h: string): void {
    this.html += h
  }
  closeInline(h: string): void {
    this.html += h
  }
  /** Markup with no text of its own; `visible` marks it as content (footnote marker). */
  raw(h: string, visible: boolean): void {
    this.html += h
    if (visible) this.atStart = false
  }
  openBlock(h: string): void {
    this.html += h
    this.boundary()
  }
  endBlock(h: string): void {
    this.html += h
    this.boundary()
  }
  lineBreak(): void {
    this.html += '<br>'
    this.boundary()
  }
  /** A block edge with no markup of its own (a transparent <div>). */
  boundary(): void {
    this.atStart = true
    if (!this.trackText || this.text === '' || this.text.endsWith('\n')) return
    this.text = this.text.replace(/ +$/, '') + '\n'
  }
}

// ---------- tag tables ----------

const DIV_RE = /^div[1-6]$/
/** Tags whose subtree is discarded (index markers, scripCom citations, images, rules). */
const DROP = new Set(['index', 'insertIndex', 'scripCom', 'img', 'hr', 'style'])
/** Tags unwrapped silently: text kept, tag dropped. */
const UNWRAP_INLINE = new Set(['a', 'name', 'cite', 'attr', 'q', 'ThML.body', 'ThML'])
const BLOCK_OUT: Record<string, string> = {
  p: 'p', blockquote: 'blockquote', ul: 'ul', ol: 'ol', li: 'li', table: 'table', tr: 'tr', td: 'td',
  th: 'th', h1: 'h3', h2: 'h3', h3: 'h3', h4: 'h4', h5: 'h4', h6: 'h4'
}
const INLINE_OUT: Record<string, string> = { i: 'i', em: 'em', b: 'b', strong: 'b', sup: 'sup', sub: 'sub' }

type Elem =
  | { kind: 'drop' }
  | { kind: 'unwrap'; block: boolean }
  | { kind: 'out'; close: string; block: boolean; emitted: boolean }
  | { kind: 'div' }
  | { kind: 'note' }
  | { kind: 'scripref'; wrapped: boolean }

interface DivFrame {
  id: string
  depth: number
  titles: string[]
  shortTitle: string
  authorId: string | null
  workTitle: string | null
  editorial: boolean
}
interface Builder {
  frame: DivFrame
  sink: Sink
  refs: ThmlRef[]
  notes: ThmlNote[]
  pages: ThmlPage[]
  prevPage: string | null
}

type Attrs = Record<string, string>

/** Parse one ThML volume. `code` is the CCEL volume code ('anf01', 'npnf105') — it decides how
 *  author attribution falls back when a div has no contained-work head. Throws ThmlParseError
 *  only for input that is not well-formed ThML; odd content never throws, it produces warnings. */
export function parseThml(xml: string, code: string): ThmlResult {
  if (!/<ThML[\s>]/.test(xml.slice(0, 50000))) throw new ThmlParseError('Not a ThML document (no <ThML> root)')

  const isAnf = /^anf/i.test(code)
  const sections: ThmlSection[] = []
  const warnings = new Map<string, ThmlWarning>()
  const warn = (kind: ThmlWarning['kind'], detail: string): void => {
    const key = `${kind}|${detail}`
    const w = warnings.get(key)
    if (w) w.count++
    else warnings.set(key, { kind, detail, count: 1 })
  }

  const frames: DivFrame[] = []
  const elems: Elem[] = []
  const idUses = new Map<string, number>()
  let builder: Builder | null = null
  let noteCtx: { anchor: string; n: string; sink: Sink; offset: number } | null = null
  let currentPage: string | null = null
  let dropDepth = 0
  let scripDepth = 0
  let anonDivs = 0

  // ThML.head state
  let bodySeen = false
  let headDepth = 0
  let head: { authorId: string | null; title: string | null; creators: string[] } = {
    authorId: null,
    title: null,
    creators: []
  }
  let capture: 'authorID' | 'title' | 'creator' | null = null
  let captureText = ''
  let volumeTitle = ''
  let volumeAuthors: string[] = []
  let pendingHead: { authorId: string | null; title: string | null } | null = null

  const volumeAuthor = (): string | null => (volumeAuthors.length === 1 ? volumeAuthors[0] : null)

  const ensureBuilder = (): Builder | null => {
    if (builder) return builder
    const frame = frames[frames.length - 1]
    if (!frame) return null
    builder = { frame, sink: new Sink(true), refs: [], notes: [], pages: [], prevPage: currentPage }
    return builder
  }
  /** The sink content should currently go to (creating the section builder on demand). */
  const sink = (): Sink | null => {
    const b = ensureBuilder()
    if (!b) return null
    return noteCtx ? noteCtx.sink : b.sink
  }
  /** Like sink() but never creates a builder (used when closing tags). */
  const curSink = (): Sink | null => (builder ? (noteCtx ? noteCtx.sink : builder.sink) : null)

  const flushSection = (): void => {
    const b = builder
    builder = null
    noteCtx = null
    if (!b) return
    const text = b.sink.text.replace(/\s+$/, '')
    if (!text.trim()) return
    const uses = idUses.get(b.frame.id) ?? 0
    idUses.set(b.frame.id, uses + 1)
    const id = uses === 0 ? b.frame.id : `${b.frame.id}~${uses + 1}`
    const clamp = (n: number): number => Math.min(n, text.length)
    const pages = b.pages.map((p) => ({ n: p.n, charOffset: clamp(p.charOffset) }))
    sections.push({
      id,
      ordinal: sections.length,
      depth: b.frame.depth,
      titles: b.frame.titles,
      shortTitle: b.frame.shortTitle,
      authorId: b.frame.authorId,
      workTitle: b.frame.workTitle,
      editorial: b.frame.editorial,
      startPage: pages.length > 0 && pages[0].charOffset === 0 ? pages[0].n : b.prevPage,
      html: b.sink.html.trim(),
      text,
      refs: b.refs.map((r) => ({ ...r, charOffset: clamp(r.charOffset) })),
      notes: b.notes,
      pages
    })
  }

  const openDiv = (name: string, a: Attrs): void => {
    flushSection() // the parent's text so far becomes its own section
    const depth = Number(name.slice(3))
    const parent = frames[frames.length - 1]
    const title = norm(a.title) || norm(a.shorttitle) || norm(a.n) || a.id || ''
    const titles = [...(parent?.titles ?? []), title]
    const editorial = isEditorialTitles(titles)
    // CCEL gives front-matter divs junk head ids ('title_page', 'second_title_page'): never an author.
    const headAuthor = editorial && depth === 1 ? null : (pendingHead?.authorId ?? null)
    let authorId = headAuthor ?? parent?.authorId ?? null
    if (!headAuthor && !parent) {
      authorId = editorial ? null : isAnf ? slugifyAuthor(title) || null : volumeAuthor()
    }
    frames.push({
      id: a.id || `div${depth}-${++anonDivs}`,
      depth,
      titles,
      shortTitle: norm(a.shorttitle) || title,
      authorId,
      workTitle: pendingHead?.title ?? parent?.workTitle ?? null,
      editorial
    })
    pendingHead = null
  }

  const handlePb = (a: Attrs): void => {
    const n =
      norm(a.n) ||
      /Page_([A-Za-z0-9]+)(?:\.html)?$/.exec(a.id ?? '')?.[1] ||
      /Page_([A-Za-z0-9]+)\.html$/.exec(a.href ?? '')?.[1]
    if (!n || noteCtx) return
    const b = ensureBuilder()
    if (b) {
      b.pages.push({ n, charOffset: b.sink.text.length })
      b.sink.raw(`<span class="pb" data-page="${esc(n)}"></span>`, false)
    }
    currentPage = n
  }

  const openScripRef = (a: Attrs): void => {
    const s = sink()
    const osis = norm(a.osisRef)
    const nested = scripDepth > 0
    const res = !s || nested ? ({ kind: 'bad' } as const) : parseOsisRef(osis)
    if (!s || res.kind !== 'ok') {
      if (s && !nested) {
        if (res.kind === 'non-canon') warn('non-canon-ref', res.book)
        else warn('bad-osis', osis || '(missing)')
      }
      elems.push({ kind: 'scripref', wrapped: false })
      return
    }
    s.openInline(`<a class="scripref" data-osis="${esc(osis)}">`)
    scripDepth++
    elems.push({ kind: 'scripref', wrapped: true })
    if (builder) {
      const anchor = a.id || `${builder.frame.id}-r${builder.refs.length + 1}`
      const passage = norm(a.passage) || osis
      for (const p of res.passages) {
        builder.refs.push({
          anchor,
          osis,
          passage,
          book: p.book,
          chapterStart: p.chapterStart,
          verseStart: p.verseStart,
          chapterEnd: p.chapterEnd,
          verseEnd: p.verseEnd,
          inNote: noteCtx !== null,
          charOffset: noteCtx ? noteCtx.offset : builder.sink.text.length
        })
      }
    }
  }

  const openNote = (a: Attrs): void => {
    const b = ensureBuilder()
    if (!b || noteCtx) {
      dropDepth++
      elems.push({ kind: 'drop' })
      return
    }
    const idx = b.notes.length + 1
    const anchor = a.id || `${b.frame.id}-n${idx}`
    const n = norm(a.n) || String(idx)
    noteCtx = { anchor, n, sink: new Sink(false), offset: b.sink.text.length }
    b.sink.raw(`<sup class="fn" data-note="${esc(anchor)}">${esc(n)}</sup>`, true)
    elems.push({ kind: 'note' })
  }

  // ----- head handling -----
  const headOpen = (name: string, a: Attrs): void => {
    headDepth++
    if (name === 'authorID') {
      capture = 'authorID'
      captureText = ''
    } else if (name === 'DC.Title' && !a.sub && head.title === null) {
      capture = 'title'
      captureText = ''
    } else if (name === 'DC.Creator' && a.sub === 'Author' && a.scheme === 'ccel') {
      capture = 'creator'
      captureText = ''
    }
  }
  const headClose = (): void => {
    if (capture) {
      const v = norm(captureText)
      if (v) {
        if (capture === 'authorID') head.authorId = v
        else if (capture === 'title') head.title = v
        else if (!head.creators.includes(v)) head.creators.push(v)
      }
      capture = null
    }
    headDepth--
    if (headDepth === 0) {
      if (bodySeen) pendingHead = { authorId: head.authorId, title: head.title }
      else {
        volumeTitle = head.title ?? ''
        volumeAuthors = head.creators
      }
    }
  }

  // ----- SAX handlers -----
  const onOpen = (tag: { name: string; attributes: Attrs }): void => {
    const { name } = tag
    const a = tag.attributes
    if (headDepth > 0) return headOpen(name, a)
    if (name === 'ThML.head') {
      headDepth = 1
      head = { authorId: null, title: null, creators: [] }
      return
    }
    if (dropDepth > 0) {
      dropDepth++
      elems.push({ kind: 'drop' })
      return
    }
    if (name === 'ThML.body') bodySeen = true
    if (DIV_RE.test(name)) {
      openDiv(name, a)
      elems.push({ kind: 'div' })
      return
    }
    if (DROP.has(name)) {
      dropDepth++
      elems.push({ kind: 'drop' })
      return
    }
    if (name === 'pb') {
      handlePb(a)
      elems.push({ kind: 'unwrap', block: false })
      return
    }
    if (name === 'note') return openNote(a)
    if (name === 'scripRef') return openScripRef(a)
    if (name === 'span') {
      if (a.class === 'sc') {
        const s = sink()
        s?.openInline('<span class="sc">')
        elems.push({ kind: 'out', close: '</span>', block: false, emitted: !!s })
      } else elems.push({ kind: 'unwrap', block: false })
      return
    }
    if (Object.hasOwn(BLOCK_OUT, name) || name === 'l' || name === 'verse') {
      const s = sink()
      const tagName = BLOCK_OUT[name]
      const open = tagName ? `<${tagName}>` : `<div class="${name === 'l' ? 'l' : 'verse'}">`
      const close = tagName ? `</${tagName}>` : '</div>'
      s?.openBlock(open)
      elems.push({ kind: 'out', close, block: true, emitted: !!s })
      return
    }
    if (Object.hasOwn(INLINE_OUT, name)) {
      const s = sink()
      s?.openInline(`<${INLINE_OUT[name]}>`)
      elems.push({ kind: 'out', close: `</${INLINE_OUT[name]}>`, block: false, emitted: !!s })
      return
    }
    if (name === 'br') {
      sink()?.lineBreak()
      elems.push({ kind: 'unwrap', block: false })
      return
    }
    if (name === 'div' || name === 'center') {
      sink()?.boundary()
      elems.push({ kind: 'unwrap', block: true })
      return
    }
    if (!UNWRAP_INLINE.has(name)) warn('unknown-tag', name)
    elems.push({ kind: 'unwrap', block: false })
  }

  const onClose = (): void => {
    if (headDepth > 0) return headClose()
    const el = elems.pop()
    if (!el) return
    switch (el.kind) {
      case 'drop':
        dropDepth--
        break
      case 'unwrap':
        if (el.block) curSink()?.boundary()
        break
      case 'out': {
        const s = curSink()
        if (s && el.emitted) {
          if (el.block) s.endBlock(el.close)
          else s.closeInline(el.close)
        }
        break
      }
      case 'div':
        flushSection()
        frames.pop()
        break
      case 'note':
        if (builder && noteCtx) {
          builder.notes.push({ anchor: noteCtx.anchor, n: noteCtx.n, html: noteCtx.sink.html.trim() })
        }
        noteCtx = null
        break
      case 'scripref':
        if (el.wrapped) {
          curSink()?.closeInline('</a>')
          scripDepth--
        }
        break
    }
  }

  const onText = (t: string): void => {
    if (headDepth > 0) {
      if (capture) captureText += t
      return
    }
    if (dropDepth > 0 || !t) return
    if (!builder && !/\S/.test(t)) return
    sink()?.addText(t)
  }

  const parser = new SaxesParser()
  parser.on('error', (e) => {
    throw new ThmlParseError(`Invalid ThML XML: ${e.message}`)
  })
  parser.on('opentag', onOpen)
  parser.on('closetag', onClose)
  parser.on('text', onText)
  parser.on('cdata', onText)
  parser.write(xml).close()

  return {
    volume: { code, title: cleanVolumeTitle(volumeTitle) || code, sections },
    warnings: [...warnings.values()].sort((a, b) => b.count - a.count || a.detail.localeCompare(b.detail))
  }
}
