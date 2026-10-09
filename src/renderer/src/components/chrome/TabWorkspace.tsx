import { useRef } from 'react'
import { useStore, focusedTab, splitPartner } from '../../store/useStore'
import type { Tab } from '../../store/useStore'
import { Divider } from '../Divider'
import { PaneFrame } from '../library/PaneFrame'

/**
 * The content area: the focused tab, or both halves of its split view with a draggable divider.
 * Pressing inside a half focuses it. Each body is keyed by tab id plus its reload count, so
 * switching tabs or Reload (F5) remounts it.
 */
export function TabWorkspace() {
  const tab = useStore((s) => focusedTab(s))
  const tabs = useStore((s) => s.tabs)
  const splitRatios = useStore((s) => s.splitRatios)
  const reloadKeys = useStore((s) => s.reloadKeys)
  const focusTab = useStore((s) => s.focusTab)
  const setSplitRatio = useStore((s) => s.setSplitRatio)
  const ref = useRef<HTMLDivElement>(null)

  if (!tab) return <div className="tab-workspace" />

  const partner = splitPartner(tabs, tab.id)
  const pane = (t: Tab, style: React.CSSProperties, half: boolean) => (
    <div
      key={`${t.id}:${reloadKeys[t.id] ?? 0}`}
      className={`ws-pane${half ? ' split-half' : ''}${half && t.id === tab.id ? ' focused' : ''}`}
      style={style}
      onMouseDownCapture={() => focusTab(t.id)}
    >
      <PaneFrame tab={t} />
    </div>
  )

  if (!partner || !tab.splitId) {
    return (
      <div className="tab-workspace" ref={ref}>
        {pane(tab, { flex: 1 }, false)}
      </div>
    )
  }

  const [left, right] = tab.order < partner.order ? [tab, partner] : [partner, tab]
  const splitId = tab.splitId
  const ratio = splitRatios[splitId] ?? 0.5
  return (
    <div className="tab-workspace split" ref={ref}>
      {pane(left, { flex: `${ratio} 1 0%` }, true)}
      <Divider
        onDrag={(dx) => {
          const w = ref.current?.clientWidth ?? 1
          setSplitRatio(splitId, (useStore.getState().splitRatios[splitId] ?? 0.5) + dx / w)
        }}
        onDragEnd={() => undefined}
      />
      {pane(right, { flex: `${1 - ratio} 1 0%` }, true)}
    </div>
  )
}
