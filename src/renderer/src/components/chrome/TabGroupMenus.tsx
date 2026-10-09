import { useEffect, useRef, useState } from 'react'
import { ExternalLink, LayoutGrid, Pin, PinOff, Plus, SquarePlus, Trash2, Ungroup, X } from 'lucide-react'
import { useStore } from '../../store/useStore'
import type { TabGroup } from '../../store/useStore'
import { GROUP_COLORS, GROUP_COLOR_NAMES, groupName } from '../../store/tabGroups'
import { PopupMenu } from './PopupMenu'
import type { MenuEntry } from './PopupMenu'

/** Ask the strip to open the name/colour editor under a group's label (detail: group id). */
export const EDIT_GROUP_EVENT = 'loci:edit-group'

export function requestGroupEditor(groupId: string): void {
  // After the strip has rendered the new label.
  window.setTimeout(() => window.dispatchEvent(new CustomEvent(EDIT_GROUP_EVENT, { detail: groupId })), 0)
}

export function confirmDeleteGroup(g: TabGroup): boolean {
  const tabs = g.open ? useStore.getState().tabs.filter((t) => t.groupId === g.id).length : g.savedTabs.length
  return window.confirm(
    `Delete the group "${groupName(g)}"? ${tabs === 1 ? 'Its tab closes' : `Its ${tabs} tabs close`} and the group can't be reopened.`
  )
}

/** Open (or switch to), pin/unpin, close and delete: shared by the ⊞ menu and bar chips. */
export function savedGroupActions(g: TabGroup, opts: { pinEntry?: 'toggle' | 'unpin' } = {}): MenuEntry[] {
  const s = useStore.getState()
  const pin = opts.pinEntry ?? 'toggle'
  const items: MenuEntry[] = [
    { label: g.open ? 'Go to group' : 'Open group', icon: ExternalLink, onSelect: () => s.openGroup(g.id) }
  ]
  if (pin === 'unpin' || g.pinnedToBar) {
    items.push({ label: 'Unpin from bookmarks bar', icon: PinOff, onSelect: () => s.updateGroup(g.id, { pinnedToBar: false }) })
  } else {
    items.push({ label: 'Pin to bookmarks bar', icon: Pin, onSelect: () => s.updateGroup(g.id, { pinnedToBar: true }) })
  }
  if (g.open) items.push({ label: 'Close group', icon: X, onSelect: () => s.closeGroup(g.id) })
  items.push({
    label: 'Delete group',
    icon: Trash2,
    onSelect: () => {
      if (confirmDeleteGroup(g)) s.deleteGroup(g.id)
    }
  })
  return items
}

/** The ⊞ tab groups menu: create, then every saved group (click opens or switches to it). */
export function TabGroupsMenu({ x, y, onClose }: { x: number; y: number; onClose: () => void }) {
  const groups = useStore((s) => s.groups)
  const createGroupWithNewTab = useStore((s) => s.createGroupWithNewTab)
  const openGroup = useStore((s) => s.openGroup)
  const items: MenuEntry[] = [
    {
      label: 'Create new tab group',
      icon: SquarePlus,
      onSelect: () => {
        const id = createGroupWithNewTab()
        if (id) requestGroupEditor(id)
      }
    }
  ]
  if (groups.length) {
    items.push('sep', { header: 'Saved tab groups' })
    for (const g of groups) {
      items.push({
        label: `${groupName(g)}${g.open ? '' : ' (closed)'}`,
        dot: GROUP_COLORS[g.color],
        onSelect: () => openGroup(g.id),
        submenu: savedGroupActions(g)
      })
    }
  }
  return <PopupMenu x={x} y={y} items={items} onClose={onClose} className="tg-menu" />
}

/**
 * Right-click on a group label (and the bubble shown for a new group): name and colour on top,
 * then the group's actions.
 */
export function GroupEditorMenu({
  groupId,
  x,
  y,
  onClose
}: {
  groupId: string
  x: number
  y: number
  onClose: () => void
}) {
  const g = useStore((s) => s.groups.find((x) => x.id === groupId))
  const s = useStore.getState()
  const [name, setName] = useState(g?.name ?? '')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  if (!g || !g.open) return null
  const items: MenuEntry[] = [
    { label: 'New tab in group', icon: Plus, onSelect: () => s.newTabInGroup(g.id) },
    g.pinnedToBar
      ? { label: 'Unpin from bookmarks bar', icon: PinOff, onSelect: () => s.updateGroup(g.id, { pinnedToBar: false }) }
      : { label: 'Pin to bookmarks bar', icon: Pin, onSelect: () => s.updateGroup(g.id, { pinnedToBar: true }) },
    'sep',
    { label: 'Ungroup', icon: Ungroup, onSelect: () => s.ungroup(g.id) },
    { label: 'Close group', icon: X, onSelect: () => s.closeGroup(g.id) },
    {
      label: 'Delete group',
      icon: Trash2,
      onSelect: () => {
        if (confirmDeleteGroup(g)) s.deleteGroup(g.id)
      }
    }
  ]
  return (
    <PopupMenu x={x} y={y} items={items} onClose={onClose} className="tg-editor">
      <input
        ref={inputRef}
        className="tg-name"
        placeholder="Name this group"
        value={name}
        onChange={(e) => {
          setName(e.target.value)
          s.updateGroup(g.id, { name: e.target.value })
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onClose()
        }}
      />
      <div className="tg-swatches" role="radiogroup" aria-label="Group colour">
        {GROUP_COLOR_NAMES.map((c) => (
          <button
            key={c}
            role="radio"
            aria-checked={g.color === c}
            title={c[0].toUpperCase() + c.slice(1)}
            className={`tg-swatch${g.color === c ? ' on' : ''}`}
            style={{ background: GROUP_COLORS[c] }}
            onClick={() => s.updateGroup(g.id, { color: c })}
          />
        ))}
      </div>
      <div className="cm-sep" />
    </PopupMenu>
  )
}

/** The "Add tab to group" submenu of the tab context menu. */
export function addToGroupSubmenu(tabId: string, currentGroup: string | undefined): MenuEntry[] {
  const s = useStore.getState()
  const others = s.groups.filter((g) => g.open && g.id !== currentGroup)
  return [
    {
      label: 'New group',
      icon: LayoutGrid,
      onSelect: () => {
        if (currentGroup) s.removeTabFromGroup(tabId)
        const id = useStore.getState().createGroup(tabId)
        if (id) requestGroupEditor(id)
      }
    },
    ...(others.length ? (['sep'] as MenuEntry[]) : []),
    ...others.map(
      (g): MenuEntry => ({
        label: groupName(g),
        dot: GROUP_COLORS[g.color],
        onSelect: () => s.addTabToGroup(tabId, g.id)
      })
    )
  ]
}
