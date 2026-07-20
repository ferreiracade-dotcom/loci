import type { ReactNode } from 'react'
import { CorpusSwitch, useCorpusMode } from './CorpusSwitch'
import { CommentaryPanel } from './CommentaryPanel'
import { BocCommentaryPanel } from './BocCommentaryPanel'

/** The Commentary pill: commentary for the last verse or section clicked. */
export function CommentaryReferencePanel(): ReactNode {
  const { mode } = useCorpusMode('commentary')
  return (
    <>
      <CorpusSwitch pill="commentary" />
      {mode === 'confessions' ? <BocCommentaryPanel /> : <CommentaryPanel />}
    </>
  )
}
