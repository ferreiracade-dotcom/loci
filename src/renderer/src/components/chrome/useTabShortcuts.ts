import { useEffect } from 'react'
import { useStore } from '../../store/useStore'
import { BOOKMARK_TAB_EVENT, FOCUS_OMNIBOX_EVENT } from './Omnibox'

/**
 * Chrome's tab keyboard shortcuts. Registered in the capture phase on window so they win over
 * content handlers (e.g. the PDF reader's PageDown). There is no application menu in the main
 * process, so nothing there competes for these keys and F5 / Ctrl+R never reload the window.
 */
export function useTabShortcuts({ onQuickCapture }: { onQuickCapture: () => void }): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const s = useStore.getState()
      const ctrl = e.ctrlKey || e.metaKey
      const key = e.key.toLowerCase()
      let handled = true
      if (ctrl && e.shiftKey && key === 'n') onQuickCapture()
      else if (ctrl && e.shiftKey && key === 't') s.reopenClosedTab()
      else if (ctrl && !e.shiftKey && key === 't') s.newTab(null)
      else if (ctrl && !e.shiftKey && (key === 'w' || key === 'f4')) {
        if (s.activeTabId) s.closeTab(s.activeTabId)
      } else if (ctrl && key === 'tab') s.cycleTab(e.shiftKey ? -1 : 1)
      else if (ctrl && !e.shiftKey && key === 'pagedown') s.cycleTab(1)
      else if (ctrl && !e.shiftKey && key === 'pageup') s.cycleTab(-1)
      else if (ctrl && !e.shiftKey && !e.altKey && /^[1-9]$/.test(e.key)) s.selectTabByNumber(Number(e.key))
      else if (ctrl && !e.shiftKey && key === 'h') s.openPage('history')
      else if (ctrl && e.shiftKey && !e.altKey && key === 'b') s.toggleBookmarksBar()
      else if (ctrl && e.shiftKey && !e.altKey && key === 'o') s.openPage('bookmarks')
      else if (e.altKey && !ctrl && !e.shiftKey && e.key === 'ArrowLeft') s.goBack()
      else if (e.altKey && !ctrl && !e.shiftKey && e.key === 'ArrowRight') s.goForward()
      else if (ctrl && !e.shiftKey && !e.altKey && key === 'l') window.dispatchEvent(new Event(FOCUS_OMNIBOX_EVENT))
      else if (e.altKey && !ctrl && !e.shiftKey && key === 'd') window.dispatchEvent(new Event(FOCUS_OMNIBOX_EVENT))
      else if (ctrl && !e.shiftKey && !e.altKey && key === 'd') window.dispatchEvent(new Event(BOOKMARK_TAB_EVENT))
      else if (ctrl && (key === '=' || key === '+')) s.stepZoom(1)
      else if (ctrl && (key === '-' || key === '_')) s.stepZoom(-1)
      else if (ctrl && key === '0') s.stepZoom(0)
      else if (e.key === 'F5' || (ctrl && !e.shiftKey && key === 'r')) {
        if (s.activeTabId) s.reloadTab(s.activeTabId)
      } else handled = false
      if (handled) {
        e.preventDefault()
        e.stopPropagation()
      }
    }
    // The mouse's side buttons (3 = back, 4 = forward) step the focused tab's history. A press
    // in a split half has already focused that half (TabWorkspace focuses on mousedown).
    const onMouseUp = (e: MouseEvent): void => {
      if (e.button !== 3 && e.button !== 4) return
      e.preventDefault()
      const s = useStore.getState()
      if (e.button === 3) s.goBack()
      else s.goForward()
    }
    const onMouseDown = (e: MouseEvent): void => {
      if (e.button === 3 || e.button === 4) e.preventDefault()
    }
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('mouseup', onMouseUp, true)
    window.addEventListener('mousedown', onMouseDown, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('mouseup', onMouseUp, true)
      window.removeEventListener('mousedown', onMouseDown, true)
    }
  }, [onQuickCapture])
}
