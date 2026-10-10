import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { api } from '../../lib/api'
import { resolveCatenaTarget } from '../../lib/fathersCatena'
import { FATHERS_SERIES_LABEL } from '@shared/fathers'
import { bookByCode } from '@shared/scriptureRef'
import type { FathersCatenaGroup } from '@shared/ipc'

/** The Commentary pill's Fathers mode: a catena — what the Church Fathers say on the Bible
 *  passage you are reading, grouped by verse and ordered by author date. It follows the same
 *  trigger as Bible commentary (the last verse clicked), falling back to the open chapter. */
export function FathersCatenaPanel() {
  const lookup = useStore((s) => s.commentaryLookup)
  const passage = useStore((s) => s.scripturePassage)
  const navigateFathers = useStore((s) => s.navigateFathers)

  const target = resolveCatenaTarget(lookup, passage)
  const key = target ? `${target.book}|${target.chapter}|${target.verse ?? ''}` : ''
  const [groups, setGroups] = useState<FathersCatenaGroup[] | null>(null)
  const [cut, setCut] = useState<number | null>(null)

  useEffect(() => {
    if (!target) {
      setGroups(null)
      setCut(null)
      return
    }
    let alive = true
    setGroups(null)
    setCut(null)
    void api
      .fathersCatena(target.book, target.chapter, target.verse)
      .then((r) => {
        if (!alive) return
        setGroups(r.groups)
        setCut(r.truncated ? r.limit : null)
      })
      .catch(() => {
        if (alive) setGroups([])
      })
    return () => {
      alive = false
    }
    // `key` captures every field of `target` that matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  if (!target) {
    return <div className="quotes-empty">Open a Bible chapter, or click a verse, to see what the Fathers say.</div>
  }

  const bookName = bookByCode(target.book)?.name ?? target.book
  const headLabel = `${bookName} ${target.chapter}${target.verse != null ? `:${target.verse}` : ''}`

  return (
    <div className="fathers-catena">
      <div className="fathers-catena-head">Fathers on {headLabel}</div>
      {cut !== null && <div className="quotes-empty">Showing the first {cut} references (earliest authors first).</div>}
      {groups === null ? (
        <div className="sr-loading" style={{ height: 'auto', padding: 12 }}>
          <Loader2 size={16} className="spin" /> Loading…
        </div>
      ) : groups.length === 0 ? (
        <div className="quotes-empty">
          No Fathers cite {headLabel} in the indexed volumes.
        </div>
      ) : (
        groups.map((g) => (
          <div key={g.verse ?? 'chapter'} className="fathers-catena-group">
            {(target.verse == null || groups.length > 1) && (
              <div className="fathers-catena-verse">{g.label}</div>
            )}
            {g.entries.map((e) => (
              <button
                key={`${e.volumeCode}|${e.sectionId}`}
                className="fathers-catena-entry"
                title="Open in the Church Fathers reader"
                onClick={() => navigateFathers(e.volumeCode, e.sectionId)}
              >
                <div className="fathers-catena-who">
                  <span className="fathers-catena-author">{e.authorName ?? 'Unattributed'}</span>
                  {e.datesLabel && <span className="fathers-dates"> {e.datesLabel}</span>}
                </div>
                <div className="fathers-catena-work">
                  {e.workTitle ? `${e.workTitle} — ` : ''}
                  {e.sectionTitle}
                </div>
                <div className="fathers-catena-snippet">{e.snippet}</div>
                <div className="fathers-catena-meta">
                  {FATHERS_SERIES_LABEL[e.series]} {e.volumeNumber}
                  {e.page ? `, p. ${e.page}` : ''} · {e.passage}
                  {e.inNote ? ' · in a footnote' : ''}
                </div>
              </button>
            ))}
          </div>
        ))
      )}
    </div>
  )
}
