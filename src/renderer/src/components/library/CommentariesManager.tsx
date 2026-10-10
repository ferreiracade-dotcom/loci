import { useEffect, useState } from 'react'
import { X, Plus, Trash2, ChevronUp, ChevronDown, RefreshCw, FlagTriangleRight, Loader2, Download, Check } from 'lucide-react'
import { api } from '../../lib/api'
import { DrawerOverlay } from '../DrawerOverlay'
import { CommentaryReviewQueue } from './CommentaryReviewQueue'
import type { CommentaryIndexProgress, CommentarySource, SermonIndexModule } from '@shared/ipc'

/** Move the item at `index` up or down one spot; a no-op at either end. */
function moved<T>(list: T[], index: number, dir: -1 | 1): T[] {
  const j = index + dir
  if (j < 0 || j >= list.length) return list
  const next = list.slice()
  ;[next[index], next[j]] = [next[j], next[index]]
  return next
}

type View =
  | { kind: 'list' }
  | { kind: 'indexing'; sourceId: string | null }
  | { kind: 'review'; sourceId: string }

function coverageLabel(source: CommentarySource): string {
  if (source.status === 'unindexed') return 'Not indexed yet'
  if (!source.indexedAt) return source.status
  return `${source.status} · indexed ${new Date(source.indexedAt).toLocaleDateString()}`
}

