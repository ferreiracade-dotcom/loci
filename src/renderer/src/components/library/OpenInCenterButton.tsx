import { ArrowLeftToLine, Columns2 } from 'lucide-react'
import { useStore } from '../../store/useStore'
import type { TabContent } from '../../store/useStore'

/**
 * Promote a reference (PDF/Bible) from the right panel into the center workspace as a new tab,
 * then close the reference panel so the same thing isn't shown twice.
 */
export function OpenInCenterButton({
  content,
  onDone
}: {
  content: TabContent | null
  onDone?: () => void
}) {
  const openTab = useStore((s) => s.openTab)
  const openTabInSplit = useStore((s) => s.openTabInSplit)
  const saveLayout = useStore((s) => s.saveLayout)

  // Show the center workspace and collapse the reference panel (it's now in the center).
  const finish = (): void => {
    saveLayout({ activeLeftView: 'reading', notesCollapsed: true })
    onDone?.()
  }

  return (
    <div className="ref-promote-wrap">
      <button
        className="ref-promote"
        disabled={!content}
        onClick={() => {
          if (!content) return
          openTab(content)
          finish()
        }}
        title="Open in the center workspace"
      >
        <ArrowLeftToLine size={13} /> Open in center
      </button>
      <button
        className="ref-promote-split"
        disabled={!content}
        onClick={() => {
          if (!content) return
          openTabInSplit(content)
          finish()
        }}
        title="Open in a split pane"
      >
        <Columns2 size={13} />
      </button>
    </div>
  )
}
