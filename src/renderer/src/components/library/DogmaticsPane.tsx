import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
  Copy,
  Check,
  Quote,
  ArrowLeft
} from 'lucide-react'
import { useStore } from '../../store/useStore'
import type { Tab } from '../../store/useStore'
import { api } from '../../lib/api'
import type {
  DogmaticsOutlineWork,
  DogmaticsSectionRow,
  DogmaticsSource,
  DogmaticsTopicCount,
  DogmaticsTreatment
} from '@shared/ipc'

/** Below this pane width the book list collapses to its rail automatically. */
const NARROW_PANE = 560

/** Where a dogmatics reader tab points. */
interface Place {
  sourceId: string
  work: number
  book: number
  section?: number
  /** Read as part of a topic: the reader steps through the topic's treatments. */
  topic?: string
}

/** "12 On the Church", "On the Church" or "12". */
function bookLabel(b: { number: string | null; title: string }): string {
  return [b.number, b.title].filter(Boolean).join(' ')
}

/** "§ 5 Its necessity", "§ 5" or "Its necessity"; an unnumbered, untitled section is the book's
 *  introduction. */
function sectionLabel(s: DogmaticsSectionRow): string {
  return [s.number ? `§ ${s.number}` : '', s.title].filter(Boolean).join(' ') || 'Introduction'
}

/** A section's text, split from its original when the file gives both (English, then a line
 *  "Latin:" and the Latin, as the converted commentaries do). */
function splitOriginal(text: string): { text: string; original: string | null } {
  const m = /\n\s*Latin:\s*\n/.exec(text)
  if (!m) return { text, original: null }
  return { text: text.slice(0, m.index).trim(), original: text.slice(m.index + m[0].length).trim() }
}

function ReaderSection({
  section,
  onQuote
}: {
  section: DogmaticsSectionRow
  onQuote: (text: string) => Promise<void>
}) {
  const textRef = useRef<HTMLDivElement>(null)
  const [copied, setCopied] = useState(false)
  const [added, setAdded] = useState(false)
  const { text, original } = useMemo(() => splitOriginal(section.text), [section.text])

  /** The user's selection if it falls inside this section, else the section's text. */
  const quotableText = (): string => {
    const sel = window.getSelection()
    if (sel && !sel.isCollapsed && sel.rangeCount > 0 && textRef.current) {
      if (textRef.current.contains(sel.getRangeAt(0).commonAncestorContainer)) {
        const picked = sel.toString().trim()
        if (picked) return picked
      }
    }
    return text
  }

  const flash = (set: (v: boolean) => void): void => {
    set(true)
    window.setTimeout(() => set(false), 1400)
  }

  return (
    <section className="cr-excerpt" data-section={section.ordinal}>
      <div className="cr-excerpt-head">
        <span className="cr-ref dg-section-ref">{sectionLabel(section)}</span>
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
        {text}
        {original && (
          <details className="dg-original">
            <summary>Latin</summary>
            {original}
          </details>
        )}
      </div>
    </section>
  )
}

/** Where a topic's treatment is: the book, and its first section on the topic if the book is on
 *  something else. */
function treatmentPlace(t: DogmaticsTreatment, topic: string): Place {
  return { sourceId: t.sourceId, work: t.workOrdinal, book: t.bookOrdinal, section: t.matched[0]?.ordinal, topic }
}

