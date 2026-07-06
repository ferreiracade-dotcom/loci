import { useEffect, useState } from 'react'
import {
  X,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  RefreshCw,
  FlagTriangleRight,
  Loader2
} from 'lucide-react'
import { useStore } from '../../store/useStore'
import { api } from '../../lib/api'
import { DrawerOverlay } from '../DrawerOverlay'
import { BOOKS } from '@shared/scriptureRef'
import { CommentaryReviewQueue } from './CommentaryReviewQueue'
import type {
  Book,
  CommentaryIndexProgress,
  CommentaryParserConfig,
  CommentaryProfileResult,
  CommentarySource
} from '@shared/ipc'

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
  | { kind: 'pick-book' }
  | { kind: 'details'; book: Book }
  | { kind: 'profiling'; sourceId: string; result: CommentaryProfileResult }
  | { kind: 'indexing'; sourceId: string }
  | { kind: 'review'; sourceId: string }

function coverageLabel(source: CommentarySource): string {
  if (source.status === 'unindexed') return 'Not indexed yet'
  if (!source.indexedAt) return source.status
  return `${source.status} · indexed ${new Date(source.indexedAt).toLocaleDateString()}`
}

export function CommentariesManager({ onClose }: { onClose: () => void }) {
  const books = useStore((s) => s.books)
  const [sources, setSources] = useState<CommentarySource[]>([])
  const [flaggedCounts, setFlaggedCounts] = useState<Record<string, number>>({})
  const [view, setView] = useState<View>({ kind: 'list' })
  const [toast, setToast] = useState<string | null>(null)
  const [browseAll, setBrowseAll] = useState(false)
  const [pickQuery, setPickQuery] = useState('')

  const reload = async (): Promise<void> => {
    const list = await api.listCommentarySources()
    setSources(list)
    const counts: Record<string, number> = {}
    for (const s of list) counts[s.id] = (await api.listFlaggedCommentary(s.id)).length
    setFlaggedCounts(counts)
  }

  useEffect(() => {
    void reload()
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
    if (!window.confirm(`Remove “${source.displayName}”? Its excerpts will be deleted.`)) return
    const keepCorrections = !window.confirm(
      'Also delete any saved corrections for this source? Cancel keeps them (in case you re-add it later).'
    )
    await api.deleteCommentarySource(source.id)
    if (!keepCorrections) await api.deleteCommentaryCorrectionsForSource(source.pdfRelativePath)
    await reload()
  }

  const alreadyRegistered = new Set(sources.map((s) => s.bookId).filter(Boolean))
  const pickable = books.filter((b) => {
    if (alreadyRegistered.has(b.id)) return false
    if (!browseAll && !b.tags.includes('commentary')) return false
    if (pickQuery.trim() && !b.title.toLowerCase().includes(pickQuery.trim().toLowerCase())) return false
    return true
  })

  const startProfiling = async (sourceId: string): Promise<void> => {
    setToast('Sampling the PDF…')
    try {
      const result = await api.profileCommentarySource(sourceId)
      setView({ kind: 'profiling', sourceId, result })
      setToast(null)
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Could not profile this PDF')
    }
  }

  const createFromBook = async (book: Book, displayName: string, author: string): Promise<void> => {
    const source = await api.createCommentarySourceFromBook(book.id, displayName.trim(), author.trim() || null)
    await reload()
    await startProfiling(source.id)
  }

  // Markdown sources have explicit heading boundaries, so they skip profiling entirely and
  // index straight away — both on first add and on re-index.
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

  const runIndex = async (sourceId: string, config?: CommentaryParserConfig): Promise<void> => {
    if (config) await api.updateCommentarySource(sourceId, { parserConfig: JSON.stringify(config) })
    setView({ kind: 'indexing', sourceId })
    const summary = await api.indexCommentarySource(sourceId)
    await reload()
    if (summary.cancelled) {
      setToast('Indexing cancelled.')
    } else {
      const coverageNote =
        summary.chaptersWithNoCoverage.length > 0
          ? `; no coverage in ${summary.chaptersWithNoCoverage.length} chapter(s)`
          : ''
      setToast(
        `${summary.totalCount} excerpts indexed (${summary.booksCovered.join(', ') || 'no book detected'}), ` +
          `${summary.flaggedCount} flagged for review${coverageNote}.`
      )
    }
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
                  No commentaries registered yet. Add a verse-by-verse commentary PDF (tag it
                  &quot;commentary&quot; in the library first), or add a commentary Markdown
                  (.md) file.
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
                      onClick={() =>
                        s.parserConfig || /\.md$/i.test(s.pdfRelativePath)
                          ? void runIndex(s.id)
                          : void startProfiling(s.id)
                      }
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
              <button className="btn btn-primary btn-sm" onClick={() => setView({ kind: 'pick-book' })}>
                <Plus size={14} /> Add PDF source
              </button>
              <button className="btn btn-sm" onClick={() => void addMarkdown()}>
                <Plus size={14} /> Add Markdown file
              </button>
            </div>
          </>
        )}

        {view.kind === 'pick-book' && (
          <div className="commentary-mgr-pick">
            <div className="commentary-pick-controls">
              <input
                className="field"
                placeholder="Filter by title…"
                value={pickQuery}
                onChange={(e) => setPickQuery(e.target.value)}
              />
              <label className="commentary-pick-toggle">
                <input
                  type="checkbox"
                  checked={browseAll}
                  onChange={(e) => setBrowseAll(e.target.checked)}
                />
                Browse full library
              </label>
            </div>
            {pickable.length === 0 && (
              <p className="folder-hint">
                {browseAll
                  ? 'No matching books.'
                  : 'No books tagged "commentary" yet — tag one from its info panel, or browse the full library.'}
              </p>
            )}
            <div className="commentary-pick-list">
              {pickable.map((b) => (
                <button key={b.id} className="commentary-pick-row" onClick={() => setView({ kind: 'details', book: b })}>
                  <span className="commentary-pick-title">{b.title}</span>
                  {b.author && <span className="commentary-pick-author">{b.author}</span>}
                </button>
              ))}
            </div>
          </div>
        )}

        {view.kind === 'details' && (
          <DetailsForm
            book={view.book}
            onCancel={() => setView({ kind: 'pick-book' })}
            onSubmit={(displayName, author) => void createFromBook(view.book, displayName, author)}
          />
        )}

        {view.kind === 'profiling' && (
          <ProfilingConfirm
            result={view.result}
            onCancel={() => setView({ kind: 'list' })}
            onConfirm={(seedBook, seedChapter) =>
              void runIndex(view.sourceId, { profile: view.result.profile, seedBook, seedChapter })
            }
          />
        )}

        {view.kind === 'indexing' && (
          <IndexingProgress
            sourceId={view.sourceId}
            onCancel={() => void api.cancelCommentaryIndexing(view.sourceId)}
          />
        )}

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

function DetailsForm({
  book,
  onCancel,
  onSubmit
}: {
  book: Book
  onCancel: () => void
  onSubmit: (displayName: string, author: string) => void
}) {
  const [displayName, setDisplayName] = useState(book.title)
  const [author, setAuthor] = useState(book.author ?? '')

  return (
    <div className="commentary-details-form">
      <label className="field-label">Display name</label>
      <input className="field" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
      <label className="field-label">Author</label>
      <input className="field" value={author} onChange={(e) => setAuthor(e.target.value)} />
      <div className="commentary-form-actions">
        <button className="btn btn-sm" onClick={onCancel}>
          Back
        </button>
        <button
          className="btn btn-primary btn-sm"
          disabled={!displayName.trim()}
          onClick={() => onSubmit(displayName, author)}
        >
          Continue
        </button>
      </div>
    </div>
  )
}

function ProfilingConfirm({
  result,
  onCancel,
  onConfirm
}: {
  result: CommentaryProfileResult
  onCancel: () => void
  onConfirm: (seedBook: string | null, seedChapter: number | null) => void
}) {
  const needsSeed = result.profile.shape !== 'book-chapter-verse'
  const [seedBook, setSeedBook] = useState('')
  const [seedChapter, setSeedChapter] = useState('1')

  return (
    <div className="commentary-profiling">
      <p className="folder-hint">
        Detected header style: <strong>{result.profile.shape}</strong> ({result.samples.length}{' '}
        sample matches shown below). Confirm this looks right before indexing the whole PDF.
      </p>
      <div className="commentary-profile-samples">
        {result.samples.map((s, i) => (
          <div className="commentary-profile-sample" key={i}>
            <span className="commentary-sample-page">p.{s.page}</span>
            <span className="commentary-sample-header">{s.headerRaw}</span>
            <span className="commentary-sample-snippet">{s.snippetAfter}</span>
          </div>
        ))}
        {result.samples.length === 0 && (
          <p className="folder-hint">
            No header-shaped lines were found in the sampled pages — this PDF may not have
            explicit verse headers, or may need a larger sample. Indexing will likely find
            nothing.
          </p>
        )}
      </div>
      {needsSeed && (
        <div className="commentary-seed-fields">
          <p className="folder-hint">
            This header style doesn&apos;t restate the book/chapter on its own — set where the
            commentary starts.
          </p>
          <label className="field-label">Starting book</label>
          <select className="field" value={seedBook} onChange={(e) => setSeedBook(e.target.value)}>
            <option value="">— none —</option>
            {BOOKS.map((b) => (
              <option key={b.code} value={b.code}>
                {b.name}
              </option>
            ))}
          </select>
          <label className="field-label">Starting chapter</label>
          <input
            className="field"
            type="number"
            min={1}
            value={seedChapter}
            onChange={(e) => setSeedChapter(e.target.value)}
          />
        </div>
      )}
      <div className="commentary-form-actions">
        <button className="btn btn-sm" onClick={onCancel}>
          Cancel
        </button>
        <button
          className="btn btn-primary btn-sm"
          onClick={() => onConfirm(seedBook || null, seedBook ? Number(seedChapter) || 1 : null)}
        >
          Confirm &amp; index
        </button>
      </div>
    </div>
  )
}

function IndexingProgress({ sourceId, onCancel }: { sourceId: string; onCancel: () => void }) {
  const [progress, setProgress] = useState<CommentaryIndexProgress | null>(null)

  useEffect(() => {
    return api.onCommentaryIndexProgress(setProgress)
  }, [sourceId])

  return (
    <div className="commentary-indexing">
      <Loader2 size={20} className="spin" />
      <p>
        {progress
          ? `${progress.phase === 'extracting' ? 'Reading' : progress.phase === 'validating' ? 'Validating' : 'Finishing'}… ${progress.done}/${progress.total}`
          : 'Starting…'}
      </p>
      <button className="btn btn-sm" onClick={onCancel}>
        Cancel
      </button>
    </div>
  )
}
