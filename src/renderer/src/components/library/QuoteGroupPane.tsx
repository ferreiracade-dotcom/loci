import { useCallback, useEffect, useState } from 'react'
import { useStore } from '../../store/useStore'
import { api } from '../../lib/api'
import { authorFor } from '../../lib/quoteGrouping'
import type { Book, Quote } from '@shared/ipc'
import type { QuoteGroupRef } from '../../store/useStore'
import { QuoteCard, type CardHandlers } from './QuotesPanel'

/**
 * A group of saved quotes shown as a center workspace pane: the quotes for one PDF, one Bible
 * chapter, or one commentary source, each a fully editable `QuoteCard` (tags, annotations, inline
 * rich text, delete). Reuses the same card as the reference-bar panels.
 */
export function QuoteGroupPane({ group }: { group: QuoteGroupRef }) {
  const books = useStore((s) => s.books)
  const noteReloadToken = useStore((s) => s.noteReloadToken)
  const bumpReload = useStore((s) => s.bumpReload)
  const refreshLibrary = useStore((s) => s.refreshLibrary)

  const [quotes, setQuotes] = useState<Quote[]>([])

  const reload = useCallback(async () => {
    if (group.type === 'book') {
      setQuotes(await api.listQuotes(group.bookId))
    } else if (group.type === 'scripture') {
      const all = await api.listScriptureQuotes(group.translation, group.book)
      // `chapter` omitted = every chapter of this book (the "Bible book" grouping mode).
      setQuotes(group.chapter == null ? all : all.filter((q) => q.scriptureChapter === group.chapter))
    } else if (group.type === 'commentary') {
      setQuotes(await api.listCommentaryQuotes(group.sourceId))
    } else if (group.type === 'author') {
      const all = await api.listAllQuotes()
      setQuotes(all.filter((q) => authorFor(q, books) === group.author))
    } else {
      const all = await api.listAllQuotes()
      setQuotes(all.filter((q) => (group.tag ? q.tags.includes(group.tag) : q.tags.length === 0)))
    }
  }, [group, books])

  useEffect(() => {
    void reload()
  }, [reload, noteReloadToken])

  const handlers: CardHandlers = {
    onSetTags: (id, tags) => void api.setQuoteTags(id, tags).then(() => bumpReload()),
    onSetAnnotations: (id, annotations) => {
      setQuotes((qs) => qs.map((q) => (q.id === id ? { ...q, annotations } : q)))
      void api.setQuoteAnnotations(id, annotations)
    },
    onSetText: (id, text) => {
      setQuotes((qs) => qs.map((q) => (q.id === id ? { ...q, text } : q)))
      void api.setQuoteText(id, text).then(() => bumpReload())
    },
    onSetCitation: (id, citation) => void api.setQuoteCitation(id, citation).then(() => bumpReload()),
    onDelete: (id) =>
      void api.deleteQuote(id).then(() => {
        bumpReload()
        void refreshLibrary()
      })
  }

  const book: Book | null =
    group.type === 'book' ? books.find((b) => b.id === group.bookId) ?? null : null

  return (
    <div className="quote-group-pane">
      <div className="quote-group-head">
        <span className="quotes-count">
          {quotes.length} quote{quotes.length === 1 ? '' : 's'}
        </span>
      </div>
      <div className="quote-group-body">
        {quotes.length === 0 ? (
          <div className="quotes-empty">No quotes here yet.</div>
        ) : (
          quotes.map((q) => (
            <QuoteCard key={q.id} q={q} book={book} style="footnote" handlers={handlers} />
          ))
        )}
      </div>
    </div>
  )
}
