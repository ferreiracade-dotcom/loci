import { useEffect, useState } from 'react'
import {
  FileText,
  BookOpen,
  ScrollText,
  Plus,
  FolderKanban,
  X,
  Search as SearchIcon,
  ChevronRight,
  ChevronDown,
  Check,
  Quote
} from 'lucide-react'
import { useStore } from '../../store/useStore'
import type { TabContent, QuoteGroupRef } from '../../store/useStore'
import { api } from '../../lib/api'
import { bookByCode, BOOKS } from '@shared/scriptureRef'
import { bookMatchesQuery } from '../../lib/bookSearch'
import { SearchResults } from './SearchResults'
import { BookListRow } from './LibraryView'
import { ScriptureReader } from './ScriptureReader'
import { useOpenElsewhereMenu } from './OpenElsewhere'
import type { ProjectItem, QuoteGroups, SearchHit } from '@shared/ipc'

type BrowseTab = 'notes' | 'library' | 'bible' | 'quotes'

/** Human label for a scripture project item, e.g. "John 3". */
function scriptureLabel(item: { book: string; chapter: number }): string {
  return `${bookByCode(item.book)?.name ?? item.book} ${item.chapter}`
}

/**
 * The content picker. Search standalone notes and library books, open the Bible, or type a new
 * name to create a note. With `paneId` it fills that pane; without one (an empty workspace) it
 * opens into a fresh pane.
 *
 * When `restrictToProject` is set (this pane's sibling is a Project note), the picker's top
 * section shows that project's existing sources (plus a real content search scoped to just that
 * collection) — the Notes/Library/Bible/Quotes tabs below become "Add a source" (Quotes excepted,
 * since a quote group isn't a project-source kind — its tab just opens the group directly).
 * Without a project, the same tabs are the picker's only content: each browses and opens directly.
 */
