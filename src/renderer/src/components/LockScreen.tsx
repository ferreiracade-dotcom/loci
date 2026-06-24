import { useState } from 'react'
import type { FormEvent } from 'react'
import { Lock } from 'lucide-react'
import { useStore } from '../store/useStore'

export function LockScreen() {
  const unlock = useStore((s) => s.unlock)
  const [pw, setPw] = useState('')
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent): Promise<void> {
    e.preventDefault()
    if (!pw || busy) return
    setBusy(true)
    setError(false)
    const ok = await unlock(pw)
    if (!ok) {
      setError(true)
      setPw('')
      setBusy(false)
    }
  }

  return (
    <div className="centered-stage">
      <form className="card lock-card" onSubmit={submit}>
        <div className="lock-mark">
          <Lock size={22} />
        </div>
        <h1 className="brand">Loci</h1>
        <p className="brand-sub">The common places.</p>
        <input
          className={`field${error ? ' field--error' : ''}`}
          type="password"
          placeholder="Password"
          autoFocus
          value={pw}
          onChange={(e) => {
            setPw(e.target.value)
            setError(false)
          }}
        />
        {error && <div className="field-error">Incorrect password.</div>}
        <button className="btn btn-primary btn-block" type="submit" disabled={!pw || busy}>
          {busy ? 'Unlocking…' : 'Unlock'}
        </button>
      </form>
    </div>
  )
}
