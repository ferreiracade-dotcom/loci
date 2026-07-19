import { existsSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'fs'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { getDataDir, getDb } from '../db/connection'
import * as boc from './boc'
import { bocCommentaryVaultDir, bocVaultDir } from './config'
import { parseBocMarkdown } from './bocMarkdown'
import { indexBocForSearch } from './search'
import { shouldReindex } from './commentaryIndex'
import type { BocSource } from '../../shared/ipc'

export interface BocIndexSummary {
  sections: number
  excerpts: number
}

export async function indexBocSections(sourceId: string, absPath: string): Promise<BocIndexSummary> {
  const parsed = parseBocMarkdown(await readFile(absPath, 'utf8')).filter((s) => s.text)
  boc.replaceSections(
    sourceId,
    parsed.map((s) => ({
      documentCode: s.documentCode,
      ordinal: s.ordinal,
      number: s.number,
      label: s.label,
      part: s.part,
      text: s.text
    }))
  )
  indexBocForSearch(sourceId)
  return { sections: parsed.length, excerpts: 0 }
}

export async function indexBocCommentary(sourceId: string, absPath: string): Promise<BocIndexSummary> {
  const parsed = parseBocMarkdown(await readFile(absPath, 'utf8')).filter((s) => s.text)
  boc.replaceCommentaryExcerpts(
    sourceId,
    parsed.map((s) => ({
      documentCode: s.documentCode,
      sectionStart: s.ordinal,
      sectionEnd: s.ordinal,
      text: s.text,
      headerRaw: s.headerRaw
    }))
  )
  return { sections: 0, excerpts: parsed.length }
}

// boc.ts (Task 4) exposes create/replace/read helpers but, unlike commentary.ts, no by-path
// lookup or status/indexed_at writer — syncBocFolder needs both (register-on-first-sight, then
// remember what's already indexed), so they live here as thin direct-SQL helpers rather than
// growing boc.ts's public surface for a startup-sync concern.
function findSourceByPath(
  table: 'boc_sources' | 'boc_commentary_sources',
  mdRelativePath: string
): BocSource | null {
  const r = getDb()
    .prepare(
      `SELECT id, display_name, author, md_relative_path, sort_order, status FROM ${table} WHERE md_relative_path = ?`
    )
    .get(mdRelativePath) as
    | { id: string; display_name: string; author: string | null; md_relative_path: string; sort_order: number; status: string }
    | undefined
  return r
    ? {
        id: r.id,
        displayName: r.display_name,
        author: r.author,
        mdRelativePath: r.md_relative_path,
        sortOrder: r.sort_order,
        status: r.status
      }
    : null
}

function markIndexStatus(
  table: 'boc_sources' | 'boc_commentary_sources',
  sourceId: string,
  hasRows: boolean
): void {
  getDb()
    .prepare(`UPDATE ${table} SET status = ?, indexed_at = ? WHERE id = ?`)
    .run(hasRows ? 'indexed' : 'unindexed', new Date().toISOString(), sourceId)
}

/** Local, rebuildable record of the mtime (whole seconds) each BoC Markdown file had when it
 *  was last indexed on THIS device — same rationale as commentary-index-mtimes.json in
 *  `commentaryIndex.ts`: kept in getDataDir(), not the vault, so an edit synced in from another
 *  device is re-indexed even when its (vaultsync-preserved) mtime is *older* than this device's
 *  last index run. Primary-text and commentary files share one cache, keyed by their vault-
 *  relative path (`confessions/re.md` vs `confessions-commentary/re.md`), so the two never
 *  collide. */
function indexMtimesPath(): string {
  return join(getDataDir(), 'boc-index-mtimes.json')
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

/** Discover and index Markdown files sitting in the vault's `confessions/` (primary text) and
 *  `confessions-commentary/` (notes) folders. Called at startup (after the vault sync pulls them
 *  down from Drive) so that on any device the vault reaches, its `.md` Book of Concord sources
 *  auto-register and index without manual re-adding — mirrors `syncCommentaryFolder`
 *  (`commentaryIndex.ts:64`) exactly: same file-scan, same mtime-vs-indexed skip logic
 *  (`shouldReindex`, shared with commentary sync), same register-unseen-file-as-source-then-index
 *  flow, same best-effort error handling. Registers unseen files and re-indexes ones whose file
 *  changed since it was last indexed. */
export async function syncBocFolder(): Promise<void> {
  const mtimes = loadIndexMtimes()
  let changed = false

  const primaryFolder = bocVaultDir()
  if (existsSync(primaryFolder)) {
    let files: string[]
    try {
      files = readdirSync(primaryFolder).filter((f) => /\.md$/i.test(f))
    } catch {
      files = []
    }
    for (const fileName of files) {
      const storedPath = `confessions/${fileName}`
      let mtime: number
      try {
        mtime = Math.floor(statSync(join(primaryFolder, fileName)).mtimeMs / 1000)
      } catch {
        continue // file vanished between listing and stat — skip it this pass
      }
      const source =
        findSourceByPath('boc_sources', storedPath) ??
        boc.createSource({
          displayName: fileName.replace(/\.md$/i, ''),
          author: null,
          mdRelativePath: storedPath
        })
      if (!shouldReindex(mtimes[storedPath], mtime, source.status)) continue
      try {
        const summary = await indexBocSections(source.id, join(primaryFolder, fileName))
        markIndexStatus('boc_sources', source.id, summary.sections > 0)
        mtimes[storedPath] = mtime
        changed = true
      } catch {
        /* best effort — a malformed file just won't produce sections */
      }
    }
  }

  const commentaryFolder = bocCommentaryVaultDir()
  if (existsSync(commentaryFolder)) {
    let files: string[]
    try {
      files = readdirSync(commentaryFolder).filter((f) => /\.md$/i.test(f))
    } catch {
      files = []
    }
    for (const fileName of files) {
      const storedPath = `confessions-commentary/${fileName}`
      let mtime: number
      try {
        mtime = Math.floor(statSync(join(commentaryFolder, fileName)).mtimeMs / 1000)
      } catch {
        continue
      }
      const source =
        findSourceByPath('boc_commentary_sources', storedPath) ??
        boc.createCommentarySource({
          displayName: fileName.replace(/\.md$/i, ''),
          author: null,
          mdRelativePath: storedPath
        })
      if (!shouldReindex(mtimes[storedPath], mtime, source.status)) continue
      try {
        const summary = await indexBocCommentary(source.id, join(commentaryFolder, fileName))
        markIndexStatus('boc_commentary_sources', source.id, summary.excerpts > 0)
        mtimes[storedPath] = mtime
        changed = true
      } catch {
        /* best effort — a malformed file just won't produce excerpts */
      }
    }
  }

  if (changed) saveIndexMtimes(mtimes)
}
