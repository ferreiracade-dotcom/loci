import type { ReactNode } from 'react'
import { CorpusSwitch, useCorpusMode } from './CorpusSwitch'
import { CommentaryPanel } from './CommentaryPanel'
import { BocCommentaryPanel } from './BocCommentaryPanel'
import { FathersCatenaPanel } from './FathersCatenaPanel'

/** The Commentary pill: commentary for the last verse or section clicked — or, in Fathers mode,
 *  the catena of what the Church Fathers say on the open passage. */
export function CommentaryReferencePanel(): ReactNode {
  const { mode } = useCorpusMode('commentary')
  return (
    <div className="ref-corpus-panel">
      <CorpusSwitch pill="commentary" />
      {mode === 'confessions' ? (
        <BocCommentaryPanel />
      ) : mode === 'fathers' ? (
        <FathersCatenaPanel />
      ) : (
        <CommentaryPanel />
      )}
    </div>
  )
}
