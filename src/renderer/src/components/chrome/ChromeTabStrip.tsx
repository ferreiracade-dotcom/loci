import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { CSSProperties, PointerEvent as ReactPointerEvent, MouseEvent as ReactMouseEvent } from 'react'
import {
  ChevronDown,
  CircleMinus,
  Columns2,
  LayoutGrid,
  Copy,
  Pin,
  PinOff,
  Plus,
  RotateCw,
  Undo2,
  X
} from 'lucide-react'
import { useStore } from '../../store/useStore'
import type { Tab, TabGroup } from '../../store/useStore'
import { sortedTabs, tabContent } from '../../store/workspace'
import { GROUP_COLORS, groupName, stripSegments } from '../../store/tabGroups'
import { EDIT_GROUP_EVENT, GroupEditorMenu, addToGroupSubmenu } from './TabGroupMenus'
import { PopupMenu } from './PopupMenu'
import type { MenuEntry } from './PopupMenu'
import { tabDef, tabTitle } from './tabRegistry'
import type { TitleContext } from './tabRegistry'

const HOVER_DELAY = 500
const DRAG_THRESHOLD = 5

/** What is being dragged: a tab (with its split partner) or a whole group by its label. */
interface DragState {
  kind: 'tab' | 'group'
  /** Tab id, or group id. */
  id: string
  startX: number
  pointerId: number
  active: boolean
  /** Where it would land: a tab index into the strip without the dragged tabs, the group a
   *  dragged tab would join, and the element the drop marker sits before ('end' = last). */
  target: { index: number; groupId: string | null; beforeKey: string } | null
}

function useTitleContext(): TitleContext {
  const books = useStore((s) => s.books)
  const notes = useStore((s) => s.standaloneNotes)
  return useMemo(() => ({ books, notes }), [books, notes])
}

/** One draggable element of the strip as the drag logic sees it. */
interface StripEl {
  key: string
  kind: 'unit' | 'label'
  /** Tab ids (a unit) or the group's tab ids (a label). */
  tabIds: string[]
  groupId: string | null
  collapsed: boolean
  mid: number
}

/**
 * Translate a pointer x into a drop target. `els` are the visible strip elements without the
 * dragged ones; `rest` the strip's tabs without the dragged ones.
 */
function dropTarget(
  els: StripEl[],
  rest: Tab[],
  x: number,
  dragged: { kind: 'tab' | 'group'; groupId: string | null }
): { index: number; groupId: string | null; beforeKey: string } {
  let k = 0
  while (k < els.length && x > els[k].mid) k++
  const prev = els[k - 1]
  const next = els[k]
  const beforeKey = next?.key ?? 'end'
  if (!prev) return { index: 0, groupId: null, beforeKey }
  const pos = (id: string): number => rest.findIndex((t) => t.id === id)
  let index: number
  if (prev.kind === 'unit') index = Math.max(...prev.tabIds.map(pos)) + 1
  else if (prev.collapsed) index = Math.max(...prev.tabIds.map(pos)) + 1
  else index = Math.min(...prev.tabIds.map(pos))
  let groupId: string | null = null
  if (dragged.kind === 'tab') {
    if (prev.kind === 'label' && !prev.collapsed) groupId = prev.groupId
    else if (prev.kind === 'unit' && prev.groupId) {
      if (next?.kind === 'unit' && next.groupId === prev.groupId) groupId = prev.groupId
      else if (dragged.groupId === prev.groupId) groupId = prev.groupId
    }
  }
  return { index: Math.max(0, index), groupId, beforeKey }
}

