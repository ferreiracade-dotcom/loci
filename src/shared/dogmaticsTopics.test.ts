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

describe('topicsOf on real titles', () => {
  it("takes Hutter's loci for their topics", () => {
    expect(topicsOf('On God, One and Triune')).toEqual(['god', 'trinity'])
    expect(topicsOf('On Penance')).toEqual(['repentance'])
    expect(topicsOf('On the Worship and Invocation of GOD')).toEqual(['prayer'])
    expect(topicsOf('Various errors of the Anabaptists')).not.toContain('baptism')
    expect(topicsOf('Paedobaptism against the Anabaptists')).toContain('baptism')
    expect(topicsOf('On the Law of GOD')).toEqual(['law'])
  })
})

describe('topicsOf on Quenstedt and Calov', () => {
  it('takes their chapters and articles for their topics', () => {
    expect(topicsOf('Concerning Man')).toEqual(['man'])
    expect(topicsOf('Concerning the Unity and Simplicity of God')).toEqual(['god'])
    expect(topicsOf('Concerning the Universal Benevolence of God')).toEqual(['grace'])
    expect(topicsOf('Concerning the Dual State of Christ')).toEqual(['work-of-christ'])
    expect(topicsOf('Concerning Vocation, and its Related Concepts')).toEqual(['call'])
    expect(topicsOf('On the Great Anti-Christ')).toEqual(['antichrist'])
    expect(topicsOf('Concerning Glorification')).toEqual(['eternal-life'])
  })
})

describe('topicsOf on Hollaz and Baier', () => {
  it('takes their chapters for their topics', () => {
    expect(topicsOf('Of Christ: His Person, States and Office')).toEqual(['person-of-christ', 'work-of-christ'])
    expect(topicsOf('On the Redemption of Christ, His Person and Office')).toEqual(['person-of-christ', 'work-of-christ'])
    expect(topicsOf('On Eternal Blessedness')).toEqual(['eternal-life'])
    expect(topicsOf('On Preserving Grace, and Perseverance')).toEqual(['sanctification'])
    expect(topicsOf('On the Means of Salvation in General, and the Law')).toEqual(['means-of-grace', 'law'])
    expect(topicsOf('Concerning Christ the Redeemer')).toEqual(['person-of-christ'])
  })
})

describe('topicsOf on Meisner and Musaeus', () => {
  it('takes their disputations and chapters for their topics', () => {
    expect(topicsOf('Disputation II. On Original Justice')).toEqual(['man'])
    expect(topicsOf('Disputation V. On the Book of Life')).toEqual(['grace'])
    expect(topicsOf('Disputation VIII. On the Number and Certainty of the Elect')).toEqual(['grace'])
    expect(topicsOf("Disputation X. On Bellarmine's Arguments against the Certainty of Grace")).toEqual(['justification'])
    expect(topicsOf('On Natural Theology')).toEqual(['prolegomena'])
    expect(topicsOf('On the Signs and Motives of Credibility: External')).toEqual(['scripture'])
  })

  it('does not take every mention of the elect for predestination', () => {
    expect(topicsOf('Concerning the Cross, as the Token of the Elect and the Faithful')).toEqual(['cross'])
  })
})

describe('topicsOf on Meisner\'s Christologia', () => {
  it('takes the natures, union and communication for the person, the states for the work', () => {
    expect(topicsOf('First Disputation. On the eternal deity of Christ')).toEqual(['person-of-christ'])
    expect(topicsOf('Seventh Disputation. On Nestorianism')).toEqual(['person-of-christ'])
    expect(topicsOf('Tenth Disputation, On the Communication of the Hypostasis')).toEqual(['person-of-christ'])
    expect(topicsOf('Forty-first Disputation. On the Glorious Resurrection of Christ')).toEqual(['work-of-christ'])
    expect(topicsOf('Disputation Forty-Four. On the Ascension of Christ into Heaven')).toEqual(['work-of-christ'])
    expect(topicsOf('Thirty-eighth Disputation, On the Death of Christ')).toEqual(['work-of-christ'])
    expect(topicsOf('Thirty-third Disputation, On the Years of the Ministry and the Whole Course of Christ')).toEqual(['work-of-christ'])
  })

  it('keeps the general topics for the general loci', () => {
    expect(topicsOf('Chapter I. Description and hypostasis of the Holy Spirit')).toEqual(['holy-spirit'])
    expect(topicsOf('Use of the doctrine of Christian Liberty')).toEqual(['liberty'])
    expect(topicsOf('Q. XVII. What is the form of the ministry?')).toEqual(['ministry'])
    expect(topicsOf('On the Resurrection of the Dead')).toEqual(['resurrection'])
    expect(topicsOf('On Temporal Death')).toEqual(['death'])
  })
})

describe('topicsOf on the ascension', () => {
  it('takes Christ\'s ascension into heaven for his work, not for heaven', () => {
    expect(topicsOf('Q. 149. According to which nature does Christ ascend into heaven?')).toEqual(['work-of-christ'])
    expect(topicsOf('Chapter V. concerning the Temptation of Jesus')).toEqual(['work-of-christ'])
  })
})
