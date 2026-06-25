import { useEffect, useMemo, useState } from 'react'
import { FileText } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { api } from '../../lib/api'
import type { NoteSummary } from '@shared/ipc'

export function BacklinksPanel() {
  const openBookId = useStore((s) => s.openBookId)
  const books = useStore((s) => s.books)
  const activeNotePath = useStore((s) => s.activeNotePath)
  const notes = useStore((s) => s.standaloneNotes)
  const openNote = useStore((s) => s.openNote)
  const [links, setLinks] = useState<NoteSummary[]>([])

  const target = useMemo(() => {
    if (openBookId) return books.find((b) => b.id === openBookId)?.title ?? ''
    if (activeNotePath) return notes.find((n) => n.path === activeNotePath)?.title ?? ''
    return ''
  }, [openBookId, books, activeNotePath, notes])

  useEffect(() => {
    let alive = true
    if (target) void api.backlinks(target).then((l) => alive && setLinks(l))
    else setLinks([])
    return () => {
      alive = false
    }
  }, [target])

  if (!target) {
    return <div className="quotes-empty">Open a book or note to see what links to it.</div>
  }
  if (links.length === 0) {
    return (
      <div className="quotes-empty">
        Nothing links to “{target}” yet. Reference it with <code>[[{target}]]</code> in a note.
      </div>
    )
  }
  return (
    <div className="backlinks-list">
      <div className="quotes-count">
        {links.length} backlink{links.length === 1 ? '' : 's'}
      </div>
      {links.map((l) => (
        <button key={l.path} className="backlink-row" onClick={() => openNote(l.path)}>
          <FileText size={14} />
          <span>{l.title}</span>
        </button>
      ))}
    </div>
  )
}
