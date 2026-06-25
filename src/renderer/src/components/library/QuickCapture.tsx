import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { api } from '../../lib/api'

export function QuickCapture({ onClose }: { onClose: () => void }) {
  const loadStandaloneNotes = useStore((s) => s.loadStandaloneNotes)
  const openNote = useStore((s) => s.openNote)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const save = async (open: boolean): Promise<void> => {
    if (busy) return
    const t = title.trim() || 'Quick note'
    setBusy(true)
    const note = await api.createNote(t)
    if (body.trim()) {
      const base = await api.readNote(note.path)
      await api.saveNote(note.path, `${base}${body.trim()}\n`)
    }
    await loadStandaloneNotes()
    onClose()
    if (open) openNote(note.path)
  }

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <h2 className="drawer-title">Quick capture</h2>
          <button className="icon-btn" title="Close" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <div className="drawer-body">
          <input
            className="field"
            autoFocus
            placeholder="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <textarea
            className="field qc-body"
            placeholder="Write a quick note… (Ctrl+Enter to save)"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault()
                void save(false)
              }
            }}
          />
          <div className="qc-actions">
            <button className="btn btn-sm" disabled={busy} onClick={() => void save(true)}>
              Save &amp; open
            </button>
            <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => void save(false)}>
              Save
            </button>
          </div>
          <p className="folder-hint">Saved to /vault/notes/standalone/.</p>
        </div>
      </div>
    </div>
  )
}
