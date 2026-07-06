import { useEffect, useState } from 'react'
import { Check, ExternalLink, Trash2, X } from 'lucide-react'
import { api } from '../../lib/api'
import { useStore } from '../../store/useStore'
import { BOOKS, bookByCode } from '@shared/scriptureRef'
import type { CommentaryExcerpt } from '@shared/ipc'

/** Flagged-excerpt review queue for one commentary source (Phase 4). Reachable from the
 *  Commentaries manager's flagged-count badge. */
export function CommentaryReviewQueue({
  sourceId,
  bookId,
  onClose
}: {
  sourceId: string
  /** The source's linked library book, for "View in PDF" — null if unlinked. */
  bookId: string | null
  onClose: () => void
}) {
  const [excerpts, setExcerpts] = useState<CommentaryExcerpt[]>([])
  const [reassigningId, setReassigningId] = useState<string | null>(null)

  const reload = async (): Promise<void> => {
    setExcerpts(await api.listFlaggedCommentary(sourceId))
  }

  useEffect(() => {
    void reload()
  }, [sourceId])

  const confirm = async (id: string): Promise<void> => {
    await api.reviewConfirmCommentaryExcerpt(id)
    await reload()
  }
  const discard = async (id: string): Promise<void> => {
    await api.reviewDiscardCommentaryExcerpt(id)
    await reload()
  }

  return (
    <div className="commentary-review-queue">
      <div className="commentary-review-head">
        <span>{excerpts.length} flagged excerpt(s)</span>
        <button className="btn btn-sm" onClick={onClose}>
          Back to sources
        </button>
      </div>
      {excerpts.length === 0 && <p className="folder-hint">Nothing left to review.</p>}
      {excerpts.map((e) =>
        reassigningId === e.id ? (
          <ReassignForm
            key={e.id}
            excerpt={e}
            onCancel={() => setReassigningId(null)}
            onSaved={async () => {
              setReassigningId(null)
              await reload()
            }}
          />
        ) : (
          <div className="commentary-review-row" key={e.id}>
            <div className="commentary-review-ref">
              {bookByCode(e.book)?.name ?? e.book} {e.chapterStart}:{e.verseStart}
              {e.chapterEnd !== e.chapterStart || e.verseEnd !== e.verseStart
                ? `-${e.chapterEnd}:${e.verseEnd}`
                : ''}{' '}
              <span className="commentary-review-page">p.{e.pageNumber}</span>
            </div>
            {e.flagReasons.length > 0 && (
              <ul className="commentary-review-reasons">
                {e.flagReasons.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            )}
            <div className="commentary-review-text">{e.text.slice(0, 400)}</div>
            <div className="commentary-review-actions">
              <button className="btn btn-sm" onClick={() => void confirm(e.id)}>
                <Check size={13} /> Confirm
              </button>
              <button className="btn btn-sm" onClick={() => setReassigningId(e.id)}>
                Reassign
              </button>
              <button className="btn btn-sm" onClick={() => void discard(e.id)}>
                <Trash2 size={13} /> Discard
              </button>
              <OpenPdfButton bookId={bookId} page={e.pageNumber} />
            </div>
          </div>
        )
      )}
    </div>
  )
}

function OpenPdfButton({ bookId, page }: { bookId: string | null; page: number }) {
  const openBookAt = useStore((s) => s.openBookAt)
  if (!bookId) return null
  return (
    <button className="btn btn-sm" onClick={() => openBookAt(bookId, page)}>
      <ExternalLink size={13} /> View in PDF
    </button>
  )
}

function ReassignForm({
  excerpt,
  onCancel,
  onSaved
}: {
  excerpt: CommentaryExcerpt
  onCancel: () => void
  onSaved: () => void
}) {
  const [book, setBook] = useState(excerpt.book)
  const [chapterStart, setChapterStart] = useState(String(excerpt.chapterStart))
  const [verseStart, setVerseStart] = useState(String(excerpt.verseStart))
  const [chapterEnd, setChapterEnd] = useState(String(excerpt.chapterEnd))
  const [verseEnd, setVerseEnd] = useState(String(excerpt.verseEnd))

  const save = async (): Promise<void> => {
    await api.reviewReassignCommentaryExcerpt(excerpt.id, {
      book,
      chapterStart: Number(chapterStart) || 1,
      verseStart: Number(verseStart) || 1,
      chapterEnd: Number(chapterEnd) || 1,
      verseEnd: Number(verseEnd) || 1
    })
    onSaved()
  }

  return (
    <div className="commentary-review-row commentary-reassign-form">
      <div className="commentary-reassign-fields">
        <select className="field" value={book} onChange={(e) => setBook(e.target.value)}>
          {BOOKS.map((b) => (
            <option key={b.code} value={b.code}>
              {b.name}
            </option>
          ))}
        </select>
        <input className="field" value={chapterStart} onChange={(e) => setChapterStart(e.target.value)} placeholder="ch." />
        <input className="field" value={verseStart} onChange={(e) => setVerseStart(e.target.value)} placeholder="v." />
        <span>-</span>
        <input className="field" value={chapterEnd} onChange={(e) => setChapterEnd(e.target.value)} placeholder="ch." />
        <input className="field" value={verseEnd} onChange={(e) => setVerseEnd(e.target.value)} placeholder="v." />
      </div>
      <div className="commentary-form-actions">
        <button className="btn btn-sm" onClick={onCancel}>
          <X size={13} /> Cancel
        </button>
        <button className="btn btn-primary btn-sm" onClick={() => void save()}>
          <Check size={13} /> Save
        </button>
      </div>
    </div>
  )
}
