import { describe, expect, it } from 'vitest'
import {
  BOC_DOCUMENTS, bocDocument, documentCodeFromName, parseBocRef, formatBocRef,
  bocRowMatches, bocSectionMatches, fromRoman, parseBocQuery, pickBocSection, toRoman
} from './bookOfConcord'

describe('BOC_DOCUMENTS', () => {
  it('lists all 13 documents in nav order with unique codes and 1..13 sortOrder', () => {
    expect(BOC_DOCUMENTS.map((d) => d.code)).toEqual([
      'PREF','CR','AC','AP','SA','TR','SC','LC','FC-EP','FC-SD','CT','BEC','SVA'
    ])
    expect(new Set(BOC_DOCUMENTS.map((d) => d.code)).size).toBe(13)
    expect(BOC_DOCUMENTS.map((d) => d.sortOrder)).toEqual([...Array(13)].map((_, i) => i + 1))
  })
  it('flags the documents the site presents as a single page', () => {
    expect(BOC_DOCUMENTS.filter((d) => d.singleSection).map((d) => d.code)).toEqual(['PREF', 'TR', 'CT', 'BEC'])
  })
  it('puts the three appendices last', () => {
    expect(BOC_DOCUMENTS.slice(-3).map((d) => d.code)).toEqual(['CT','BEC','SVA'])
  })
})

describe('helpers', () => {
  it('looks up a document definition by code', () => {
    expect(bocDocument('AC')?.title).toBe('The Augsburg Confession')
    expect(bocDocument('ZZ')).toBeUndefined()
  })
  it('resolves a document by title, abbreviation, code, or Reader\'s Edition heading spelling', () => {
    expect(documentCodeFromName('Augsburg Confession')).toBe('AC')
    expect(documentCodeFromName('augsburg confession')).toBe('AC')
    expect(documentCodeFromName('Preface to the Book of Concord')).toBe('PREF')
    expect(documentCodeFromName('Preface to the Christian Book of Concord')).toBe('PREF')
    expect(documentCodeFromName('AC')).toBe('AC')
    expect(documentCodeFromName('The Augsburg Confession (1530)')).toBe('AC')
    expect(documentCodeFromName('The Three Universal or Ecumenical Creeds')).toBe('CR')
    expect(documentCodeFromName('Catalog of Testimonies')).toBe('CT')
    expect(documentCodeFromName('nonsense')).toBeUndefined()
  })
  it('round-trips a ref string', () => {
    expect(formatBocRef('AC', 4)).toBe('AC:4')
    expect(parseBocRef('AC:4')).toEqual({ code: 'AC', ordinal: 4 })
    expect(parseBocRef('AC:0')).toBeNull()
    expect(parseBocRef('ZZ:4')).toBeNull()
    expect(parseBocRef('garbage')).toBeNull()
  })
})

describe('parseBocQuery (omnibox)', () => {
  it.each([
    ['AC IV', [{ code: 'AC', article: 'IV' }]],
    ['ac iv', [{ code: 'AC', article: 'IV' }]],
    ['ac 4', [{ code: 'AC', article: 'IV' }]],
    ['AC art. 28', [{ code: 'AC', article: 'XXVIII' }]],
    ['Augsburg Confession 4', [{ code: 'AC', article: 'IV' }]],
    ['apol iv', [{ code: 'AP', article: 'IV' }]],
    ['Ap. IV', [{ code: 'AP', article: 'IV' }]],
    ['sa', [{ code: 'SA' }]],
    ['lc', [{ code: 'LC' }]],
    ['sc', [{ code: 'SC' }]],
    ['tr', [{ code: 'TR' }]],
    ['fc sd x', [{ code: 'FC-SD', article: 'X' }]],
    ['FC-SD 10', [{ code: 'FC-SD', article: 'X' }]],
    ['fc ep iii', [{ code: 'FC-EP', article: 'III' }]],
    ['fc x', [{ code: 'FC-EP', article: 'X' }, { code: 'FC-SD', article: 'X' }]],
    ['nicene', [{ code: 'CR', section: 'Nicene' }]],
    ['Apostles’ Creed', [{ code: 'CR', section: 'Apostles' }]],
    ['creeds', [{ code: 'CR' }]]
  ])('%s', (q, expected) => {
    expect(parseBocQuery(q)).toEqual(expected)
  })

  it.each(['', 'acts 4', 'rom 3:28', 'ac iiii', 'ac 0', 'justification', 'ac 4:2'])('rejects %s', (q) => {
    expect(parseBocQuery(q)).toEqual([])
  })
})

