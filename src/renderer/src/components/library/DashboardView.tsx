import { Fragment, useCallback, useEffect, useState, type ReactNode } from 'react'
import {
  RefreshCw,
  BookOpen,
  FileText,
  Quote as QuoteIcon,
  DatabaseZap,
  Unlink,
  Plus,
  BookMarked,
  Copy,
  Check
} from 'lucide-react'
import { useStore } from '../../store/useStore'
import { api } from '../../lib/api'
import type { BibliographyEntry, VaultHealth } from '@shared/ipc'

/** Render a bibliography entry with *italics* and [amber placeholders]. */
function renderEntry(text: string): ReactNode {
  return text.split(/(\*[^*]+\*|\[[^\]]+\])/g).map((p, i) => {
    if (p.startsWith('*') && p.endsWith('*')) return <em key={i}>{p.slice(1, -1)}</em>
    if (p.startsWith('[') && p.endsWith(']'))
      return (
        <span key={i} className="cite-ph">
          {p}
        </span>
      )
    return <Fragment key={i}>{p}</Fragment>
  })
}

export function DashboardView({ compact = false }: { compact?: boolean }) {
  const createNote = useStore((s) => s.createNote)
  const openNote = useStore((s) => s.openNote)
  const standaloneNotes = useStore((s) => s.standaloneNotes)
  const [health, setHealth] = useState<VaultHealth | null>(null)
  const [biblio, setBiblio] = useState<BibliographyEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const [h, b] = await Promise.all([api.vaultHealth(), api.buildBibliography()])
      setHealth(h)
      setBiblio(b)
    } finally {
      setLoading(false)
    }
  }, [])

  const copyBibliography = (): void => {
    const text = biblio.map((e) => e.entry.replace(/\*/g, '')).join('\n\n')
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    })
  }

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

      <div className="dash-section">
        <h3>
          <BookMarked size={15} /> Bibliography{biblio.length ? ` (${biblio.length})` : ''}
          {biblio.length > 0 && (
            <button className="btn btn-sm dash-copy-biblio" onClick={copyBibliography}>
              {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? 'Copied' : 'Copy all'}
            </button>
          )}
        </h3>
        {biblio.length === 0 ? (
          <div className="dash-ok">
            No cited sources yet. Capture a quote from a book and it appears here in CMOS 18
            bibliography form.
          </div>
        ) : (
          <ol className="biblio-list">
            {biblio.map((b, i) => (
              <li key={i} className="biblio-entry">
                {renderEntry(b.entry)}
                <span className="biblio-count">
                  · {b.quotes} quote{b.quotes === 1 ? '' : 's'}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  )
}
