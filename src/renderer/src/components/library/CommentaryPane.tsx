import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
  Replace,
  Settings2,
  X,
  Copy,
  Check,
  Quote,
  ScrollText
} from 'lucide-react'
import { useStore } from '../../store/useStore'
import type { Tab } from '../../store/useStore'
import { api } from '../../lib/api'
import { BOOKS, bookByCode } from '@shared/scriptureRef'
import type { CommentaryBookCoverage, CommentaryExcerpt, CommentarySource } from '@shared/ipc'
import { CommentariesManager } from './CommentariesManager'

/** Below this pane width the book list collapses to its rail automatically. */
const NARROW_PANE = 560

/** Where a commentary reader tab points. */
interface Place {
  sourceId: string
  book: string
  chapter: number
  verse?: number
}

/** "10:3", "10:3-5" or "10:30-11:2". */
function verseLabel(e: CommentaryExcerpt): string {
  if (e.chapterStart !== e.chapterEnd) return `${e.chapterStart}:${e.verseStart}-${e.chapterEnd}:${e.verseEnd}`
  return e.verseStart === e.verseEnd ? `${e.chapterStart}:${e.verseStart}` : `${e.chapterStart}:${e.verseStart}-${e.verseEnd}`
}

/** One excerpt in the reader, with its verse heading (opens the passage in the Bible) and
 *  copy / add-quote actions, as in the reference bar. */
function ReaderExcerpt({
  excerpt,
  bookName,
  onOpenVerse,
  onQuote
}: {
  excerpt: CommentaryExcerpt
  bookName: string
  onOpenVerse: () => void
  onQuote: (text: string) => Promise<void>
}) {
  const textRef = useRef<HTMLDivElement>(null)
  const [copied, setCopied] = useState(false)
  const [added, setAdded] = useState(false)

  /** The user's selection if it falls inside this excerpt, else the whole excerpt. */
  const quotableText = (): string => {
    const sel = window.getSelection()
    if (sel && !sel.isCollapsed && sel.rangeCount > 0 && textRef.current) {
      if (textRef.current.contains(sel.getRangeAt(0).commonAncestorContainer)) {
        const picked = sel.toString().trim()
        if (picked) return picked
      }
    }
    return excerpt.text
  }

  const flash = (set: (v: boolean) => void): void => {
    set(true)
    window.setTimeout(() => set(false), 1400)
  }

  return (
    <section className="cr-excerpt" data-verse={excerpt.verseStart}>
      <div className="cr-excerpt-head">
        <button className="cr-ref" title="Open this passage in the Bible" onClick={onOpenVerse}>
          <ScrollText size={12} />
          {bookName} {verseLabel(excerpt)}
        </button>
        <div className="cr-excerpt-actions">
          <button
            className="commentary-excerpt-act"
            title="Add as a quote (select text first to quote just part of it)"
            onClick={() => void onQuote(quotableText()).then(() => flash(setAdded))}
          >
            {added ? <Check size={12} /> : <Quote size={12} />} Add quote
          </button>
          <button
            className="commentary-excerpt-act"
            title="Copy (select text first to copy just part of it)"
            onClick={() => void navigator.clipboard.writeText(quotableText()).then(() => flash(setCopied))}
          >
            {copied ? <Check size={12} /> : <Copy size={12} />} Copy
          </button>
        </div>
      </div>
      <div ref={textRef} className="cr-excerpt-text">
        {excerpt.text}
      </div>
    </section>
  )
}

/**
 * A commentary in a center workspace pane, read the way SermonIndex presents one: pick a
 * commentary, then a book and chapter, and read its comments verse by verse. The verse-click
 * lookup in the reference bar is separate and unchanged; this is for reading straight through.
 */
