export interface KeyLike {
  key: string
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  shiftKey: boolean
  target: EventTarget | null
}

const IS_MAC = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform)

/**
 * Keys a text field or the note editor needs for itself, which the tab shortcuts must let
 * through: Ctrl+Shift+B (blockquote) inside the note editor, and Option+Left/Right (move by
 * word) in any text field on macOS. (Ctrl+Alt+0, the editor's paragraph key, is kept out of
 * zoom reset in useTabShortcuts.)
 */
export function leaveToEditor(e: KeyLike, isMac = IS_MAC): boolean {
  const t = e.target as (HTMLElement & { isContentEditable?: boolean }) | null
  const rich = !!t?.isContentEditable
  const field = rich || t?.tagName === 'INPUT' || t?.tagName === 'TEXTAREA'
  const ctrl = e.ctrlKey || e.metaKey
  if (rich && ctrl && e.shiftKey && !e.altKey && e.key.toLowerCase() === 'b') return true
  if (isMac && field && e.altKey && !ctrl && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) return true
  return false
}
