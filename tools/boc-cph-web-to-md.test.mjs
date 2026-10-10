import { describe, expect, it } from 'vitest'
import {
  alignDocument, codeForPath, inlineText, parseContractMd, parseNav, parsePage, renderContractMd, restructureSva, splitNavLabel
} from './boc-cph-web-to-md.mjs'

const NAV = `<nav><ul>
<li class="document"><a href="/en/preface">Preface to the Christian Book of Concord</a></li>
<li class="document"><input type="checkbox" /><label class="mobile-toc-toggle"><span>The Augsburg Confession</span><span class="mobile-toc-chevron"></span></label><ul>
  <li><a href="/en/augsburg-confession/preface">Preface</a></li>
  <li><span>Chief Articles of Faith</span><ul>
    <li><a href="/en/augsburg-confession/chief_articles/article_i">Article I</a></li>
  </ul></li>
  <li><a href="/en/augsburg-confession/abuses">A Review of the Various Abuses</a><ul>
    <li><a href="/en/augsburg-confession/abuses/article_xxii">Article XXII</a></li>
  </ul></li>
</ul></li>
<li class="document"><a href="/en/about">About This Edition</a></li>
</ul></nav><main>`

const PAGE = `<main><article class="prose" data-copy-target="article">
<header><div>The Augsburg Confession</div><div>Chief Articles of Faith</div></header>
<h1 class="article-title group" id="x"><span class="article-number"><button type="button">x</button>Article IV</span>
<span class="article-name">Justification</span></h1>
<p class="indent group" id="paragraph-1"><button type="button"><svg></svg></button><strong class="paragraph-number">[1]</strong> Our churches teach that people cannot be justified for Christ&#8217;s sake <em>by works</em>.</p>
<h2 class="group">Affirmative</h2>
<div class="block"><p class="nonindent group">A quoted<br>line.</p></div>
</article>`

describe('codeForPath', () => {
  it('maps site slugs, with the three creeds as one document', () => {
    expect(codeForPath('/en/preface')).toBe('PREF')
    expect(codeForPath('/en/ecumenical-creeds/nicene-creed')).toBe('CR')
    expect(codeForPath('/en/augsburg-confession/chief_articles/article_iv')).toBe('AC')
    expect(codeForPath('/en/about')).toBeNull()
  })
})

describe('parseNav', () => {
  it('lists pages in order with the enclosing nav group as the part', () => {
    expect(parseNav(NAV)).toEqual([
      { path: '/en/preface', code: 'PREF', label: 'Preface to the Christian Book of Concord', part: null },
      { path: '/en/augsburg-confession/preface', code: 'AC', label: 'Preface', part: null },
      { path: '/en/augsburg-confession/chief_articles/article_i', code: 'AC', label: 'Article I', part: 'Chief Articles of Faith' },
      { path: '/en/augsburg-confession/abuses', code: 'AC', label: 'A Review of the Various Abuses', part: null },
      { path: '/en/augsburg-confession/abuses/article_xxii', code: 'AC', label: 'Article XXII', part: 'A Review of the Various Abuses' }
    ])
  })
})

describe('parsePage', () => {
  it('splits the article heading into number/label and flattens the body to plain paragraphs', () => {
    expect(parsePage(PAGE)).toEqual({
      number: 'IV',
      label: 'Justification',
      text: '[1] Our churches teach that people cannot be justified for Christ’s sake by works.\n\n### Affirmative\n\nA quoted line.'
    })
  })
  it('uses the whole h1 as the label when there is no article number', () => {
    const page = parsePage('<article data-copy-target="article"><h1 class="group">\nI. The Ten Commandments</h1><p>You shall have no other gods.</p></article>')
    expect(page).toEqual({ number: null, label: 'I. The Ten Commandments', text: 'You shall have no other gods.' })
  })
})

describe('splitNavLabel', () => {
  it('splits "Article N. Name" menu labels and keeps everything else whole', () => {
    expect(splitNavLabel('Article XIIa (V). Repentance')).toEqual({ number: 'XIIa (V)', label: 'Repentance' })
    expect(splitNavLabel('Articles VII and VIII (IV). The Church')).toEqual({ number: 'VII and VIII (IV)', label: 'The Church' })
    expect(splitNavLabel('I. Original Sin')).toEqual({ number: null, label: 'I. Original Sin' })
    expect(splitNavLabel('Article I')).toEqual({ number: null, label: 'Article I' })
    expect(splitNavLabel('Foreward')).toEqual({ number: null, label: 'Foreword' })
  })
})

