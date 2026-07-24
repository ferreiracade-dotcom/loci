import { describe, expect, it } from 'vitest'
import { assignParts } from './boc-parts.mjs'

function section(overrides) {
  return { number: null, label: '', part: null, body: [], ...overrides }
}

describe('assignParts', () => {
  it('treats an empty-body heading as a divider (existing behavior)', () => {
    const docsOut = new Map([
      ['SC', [
        section({ label: 'Preface', body: ['text'] }),
        section({ label: 'I. The Ten Commandments', body: [] }),
        section({ label: 'The First Commandment', body: ['text'] })
      ]]
    ])
    assignParts(docsOut)
    const [preface, divider, first] = docsOut.get('SC')
    expect(preface.part).toBeNull()
    expect(divider.part).toBeNull()
    expect(first.part).toBe('I. The Ten Commandments')
  })

  it('resets on a Roman-numeral-prefixed label even when it carries its own lead-in body text', () => {
    // Regression: Formula of Concord articles like "VII. The Holy Supper Of Christ" have their
    // own intro paragraph before "Status Of The Controversy", so the empty-body rule alone
    // wrongly kept them merged into the PRECEDING article's group.
    const docsOut = new Map([
      ['FC-EP', [
        section({ label: 'VI. The Third Use Of God’s Law', body: ['intro'] }),
        section({ label: 'Status Of The Controversy', body: ['text'] }),
        section({ label: 'VII. The Holy Supper Of Christ', body: ['intro'] }),
        section({ label: 'Status Of The Controversy', body: ['text'] }),
        section({ label: '[XII.] Other Factions And Sects', body: ['intro'] })
      ]]
    ])
    assignParts(docsOut)
    const [vi, viStatus, vii, viiStatus, xii] = docsOut.get('FC-EP')
    expect(vi.part).toBeNull()
    expect(viStatus.part).toBe('VI. The Third Use Of God’s Law')
    expect(vii.part).toBeNull()
    expect(viiStatus.part).toBe('VII. The Holy Supper Of Christ')
    expect(xii.part).toBeNull()
  })

  it('does not treat a numbered Article as a divider when it has its own `number` field (AC/Apology)', () => {
    // AC's real articles carry a separate `number` ("IV") with a plain-text label
    // ("Justification") — they must stay grouped under the preceding divider, never reset.
    const docsOut = new Map([
      ['AC', [
        section({ label: 'Chief Articles Of Faith', body: [] }),
        section({ number: 'IV', label: 'Justification', body: ['text'] }),
        section({ number: 'V', label: 'The Ministry', body: ['text'] })
      ]]
    ])
    assignParts(docsOut)
    const [divider, iv, v] = docsOut.get('AC')
    expect(divider.part).toBeNull()
    expect(iv.part).toBe('Chief Articles Of Faith')
    expect(v.part).toBe('Chief Articles Of Faith')
  })

  it('resets on the known one-off AC/Smalcald/Large-Catechism divider labels despite lead-in body text', () => {
    const docsOut = new Map([
      ['AC', [
        section({ number: 'XXI', label: 'Worship of the Saints', body: ['text'] }),
        section({ label: 'A Review of the Various Abuses That Have Been Corrected', body: ['lead-in'] }),
        section({ number: 'XXII', label: 'Both Kinds in the Sacrament', body: ['text'] })
      ]],
      ['SA', [
        section({ label: 'The Second Part', body: ['lead-in'] }),
        section({ number: 'I', label: 'The Chief Article', body: ['text'] }),
        section({ label: 'The Third Part', body: ['lead-in'] }),
        section({ number: 'I', label: 'Sin', body: ['text'] })
      ]],
      ['LC', [
        section({ label: 'Part 1', body: ['THE FIRST COMMANDMENT', 'text'] }),
        section({ label: 'The Second Commandment', body: ['text'] })
      ]]
    ])
    assignParts(docsOut)
    const [xxi, abuses, xxii] = docsOut.get('AC')
    expect(xxi.part).toBeNull()
    expect(abuses.part).toBeNull()
    expect(xxii.part).toBe('A Review of the Various Abuses That Have Been Corrected')

    const [secondPart, chiefArticle, thirdPart, sin] = docsOut.get('SA')
    expect(secondPart.part).toBeNull()
    expect(chiefArticle.part).toBe('The Second Part')
    expect(thirdPart.part).toBeNull()
    expect(sin.part).toBe('The Third Part')

    const [part1, secondCommandment] = docsOut.get('LC')
    expect(part1.part).toBeNull()
    expect(secondCommandment.part).toBe('Part 1')
  })

  it('resets the running part at each document boundary', () => {
    const docsOut = new Map([
      ['AC', [section({ label: 'Chief Articles Of Faith', body: [] }), section({ number: 'I', label: 'God', body: ['x'] })]],
      ['AP', [section({ number: 'I', label: 'God', body: ['x'] })]]
    ])
    assignParts(docsOut)
    expect(docsOut.get('AP')[0].part).toBeNull()
  })
})
