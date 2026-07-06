import Database from 'better-sqlite3'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runMigrations } from '../db/migrations'

let db: Database.Database
let dataDir: string

// commentary.ts (and everything it calls, including commentaryCorrections.ts's JSON store)
// only ever reaches the database/filesystem through these two — swap them so these tests
// never touch Electron.
vi.mock('../db/connection', () => ({
  getDb: () => db,
  getDataDir: () => dataDir
}))

beforeEach(() => {
  db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
  dataDir = mkdtempSync(join(tmpdir(), 'loci-commentary-'))
})

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true })
})

// Imported after the mock is declared; vitest hoists vi.mock above this either way.
import * as commentary from './commentary'
import { loadCorrections } from './commentaryCorrections'
import type { NewCommentaryExcerpt } from './commentary'

function makeSource(displayName: string, sortOrder?: number): string {
  const source = commentary.createSource({
    displayName,
    author: null,
    bookId: null,
    pdfRelativePath: `${displayName}.pdf`
  })
  if (sortOrder !== undefined) commentary.updateSource(source.id, { sortOrder })
  return source.id
}

function excerpt(patch: Partial<NewCommentaryExcerpt>): NewCommentaryExcerpt {
  return {
    book: 'ROM',
    chapterStart: 3,
    verseStart: 16,
    chapterEnd: 3,
    verseEnd: 16,
    text: 'sample commentary text',
    pageNumber: 42,
    headerRaw: 'v. 16',
    confidence: 1,
    flagged: false,
    flagReasons: [],
    ...patch
  }
}

describe('migrations', () => {
  it('runs twice without error and lands on version 15', () => {
    expect(() => runMigrations(db)).not.toThrow()
    expect(db.pragma('user_version', { simple: true })).toBe(15)
  })
})

describe('lookupVerse', () => {
  it('matches a single-verse excerpt', () => {
    const sourceId = makeSource('Single Verse Commentary')
    commentary.replaceExcerptsForSource(sourceId, [
      excerpt({ chapterStart: 3, verseStart: 16, chapterEnd: 3, verseEnd: 16 })
    ])
    const matches = commentary.lookupVerse('ROM', 3, 16)
    expect(matches).toHaveLength(1)
    expect(matches[0].chapterStart).toBe(3)
    expect(matches[0].verseStart).toBe(16)

    expect(commentary.lookupVerse('ROM', 3, 15)).toHaveLength(0)
    expect(commentary.lookupVerse('ROM', 3, 17)).toHaveLength(0)
  })

  it('matches a verse-range excerpt that spans the clicked verse', () => {
    const sourceId = makeSource('Range Commentary')
    commentary.replaceExcerptsForSource(sourceId, [
      excerpt({ chapterStart: 3, verseStart: 16, chapterEnd: 3, verseEnd: 21 })
    ])
    // Clicking v.18, mid-range, should still surface the 16-21 excerpt (spec's acceptance case).
    const matches = commentary.lookupVerse('ROM', 3, 18)
    expect(matches).toHaveLength(1)
    expect(matches[0].verseStart).toBe(16)
    expect(matches[0].verseEnd).toBe(21)

    expect(commentary.lookupVerse('ROM', 3, 15)).toHaveLength(0)
    expect(commentary.lookupVerse('ROM', 3, 22)).toHaveLength(0)
  })

  it('matches a cross-chapter range excerpt', () => {
    const sourceId = makeSource('Cross Chapter Commentary')
    commentary.replaceExcerptsForSource(sourceId, [
      excerpt({ chapterStart: 3, verseStart: 25, chapterEnd: 4, verseEnd: 2 })
    ])
    expect(commentary.lookupVerse('ROM', 4, 1)).toHaveLength(1) // inside the span
    expect(commentary.lookupVerse('ROM', 3, 25)).toHaveLength(1) // exact start
    expect(commentary.lookupVerse('ROM', 4, 2)).toHaveLength(1) // exact end
    expect(commentary.lookupVerse('ROM', 3, 24)).toHaveLength(0) // just before
    expect(commentary.lookupVerse('ROM', 4, 3)).toHaveLength(0) // just after
  })

  it('excludes flagged excerpts', () => {
    const sourceId = makeSource('Flagged Commentary')
    commentary.replaceExcerptsForSource(sourceId, [
      excerpt({ chapterStart: 3, verseStart: 16, chapterEnd: 3, verseEnd: 16, flagged: true })
    ])
    expect(commentary.lookupVerse('ROM', 3, 16)).toHaveLength(0)
  })

  it('orders results by source sort_order, then chapter/verse start', () => {
    const secondSource = makeSource('Second Source', 2)
    const firstSource = makeSource('First Source', 1)
    commentary.replaceExcerptsForSource(secondSource, [
      excerpt({ chapterStart: 3, verseStart: 16, chapterEnd: 3, verseEnd: 16 })
    ])
    commentary.replaceExcerptsForSource(firstSource, [
      excerpt({ chapterStart: 3, verseStart: 16, chapterEnd: 3, verseEnd: 16 })
    ])
    const matches = commentary.lookupVerse('ROM', 3, 16)
    expect(matches.map((m) => m.sourceId)).toEqual([firstSource, secondSource])
  })
})