/** The window's single Chrome-style tab strip, drawn in the (hidden) title bar. */
export function ChromeTabStrip() {
  const tabs = useStore((s) => s.tabs)
  const groups = useStore((s) => s.groups)
  const activeTabId = useStore((s) => s.activeTabId)
  const closedTabs = useStore((s) => s.closedTabs)
  const focusTab = useStore((s) => s.focusTab)
  const closeTab = useStore((s) => s.closeTab)
  const newTab = useStore((s) => s.newTab)
  const moveTab = useStore((s) => s.moveTab)
  const moveGroup = useStore((s) => s.moveGroup)
  const toggleGroupCollapsed = useStore((s) => s.toggleGroupCollapsed)
  const reopenClosedTab = useStore((s) => s.reopenClosedTab)
  const ctx = useTitleContext()

  const [menu, setMenu] = useState<{ tabId: string; x: number; y: number } | null>(null)
  const [groupMenu, setGroupMenu] = useState<{ groupId: string; x: number; y: number } | null>(null)
  const [search, setSearch] = useState<{ x: number; y: number } | null>(null)
  const [hover, setHover] = useState<{ tabId: string; left: number; top: number } | null>(null)
  const [drag, setDrag] = useState<DragState | null>(null)
  const hoverTimer = useRef<number | null>(null)
  const tabsRef = useRef<HTMLDivElement>(null)

  const segments = stripSegments(tabs, groups)
  const overlayWidth = useOverlayWidth()

  const clearHover = (): void => {
    if (hoverTimer.current) window.clearTimeout(hoverTimer.current)
    hoverTimer.current = null
    setHover(null)
  }
  useEffect(() => clearHover, [])

  // A new group asks for its name/colour bubble under its label.
  useEffect(() => {
    const onEdit = (e: Event): void => {
      const id = (e as CustomEvent<string>).detail
      const el = tabsRef.current?.querySelector<HTMLElement>(`[data-group-label="${id}"]`)
      const r = el?.getBoundingClientRect()
      setMenu(null)
      setGroupMenu({ groupId: id, x: r ? r.left : 80, y: r ? r.bottom + 6 : 48 })
    }
    window.addEventListener(EDIT_GROUP_EVENT, onEdit)
    return () => window.removeEventListener(EDIT_GROUP_EVENT, onEdit)
  }, [])

  const startHover = (tabId: string, el: HTMLElement): void => {
    if (hoverTimer.current) window.clearTimeout(hoverTimer.current)
    hoverTimer.current = window.setTimeout(() => {
      const r = el.getBoundingClientRect()
      setHover({ tabId, left: r.left, top: r.bottom + 6 })
    }, HOVER_DELAY)
  }

  // --- drag (pointer-captured): a split pair moves as one unit, a label moves its group ---
  const beginDrag = (e: ReactPointerEvent, kind: 'tab' | 'group', id: string): void => {
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    setDrag({ kind, id, startX: e.clientX, pointerId: e.pointerId, active: false, target: null })
  }

  const onPointerDown = (e: ReactPointerEvent, tabId: string): void => {
    if (e.button !== 0) return
    if ((e.target as HTMLElement).closest('.ct-close')) return
    clearHover()
    focusTab(tabId) // Chrome activates on press
    beginDrag(e, 'tab', tabId)
  }

  const draggedTabIds = (d: DragState): Set<string> => {
    if (d.kind === 'group') return new Set(tabs.filter((t) => t.groupId === d.id).map((t) => t.id))
    const t = tabs.find((x) => x.id === d.id)
    return new Set(tabs.filter((x) => x.id === d.id || (!!t?.splitId && x.splitId === t.splitId)).map((x) => x.id))
  }

  const onPointerMove = (e: ReactPointerEvent): void => {
    if (!drag || e.pointerId !== drag.pointerId) return
    const active = drag.active || Math.abs(e.clientX - drag.startX) > DRAG_THRESHOLD
    if (!active) return
    const container = tabsRef.current
    if (!container) return
    const moving = draggedTabIds(drag)
    const els: StripEl[] = []
    for (const el of Array.from(container.querySelectorAll<HTMLElement>('[data-strip-el]'))) {
      const ids = (el.dataset.tabIds ?? '').split(',').filter(Boolean)
      if (drag.kind === 'group' && el.dataset.groupLabel === drag.id) continue
      if (ids.length && ids.every((id) => moving.has(id))) continue
      const r = el.getBoundingClientRect()
      els.push({
        key: el.dataset.stripEl!,
        kind: el.dataset.groupLabel ? 'label' : 'unit',
        tabIds: ids,
        groupId: el.dataset.group || null,
        collapsed: el.dataset.collapsed === '1',
        mid: r.left + r.width / 2
      })
    }
    const rest = sortedTabs(tabs).filter((t) => !moving.has(t.id))
    const self = tabs.find((t) => t.id === drag.id)
    const target = dropTarget(els, rest, e.clientX, { kind: drag.kind, groupId: self?.groupId ?? null })
    setDrag({ ...drag, active: true, target })
  }

  const onPointerUp = (e: ReactPointerEvent): void => {
    if (!drag || e.pointerId !== drag.pointerId) return
    ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
    if (drag.active && drag.target) {
      if (drag.kind === 'tab') moveTab(drag.id, drag.target.index, drag.target.groupId)
      else moveGroup(drag.id, drag.target.index)
    } else if (!drag.active && drag.kind === 'group') {
      toggleGroupCollapsed(drag.id) // a click on the label
    }
    setDrag(null)
  }

  const commonHandlers = (tab: Tab) => ({
    onPointerDown: (e: ReactPointerEvent) => onPointerDown(e, tab.id),
    onPointerMove,
    onPointerUp,
    onPointerCancel: () => setDrag(null),
    onMouseDown: (e: ReactMouseEvent) => {
      if (e.button === 1) e.preventDefault() // no autoscroll
    },
    onAuxClick: (e: ReactMouseEvent) => {
      if (e.button === 1) {
        e.preventDefault()
        clearHover()
        closeTab(tab.id)
      }
    },
    onContextMenu: (e: ReactMouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      clearHover()
      setMenu({ tabId: tab.id, x: e.clientX, y: e.clientY })
    },
    onPointerEnter: (e: ReactPointerEvent) => {
      if (!drag && !menu) startHover(tab.id, e.currentTarget as HTMLElement)
    },
    onPointerLeave: clearHover
  })

  const closeBtn = (tab: Tab) => (
    <button
      className="ct-close"
      title="Close tab (Ctrl+W)"
      onClick={(e) => {
        e.stopPropagation()
        clearHover()
        closeTab(tab.id)
      }}
    >
      <X size={12} />
    </button>
  )

  const draggedIds = drag?.active ? draggedTabIds(drag) : null
  const dropBefore = (key: string): string =>
    drag?.active && drag.target?.beforeKey === key ? ' drop-before' : ''

  const renderUnit = (unit: Tab[], group: TabGroup | null) => {
    const isDragged = !!draggedIds && unit.every((t) => draggedIds.has(t.id))
    const unitActive = unit.some((t) => t.id === activeTabId)
    const unitKey = unit.map((t) => t.id).join(',')
    const gStyle = group ? ({ '--gc': GROUP_COLORS[group.color] } as CSSProperties) : undefined
    const gline = group ? <div className="ct-gline" /> : null
    const common = {
      'data-strip-el': unitKey,
      'data-tab-ids': unitKey,
      'data-group': group?.id ?? ''
    }
    if (unit.length === 2) {
      const focusHalf = unit.find((t) => t.id === activeTabId) ?? unit[0]
      return (
        <div
          key={unitKey}
          {...common}
          style={gStyle}
          className={`ct-tab ct-split${group ? ' in-group' : ''}${unitActive ? ' active' : ''}${isDragged ? ' dragging' : ''}${dropBefore(unitKey)}`}
        >
          {gline}
          {unit.map((t, i) => {
            const def = tabDef(t.kind)
            const Icon = def.icon
            return (
              <div key={t.id} className="ct-half-wrap">
                {i === 1 && <div className="ct-mid" />}
                <div
                  className={`ct-half${unitActive && t.id === activeTabId ? ' on' : ''}`}
                  data-tab-id={t.id}
                  {...commonHandlers(t)}
                >
                  <Icon size={15} className="ct-icon" />
                  <span className="ct-label">{tabTitle(t, ctx)}</span>
                </div>
              </div>
            )
          })}
          {closeBtn(focusHalf)}
          <div className="ct-sep" />
        </div>
      )
    }
    const t = unit[0]
    const def = tabDef(t.kind)
    const Icon = def.icon
    return (
      <div
        key={unitKey}
        {...common}
        data-tab-id={t.id}
        style={gStyle}
        className={`ct-tab${group ? ' in-group' : ''}${t.id === activeTabId ? ' active' : ''}${t.pinned ? ' pinned' : ''}${isDragged ? ' dragging' : ''}${dropBefore(unitKey)}`}
        {...commonHandlers(t)}
      >
        {gline}
        <Icon size={15} className="ct-icon" />
        {!t.pinned && <span className="ct-label">{tabTitle(t, ctx)}</span>}
        {!t.pinned && closeBtn(t)}
        <div className="ct-sep" />
      </div>
    )
  }

  return (
    <div className="chrome-strip">
      <button
        className="ct-search"
        title="Search tabs"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          setSearch({ x: r.left, y: r.bottom + 4 })
        }}
      >
        <ChevronDown size={16} />
      </button>
      <div className="ct-tabs" ref={tabsRef}>
        {segments.map((seg) => {
          if (!seg.group) return renderUnit(seg.units[0], null)
          const g = seg.group
          const ids = seg.units.flat().map((t) => t.id).join(',')
          const labelKey = `label:${g.id}`
          const groupDragged = drag?.active && drag.kind === 'group' && drag.id === g.id
          return (
            <Fragment key={labelKey}>
              <div
                data-strip-el={labelKey}
                data-group-label={g.id}
                data-tab-ids={ids}
                data-group={g.id}
                data-collapsed={g.collapsed ? '1' : '0'}
                className={`ct-group${g.name.trim() ? '' : ' unnamed'}${g.collapsed ? ' collapsed' : ''}${groupDragged ? ' dragging' : ''}${dropBefore(labelKey)}`}
                style={{ '--gc': GROUP_COLORS[g.color] } as CSSProperties}
                title={`${groupName(g)}: ${seg.units.flat().length} tab${seg.units.flat().length === 1 ? '' : 's'}. Click to ${g.collapsed ? 'expand' : 'collapse'}`}
                onPointerDown={(e) => {
                  if (e.button !== 0) return
                  clearHover()
                  beginDrag(e, 'group', g.id)
                }}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={() => setDrag(null)}
                onContextMenu={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  const r = e.currentTarget.getBoundingClientRect()
                  setGroupMenu({ groupId: g.id, x: r.left, y: r.bottom + 6 })
                }}
              >
                <span className="ct-group-name">{g.name.trim()}</span>
              </div>
              {!g.collapsed && seg.units.map((u) => renderUnit(u, g))}
            </Fragment>
          )
        })}
        {drag?.active && drag.target?.beforeKey === 'end' && <div className="ct-drop-end" />}
        <button className="ct-new" title="New tab (Ctrl+T)" onClick={() => newTab(null)}>
          <Plus size={16} />
        </button>
      </div>
      <div className="ct-overlay-space" style={{ width: overlayWidth }} />

      {hover && <HoverCard tabId={hover.tabId} left={hover.left} top={hover.top} ctx={ctx} />}
      {menu && (
        <TabContextMenu tabId={menu.tabId} x={menu.x} y={menu.y} ctx={ctx} onClose={() => setMenu(null)} />
      )}
      {groupMenu && (
        <GroupEditorMenu
          key={groupMenu.groupId}
          groupId={groupMenu.groupId}
          x={groupMenu.x}
          y={groupMenu.y}
          onClose={() => setGroupMenu(null)}
        />
      )}
      {search && (
        <TabSearch
          x={search.x}
          y={search.y}
          ctx={ctx}
          onClose={() => setSearch(null)}
          closedCount={closedTabs.length}
          onReopen={reopenClosedTab}
        />
      )}
    </div>
  )
}

