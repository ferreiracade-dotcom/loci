import { useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'

interface DividerProps {
  onDrag: (dx: number) => void
  onDragEnd: () => void
}

/**
 * Draggable panel divider (spec §3): a 6px transparent hit-target with a 2px line at
 * rest, a 3-dot grab handle and amber line on hover, and a 40%-amber line during drag.
 */
export function Divider({ onDrag, onDragEnd }: DividerProps) {
  const [dragging, setDragging] = useState(false)
  const last = useRef(0)

  function down(e: ReactPointerEvent): void {
    setDragging(true)
    last.current = e.clientX
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  function move(e: ReactPointerEvent): void {
    if (!dragging) return
    const dx = e.clientX - last.current
    last.current = e.clientX
    if (dx !== 0) onDrag(dx)
  }
  function up(e: ReactPointerEvent): void {
    if (!dragging) return
    setDragging(false)
    e.currentTarget.releasePointerCapture(e.pointerId)
    onDragEnd()
  }

  return (
    <div
      className={`divider${dragging ? ' dragging' : ''}`}
      role="separator"
      aria-orientation="vertical"
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
    >
      <div className="divider-handle">
        <span />
        <span />
        <span />
      </div>
    </div>
  )
}
