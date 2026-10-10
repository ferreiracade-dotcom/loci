import { describe, expect, it } from 'vitest'
import { ThmlParseError, isEditorialTitles, parseThml, slugifyAuthor } from './thml'
import type { ThmlSection } from './thml'
import { ANF_MINI, NPNF_MINI, miniThml } from './__fixtures__/thmlSamples'

const anf = parseThml(ANF_MINI, 'anf01')
const npnf = parseThml(NPNF_MINI, 'npnf101')
const byId = (secs: ThmlSection[], id: string): ThmlSection => {
  const s = secs.find((x) => x.id === id)
  if (!s) throw new Error(`no section ${id}`)
  return s
}

describe('parseThml — volume and hierarchy', () => {
  it('reads the volume title from the first plain DC.Title and strips the "ANF01." prefix', () => {
    expect(anf.volume.code).toBe('anf01')
    expect(anf.volume.title).toBe('The Apostolic Fathers with Justin Martyr and Irenaeus')
    expect(npnf.volume.title).toBe('The Confessions and Letters of St. Augustine, with a Sketch of his Life and Work')
  })

  it('emits sections in reading order with ordinals, depth and ancestor titles', () => {
    expect(anf.volume.sections.map((s) => s.id)).toEqual([
      'i', 'i.i', 'ii', 'ii.i', 'ii.ii', 'ii.ii.i', 'ii.ii.ii', 'vi.ii', 'ix.i', 'ix.ii.i', 'ix.ii.ii'
    ])
    expect(anf.volume.sections.map((s) => s.ordinal)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    const ch = byId(anf.volume.sections, 'ix.ii.ii')
    expect(ch.depth).toBe(3)
    expect(ch.titles).toEqual(['IRENÆUS', 'Against Heresies: Book III', 'Chapter III.—Apostolic succession.'])
    expect(ch.shortTitle).toBe('Chapter III.—Apostolic succession.')
  })

  it('turns text in a parent div before its first child into its own section — nothing is dropped', () => {
    const s = byId(anf.volume.sections, 'ii')
    expect(s.depth).toBe(1)
    expect(s.text).toBe('Intro text under the author heading.')
    expect(anf.volume.sections.map((x) => x.text).join('\n')).toContain('Written by the editor.')
  })

  it('does not emit sections for divs with no direct text', () => {
    const ids = anf.volume.sections.map((s) => s.id)
    expect(ids).not.toContain('vi') // BARNABAS div1 only wraps a div2
    expect(ids).not.toContain('ix.ii') // Book III div2 only wraps chapters
  })

  it('keeps trailing text after the last child as another section of the same div', () => {
    const xml = miniThml(
      `<div1 id="a" title="A"><p>Before.</p><div2 id="a.i" title="Child"><p>Inside.</p></div2><p>After.</p></div1>`
    )
    const { volume } = parseThml(xml, 'anf99')
    expect(volume.sections.map((s) => [s.id, s.text])).toEqual([
      ['a', 'Before.'],
      ['a.i', 'Inside.'],
      ['a~2', 'After.']
    ])
  })

  it('disambiguates a repeated div id', () => {
    const xml = miniThml(`<div1 id="a" title="A"><p>One.</p></div1><div1 id="a" title="A"><p>Two.</p></div1>`)
    expect(parseThml(xml, 'anf99').volume.sections.map((s) => s.id)).toEqual(['a', 'a~2'])
  })

  it('handles divs nested to depth 5', () => {
    const xml = miniThml(
      `<div1 id="a" title="A"><div2 id="a.b" title="B"><div3 id="a.b.c" title="C"><div4 id="a.b.c.d" title="D"><div5 id="a.b.c.d.e" title="E"><p>Deep.</p></div5></div4></div3></div2></div1>`
    )
    const s = parseThml(xml, 'anf99').volume.sections[0]
    expect(s.depth).toBe(5)
    expect(s.titles).toEqual(['A', 'B', 'C', 'D', 'E'])
  })
})

describe('parseThml — author attribution and editorial flag', () => {
  it('uses the contained-work head that precedes a div, scoped to that div and its descendants', () => {
    const clement = byId(anf.volume.sections, 'ii.ii.i')
    expect(clement.authorId).toBe('clement_rome')
    expect(clement.workTitle).toBe('First Epistle to the Corinthians')
    const iren = byId(anf.volume.sections, 'ix.ii.ii')
    expect(iren.authorId).toBe('irenaeus')
    expect(iren.workTitle).toBe('Against Heresies: Book III')
  })

  it('does not let a div2 head leak onto its earlier sibling', () => {
    const intro = byId(anf.volume.sections, 'ix.i') // before the Book III head
    expect(intro.workTitle).toBeNull()
  })

  it('falls back to a slug of the div1 title in ANF volumes (IRENÆUS -> irenaeus)', () => {
    expect(byId(anf.volume.sections, 'ix.i').authorId).toBe('irenaeus')
    expect(slugifyAuthor('IRENÆUS')).toBe('irenaeus')
    expect(slugifyAuthor('CLEMENT OF ROME')).toBe('clement_of_rome')
    expect(slugifyAuthor('Tertullian')).toBe('tertullian')
  })

  it('reports what the head says even when it is wrong (Barnabas head says ignatius)', () => {
    expect(byId(anf.volume.sections, 'vi.ii').authorId).toBe('ignatius')
  })

  it('falls back to the volume\'s single DC.Creator author in NPNF volumes, but not for editorial front matter', () => {
    expect(byId(npnf.volume.sections, 'vi.i.i').authorId).toBe('augustine')
    expect(byId(npnf.volume.sections, 'ii').authorId).toBeNull()
  })

  it('gives front matter no author in ANF volumes', () => {
    expect(byId(anf.volume.sections, 'i').authorId).toBeNull()
    expect(byId(anf.volume.sections, 'i.i').authorId).toBeNull()
  })

  it('ignores a junk head author on a front-matter div1 (CCEL uses "title_page")', () => {
    const xml = miniThml(
      `<ThML.head><electronicEdInfo><authorID>title_page</authorID><DC><DC.Title>Title Page</DC.Title></DC></electronicEdInfo></ThML.head>` +
        `<div1 id="i" title="Title Page"><p>Text.</p></div1>`
    )
    expect(parseThml(xml, 'anf03').volume.sections[0].authorId).toBeNull()
  })

  it('does not guess an author when a volume names several', () => {
    const xml = miniThml(`<div1 id="a" title="The Treatise"><p>Text.</p></div1>`, {
      title: 'NPNF2-01. Test',
      authors: ['eusebius', 'socrates']
    })
    expect(parseThml(xml, 'npnf201').volume.sections[0].authorId).toBeNull()
  })

  it('flags editorial sections', () => {
    const e = (id: string) => byId(anf.volume.sections, id).editorial
    expect(e('i')).toBe(true) // Title Page
    expect(e('i.i')).toBe(true) // Preface under front matter
    expect(e('ii.i')).toBe(true) // Introductory Note
    expect(e('ix.i')).toBe(true)
    expect(e('ii')).toBe(false)
    expect(e('ii.ii.i')).toBe(false)
    expect(byId(npnf.volume.sections, 'ii').editorial).toBe(true) // top-level Preface
  })

  it("does not flag a Father's own chapter-level Preface as editorial", () => {
    expect(byId(anf.volume.sections, 'ix.ii.i').editorial).toBe(false)
    expect(isEditorialTitles(['IRENÆUS', 'Against Heresies: Book III', 'Preface.'])).toBe(false)
    expect(isEditorialTitles(['Preface'])).toBe(true)
    expect(isEditorialTitles(['CLEMENT', 'Work', 'Elucidations'])).toBe(true)
    expect(isEditorialTitles(['Subject Indexes'])).toBe(true)
    expect(isEditorialTitles(['Prolegomena: St. Augustin’s Life and Work'])).toBe(true)
    // CCEL titles carry trailing periods and plural forms.
    for (const t of ['Title Page.', 'Title Pages.', 'Second Title Page.', 'Series Title', 'Contents',
      'General Introduction.', 'Bibliographical Introduction.', 'Excursus on the History of the Roman Law',
      'Appended Note on the Eastern Editions']) {
      expect(isEditorialTitles([t])).toBe(true)
    }
    expect(isEditorialTitles(['The Confessions', 'Book I', 'Introduction'])).toBe(false) // depth 3 = the author's own
  })
})

describe('parseThml — scripture references', () => {
  it('records single, range and list references with structured fields', () => {
    const s = byId(anf.volume.sections, 'ii.ii.i')
    expect(s.refs).toHaveLength(2)
    expect(s.refs[0]).toMatchObject({
      anchor: 'ii.ii.i-p1.1', osis: 'Bible:1Cor.1.2', passage: '1 Cor. i. 2',
      book: '1CO', chapterStart: 1, verseStart: 2, chapterEnd: 1, verseEnd: 2
    })
    expect(s.refs[1]).toMatchObject({
      book: '1PE', chapterStart: 5, verseStart: 1, chapterEnd: 5, verseEnd: 5
    })
    const list = byId(anf.volume.sections, 'ix.ii.ii').refs
    expect(list.map((r) => [r.book, r.chapterStart, r.verseStart])).toEqual([
      ['ROM', 16, 3], ['ISA', 64, 4], ['1CO', 2, 9]
    ])
    expect(list[1].anchor).toBe(list[2].anchor)
  })

  it('records a chapter-only reference with null verses', () => {
    const r = byId(anf.volume.sections, 'ii.ii.ii').refs[0]
    expect(r).toMatchObject({ book: 'PSA', chapterStart: 23, verseStart: null, chapterEnd: 23, verseEnd: null })
  })

  it('charOffset points at the start of the reference in the section text', () => {
    const s = byId(anf.volume.sections, 'ii.ii.i')
    expect(s.text.slice(s.refs[0].charOffset)).toMatch(/^sojourning at Rome/)
    expect(s.text.slice(s.refs[1].charOffset)).toMatch(/^1 Pet\. v\. 1-5/)
  })

  it('renders a usable reference as a.scripref and keeps the list osis verbatim', () => {
    const s = byId(anf.volume.sections, 'ix.ii.ii')
    expect(s.html).toContain('<a class="scripref" data-osis="Bible:Rom.16.3-Rom.16.4">Rom. 16:3</a>')
    expect(s.html).toContain('data-osis="Bible:Isa.64.4 Bible:1Cor.2.9"')
  })

  it('leaves deuterocanonical and unparseable references as plain text and counts them', () => {
    const s = byId(anf.volume.sections, 'ii.ii.ii')
    expect(s.html).toContain('Ecclus. i. 1 and oops.')
    expect(s.html).not.toContain('Ecclus. i. 1</a>')
    expect(s.refs).toHaveLength(1)
    expect(anf.warnings).toEqual([
      { kind: 'bad-osis', detail: 'garbage', count: 1 },
      { kind: 'non-canon-ref', detail: 'Sir', count: 1 }
    ])
  })
})

describe('parseThml — notes, page breaks, display HTML', () => {
  it('replaces a note with a numbered marker and keeps note text out of the section text', () => {
    const s = byId(anf.volume.sections, 'ii.ii.i')
    expect(s.html).toContain('<sup class="fn" data-note="ii.ii.i-p2.2">2</sup>')
    expect(s.notes).toEqual([{ anchor: 'ii.ii.i-p2.2', n: '2', html: '<p>Greek differs.</p>' }])
    expect(s.text).not.toContain('Greek differs')
    expect(byId(anf.volume.sections, 'i.i').text).toBe('This edition is a reprint.')
  })

  it('keeps inline formatting inside a note and renders scripture links inside notes', () => {
    expect(byId(anf.volume.sections, 'i.i').notes[0].html).toBe('<p>A note on the <i>edition</i>.</p>')
    const s = byId(npnf.volume.sections, 'vi.i.i')
    expect(s.notes[0].html).toBe('<p>Cf. <a class="scripref" data-osis="Bible:Ps.145.3">Ps. cxlv. 3</a>.</p>')
  })

  it('records references inside footnotes (inNote) anchored at the footnote marker', () => {
    const s = byId(npnf.volume.sections, 'vi.i.i')
    expect(s.refs.map((r) => [r.book, r.inNote])).toEqual([
      ['PSA', true],
      ['1CO', false]
    ])
    // The marker follows "Great art Thou, O Lord" in the text.
    expect(s.text.slice(0, s.refs[0].charOffset)).toBe('Great art Thou, O Lord')
    expect(s.text.slice(s.refs[1].charOffset)).toMatch(/^saints/)
    // Footnote text itself stays out of the searchable text.
    expect(s.text).not.toContain('Cf.')
  })

  it('records page breaks with char offsets and a start page', () => {
    const s = byId(anf.volume.sections, 'ix.ii.ii')
    expect(s.pages).toEqual([{ n: '415', charOffset: 0 }])
    expect(s.startPage).toBe('415')
    expect(s.html.startsWith('<span class="pb" data-page="415"></span>')).toBe(true)
  })

  it('derives the page from id/href when <pb> has no n attribute, and tracks a mid-paragraph break', () => {
    const s = byId(npnf.volume.sections, 'vi.i.i')
    expect(s.startPage).toBe('27') // from <pb href=".../Page_27.html"> in the div1, before this section
    expect(s.pages).toHaveLength(1)
    expect(s.pages[0].n).toBe('28')
    expect(s.text.slice(s.pages[0].charOffset)).toMatch(/^ Thou awakest/)
    expect(s.html).toContain('praised.<span class="pb" data-page="28"></span> Thou awakest')
  })

  it('drops index markers, images and scripCom, and unwraps a, q, name, cite', () => {
    const xml = miniThml(
      `<div1 id="a" title="A"><p>Hi<index id="x" subject1="s" type="subject"/> <a href="#x">link</a> <q>q</q> <name id="n">Nm</name> <cite id="c">Ct</cite><img src="x.png"/><scripCom id="s" osisRef="Bible:Rev.1.1" type="Citation"/>.</p></div1>`
    )
    const s = parseThml(xml, 'anf99')
    expect(s.volume.sections[0].html).toBe('<p>Hi link q Nm Ct.</p>')
    expect(s.warnings).toEqual([])
  })

  it('emits only allow-listed tags and maps headings, lists, tables, lines and verses', () => {
    const xml = miniThml(
      `<div1 id="a" title="A"><p>One <b>bold</b> <em>em</em> H<sub>2</sub>O x<sup>2</sup><br/>after <font color="red">fonty</font>.</p>` +
        `<h1>H1</h1><h4>H4</h4><h6>H6</h6><blockquote><p>Quote</p></blockquote>` +
        `<ul><li>one</li><li>two</li></ul><table><tr><td colspan="2">cell</td></tr></table>` +
        `<l>Line one</l><verse>Verse one</verse><div class="Center"><p>Centered</p></div><hr class="W30"/></div1>`
    )
    const { volume, warnings } = parseThml(xml, 'anf99')
    expect(volume.sections[0].html).toBe(
      '<p>One <b>bold</b> <em>em</em> H<sub>2</sub>O x<sup>2</sup><br>after fonty.</p>' +
        '<h3>H1</h3><h4>H4</h4><h4>H6</h4><blockquote><p>Quote</p></blockquote>' +
        '<ul><li>one</li><li>two</li></ul><table><tr><td>cell</td></tr></table>' +
        '<div class="l">Line one</div><div class="verse">Verse one</div><p>Centered</p>'
    )
    expect(volume.sections[0].text.split('\n')).toEqual([
      'One bold em H2O x2', 'after fonty.', 'H1', 'H4', 'H6', 'Quote', 'one', 'two', 'cell',
      'Line one', 'Verse one', 'Centered'
    ])
    expect(warnings).toEqual([{ kind: 'unknown-tag', detail: 'font', count: 1 }])
  })

  it('never emits attributes from the source or unescaped markup', () => {
    const xml = miniThml(
      `<div1 id="a" title="A"><p onclick="evil()" style="x">5 &lt; 6 &amp; 7 <script>alert("x")</script></p></div1>`
    )
    const html = parseThml(xml, 'anf99').volume.sections[0].html
    expect(html).not.toMatch(/onclick|style=|<script/)
    expect(html).toBe('<p>5 &lt; 6 &amp; 7 alert(&quot;x&quot;)</p>')
  })

  it('collapses source line-wrapping to single spaces', () => {
    const xml = miniThml(`<div1 id="a" title="A"><p>one\n   two\n\n three</p></div1>`)
    expect(parseThml(xml, 'anf99').volume.sections[0].text).toBe('one two three')
  })
})

describe('parseThml — input errors', () => {
  it('throws ThmlParseError for non-XML and non-ThML input', () => {
    expect(() => parseThml('this is not xml', 'anf01')).toThrow(ThmlParseError)
    expect(() => parseThml('<html><body/></html>', 'anf01')).toThrow(ThmlParseError)
    expect(() => parseThml('', 'anf01')).toThrow(ThmlParseError)
  })

  it('throws ThmlParseError for malformed XML', () => {
    expect(() => parseThml('<ThML><ThML.body><div1 id="a"><p>oops</div1></ThML.body></ThML>', 'anf01')).toThrow(
      ThmlParseError
    )
  })

  it('returns an empty volume (not an error) for a ThML file with no divs', () => {
    const r = parseThml(miniThml(''), 'anf99')
    expect(r.volume.sections).toEqual([])
    expect(r.volume.title).toBe('Test Volume')
  })
})
