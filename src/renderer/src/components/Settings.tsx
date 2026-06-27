import { useEffect, useState } from 'react'
import { X, FolderOpen, KeyRound, ShieldCheck, Image as ImageIcon } from 'lucide-react'
import { useStore } from '../store/useStore'
import { api } from '../lib/api'
import { DrawerOverlay } from './DrawerOverlay'
import { THEME_PRESETS } from '../lib/theme'
import type { AiMode, ThemePalette } from '@shared/ipc'

function themesMatch(a: ThemePalette, b: ThemePalette): boolean {
  return (Object.keys(a) as (keyof ThemePalette)[]).every(
    (k) => a[k].toLowerCase() === b[k].toLowerCase()
  )
}

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
  const setTheme = useStore((s) => s.setTheme)
  const [apiKey, setApiKey] = useState('')
  const [note, setNote] = useState<string | null>(null)

  async function pickBackground(): Promise<void> {
    await api.pickWelcomeBackground()
    await refreshConfig()
  }
  async function resetBackground(): Promise<void> {
    await api.resetWelcomeBackground()
    await refreshConfig()
  }

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
    <DrawerOverlay onClose={onClose}>
      <div className="drawer-head">
          <h2 className="drawer-title">Settings</h2>
          <button className="icon-btn" title="Close" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="drawer-body">
          <section className="set-section">
            <h3 className="set-h">Folders</h3>
            <p className="set-help set-intro">
              The three folders below are the <strong>Vault</strong> (the master copy, synced to
              the cloud through Google Drive), the <strong>PDF source</strong> (where new books
              are imported from), and the <strong>Local backup</strong> (an on-disk snapshot).
              Opening a book reads a fast local copy cached on this PC automatically — that isn’t
              a folder you set here.
            </p>

            <div className="set-folder">
              <div className="set-row">
                <div>
                  <div className="set-label">Vault — cloud sync &amp; backup</div>
                  <div className="set-path">{config.vaultPath ?? 'Not set'}</div>
                </div>
                <button className="btn btn-sm" onClick={() => void relocateVault()}>
                  <FolderOpen size={14} /> Change
                </button>
              </div>
              <p className="set-help">
                The master copy of everything Loci creates — notes, highlights, reading progress,
                and imported PDFs. Because it lives inside Google Drive, Drive mirrors it across
                your machines and keeps the off-machine copy. The search index is rebuilt from
                here, so this folder is the source of truth.
              </p>
            </div>

            <div className="set-folder">
              <div className="set-row">
                <div>
                  <div className="set-label">PDF source — import pool</div>
                  <div className="set-path">{config.pdfSourcePath ?? 'Not set'}</div>
                </div>
                <button className="btn btn-sm" onClick={() => void changeFolder('pdfSourcePath')}>
                  <FolderOpen size={14} /> Change
                </button>
              </div>
              <p className="set-help">
                The folder Loci scans when you click <strong>Import from source</strong> to add
                new books. It’s only the intake pool — once a book is imported it’s read from its
                own local copy, not from here.
              </p>
            </div>

            <div className="set-folder">
              <div className="set-row">
                <div>
                  <div className="set-label">Local backup — snapshot</div>
                  <div className="set-path">{config.backupPath ?? 'Not set'}</div>
                </div>
                <button className="btn btn-sm" onClick={() => void changeFolder('backupPath')}>
                  <FolderOpen size={14} /> Change
                </button>
              </div>
              <p className="set-help">
                A full snapshot of the Vault, rewritten to <code>…\vault-snapshot</code> every
                time you close Loci. Keep it on a different drive from the cloud Vault, so one bad
                sync or accidental deletion can’t wipe everything.
              </p>
            </div>
          </section>

          <section className="set-section">
            <h3 className="set-h">Appearance</h3>
            <div className="set-label">Theme</div>
            <div className="theme-grid">
              {THEME_PRESETS.map((p) => {
                const active = themesMatch(p.theme, config.theme)
                return (
                  <button
                    key={p.id}
                    className={`theme-card${active ? ' active' : ''}`}
                    onClick={() => void setTheme(p.theme)}
                  >
                    <div className="theme-swatch" style={{ background: p.theme.base }}>
                      <span style={{ background: p.theme.sidebar }} />
                      <span style={{ background: p.theme.card }} />
                      <span className="theme-swatch-accent" style={{ background: p.theme.accent }} />
                      <span className="theme-swatch-text" style={{ background: p.theme.text }} />
                    </div>
                    <span className="theme-card-label">{p.label}</span>
                  </button>
                )
              })}
            </div>

            <div className="set-label appearance-bg-label">Unlock background</div>
            <div className="set-row">
              <div className="set-path">
                {config.welcomeBackground
                  ? 'Custom image'
                  : 'Default painting — St. Joseph the Carpenter'}
              </div>
              <div className="bg-actions">
                <button className="btn btn-sm" onClick={() => void pickBackground()}>
                  <ImageIcon size={14} /> Choose…
                </button>
                {config.welcomeBackground && (
                  <button className="btn btn-sm" onClick={() => void resetBackground()}>
                    Reset
                  </button>
                )}
              </div>
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
    </DrawerOverlay>
  )
}