/** One topic across every dogmatics: each work's treatment of it, to read one after another. */
function TopicOverview({
  treatments,
  onOpen
}: {
  treatments: DogmaticsTreatment[] | null
  onOpen: (t: DogmaticsTreatment, section?: number) => void
}) {
  if (treatments === null) return <div className="sr-loading">Loading…</div>
  // One group per work, in the order the treatments come (the user's order of sources).
  const groups: { key: string; name: string; author: string | null; items: DogmaticsTreatment[] }[] = []
  for (const t of treatments) {
    const key = `${t.sourceId}|${t.workOrdinal}`
    const last = groups[groups.length - 1]
    if (last?.key === key) last.items.push(t)
    else groups.push({ key, name: t.workTitle || t.sourceName, author: t.author, items: [t] })
  }
  return (
    <div className="cr-text">
      {groups.length === 0 && <p className="cr-none">No dogmatics takes this up yet.</p>}
      {groups.map((g) => (
        <div key={g.key} className="dg-topic-work">
          <div className="dg-topic-work-head">
            <span className="cr-all-name">{g.name}</span>
            {g.author && <span className="cr-all-author">{g.author}</span>}
          </div>
          {g.items.map((t) => (
            <div key={`${t.bookOrdinal}`} className="dg-treatment">
              <button className="dg-treatment-book" onClick={() => onOpen(t)}>
                {bookLabel({ number: t.bookNumber, title: t.bookTitle })}
                <span className="dg-treatment-count">
                  {t.matched.length === 0
                    ? `${t.sections} section${t.sections === 1 ? '' : 's'}`
                    : `${t.matched.length} of ${t.sections} sections`}
                </span>
              </button>
              {t.matched.map((m) => (
                <button key={m.ordinal} className="dg-treatment-section" onClick={() => onOpen(t, m.ordinal)}>
                  {[m.number ? `§ ${m.number}` : '', m.title].filter(Boolean).join(' ')}
                </button>
              ))}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

/**
 * A dogmatics in a center workspace pane, read the way a commentary is: pick a work, then one
 * of its books, and read it section by section. Or pick a topic (Baptism, Justification…) and
 * read every work's treatment of it, one after another.
 */
export function DogmaticsPane({ tab }: { tab: Tab }) {
  const setTabContent = useStore((s) => s.setTabContent)
  const bumpReload = useStore((s) => s.bumpReload)

  const [sources, setSources] = useState<DogmaticsSource[] | null>(null)
  const [outline, setOutline] = useState<DogmaticsOutlineWork[] | null>(null)
  const [sections, setSections] = useState<DogmaticsSectionRow[] | null>(null)
  const [topics, setTopics] = useState<DogmaticsTopicCount[] | null>(null)
  const [treatments, setTreatments] = useState<DogmaticsTreatment[] | null>(null)
  const [navMode, setNavMode] = useState<'works' | 'topics'>(tab.dogmaticsTopic ? 'topics' : 'works')
  const [navCollapsed, setNavCollapsed] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)
  const bodyRef = useRef<HTMLDivElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
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

  // A tab can outlive its source (its file removed from the vault): fall back to the first one.
  const source = sources?.find((s) => s.id === tab.dogmaticsSourceId) ?? sources?.[0] ?? null
  const work = tab.dogmaticsWork ?? 1
  const book = tab.dogmaticsBook ?? 1
  const topicId = tab.dogmaticsTopic
  const overview = !!topicId && book === 0

  useEffect(() => {
    void api.getSession('dogmaticsNavCollapsed').then((v) => setNavCollapsed(v === '1'))
  }, [])

  // Sources change in the background: the startup install of the shipped dogmatics.
  useEffect(() => api.onLibraryChanged(() => setReloadToken((n) => n + 1)), [])

  useEffect(() => {
    void api.listDogmaticsSources().then(setSources)
    void api.listDogmaticsTopics().then(setTopics)
  }, [reloadToken])

  useEffect(() => {
    if (!topicId) {
      setTreatments(null)
      return
    }
    let alive = true
    void api.listDogmaticsTopic(topicId).then((t) => {
      if (alive) setTreatments(t)
    })
    return () => {
      alive = false
    }
  }, [topicId, reloadToken])

  useEffect(() => {
    if (!source) return
    let alive = true
    void api.listDogmaticsOutline(source.id).then((o) => {
      if (alive) setOutline(o)
    })
    return () => {
      alive = false
    }
  }, [source?.id, source?.indexedAt, reloadToken])

  useEffect(() => {
    if (!source || overview) return
    let alive = true
    setSections(null)
    void api.listDogmaticsBook(source.id, work, book).then((rows) => {
      if (alive) setSections(rows)
    })
    return () => {
      alive = false
    }
  }, [source?.id, source?.indexedAt, work, book, overview, reloadToken])

  // Land on the requested section (or the top) once the book or overview has rendered.
  useEffect(() => {
    if (!bodyRef.current) return
    if (overview) {
      bodyRef.current.scrollTop = 0
      return
    }
    if (!sections) return
    const el = tab.sectionOrdinal
      ? bodyRef.current.querySelector(`[data-section="${tab.sectionOrdinal}"]`)
      : null
    if (el) el.scrollIntoView({ block: 'start' })
    else bodyRef.current.scrollTop = 0
  }, [sections, tab.sectionOrdinal, overview])

  const go = (place: Place): void => {
    setPeek(false)
    setTabContent(tab.id, {
      kind: 'dogmatics',
      dogmaticsSourceId: place.sourceId,
      dogmaticsWork: place.work,
      dogmaticsBook: place.book,
      sectionOrdinal: place.section,
      dogmaticsTopic: place.topic
    })
    void api.setSession('lastDogmatics', JSON.stringify(place))
  }

  /** A topic's overview: the source/work stay as they were, for coming back to them. */
  const openTopic = (id: string): void =>
    go({ sourceId: source?.id ?? '', work, book: 0, topic: id })

  const pickSource = async (id: string): Promise<void> => {
    const first = (await api.listDogmaticsOutline(id))[0]
    go({ sourceId: id, work: first?.ordinal ?? 1, book: first?.books[0]?.ordinal ?? 1 })
  }

  const toggleNav = (next: boolean): void => {
    if (narrow) {
      setPeek(!next)
      return
    }
    setNavCollapsed(next)
    void api.setSession('dogmaticsNavCollapsed', next ? '1' : '0')
  }

  // Prev/next: through a topic's treatments when reading a topic, else the books in order.
  const sequence = useMemo((): (Place & { label: string })[] => {
    if (topicId && treatments) {
      return treatments.map((t) => ({
        ...treatmentPlace(t, topicId),
        label: `${t.author || t.workTitle || t.sourceName}: ${bookLabel({ number: t.bookNumber, title: t.bookTitle })}`
      }))
    }
    return (outline ?? []).flatMap((w) =>
      w.books.map((b) => ({ sourceId: source?.id ?? '', work: w.ordinal, book: b.ordinal, label: bookLabel(b) }))
    )
  }, [outline, treatments, topicId, source?.id])
  const at = sequence.findIndex(
    (p) => p.sourceId === (source?.id ?? '') && p.work === work && p.book === book
  )
  const prev = at > 0 ? sequence[at - 1] : null
  const next = at >= 0 && at < sequence.length - 1 ? sequence[at + 1] : null
  const current = outline?.find((w) => w.ordinal === work)
  const currentBook = current?.books.find((b) => b.ordinal === book)
  const currentTopic = topics?.find((x) => x.id === topicId)

  const quote = (s: DogmaticsSectionRow, text: string): Promise<void> =>
    source
      ? api
          .addDogmaticsQuote({ sourceId: source.id, workOrdinal: work, bookOrdinal: book, sectionOrdinal: s.ordinal, text })
          .then(bumpReload)
      : Promise.resolve()

  let main: React.ReactNode
  if (sources === null) {
    main = <div className="sr-loading">Loading dogmatics…</div>
  } else if (!source) {
    main = (
      <div className="cr-empty">
        <p>No dogmatics yet.</p>
        <p>Put a dogmatics Markdown file in your vault’s dogmatics folder and it appears here.</p>
      </div>
    )
  } else if (overview) {
    main = (
      <div className="scripture-reader compact">
        <div className="sr-head">
          <span className="sr-title">{currentTopic?.name ?? 'Topic'}</span>
        </div>
        <div className="sr-body" ref={bodyRef}>
          <TopicOverview
            treatments={treatments}
            onOpen={(t, section) => go({ ...treatmentPlace(t, topicId!), section: section ?? t.matched[0]?.ordinal })}
          />
        </div>
      </div>
    )
  } else if (outline && outline.length === 0) {
    main = (
      <div className="cr-empty">
        <p>{source.displayName} has nothing indexed yet.</p>
      </div>
    )
  } else {
    main = (
      <div className="scripture-reader compact">
        <div className="sr-head">
          {topicId && (
            <button className="icon-btn dg-back" title="Back to the topic" onClick={() => openTopic(topicId)}>
              <ArrowLeft size={14} /> {currentTopic?.name ?? 'Topic'}
            </button>
          )}
          <button className="icon-btn" title={prev?.label} disabled={!prev} onClick={() => prev && go(prev)}>
            <ChevronLeft size={16} />
          </button>
          <span className="sr-title">{currentBook ? bookLabel(currentBook) : ''}</span>
          {source.author && <span className="sr-abbr">{source.author}</span>}
          <button className="icon-btn" title={next?.label} disabled={!next} onClick={() => next && go(next)}>
            <ChevronRight size={16} />
          </button>
        </div>
        <div className="sr-body" ref={bodyRef}>
          <div className="cr-text">
            <div className="cr-source">{current?.title || source.displayName}</div>
            {sections === null ? (
              <div className="sr-loading">Loading…</div>
            ) : sections.length === 0 ? (
              <p className="cr-none">Nothing here.</p>
            ) : (
              sections.map((s) => <ReaderSection key={s.ordinal} section={s} onQuote={(text) => quote(s, text)} />)
            )}
          </div>
        </div>
      </div>
    )
  }

  const worksList =
    source &&
    (outline ?? []).map((w) => (
      <div key={w.ordinal} className="sv-testament">
        {(outline!.length > 1 || (w.title && w.title !== source.displayName)) && (
          <div className="sv-testament-head">{w.title || source.displayName}</div>
        )}
        {w.books.map((b) => (
          <button
            key={b.ordinal}
            className={`sv-book${!topicId && work === w.ordinal && book === b.ordinal ? ' active' : ''}`}
            title={bookLabel(b)}
            onClick={() => go({ sourceId: source.id, work: w.ordinal, book: b.ordinal })}
          >
            {bookLabel(b)}
          </button>
        ))}
      </div>
    ))

  const topicsList = (
    <div className="sv-testament">
      {topics && topics.length === 0 && <div className="sv-testament-head">No topics found yet</div>}
      {(topics ?? []).map((x) => (
        <button
          key={x.id}
          className={`sv-book${topicId === x.id ? ' active' : ''}`}
          title={`${x.works} work${x.works === 1 ? '' : 's'}`}
          onClick={() => openTopic(x.id)}
        >
          {x.name}
          <span className="dg-topic-count">{x.works}</span>
        </button>
      ))}
    </div>
  )

  return (
    <div className="scripture-view" ref={rootRef}>
      {!showNav ? (
        <div className="sv-nav-rail">
          <button className="rail-btn" title="Show books" onClick={() => toggleNav(false)}>
            <PanelLeftOpen size={16} />
          </button>
        </div>
      ) : (
        <div className="sv-nav">
          <div className="sv-nav-top">
            <div className="sv-nav-bar">
              <span className="sv-nav-title">Dogmatics</span>
              <button className="icon-btn" title="Hide books" onClick={() => toggleNav(true)}>
                <PanelLeftClose size={15} />
              </button>
            </div>
            <div className="dg-mode">
              <button className={navMode === 'works' ? 'active' : ''} onClick={() => setNavMode('works')}>
                Works
              </button>
              <button className={navMode === 'topics' ? 'active' : ''} onClick={() => setNavMode('topics')}>
                Topics
              </button>
            </div>
            {navMode === 'works' && sources && sources.length > 0 && (
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
          <div className="sv-books">{navMode === 'works' ? worksList : topicsList}</div>
        </div>
      )}

      <div className="sv-main">{main}</div>
    </div>
  )
}
