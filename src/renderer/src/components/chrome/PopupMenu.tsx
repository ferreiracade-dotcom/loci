import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { LucideIcon } from 'lucide-react'
import { ChevronRight } from 'lucide-react'

export type MenuEntry =
  | 'sep'
  | { header: string }
  | {
      label: string
      icon?: LucideIcon
      shortcut?: string
      disabled?: boolean
      onSelect?: () => void
      submenu?: MenuEntry[]
      /** Replaces the label area (e.g. the zoom row's own buttons). Clicks inside don't close. */
      custom?: ReactNode
    }

/**
 * A Chrome-style popup menu, portalled to <body> at viewport coordinates and clamped on screen.
 * Closes on an outside press, Escape, a pick, or the window losing focus.
 */
export function PopupMenu({
  x,
  y,
  items,
  onClose,
  className = '',
  children,
  isSub = false
}: {
  x: number
  y: number
  items: MenuEntry[]
  onClose: () => void
  className?: string
  /** Rendered above the items (e.g. a filter box). */
  children?: ReactNode
  isSub?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: x, top: y })
  const [openSub, setOpenSub] = useState<{ index: number; x: number; y: number } | null>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setPos({
      left: Math.max(6, Math.min(x, window.innerWidth - r.width - 6)),
      top: Math.max(6, Math.min(y, window.innerHeight - r.height - 6))
    })
  }, [x, y, items.length])

  useEffect(() => {
    if (isSub) return
    const onDown = (e: MouseEvent): void => {
      const t = e.target as HTMLElement
      if (!t.closest('.cm-menu')) onClose()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    const onBlur = (): void => onClose()
    document.addEventListener('mousedown', onDown, true)
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('blur', onBlur)
    return () => {
      document.removeEventListener('mousedown', onDown, true)
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('blur', onBlur)
    }
  }, [onClose, isSub])

  const sub = openSub ? items[openSub.index] : null

  return createPortal(
    <>
      <div
        ref={ref}
        className={`cm-menu ${className}`}
        style={{ left: pos.left, top: pos.top }}
        onContextMenu={(e) => e.preventDefault()}
      >
        {children}
        {items.map((it, i) => {
          if (it === 'sep') return <div key={i} className="cm-sep" />
          if ('header' in it) {
            return (
              <div key={i} className="cm-header">
                {it.header}
              </div>
            )
          }
          const Icon = it.icon
          return (
            <div
              key={i}
              className={`cm-item${it.disabled ? ' disabled' : ''}${openSub?.index === i ? ' open' : ''}`}
              onMouseEnter={(e) => {
                if (it.submenu && !it.disabled) {
                  const r = e.currentTarget.getBoundingClientRect()
                  setOpenSub({ index: i, x: r.right - 2, y: r.top - 6 })
                } else setOpenSub(null)
              }}
              onClick={() => {
                if (it.disabled || it.submenu || it.custom) return
                onClose()
                it.onSelect?.()
              }}
            >
              <span className="cm-ico">{Icon && <Icon size={16} />}</span>
              {it.custom ?? <span className="cm-label">{it.label}</span>}
              {it.submenu ? (
                <ChevronRight size={14} className="cm-arrow" />
              ) : it.shortcut ? (
                <span className="cm-key">{it.shortcut}</span>
              ) : null}
            </div>
          )
        })}
      </div>
      {sub && sub !== 'sep' && !('header' in sub) && sub.submenu && openSub && (
        <PopupMenu x={openSub.x} y={openSub.y} items={sub.submenu} onClose={onClose} isSub />
      )}
    </>,
    document.body
  )
}
