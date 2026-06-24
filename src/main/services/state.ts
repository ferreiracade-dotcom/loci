import { getDb } from '../db/connection'
import type { PanelLayout } from '../../shared/ipc'

interface LayoutRow {
  left_width: number
  notes_width: number
  results_width: number
  left_collapsed: number
  notes_collapsed: number
  active_left_view: string
  active_right_tab: string
  cover_size: number
  library_view: string
}

export function getLayout(): PanelLayout {
  const r = getDb().prepare('SELECT * FROM panel_layout WHERE id = 1').get() as LayoutRow
  return {
    leftWidth: r.left_width,
    notesWidth: r.notes_width,
    resultsWidth: r.results_width,
    leftCollapsed: !!r.left_collapsed,
    notesCollapsed: !!r.notes_collapsed,
    activeLeftView: r.active_left_view,
    activeRightTab: r.active_right_tab,
    coverSize: r.cover_size,
    libraryView: r.library_view === 'list' ? 'list' : 'grid'
  }
}

export function setLayout(patch: Partial<PanelLayout>): void {
  const next: PanelLayout = { ...getLayout(), ...patch }
  getDb()
    .prepare(
      `UPDATE panel_layout SET
         left_width = @leftWidth,
         notes_width = @notesWidth,
         results_width = @resultsWidth,
         left_collapsed = @leftCollapsed,
         notes_collapsed = @notesCollapsed,
         active_left_view = @activeLeftView,
         active_right_tab = @activeRightTab,
         cover_size = @coverSize,
         library_view = @libraryView
       WHERE id = 1`
    )
    .run({
      leftWidth: Math.round(next.leftWidth),
      notesWidth: Math.round(next.notesWidth),
      resultsWidth: Math.round(next.resultsWidth),
      leftCollapsed: next.leftCollapsed ? 1 : 0,
      notesCollapsed: next.notesCollapsed ? 1 : 0,
      activeLeftView: next.activeLeftView,
      activeRightTab: next.activeRightTab,
      coverSize: Math.round(next.coverSize),
      libraryView: next.libraryView
    })
}

export function getSession(key: string): string | null {
  const r = getDb().prepare('SELECT value FROM session_state WHERE key = ?').get(key) as
    | { value: string }
    | undefined
  return r ? r.value : null
}

export function setSession(key: string, value: string): void {
  getDb()
    .prepare(
      `INSERT INTO session_state (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    )
    .run(key, value)
}
