import { deflateRawSync } from 'zlib'
import { describe, expect, it } from 'vitest'
import { extractFromZip, myBibleHtmlToText, parseMyBibleCommentaries, type MyBibleRow } from './mybible'

const row = (book: number, chapter: number, verse: number, text: string, to?: [number, number]): MyBibleRow => ({
  book_number: book,
  chapter_number_from: chapter,
  verse_number_from: verse,
  chapter_number_to: to ? to[0] : chapter,
  verse_number_to: to ? to[1] : verse,
  text
})

describe('myBibleHtmlToText', () => {
  it('turns paragraphs and breaks into plain-text lines and decodes entities', () => {
    expect(myBibleHtmlToText('<p>One &amp; two</p><p>Three<br/>four &#8212; <i>five</i></p>')).toBe(
      'One & two\n\nThree\nfour — five'
    )
  })

  it('keeps Greek and curly quotes untouched', () => {
    expect(myBibleHtmlToText('<p>The term ἐκκλησία, “church”</p>')).toBe('The term ἐκκλησία, “church”')
  })
})

describe('parseMyBibleCommentaries', () => {
  it('maps book numbers to USFM codes and keys each row to its verse', () => {
    const chunks = parseMyBibleCommentaries([row(530, 1, 1, '<p>Paul</p>'), row(470, 2, 3, '<p>Magi</p>')])
    expect(chunks.map((c) => [c.book, c.chapterStart, c.verseStart, c.headerRaw])).toEqual([
      ['MAT', 2, 3, '2:3'],
      ['1CO', 1, 1, '1:1']
    ])
  })

  it('sorts rows into canonical order whatever order the module stores them in', () => {
    const chunks = parseMyBibleCommentaries([row(530, 2, 1, 'b'), row(530, 1, 16, 'a'), row(520, 1, 1, 'r')])
    expect(chunks.map((c) => `${c.book} ${c.chapterStart}:${c.verseStart}`)).toEqual(['ROM 1:1', '1CO 1:16', '1CO 2:1'])
  })

  it('folds a chapter introduction (verse 0) into that chapter’s first verse comment', () => {
    const chunks = parseMyBibleCommentaries([
      row(530, 10, 0, '<p>CHAPTER X</p>'),
      row(530, 10, 1, '<p>Verse one</p>'),
      row(530, 10, 2, '<p>Verse two</p>')
    ])
    expect(chunks).toHaveLength(2)
    expect(chunks[0]).toMatchObject({ chapterStart: 10, verseStart: 1, text: 'CHAPTER X\n\nVerse one' })
  })

  it('merges a book introduction with chapter 1’s introduction ahead of 1:1', () => {
    const chunks = parseMyBibleCommentaries([
      row(520, 1, 1, 'v1'),
      row(520, 1, 0, 'chapter intro'),
      row(520, 0, 0, 'book intro')
    ])
    expect(chunks).toEqual([expect.objectContaining({ verseStart: 1, text: 'book intro\n\nchapter intro\n\nv1' })])
  })

  it('keys an introduction to verse 1 by itself when the chapter has no verse-1 comment', () => {
    // Lenski on Matthew 1: verse 1 is discussed in the chapter introduction; the rows resume at 1:2.
    const chunks = parseMyBibleCommentaries([row(470, 1, 0, 'intro covering v1'), row(470, 1, 2, 'v2')])
    expect(chunks.map((c) => [c.chapterStart, c.verseStart, c.text])).toEqual([
      [1, 1, 'intro covering v1'],
      [1, 2, 'v2']
    ])
  })

  it('gives an introduction with no verse comments after it its own excerpt at verse 1', () => {
    const chunks = parseMyBibleCommentaries([row(530, 1, 1, 'v1'), row(530, 2, 0, 'lonely intro'), row(540, 1, 1, 'next book')])
    expect(chunks.map((c) => [c.book, c.chapterStart, c.verseStart, c.text])).toEqual([
      ['1CO', 1, 1, 'v1'],
      ['1CO', 2, 1, 'lonely intro'],
      ['2CO', 1, 1, 'next book']
    ])
  })

  it('keeps verse ranges and collapses a missing or backwards end to one verse', () => {
    const chunks = parseMyBibleCommentaries([
      row(520, 3, 21, 'range', [3, 26]),
      row(520, 3, 27, 'cross', [4, 2]),
      row(520, 5, 1, 'no end', [0, 0]),
      row(520, 6, 5, 'backwards', [6, 2])
    ])
    expect(chunks.map((c) => c.headerRaw)).toEqual(['3:21-26', '3:27-4:2', '5:1', '6:5'])
    expect(chunks[1]).toMatchObject({ chapterEnd: 4, verseEnd: 2 })
    expect(chunks[3]).toMatchObject({ chapterEnd: 6, verseEnd: 5 })
  })

  it('skips unknown (deuterocanonical) books and empty comments', () => {
    expect(parseMyBibleCommentaries([row(170, 1, 1, 'Tobit'), row(470, 1, 1, '<p> </p>')])).toEqual([])
  })
})

