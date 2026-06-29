import { useState } from 'react'
import { FolderOpen, Check, ChevronRight, ChevronLeft, Library } from 'lucide-react'
import { useStore } from '../store/useStore'
import { api } from '../lib/api'

interface FolderRowProps {
  label: string
  hint: string
  value: string | null
  onPick: () => void
  onClear?: () => void
  warn?: string
}

function FolderRow({ label, hint, value, onPick, onClear, warn }: FolderRowProps) {
  return (
    <div className="folder-row">
      <div className="folder-row-head">
        <span className="folder-label">{label}</span>
        <div className="folder-row-actions">
          {value && onClear && (
            <button className="btn btn-sm btn-ghost" onClick={onClear}>
              Clear
            </button>
          )}
          <button className="btn btn-sm" onClick={onPick}>
            <FolderOpen size={14} />
            {value ? 'Change' : 'Choose…'}
          </button>
        </div>
      </div>
      <p className="folder-hint">{hint}</p>
      {value && <div className="folder-path">{value}</div>}
      {warn && <div className="field-error">{warn}</div>}
    </div>
  )
}

const STEP_TITLES = ['Vault', 'Import', 'Local books', 'Backup']
const LAST_STEP = STEP_TITLES.length - 1

export function Wizard() {
  const completeWizard = useStore((s) => s.completeWizard)
  const [step, setStep] = useState(0)
  const [vaultPath, setVaultPath] = useState<string | null>(null)
  const [pdfSourcePath, setPdfSourcePath] = useState<string | null>(null)
  const [primaryLibraryPath, setPrimaryLibraryPath] = useState<string | null>(null)
  const [keepLocalCopies, setKeepLocalCopies] = useState(false)
  const [backupPath, setBackupPath] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function pick(setter: (p: string) => void): Promise<void> {
    const p = await api.chooseFolder('Choose a folder')
    if (p) setter(p)
  }

  const backupSameAsVault = !!backupPath && backupPath === vaultPath
  const canAdvance =
    (step === 0 && !!vaultPath) ||
    (step === 1 && !!pdfSourcePath) ||
    step === 2 || // Local books is optional
    (step === 3 && !!backupPath && !backupSameAsVault)
  const canFinish = !!vaultPath && !!pdfSourcePath && !!backupPath && !backupSameAsVault

  async function finish(): Promise<void> {
    if (!canFinish || busy) return
    setBusy(true)
    await completeWizard({
      vaultPath: vaultPath as string,
      pdfSourcePath: pdfSourcePath as string,
      backupPath: backupPath as string,
      primaryLibraryPath,
      keepLocalCopies
    })
  }

  return (
    <div className="centered-stage">
      <div className="card wizard-card">
        <div className="wizard-head">
          <div className="lock-mark">
            <Library size={20} />
          </div>
          <div>
            <h1 className="brand small">Welcome to Loci</h1>
            <p className="brand-sub">
              Let’s set up your study. ({step + 1} of {STEP_TITLES.length})
            </p>
          </div>
        </div>

        <div className="stepper">
          {STEP_TITLES.map((t, i) => (
            <div key={t} className={`step-dot${i === step ? ' active' : ''}${i < step ? ' done' : ''}`}>
              <span className="step-num">{i < step ? <Check size={12} /> : i + 1}</span>
              <span className="step-name">{t}</span>
            </div>
          ))}
        </div>

        <div className="wizard-body">
          {step === 0 && (
            <FolderRow
              label="Vault folder"
              hint="Where your notes, highlights, and pages live and sync. A Google Drive for Desktop folder is recommended so your study follows you across machines."
              value={vaultPath}
              onPick={() => pick(setVaultPath)}
            />
          )}
          {step === 1 && (
            <FolderRow
              label="PDF import folder"
              hint="Drop PDFs here and Loci imports them. They’re added to your Drive vault; whether a copy also stays on this device is set on the next step."
              value={pdfSourcePath}
              onPick={() => pick(setPdfSourcePath)}
            />
          )}
          {step === 2 && (
            <div className="wizard-stack">
              <label className="set-toggle">
                <input
                  type="checkbox"
                  checked={keepLocalCopies}
                  onChange={(e) => setKeepLocalCopies(e.target.checked)}
                />
                <div>
                  <div className="set-label">Keep a local copy of books on this device</div>
                  <p className="set-help">
                    <strong>On:</strong> imported PDFs are saved both to this machine and the Drive
                    vault, and Drive-only books download to disk so your whole library works offline.{' '}
                    <strong>Off:</strong> books live on Drive and are cached only when you open them —
                    lighter on disk, good for a phone or a small drive. You can change this anytime in
                    Settings.
                  </p>
                </div>
              </label>
              <FolderRow
                label="Existing local PDF folder (optional)"
                hint="Already keep PDFs on this PC? Point Loci at that folder and it reads those files directly — fast, no copying — instead of pulling from Drive."
                value={primaryLibraryPath}
                onPick={() => pick(setPrimaryLibraryPath)}
                onClear={() => setPrimaryLibraryPath(null)}
              />
            </div>
          )}
          {step === 3 && (
            <FolderRow
              label="Local backup folder"
              hint="A separate folder (not your vault, not Drive) for the local backup snapshot."
              value={backupPath}
              onPick={() => pick(setBackupPath)}
              warn={backupSameAsVault ? 'The backup folder must be different from the vault folder.' : undefined}
            />
          )}
        </div>

        <div className="wizard-foot">
          <button className="btn" disabled={step === 0 || busy} onClick={() => setStep((s) => s - 1)}>
            <ChevronLeft size={14} />
            Back
          </button>
          {step < LAST_STEP ? (
            <button className="btn btn-primary" disabled={!canAdvance} onClick={() => setStep((s) => s + 1)}>
              Next
              <ChevronRight size={14} />
            </button>
          ) : (
            <button className="btn btn-primary" disabled={!canFinish || busy} onClick={finish}>
              {busy ? 'Setting up…' : 'Finish setup'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
