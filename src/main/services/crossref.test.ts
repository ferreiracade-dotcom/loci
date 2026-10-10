import { afterEach, describe, expect, it, vi } from 'vitest'
import { CROSSREF_ARTICLE, CROSSREF_SPARSE } from './__fixtures__/crossrefSamples'
import { lookupDoi, normalizeDoi, parseCrossref } from './crossref'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('normalizeDoi', () => {
  it.each([
    ['10.1000/xyz123', '10.1000/xyz123'],
    ['  10.1000/xyz123  ', '10.1000/xyz123'],
    ['https://doi.org/10.1000/xyz123', '10.1000/xyz123'],
    ['http://dx.doi.org/10.1000/xyz123', '10.1000/xyz123'],
    ['doi.org/10.1000/xyz123', '10.1000/xyz123'],
    ['doi:10.1000/xyz123', '10.1000/xyz123'],
    ['DOI: 10.1000/xyz123', '10.1000/xyz123'],
    ['https://doi.org/10.1000%2Fxyz123', '10.1000/xyz123']
  ])('%s -> %s', (input, expected) => {
    expect(normalizeDoi(input)).toBe(expected)
  })

  it('rejects things that are not DOIs', () => {
    expect(normalizeDoi('')).toBeNull()
    expect(normalizeDoi('not a doi')).toBeNull()
    expect(normalizeDoi('https://example.com/10.1000/x')).toBeNull()
    expect(normalizeDoi('10.12/short-registrant')).toBeNull()
  })
})

describe('parseCrossref', () => {
  it('maps a journal article to the fields', () => {
    expect(parseCrossref(CROSSREF_ARTICLE)).toEqual({
      title: 'On Sola Gratia & the Lutheran Confessions',
      authors: ['Jane Smith', 'John Q. Doe'],
      journal: 'Concordia Journal',
      volume: '12',
      issue: '3',
      pages: '45–67',
      year: 1998,
      doi: '10.1000/xyz123'
    })
  })

  it('copes with a sparse record', () => {
    expect(parseCrossref(CROSSREF_SPARSE)).toEqual({
      title: 'A Short Note',
      authors: ['Lutheran Church Commission'],
      journal: 'LCC Rev',
      volume: '7',
      issue: null,
      pages: 'e1234',
      year: 2021,
      doi: '10.2000/abc'
    })
  })

  it('returns null for an unexpected body', () => {
    expect(parseCrossref(null)).toBeNull()
    expect(parseCrossref({})).toBeNull()
    expect(parseCrossref({ message: 'oops' })).toBeNull()
    expect(parseCrossref({ message: { title: ['x'] } })).toBeNull() // no DOI
  })
})

describe('lookupDoi', () => {
  const okResponse = (body: unknown): Response =>
    ({ ok: true, status: 200, json: async () => body }) as unknown as Response

  it('rejects a non-DOI without calling the network', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const res = await lookupDoi('hello')
    expect(res.ok).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('fetches the encoded Crossref URL and returns the fields', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse(CROSSREF_ARTICLE))
    vi.stubGlobal('fetch', fetchMock)
    const res = await lookupDoi('https://doi.org/10.1000/xyz123')
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.crossref.org/works/10.1000/xyz123')
    expect(res).toMatchObject({ ok: true, fields: { journal: 'Concordia Journal', year: 1998 } })
  })

  it('maps a 404 to a friendly error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 } as Response))
    expect(await lookupDoi('10.1000/missing')).toEqual({ ok: false, error: 'Crossref has no record of that DOI.' })
  })

  it('maps other HTTP failures and network errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 } as Response))
    expect(await lookupDoi('10.1000/x1')).toEqual({ ok: false, error: 'Crossref lookup failed (503).' })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    expect(await lookupDoi('10.1000/x1')).toEqual({
      ok: false,
      error: 'Could not reach Crossref — check your connection.'
    })
  })

  it('reports an unexpected response body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse({ message: {} })))
    expect(await lookupDoi('10.1000/x1')).toEqual({ ok: false, error: 'Crossref returned an unexpected response.' })
  })
})