export function CommentariesManager({ onClose }: { onClose: () => void }) {
  const [sources, setSources] = useState<CommentarySource[]>([])
  const [flaggedCounts, setFlaggedCounts] = useState<Record<string, number>>({})
  const [view, setView] = useState<View>({ kind: 'list' })
  const [toast, setToast] = useState<string | null>(null)
  const [catalog, setCatalog] = useState<SermonIndexModule[]>([])

  const reload = async (): Promise<void> => {
    const list = await api.listCommentarySources()
    setSources(list)
    const counts: Record<string, number> = {}
    for (const s of list) counts[s.id] = (await api.listFlaggedCommentary(s.id)).length
    setFlaggedCounts(counts)
  }

  useEffect(() => {
    void reload()
    void api.listSermonIndexCatalog().then(setCatalog)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && view.kind === 'list') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, view.kind])

  const moveSource = (index: number, dir: -1 | 1): void => {
    const next = moved(sources, index, dir)
    setSources(next)
    void api.reorderCommentarySources(next.map((s) => s.id))
  }

  const removeSource = async (source: CommentarySource): Promise<void> => {
    const inVault = source.pdfRelativePath.startsWith('commentaries/')
    const what = inVault ? 'Its excerpts and its file in your vault will be deleted.' : 'Its excerpts will be deleted.'
    if (!window.confirm(`Remove “${source.displayName}”? ${what}`)) return
    const keepCorrections = !window.confirm(
      'Also delete any saved corrections for this source? Cancel keeps them (in case you re-add it later).'
    )
    await api.deleteCommentarySource(source.id)
    if (!keepCorrections) await api.deleteCommentaryCorrectionsForSource(source.pdfRelativePath)
    await reload()
  }

  const addMarkdown = async (): Promise<void> => {
    try {
      const source = await api.addMarkdownCommentarySource()
      if (!source) return
      await reload()
      await runIndex(source.id)
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Could not add this Markdown file')
    }
  }

  const addMyBible = async (): Promise<void> => {
    try {
      const source = await api.addMyBibleCommentarySource()
      if (!source) return
      await reload()
      await runIndex(source.id)
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Could not add this module')
    }
  }

  // Download, register, then index, all behind the one progress view.
  const installModule = async (slug: string): Promise<void> => {
    setView({ kind: 'indexing', sourceId: null })
    try {
      const source = await api.installSermonIndexModule(slug)
      await reload()
      await runIndex(source.id)
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Could not download this commentary')
      setView({ kind: 'list' })
    }
  }

  const installedFiles = new Set(sources.map((s) => s.pdfRelativePath.toLowerCase()))
  const isInstalled = (m: SermonIndexModule): boolean =>
    installedFiles.has(`commentaries/${m.moduleCode}.commentaries.sqlite3`.toLowerCase())

  const runIndex = async (sourceId: string): Promise<void> => {
    setView({ kind: 'indexing', sourceId })
    const summary = await api.indexCommentarySource(sourceId)
    await reload()
    const coverageNote =
      summary.chaptersWithNoCoverage.length > 0
        ? `; no coverage in ${summary.chaptersWithNoCoverage.length} chapter(s)`
        : ''
    setToast(
      `${summary.totalCount} excerpts indexed (${summary.booksCovered.join(', ') || 'no book detected'}), ` +
        `${summary.flaggedCount} flagged for review${coverageNote}.`
    )
    setView({ kind: 'list' })
  }

  return (
    <DrawerOverlay onClose={view.kind === 'list' ? onClose : () => setView({ kind: 'list' })}>
      <div className="drawer-head">
        <h2 className="drawer-title">Commentaries</h2>
        <button className="icon-btn" title="Close" onClick={onClose}>
          <X size={16} />
        </button>
      </div>
      <div className="drawer-body">
        {toast && <div className="toast commentary-mgr-toast">{toast}</div>}

        {view.kind === 'list' && (
          <>
            <div className="commentary-mgr-list">
              {sources.length === 0 && (
                <p className="folder-hint">
                  No commentaries registered yet. Install one from SermonIndex below, or add a
                  MyBible module or a canonical commentary Markdown (.md) file.
                </p>
              )}
              {sources.map((s, i) => (
                <div className="commentary-mgr-row" key={s.id}>
                  <div className="mgr-reorder">
                    <button
                      className="icon-btn"
                      title="Move up"
                      disabled={i === 0}
                      onClick={() => moveSource(i, -1)}
                    >
                      <ChevronUp size={13} />
                    </button>
                    <button
                      className="icon-btn"
                      title="Move down"
                      disabled={i === sources.length - 1}
                      onClick={() => moveSource(i, 1)}
                    >
                      <ChevronDown size={13} />
                    </button>
                  </div>
                  <div className="commentary-mgr-info">
                    <div className="commentary-mgr-name">{s.displayName}</div>
                    {s.author && <div className="commentary-mgr-author">{s.author}</div>}
                    <div className="commentary-mgr-status">{coverageLabel(s)}</div>
                  </div>
                  <div className="commentary-mgr-actions">
                    {(flaggedCounts[s.id] ?? 0) > 0 && (
                      <button
                        className="btn btn-sm commentary-mgr-flagged"
                        title="Review flagged excerpts"
                        onClick={() => setView({ kind: 'review', sourceId: s.id })}
                      >
                        <FlagTriangleRight size={13} /> {flaggedCounts[s.id]}
                      </button>
                    )}
                    <button
                      className="icon-btn"
                      title={s.status === 'unindexed' ? 'Index' : 'Re-index'}
                      onClick={() => void runIndex(s.id)}
                    >
                      <RefreshCw size={14} />
                    </button>
                    <button
                      className="icon-btn"
                      title="Remove"
                      onClick={() => void removeSource(s)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="commentary-mgr-add">
              <button className="btn btn-sm" onClick={() => void addMarkdown()}>
                <Plus size={14} /> Add Markdown file
              </button>
              <button
                className="btn btn-sm"
                title="A MyBible commentary module (.SQLite3, or the .zip it comes in)"
                onClick={() => void addMyBible()}
              >
                <Plus size={14} /> Add MyBible module
              </button>
            </div>
            <h3 className="commentary-mgr-section">From SermonIndex</h3>
            <div className="commentary-mgr-list">
              {catalog.map((m) => (
                <div className="commentary-mgr-row" key={m.slug}>
                  <div className="commentary-mgr-info">
                    <div className="commentary-mgr-name">{m.title}</div>
                    <div className="commentary-mgr-author">{m.author}</div>
                  </div>
                  <div className="commentary-mgr-actions">
                    {isInstalled(m) ? (
                      <span className="commentary-mgr-status">
                        <Check size={13} /> Installed
                      </span>
                    ) : (
                      <button className="btn btn-sm" onClick={() => void installModule(m.slug)}>
                        <Download size={13} /> Install
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {view.kind === 'indexing' && <IndexingProgress sourceId={view.sourceId} />}

        {view.kind === 'review' && (
          <CommentaryReviewQueue
            sourceId={view.sourceId}
            bookId={sources.find((s) => s.id === view.sourceId)?.bookId ?? null}
            onClose={() => {
              setView({ kind: 'list' })
              void reload()
            }}
          />
        )}
      </div>
    </DrawerOverlay>
  )
}

function progressLabel(p: CommentaryIndexProgress): string {
  if (p.phase === 'downloading') {
    const mb = (n: number): string => (n / 1048576).toFixed(1)
    return p.total > 0 ? `Downloading… ${mb(p.done)} of ${mb(p.total)} MB` : `Downloading… ${mb(p.done)} MB`
  }
  const verb = p.phase === 'extracting' ? 'Reading' : p.phase === 'validating' ? 'Validating' : 'Finishing'
  return `${verb}… ${p.done}/${p.total}`
}

function IndexingProgress({ sourceId }: { sourceId: string | null }) {
  const [progress, setProgress] = useState<CommentaryIndexProgress | null>(null)

  useEffect(() => {
    return api.onCommentaryIndexProgress(setProgress)
  }, [sourceId])

  return (
    <div className="commentary-indexing">
      <Loader2 size={20} className="spin" />
      <p>
        {progress
          ? progressLabel(progress)
          : 'Starting…'}
      </p>
    </div>
  )
}
