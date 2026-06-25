import { useCallback, useEffect, useState } from 'react'
import {
  RefreshCw,
  BookOpen,
  FileText,
  Quote as QuoteIcon,
  DatabaseZap,
  Unlink,
  Plus
} from 'lucide-react'
import { useStore } from '../../store/useStore'
import { api } from '../../lib/api'
import type { VaultHealth } from '@shared/ipc'

export function DashboardView({ compact = false }: { compact?: boolean }) {
  const createNote = useStore((s) => s.createNote)
  const openNote = useStore((s) => s.openNote)
  const standaloneNotes = useStore((s) => s.standaloneNotes)
  const [health, setHealth] = useState<VaultHealth | null>(null)
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      setHealth(await api.vaultHealth())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh, standaloneNotes.length])

  const stats = health
    ? [
        { icon: BookOpen, label: 'Books', value: String(health.books) },
        { icon: DatabaseZap, label: 'Indexed', value: `${health.indexed}/${health.books}` },
        { icon: FileText, label: 'Notes', value: String(health.notes) },
        { icon: QuoteIcon, label: 'Quotes', value: String(health.quotes) }
      ]
    : []

  return (
    <div className={`dashboard${compact ? ' compact' : ''}`}>
      <div className="dash-head">
        <h2>Dashboard</h2>
        <button className="btn btn-sm" onClick={() => void refresh()}>
          <RefreshCw size={14} className={loading ? 'spin' : ''} /> Refresh
        </button>
      </div>

      <div className="dash-stats">
        {stats.map(({ icon: Icon, label, value }) => (
          <div key={label} className="dash-card">
            <Icon size={18} />
            <div className="dash-card-val">{value}</div>
            <div className="dash-card-label">{label}</div>
          </div>
        ))}
      </div>

      <div className="dash-section">
        <h3>
          <Unlink size={15} /> Vault Health — broken links
          {health ? ` (${health.brokenLinks.length})` : ''}
        </h3>
        {health && health.brokenLinks.length === 0 && (
          <div className="dash-ok">Every [[link]] resolves. Nothing to fix. ✓</div>
        )}
        <div className="broken-list">
          {health?.brokenLinks.map((bl, i) => (
            <div key={`${bl.source}-${bl.link}-${i}`} className="broken-row">
              <span className="broken-link">[[{bl.link}]]</span>
              <span className="broken-src">
                in{' '}
                <button className="linkish" onClick={() => openNote(bl.source)}>
                  {bl.sourceTitle}
                </button>
              </span>
              <button
                className="btn btn-sm"
                title={`Create a note titled “${bl.link}” so the link resolves`}
                onClick={() => void createNote(bl.link).then(refresh)}
              >
                <Plus size={13} /> Create note
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
