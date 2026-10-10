import { describe, expect, it } from 'vitest'
import type { Quote } from '@shared/ipc'
import { authorFor, SCRIPTURE_AUTHOR } from './quoteGrouping'

const base = { id: 'q', bookId: '', text: 't', page: null, color: 'amber', tags: [], annotations: [], citation: '', notePath: null, usedIn: [], createdAt: 0 } as Quote

describe('authorFor', () => {
  it('files a Fathers quote under its author, or "Unattributed" — never Scripture', () => {
    expect(authorFor({ ...base, fathersVolume: 'anf01', fathersAuthor: 'Irenaeus' }, [])).toBe('Irenaeus')
    expect(authorFor({ ...base, fathersVolume: 'anf01' }, [])).toBe('Unattributed')
  })
  it('still files Bible quotes under Scripture', () => {
    expect(authorFor(base, [])).toBe(SCRIPTURE_AUTHOR)
  })
})
