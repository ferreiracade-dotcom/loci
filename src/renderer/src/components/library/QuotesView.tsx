import { useCallback, useEffect, useMemo, useState } from 'react'
import { BookMarked, ScrollText, MessageSquareQuote, Layers, UserRound, Tag as TagIcon } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { api } from '../../lib/api'
import { authorFor } from '../../lib/quoteGrouping'
import type { Quote, QuoteGroups } from '@shared/ipc'
import type { QuoteGroupRef } from '../../store/useStore'

type GroupMode = 'source' | 'bibleBook' | 'author' | 'tag'

const GROUP_MODE_OPTIONS: { id: GroupMode; label: string }[] = [
  { id: 'source', label: 'Source' },
  { id: 'bibleBook', label: 'Bible book' },
  { id: 'author', label: 'Author' },
  { id: 'tag', label: 'Tag' }
]

/**
 * The Quotes navigator (full-center), modeled on the Notes list. Every PDF, Bible chapter/book,
 * commentary source, author, or tag with saved quotes shows up as its own row (depending on the
 * "Group by" mode); picking one opens that group's quotes in a center workspace pane.
 */
export function QuotesView() {
  const translation = useStore((s) => s.scriptureTranslation)
  const noteReloadToken = useStore((s) => s.noteReloadToken)
  const openQuotesGroup = useStore((s) => s.openQuotesGroup)
  const tabs = useStore((s) => s.tabs)
  const books = useStore((s) => s.books)

  const [groups, setGroups] = useState<QuoteGroups>({ books: [], scripture: [], commentary: [] })
  const [allQuotes, setAllQuotes] = useState<Quote[]>([])
  const [groupMode, setGroupMode] = useState<GroupMode>('source')

  useEffect(() => {
    void api.getSession('quotesGroupMode').then((v) => {
      if (v === 'bibleBook' || v === 'author' || v === 'tag') setGroupMode(v)
    })
  }, [])

  const changeGroupMode = (v: GroupMode): void => {
    setGroupMode(v)
    void api.setSession('quotesGroupMode', v)
  }

  const reload = useCallback(async () => {
    const [g, all] = await Promise.all([
      api.listQuoteGroups(translation || 'BSB'),
      api.listAllQuotes()
    ])
    setGroups(g)
    setAllQuotes(all)
  }, [translation])

  useEffect(() => {
    void reload()
  }, [reload, noteReloadToken])

  // "Bible book" mode collapses the chapter-level rows from listQuoteGroups into one row per book.
  const bibleByBook = useMemo(() => {
    const map = new Map<string, { book: string; name: string; count: number }>()
    for (const s of groups.scripture) {
      const e = map.get(s.book)
      if (e) e.count += s.count
      else map.set(s.book, { book: s.book, name: s.name, count: s.count })
    }
    return [...map.values()]
  }, [groups.scripture])

  // "Author" mode cuts across books and commentary sources (Scripture has no author of its own).
  const byAuthor = useMemo(() => {
    const map = new Map<string, number>()
    for (const q of allQuotes) {
      const author = authorFor(q, books)
      map.set(author, (map.get(author) ?? 0) + 1)
    }
    return [...map.entries()]
      .map(([author, count]) => ({ author, count }))
      .sort((a, b) => a.author.localeCompare(b.author))
  }, [allQuotes, books])

  // "Tag" mode: a quote with multiple tags appears under each one (mirrors the Library grouping).
  const byTag = useMemo(() => {
    const map = new Map<string, number>()
    let untagged = 0
    for (const q of allQuotes) {
      if (q.tags.length === 0) {
        untagged++
        continue
      }
      for (const t of q.tags) map.set(t, (map.get(t) ?? 0) + 1)
    }
    const tags = [...map.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => a.tag.localeCompare(b.tag))
    return { tags, untagged }
  }, [allQuotes])

  // Light up the row whose group is open in a tab.
  const activeGroup = tabs.find((t) => t.kind === 'quotes')?.quotesGroup
  const isActive = (ref: QuoteGroupRef): boolean => {
    if (!activeGroup || activeGroup.type !== ref.type) return false
    if (activeGroup.type === 'book' && ref.type === 'book') return activeGroup.bookId === ref.bookId
    if (activeGroup.type === 'scripture' && ref.type === 'scripture') {
      return activeGroup.book === ref.book && activeGroup.chapter === ref.chapter
    }
    if (activeGroup.type === 'commentary' && ref.type === 'commentary') {
      return activeGroup.sourceId === ref.sourceId
    }
    if (activeGroup.type === 'author' && ref.type === 'author') return activeGroup.author === ref.author
    if (activeGroup.type === 'tag' && ref.type === 'tag') return activeGroup.tag === ref.tag
    return false
  }

  const row = (
    ref: QuoteGroupRef,
    icon: React.ReactNode,
    label: string,
    count: number,
    key: string
  ): React.ReactNode => (
    <div
      key={key}
      className={`note-row${isActive(ref) ? ' active' : ''}`}
      onClick={() => openQuotesGroup(ref)}
    >
      {icon}
      <span className="note-row-title">{label}</span>
      <span className="quotes-row-count">{count}</span>
    </div>
  )

  const total =
    groupMode === 'author'
      ? byAuthor.length
      : groupMode === 'tag'
        ? byTag.tags.length + (byTag.untagged > 0 ? 1 : 0)
        : groups.books.length + groups.scripture.length + groups.commentary.length

  return (
    <div className="quotes-nav">
      <div className="quotes-nav-head">
        <span>Quotes</span>
        <div className="group-wrap" title="Group quotes by">
          <Layers size={14} />
          <select
            className="group-select"
            value={groupMode}
            onChange={(e) => changeGroupMode(e.target.value as GroupMode)}
          >
            {GROUP_MODE_OPTIONS.map((g) => (
              <option key={g.id} value={g.id}>
                Group: {g.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="quotes-nav-list">
        {total === 0 ? (
          <div className="notes-list-empty">
            No quotes yet. Capture them from a book, a Bible chapter, or a commentary bubble.
          </div>
        ) : groupMode === 'author' ? (
          <>
            <div className="notes-group-head">Author</div>
            {byAuthor.map((a) =>
              row(
                { type: 'author', author: a.author },
                <UserRound size={14} />,
                a.author,
                a.count,
                a.author
              )
            )}
          </>
        ) : groupMode === 'tag' ? (
          <>
            <div className="notes-group-head">Tag</div>
            {byTag.tags.map((t) =>
              row({ type: 'tag', tag: t.tag }, <TagIcon size={14} />, `#${t.tag}`, t.count, t.tag)
            )}
            {byTag.untagged > 0 &&
              row(
                { type: 'tag', tag: '' },
                <TagIcon size={14} />,
                'Untagged',
                byTag.untagged,
                '__untagged'
              )}
          </>
        ) : (
          <>
            {groups.books.length > 0 && (
              <>
                <div className="notes-group-head">Books</div>
                {groups.books.map((b) =>
                  row(
                    { type: 'book', bookId: b.bookId, title: b.title },
                    <BookMarked size={14} />,
                    b.title,
                    b.count,
                    b.bookId
                  )
                )}
              </>
            )}

            {(groupMode === 'bibleBook' ? bibleByBook.length > 0 : groups.scripture.length > 0) && (
              <>
                <div className="notes-group-head">Bible</div>
                {groupMode === 'bibleBook'
                  ? bibleByBook.map((s) =>
                      row(
                        {
                          type: 'scripture',
                          book: s.book,
                          translation: translation || 'BSB',
                          name: s.name
                        },
                        <ScrollText size={14} />,
                        s.name,
                        s.count,
                        s.book
                      )
                    )
                  : groups.scripture.map((s) =>
                      row(
                        {
                          type: 'scripture',
                          book: s.book,
                          chapter: s.chapter,
                          translation: translation || 'BSB',
                          name: s.name
                        },
                        <ScrollText size={14} />,
                        `${s.name} ${s.chapter}`,
                        s.count,
                        `${s.book}-${s.chapter}`
                      )
                    )}
              </>
            )}

            {groups.commentary.length > 0 && (
              <>
                <div className="notes-group-head">Commentary</div>
                {groups.commentary.map((c) =>
                  row(
                    { type: 'commentary', sourceId: c.sourceId, displayName: c.displayName },
                    <MessageSquareQuote size={14} />,
                    c.displayName,
                    c.count,
                    c.sourceId
                  )
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
