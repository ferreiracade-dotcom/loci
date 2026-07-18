import { existsSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'fs'
import { isAbsolute, join } from 'path'
import { getDataDir } from '../db/connection'
import * as commentary from './commentary'
import { commentaryVaultDir, localVaultDir } from './config'
import { parseCommentaryMarkdown, type ExtractedChunk } from './commentaryMarkdown'
import { applyCorrections, correctionsForSource, hashChunkContent } from './commentaryCorrections'
import { validateSource } from './commentaryValidate'
import { VERSE_COUNTS } from '../../shared/versification'
import type { CommentaryIndexProgress, CommentaryIndexSummary } from '../../shared/ipc'

/** Read a Markdown source's text. `pdf_relative_path` is either already absolute or relative
 *  to the local vault (where Markdown sources live under `commentaries/`, synced to Drive). */
function readSourceMarkdown(pdfRelativePath: string): string {
  const abs = isAbsolute(pdfRelativePath)
    ? pdfRelativePath
    : join(localVaultDir(), pdfRelativePath)
  return readFileSync(abs, 'utf8')
}

/** Local, rebuildable record of the mtime (whole seconds) each commentary Markdown file had when
 *  it was last indexed on THIS device — kept in getDataDir(), not the vault, like the index it
 *  guards. Change detection compares against this rather than the wall-clock index time, so an
 *  edit synced in from another device is re-indexed even when its (vaultsync-preserved) mtime is
 *  *older* than this device's last index run — which the previous `mtime <= indexedAt` check
 *  skipped forever, serving stale excerpts. */
function indexMtimesPath(): string {
  return join(getDataDir(), 'commentary-index-mtimes.json')
}
function loadIndexMtimes(): Record<string, number> {
  try {
    return JSON.parse(readFileSync(indexMtimesPath(), 'utf8')) as Record<string, number>
  } catch {
    return {}
  }
}
function saveIndexMtimes(mtimes: Record<string, number>): void {
  const path = indexMtimesPath()
  const tmp = `${path}.tmp`
  writeFileSync(tmp, JSON.stringify(mtimes, null, 2))
  renameSync(tmp, path)
}

/** True when a discovered commentary file needs (re-)indexing: its mtime doesn't match what was
 *  last recorded, OR the database's own status says it was never actually indexed. The mtime
 *  cache lives in a plain JSON file outside the SQLite database, so a DB restore/corruption that
 *  rolls commentary_sources back to 'unindexed' (independent of the vault files, which are
 *  untouched) leaves the cache pointing at a state the database no longer has — without the
 *  status check, the file's mtime still matches and it would be skipped forever, silently
 *  indexing 0 excerpts on every launch. */
export function shouldReindex(
  cachedMtime: number | undefined,
  currentMtime: number,
  status: string
): boolean {
  return cachedMtime !== currentMtime || status === 'unindexed'
}

/** Discover and index commentary-Markdown files sitting in the vault's `commentaries/` folder.
 *  Called at startup (after the vault sync pulls them down from Drive) so that on any device
 *  the vault reaches, its `.md` commentaries auto-register and index without manual re-adding —
 *  the local index is derived, but the vault files that define it travel with the vault.
 *  Registers unseen files and re-indexes ones whose file changed since it was last indexed. */
export async function syncCommentaryFolder(): Promise<void> {
  const folder = commentaryVaultDir()
  if (!existsSync(folder)) return
  let files: string[]
  try {
    files = readdirSync(folder).filter((f) => /\.md$/i.test(f))
  } catch {
    return
  }
  const mtimes = loadIndexMtimes()
  let changed = false
  for (const fileName of files) {
    const storedPath = `commentaries/${fileName}`
    let mtime: number
    try {
      mtime = Math.floor(statSync(join(folder, fileName)).mtimeMs / 1000)
    } catch {
      continue // file vanished between listing and stat — skip it this pass
    }
    const source =
      commentary.getSourceByPath(storedPath) ??
      commentary.createSource({
        displayName: fileName.replace(/\.md$/i, ''),
        author: null,
        bookId: null,
        pdfRelativePath: storedPath
      })
    if (!shouldReindex(mtimes[storedPath], mtime, source.status)) continue
    try {
      await indexSource(source.id)
      mtimes[storedPath] = mtime
      changed = true
    } catch {
      /* best effort — a malformed file just won't produce excerpts */
    }
  }
  if (changed) saveIndexMtimes(mtimes)
}

/** Full extraction + validation + corrections replay, writing excerpts to the index. Markdown's
 *  excerpt boundaries are explicit headings, so a trivial, always-reliable parse is the whole
 *  extraction step — no profiling, no paged progress, nothing to cancel. */
export async function indexSource(
  sourceId: string,
  onProgress?: (p: CommentaryIndexProgress) => void
): Promise<CommentaryIndexSummary> {
  const source = commentary.getSource(sourceId)
  if (!source) throw new Error('Commentary source not found')

  onProgress?.({ phase: 'extracting', done: 0, total: 1 })
  const rawChunks = parseCommentaryMarkdown(readSourceMarkdown(source.pdfRelativePath))
  onProgress?.({ phase: 'validating', done: 0, total: 1 })
  return finalizeIndex(sourceId, source.pdfRelativePath, rawChunks, onProgress)
}

/** Replay manual corrections, validate, persist excerpts, and update source status. */
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
