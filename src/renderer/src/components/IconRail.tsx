import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

export interface RailItem {
  id: string
  label: string
  icon: LucideIcon
}

interface IconRailProps {
  items: RailItem[]
  activeId: string
  onSelect: (id: string) => void
  onExpand: () => void
  /** Which side the parent panel sits on, so the expand chevron points outward→inward. */
  expandSide: 'left' | 'right'
  footer?: ReactNode
}

/** Collapsed-sidebar icon rail primitive, reused by both sidebars (spec §3, §8). */
export function IconRail({
  items,
  activeId,
  onSelect,
  onExpand,
  expandSide,
  footer
}: IconRailProps) {
  const ExpandIcon = expandSide === 'left' ? ChevronRight : ChevronLeft
  return (
    <div className="rail">
      <button className="rail-btn rail-expand" title="Expand" onClick={onExpand}>
        <ExpandIcon size={18} />
      </button>
      <div className="rail-items">
        {items.map((it) => {
          const Icon = it.icon
          return (
            <button
              key={it.id}
              className={`rail-btn${it.id === activeId ? ' active' : ''}`}
              title={it.label}
              onClick={() => onSelect(it.id)}
            >
              <Icon size={18} />
            </button>
          )
        })}
      </div>
      {footer && <div className="rail-footer">{footer}</div>}
    </div>
  )
}
