import { useRef, type ReactNode } from 'react'

/**
 * Dimmed backdrop + centered drawer. Closes on a genuine backdrop click, but
 * *not* when a text-selection drag merely ends on the backdrop — the press must
 * both start and end on the overlay itself.
 */
export function DrawerOverlay({
  onClose,
  className = 'drawer',
  children
}: {
  onClose: () => void
  className?: string
  children: ReactNode
}): JSX.Element {
  const pressedOnOverlay = useRef(false)
  return (
    <div
      className="drawer-overlay"
      onMouseDown={(e) => {
        pressedOnOverlay.current = e.target === e.currentTarget
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && pressedOnOverlay.current) onClose()
      }}
    >
      <div className={className} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}
