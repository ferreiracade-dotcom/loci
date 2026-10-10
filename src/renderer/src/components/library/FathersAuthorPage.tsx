import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { api } from '../../lib/api'
import { FATHERS_SERIES_LABEL } from '@shared/fathers'
import type { FathersAuthor, FathersWork } from '@shared/ipc'

/** One Father's page: name, dates, a short bio, and every work indexed from the vault's
 *  volumes, grouped by volume, each linking to where the work begins. */
export function FathersAuthorPage({
  authorId,
  onOpenWork
}: {
  authorId: string
  onOpenWork: (volumeCode: string, sectionId: string) => void
}) {
  const [author, setAuthor] = useState<FathersAuthor | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    setLoading(true)
    void api
      .getFathersAuthor(authorId)
      .then((a) => {
        if (!alive) return
        setAuthor(a)
        setLoading(false)
      })
      .catch(() => {
        if (!alive) return
        setAuthor(null)
        setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [authorId])

  if (loading) {
    return (
      <div className="sr-loading">
        <Loader2 size={18} className="spin" /> Loading…
      </div>
    )
  }
  if (!author) return <div className="sr-error">No works indexed for this author.</div>

  const byVolume = new Map<string, FathersWork[]>()
  for (const w of author.works) {
    const list = byVolume.get(w.volumeCode) ?? []
    list.push(w)
    byVolume.set(w.volumeCode, list)
  }

  return (
    <div className="fathers-author sr-body">
      <div className="sr-text">
        <h2 className="fathers-author-name">{author.name}</h2>
        {author.datesLabel && <div className="fathers-author-dates">{author.datesLabel}</div>}
        {author.bio && <p className="fathers-author-bio">{author.bio}</p>}
        {author.works.length === 0 ? (
          <p className="fathers-author-bio">No indexed works.</p>
        ) : (
          [...byVolume.entries()].map(([code, works]) => (
            <div key={code} className="fathers-author-vol">
              <div className="fathers-author-vol-head">
                {FATHERS_SERIES_LABEL[works[0].series]} {works[0].volumeNumber} — {works[0].volumeTitle}
              </div>
              {works.map((w) => (
                <button
                  key={`${code}|${w.workTitle}|${w.firstSectionId}`}
                  className="fathers-author-work"
                  onClick={() => onOpenWork(w.volumeCode, w.firstSectionId)}
                >
                  <span>{w.workTitle || '(untitled)'}</span>
                  <span className="fathers-author-count">{w.sectionCount}</span>
                </button>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
