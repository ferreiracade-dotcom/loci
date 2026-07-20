import { Fragment, useRef, useState } from 'react'
import { ChevronLeft } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { Divider } from '../Divider'
import { PaneFrame } from './PaneFrame'
import { PanePicker } from './PanePicker'
import type { HoverTarget } from './TabStrip'

interface DragState {
  tabId: string
}

/** The center workspace: up to two panes of tabs, with a draggable divider between them. */
export function CenterWorkspace() {
  const paneOrder = useStore((s) => s.paneOrder)
  const activePaneId = useStore((s) => s.activePaneId)
  const paneRatio = useStore((s) => s.paneRatio)
  const focusPane = useStore((s) => s.focusPane)
  const setPaneRatio = useStore((s) => s.setPaneRatio)
  const placeTab = useStore((s) => s.placeTab)
  const cameFromSearch = useStore((s) => s.cameFromSearch)
  const returnToSearch = useStore((s) => s.returnToSearch)
  const ref = useRef<HTMLDivElement>(null)

  const [drag, setDrag] = useState<DragState | null>(null)
  const [hover, setHover] = useState<HoverTarget | null>(null)

  const onDrag = (dx: number): void => {
    const w = ref.current?.clientWidth ?? 1
    setPaneRatio(paneRatio + dx / w)
  }

  const endDrag = (): void => {
    setDrag(null)
    setHover(null)
  }

  const dropTab = (): void => {
    if (drag && hover) placeTab(drag.tabId, hover.paneId, hover.index)
    endDrag()
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

  if (paneOrder.length === 0) {
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
        {paneOrder.map((pane, i) => (
          <Fragment key={pane.id}>
            {i > 0 && <Divider onDrag={onDrag} onDragEnd={() => undefined} />}
            <div
              className="ws-pane"
              style={paneOrder.length === 2 ? { flex: `${i === 0 ? paneRatio : 1 - paneRatio} 1 0%` } : { flex: 1 }}
              onMouseDownCapture={() => focusPane(pane.id)}
            >
              <PaneFrame
                pane={pane}
                focused={pane.id === activePaneId}
                dragTabId={drag?.tabId ?? null}
                hover={hover}
                onDragStart={(tabId) => setDrag({ tabId })}
                onHover={setHover}
                onDrop={dropTab}
                onDragCancel={endDrag}
              />
            </div>
          </Fragment>
        ))}
      </div>
    </div>
  )
}