describe('roman numerals', () => {
  it('converts both ways', () => {
    expect(toRoman(4)).toBe('IV')
    expect(toRoman(28)).toBe('XXVIII')
    expect(fromRoman('xxviii')).toBe(28)
    expect(fromRoman('IIII')).toBeNull()
    expect(fromRoman('abc')).toBeNull()
  })
})

describe('bocSectionMatches', () => {
  it('matches verbatim section numbers, including dual numbering and arabic', () => {
    expect(bocSectionMatches('IV', 'IV')).toBe(true)
    expect(bocSectionMatches('II (I)', 'II')).toBe(true)
    expect(bocSectionMatches('4', 'IV')).toBe(true)
    expect(bocSectionMatches('IV', 'V')).toBe(false)
    expect(bocSectionMatches(null, 'I')).toBe(false)
  })
})

describe('bocRowMatches (sections as bookofconcord.cph.org numbers them)', () => {
  const row = (number: string | null, label: string): { number: string | null; label: string } => ({ number, label })
  it('matches the number, including dual numbering, joined and lettered articles', () => {
    expect(bocRowMatches(row('IV', 'Justification'), 'IV')).toBe(true)
    expect(bocRowMatches(row('IV (II)', 'Justification'), 'IV')).toBe(true)
    expect(bocRowMatches(row('IV (II)', 'Justification'), 'II')).toBe(false)
    expect(bocRowMatches(row('VII and VIII (IV)', 'The Church'), 'VIII')).toBe(true)
    expect(bocRowMatches(row('XIIa (V)', 'Repentance'), 'XII')).toBe(true)
  })
  it('falls back to a numeral leading the label', () => {
    expect(bocRowMatches(row(null, 'X. Church Practices'), 'X')).toBe(true)
    expect(bocRowMatches(row(null, 'II. The Creed'), 'II')).toBe(true)
    expect(bocRowMatches(row(null, 'Article II'), 'II')).toBe(true)
    expect(bocRowMatches(row(null, 'Introduction'), 'I')).toBe(false)
    expect(bocRowMatches(row(null, 'Civil Government'), 'C')).toBe(false)
    expect(bocRowMatches(row(null, 'Preface'), 'I')).toBe(false)
  })
})

