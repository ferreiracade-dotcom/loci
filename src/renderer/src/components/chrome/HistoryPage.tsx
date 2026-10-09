import { useEffect, useMemo, useState } from 'react'
import { Search, Trash2 } from 'lucide-react'
import { useStore } from '../../store/useStore'
import type { Tab, TabContent, TabKind } from '../../store/workspace'
import { api } from '../../lib/api'
import type { HistoryEntry } from '@shared/ipc'
import { TAB_REGISTRY, tabDef } from './tabRegistry'

function dayLabel(d: Date): string {
  const today = new Date()
  const start = (x: Date): number => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const diff = Math.round((start(today) - start(d)) / 86_400_000)
  const date = d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
  if (diff === 0) return `Today - ${date}`
  if (diff === 1) return `Yesterday - ${date}`
  return date
}

function parseLocation(e: HistoryEntry): TabContent | null {
  try {
    const c = JSON.parse(e.location) as TabContent
    return c && typeof c.kind === 'string' && c.kind in TAB_REGISTRY ? c : null
  } catch {
    return null
  }
}

/** loci://history: visited tab locations by day, newest first. */
export function HistoryPage() {
  const openTab = useStore((s) => s.openTab)
  const books = useStore((s) => s.books)
  const notes = useStore((s) => s.standaloneNotes)
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null)
  const [q, setQ] = useState('')

  useEffect(() => {
    void api.listHistory(1000).then(setEntries)
  }, [])

  const groups = useMemo(() => {
    const ql = q.trim().toLowerCase()
    const bookIds = new Set(books.map((b) => b.id))
    const notePaths = new Set(notes.map((n) => n.path))
    const out: { day: string; rows: { e: HistoryEntry; c: TabContent }[] }[] = []
    for (const e of entries ?? []) {
      const c = parseLocation(e)
      if (!c) continue
      // Skip entries whose book or note no longer exists.
      if (c.kind === 'pdf' && !bookIds.has(c.bookId)) continue
      if (c.kind === 'note' && !notePaths.has(c.notePath)) continue
      if (ql && !e.title.toLowerCase().includes(ql)) continue
      const day = dayLabel(new Date(e.visitedAt))
      const last = out[out.length - 1]
      if (last?.day === day) last.rows.push({ e, c })
      else out.push({ day, rows: [{ e, c }] })
    }
    return out
  }, [entries, q, books, notes])

  const clear = async (): Promise<void> => {
    if (!window.confirm('Clear all history?')) return
    await api.clearHistory()
    setEntries([])
  }

  return (
    <div className="history-page">
      <div className="history-head">
        <h2>History</h2>
        <div className="history-search">
          <Search size={15} />
          <input placeholder="Search history" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <button className="btn btn-sm" onClick={() => void clear()} disabled={!entries?.length}>
          <Trash2 size={14} /> Clear history
        </button>
      </div>
      {entries && groups.length === 0 && (
        <div className="history-empty">{q ? 'No matching history.' : 'Pages you visit appear here.'}</div>
      )}
      {groups.map((g) => (
        <section key={g.day} className="history-day">
          <h3>{g.day}</h3>
          {g.rows.map(({ e, c }) => {
            const def = tabDef(c.kind as TabKind)
            const Icon = def.icon
            const asTab = { id: '', order: 0, ...c } as Tab
            return (
              <button
                key={e.id}
                className="history-row"
                title="Open in a new tab"
                onClick={() => openTab(c)}
                onAuxClick={(ev) => {
                  if (ev.button === 1) openTab(c, { activate: false })
                }}
              >
                <span className="history-time">
                  {new Date(e.visitedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                </span>
                <Icon size={15} />
                <span className="history-title">{e.title}</span>
                <span className="history-sub">{def.subtitle(asTab)}</span>
              </button>
            )
          })}
        </section>
      ))}
    </div>
  )
}
