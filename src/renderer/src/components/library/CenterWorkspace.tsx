import { Fragment, useRef } from 'react'
import { Columns2, ChevronLeft } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { Divider } from '../Divider'
import { PaneFrame } from './PaneFrame'
import { PanePicker } from './PanePicker'

/** The center workspace: up to two typed panes (note/Bible/PDF) with a draggable divider. */
export function CenterWorkspace() {
  const panes = useStore((s) => s.panes)
  const activePaneId = useStore((s) => s.activePaneId)
  const paneRatio = useStore((s) => s.paneRatio)
  const focusPane = useStore((s) => s.focusPane)
  const closePane = useStore((s) => s.closePane)
  const setPaneRatio = useStore((s) => s.setPaneRatio)
  const addPane = useStore((s) => s.addPane)
  const cameFromSearch = useStore((s) => s.cameFromSearch)
  const returnToSearch = useStore((s) => s.returnToSearch)
  const ref = useRef<HTMLDivElement>(null)

  const onDrag = (dx: number): void => {
    const w = ref.current?.clientWidth ?? 1
    setPaneRatio(paneRatio + dx / w)
  }

  // A search hit opened this pane — offer a way back to the results list without closing it.
  const backBar = cameFromSearch && (
    <div className="ws-search-return">
      <button className="pane-back" onClick={returnToSearch}>
        <ChevronLeft size={13} />
        Back to search results
      </button>
    </div>
  )

  if (panes.length === 0) {
    return (
      <div className="center-workspace-wrap">
        {backBar}
        <div className="center-workspace">
          <PanePicker heading="Open a note, a book, or the Bible" />
        </div>
      </div>
    )
  }

  return (
    <div className="center-workspace-wrap">
      {backBar}
      <div className="center-workspace" ref={ref}>
        {panes.map((p, i) => (
          <Fragment key={p.id}>
            {i > 0 && <Divider onDrag={onDrag} onDragEnd={() => undefined} />}
            <div
              className="ws-pane"
              style={panes.length === 2 ? { flex: `${i === 0 ? paneRatio : 1 - paneRatio} 1 0%` } : { flex: 1 }}
              onMouseDownCapture={() => focusPane(p.id)}
            >
              <PaneFrame pane={p} active={p.id === activePaneId} onClose={() => closePane(p.id)} />
            </div>
          </Fragment>
        ))}
        {panes.length === 1 && (
          <button className="ws-add" title="Open a second pane" onClick={addPane}>
            <Columns2 size={18} />
          </button>
        )}
      </div>
    </div>
  )
}
