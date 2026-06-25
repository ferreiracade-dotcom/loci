import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { useStore } from '../store/useStore'
import { ThreePanel } from './ThreePanel'
import { Settings } from './Settings'
import { LocateFileBanner } from './LocateFileBanner'
import { QuickCapture } from './library/QuickCapture'

export function Shell() {
  const appState = useStore((s) => s.appState)
  const relocateVault = useStore((s) => s.relocateVault)
  const indexing = useStore((s) => s.indexing)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [quickOpen, setQuickOpen] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'n') {
        e.preventDefault()
        setQuickOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const vaultMissing = !!appState && (!appState.vaultPath || !appState.vaultExists)

  return (
    <div className="shell">
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
      <ThreePanel onOpenSettings={() => setSettingsOpen(true)} />
      {settingsOpen && <Settings onClose={() => setSettingsOpen(false)} />}
      {quickOpen && <QuickCapture onClose={() => setQuickOpen(false)} />}
      {indexing && indexing.total > 0 && (
        <div className="indexing-badge">
          <RefreshCw size={13} className="spin" /> Indexing {indexing.done}/{indexing.total}
        </div>
      )}
    </div>
  )
}
