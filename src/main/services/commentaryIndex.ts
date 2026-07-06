import { existsSync, readFileSync, readdirSync, statSync } from 'fs'
import { isAbsolute, join } from 'path'
import * as commentary from './commentary'
import * as library from './library'
import { commentaryVaultDir, localVaultDir } from './config'
import {
  chunkDocument,
  extractPagesLines,
  profileSource,
  type ExtractedChunk,
  type PositionedLine
} from './commentaryExtract'
import { parseCommentaryMarkdown } from './commentaryMarkdown'
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

/** True when a source is a canonical commentary-Markdown file rather than a PDF. */
export function isMarkdownSource(pdfRelativePath: string): boolean {
  return /\.md$/i.test(pdfRelativePath)
}

/** Read a Markdown source's text. `pdf_relative_path` is either already absolute or relative
 *  to the local vault (where Markdown sources live under `commentaries/`, synced to Drive). */
function readSourceMarkdown(pdfRelativePath: string): string {
  const abs = isAbsolute(pdfRelativePath)
    ? pdfRelativePath
    : join(localVaultDir(), pdfRelativePath)
  return readFileSync(abs, 'utf8')
}

/** Discover and index commentary-Markdown files sitting in the vault's `commentaries/` folder.
 *  Called at startup (after the vault sync pulls them down from Drive) so that on any device
 *  the vault reaches, its `.md` commentaries auto-register and index without manual re-adding —
 *  the local index is derived, but the vault files that define it travel with the vault.
 *  Registers unseen files and re-indexes ones whose file is newer than the last index. */
export async function syncCommentaryFolder(): Promise<void> {
  const folder = commentaryVaultDir()
  if (!existsSync(folder)) return
  let files: string[]
  try {
    files = readdirSync(folder).filter((f) => /\.md$/i.test(f))
  } catch {
    return
  }
  for (const fileName of files) {
    const storedPath = `commentaries/${fileName}`
    let source = commentary.getSourceByPath(storedPath)
    if (!source) {
      source = commentary.createSource({
        displayName: fileName.replace(/\.md$/i, ''),
        author: null,
        bookId: null,
        pdfRelativePath: storedPath
      })
    } else if (source.indexedAt) {
      // Already indexed — skip unless the file changed since.
      const mtime = statSync(join(folder, fileName)).mtimeMs
      if (mtime <= Date.parse(source.indexedAt)) continue
    }
    try {
      await indexSource(source.id)
    } catch {
      /* best effort — a malformed file just won't produce excerpts */
    }
  }
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
  const source = commentary.getSource(sourceId)
  if (!source) throw new Error('Commentary source not found')

  // Markdown sources skip PDF extraction and profiling entirely — their excerpt boundaries are
  // explicit headings, so a trivial, always-reliable parse replaces the whole heuristic stack.
  if (isMarkdownSource(source.pdfRelativePath)) {
    onProgress?.({ phase: 'extracting', done: 0, total: 1 })
    const rawChunks = parseCommentaryMarkdown(readSourceMarkdown(source.pdfRelativePath))
    onProgress?.({ phase: 'validating', done: 0, total: 1 })
    return finalizeIndex(sourceId, source.pdfRelativePath, rawChunks, onProgress)
  }

  const { bytes } = await readSourcePdf(sourceId)
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
  return finalizeIndex(sourceId, source.pdfRelativePath, rawChunks, onProgress)
}

/** Shared tail for both PDF and Markdown ingestion: replay manual corrections, validate,
 *  persist excerpts, and update source status. */
function finalizeIndex(
  sourceId: string,
  pdfRelativePath: string,
  rawChunks: ExtractedChunk[],
  onProgress?: (p: CommentaryIndexProgress) => void
): CommentaryIndexSummary {
  const corrections = correctionsForSource(pdfRelativePath)
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
