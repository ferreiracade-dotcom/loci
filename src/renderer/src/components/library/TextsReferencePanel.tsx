import type { ReactNode } from 'react'
import { CorpusSwitch, useCorpusMode } from './CorpusSwitch'
import { ReferenceBiblePanel } from './ReferenceBiblePanel'
import { ReferenceBocPanel } from './ReferenceBocPanel'

/** The Texts pill: a live Bible or Book of Concord reader, independent of the centre. */
export function TextsReferencePanel(): ReactNode {
  const { mode } = useCorpusMode('texts')
  return (
    <>
      <CorpusSwitch pill="texts" />
      {mode === 'confessions' ? <ReferenceBocPanel /> : <ReferenceBiblePanel />}
    </>
  )
}
