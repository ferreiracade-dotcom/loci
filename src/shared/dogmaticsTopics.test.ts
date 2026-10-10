import { describe, expect, it } from 'vitest'
import { DOGMATICS_TOPICS, topicsOf } from './dogmaticsTopics'

describe('topicsOf', () => {
  it('finds the locus a book title names, in English, Latin or German', () => {
    expect(topicsOf('On Holy Baptism')).toEqual(['baptism'])
    expect(topicsOf('De Baptismo')).toEqual(['baptism'])
    expect(topicsOf('Von der Taufe')).toEqual(['baptism'])
    expect(topicsOf('De Justificatione per fidem')).toEqual(['faith', 'justification'])
    expect(topicsOf("Of the Lord's Supper")).toEqual(['lords-supper'])
    expect(topicsOf('De Sacra Coena')).toEqual(['lords-supper'])
    expect(topicsOf('On God')).toEqual(['god'])
    expect(topicsOf('On the Nature of God and the Divine Attributes')).toEqual(['god'])
    expect(topicsOf('Of the Person of Christ')).toEqual(['person-of-christ'])
  })

  it('does not take a phrase for the topic it only contains', () => {
    expect(topicsOf('Of the Word of God')).not.toContain('god')
    expect(topicsOf('The State of Humiliation')).not.toContain('government')
    expect(topicsOf('The Descent into Hell')).toEqual(['work-of-christ'])
    expect(topicsOf('')).toEqual([])
  })

  it('has unique ids', () => {
    expect(new Set(DOGMATICS_TOPICS.map((t) => t.id)).size).toBe(DOGMATICS_TOPICS.length)
  })
})
