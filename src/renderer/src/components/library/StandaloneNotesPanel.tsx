import { FileText } from 'lucide-react'
import { useStore } from '../../store/useStore'

export function StandaloneNotesPanel() {
  const notes = useStore((s) => s.standaloneNotes)
  const activeNotePath = useStore((s) => s.activeNotePath)
  const openNote = useStore((s) => s.openNote)

  if (notes.length === 0) {
    return (
      <div className="quotes-empty">
        No standalone notes yet. Create one in the Notes view, or press <b>Ctrl+Shift+N</b>.
      </div>
    )
  }

  return (
    <div className="backlinks-list">
      {notes.map((n) => (
        <button
          key={n.path}
          className={`backlink-row${activeNotePath === n.path ? ' active' : ''}`}
          onClick={() => openNote(n.path)}
        >
          <FileText size={14} />
          <span>{n.title}</span>
        </button>
      ))}
    </div>
  )
}
