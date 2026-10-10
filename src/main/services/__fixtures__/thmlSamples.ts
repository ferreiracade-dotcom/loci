// Small hand-written ThML fixtures shaped like CCEL's real files (see thml.ts for the facts they
// mirror). The real volumes are 4–6 MB each and are NOT committed.

/** Wrap body markup in a minimal ThML volume (volume head + <ThML.body>). */
export function miniThml(
  bodyXml: string,
  opts: { title?: string; authors?: string[] } = {}
): string {
  const creators = (opts.authors ?? [])
    .map((a) => `<DC.Creator scheme="ccel" sub="Author">${a}</DC.Creator>`)
    .join('')
  return `<?xml version="1.0" encoding="UTF-8"?>
<ThML>
<ThML.head>
<electronicEdInfo>
<authorID>schaff</authorID>
<DC><DC.Title>${opts.title ?? 'ANF99. Test Volume'}</DC.Title>${creators}</DC>
</electronicEdInfo>
</ThML.head>
<ThML.body xml:space="preserve">
${bodyXml}
</ThML.body>
</ThML>`
}

/** An ANF-style volume (code 'anf01'): author-grouped div1s, contained-work heads that precede
 *  the div they describe, a head with a WRONG authorID (Barnabas -> "ignatius", as in the real
 *  anf01), footnotes, page breaks, and every scripRef flavour. */
export const ANF_MINI = `<?xml version="1.0" encoding="UTF-8"?>
<!-- fixture: miniature ANF-style volume -->
<ThML>
<ThML.head>
<electronicEdInfo>
  <authorID>schaff</authorID>
  <bookID>anf01</bookID>
  <DC>
    <DC.Title>ANF01. The Apostolic Fathers with Justin Martyr and Irenaeus</DC.Title>
    <DC.Title sub="short">ANF (V1)</DC.Title>
    <DC.Creator scheme="ccel" sub="Editor">schaff</DC.Creator>
    <DC.Creator scheme="ccel" sub="Author">irenaeus</DC.Creator>
  </DC>
</electronicEdInfo>
</ThML.head>
<ThML.body xml:space="preserve">

<div1 id="i" n="i" title="Title Page" shorttitle="Title Page">
<p id="i-p1">Ante-Nicene Fathers, Volume I.</p>
<div2 id="i.i" n="i" title="Preface" shorttitle="Preface">
<pb n="v" href="/ccel/schaff/anf01/Page_v.html" id="i.i-Page_v" />
<p id="i.i-p1">This edition<note anchored="yes" id="i.i-p1.1" n="1" place="end"><p class="endnote" id="i.i-p1.2">A note on the <i>edition</i>.</p></note> is a reprint.</p>
</div2>
</div1>

<ThML.head>
<electronicEdInfo>
  <authorID>clement_rome</authorID>
  <DC><DC.Title>First Epistle to the Corinthians</DC.Title></DC>
</electronicEdInfo>
</ThML.head>
<div1 id="ii" n="ii" title="CLEMENT OF ROME" shorttitle="CLEMENT OF ROME">
<p id="ii-p1">Intro text under the author heading.</p>
<div2 id="ii.i" n="i" title="Introductory Note to the First Epistle of Clement" shorttitle="Introductory Note">
<p id="ii.i-p1">Written by the editor.</p>
</div2>
<div2 id="ii.ii" n="ii" title="First Epistle to the Corinthians" shorttitle="First Epistle to the Corinthians">
<h2 id="ii.ii-p0.1">The First Epistle of Clement</h2>
<div3 id="ii.ii.i" n="i" title="Chapter I.—The salutation." shorttitle="Chapter I.—The salutation.">
<pb n="5" href="/ccel/schaff/anf01/Page_5.html" id="ii.ii.i-Page_5" />
<p id="ii.ii.i-p1">The church of God <scripRef id="ii.ii.i-p1.1" osisRef="Bible:1Cor.1.2" parsed="|1Cor|1|2|0|0" passage="1 Cor. i. 2">sojourning at Rome</scripRef>, and see <scripRef id="ii.ii.i-p1.2" osisRef="Bible:1Pet.5.1-1Pet.5.5" passage="1 Pet. v. 1-5">1 Pet. v. 1-5</scripRef>.</p>
<index id="ii.ii.i-p1.3" subject1="Clement" type="subject" />
<p id="ii.ii.i-p2">The <span class="sc" id="ii.ii.i-p2.1">ms.</span> reads <i>thus</i>.<note anchored="yes" id="ii.ii.i-p2.2" n="2" place="end"><p class="endnote" id="ii.ii.i-p2.3">Greek differs.</p></note></p>
</div3>
<div3 id="ii.ii.ii" n="ii" title="Chapter II.—Humility." shorttitle="Chapter II.—Humility.">
<pb n="6" href="/ccel/schaff/anf01/Page_6.html" id="ii.ii.ii-Page_6" />
<p id="ii.ii.ii-p1">See <scripRef id="ii.ii.ii-p1.1" osisRef="Bible:Ps.23" passage="Ps. xxiii">Psalm 23</scripRef>, <scripRef id="ii.ii.ii-p1.2" osisRef="Bible:Sir.1.1" passage="Ecclus. i. 1">Ecclus. i. 1</scripRef> and <scripRef id="ii.ii.ii-p1.3" osisRef="garbage" passage="oops">oops</scripRef>.</p>
</div3>
</div2>
</div1>

<ThML.head>
<electronicEdInfo>
  <authorID>ignatius</authorID>
  <DC><DC.Title>Epistle of Barnabas</DC.Title></DC>
</electronicEdInfo>
</ThML.head>
<div1 id="vi" n="vi" title="BARNABAS" shorttitle="BARNABAS">
<div2 id="vi.ii" n="ii" title="The Epistle of Barnabas" shorttitle="The Epistle of Barnabas">
<p id="vi.ii-p1">Barnabas wrote of the covenant.</p>
</div2>
</div1>

<div1 id="ix" n="ix" title="IRENÆUS" shorttitle="IRENÆUS">
<div2 id="ix.i" n="i" title="Introductory Note to Irenæus Against Heresies" shorttitle="Introductory Note">
<p id="ix.i-p1">Editorial introduction to Irenæus.</p>
</div2>
<ThML.head>
<electronicEdInfo>
  <authorID>irenaeus</authorID>
  <DC><DC.Title>Against Heresies: Book III</DC.Title></DC>
</electronicEdInfo>
</ThML.head>
<div2 id="ix.ii" n="ii" title="Against Heresies: Book III" shorttitle="Against Heresies: Book III">
<div3 id="ix.ii.i" n="i" title="Preface." shorttitle="Preface.">
<pb n="414" href="/ccel/schaff/anf01/Page_414.html" id="ix.ii.i-Page_414" />
<p id="ix.ii.i-p1">Preface of Irenæus to the third book.</p>
</div3>
<div3 id="ix.ii.ii" n="ii" title="Chapter III.—Apostolic succession." shorttitle="Chapter III.—Apostolic succession.">
<pb n="415" href="/ccel/schaff/anf01/Page_415.html" id="ix.ii.ii-Page_415" />
<p id="ix.ii.ii-p1">The tradition of succession; see <scripRef id="ix.ii.ii-p1.1" osisRef="Bible:Rom.16.3-Rom.16.4" passage="Rom. xvi. 3">Rom. 16:3</scripRef> and <scripRef id="ix.ii.ii-p1.2" osisRef="Bible:Isa.64.4 Bible:1Cor.2.9" passage="Isa. lxiv. 4; 1 Cor. ii. 9">Isa. 64:4; 1 Cor. 2:9</scripRef>.</p>
</div3>
</div2>
</div1>

</ThML.body>
</ThML>
`