describe('parseMyBibleCommentaries with passageComments', () => {
  const verseCounts = { GEN: [31, 25] }

  it('stretches each passage comment to the verse before the next, and the last to the chapter end', () => {
    const chunks = parseMyBibleCommentaries(
      [row(10, 1, 1, 'In the beginning'), row(10, 1, 2, 'The First Day'), row(10, 1, 6, 'The Second Day'), row(10, 1, 24, 'The Sixth Day')],
      { passageComments: true, verseCounts }
    )
    expect(chunks.map((c) => c.headerRaw)).toEqual(['1:1', '1:2-5', '1:6-23', '1:24-31'])
    expect(chunks[1]).toMatchObject({ verseStart: 2, verseEnd: 5, chapterEnd: 1 })
  })

  it('leaves explicit ranges, and verses past the versification, alone', () => {
    const chunks = parseMyBibleCommentaries(
      [row(10, 2, 1, 'range', [2, 3]), row(10, 2, 26, 'beyond the chapter')],
      { passageComments: true, verseCounts }
    )
    expect(chunks.map((c) => c.headerRaw)).toEqual(['2:1-3', '2:26'])
  })

  it('is off by default, for modules of sparse notes', () => {
    const chunks = parseMyBibleCommentaries([row(500, 3, 16, 'Luther on 3:16')], { verseCounts: { JHN: [51, 25, 36] } })
    expect(chunks[0].headerRaw).toBe('3:16')
  })
})

/** A minimal single-entry zip, built the way real archivers lay one out. */
function makeZip(name: string, content: Buffer, method: 0 | 8): Buffer {
  const data = method === 8 ? deflateRawSync(content) : content
  const nameBuf = Buffer.from(name)
  const local = Buffer.alloc(30)
  local.writeUInt32LE(0x04034b50, 0)
  local.writeUInt16LE(method, 8)
  local.writeUInt32LE(data.length, 18)
  local.writeUInt32LE(content.length, 22)
  local.writeUInt16LE(nameBuf.length, 26)
  const central = Buffer.alloc(46)
  central.writeUInt32LE(0x02014b50, 0)
  central.writeUInt16LE(method, 10)
  central.writeUInt32LE(data.length, 20)
  central.writeUInt32LE(content.length, 24)
  central.writeUInt16LE(nameBuf.length, 28)
  central.writeUInt32LE(0, 42)
  const cdOffset = local.length + nameBuf.length + data.length
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(1, 8)
  eocd.writeUInt16LE(1, 10)
  eocd.writeUInt32LE(central.length + nameBuf.length, 12)
  eocd.writeUInt32LE(cdOffset, 16)
  return Buffer.concat([local, nameBuf, data, central, nameBuf, eocd])
}

describe('extractFromZip', () => {
  const content = Buffer.from('SQLite format 3\0 and then some module bytes'.repeat(20))

  it('inflates a deflated entry', () => {
    const out = extractFromZip(makeZip('SI-LENSKI.commentaries.SQLite3', content, 8), (n) => /\.sqlite3$/i.test(n))
    expect(out.name).toBe('SI-LENSKI.commentaries.SQLite3')
    expect(out.data.equals(content)).toBe(true)
  })

  it('reads a stored entry', () => {
    expect(extractFromZip(makeZip('a.SQLite3', content, 0), () => true).data.equals(content)).toBe(true)
  })

  it('throws when nothing matches or the data is not a zip', () => {
    expect(() => extractFromZip(makeZip('readme.txt', content, 0), (n) => n.endsWith('.SQLite3'))).toThrow(/No matching/)
    expect(() => extractFromZip(Buffer.from('not a zip at all, just some bytes here'), () => true)).toThrow(/Not a zip/)
  })
})