function HoverCard({ tabId, left, top, ctx }: { tabId: string; left: number; top: number; ctx: TitleContext }) {
  const tab = useStore((s) => s.tabs.find((t) => t.id === tabId))
  const group = useStore((s) => (tab?.groupId ? s.groups.find((g) => g.id === tab.groupId) : undefined))
  if (!tab) return null
  const def = tabDef(tab.kind)
  return createPortal(
    <div className="ct-hovercard" style={{ left: Math.min(left, window.innerWidth - 270), top }}>
      <b>{tabTitle(tab, ctx)}</b>
      <span>
        {def.subtitle(tab)}
        {tab.splitId ? ' · Split view' : ''}
        {tab.pinned ? ' · Pinned' : ''}
        {group ? ` · ${groupName(group)}` : ''}
      </span>
    </div>,
    document.body
  )
}

function TabContextMenu({
  tabId,
  x,
  y,
  ctx,
  onClose
}: {
  tabId: string
  x: number
  y: number
  ctx: TitleContext
  onClose: () => void
}) {
  const s = useStore()
  const tab = s.tabs.find((t) => t.id === tabId)
  if (!tab) return null
  const sorted = sortedTabs(s.tabs)
  const index = sorted.findIndex((t) => t.id === tabId)
  const lastOfUnit = tab.splitId && sorted[index + 1]?.splitId === tab.splitId ? index + 1 : index
  const others = sorted.filter((o) => o.id !== tab.id && !o.pinned && !(tab.splitId && o.splitId === tab.splitId))
  const items: MenuEntry[] = [
    { label: 'New tab to the right', icon: Plus, onSelect: () => s.newTab(tab.id) },
    tab.splitId
      ? { label: 'Exit split view', icon: Columns2, onSelect: () => s.unsplitTab(tab.id) }
      : {
          label: 'Split with…',
          icon: Columns2,
          disabled: tab.pinned,
          submenu: others.length
            ? others.map((o) => ({
                label: tabTitle(o, ctx),
                icon: tabDef(o.kind).icon,
                onSelect: () => s.splitTabs(tab.id, o.id)
              }))
            : [{ label: 'No other tabs', disabled: true }]
        },
    {
      label: 'Add tab to group',
      icon: LayoutGrid,
      disabled: tab.pinned,
      submenu: addToGroupSubmenu(tab.id, tab.groupId)
    },
    ...(tab.groupId
      ? [{ label: 'Remove from group', icon: CircleMinus, onSelect: () => s.removeTabFromGroup(tab.id) } as MenuEntry]
      : []),
    'sep',
    { label: 'Reload', icon: RotateCw, shortcut: 'Ctrl+R', onSelect: () => s.reloadTab(tab.id) },
    { label: 'Duplicate', icon: Copy, onSelect: () => s.duplicateTab(tab.id) },
    tab.pinned
      ? { label: 'Unpin', icon: PinOff, onSelect: () => s.setPinned(tab.id, false) }
      : { label: 'Pin', icon: Pin, onSelect: () => s.setPinned(tab.id, true) },
    'sep',
    { label: 'Close', icon: X, shortcut: 'Ctrl+W', onSelect: () => s.closeTab(tab.id) },
    {
      label: 'Close other tabs',
      disabled: sorted.every((o) => o.pinned || o.id === tab.id || (tab.splitId && o.splitId === tab.splitId)),
      onSelect: () => s.closeOtherTabs(tab.id)
    },
    {
      label: 'Close tabs to the right',
      disabled: lastOfUnit >= sorted.length - 1,
      onSelect: () => s.closeTabsToRight(tab.id)
    },
    'sep',
    {
      label: 'Reopen closed tab',
      icon: Undo2,
      shortcut: 'Ctrl+Shift+T',
      disabled: s.closedTabs.length === 0,
      onSelect: s.reopenClosedTab
    }
  ]
  return <PopupMenu x={x} y={y} items={items} onClose={onClose} />
}

