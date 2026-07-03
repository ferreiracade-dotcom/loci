import { useEffect, useState } from 'react'
import { FileText, BookOpen, ScrollText, Plus, FolderKanban, X, Search as SearchIcon } from 'lucide-react'
import { useStore } from '../../store/useStore'
import type { PaneContent } from '../../store/useStore'
import { api } from '../../lib/api'
import { bookByCode } from '@shared/scriptureRef'
import { SearchResults } from './SearchResults'
import type { ProjectItem, SearchHit } from '@shared/ipc'

/** Human label for a scripture project item, e.g. "John 3". */
function scriptureLabel(item: { book: string; chapter: number }): string {
  return `${bookByCode(item.book)?.name ?? item.book} ${item.chapter}`
}

/**
 * The content picker. Search standalone notes and library books, open the Bible, or type a new
 * name to create a note. With `paneId` it fills that pane; without one (an empty workspace) it
 * opens into a fresh pane.
 *
 * When `restrictToProject` is set (this pane's sibling is a Project note), the picker only
 * offers that project's sources, plus a real content search scoped to just that collection.
 */
export function PanePicker({
  paneId,
  heading,
  restrictToProject
}: {
  paneId?: string
  heading?: string
  restrictToProject?: ProjectItem[]
}) {
  const notes = useStore((s) => s.standaloneNotes)
  const books = useStore((s) => s.books)
  const setPaneContent = useStore((s) => s.setPaneContent)
  const createNoteInPane = useStore((s) => s.createNoteInPane)
  const openInPane = useStore((s) => s.openInPane)
  const createNote = useStore((s) => s.createNote)
  const scripturePassage = useStore((s) => s.scripturePassage)
  const scriptureTranslation = useStore((s) => s.scriptureTranslation)
  const addProjectItem = useStore((s) => s.addProjectItem)
  const removeProjectItem = useStore((s) => s.removeProjectItem)

  const [q, setQ] = useState('')
  const [contentHits, setContentHits] = useState<SearchHit[]>([])
  const query = q.trim()
  const ql = query.toLowerCase()

  const bookIds = restrictToProject
    ? new Set(restrictToProject.filter((i) => i.kind === 'book').map((i) => i.id))
    : null
  const notePaths = restrictToProject
    ? new Set(restrictToProject.filter((i) => i.kind === 'note').map((i) => i.path))
    : null
  const scriptureItems = restrictToProject
    ? restrictToProject.filter((i): i is Extract<ProjectItem, { kind: 'scripture' }> => i.kind === 'scripture')
    : []

  const noteHits = (restrictToProject ? notes.filter((n) => notePaths?.has(n.path)) : notes).filter(
    (n) => !ql || n.title.toLowerCase().includes(ql)
  )
  const bookHits = (restrictToProject ? books.filter((b) => bookIds?.has(b.id)) : books).filter(
    (b) => !ql || b.title.toLowerCase().includes(ql)
  )
  const scriptureHits = scriptureItems.filter(
    (s) => !ql || scriptureLabel(s).toLowerCase().includes(ql)
  )

  // In restricted mode, the box also runs a real content search over the collection.
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

  // Fill the target pane, or open into a fresh pane when there's no target.
  const place = (content: PaneContent): void => {
    if (paneId) setPaneContent(paneId, content)
    else openInPane(content)
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
    if (paneId) {
      void createNoteInPane(paneId, query).then((note) => {
        if (restrictToProject) void addProjectItem({ kind: 'note', path: note.path })
      })
    } else {
      void createNote(query)
    }
  }
  const newProject = (): void => {
    if (!query) return
    if (paneId) void createNoteInPane(paneId, query, 'project')
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
            restrictToProject ? 'Search this project’s sources…' : 'Search notes & books, or type a new note name…'
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

        {restrictToProject && query ? (
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
                <button className="pp-item" onClick={() => placeBible(s.book, s.chapter)}>
                  <ScrollText size={14} />
                  <span className="pp-item-title">{scriptureLabel(s)}</span>
                </button>
                {restrictToProject && (
                  <button
                    className="pp-remove"
                    title="Remove from project"
                    onClick={() => void removeProjectItem(s)}
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            ))}
            {noteHits.length > 0 && <div className="pp-sec">Notes</div>}
            {noteHits.map((n) => (
              <div className="pp-row" key={n.path}>
                <button className="pp-item" onClick={() => place({ kind: 'note', notePath: n.path })}>
                  <FileText size={14} />
                  <span className="pp-item-title">{n.title}</span>
                </button>
                {restrictToProject && (
                  <button
                    className="pp-remove"
                    title="Remove from project"
                    onClick={() => void removeProjectItem({ kind: 'note', path: n.path })}
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            ))}
            {bookHits.length > 0 && <div className="pp-sec">Library</div>}
            {bookHits.map((b) => (
              <div className="pp-row" key={b.id}>
                <button className="pp-item" onClick={() => place({ kind: 'pdf', bookId: b.id })}>
                  <BookOpen size={14} />
                  <span className="pp-item-title">{b.title}</span>
                </button>
                {restrictToProject && (
                  <button
                    className="pp-remove"
                    title="Remove from project"
                    onClick={() => void removeProjectItem({ kind: 'book', id: b.id })}
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            ))}
            {scriptureHits.length === 0 && noteHits.length === 0 && bookHits.length === 0 && (
              <div className="pp-empty">
                {restrictToProject
                  ? 'No sources yet — drag a book, note, or Bible chapter in from the reference panel.'
                  : 'No matches. Type a name above to create a note.'}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
