import type { ReactNode } from 'react'
import type { BookKind } from '@shared/ipc'
import { KIND_PLURAL } from '@shared/libraryKind'

const KINDS: BookKind[] = ['book', 'article']

/** Books | Articles segmented control with counts; reuses the corpus-switch look of the other
 *  reference pills (but is local state, not a CorpusMode). */
export function KindSwitch({
  kind,
  onChange,
  counts
}: {
  kind: BookKind
  onChange: (k: BookKind) => void
  counts: Record<BookKind, number>
}): ReactNode {
  return (
    <div className="corpus-switch">
      {KINDS.map((k) => (
        <button
          key={k}
          className={`corpus-switch-btn${k === kind ? ' active' : ''}`}
          onClick={() => onChange(k)}
        >
          {KIND_PLURAL[k]} {counts[k]}
        </button>
      ))}
    </div>
  )
}
