import { Library, BookOpenText, MessageSquareQuote, Quote, FileText } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export interface RailItem {
  id: string
  label: string
  icon: LucideIcon
}

/** Right reference-panel pills, organised by task. Corpus is a mode inside a panel, not a pill,
 *  so adding a corpus does not add tabs here. */
export const RIGHT_TABS: RailItem[] = [
  { id: 'quotes', label: 'Quotes', icon: Quote },
  { id: 'notes', label: 'Notes', icon: FileText },
  { id: 'books', label: 'Library', icon: Library },
  { id: 'texts', label: 'Texts', icon: BookOpenText },
  { id: 'commentary', label: 'Commentary', icon: MessageSquareQuote }
]
