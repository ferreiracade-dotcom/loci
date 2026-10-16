import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Fake scripture_cache: rows keyed by translation/book/chapter.
const rows = new Map<string, string>()
const db = {
  prepare: (sql: string) => ({
    get: (t: string, b: string, c: number) => {
      const json = rows.get(`${t}/${b}/${c}`)
      return json ? { json } : undefined
    },
    run: (t: string, b: string, c: number, json: string) => {
      if (/INSERT/i.test(sql)) rows.set(`${t}/${b}/${c}`, json)
    }
  })
}

vi.mock('../db/connection', () => ({ getDb: () => db }))
vi.mock('./config', () => ({ getEsvKey: () => '', getApiBibleKey: () => '' }))
vi.mock('electron', () => ({
  app: { isPackaged: false, getAppPath: () => process.cwd() }
}))

import { getChapter, getPassage, listTranslations } from './scripture'

const fetchMock = vi.fn()

beforeEach(() => {
  rows.clear()
  fetchMock.mockReset()
  fetchMock.mockRejectedValue(new TypeError('fetch failed')) // offline
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

describe('bundled Scripture', () => {
  it('lists BSB and BLB with no keys, as bundled', async () => {
    const t = await listTranslations()
    expect(t.map((x) => [x.id, x.provider])).toEqual([
      ['BSB', 'bundled'],
      ['BLB', 'bundled']
    ])
    expect(t[1].name).toBe('Berean Literal Bible')
  })

  it('reads BSB John 3 offline without throwing or caching a failure', async () => {
    const ch = await getChapter('BSB', 'JHN', 3)
    expect(ch?.translation).toBe('BSB')
    expect(ch?.verses).toHaveLength(36)
    expect(ch?.verses.find((v) => v.verse === 16)?.text).toContain('For God so loved the world')
    expect(ch?.audio).toBeUndefined()
    expect(rows.size).toBe(0)
  })

  it('stores verses as pairs: Matthew 17 omits verse 21 in the BSB', async () => {
    const ch = await getChapter('BSB', 'MAT', 17)
    const nums = ch!.verses.map((v) => v.verse)
    expect(nums).not.toContain(21)
    expect(nums).toContain(20)
    expect(nums).toContain(22)
  })

  it('reads BLB, keeping supplied-word brackets', async () => {
    const ch = await getChapter('BLB', 'GEN', 1)
    expect(ch?.translationName).toBe('Berean Literal Bible')
    expect(ch?.verses[1].text).toContain('[was]')
    expect(ch?.copyright).toMatch(/literalbible\.com/)
    expect(fetchMock).not.toHaveBeenCalled() // BLB has no audio fetch
  })

  it('returns null for an unknown book or out-of-range chapter', async () => {
    expect(await getChapter('BSB', 'XXX', 1)).toBeNull()
    expect(await getChapter('BSB', 'JHN', 99)).toBeNull()
  })

  it('getPassage slices the requested verse', async () => {
    const p = await getPassage('BSB', 'John 3:16')
    expect(p?.verses).toHaveLength(1)
    expect(p?.highlight).toEqual([16])
  })

  it('ignores old cached helloao verse text but uses its audio', async () => {
    rows.set(
      'BSB/JHN/3',
      JSON.stringify({
        verses: [{ verse: 1, text: 'STALE HELLOAO TEXT' }],
        audio: [{ reader: 'david', label: 'David', url: 'https://x/david.mp3' }]
      })
    )
    const ch = await getChapter('BSB', 'JHN', 3)
    expect(ch?.verses[0].text).not.toContain('STALE')
    expect(ch?.audio).toEqual([{ reader: 'david', label: 'David', url: 'https://x/david.mp3' }])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('fetches BSB audio once when online and caches it as an audio-only row', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith('books.json')) return { ok: true, json: async () => ({ books: [] }) }
      return {
        ok: true,
        json: async () => ({ thisChapterAudioLinks: { david: 'https://x/david.mp3' } })
      }
    })
    const ch = await getChapter('BSB', 'JHN', 3)
    expect(ch?.audio?.[0]).toMatchObject({ reader: 'david', url: 'https://x/david.mp3' })
    expect(JSON.parse(rows.get('BSB/JHN/3')!).verses).toEqual([])
    const calls = fetchMock.mock.calls.length
    await getChapter('BSB', 'JHN', 3)
    expect(fetchMock.mock.calls.length).toBe(calls) // served from cache
  })

  it('treats a non-ok audio response as no audio and caches nothing', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) })
    const ch = await getChapter('BSB', 'JHN', 3)
    expect(ch?.verses.length).toBeGreaterThan(0)
    expect(ch?.audio).toBeUndefined()
    expect(rows.size).toBe(0)
  })
})
