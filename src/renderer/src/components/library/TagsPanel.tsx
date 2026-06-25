import { Tag as TagIcon } from 'lucide-react'
import { useStore } from '../../store/useStore'

export function TagsPanel() {
  const notes = useStore((s) => s.standaloneNotes)
  const activeFilter = useStore((s) => s.notesTagFilter)
  const setTagFilter = useStore((s) => s.setNotesTagFilter)
  const saveLayout = useStore((s) => s.saveLayout)

  const counts = new Map<string, number>()
  for (const n of notes) for (const t of n.tags) counts.set(t, (counts.get(t) ?? 0) + 1)
  const tags = [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]))

  if (tags.length === 0) {
    return (
      <div className="quotes-empty">
        No note tags yet. Add tags from the bar at the top of a note (the document), and they&apos;ll
        appear here to filter by.
      </div>
    )
  }

  const pick = (t: string): void => {
    setTagFilter(activeFilter === t ? null : t)
    saveLayout({ activeLeftView: 'notes' })
  }

  return (
    <div className="tags-panel">
      {tags.map(([t, c]) => (
        <button
          key={t}
          className={`tag-row${activeFilter === t ? ' active' : ''}`}
          onClick={() => pick(t)}
        >
          <TagIcon size={13} />
          <span className="tag-row-name">#{t}</span>
          <span className="tag-row-n">{c}</span>
        </button>
      ))}
    </div>
  )
}
