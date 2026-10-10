import { useCallback, useEffect, useState } from 'react'
import { Church } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { api } from '../../lib/api'
import { fathersVolumeLabel } from '@shared/fathers'
import type { FathersVolume, Quote } from '@shared/ipc'
import { QuoteCard, makeQuoteCardHandlers } from './QuotesPanel'

/**
 * Church Fathers quotes, location-anchored like BocQuotesPanel: it follows the focused Fathers
 * tab's volume (or whichever volume you pick) and lists that volume's saved quotes. Quotes carry
 * their own citation ("Irenaeus, *Against Heresies* III.3 (ANF 1:415)"), so book is null.
 */
export function FathersQuotesPanel() {
  const tabs = useStore((s) => s.tabs)
  const paneOrder = useStore((s) => s.paneOrder)
  const activePaneId = useStore((s) => s.activePaneId)
  const noteReloadToken = useStore((s) => s.noteReloadToken)

  const focusedTabId = paneOrder.find((p) => p.id === activePaneId)?.activeTabId
  const focusedTab = tabs.find((t) => t.id === focusedTabId)

  const [volumes, setVolumes] = useState<FathersVolume[]>([])
  const [volumeCode, setVolumeCode] = useState<string>('')
  const [quotes, setQuotes] = useState<Quote[]>([])

  // Reload the volume list at mount and whenever the library changes (the startup sync indexes,
  // or drops, volumes after the panel may already be open).
  useEffect(() => {
    const load = (): void => {
      void api
        .listFathersVolumes()
        .then((v) => {
          const indexed = v.filter((x) => x.status === 'indexed')
          setVolumes(indexed)
          setVolumeCode((cur) => (cur && indexed.some((x) => x.code === cur) ? cur : indexed[0]?.code || ''))
        })
        .catch(() => setVolumes([]))
    }
    load()
    return api.onLibraryChanged(load)
  }, [])

  // Follow the focused Fathers tab's volume.
  useEffect(() => {
    if (focusedTab?.kind === 'fathers' && focusedTab.fathersVolume) setVolumeCode(focusedTab.fathersVolume)
  }, [focusedTab?.kind, focusedTab?.fathersVolume])

  const reload = useCallback(async () => {
    setQuotes(volumeCode ? await api.listFathersQuotes(volumeCode) : [])
  }, [volumeCode])

  useEffect(() => {
    void reload()
  }, [reload, noteReloadToken])

  const handlers = makeQuoteCardHandlers({
    setQuotes,
    refresh: reload,
    onDelete: (id) => void api.deleteQuote(id).then(reload)
  })

  if (volumes.length === 0) {
    return <div className="quotes-empty">No Church Fathers volumes indexed yet.</div>
  }

  return (
    <div className="quotes-list">
      <div className="qn-head">
        <Church size={14} />
        <select className="book-select" value={volumeCode} onChange={(e) => setVolumeCode(e.target.value)}>
          {volumes.map((v) => (
            <option key={v.code} value={v.code}>
              {fathersVolumeLabel(v.code)} — {v.title}
            </option>
          ))}
        </select>
      </div>
      {quotes.length === 0 ? (
        <div className="quotes-empty">
          No quotes from {fathersVolumeLabel(volumeCode)} yet. Select text in the Church Fathers reader and
          pick a colour to capture it here.
        </div>
      ) : (
        quotes.map((q) => <QuoteCard key={q.id} q={q} book={null} style="footnote" handlers={handlers} />)
      )}
    </div>
  )
}
