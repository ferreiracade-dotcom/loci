import { describe, expect, it } from 'vitest'
import { resolveCatenaTarget } from './fathersCatena'

describe('resolveCatenaTarget', () => {
  const lookup = { book: 'JHN', chapter: 3, verse: 16 }

  it('uses the clicked verse when the reader is still on its chapter', () => {
    expect(resolveCatenaTarget(lookup, { book: 'JHN', chapter: 3 })).toEqual({ book: 'JHN', chapter: 3, verse: 16 })
  })

  it('uses the clicked verse when no Bible passage is open', () => {
    expect(resolveCatenaTarget(lookup, null)).toEqual({ book: 'JHN', chapter: 3, verse: 16 })
  })

  it('follows the open chapter at chapter level when the clicked verse is elsewhere', () => {
    expect(resolveCatenaTarget(lookup, { book: 'JHN', chapter: 4 })).toEqual({ book: 'JHN', chapter: 4, verse: null })
    expect(resolveCatenaTarget(lookup, { book: 'ROM', chapter: 3 })).toEqual({ book: 'ROM', chapter: 3, verse: null })
  })

  it('shows the open chapter when nothing was clicked', () => {
    expect(resolveCatenaTarget(null, { book: 'ROM', chapter: 8 })).toEqual({ book: 'ROM', chapter: 8, verse: null })
  })

  it('has no target with neither a click nor an open passage', () => {
    expect(resolveCatenaTarget(null, null)).toBeNull()
  })
})