export function PanePicker({
  tabId,
  heading,
  restrictToProject
}: {
  tabId?: string
  heading?: string
  restrictToProject?: ProjectItem[]
}) {
  const notes = useStore((s) => s.standaloneNotes)
  const books = useStore((s) => s.books)
  const setTabContent = useStore((s) => s.setTabContent)
  const createNoteInTab = useStore((s) => s.createNoteInTab)
  const openTab = useStore((s) => s.openTab)
  const createNote = useStore((s) => s.createNote)
  const scripturePassage = useStore((s) => s.scripturePassage)
  const scriptureTranslation = useStore((s) => s.scriptureTranslation)
  const scriptureTranslations = useStore((s) => s.scriptureTranslations)
  const loadScripture = useStore((s) => s.loadScripture)
  const addProjectItem = useStore((s) => s.addProjectItem)
  const removeProjectItem = useStore((s) => s.removeProjectItem)

  // The Bible tab's preview needs a resolved translation; nothing else in this picker
  // guarantees `loadScripture` has run yet (unlike the reference-panel Bible view).
  useEffect(() => {
    if (scriptureTranslations.length === 0) void loadScripture()
  }, [scriptureTranslations.length, loadScripture])

  const { onContextMenu, menu } = useOpenElsewhereMenu()
  const [quoteGroups, setQuoteGroups] = useState<QuoteGroups>({ books: [], scripture: [], commentary: [] })

  // Load once (and whenever the translation changes, since scripture-quote groups are
  // translation-scoped) — not debounced/query-dependent, matching the Notes/Library pattern
  // of filtering an already-loaded list client-side rather than a live search call.
  useEffect(() => {
    void api.listQuoteGroups(scriptureTranslation || 'BSB').then(setQuoteGroups)
  }, [scriptureTranslation])

  const [q, setQ] = useState('')
  const [contentHits, setContentHits] = useState<SearchHit[]>([])
  const [browseTab, setBrowseTab] = useState<BrowseTab>('notes')
  const [browseQ, setBrowseQ] = useState('')
  const [expandedBook, setExpandedBook] = useState<string | null>(null)
  const [previewChapter, setPreviewChapter] = useState<{ book: string; chapter: number } | null>(
    null
  )
  const query = q.trim()
  const ql = query.toLowerCase()
  const browseQl = browseQ.trim().toLowerCase()

  const bookIds = restrictToProject
    ? new Set(restrictToProject.filter((i) => i.kind === 'book').map((i) => i.id))
    : null
  const notePaths = restrictToProject
    ? new Set(restrictToProject.filter((i) => i.kind === 'note').map((i) => i.path))
    : null
  const scriptureItems = restrictToProject
    ? restrictToProject.filter((i): i is Extract<ProjectItem, { kind: 'scripture' }> => i.kind === 'scripture')
    : []

  // Existing project sources (restricted mode's top section only).
  const noteHits = restrictToProject
    ? notes.filter((n) => notePaths?.has(n.path)).filter((n) => !ql || n.title.toLowerCase().includes(ql))
    : []
  const bookHits = restrictToProject
    ? books.filter((b) => bookIds?.has(b.id)).filter((b) => !ql || b.title.toLowerCase().includes(ql))
    : []
  const scriptureHits = scriptureItems.filter((s) => !ql || scriptureLabel(s).toLowerCase().includes(ql))

  // Notes/Library/Bible/Quotes tabs — browse-and-open everywhere; restricted mode additionally
  // scopes Notes/Library to what's NOT already a source (so browsing doubles as "add").
  const tabNoteHits = (restrictToProject ? notes.filter((n) => !notePaths?.has(n.path)) : notes).filter(
    (n) => !browseQl || n.title.toLowerCase().includes(browseQl)
  )
  const tabProjects = tabNoteHits.filter((n) => n.type === 'project')
  const tabRegularNotes = tabNoteHits.filter((n) => n.type !== 'project')
  const tabBookHits = (restrictToProject ? books.filter((b) => !bookIds?.has(b.id)) : books).filter((b) =>
    bookMatchesQuery(b, browseQ)
  )
  const tabQuoteBookHits = quoteGroups.books.filter((b) => !browseQl || b.title.toLowerCase().includes(browseQl))
  const tabQuoteScriptureHits = quoteGroups.scripture.filter(
    (s) => !browseQl || s.name.toLowerCase().includes(browseQl)
  )
  const tabQuoteCommentaryHits = quoteGroups.commentary.filter(
    (c) => !browseQl || c.displayName.toLowerCase().includes(browseQl)
  )

  // In restricted mode, the top box also runs a real content search over the collection.
  useEffect(() => {
    if (!restrictToProject || !query) {
      setContentHits([])
      return
    }
    let cancelled = false
    const t = setTimeout(() => {
      void api.search(query, { kind: 'all', items: restrictToProject }).then((hits) => {
        if (!cancelled) setContentHits(hits)
      })
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, restrictToProject])

  // Fill the target tab, or open a fresh tab when there's no target.
  const place = (content: TabContent): void => {
    if (tabId) setTabContent(tabId, content)
    else openTab(content)
  }
  const placeBible = (book: string, chapter: number): void => {
    place({ kind: 'bible', book, chapter, highlight: [], translation: scriptureTranslation })
  }
  const openBible = (): void => {
    const p = scripturePassage ?? { book: 'JHN', chapter: 1, highlight: [] }
    placeBible(p.book, p.chapter)
  }
  const onHit = (h: SearchHit): void => {
    if ((h.kind === 'page' || h.kind === 'quote') && h.bookId) place({ kind: 'pdf', bookId: h.bookId })
    else if (h.kind === 'note' && h.ref) place({ kind: 'note', notePath: h.ref })
    else if (h.kind === 'scripture' && h.ref) {
      const [book, chapterStr] = h.ref.split(':')
      if (book && chapterStr) placeBible(book, Number(chapterStr))
    }
  }
  const newNote = (): void => {
    if (!query) return
    if (tabId) {
      void createNoteInTab(tabId, query).then((note) => {
        if (restrictToProject) void addProjectItem({ kind: 'note', path: note.path })
      })
    } else {
      void createNote(query)
    }
  }
  const newProject = (): void => {
    if (!query) return
    if (tabId) void createNoteInTab(tabId, query, 'project')
    else void createNote(query, 'project')
  }

  return (
    <div className="pane-picker">
      <div className="pp-box">
        {heading && <div className="pp-heading">{heading}</div>}
        <input
          className="pp-search"
          autoFocus
          placeholder={
            restrictToProject
              ? 'Search this project’s sources…'
              : 'Type a new note or project name…'
          }
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && query && !restrictToProject) newNote()
          }}
        />
        {!restrictToProject && (
          <div className="pp-quick">
            {query && (
              <button className="pp-item pp-new" onClick={newNote}>
                <Plus size={14} />
                <span className="pp-item-title">New note “{query}”</span>
              </button>
            )}
            {query && (
              <button className="pp-item pp-new" onClick={newProject}>
                <FolderKanban size={14} />
                <span className="pp-item-title">New project “{query}”</span>
              </button>
            )}
            <button className="pp-item" onClick={openBible}>
              <ScrollText size={14} />
              <span className="pp-item-title">Open the Bible</span>
            </button>
          </div>
        )}
        {restrictToProject && query && (
          <button className="pp-item pp-new" onClick={newNote}>
            <Plus size={14} />
            <span className="pp-item-title">New note “{query}” (added to project)</span>
          </button>
        )}

        {restrictToProject &&
          (query ? (
            <div className="pp-scroll">
              <div className="pp-sec">
                <SearchIcon size={11} /> Content matches
              </div>
              {contentHits.length ? (
                <SearchResults results={contentHits} onHit={onHit} />
              ) : (
                <div className="pp-empty">No content matches in this project yet.</div>
              )}
            </div>
          ) : (
            <div className="pp-scroll">
              {scriptureHits.length > 0 && <div className="pp-sec">Scripture</div>}
              {scriptureHits.map((s) => (
                <div className="pp-row" key={`${s.book}:${s.chapter}`}>
                  <button
                    className="pp-item"
                    onClick={() => placeBible(s.book, s.chapter)}
                    onContextMenu={(e) =>
                      onContextMenu(e, {
                        kind: 'bible',
                        book: s.book,
                        chapter: s.chapter,
                        highlight: [],
                        translation: scriptureTranslation
                      })
                    }
                  >
                    <ScrollText size={14} />
                    <span className="pp-item-title">{scriptureLabel(s)}</span>
                  </button>
                  <button className="pp-remove" title="Remove from project" onClick={() => void removeProjectItem(s)}>
                    <X size={12} />
                  </button>
                </div>
              ))}
              {noteHits.length > 0 && <div className="pp-sec">Notes</div>}
              {noteHits.map((n) => (
                <div className="pp-row" key={n.path}>
                  <button
                    className="pp-item"
                    onClick={() => place({ kind: 'note', notePath: n.path })}
                    onContextMenu={(e) => onContextMenu(e, { kind: 'note', notePath: n.path })}
                  >
                    <FileText size={14} />
                    <span className="pp-item-title">{n.title}</span>
                  </button>
                  <button
                    className="pp-remove"
                    title="Remove from project"
                    onClick={() => void removeProjectItem({ kind: 'note', path: n.path })}
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
              {bookHits.length > 0 && <div className="pp-sec">Library</div>}
              {bookHits.map((b) => (
                <div className="pp-row" key={b.id}>
                  <button
                    className="pp-item"
                    onClick={() => place({ kind: 'pdf', bookId: b.id })}
                    onContextMenu={(e) => onContextMenu(e, { kind: 'pdf', bookId: b.id })}
                  >
                    <BookOpen size={14} />
                    <span className="pp-item-title">{b.title}</span>
                  </button>
                  <button
                    className="pp-remove"
                    title="Remove from project"
                    onClick={() => void removeProjectItem({ kind: 'book', id: b.id })}
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
              {scriptureHits.length === 0 && noteHits.length === 0 && bookHits.length === 0 && (
                <div className="pp-empty">
                  No sources yet — add one below, or drag a book, note, or Bible chapter in from the reference panel.
                </div>
              )}
            </div>
          ))}

        <div className={restrictToProject ? 'pp-add-source' : 'pp-browse'}>
          {restrictToProject && (
            <div className="pp-sec">
              <Plus size={11} /> Add a source
            </div>
          )}
          <div className="pp-add-tabs">
            <button
              className={`pp-add-tab${browseTab === 'notes' ? ' active' : ''}`}
              onClick={() => setBrowseTab('notes')}
            >
              <FileText size={13} /> Notes
            </button>
            <button
              className={`pp-add-tab${browseTab === 'library' ? ' active' : ''}`}
              onClick={() => setBrowseTab('library')}
            >
              <BookOpen size={13} /> Library
            </button>
            <button
              className={`pp-add-tab${browseTab === 'bible' ? ' active' : ''}`}
              onClick={() => setBrowseTab('bible')}
            >
              <ScrollText size={13} /> Bible
            </button>
            <button
              className={`pp-add-tab${browseTab === 'quotes' ? ' active' : ''}`}
              onClick={() => setBrowseTab('quotes')}
            >
              <Quote size={13} /> Quotes
            </button>
          </div>

          {browseTab !== 'bible' && (
            <input
              className="pp-search pp-search-sm"
              placeholder={
                browseTab === 'notes'
                  ? 'Search your notes…'
                  : browseTab === 'library'
                    ? 'Search your library…'
                    : 'Search your quotes…'
              }
              value={browseQ}
              onChange={(e) => setBrowseQ(e.target.value)}
            />
          )}

          {browseTab === 'notes' && (
            <div className="pp-scroll">
              {tabProjects.length > 0 && <div className="pp-sec">Projects</div>}
              {tabProjects.map((n) => (
                <button
                  key={n.path}
                  className="pp-item"
                  onClick={() =>
                    restrictToProject ? void addProjectItem({ kind: 'note', path: n.path }) : place({ kind: 'note', notePath: n.path })
                  }
                  onContextMenu={(e) => (restrictToProject ? e.preventDefault() : onContextMenu(e, { kind: 'note', notePath: n.path }))}
                >
                  <FolderKanban size={14} />
                  <span className="pp-item-title">{n.title}</span>
                  {restrictToProject && <Plus size={12} className="pp-add-icon" />}
                </button>
              ))}
              {tabRegularNotes.length > 0 && <div className="pp-sec">Notes</div>}
              {tabRegularNotes.map((n) => (
                <button
                  key={n.path}
                  className="pp-item"
                  onClick={() =>
                    restrictToProject ? void addProjectItem({ kind: 'note', path: n.path }) : place({ kind: 'note', notePath: n.path })
                  }
                  onContextMenu={(e) => (restrictToProject ? e.preventDefault() : onContextMenu(e, { kind: 'note', notePath: n.path }))}
                >
                  <FileText size={14} />
                  <span className="pp-item-title">{n.title}</span>
                  {restrictToProject && <Plus size={12} className="pp-add-icon" />}
                </button>
              ))}
              {tabNoteHits.length === 0 && <div className="pp-empty">No matching notes.</div>}
            </div>
          )}

          {browseTab === 'library' && (
            <div className="pp-scroll list">
              {tabBookHits.map((b) => (
                <BookListRow
                  key={b.id}
                  book={b}
                  onRead={() =>
                    restrictToProject ? void addProjectItem({ kind: 'book', id: b.id }) : place({ kind: 'pdf', bookId: b.id })
                  }
                  onOpen={() =>
                    restrictToProject ? void addProjectItem({ kind: 'book', id: b.id }) : place({ kind: 'pdf', bookId: b.id })
                  }
                  onMenu={(e) => (restrictToProject ? e.preventDefault() : onContextMenu(e, { kind: 'pdf', bookId: b.id }))}
                />
              ))}
              {tabBookHits.length === 0 && <div className="pp-empty">No matching books.</div>}
            </div>
          )}

          {browseTab === 'quotes' && (
            <div className="pp-scroll">
              {tabQuoteBookHits.length > 0 && <div className="pp-sec">Books</div>}
              {tabQuoteBookHits.map((b) => {
                const ref: QuoteGroupRef = { type: 'book', bookId: b.bookId, title: b.title }
                return (
                  <button
                    key={`qb-${b.bookId}`}
                    className="pp-item"
                    onClick={() => place({ kind: 'quotes', quotesGroup: ref })}
                    onContextMenu={(e) => onContextMenu(e, { kind: 'quotes', quotesGroup: ref })}
                  >
                    <Quote size={14} />
                    <span className="pp-item-title">{b.title}</span>
                  </button>
                )
              })}
              {tabQuoteScriptureHits.length > 0 && <div className="pp-sec">Scripture</div>}
              {tabQuoteScriptureHits.map((s) => {
                const ref: QuoteGroupRef = {
                  type: 'scripture',
                  book: s.book,
                  chapter: s.chapter,
                  translation: scriptureTranslation,
                  name: s.name
                }
                return (
                  <button
                    key={`qs-${s.book}:${s.chapter}`}
                    className="pp-item"
                    onClick={() => place({ kind: 'quotes', quotesGroup: ref })}
                    onContextMenu={(e) => onContextMenu(e, { kind: 'quotes', quotesGroup: ref })}
                  >
                    <Quote size={14} />
                    <span className="pp-item-title">{s.name}</span>
                  </button>
                )
              })}
              {tabQuoteCommentaryHits.length > 0 && <div className="pp-sec">Commentary</div>}
              {tabQuoteCommentaryHits.map((c) => {
                const ref: QuoteGroupRef = { type: 'commentary', sourceId: c.sourceId, displayName: c.displayName }
                return (
                  <button
                    key={`qc-${c.sourceId}`}
                    className="pp-item"
                    onClick={() => place({ kind: 'quotes', quotesGroup: ref })}
                    onContextMenu={(e) => onContextMenu(e, { kind: 'quotes', quotesGroup: ref })}
                  >
                    <Quote size={14} />
                    <span className="pp-item-title">{c.displayName}</span>
                  </button>
                )
              })}
              {tabQuoteBookHits.length === 0 && tabQuoteScriptureHits.length === 0 && tabQuoteCommentaryHits.length === 0 && (
                <div className="pp-empty">No matching quotes.</div>
              )}
            </div>
          )}

          {browseTab === 'bible' && (
            <div className="pp-bible-tab">
              {restrictToProject && previewChapter &&
                (() => {
                  const already = scriptureItems.some(
                    (s) => s.book === previewChapter.book && s.chapter === previewChapter.chapter
                  )
                  return (
                    <div className="pp-bible-preview">
                      <ScriptureReader
                        key={`${previewChapter.book}:${previewChapter.chapter}`}
                        translation={scriptureTranslation}
                        book={previewChapter.book}
                        chapter={previewChapter.chapter}
                        highlight={[]}
                        onNavigate={(book, chapter) => setPreviewChapter({ book, chapter })}
                        compact
                        onClose={() => setPreviewChapter(null)}
                      />
                      <div className="pp-bible-preview-actions">
                        {already ? (
                          <span className="pp-bible-added-badge">
                            <Check size={13} /> Already in this project
                          </span>
                        ) : (
                          <button
                            className="btn btn-sm btn-primary"
                            onClick={() => void addProjectItem({ kind: 'scripture', ...previewChapter })}
                          >
                            <Plus size={14} /> Add to project
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })()}
              <div className="pp-scroll pp-bible-list">
                {BOOKS.map((b) => {
                  const open = expandedBook === b.code
                  return (
                    <div key={b.code} className="pp-bible-book-group">
                      <button className="pp-item" onClick={() => setExpandedBook(open ? null : b.code)}>
                        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        <span className="pp-item-title">{b.name}</span>
                      </button>
                      {open && (
                        <div className="pp-bible-chapters">
                          {Array.from({ length: b.chapters }, (_, i) => i + 1).map((c) => {
                            const already = scriptureItems.some((s) => s.book === b.code && s.chapter === c)
                            return (
                              <button
                                key={c}
                                className={`pp-bible-chapter${already ? ' added' : ''}`}
                                title={
                                  restrictToProject
                                    ? already
                                      ? `${b.name} ${c} — already in this project`
                                      : `Preview ${b.name} ${c}`
                                    : `Open ${b.name} ${c}`
                                }
                                onClick={() =>
                                  restrictToProject ? setPreviewChapter({ book: b.code, chapter: c }) : placeBible(b.code, c)
                                }
                                onContextMenu={(e) =>
                                  restrictToProject
                                    ? e.preventDefault()
                                    : onContextMenu(e, {
                                        kind: 'bible',
                                        book: b.code,
                                        chapter: c,
                                        highlight: [],
                                        translation: scriptureTranslation
                                      })
                                }
                              >
                                {c}
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>
      {menu}
    </div>
  )
}
