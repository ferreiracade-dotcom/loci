import { describe, expect, it } from 'vitest'
import { isCiteableTranslation } from './citeable'

describe('isCiteableTranslation', () => {
  it.each(['BSB', 'BLB'])('allows bundled public-domain %s', (id) => {
    expect(isCiteableTranslation(id)).toBe(true)
  })
  it.each(['ESV', 'NKJV', 'NASB', '', 'bsb', 'UNKNOWN'])('denies %j', (id) => {
    expect(isCiteableTranslation(id)).toBe(false)
  })
})
