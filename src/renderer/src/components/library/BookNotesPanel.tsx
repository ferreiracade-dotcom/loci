import { useState } from 'react'
import { useStore } from '../../store/useStore'
import { NoteEditor } from './NoteEditor'
import { QuotesPanel } from './QuotesPanel'

export function BookNotesPanel({ bookId }: { bookId: string }) {
  const [view, setView] = useState<'note' | 'quotes'>('note')
  const quoteCount = useStore((s) => s.quotes.length)

  return (
    <div className="book-notes">
      <div className="bn-toggle">
        <button className={view === 'note' ? 'active' : ''} onClick={() => setView('note')}>
          Note
        </button>
        <button className={view === 'quotes' ? 'active' : ''} onClick={() => setView('quotes')}>
          Quotes{quoteCount ? ` (${quoteCount})` : ''}
        </button>
      </div>
      <div className="bn-body">
        {view === 'note' ? <NoteEditor bookId={bookId} /> : <QuotesPanel />}
      </div>
    </div>
  )
}
