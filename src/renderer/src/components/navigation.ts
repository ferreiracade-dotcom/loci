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
  BookOpenText
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { RailItem } from './IconRail'

/** Left sidebar views (spec §3). */
export const LEFT_VIEWS: RailItem[] = [
  { id: 'library', label: 'Library', icon: BookOpen },
  { id: 'notes', label: 'Notes', icon: NotebookPen },
  { id: 'search', label: 'Search', icon: Search },
  { id: 'scripture', label: 'Scripture', icon: ScrollText },
  { id: 'graph', label: 'Graph', icon: Network },
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'pages', label: 'Pages', icon: Files }
]

/** Right notes-panel tabs (spec §3). */
// Right-hand reference panel sources. Tags were folded into Search + the notes list.
export const RIGHT_TABS: RailItem[] = [
  { id: 'book-notes', label: 'Book Notes', icon: BookMarked },
  { id: 'scripture-highlights', label: 'Scripture', icon: Highlighter },
  { id: 'standalone-notes', label: 'Notes', icon: FileText },
  { id: 'backlinks', label: 'Backlinks', icon: Link2 },
  { id: 'reference-pdf', label: 'PDF', icon: File },
  { id: 'reference-bible', label: 'Bible', icon: BookOpenText }
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
