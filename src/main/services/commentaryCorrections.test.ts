import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ExtractedChunk } from './commentaryExtract'

let dataDir: string

vi.mock('../db/connection', () => ({
  getDataDir: () => dataDir
}))

import {
  applyCorrections,
  correctionsForSource,
  hashChunkContent,
  loadCorrections,
  newCorrection,
  removeCorrection,
  saveCorrection
} from './commentaryCorrections'

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'loci-commentary-corrections-'))
})

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true })
})

function chunk(patch: Partial<ExtractedChunk> = {}): ExtractedChunk {
  return {
    headerRaw: 'v. 16',
    book: 'ROM',
    chapterStart: 3,
    verseStart: 16,
    chapterEnd: 3,
    verseEnd: 16,
    text: 'For God so loved the world...',
    page: 42,
    ...patch
  }
}

describe('hashChunkContent', () => {
  it('is stable for identical content and differs for different content', () => {
    const h1 = hashChunkContent('v. 16', 'some text')
    const h2 = hashChunkContent('v. 16', 'some text')
    const h3 = hashChunkContent('v. 16', 'different text')
    expect(h1).toBe(h2)
    expect(h1).not.toBe(h3)
  })
})

describe('corrections store — load/save roundtrip', () => {
  it('starts empty when no file exists yet', () => {
    expect(loadCorrections()).toEqual([])
  })

  it('persists a correction and reloads it', () => {
    const c = newCorrection('vault/foo.pdf', chunk(), 'confirm')
    saveCorrection(c)
    expect(loadCorrections()).toEqual([c])
  })

  it('filters corrections by source path', () => {
    saveCorrection(newCorrection('vault/a.pdf', chunk(), 'confirm'))
    saveCorrection(newCorrection('vault/b.pdf', chunk({ text: 'other' }), 'confirm'))
    expect(correctionsForSource('vault/a.pdf')).toHaveLength(1)
    expect(correctionsForSource('vault/b.pdf')).toHaveLength(1)
  })

  it('updates an existing correction by id rather than duplicating', () => {
    const c = newCorrection('vault/a.pdf', chunk(), 'confirm')
    saveCorrection(c)
    saveCorrection({ ...c, action: 'discard' })
    expect(loadCorrections()).toHaveLength(1)
    expect(loadCorrections()[0].action).toBe('discard')
  })

  it('removes a correction by id', () => {
    const c = newCorrection('vault/a.pdf', chunk(), 'confirm')
    saveCorrection(c)
    removeCorrection(c.id)
    expect(loadCorrections()).toEqual([])
  })
})

describe('applyCorrections — replay on re-index', () => {
  it('confirm survives a re-index with identical content', () => {
    const original = chunk()
    const correction = newCorrection('vault/a.pdf', original, 'confirm')
    // Simulate re-extraction: same content, different array position/page metadata noise
    // wouldn't matter since page isn't part of the hash — but keep it identical here too.
    const reExtracted = [chunk({ headerRaw: 'v. 15' }), chunk()]
    const { replayed, orphaned } = applyCorrections(reExtracted, [correction])
    expect(orphaned).toHaveLength(0)
    expect(replayed.find((r) => r.chunk.headerRaw === 'v. 16')?.action).toBe('confirm')
    expect(replayed.find((r) => r.chunk.headerRaw === 'v. 15')?.action).toBeNull()
  })

  it('discard survives a re-index without user action', () => {
    const original = chunk()
    const correction = newCorrection('vault/a.pdf', original, 'discard')
    const reExtracted = [chunk()]
    const { replayed } = applyCorrections(reExtracted, [correction])
    expect(replayed[0].action).toBe('discard')
  })

  it('reassign rewrites the chunk reference and is flagged as reassign', () => {
    const original = chunk()
    const correction = newCorrection('vault/a.pdf', original, 'reassign', {
      book: 'ROM',
      chapterStart: 3,
      verseStart: 17,
      chapterEnd: 3,
      verseEnd: 18
    })
    const { replayed } = applyCorrections([chunk()], [correction])
    expect(replayed[0].action).toBe('reassign')
    expect(replayed[0].chunk).toMatchObject({ verseStart: 17, verseEnd: 18 })
  })

  it('flags a correction as orphaned when its hash matches nothing in the fresh extraction', () => {
    const staleChunk = chunk({ text: 'text that no longer exists after a PDF edit' })
    const correction = newCorrection('vault/a.pdf', staleChunk, 'confirm')
    const reExtracted = [chunk()] // different content entirely
    const { replayed, orphaned } = applyCorrections(reExtracted, [correction])
    expect(orphaned).toHaveLength(1)
    expect(orphaned[0].id).toBe(correction.id)
    expect(replayed[0].action).toBeNull()
  })
})
