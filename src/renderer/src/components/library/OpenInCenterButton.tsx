import { useEffect, useRef, useState } from 'react'
import { ArrowLeftToLine } from 'lucide-react'
import { useStore } from '../../store/useStore'
import type { Pane, PaneContent } from '../../store/useStore'
import { bookByCode } from '@shared/scriptureRef'

/**
 * Promote a reference (PDF/Bible) from the right panel into the center workspace, then close
 * the reference panel so the same thing isn't shown twice. With two panes already open, it
 * asks which pane to replace instead of silently taking the focused one.
 */
export function OpenInCenterButton({
  content,
  onDone
}: {
  content: PaneContent | null
  onDone?: () => void
}) {
  const panes = useStore((s) => s.panes)
  const books = useStore((s) => s.books)
  const notes = useStore((s) => s.standaloneNotes)
  const openInPane = useStore((s) => s.openInPane)
  const setPaneContent = useStore((s) => s.setPaneContent)
  const saveLayout = useStore((s) => s.saveLayout)

  const [menu, setMenu] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  // Close the "which pane?" menu on an outside click.
  useEffect(() => {
    if (!menu) return
    const onDoc = (e: MouseEvent): void => {
      if (!wrapRef.current?.contains(e.target as Node)) setMenu(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [menu])

  // Show the center workspace and collapse the reference panel (it's now in the center).
  const finish = (): void => {
    saveLayout({ activeLeftView: 'reading', notesCollapsed: true })
    onDone?.()
  }

  const click = (): void => {
    if (!content) return
    if (panes.length >= 2) {
      setMenu((m) => !m)
      return
    }
    // 0 panes → first pane; 1 pane → open beside it.
    openInPane(content, { split: panes.length === 1 })
    finish()
  }

  const intoPane = (id: string): void => {
    if (!content) return
    setPaneContent(id, content)
    setMenu(false)
    finish()
  }

  const labelOf = (p: Pane): string => {
    if (p.kind === 'pdf') return books.find((b) => b.id === p.bookId)?.title ?? 'Document'
    if (p.kind === 'note') return notes.find((n) => n.path === p.notePath)?.title ?? 'Note'
    if (p.kind === 'bible') return `${bookByCode(p.book ?? '')?.name ?? p.book} ${p.chapter}`
    return 'Empty pane'
  }

  return (
    <div className="ref-promote-wrap" ref={wrapRef}>
      <button
        className="ref-promote"
        disabled={!content}
        onClick={click}
        title="Open in the center workspace"
      >
        <ArrowLeftToLine size={13} /> Open in center
      </button>
      {menu && panes.length >= 2 && (
        <div className="ref-promote-menu">
          <div className="rpm-label">Replace which pane?</div>
          {panes.map((p, i) => (
            <button key={p.id} className="rpm-item" onClick={() => intoPane(p.id)}>
              {i === 0 ? 'Left' : 'Right'} — {labelOf(p)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