// Section numbers and labels as the rebuilt corpus has them: one section per page of
// bookofconcord.cph.org, in its menu order (tools/boc-cph-web-to-md.mjs, splitNavLabel).
const SITE_SECTIONS: Record<string, { ordinal: number; number: string | null; label: string }[]> = {
  'CR': [
    { ordinal: 1, number: null, label: "The Apostles' Creed" },
    { ordinal: 2, number: null, label: "The Nicene Creed" },
    { ordinal: 3, number: null, label: "The Athanasian Creed" },
  ],
  'AC': [
    { ordinal: 1, number: null, label: "Preface" },
    { ordinal: 2, number: 'I', label: "God" },
    { ordinal: 3, number: 'II', label: "Original Sin" },
    { ordinal: 4, number: 'III', label: "The Son of God" },
    { ordinal: 5, number: 'IV', label: "Justification" },
    { ordinal: 6, number: 'V', label: "The Ministry" },
    { ordinal: 7, number: 'VI', label: "New Obedience" },
    { ordinal: 8, number: 'VII', label: "The Church" },
    { ordinal: 9, number: 'VIII', label: "What the Church Is" },
    { ordinal: 10, number: 'IX', label: "Baptism" },
    { ordinal: 11, number: 'X', label: "The Lord's Supper" },
    { ordinal: 12, number: 'XI', label: "Confession" },
    { ordinal: 13, number: 'XII', label: "Repentance" },
    { ordinal: 14, number: 'XIII', label: "The Use of the Sacraments" },
    { ordinal: 15, number: 'XIV', label: "Order in the Church" },
    { ordinal: 16, number: 'XV', label: "Church Ceremonies" },
    { ordinal: 17, number: 'XVI', label: "Civil Government" },
    { ordinal: 18, number: 'XVII', label: "Christ's Return for Judgment" },
    { ordinal: 19, number: 'XVIII', label: "Free Will" },
    { ordinal: 20, number: 'XIX', label: "The Cause of Sin" },
    { ordinal: 21, number: 'XX', label: "Good Works" },
    { ordinal: 22, number: 'XXI', label: "Worship of the Saints" },
    { ordinal: 23, number: null, label: "A Summary Statement" },
    { ordinal: 24, number: null, label: "A Review of the Various Abuses That Have Been Corrected" },
    { ordinal: 25, number: 'XXII', label: "Both Kinds in the Sacrament" },
    { ordinal: 26, number: 'XXIII', label: "The Marriage of Priests" },
    { ordinal: 27, number: 'XXIV', label: "The Mass" },
    { ordinal: 28, number: 'XXV', label: "Confession" },
    { ordinal: 29, number: 'XXVI', label: "The Distinction of Meats" },
    { ordinal: 30, number: 'XXVII', label: "Monastic Vows" },
    { ordinal: 31, number: 'XXVIII', label: "Church Authority" },
    { ordinal: 32, number: null, label: "Conclusion" },
  ],
  'AP': [
    { ordinal: 1, number: null, label: "Foreword" },
    { ordinal: 2, number: 'I', label: "God" },
    { ordinal: 3, number: 'II (I)', label: "Original Sin" },
    { ordinal: 4, number: 'III', label: "Christ" },
    { ordinal: 5, number: 'IV (II)', label: "Justification" },
    { ordinal: 6, number: 'V (III)', label: "Love and Fulfilling the Law" },
    { ordinal: 7, number: 'VII and VIII (IV)', label: "The Church" },
    { ordinal: 8, number: 'IX', label: "Baptism" },
    { ordinal: 9, number: 'X', label: "The Holy Supper" },
    { ordinal: 10, number: 'XI', label: "Confession" },
    { ordinal: 11, number: 'XIIa (V)', label: "Repentance" },
    { ordinal: 12, number: 'XIIb (VI)', label: "Confession and Satisfaction" },
    { ordinal: 13, number: 'XIII (VII)', label: "The Number and Use of the Sacraments" },
    { ordinal: 14, number: 'XIV', label: "Order in the Church" },
    { ordinal: 15, number: 'XV (VIII)', label: "Human Traditions in the Church" },
    { ordinal: 16, number: 'XVI', label: "Political Order" },
    { ordinal: 17, number: 'XVII', label: "Christ's Return for Judgment" },
    { ordinal: 18, number: 'XVIII', label: "Free Will" },
    { ordinal: 19, number: 'XIX', label: "The Cause of Sin" },
    { ordinal: 20, number: 'XX', label: "Good Works" },
    { ordinal: 21, number: 'XXI (IX)', label: "The Invocation of Saints" },
    { ordinal: 22, number: 'XXII (X)', label: "Both Kinds in the Lord's Supper" },
    { ordinal: 23, number: 'XXIII (XI)', label: "The Marriage of Priests" },
    { ordinal: 24, number: 'XXIV (XII)', label: "The Mass" },
    { ordinal: 25, number: 'XXVII (XIII)', label: "Monastic Vows" },
    { ordinal: 26, number: 'XXVIII (XIV)', label: "Church Authority" },
  ],
  'SA': [
    { ordinal: 1, number: null, label: "Preface of Dr. Martin Luther" },
    { ordinal: 2, number: null, label: "The First Part" },
    { ordinal: 3, number: 'I', label: "The Chief Article" },
    { ordinal: 4, number: 'II', label: "The Mass" },
    { ordinal: 5, number: 'III', label: "Chapters and Cloisters" },
    { ordinal: 6, number: 'IV', label: "The Papacy" },
    { ordinal: 7, number: 'I', label: "Sin" },
    { ordinal: 8, number: 'II', label: "The Law" },
    { ordinal: 9, number: 'III', label: "Repentance" },
    { ordinal: 10, number: 'IV', label: "The Gospel" },
    { ordinal: 11, number: 'V', label: "Baptism" },
    { ordinal: 12, number: 'VI', label: "The Sacrament of the Altar" },
    { ordinal: 13, number: 'VII', label: "The Keys" },
    { ordinal: 14, number: 'VIII', label: "Confession" },
    { ordinal: 15, number: 'IX', label: "Excommunication" },
    { ordinal: 16, number: 'X', label: "Ordination and the Call" },
    { ordinal: 17, number: 'XI', label: "The Marriage of Priests" },
    { ordinal: 18, number: 'XII', label: "The Church" },
    { ordinal: 19, number: 'XIII', label: "How One Is Justified Before God and Does Good Works" },
    { ordinal: 20, number: 'XIV', label: "Monastic Vows" },
    { ordinal: 21, number: 'XV', label: "Human Traditions" },
    { ordinal: 22, number: null, label: "Subscription of Christian Doctrine" },
  ],
  'SC': [
    { ordinal: 1, number: null, label: "Preface of Dr. Martin Luther" },
    { ordinal: 2, number: null, label: "I. The Ten Commandments" },
    { ordinal: 3, number: null, label: "II. The Creed" },
    { ordinal: 4, number: null, label: "III. The Lord's Prayer" },
    { ordinal: 5, number: null, label: "IV. The Sacrament of Holy Baptism" },
    { ordinal: 6, number: null, label: "V. How the Unlearned Should Be Taught to Confess" },
    { ordinal: 7, number: null, label: "VI. The Sacrament of the Altar" },
    { ordinal: 8, number: null, label: "Daily Prayer" },
    { ordinal: 9, number: null, label: "Table of Duties" },
  ],
  'LC': [
    { ordinal: 1, number: null, label: "Preface" },
    { ordinal: 2, number: null, label: "Short Preface of Dr. Martin Luther" },
    { ordinal: 3, number: null, label: "The First Commandment" },
    { ordinal: 4, number: null, label: "The Second Commandment" },
    { ordinal: 5, number: null, label: "The Third Commandment" },
    { ordinal: 6, number: null, label: "The Fourth Commandment" },
    { ordinal: 7, number: null, label: "The Fifth Commandment" },
    { ordinal: 8, number: null, label: "The Sixth Commandment" },
    { ordinal: 9, number: null, label: "The Seventh Commandment" },
    { ordinal: 10, number: null, label: "The Eighth Commandment" },
    { ordinal: 11, number: null, label: "The Ninth and Tenth Commandments" },
    { ordinal: 12, number: null, label: "Conclusion of the Ten Commandments" },
    { ordinal: 13, number: null, label: "Part 2: The Apostles' Creed" },
    { ordinal: 14, number: null, label: "Article I" },
    { ordinal: 15, number: null, label: "Article II" },
    { ordinal: 16, number: null, label: "Article III" },
    { ordinal: 17, number: null, label: "Part 3: The Lord's Prayer" },
    { ordinal: 18, number: null, label: "The First Petition" },
    { ordinal: 19, number: null, label: "The Second Petition" },
    { ordinal: 20, number: null, label: "The Third Petition" },
    { ordinal: 21, number: null, label: "The Fourth Petition" },
    { ordinal: 22, number: null, label: "The Fifth Petition" },
    { ordinal: 23, number: null, label: "The Sixth Petition" },
    { ordinal: 24, number: null, label: "The Seventh and Last Petition" },
    { ordinal: 25, number: null, label: "Part 4: Baptism" },
    { ordinal: 26, number: null, label: "Part 5: The Sacrament Of The Altar" },
  ],
  'FC-EP': [
    { ordinal: 1, number: null, label: "The Summary Content, Rule, and Norm" },
    { ordinal: 2, number: null, label: "I. Original Sin" },
    { ordinal: 3, number: null, label: "II. Free Will" },
    { ordinal: 4, number: null, label: "III. The Righteousness of Faith Before God" },
    { ordinal: 5, number: null, label: "IV. Good Works" },
    { ordinal: 6, number: null, label: "V. The Law and the Gospel" },
    { ordinal: 7, number: null, label: "VI. The Third Use of God's Law" },
    { ordinal: 8, number: null, label: "VII. The Holy Supper of Christ" },
    { ordinal: 9, number: null, label: "VIII. The Person of Christ" },
    { ordinal: 10, number: null, label: "IX. The Descent of Christ to Hell" },
    { ordinal: 11, number: null, label: "X. Church Practices" },
    { ordinal: 12, number: null, label: "XI. God's Eternal Foreknowledge and Election" },
    { ordinal: 13, number: null, label: "XII. Other Factions and Sects" },
  ],
  'FC-SD': [
    { ordinal: 1, number: null, label: "Preface" },
    { ordinal: 2, number: null, label: "The Comprehensive Summary, Foundation, Rule, and Norm" },
    { ordinal: 3, number: null, label: "I. Original Sin" },
    { ordinal: 4, number: null, label: "II. Free Will or Human Powers" },
    { ordinal: 5, number: null, label: "III. The Righteousness of Faith Before God" },
    { ordinal: 6, number: null, label: "IV. Good Works" },
    { ordinal: 7, number: null, label: "V. The Law and the Gospel" },
    { ordinal: 8, number: null, label: "VI. The Third Use of God's Law" },
    { ordinal: 9, number: null, label: "VII. The Holy Supper" },
    { ordinal: 10, number: null, label: "VIII. The Person of Christ" },
    { ordinal: 11, number: null, label: "IX. The Descent of Christ to Hell" },
    { ordinal: 12, number: null, label: "X. Church Practices" },
    { ordinal: 13, number: null, label: "XI. God's Eternal Foreknowledge and Election" },
    { ordinal: 14, number: null, label: "XII. Other Factions and Sects" },
  ],
}

