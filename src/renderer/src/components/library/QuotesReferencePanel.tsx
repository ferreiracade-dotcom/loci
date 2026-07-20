import type { ReactNode } from 'react'
import { CorpusSwitch, useCorpusMode } from './CorpusSwitch'
import { QuotesPanel } from './QuotesPanel'
import { ScriptureHighlightsPanel } from './ScriptureHighlightsPanel'
import { BocQuotesPanel } from './BocQuotesPanel'

/** The Quotes pill: quotes for whatever you have open, per corpus. */
export function QuotesReferencePanel(): ReactNode {
  const { mode } = useCorpusMode('quotes')
  return (
    <div className="ref-corpus-panel">
      <CorpusSwitch pill="quotes" />
      {mode === 'bible' ? (
        <ScriptureHighlightsPanel />
      ) : mode === 'confessions' ? (
        <BocQuotesPanel />
      ) : (
        <QuotesPanel />
      )}
    </div>
  )
}