describe('inlineText', () => {
  it('decodes entities and collapses whitespace', () => {
    expect(inlineText('a&amp;b &lt;c&gt;\n  <em>d</em>&#x2019;')).toBe('a&b <c> d’')
  })
})

const words = (n, seed) => Array.from({ length: n }, (_, i) => `${seed}${String.fromCharCode(97 + (i % 26))}${String.fromCharCode(97 + Math.floor(i / 26))}`).join(' ')

describe('alignDocument', () => {
  const siteA = words(40, 'alpha')
  const siteB = words(40, 'beta')
  const newSecs = [
    { ordinal: 1, label: 'The Ten Commandments', text: `${siteA} ${siteB}` },
    { ordinal: 2, label: 'Christ', text: words(40, 'gamma') }
  ]

  it('folds several EPUB sections into the site section that contains their text', () => {
    const { map } = alignDocument([
      { ordinal: 1, label: 'Part heading', text: '' },
      { ordinal: 2, label: 'First', text: siteA },
      { ordinal: 3, label: 'Second', text: siteB }
    ], newSecs)
    expect(Object.fromEntries(map)).toEqual({ 1: 1, 2: 1, 3: 1 })
  })

  it('places editorial text by matching label, else by the next matched neighbour, and reports it', () => {
    const intro = { ordinal: 1, label: 'Editor’s Introduction', text: words(30, 'editorial') }
    const sidebar = { ordinal: 3, label: 'Christ', text: words(30, 'sidebar') }
    const { map, editorial } = alignDocument([intro, { ordinal: 2, label: 'First', text: siteA }, sidebar], newSecs)
    expect(map.get(1)).toBe(1)
    expect(map.get(3)).toBe(2)
    expect(editorial).toEqual([intro, sidebar])
  })
})

describe('restructureSva', () => {
  it('folds each "false doctrine" antithesis into its article, site-style', () => {
    const subjects = ['The Holy Supper', 'The Person of Christ', 'Holy Baptism', 'Predestination and Providence']
    const oldSecs = [
      ...subjects.map((label, i) => ({ ordinal: i + 1, number: ['I', 'II', 'III', 'IV'][i], label, part: null, text: `[1]Article ${i + 1}` })),
      ...['Holy Supper', 'Person of Christ', 'Holy Baptism', 'Predestination'].map((s, i) => ({
        ordinal: i + 5, number: null, label: `FALSE AND ERRONEOUS DOCTRINE OF THE CALVINISTS Concerning the ${s}:`, part: null, text: `Antithesis ${i + 1}`
      }))
    ]
    const { sections, map } = restructureSva(oldSecs)
    expect(sections).toHaveLength(4)
    expect(sections[1]).toEqual({
      ordinal: 2, number: 'II', label: 'The Person of Christ', part: null,
      text: '[1] Article 2\n\n### FALSE AND ERRONEOUS DOCTRINE OF THE CALVINISTS Concerning the Person of Christ\n\nAntithesis 2'
    })
    expect(Object.fromEntries(map)).toEqual({ 1: 1, 2: 2, 3: 3, 4: 4, 5: 1, 6: 2, 7: 3, 8: 4 })
  })
})

describe('parseContractMd', () => {
  it('folds the EPUB\'s per-creed documents into the Ecumenical Creeds, in site order', () => {
    const docs = parseContractMd("# Apostles' Creed\n## 1 |  | The Apostles' Creed | \nA\n# Nicene Creed\n## 1 |  | The Nicene Creed | \nN\n# Athanasian Creed\n## 1 |  | The Creed of Athanasius | \nT")
    expect([...docs.keys()]).toEqual(['CR'])
    expect(docs.get('CR').map((s) => [s.ordinal, s.text])).toEqual([[1, 'A'], [2, 'N'], [3, 'T']])
  })
})

describe('renderContractMd / parseContractMd', () => {
  it('round-trips the heading contract with canonical document titles', () => {
    const docs = new Map([['PREF', [{ ordinal: 1, number: null, label: 'Preface', part: null, text: '[1] Text.' }]],
      ['AC', [{ ordinal: 1, number: 'I', label: 'God', part: 'Chief Articles of Faith', text: '[1] One.' }]]])
    const md = renderContractMd(docs)
    expect(md.split('\n').slice(0, 3)).toEqual(['# Preface to the Christian Book of Concord', '', '## 1 |  | Preface | '])
    expect(parseContractMd(md)).toEqual(docs)
  })
})