describe('replaceExcerptsForSource', () => {
  it('fully replaces existing excerpts', () => {
    const sourceId = makeSource('Replaceable Commentary')
    commentary.replaceExcerptsForSource(sourceId, [
      excerpt({ chapterStart: 1, verseStart: 1, chapterEnd: 1, verseEnd: 1 }),
      excerpt({ chapterStart: 1, verseStart: 2, chapterEnd: 1, verseEnd: 2 })
    ])
    commentary.replaceExcerptsForSource(sourceId, [
      excerpt({ chapterStart: 2, verseStart: 1, chapterEnd: 2, verseEnd: 1 })
    ])
    expect(commentary.lookupVerse('ROM', 1, 1)).toHaveLength(0)
    expect(commentary.lookupVerse('ROM', 2, 1)).toHaveLength(1)
  })

  it('is transactional — a failure mid-batch leaves prior excerpts untouched', () => {
    const sourceId = makeSource('Atomic Commentary')
    commentary.replaceExcerptsForSource(sourceId, [
      excerpt({ chapterStart: 1, verseStart: 1, chapterEnd: 1, verseEnd: 1 }),
      excerpt({ chapterStart: 1, verseStart: 2, chapterEnd: 1, verseEnd: 2 })
    ])

    expect(() =>
      commentary.replaceExcerptsForSource(sourceId, [
        excerpt({ chapterStart: 5, verseStart: 1, chapterEnd: 5, verseEnd: 1 }),
        // `book` must be a string for the bound statement; undefined throws before the
        // insert commits, which should roll back the whole transaction (including the
        // DELETE that ran first).
        excerpt({ book: undefined as unknown as string })
      ])
    ).toThrow()

    expect(commentary.lookupVerse('ROM', 1, 1)).toHaveLength(1)
    expect(commentary.lookupVerse('ROM', 1, 2)).toHaveLength(1)
    expect(commentary.lookupVerse('ROM', 5, 1)).toHaveLength(0)
  })
})

describe('review actions', () => {
  function firstExcerptId(sourceId: string): string {
    return (
      commentary
        .listFlagged(sourceId)
        .find(Boolean)?.id ?? ''
    )
  }

  it('reviewConfirm unflags the excerpt and writes a confirm correction', () => {
    const sourceId = makeSource('Review Source')
    commentary.replaceExcerptsForSource(sourceId, [
      excerpt({ chapterStart: 1, verseStart: 1, chapterEnd: 1, verseEnd: 1, flagged: true })
    ])
    const id = firstExcerptId(sourceId)
    commentary.reviewConfirm(id)
    expect(commentary.lookupVerse('ROM', 1, 1)).toHaveLength(1)
    expect(loadCorrections()).toMatchObject([{ action: 'confirm' }])
  })

  it('reviewDiscard keeps the excerpt flagged and writes a discard correction', () => {
    const sourceId = makeSource('Review Source 2')
    commentary.replaceExcerptsForSource(sourceId, [
      excerpt({ chapterStart: 1, verseStart: 1, chapterEnd: 1, verseEnd: 1 })
    ])
    const id = commentary.lookupVerse('ROM', 1, 1)[0].excerptId
    commentary.reviewDiscard(id)
    expect(commentary.lookupVerse('ROM', 1, 1)).toHaveLength(0)
    expect(loadCorrections()).toMatchObject([{ action: 'discard' }])
  })

  it('reviewReassign rewrites the reference and writes a reassign correction', () => {
    const sourceId = makeSource('Review Source 3')
    commentary.replaceExcerptsForSource(sourceId, [
      excerpt({ chapterStart: 1, verseStart: 1, chapterEnd: 1, verseEnd: 1, flagged: true })
    ])
    const id = firstExcerptId(sourceId)
    commentary.reviewReassign(id, {
      book: 'ROM',
      chapterStart: 2,
      verseStart: 5,
      chapterEnd: 2,
      verseEnd: 5
    })
    expect(commentary.lookupVerse('ROM', 1, 1)).toHaveLength(0)
    expect(commentary.lookupVerse('ROM', 2, 5)).toHaveLength(1)
    expect(loadCorrections()).toMatchObject([{ action: 'reassign', correctedChapterStart: 2 }])
  })
})
