import type { ReactNode } from 'react'
import { CorpusSwitch, useCorpusMode } from './CorpusSwitch'
import { QuotesPanel } from './QuotesPanel'
import { ScriptureHighlightsPanel } from './ScriptureHighlightsPanel'

/** The Quotes pill: quotes for whatever you have open, per corpus. The Confessions mode is
 *  added in Task 6. */
export function QuotesReferencePanel(): ReactNode {
  const { mode } = useCorpusMode('quotes')
  return (
    <>
      <CorpusSwitch pill="quotes" />
      {mode === 'bible' ? <ScriptureHighlightsPanel /> : <QuotesPanel />}
    </>
  )
}
