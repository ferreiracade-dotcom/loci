import {
  BookOpen,
  NotebookPen,
  Search,
  ScrollText,
  Network,
  LayoutDashboard,
  Files,
  BookMarked,
  FileText,
  Link2,
  Highlighter,
  File,
  BookOpenText,
  MessageSquareQuote,
  MessageSquareText,
  Quote
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { RailItem } from './IconRail'

/** Left sidebar views (spec §3). */
export const LEFT_VIEWS: RailItem[] = [
  { id: 'library', label: 'Library', icon: BookOpen },
  { id: 'notes', label: 'Notes', icon: NotebookPen },
  { id: 'quotes', label: 'Quotes', icon: Quote },
  { id: 'search', label: 'Search', icon: Search },
  { id: 'scripture', label: 'Scripture', icon: ScrollText },
  { id: 'confessions', label: 'Confessions', icon: BookMarked },
  { id: 'graph', label: 'Graph', icon: Network },
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'pages', label: 'Pages', icon: Files }
]

/** Right notes-panel tabs (spec §3). */
// Right-hand reference panel sources. Tags were folded into Search + the notes list.
export const RIGHT_TABS: RailItem[] = [
  { id: 'book-notes', label: 'Book Quotes', icon: BookMarked },
  { id: 'scripture-highlights', label: 'Bible Quotes', icon: Highlighter },
  { id: 'standalone-notes', label: 'Notes', icon: FileText },
  { id: 'backlinks', label: 'Backlinks', icon: Link2 },
  { id: 'reference-pdf', label: 'Books', icon: File },
  { id: 'reference-bible', label: 'Bible', icon: BookOpenText },
  { id: 'commentary', label: 'Commentary', icon: MessageSquareQuote },
  { id: 'boc-commentary', label: 'Confessions', icon: MessageSquareText }
]

interface EmptyCopy {
  icon: LucideIcon
  title: string
  subtitle: string
}

/** Phase-0 empty states for each left view — everything is empty until later phases. */
export const CENTER_EMPTY: Record<string, EmptyCopy> = {
  library: {
    icon: BookOpen,
    title: 'Your library is empty',
    subtitle: 'PDF import and cover art arrive in Phase 1. For now, the shell is ready.'
  },
  notes: {
    icon: NotebookPen,
    title: 'No notes yet',
    subtitle: 'Linked notes and quote entities arrive in Phase 2.'
  },
  quotes: {
    icon: Quote,
    title: 'No quotes yet',
    subtitle: 'Capture quotes from books, the Bible, or commentary and they collect here.'
  },
  search: {
    icon: Search,
    title: 'Nothing to search yet',
    subtitle: 'Full-text search over your library arrives in Phase 3.'
  },
  scripture: {
    icon: ScrollText,
    title: 'Scripture index',
    subtitle: 'Reference recognition and the Scripture/Confessions index arrive in Phase 8.'
  },
  confessions: {
    icon: BookMarked,
    title: 'Book of Concord',
    subtitle: 'Pick a document from the reader to begin — the Augsburg Confession opens by default.'
  },
  graph: {
    icon: Network,
    title: 'Graph view',
    subtitle: 'An interactive graph is a stub for v1 (Phase 11).'
  },
  dashboard: {
    icon: LayoutDashboard,
    title: 'Dashboard',
    subtitle: 'Reading stats and recent activity arrive in Phase 10.'
  },
  pages: {
    icon: Files,
    title: 'Entity pages',
    subtitle: 'Author, denomination, and topic pages assemble themselves in Phase 7.'
  }
}
