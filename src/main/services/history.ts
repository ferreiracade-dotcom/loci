import { getDb } from '../db/connection'
import type { HistoryEntry, NewHistoryEntry } from '../../shared/ipc'

/** Rows kept; older ones are pruned on insert. */
const MAX_ROWS = 5000

interface HistoryRow {
  id: number
  visited_at: string
  kind: string
  title: string
  location: string
}

/** Record a visit, unless it repeats the most recent entry. */
export function addHistory(entry: NewHistoryEntry): void {
  const db = getDb()
  const last = db.prepare('SELECT location FROM history ORDER BY id DESC LIMIT 1').get() as
    | { location: string }
    | undefined
  if (last?.location === entry.location) return
  db.prepare('INSERT INTO history (visited_at, kind, title, location) VALUES (?, ?, ?, ?)').run(
    new Date().toISOString(),
    entry.kind,
    entry.title,
    entry.location
  )
  db.prepare(
    'DELETE FROM history WHERE id <= (SELECT id FROM history ORDER BY id DESC LIMIT 1 OFFSET ?)'
  ).run(MAX_ROWS)
}

export function listHistory(limit = 500): HistoryEntry[] {
  const rows = getDb()
    .prepare('SELECT * FROM history ORDER BY id DESC LIMIT ?')
    .all(Math.max(1, Math.min(limit, MAX_ROWS))) as HistoryRow[]
  return rows.map((r) => ({
    id: r.id,
    visitedAt: r.visited_at,
    kind: r.kind,
    title: r.title,
    location: r.location
  }))
}

export function clearHistory(): void {
  getDb().prepare('DELETE FROM history').run()
}
