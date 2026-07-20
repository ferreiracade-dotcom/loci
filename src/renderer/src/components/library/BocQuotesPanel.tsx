import { useCallback, useEffect, useState } from 'react'
import { BookMarked } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { api } from '../../lib/api'
import { BOC_DOCUMENTS, bocDocument } from '@shared/bookOfConcord'
import type { BocSource, Quote } from '@shared/ipc'
import { QuoteCard, makeQuoteCardHandlers } from './QuotesPanel'

/**
 * Book of Concord quotes, location-anchored like ScriptureHighlightsPanel: it follows the
 * focused BoC tab's document and lists that document's saved quotes from the first indexed
 * BoC source. Quotes carry their own BoC citation, so book is null.
 */
export function BocQuotesPanel() {
  const tabs = useStore((s) => s.tabs)
  const paneOrder = useStore((s) => s.paneOrder)
  const activePaneId = useStore((s) => s.activePaneId)
  const noteReloadToken = useStore((s) => s.noteReloadToken)

  const focusedTabId = paneOrder.find((p) => p.id === activePaneId)?.activeTabId
  const focusedTab = tabs.find((t) => t.id === focusedTabId)

  const [sources, setSources] = useState<BocSource[]>([])
  const [commentarySources, setCommentarySources] = useState<BocSource[]>([])
  const [documentCode, setDocumentCode] = useState('AC')
  const [quotes, setQuotes] = useState<Quote[]>([])

  // Used only for the "no BoC content indexed at all" empty state below — the quote query
  // itself is document-scoped and no longer needs a specific source id.
  const hasAnyBocSource = sources.length > 0 || commentarySources.length > 0

  useEffect(() => {
    void api.listBocSources().then(setSources)
    void api.listBocCommentarySources().then(setCommentarySources)
  }, [])

  // Follow the focused BoC tab's document.
  useEffect(() => {
    if (focusedTab?.kind === 'boc' && focusedTab.documentCode) setDocumentCode(focusedTab.documentCode)
  }, [focusedTab?.kind, focusedTab?.documentCode])

  const reload = useCallback(async () => {
    setQuotes(await api.listBocQuotesForDocument(documentCode))
  }, [documentCode])

  useEffect(() => {
    void reload()
  }, [reload, noteReloadToken])

  const handlers = makeQuoteCardHandlers({
    setQuotes,
    refresh: reload,
    onDelete: (id) => void api.deleteQuote(id).then(reload)
  })

  if (!hasAnyBocSource) {
    return <div className="quotes-empty">No Confessions text indexed yet.</div>
  }

  return (
    <div className="quotes-list">
      <div className="qn-head">
        <BookMarked size={14} />
        <select
          className="book-select"
          value={documentCode}
          onChange={(e) => setDocumentCode(e.target.value)}
        >
          {BOC_DOCUMENTS.map((d) => (
            <option key={d.code} value={d.code}>
              {d.title}
            </option>
          ))}
        </select>
      </div>
      {quotes.length === 0 ? (
        <div className="quotes-empty">
          No quotes from {bocDocument(documentCode)?.title ?? documentCode} yet. Select text in the
          Confessions reader and pick a colour to capture it here.
        </div>
      ) : (
        quotes.map((q) => <QuoteCard key={q.id} q={q} book={null} style="footnote" handlers={handlers} />)
      )}
    </div>
  )
}
