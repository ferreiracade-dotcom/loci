import Database from 'better-sqlite3'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runMigrations } from '../db/migrations'

let db: Database.Database
let dataDir: string

vi.mock('../db/connection', () => ({
  getDb: () => db,
  getDataDir: () => dataDir
}))

beforeEach(() => {
  db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
  dataDir = mkdtempSync(join(tmpdir(), 'loci-commentary-index-'))
})

afterEach(() => {
  db.close()
  rmSync(dataDir, { recursive: true, force: true })
})

import { shouldReindex, syncCommentaryFolder } from './commentaryIndex'
import * as commentary from './commentary'

// Guards against the 2026-07-18 incident: 17 commentary sources sat at 0 excerpts forever
// because commentary-index-mtimes.json (outside the SQLite DB) still recorded them as indexed
// after a DB restore rolled their status back to 'unindexed' — the mtime match alone caused
// syncCommentaryFolder to skip re-indexing on every subsequent launch.
describe('shouldReindex', () => {
  it('skips when the mtime matches and the database confirms it was indexed', () => {
    expect(shouldReindex(1000, 1000, 'indexed')).toBe(false)
  })

  it('re-indexes when the mtime changed, regardless of status', () => {
    expect(shouldReindex(1000, 2000, 'indexed')).toBe(true)
  })

  it('re-indexes when never cached, even at status indexed (shouldn\'t happen, but not skipped)', () => {
    expect(shouldReindex(undefined, 1000, 'indexed')).toBe(true)
  })

  it('re-indexes when the mtime matches but the database says unindexed', () => {
    expect(shouldReindex(1000, 1000, 'unindexed')).toBe(true)
  })

  it('re-indexes when the mtime matches and status is needs_review (not unindexed, so skipped)', () => {
    expect(shouldReindex(1000, 1000, 'needs_review')).toBe(false)
  })
})

/** Write a minimal MyBible commentary module, as SermonIndex distributes them. */
function writeModule(path: string, rows: [number, number, number, string][], description?: string): void {
  const m = new Database(path)
  m.exec(`CREATE TABLE info (name text, value text);
    CREATE TABLE commentaries (book_number numeric, chapter_number_from numeric, verse_number_from numeric,
      chapter_number_to numeric, verse_number_to numeric, text text);`)
  if (description) m.prepare("INSERT INTO info VALUES ('description', ?)").run(description)
  const ins = m.prepare('INSERT INTO commentaries VALUES (?, ?, ?, ?, ?, ?)')
  for (const [book, ch, v, text] of rows) ins.run(book, ch, v, ch, v, text)
  m.close()
}

describe('syncCommentaryFolder with MyBible modules', () => {
  it('registers a SermonIndex module under its catalog name and indexes its verses', async () => {
    const folder = join(dataDir, 'vault', 'commentaries')
    mkdirSync(folder, { recursive: true })
    writeModule(
      join(folder, 'SI-LENSKI.commentaries.SQLite3'),
      [
        [530, 1, 0, '<p>CHAPTER I</p>'],
        [530, 1, 2, '<p>To the church of God which is at Corinth.</p>'],
        [530, 1, 1, '<p>Paul, called as an apostle.</p>']
      ],
      "Lenski's Commentary on the New Testament"
    )
    await syncCommentaryFolder()

    const [source] = commentary.listSources()
    expect(source).toMatchObject({
      displayName: "Lenski's Commentary on the New Testament",
      author: 'R. C. H. Lenski',
      pdfRelativePath: 'commentaries/SI-LENSKI.commentaries.SQLite3',
      status: 'indexed'
    })
    expect(commentary.listChapter(source.id, '1CO', 1).map((e) => e.text)).toEqual([
      'CHAPTER I\n\nPaul, called as an apostle.',
      'To the church of God which is at Corinth.'
    ])
  })

  it('names a non-catalog module from its own description', async () => {
    const folder = join(dataDir, 'vault', 'commentaries')
    mkdirSync(folder, { recursive: true })
    writeModule(join(folder, 'GILL.commentaries.SQLite3'), [[470, 1, 1, 'text']], 'Gill’s Exposition')
    await syncCommentaryFolder()
    expect(commentary.listSources()[0]).toMatchObject({ displayName: 'Gill’s Exposition', author: null })
  })
})

describe('syncCommentaryFolder with commentaries Loci ships', () => {
  it('registers a shipped Markdown commentary under its title and author', async () => {
    const folder = join(dataDir, 'vault', 'commentaries')
    mkdirSync(folder, { recursive: true })
    writeFileSync(join(folder, 'Philippi Romans.md'), '# Romans\n## 1:1-7\nThe Salutation\n## 1:1\nPaul')
    await syncCommentaryFolder()
    const [source] = commentary.listSources()
    expect(source).toMatchObject({ displayName: "Philippi's Commentary on Romans", author: 'F. A. Philippi', status: 'indexed' })
    expect(commentary.listChapter(source.id, 'ROM', 1).map((e) => e.text)).toEqual(['The Salutation', 'Paul'])
  })
})
