import { useEffect, useState } from 'react'
import { X, FolderOpen, KeyRound, ShieldCheck, Image as ImageIcon } from 'lucide-react'
import { useStore } from '../store/useStore'
import { api } from '../lib/api'
import { DrawerOverlay } from './DrawerOverlay'
import { THEME_PRESETS } from '../lib/theme'
import type { AiMode, PublicConfig, ThemePalette } from '@shared/ipc'

function themesMatch(a: ThemePalette, b: ThemePalette): boolean {
  return (Object.keys(a) as (keyof ThemePalette)[]).every(
    (k) => a[k].toLowerCase() === b[k].toLowerCase()
  )
}

export function Settings({ onClose }: { onClose: () => void }) {
  const config = useStore((s) => s.config)
  const refreshConfig = useStore((s) => s.refreshConfig)
  const relocateVault = useStore((s) => s.relocateVault)
  const setTheme = useStore((s) => s.setTheme)
  const scriptureTranslations = useStore((s) => s.scriptureTranslations)
  const scriptureTranslation = useStore((s) => s.scriptureTranslation)
  const loadScripture = useStore((s) => s.loadScripture)
  const setScriptureTranslation = useStore((s) => s.setScriptureTranslation)
  const backfillLocal = useStore((s) => s.backfillLocal)
  const [apiKey, setApiKey] = useState('')
  const [apiBibleKey, setApiBibleKeyInput] = useState('')
  const [esvKey, setEsvKeyInput] = useState('')
  const [note, setNote] = useState<string | null>(null)
  const [backfilling, setBackfilling] = useState(false)
  const [storageMsg, setStorageMsg] = useState<string | null>(null)

  useEffect(() => {
    if (scriptureTranslations.length === 0) void loadScripture()
  }, [scriptureTranslations.length, loadScripture])

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

  async function changeFolder(
    field: 'pdfSourcePath' | 'backupPath' | 'primaryLibraryPath'
  ): Promise<void> {
    const p = await api.chooseFolder('Choose a folder')
    if (!p) return
    await api.setConfig({ [field]: p } as Partial<PublicConfig>)
    await refreshConfig()
  }
  async function clearPrimaryLibrary(): Promise<void> {
    await api.setConfig({ primaryLibraryPath: null })
    await refreshConfig()
  }
  async function setAiMode(value: AiMode): Promise<void> {
    await api.setConfig({ aiMode: value })
    await refreshConfig()
  }
  // Turning "keep local copies" on also downloads every Drive-only book to disk.
  async function setKeepLocal(value: boolean): Promise<void> {
    setStorageMsg(null)
    await api.setConfig({ keepLocalCopies: value })
    await refreshConfig()
    if (!value) return
    setBackfilling(true)
    try {
      const r = await backfillLocal()
      const parts = [`${r.connected} downloaded to this machine`]
      if (r.alreadyLocal) parts.push(`${r.alreadyLocal} already local`)
      if (r.missing) parts.push(`${r.missing} couldn’t be located`)
      setStorageMsg(parts.join(' · '))
    } finally {
      setBackfilling(false)
    }
  }
  async function saveApiKey(): Promise<void> {
    await api.setApiKey(apiKey)
    setApiKey('')
    await refreshConfig()
    setNote('API key saved.')
  }
  async function saveApiBibleKey(): Promise<void> {
    await api.setApiBibleKey(apiBibleKey)
    setApiBibleKeyInput('')
    await refreshConfig()
    await loadScripture()
    setNote('API.Bible key saved.')
  }
  async function saveEsvKey(): Promise<void> {
    await api.setEsvKey(esvKey)
    setEsvKeyInput('')
    await refreshConfig()
    await loadScripture()
    setNote('ESV key saved.')
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
              The folders below are the <strong>Vault</strong> (the master copy, synced to the
              cloud through Google Drive), an optional <strong>Primary library</strong> (a local
              folder to read books from for speed), the <strong>PDF source</strong> (where new
              books are imported from), and the <strong>Local backup</strong> (an on-disk
              snapshot).
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
                  <div className="set-label">Primary library — fast local reads (optional)</div>
                  <div className="set-path">
                    {config.primaryLibraryPath ?? 'Not set — books stream from Drive'}
                  </div>
                </div>
                <div className="bg-actions">
                  <button
                    className="btn btn-sm"
                    onClick={() => void changeFolder('primaryLibraryPath')}
                  >
                    <FolderOpen size={14} /> Change
                  </button>
                  {config.primaryLibraryPath && (
                    <button className="btn btn-sm" onClick={() => void clearPrimaryLibrary()}>
                      Clear
                    </button>
                  )}
                </div>
              </div>
              <p className="set-help">
                When set, Loci looks here first (matched by file name) when you open a book, so
                books on this machine load instantly. Leave it blank on a device that doesn’t hold
                your library — e.g. your phone — and Loci streams the book from the Google Drive
                Vault instead. If a file can’t be found here for any reason, it falls back to Drive
                automatically.
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
            <h3 className="set-h">Storage</h3>
            <label className="set-toggle">
              <input
                type="checkbox"
                checked={!!config.keepLocalCopies}
                disabled={backfilling}
                onChange={(e) => void setKeepLocal(e.target.checked)}
              />
              <div>
                <div className="set-label">Keep a local copy of books</div>
                <p className="set-help">
                  <strong>On:</strong> imported PDFs are saved to this machine and the Drive vault,
                  and turning this on now downloads your Drive-only books to disk so the whole
                  library works offline. <strong>Off:</strong> books live on Drive and are cached
                  only when you open them — lighter on disk, good for a phone or a small drive.
                </p>
              </div>
            </label>
            {backfilling && <div className="field-ok">Downloading books to this machine…</div>}
            {storageMsg && <div className="field-ok">{storageMsg}</div>}
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
              value={scriptureTranslation}
              onChange={(e) => setScriptureTranslation(e.target.value)}
            >
              {scriptureTranslations.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.abbr} — {t.name}
                </option>
              ))}
            </select>
            <p className="set-help">
              BSB (Berean Standard Bible) is built in and needs no key. Add the keys below to
              unlock copyrighted translations — they appear here automatically.
            </p>

            <div className="set-label appearance-bg-label">API.Bible key — NKJV, NASB</div>
            <div className="set-row">
              <div className="api-status">
                {config.hasApiBibleKey ? (
                  <>
                    <ShieldCheck size={14} className="ok" /> Key set
                  </>
                ) : (
                  <>
                    <KeyRound size={14} /> No key
                  </>
                )}
              </div>
            </div>
            <div className="api-key-row">
              <input
                className="field"
                type="password"
                placeholder="Paste API.Bible key…"
                value={apiBibleKey}
                onChange={(e) => {
                  setApiBibleKeyInput(e.target.value)
                  setNote(null)
                }}
              />
              <button
                className="btn btn-sm"
                disabled={!apiBibleKey.trim()}
                onClick={() => void saveApiBibleKey()}
              >
                Save
              </button>
            </div>
            <p className="set-help">
              Free at <code>scripture.api.bible</code>. The Starter plan is non-commercial and lets
              you pick up to 3 copyrighted versions; whichever of NKJV/NASB your key carries will
              light up. Copyrighted text is fetched live, not stored to disk.
            </p>

            <div className="set-label appearance-bg-label">ESV key — Crossway</div>
            <div className="set-row">
              <div className="api-status">
                {config.hasEsvKey ? (
                  <>
                    <ShieldCheck size={14} className="ok" /> Key set
                  </>
                ) : (
                  <>
                    <KeyRound size={14} /> No key
                  </>
                )}
              </div>
            </div>
            <div className="api-key-row">
              <input
                className="field"
                type="password"
                placeholder="Paste ESV API key…"
                value={esvKey}
                onChange={(e) => {
                  setEsvKeyInput(e.target.value)
                  setNote(null)
                }}
              />
              <button className="btn btn-sm" disabled={!esvKey.trim()} onClick={() => void saveEsvKey()}>
                Save
              </button>
            </div>
            <p className="set-help">
              Free for non-commercial use at <code>api.esv.org</code>. Crossway's terms cap local
              caching, so ESV is fetched live and not saved to disk.
            </p>
            {note && <div className="field-ok">{note}</div>}
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
