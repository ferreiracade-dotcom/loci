import { useEffect } from 'react'
import { useStore } from '../../store/useStore'

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
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onQuickCapture])
}
