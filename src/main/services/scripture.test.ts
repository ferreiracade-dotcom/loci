import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const appPath = vi.hoisted(() => ({ value: process.cwd() }))

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
  app: { isPackaged: false, getAppPath: () => appPath.value }
}))

import { getAudio, getChapter, getPassage, listTranslations } from './scripture'

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

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

  const online = (): void => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith('books.json')) return { ok: true, json: async () => ({ books: [] }) }
      return { ok: true, json: async () => ({ thisChapterAudioLinks: { david: 'https://x/david.mp3' } }) }
    })
  }

  it('returns immediately without waiting on a never-resolving audio fetch', async () => {
    fetchMock.mockReturnValue(new Promise(() => {})) // leaves JHN 5 in flight; other tests use other chapters
    const ch = await getChapter('BSB', 'JHN', 5)
    expect(ch?.verses.length).toBeGreaterThan(30)
    expect(ch?.audio).toBeUndefined()
  })

  it('fetches audio in the background once, deduped, and caches it as an audio-only row', async () => {
    online()
    const [a, b] = await Promise.all([getChapter('BSB', 'JHN', 3), getChapter('BSB', 'JHN', 3)])
    expect(a?.audio).toBeUndefined()
    expect(b?.audio).toBeUndefined()
    const audio = await getAudio('JHN', 3)
    expect(audio[0]).toMatchObject({ reader: 'david', url: 'https://x/david.mp3' })
    expect(fetchMock.mock.calls.filter(([u]) => !String(u).endsWith('books.json'))).toHaveLength(1)
    expect(JSON.parse(rows.get('BSB/JHN/3')!).verses).toEqual([])
    const again = await getChapter('BSB', 'JHN', 3)
    expect(again?.audio).toHaveLength(1)
  })

  it('does not fetch when audio:false (indexing, hovers)', async () => {
    online()
    await getChapter('BSB', 'JHN', 3, { audio: false })
    await getPassage('BSB', 'John 3:16')
    await flush()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('getAudio returns [] on failure and caches nothing', async () => {
    expect(await getAudio('JHN', 3)).toEqual([])
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) })
    expect(await getAudio('JHN', 4)).toEqual([])
    expect(rows.size).toBe(0)
  })

  it('retries once for a legacy cached row without an audio key', async () => {
    rows.set('BSB/JHN/3', JSON.stringify([{ verse: 1, text: 'old' }]))
    online()
    expect(await getAudio('JHN', 3)).toHaveLength(1)
  })

  it('returns null when the bundled file is missing (never an empty chapter)', async () => {
    vi.resetModules()
    appPath.value = '/nonexistent'
    try {
      const fresh = await import('./scripture')
      expect(await fresh.getChapter('BSB', 'JHN', 3)).toBeNull()
      expect(await fresh.getChapter('BLB', 'JHN', 3)).toBeNull()
    } finally {
      appPath.value = process.cwd()
    }
  })
})
