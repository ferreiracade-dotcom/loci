import * as commentary from './commentary'
import * as library from './library'
import {
  chunkDocument,
  extractPagesLines,
  profileSource,
  type PositionedLine
} from './commentaryExtract'
import { applyCorrections, correctionsForSource, hashChunkContent } from './commentaryCorrections'
import { validateSource } from './commentaryValidate'
import { VERSE_COUNTS } from '../../shared/versification'
import type {
  CommentaryIndexProgress,
  CommentaryIndexSummary,
  CommentaryParserConfig,
  CommentaryProfileResult
} from '../../shared/ipc'

/** Source ids with a pending cancel request, checked cooperatively between pages. */
const cancelRequested = new Set<string>()

export function cancelIndexing(sourceId: string): void {
  cancelRequested.add(sourceId)
}

/** Sample a representative slice of the document for profiling: skip the first ~10% (front
 *  matter/TOC) and take up to 40 pages evenly spaced through the rest — short documents are
 *  used in full. */
export function pickProfilingSample(pagesLines: PositionedLine[][]): PositionedLine[][] {
  const total = pagesLines.length
  if (total <= 40) return pagesLines
  const usable = pagesLines.slice(Math.floor(total * 0.1))
  const step = Math.max(1, Math.floor(usable.length / 40))
  const sample: PositionedLine[][] = []
  for (let i = 0; i < usable.length && sample.length < 40; i += step) sample.push(usable[i])
  return sample
}

async function readSourcePdf(sourceId: string): Promise<{
  bytes: Uint8Array
  source: NonNullable<ReturnType<typeof commentary.getSource>>
}> {
  const source = commentary.getSource(sourceId)
  if (!source) throw new Error('Commentary source not found')
  if (!source.bookId) throw new Error('This source is not linked to a library book')
  const bytes = library.getBookPdf(source.bookId)
  if (!bytes) throw new Error("Could not read this source's PDF")
  return { bytes, source }
}

/** Phase 2c: sample the source's PDF and infer its header shape for user confirmation.
 *  Read-only — writes nothing; the caller saves the (possibly adjusted) profile via
 *  `updateCommentarySource` once confirmed. */
export async function profileCommentarySource(sourceId: string): Promise<CommentaryProfileResult> {
  const { bytes } = await readSourcePdf(sourceId)
  const pagesLines = await extractPagesLines(bytes)
  const sample = pickProfilingSample(pagesLines)
  return profileSource(sample)
}

function cancelledSummary(): CommentaryIndexSummary {
  return {
    totalCount: 0,
    flaggedCount: 0,
    booksCovered: [],
    chaptersWithNoCoverage: [],
    orphanedCorrections: 0,
    cancelled: true
  }
}

/** Full extraction + validation + corrections replay, writing excerpts to the index.
 *  Requires the source to already have a confirmed `parserConfig` (from the profiling step)
 *  saved via `commentary:updateSource`. */
export async function indexSource(
  sourceId: string,
  onProgress?: (p: CommentaryIndexProgress) => void
): Promise<CommentaryIndexSummary> {
  const { bytes, source } = await readSourcePdf(sourceId)
  if (!source.parserConfig) throw new Error('This source has not been profiled yet')
  const config = JSON.parse(source.parserConfig) as CommentaryParserConfig

  let cancelled = false
  const pagesLines = await extractPagesLines(bytes, (done, total) => {
    if (cancelRequested.has(sourceId)) cancelled = true
    onProgress?.({ phase: 'extracting', done, total })
  })
  if (cancelled) {
    cancelRequested.delete(sourceId)
    return cancelledSummary()
  }

  onProgress?.({ phase: 'validating', done: 0, total: 1 })
  const rawChunks = chunkDocument(pagesLines, config.profile, {
    book: config.seedBook,
    chapter: config.seedChapter
  })

  const corrections = correctionsForSource(source.pdfRelativePath)
  const { replayed, orphaned } = applyCorrections(rawChunks, corrections)
  const finalChunks = replayed.filter((r) => r.action !== 'discard').map((r) => r.chunk)
  const confirmedHashes = new Set(
    replayed
      .filter((r) => r.action === 'confirm')
      .map((r) => hashChunkContent(r.chunk.headerRaw, r.chunk.text))
  )

  const { chunks: validated, coverage } = validateSource(finalChunks, VERSE_COUNTS)
  for (const v of validated) {
    if (confirmedHashes.has(hashChunkContent(v.headerRaw, v.text))) v.flagged = false
  }

  commentary.replaceExcerptsForSource(
    sourceId,
    validated.map((v) => ({
      book: v.book,
      chapterStart: v.chapterStart,
      verseStart: v.verseStart,
      chapterEnd: v.chapterEnd,
      verseEnd: v.verseEnd,
      text: v.text,
      pageNumber: v.page,
      headerRaw: v.headerRaw,
      confidence: v.confidence,
      flagged: v.flagged,
      flagReasons: v.reasons
    }))
  )
  const flaggedCount = validated.filter((v) => v.flagged).length
  commentary.updateSource(sourceId, {
    status: flaggedCount > 0 ? 'needs_review' : 'indexed',
    indexedAt: new Date().toISOString()
  })

  onProgress?.({ phase: 'done', done: 1, total: 1 })
  return {
    totalCount: coverage.totalCount,
    flaggedCount,
    booksCovered: coverage.booksCovered,
    chaptersWithNoCoverage: coverage.chaptersWithNoCoverage,
    orphanedCorrections: orphaned.length,
    cancelled: false
  }
}
