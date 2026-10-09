import { useCallback, useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { useStore } from '../store/useStore'
import { ThreePanel } from './ThreePanel'
import { LocateFileBanner } from './LocateFileBanner'
import { QuickCapture } from './library/QuickCapture'
import { ChromeTabStrip } from './chrome/ChromeTabStrip'
import { ChromeToolbar } from './chrome/ChromeToolbar'
import { useTabShortcuts } from './chrome/useTabShortcuts'
import { useHistoryRecorder } from './chrome/useHistoryRecorder'

export function Shell() {
  const appState = useStore((s) => s.appState)
  const relocateVault = useStore((s) => s.relocateVault)
  const indexing = useStore((s) => s.indexing)
  const toast = useStore((s) => s.toast)
  const setToast = useStore((s) => s.setToast)
  const zoom = useStore((s) => s.zoom)
  const [quickOpen, setQuickOpen] = useState(false)
  const openQuickCapture = useCallback(() => setQuickOpen(true), [])

  // Clear the status toast a few seconds after it appears (it may have been set during the
  // welcome screen, before the Shell mounted — so the timer starts here, when it's first shown).
  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(null), 6000)
    return () => window.clearTimeout(t)
  }, [toast, setToast])

  useTabShortcuts({ onQuickCapture: openQuickCapture })
  useHistoryRecorder()

  const vaultMissing = !!appState && (!appState.vaultPath || !appState.vaultExists)

  return (
    <div className="shell">
      {/* Page zoom scales the whole document; the title-bar rows are counter-zoomed so they
          keep matching the OS window controls drawn over the strip. */}
      <div className="chrome-top" style={zoom !== 100 ? { zoom: 100 / zoom } : undefined}>
        <ChromeTabStrip />
        <ChromeToolbar onQuickCapture={openQuickCapture} />
      </div>
      {vaultMissing && (
        <LocateFileBanner
          message={
            appState?.vaultPath
              ? `Vault folder not found: ${appState.vaultPath}`
              : 'No vault folder is set.'
          }
          actionLabel="Locate vault"
          onAction={() => void relocateVault()}
        />
      )}
      <ThreePanel />
      {quickOpen && <QuickCapture onClose={() => setQuickOpen(false)} />}
      {indexing && indexing.total > 0 && (
        <div className="indexing-badge">
          <RefreshCw size={13} className="spin" /> Indexing {indexing.done}/{indexing.total}
        </div>
      )}
      {toast && <div className="toast toast-shell">{toast}</div>}
    </div>
  )
}