export function CommentaryPane({
  tab,
  onClose,
  onReplace
}: {
  tab: Tab
  onClose?: () => void
  onReplace?: () => void
}) {
  const setTabContent = useStore((s) => s.setTabContent)
  const tabs = useStore((s) => s.tabs)
  const focusTab = useStore((s) => s.focusTab)
  const openTabInSplit = useStore((s) => s.openTabInSplit)
  const bumpReload = useStore((s) => s.bumpReload)

  const [sources, setSources] = useState<CommentarySource[] | null>(null)
  const [coverage, setCoverage] = useState<CommentaryBookCoverage[] | null>(null)
  const [excerpts, setExcerpts] = useState<CommentaryExcerpt[] | null>(null)
  const [expanded, setExpanded] = useState<string | null>(tab.book ?? null)
  const [navCollapsed, setNavCollapsed] = useState(false)
  const [managerOpen, setManagerOpen] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)
  const bodyRef = useRef<HTMLDivElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  // In a narrow pane (one side of a split) the book list would squeeze the text to a sliver,
  // so it stays on its rail there whatever the saved preference, opening only on demand
  // ("peek") until a chapter is picked.
  const [narrow, setNarrow] = useState(false)
  const [peek, setPeek] = useState(false)
  const showNav = narrow ? peek : !navCollapsed

  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => setNarrow(entry.contentRect.width < NARROW_PANE))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // A tab can outlive its source (removed in the manager): fall back to the first one.
  const source = sources?.find((s) => s.id === tab.commentarySourceId) ?? sources?.[0] ?? null
  const book = tab.book ?? 'MAT'
  const chapter = tab.chapter ?? 1
  const bookName = bookByCode(book)?.name ?? book

  useEffect(() => {
    void api.getSession('commentaryNavCollapsed').then((v) => setNavCollapsed(v === '1'))
  }, [])

  // Sources (and their coverage) change in the background: the startup install of the default
  // commentaries, or an index run in the manager.
  useEffect(() => api.onLibraryChanged(() => setReloadToken((n) => n + 1)), [])

  useEffect(() => {
    void api.listCommentarySources().then(setSources)
  }, [reloadToken, managerOpen])

  useEffect(() => {
    if (!source) return
    let alive = true
    void api.listCommentaryCoverage(source.id).then((c) => {
      if (alive) setCoverage(c)
    })
    return () => {
      alive = false
    }
  }, [source?.id, source?.indexedAt, reloadToken])

  useEffect(() => {
    if (!source) return
    let alive = true
    setExcerpts(null)
    void api.listCommentaryChapter(source.id, book, chapter).then((rows) => {
      if (alive) setExcerpts(rows)
    })
    return () => {
      alive = false
    }
  }, [source?.id, source?.indexedAt, book, chapter, reloadToken])

  useEffect(() => {
    setExpanded(book)
  }, [book])

  // Land on the requested verse (or the top of the chapter) once the chapter has rendered.
  useEffect(() => {
    if (!excerpts || !bodyRef.current) return
    const target = tab.verse
      ? excerpts.find(
          (e) => e.verseStart <= tab.verse! && (e.chapterEnd > chapter || e.verseEnd >= tab.verse!)
        )
      : undefined
    const el = target ? bodyRef.current.querySelector(`[data-verse="${target.verseStart}"]`) : null
    if (el) el.scrollIntoView({ block: 'start' })
    else bodyRef.current.scrollTop = 0
  }, [excerpts, tab.verse, chapter])

  const go = (place: Place): void => {
    setPeek(false)
    setTabContent(tab.id, {
      kind: 'commentary',
      commentarySourceId: place.sourceId,
      book: place.book,
      chapter: place.chapter,
      verse: place.verse
    })
    void api.setSession('lastCommentary', JSON.stringify(place))
  }

  // Switching commentaries keeps the reader on the same chapter when the new one covers it.
  const pickSource = async (id: string): Promise<void> => {
    const cov = await api.listCommentaryCoverage(id)
    const sameBook = cov.find((c) => c.book === book)
    if (sameBook?.chapters.includes(chapter)) go({ sourceId: id, book, chapter })
    else if (sameBook) go({ sourceId: id, book, chapter: sameBook.chapters[0] })
    else if (cov[0]) go({ sourceId: id, book: cov[0].book, chapter: cov[0].chapters[0] })
    else go({ sourceId: id, book, chapter })
  }

  const toggleNav = (next: boolean): void => {
    if (narrow) {
      setPeek(!next)
      return
    }
    setNavCollapsed(next)
    void api.setSession('commentaryNavCollapsed', next ? '1' : '0')
  }

  // Prev/next walk the chapters this commentary actually covers, across book boundaries.
  const sequence = useMemo(
    () => (coverage ?? []).flatMap((c) => c.chapters.map((ch) => ({ book: c.book, chapter: ch }))),
    [coverage]
  )
  const at = sequence.findIndex((p) => p.book === book && p.chapter === chapter)
  const prev = at > 0 ? sequence[at - 1] : null
  const next = at >= 0 && at < sequence.length - 1 ? sequence[at + 1] : null

  /** Show the excerpt's passage in a Bible tab: the open one if there is one, else beside this. */
  const openVerse = (e: CommentaryExcerpt): void => {
    const highlight =
      e.chapterEnd === e.chapterStart
        ? Array.from({ length: e.verseEnd - e.verseStart + 1 }, (_, i) => e.verseStart + i)
        : [e.verseStart]
    const content = { kind: 'bible' as const, book: e.book, chapter: e.chapterStart, highlight }
    const bible = tabs.find((t) => t.kind === 'bible')
    if (bible) {
      setTabContent(bible.id, { ...content, translation: bible.translation })
      focusTab(bible.id)
    } else {
      openTabInSplit(content)
    }
  }

  const quote = (e: CommentaryExcerpt, text: string): Promise<void> =>
    api
      .addCommentaryQuote({ sourceId: e.sourceId, book: e.book, chapter: e.chapterStart, verseStart: e.verseStart, text })
      .then(bumpReload)

  const covered = new Map((coverage ?? []).map((c) => [c.book, c.chapters]))
  const bookList = (label: string, testament: 'OT' | 'NT'): React.ReactNode => {
    const books = BOOKS.filter((b) => b.testament === testament && covered.has(b.code))
    if (books.length === 0) return null
    return (
      <div className="sv-testament">
        <div className="sv-testament-head">{label}</div>
        {books.map((b) => (
          <div key={b.code} className="sv-book-wrap">
            <button
              className={`sv-book${book === b.code ? ' active' : ''}`}
              onClick={() => setExpanded(expanded === b.code ? null : b.code)}
            >
              {b.name}
            </button>
            {expanded === b.code && source && (
              <div className="sv-chapters">
                {covered.get(b.code)!.map((ch) => (
                  <button
                    key={ch}
                    className={`sv-chap${book === b.code && chapter === ch ? ' active' : ''}`}
                    onClick={() => go({ sourceId: source.id, book: b.code, chapter: ch })}
                  >
                    {ch}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    )
  }

  const manageButton = (
    <button className="icon-btn" title="Manage commentaries" onClick={() => setManagerOpen(true)}>
      <Settings2 size={15} />
    </button>
  )

  let main: React.ReactNode
  if (sources === null) {
    main = <div className="sr-loading">Loading commentaries…</div>
  } else if (!source) {
    main = (
      <div className="cr-empty">
        <p>No commentaries yet.</p>
        <button className="btn btn-sm" onClick={() => setManagerOpen(true)}>
          Add a commentary
        </button>
      </div>
    )
  } else if (coverage && coverage.length === 0) {
    main = (
      <div className="cr-empty">
        <p>{source.displayName} has nothing indexed yet.</p>
        <button className="btn btn-sm" onClick={() => setManagerOpen(true)}>
          Open the commentaries manager
        </button>
      </div>
    )
  } else {
    main = (
      <div className="scripture-reader compact">
        <div className="sr-head">
          <button
            className="icon-btn"
            title={prev ? `${bookByCode(prev.book)?.name} ${prev.chapter}` : undefined}
            disabled={!prev}
            onClick={() => prev && go({ sourceId: source.id, ...prev })}
          >
            <ChevronLeft size={16} />
          </button>
          <span className="sr-title">
            {bookName} {chapter}
          </span>
          {source.author && <span className="sr-abbr">{source.author}</span>}
          <button
            className="icon-btn"
            title={next ? `${bookByCode(next.book)?.name} ${next.chapter}` : undefined}
            disabled={!next}
            onClick={() => next && go({ sourceId: source.id, ...next })}
          >
            <ChevronRight size={16} />
          </button>
        </div>
        <div className="sr-body" ref={bodyRef}>
          <div className="cr-text">
            <div className="cr-source">{source.displayName}</div>
            {excerpts === null ? (
              <div className="sr-loading">Loading…</div>
            ) : excerpts.length === 0 ? (
              <p className="cr-none">
                {source.displayName} has no comments on {bookName} {chapter}.
              </p>
            ) : (
              excerpts.map((e) => (
                <ReaderExcerpt
                  key={e.id}
                  excerpt={e}
                  bookName={bookName}
                  onOpenVerse={() => openVerse(e)}
                  onQuote={(text) => quote(e, text)}
                />
              ))
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="scripture-view" ref={rootRef}>
      {!showNav ? (
        <div className="sv-nav-rail">
          <button className="rail-btn" title="Show books" onClick={() => toggleNav(false)}>
            <PanelLeftOpen size={16} />
          </button>
          <button className="rail-btn" title="Manage commentaries" onClick={() => setManagerOpen(true)}>
            <Settings2 size={16} />
          </button>
          {onReplace && (
            <button className="rail-btn" title="Change content" onClick={onReplace}>
              <Replace size={16} />
            </button>
          )}
          {onClose && (
            <button className="rail-btn" title="Close pane" onClick={onClose}>
              <X size={16} />
            </button>
          )}
        </div>
      ) : (
        <div className="sv-nav">
          <div className="sv-nav-top">
            <div className="sv-nav-bar">
              <span className="sv-nav-title">Commentary</span>
              {manageButton}
              {onReplace && (
                <button className="icon-btn" title="Change content" onClick={onReplace}>
                  <Replace size={15} />
                </button>
              )}
              <button className="icon-btn" title="Hide books" onClick={() => toggleNav(true)}>
                <PanelLeftClose size={15} />
              </button>
              {onClose && (
                <button className="icon-btn" title="Close pane" onClick={onClose}>
                  <X size={15} />
                </button>
              )}
            </div>
            {sources && sources.length > 0 && (
              <select
                className="sv-translation"
                value={source?.id ?? ''}
                onChange={(e) => void pickSource(e.target.value)}
              >
                {sources.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.displayName}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="sv-books">
            {bookList('Old Testament', 'OT')}
            {bookList('New Testament', 'NT')}
          </div>
        </div>
      )}

      <div className="sv-main">{main}</div>
      {managerOpen && <CommentariesManager onClose={() => setManagerOpen(false)} />}
    </div>
  )
}
