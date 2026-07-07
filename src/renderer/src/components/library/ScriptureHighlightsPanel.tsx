import { useCallback, useEffect, useState } from 'react'
import { ScrollText } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { api } from '../../lib/api'
import { bookByCode } from '@shared/scriptureRef'
import type { Quote, ScriptureQuoteBook } from '@shared/ipc'
import { QuoteCard, type CardHandlers } from './QuotesPanel'

/**
 * Scripture highlights, location-anchored like the Book Notes panel: it follows the open
 * passage's book, groups saved quotes by chapter, and reuses QuoteCard (drag/copy/tags/
 * annotations) — quotes carry their own scripture citation, so book is null.
 */
export function ScriptureHighlightsPanel() {
  const translation = useStore((s) => s.scriptureTranslation)
  const passage = useStore((s) => s.scripturePassage)
  const noteReloadToken = useStore((s) => s.noteReloadToken)
  const navigateScripture = useStore((s) => s.navigateScripture)
  const deleteScriptureHighlight = useStore((s) => s.deleteScriptureHighlight)

  const [book, setBook] = useState<string>(passage?.book ?? '')
  const [books, setBooks] = useState<ScriptureQuoteBook[]>([])
  const [quotes, setQuotes] = useState<Quote[]>([])

  // Follow the open passage's book.
  useEffect(() => {
    if (passage?.book) setBook(passage.book)
  }, [passage?.book])

  const reloadBooks = useCallback(async () => {
    if (!translation) {
      setBooks([])
      return
    }
    setBooks(await api.listScriptureQuoteBooks(translation))
  }, [translation])

  const reload = useCallback(async () => {
    if (!translation || !book) {
      setQuotes([])
      return
    }
    setQuotes(await api.listScriptureQuotes(translation, book))
  }, [translation, book])

  // Reload on capture/delete (store bumps noteReloadToken) and when book/translation changes.
  useEffect(() => {
    void reloadBooks()
  }, [reloadBooks, noteReloadToken])
  useEffect(() => {
    void reload()
  }, [reload, noteReloadToken])

  const handlers: CardHandlers = {
    onSetTags: (id, tags) => void api.setQuoteTags(id, tags).then(reload),
    onSetAnnotations: (id, annotations) => {
      setQuotes((qs) => qs.map((q) => (q.id === id ? { ...q, annotations } : q)))
      void api.setQuoteAnnotations(id, annotations)
    },
    onSetText: (id, text) => {
      setQuotes((qs) => qs.map((q) => (q.id === id ? { ...q, text } : q)))
      void api.setQuoteText(id, text).then(reload)
    },
    onSetCitation: (id, citation) => void api.setQuoteCitation(id, citation).then(reload),
    // Delete via the store so the reader un-marks the verses too (shared token bump);
    // the noteReloadToken effects below also reload this panel's list + book counts.
    onDelete: (id) => void deleteScriptureHighlight(id)
  }

  if (books.length === 0) {
    return (
      <div className="quotes-empty">
        Select verse text in a BSB chapter and pick a colour to capture it here. Each highlight
        becomes a card you can tag, comment on, copy, or drag into a note.
      </div>
    )
  }

  // Group the current book's quotes by chapter.
  const chapters: { chapter: number; items: Quote[] }[] = []
  for (const q of quotes) {
    const ch = q.scriptureChapter ?? 0
    let g = chapters.find((c) => c.chapter === ch)
    if (!g) {
      g = { chapter: ch, items: [] }
      chapters.push(g)
    }
    g.items.push(q)
  }

  const bookName = bookByCode(book)?.name ?? book

  return (
    <div className="quotes-list">
      <div className="qn-head">
        <ScrollText size={14} />
        <select className="book-select" value={book} onChange={(e) => setBook(e.target.value)}>
          {books.map((b) => (
            <option key={b.book} value={b.book}>
              {b.name} ({b.count})
            </option>
          ))}
        </select>
      </div>

      {quotes.length === 0 ? (
        <div className="quotes-empty">No highlights in {bookName} yet.</div>
      ) : (
        chapters.map((g) => (
          <div key={g.chapter} className="sh-chapter">
            <button
              className="sh-chapter-head"
              title="Go to this chapter"
              onClick={() => navigateScripture(book, g.chapter)}
            >
              {bookName} {g.chapter}
            </button>
            {g.items.map((q) => (
              <QuoteCard key={q.id} q={q} book={null} style="footnote" handlers={handlers} />
            ))}
          </div>
        ))
      )}
    </div>
  )
}