/** An NPNF-style volume (code 'npnf101'): div1s are works, no contained-work heads (the volume
 *  names a single DC.Creator author), page breaks that carry the page only in id/href,
 *  place="foot" notes, a scripRef inside a note, and a mid-paragraph page break. */
export const NPNF_MINI = `<?xml version="1.0" encoding="UTF-8"?>
<ThML>
<ThML.head>
<electronicEdInfo>
  <publisherID>ccel</publisherID>
  <authorID>schaff</authorID>
  <bookID>npnf101</bookID>
  <DC>
    <DC.Title>NPNF1-01. The Confessions and Letters of St. Augustine,
with a Sketch of his Life and Work</DC.Title>
    <DC.Title sub="short">NPNF (V1-01)</DC.Title>
    <DC.Creator scheme="short-form" sub="Editor">Philip Schaff</DC.Creator>
    <DC.Creator scheme="ccel" sub="Editor">schaff</DC.Creator>
    <DC.Creator scheme="ccel" sub="Author">augustine</DC.Creator>
  </DC>
</electronicEdInfo>
</ThML.head>
<ThML.body xml:space="preserve">
<div1 id="ii" progress="0.18%" shorttitle="" title="Preface"><pb href="/ccel/schaff/npnf101/Page_v.html" id="ii-Page_v" />
<p id="ii-p1">Preface by the editor.</p>
</div1>
<div1 id="vi" progress="4.42%" shorttitle="" title="The Confessions"><pb href="/ccel/schaff/npnf101/Page_27.html" id="vi-Page_27" />
<div2 id="vi.i" shorttitle="" title="Book I">
<div3 id="vi.i.i" shorttitle="" title="Chapter I.—Great art Thou.">
<p id="vi.i.i-p1">Great art Thou, O Lord<note anchored="yes" id="vi.i.i-p1.1" n="1" place="foot"><p class="endnote" id="vi.i.i-p1.2">Cf. <scripRef id="vi.i.i-p1.3" osisRef="Bible:Ps.145.3" passage="Ps. cxlv. 3">Ps. cxlv. 3</scripRef>.</p></note>, and greatly to be praised.<pb n="28" href="/ccel/schaff/npnf101/Page_28.html" id="vi.i.i-Page_28" /> Thou awakest us to delight in Thy praise; <scripRef id="vi.i.i-p1.4" osisRef="Bible:1Cor.1.2" passage="1 Cor. i. 2">saints</scripRef>.</p>
</div3>
</div2>
</div1>
</ThML.body>
</ThML>
`
