import { useState } from 'react'
import { useStore } from '../store/useStore'
import { ThreePanel } from './ThreePanel'
import { Settings } from './Settings'
import { LocateFileBanner } from './LocateFileBanner'

export function Shell() {
  const appState = useStore((s) => s.appState)
  const relocateVault = useStore((s) => s.relocateVault)
  const [settingsOpen, setSettingsOpen] = useState(false)

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
    </div>
  )
}
