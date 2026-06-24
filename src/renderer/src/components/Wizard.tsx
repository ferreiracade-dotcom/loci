import { useState } from 'react'
import { FolderOpen, Check, ChevronRight, ChevronLeft, Library } from 'lucide-react'
import { useStore } from '../store/useStore'
import { api } from '../lib/api'

interface FolderRowProps {
  label: string
  hint: string
  value: string | null
  onPick: () => void
  warn?: string
}

function FolderRow({ label, hint, value, onPick, warn }: FolderRowProps) {
  return (
    <div className="folder-row">
      <div className="folder-row-head">
        <span className="folder-label">{label}</span>
        <button className="btn btn-sm" onClick={onPick}>
          <FolderOpen size={14} />
          {value ? 'Change' : 'Choose…'}
        </button>
      </div>
      <p className="folder-hint">{hint}</p>
      {value && <div className="folder-path">{value}</div>}
      {warn && <div className="field-error">{warn}</div>}
    </div>
  )
}

const STEP_TITLES = ['Vault folder', 'PDF source', 'Local backup', 'Set a password']

export function Wizard() {
  const completeWizard = useStore((s) => s.completeWizard)
  const [step, setStep] = useState(0)
  const [vaultPath, setVaultPath] = useState<string | null>(null)
  const [pdfSourcePath, setPdfSourcePath] = useState<string | null>(null)
  const [backupPath, setBackupPath] = useState<string | null>(null)
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [busy, setBusy] = useState(false)

  async function pick(setter: (p: string) => void): Promise<void> {
    const p = await api.chooseFolder('Choose a folder')
    if (p) setter(p)
  }

  const backupSameAsVault = !!backupPath && backupPath === vaultPath
  const pwTooShort = pw.length > 0 && pw.length < 4
  const pwMismatch = pw2.length > 0 && pw !== pw2

  const canAdvance =
    (step === 0 && !!vaultPath) ||
    (step === 1 && !!pdfSourcePath) ||
    (step === 2 && !!backupPath && !backupSameAsVault) ||
    step === 3
  const canFinish =
    !!vaultPath && !!pdfSourcePath && !!backupPath && !backupSameAsVault && pw.length >= 4 && pw === pw2

  async function finish(): Promise<void> {
    if (!canFinish || busy) return
    setBusy(true)
    await completeWizard({
      vaultPath: vaultPath as string,
      pdfSourcePath: pdfSourcePath as string,
      backupPath: backupPath as string,
      password: pw
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
            <p className="brand-sub">Let’s set up your study. ({step + 1} of 4)</p>
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
              hint="Where your notes, PDFs, and pages live. A Google Drive for Desktop synced folder is recommended."
              value={vaultPath}
              onPick={() => pick(setVaultPath)}
            />
          )}
          {step === 1 && (
            <FolderRow
              label="PDF source folder"
              hint="Loci imports PDFs from here. They are cached into your vault."
              value={pdfSourcePath}
              onPick={() => pick(setPdfSourcePath)}
            />
          )}
          {step === 2 && (
            <FolderRow
              label="Local backup folder"
              hint="A separate folder (not your vault, not Drive) for the local backup snapshot."
              value={backupPath}
              onPick={() => pick(setBackupPath)}
              warn={backupSameAsVault ? 'The backup folder must be different from the vault folder.' : undefined}
            />
          )}
          {step === 3 && (
            <div className="pw-step">
              <p className="folder-hint">
                Loci locks on launch. There is no password recovery — keep it safe. (Reset means
                deleting the stored hash; documented in Help.)
              </p>
              <input
                className="field"
                type="password"
                placeholder="Password (min 4 characters)"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
              />
              {pwTooShort && <div className="field-error">Use at least 4 characters.</div>}
              <input
                className="field"
                type="password"
                placeholder="Confirm password"
                value={pw2}
                onChange={(e) => setPw2(e.target.value)}
              />
              {pwMismatch && <div className="field-error">Passwords don’t match.</div>}
            </div>
          )}
        </div>

        <div className="wizard-foot">
          <button className="btn" disabled={step === 0 || busy} onClick={() => setStep((s) => s - 1)}>
            <ChevronLeft size={14} />
            Back
          </button>
          {step < 3 ? (
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
