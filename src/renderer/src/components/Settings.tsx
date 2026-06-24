import { useEffect, useState } from 'react'
import { X, FolderOpen, KeyRound, ShieldCheck } from 'lucide-react'
import { useStore } from '../store/useStore'
import { api } from '../lib/api'
import type { AiMode } from '@shared/ipc'

const TRANSLATIONS = [
  { id: 'WEB', label: 'World English Bible' },
  { id: 'KJV', label: 'King James Version' },
  { id: 'ASV', label: 'American Standard Version' },
  { id: 'LUTHER1545', label: 'Luther 1545 (German)' },
  { id: 'VULGATE', label: 'Latin Vulgate' }
]

export function Settings({ onClose }: { onClose: () => void }) {
  const config = useStore((s) => s.config)
  const refreshConfig = useStore((s) => s.refreshConfig)
  const relocateVault = useStore((s) => s.relocateVault)
  const [apiKey, setApiKey] = useState('')
  const [note, setNote] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!config) return null

  async function changeFolder(field: 'pdfSourcePath' | 'backupPath'): Promise<void> {
    const p = await api.chooseFolder('Choose a folder')
    if (!p) return
    await api.setConfig(field === 'pdfSourcePath' ? { pdfSourcePath: p } : { backupPath: p })
    await refreshConfig()
  }
  async function setTranslation(value: string): Promise<void> {
    await api.setConfig({ scriptureTranslation: value })
    await refreshConfig()
  }
  async function setAiMode(value: AiMode): Promise<void> {
    await api.setConfig({ aiMode: value })
    await refreshConfig()
  }
  async function saveApiKey(): Promise<void> {
    await api.setApiKey(apiKey)
    setApiKey('')
    await refreshConfig()
    setNote('API key saved.')
  }

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <h2 className="drawer-title">Settings</h2>
          <button className="icon-btn" title="Close" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="drawer-body">
          <section className="set-section">
            <h3 className="set-h">Folders</h3>
            <div className="set-row">
              <div>
                <div className="set-label">Vault</div>
                <div className="set-path">{config.vaultPath ?? 'Not set'}</div>
              </div>
              <button className="btn btn-sm" onClick={() => void relocateVault()}>
                <FolderOpen size={14} /> Change
              </button>
            </div>
            <div className="set-row">
              <div>
                <div className="set-label">PDF source</div>
                <div className="set-path">{config.pdfSourcePath ?? 'Not set'}</div>
              </div>
              <button className="btn btn-sm" onClick={() => void changeFolder('pdfSourcePath')}>
                <FolderOpen size={14} /> Change
              </button>
            </div>
            <div className="set-row">
              <div>
                <div className="set-label">Local backup</div>
                <div className="set-path">{config.backupPath ?? 'Not set'}</div>
              </div>
              <button className="btn btn-sm" onClick={() => void changeFolder('backupPath')}>
                <FolderOpen size={14} /> Change
              </button>
            </div>
          </section>

          <section className="set-section">
            <h3 className="set-h">Scripture</h3>
            <label className="set-label" htmlFor="translation">
              Default translation
            </label>
            <select
              id="translation"
              className="field"
              value={config.scriptureTranslation}
              onChange={(e) => void setTranslation(e.target.value)}
            >
              {TRANSLATIONS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </section>

          <section className="set-section">
            <h3 className="set-h">AI Assistant</h3>
            <div className="seg">
              {(['copy-only', 'copy-api'] as AiMode[]).map((m) => (
                <button
                  key={m}
                  className={`seg-btn${config.aiMode === m ? ' active' : ''}`}
                  onClick={() => void setAiMode(m)}
                >
                  {m === 'copy-only' ? 'Copy only' : 'Copy + API'}
                </button>
              ))}
            </div>
            <p className="folder-hint">
              The Claude API is optional and metered, billed by Anthropic separately. With no key,
              only the free “Copy for Claude” path is used — fully usable at $0.
            </p>
            <div className="set-row">
              <div className="api-status">
                {config.hasApiKey ? (
                  <>
                    <ShieldCheck size={14} className="ok" /> API key set
                  </>
                ) : (
                  <>
                    <KeyRound size={14} /> No API key
                  </>
                )}
              </div>
            </div>
            <div className="api-key-row">
              <input
                className="field"
                type="password"
                placeholder="Paste Claude API key…"
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value)
                  setNote(null)
                }}
              />
              <button className="btn btn-sm" disabled={!apiKey.trim()} onClick={() => void saveApiKey()}>
                Save
              </button>
            </div>
            {note && <div className="field-ok">{note}</div>}
          </section>

          <section className="set-section">
            <h3 className="set-h">Vault Health</h3>
            <p className="folder-hint">
              Backup controls, manual reindex, and broken-link reports arrive in later phases. The
              index is always rebuildable from your files.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
