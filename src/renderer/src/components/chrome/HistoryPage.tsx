import { useEffect, useMemo, useState } from 'react'
import { Laptop, Search, Trash2 } from 'lucide-react'
import { useStore } from '../../store/useStore'
import type { Tab, TabContent, TabKind } from '../../store/workspace'
import { api } from '../../lib/api'
import type { HistoryEntry } from '@shared/ipc'
import type { DeviceTabs } from '@shared/sync'
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

/** "5 minutes ago" style age of a timestamp. */
export function ageLabel(t: number, now = Date.now()): string {
  const min = Math.max(0, Math.round((now - t) / 60_000))
  if (min < 1) return 'just now'
  if (min < 60) return `${min} minute${min === 1 ? '' : 's'} ago`
  const h = Math.round(min / 60)
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`
  const d = Math.round(h / 24)
  return `${d} day${d === 1 ? '' : 's'} ago`
}

/** Another device's tabs that are still openable here (known kind), filtered by `q`. */
function deviceRows(d: DeviceTabs, q: string): { title: string; c: TabContent; group?: string; color?: string }[] {
  const out: { title: string; c: TabContent; group?: string; color?: string }[] = []
  for (const t of d.tabs) {
    const c = t.location as unknown as TabContent
    if (!c || typeof c.kind !== 'string' || !(c.kind in TAB_REGISTRY)) continue
    if (q && !t.title.toLowerCase().includes(q)) continue
    out.push({ title: t.title, c, group: t.groupName, color: t.groupColor })
  }
  return out
}

/** Chrome's "Tabs from other devices": each other computer's open tabs, by device. */
function OtherDevices({ q }: { q: string }) {
  const openTab = useStore((s) => s.openTab)
  const books = useStore((s) => s.books)
  const devices = useStore((s) => s.remoteDevices)
  const shown = devices.map((d) => ({ d, rows: deviceRows(d, q) })).filter((x) => x.rows.length > 0)
  if (shown.length === 0) return null
  return (
    <section className="history-day history-devices">
      <h3>Tabs from other devices</h3>
      {shown.map(({ d, rows }) => (
        <div key={d.deviceId} className="history-device">
          <div className="history-device-head">
            <Laptop size={14} />
            <span className="history-device-name">{d.deviceName}</span>
            <span className="history-sub">{ageLabel(d.updatedAt)}</span>
          </div>
          {rows.map(({ title, c, group, color }, i) => {
            const def = tabDef(c.kind as TabKind)
            const Icon = def.icon
            const asTab = { id: '', order: 0, ...c } as Tab
            return (
              <button
                key={i}
                className="history-row"
                title="Open in a new tab (Ctrl+click: in the background)"
                onClick={(ev) => openTab(c, ev.ctrlKey || ev.metaKey ? { activate: false } : {})}
                onAuxClick={(ev) => {
                  if (ev.button === 1) openTab(c, { activate: false })
                }}
              >
                <Icon size={15} />
                <span className="history-title">{title}</span>
                {group && (
                  <span className="history-group" style={color ? { background: color } : undefined}>
                    {group}
                  </span>
                )}
                <span className="history-sub">{def.subtitle(asTab, { books })}</span>
              </button>
            )
          })}
        </div>
      ))}
    </section>
  )
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
      <OtherDevices q={q.trim().toLowerCase()} />
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
                <span className="history-sub">{def.subtitle(asTab, { books })}</span>
              </button>
            )
          })}
        </section>
      ))}
    </div>
  )
}
