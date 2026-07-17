import { createHash, randomUUID } from 'crypto'
import { existsSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { join } from 'path'
import { getDataDir } from '../db/connection'
import type { ExtractedChunk } from './commentaryExtract'

export type CorrectionAction = 'confirm' | 'reassign' | 'discard'

/** A manual review decision on one extracted chunk, keyed by a hash of its own content (not
 *  its position) so it survives a re-index even if surrounding chunks shift. Persisted in a
 *  JSON file under getDataDir() — NOT in the rebuildable SQLite index, NOT in the vault — so
 *  deleting the index and re-indexing every source restores equivalent state, corrections
 *  included. */
export interface Correction {
  id: string
  sourcePdfRelativePath: string
  pageNumber: number
  textHash: string
  action: CorrectionAction
  correctedBook?: string
  correctedChapterStart?: number
  correctedVerseStart?: number
  correctedChapterEnd?: number
  correctedVerseEnd?: number
}

function correctionsPath(): string {
  return join(getDataDir(), 'commentary-corrections.json')
}

function loadAll(): Correction[] {
  const path = correctionsPath()
  if (!existsSync(path)) return []
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Correction[]
  } catch {
    return []
  }
}

function saveAll(corrections: Correction[]): void {
  // Write to a temp file and rename over the real one, so a crash mid-write can't truncate the
  // corrections file (which loadAll would then read as empty, silently discarding every manual
  // review decision). rename over the same directory is atomic.
  const path = correctionsPath()
  const tmp = `${path}.tmp`
  writeFileSync(tmp, JSON.stringify(corrections, null, 2))
  renameSync(tmp, path)
}

export function loadCorrections(): Correction[] {
  return loadAll()
}

/** Insert or update a correction (by id) and persist it. */
export function saveCorrection(c: Correction): void {
  const all = loadAll()
  const idx = all.findIndex((x) => x.id === c.id)
  if (idx >= 0) all[idx] = c
  else all.push(c)
  saveAll(all)
}

export function correctionsForSource(pdfRelativePath: string): Correction[] {
  return loadAll().filter((c) => c.sourcePdfRelativePath === pdfRelativePath)
}

/** Remove a source's corrections entirely (offered when the user removes a source). */
export function deleteCorrectionsForSource(pdfRelativePath: string): void {
  saveAll(loadAll().filter((c) => c.sourcePdfRelativePath !== pdfRelativePath))
}

export function removeCorrection(id: string): void {
  saveAll(loadAll().filter((c) => c.id !== id))
}

/** A stable content hash for a chunk — deliberately independent of its position/page, so a
 *  correction still matches after a re-index shifts surrounding chunks or running-header
 *  detection changes page boundaries slightly. */
export function hashChunkContent(headerRaw: string, text: string): string {
  return createHash('sha256').update(`${headerRaw}\n${text}`).digest('hex')
}

export function newCorrection(
  sourcePdfRelativePath: string,
  chunk: Pick<ExtractedChunk, 'headerRaw' | 'text' | 'page'>,
  action: CorrectionAction,
  reassignTo?: {
    book: string
    chapterStart: number
    verseStart: number
    chapterEnd: number
    verseEnd: number
  }
): Correction {
  return {
    id: randomUUID(),
    sourcePdfRelativePath,
    pageNumber: chunk.page,
    textHash: hashChunkContent(chunk.headerRaw, chunk.text),
    action,
    correctedBook: reassignTo?.book,
    correctedChapterStart: reassignTo?.chapterStart,
    correctedVerseStart: reassignTo?.verseStart,
    correctedChapterEnd: reassignTo?.chapterEnd,
    correctedVerseEnd: reassignTo?.verseEnd
  }
}

export interface CorrectionReplay {
  chunk: ExtractedChunk
  action: CorrectionAction | null
}

/** Replay a source's saved corrections onto freshly extracted chunks, matching by content
 *  hash (Phase 4's core re-index guarantee: manual review work survives a rebuild). A
 *  'reassign' correction rewrites the chunk's reference before validation runs; 'confirm'
 *  and 'discard' are just flagged for the caller to apply after validation (discard should
 *  win over whatever validation would otherwise decide). Corrections whose hash matches
 *  nothing in `chunks` are returned separately as orphaned, for the review UI to surface
 *  rather than silently dropping. */
export function applyCorrections(
  chunks: ExtractedChunk[],
  corrections: Correction[]
): { replayed: CorrectionReplay[]; orphaned: Correction[] } {
  const byHash = new Map(corrections.map((c) => [c.textHash, c]))
  const matchedHashes = new Set<string>()

  const replayed = chunks.map((chunk) => {
    const hash = hashChunkContent(chunk.headerRaw, chunk.text)
    const correction = byHash.get(hash)
    if (!correction) return { chunk, action: null }
    matchedHashes.add(hash)
    if (correction.action === 'reassign' && correction.correctedBook != null) {
      return {
        chunk: {
          ...chunk,
          book: correction.correctedBook,
          chapterStart: correction.correctedChapterStart!,
          verseStart: correction.correctedVerseStart!,
          chapterEnd: correction.correctedChapterEnd!,
          verseEnd: correction.correctedVerseEnd!
        },
        action: 'reassign' as const
      }
    }
    return { chunk, action: correction.action }
  })

  const orphaned = corrections.filter((c) => !matchedHashes.has(c.textHash))
  return { replayed, orphaned }
}