describe('omnibox Confessions queries against the rebuilt corpus', () => {
  const resolve = (q: string): { code: string; ordinal?: number; label?: string } | null => {
    const hit = parseBocQuery(q)[0]
    if (!hit) return null
    const rows = SITE_SECTIONS[hit.code] ?? []
    const row = pickBocSection(rows, hit) ?? rows[0]
    return { code: hit.code, ordinal: row?.ordinal, label: row?.label }
  }
  it.each([
    ['ac iv', 'AC', 5, 'Justification'],
    ['ac 4', 'AC', 5, 'Justification'],
    ['AC XXVIII', 'AC', 31, 'Church Authority'],
    ['apol iv', 'AP', 5, 'Justification'],
    ['ap viii', 'AP', 7, 'The Church'],
    ['ap xii', 'AP', 11, 'Repentance'],
    ['fc sd x', 'FC-SD', 12, 'X. Church Practices'],
    ['fc ep i', 'FC-EP', 2, 'I. Original Sin'],
    ['sa', 'SA', 1, 'Preface of Dr. Martin Luther'],
    ['lc', 'LC', 1, 'Preface'],
    ['sc', 'SC', 1, 'Preface of Dr. Martin Luther'],
    ['sc ii', 'SC', 3, 'II. The Creed'],
    ['nicene', 'CR', 2, 'The Nicene Creed'],
    ['athanasian creed', 'CR', 3, 'The Athanasian Creed']
  ])('%s', (q, code, ordinal, label) => {
    expect(resolve(q)).toEqual({ code, ordinal, label })
  })
})