/** Chrome's tab search: every open tab, filtered by typing, plus recently closed. */
function TabSearch({
  x,
  y,
  ctx,
  onClose,
  closedCount,
  onReopen
}: {
  x: number
  y: number
  ctx: TitleContext
  onClose: () => void
  closedCount: number
  onReopen: () => void
}) {
  const tabs = useStore((s) => s.tabs)
  const closed = useStore((s) => s.closedTabs)
  const focusTab = useStore((s) => s.focusTab)
  const openTab = useStore((s) => s.openTab)
  const [q, setQ] = useState('')
  const ql = q.trim().toLowerCase()
  const match = (t: Tab): boolean => {
    if (!ql) return true
    const def = tabDef(t.kind)
    return `${tabTitle(t, ctx)} ${def.subtitle(t)}`.toLowerCase().includes(ql)
  }
  const open = sortedTabs(tabs).filter(match)
  const recent = [...closed].reverse().filter((c) => match(c.tab)).slice(0, 5)
  const items: MenuEntry[] = [
    { header: 'Open tabs' },
    ...(open.length
      ? open.map((t) => ({
          label: tabTitle(t, ctx),
          icon: tabDef(t.kind).icon,
          onSelect: () => focusTab(t.id)
        }))
      : [{ label: 'No matching tabs', disabled: true }]),
    ...(closedCount
      ? ([
          'sep',
          { header: 'Recently closed' },
          ...recent.map((c, i) => ({
            label: tabTitle(c.tab, ctx),
            icon: tabDef(c.tab.kind).icon,
            // The newest one is a true reopen; older ones open a fresh tab with that content.
            onSelect: () => (i === 0 && c === closed[closed.length - 1] ? onReopen() : void openTab(tabContent(c.tab), { after: null }))
          }))
        ] as MenuEntry[])
      : [])
  ]
  return (
    <PopupMenu x={x} y={y} items={items} onClose={onClose} className="ct-search-menu">
      <input
        className="ct-search-input"
        autoFocus
        placeholder="Search tabs"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && open[0]) {
            focusTab(open[0].id)
            onClose()
          }
        }}
      />
    </PopupMenu>
  )
}

interface WindowControlsOverlay extends EventTarget {
  visible: boolean
  getTitlebarAreaRect(): DOMRect
}

/**
 * Width the OS window buttons (titleBarOverlay) cover at the strip's right end, in strip px.
 * Uses the Window Controls Overlay API when available, else Windows' standard 138px.
 */
function useOverlayWidth(): number {
  const zoom = useStore((s) => s.zoom)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const wco = (navigator as Navigator & { windowControlsOverlay?: WindowControlsOverlay })
      .windowControlsOverlay
    const measure = (): void => {
      if (wco?.visible) {
        const r = wco.getTitlebarAreaRect()
        setWidth(Math.max(0, window.innerWidth - (r.x + r.width)))
      } else {
        setWidth(/Windows/.test(navigator.userAgent) ? 138 : 0)
      }
    }
    measure()
    wco?.addEventListener('geometrychange', measure)
    window.addEventListener('resize', measure)
    return () => {
      wco?.removeEventListener('geometrychange', measure)
      window.removeEventListener('resize', measure)
    }
  }, [])
  // The strip is counter-zoomed against page zoom, so convert page px to strip px.
  return Math.round((width * zoom) / 100)
}
