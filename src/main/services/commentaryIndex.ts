import { existsSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'fs'
import { basename, isAbsolute, join } from 'path'
import Database from 'better-sqlite3'
import { getDataDir } from '../db/connection'
import * as commentary from './commentary'
import { commentaryVaultDir, localVaultDir } from './config'
import { parseCommentaryMarkdown, type ExtractedChunk } from './commentaryMarkdown'
import { parseMyBibleCommentaries, type MyBibleRow } from './mybible'
import { catalogEntryForFile } from './sermonIndex'
import { applyCorrections, correctionsForSource, hashChunkContent } from './commentaryCorrections'
import { validateSource } from './commentaryValidate'
import { VERSE_COUNTS } from '../../shared/versification'
import type { CommentaryIndexProgress, CommentaryIndexSummary } from '../../shared/ipc'

/** Commentary files the vault's `commentaries/` folder can hold: canonical Markdown, or a
 *  MyBible commentary module (what SermonIndex publishes). */
const COMMENTARY_FILE_RE = /\.(md|sqlite3)$/i
const isMyBibleModule = (path: string): boolean => /\.sqlite3$/i.test(path)

/** Bumped when MyBible parsing changes what a module indexes to, so modules already indexed
 *  under the old rules re-index once at startup even though their file is unchanged. */
const MYBIBLE_PARSE_VERSION = 2

/** `pdf_relative_path` is either already absolute or relative to the local vault (where file
 *  sources live under `commentaries/`, synced to Drive). */
function sourceFilePath(pdfRelativePath: string): string {
  return isAbsolute(pdfRelativePath) ? pdfRelativePath : join(localVaultDir(), pdfRelativePath)
}

/** Open a MyBible module read-only; the caller closes it. Throws on a file that isn't one. */
function openModule(abs: string): Database.Database {
  const db = new Database(abs, { readonly: true, fileMustExist: true })
  const hasTable = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'commentaries'")
    .get()
  if (!hasTable) {
    db.close()
    throw new Error('Not a MyBible commentary module (no commentaries table)')
  }
  return db
}

/** A module's own title (its `info.description`), if it has one. */
export function myBibleModuleTitle(abs: string): string | null {
  const db = openModule(abs)
  try {
    const row = db.prepare("SELECT value FROM info WHERE name = 'description'").get() as
      | { value: string }
      | undefined
    return row?.value?.trim() || null
  } catch {
    return null // no info table: fall back to the file name
  } finally {
    db.close()
  }
}

/** Extract a source's raw verse-keyed chunks, whichever file format it is. */
function readSourceChunks(pdfRelativePath: string): ExtractedChunk[] {
  const abs = sourceFilePath(pdfRelativePath)
  if (!isMyBibleModule(abs)) return parseCommentaryMarkdown(readFileSync(abs, 'utf8'))
  const db = openModule(abs)
  try {
    const rows = db
      .prepare(
        `SELECT book_number, chapter_number_from, verse_number_from, chapter_number_to,
                verse_number_to, text
         FROM commentaries`
      )
      .all() as MyBibleRow[]
    const entry = catalogEntryForFile(basename(abs))
    return parseMyBibleCommentaries(rows, { passageComments: entry?.passageComments, verseCounts: VERSE_COUNTS })
  } finally {
    db.close()
  }
}

/** Display name + author for a commentaries-folder file being registered for the first time. */
export function describeCommentaryFile(fileName: string): { displayName: string; author: string | null } {
  if (!isMyBibleModule(fileName)) return { displayName: fileName.replace(/\.md$/i, ''), author: null }
  const entry = catalogEntryForFile(fileName)
  let title: string | null = null
  try {
    title = myBibleModuleTitle(join(commentaryVaultDir(), fileName))
  } catch {
    /* unreadable module: the indexer will report it */
  }
  return {
    displayName: entry?.title ?? title ?? fileName.replace(/(\.commentaries)?\.sqlite3$/i, ''),
    author: entry?.author ?? null
  }
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

/** Discover and index commentary files (Markdown or MyBible modules) sitting in the vault's
 *  `commentaries/` folder. Called at startup (after the vault sync pulls them down from Drive)
 *  so that on any device the vault reaches, its commentaries auto-register and index without
 *  manual re-adding —
 *  the local index is derived, but the vault files that define it travel with the vault.
 *  Registers unseen files and re-indexes ones whose file changed since it was last indexed. */
export async function syncCommentaryFolder(): Promise<void> {
  const folder = commentaryVaultDir()
  if (!existsSync(folder)) return
  let files: string[]
  try {
    files = readdirSync(folder).filter((f) => COMMENTARY_FILE_RE.test(f))
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
      commentary.createSource({ ...describeCommentaryFile(fileName), bookId: null, pdfRelativePath: storedPath })
    const cacheKey = isMyBibleModule(fileName) ? `${storedPath}#v${MYBIBLE_PARSE_VERSION}` : storedPath
    if (!shouldReindex(mtimes[cacheKey], mtime, source.status)) continue
    try {
      await indexSource(source.id)
      mtimes[cacheKey] = mtime
      changed = true
    } catch {
      /* best effort — a malformed file just won't produce excerpts */
    }
  }
  if (changed) saveIndexMtimes(mtimes)
}

/** Full extraction + validation + corrections replay, writing excerpts to the index. Markdown's
 *  excerpt boundaries are explicit headings and a MyBible module's are data, so a trivial,
 *  always-reliable parse is the whole extraction step — no profiling, no paged progress,
 *  nothing to cancel. */
export async function indexSource(
  sourceId: string,
  onProgress?: (p: CommentaryIndexProgress) => void
): Promise<CommentaryIndexSummary> {
  const source = commentary.getSource(sourceId)
  if (!source) throw new Error('Commentary source not found')

  onProgress?.({ phase: 'extracting', done: 0, total: 1 })
  const rawChunks = readSourceChunks(source.pdfRelativePath)
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
