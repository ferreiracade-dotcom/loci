import type { ReactNode } from 'react'
import { useStore } from '../../store/useStore'
import { MODES_FOR_PILL, resolveCorpusMode, type CorpusMode, type RefPill } from '../../lib/corpusMode'

const MODE_LABELS: Record<CorpusMode, string> = {
  books: 'Books',
  bible: 'Bible',
  confessions: 'Confessions'
}

/** The mode a pill should show, plus the setter that pins it. Auto-follows the focused centre
 *  tab until the user picks a mode; after that the pin wins and persists. */
export function useCorpusMode(pill: RefPill): {
  mode: CorpusMode
  setMode: (m: CorpusMode) => void
  modes: CorpusMode[]
} {
  const tabs = useStore((s) => s.tabs)
  const paneOrder = useStore((s) => s.paneOrder)
  const activePaneId = useStore((s) => s.activePaneId)
  const refModes = useStore((s) => s.refModes)
  const setRefMode = useStore((s) => s.setRefMode)

  const focusedTabId = paneOrder.find((p) => p.id === activePaneId)?.activeTabId
  const focusedKind = tabs.find((t) => t.id === focusedTabId)?.kind

  const modes = MODES_FOR_PILL[pill]
  const mode = resolveCorpusMode(modes, refModes[pill] ?? null, focusedKind)
  return { mode, setMode: (m) => setRefMode(pill, m), modes }
}

/** Segmented control naming the corpus a panel is showing. Renders nothing for single-mode
 *  pills, so wrappers can include it unconditionally. */
export function CorpusSwitch({ pill }: { pill: RefPill }): ReactNode {
  const { mode, setMode, modes } = useCorpusMode(pill)
  if (modes.length < 2) return null
  return (
    <div className="corpus-switch">
      {modes.map((m) => (
        <button
          key={m}
          className={`corpus-switch-btn${m === mode ? ' active' : ''}`}
          onClick={() => setMode(m)}
        >
          {MODE_LABELS[m]}
        </button>
      ))}
    </div>
  )
}
