import { useState } from 'react'
import type { MouseEvent, ReactNode } from 'react'
import { useStore } from '../../store/useStore'
import type { TabContent } from '../../store/useStore'

/** The two "open elsewhere" actions shared by every right-click menu on openable content
 *  (library books, notes, scripture chapters, quote groups): "Open in new tab" mirrors a
 *  browser's background-tab open, "Open in split pane" is Loci's equivalent of "open in a
 *  new window." Renders as plain .ctx-item buttons — drop into any existing .ctx-menu. */
export function OpenElsewhereItems({
  content,
  onDone
}: {
  content: TabContent
  onDone: () => void
}): ReactNode {
  const openTab = useStore((s) => s.openTab)
  const openTabInSplit = useStore((s) => s.openTabInSplit)
  return (
    <>
      <button
        className="ctx-item"
        onClick={() => {
          openTab(content, { activate: false })
          onDone()
        }}
      >
        Open in new tab
      </button>
      <button
        className="ctx-item"
        onClick={() => {
          openTabInSplit(content)
          onDone()
        }}
      >
        Open in split pane
      </button>
    </>
  )
}

interface MenuState {
  content: TabContent
  x: number
  y: number
}

/** A minimal, self-contained right-click menu offering only the two "open elsewhere" actions,
 *  for rows that don't already have their own context menu (PanePicker's search rows,
 *  BiblePane's chapter grid). Spread the returned `onContextMenu` onto each trigger element
 *  (passing the TabContent that row represents), and render `menu` once at the component's
 *  root. */
export function useOpenElsewhereMenu(): {
  onContextMenu: (e: MouseEvent, content: TabContent) => void
  menu: ReactNode
} {
  const [state, setState] = useState<MenuState | null>(null)
  const close = (): void => setState(null)
  const onContextMenu = (e: MouseEvent, content: TabContent): void => {
    e.preventDefault()
    setState({ content, x: e.clientX, y: e.clientY })
  }
  const menu = state && (
    <div
      className="ctx-menu"
      style={{ top: state.y, left: state.x }}
      onClick={(e) => e.stopPropagation()}
      onMouseLeave={close}
    >
      <OpenElsewhereItems content={state.content} onDone={close} />
    </div>
  )
  return { onContextMenu, menu }
}
