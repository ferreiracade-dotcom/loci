import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  BookMarked,
  BookOpen,
  FileText,
  History,
  Landmark,
  LayoutDashboard,
  Library,
  NotebookPen,
  Plus,
  Quote,
  ScrollText,
  Settings as SettingsIcon
} from 'lucide-react'
import type { Tab, TabKind } from '../../store/workspace'
import type { ProjectItem } from '@shared/ipc'
import { bookByCode } from '@shared/scriptureRef'
import { bocDocument } from '@shared/bookOfConcord'
import { RichNoteEditor } from '../library/RichNoteEditor'
import { PdfReader } from '../library/PdfReader'
import { BiblePane } from '../library/BiblePane'
import { BocPane } from '../library/BocPane'
import { QuoteGroupPane } from '../library/QuoteGroupPane'
import { PanePicker } from '../library/PanePicker'
import { LibraryView } from '../library/LibraryView'
import { NotesView } from '../library/NotesView'
import { QuotesView } from '../library/QuotesView'
import { DashboardView } from '../library/DashboardView'
import { Settings } from '../Settings'
import { NewTabPage } from './NewTabPage'
import { HistoryPage } from './HistoryPage'
import { FathersPage } from './FathersPage'

/** What a tab's title may need to look up. */
export interface TitleContext {
  books: { id: string; title: string }[]
  notes: { path: string; title: string }[]
}

/** What a tab's body is rendered with. */
export interface RenderContext {
  /** Close this tab. */
  close: () => void
  /** Turn this tab back into a New Tab page. */
  replace: () => void
  /** Set when this tab's split partner is a Project note: the tab is its sources surface. */
  restrictToProject?: ProjectItem[]
}

export interface TabKindDef {
  icon: LucideIcon
  /** Tab label. */
  title: (tab: Tab, ctx: TitleContext) => string
  /** Secondary line for hover cards and the History page. */
  subtitle: (tab: Tab) => string
  /** The tab's content, or null when its fields are incomplete (falls back to New Tab). */
  render: (tab: Tab, ctx: RenderContext) => ReactNode | null
  /** Record visits to this kind on the History page. */
  recordHistory: boolean
}

function quotesLabel(tab: Tab): string {
  const g = tab.quotesGroup
  if (!g) return 'Quotes'
  switch (g.type) {
    case 'book':
      return g.title
    case 'scripture':
      return g.chapter != null ? `${g.name} ${g.chapter}` : g.name
    case 'commentary':
      return g.displayName
    case 'boc':
      return g.name
    case 'author':
      return g.author
    case 'tag':
      return g.tag ? `#${g.tag}` : 'Untagged'
  }
}

const page = (icon: LucideIcon, label: string, subtitle: string, render: TabKindDef['render']): TabKindDef => ({
  icon,
  title: () => label,
  subtitle: () => subtitle,
  render,
  recordHistory: true
})

/**
 * THE mapping from tab kind to icon, label and component. Adding a tab kind (or giving a
 * placeholder kind such as 'fathers' its real view) means editing this object only.
 */
export const TAB_REGISTRY: Record<TabKind, TabKindDef> = {
  pdf: {
    icon: BookOpen,
    title: (tab, ctx) => ctx.books.find((b) => b.id === tab.bookId)?.title ?? 'Document',
    subtitle: () => 'Library · PDF',
    render: (tab) => (tab.bookId ? <PdfReader bookId={tab.bookId} embedded /> : null),
    recordHistory: true
  },
  note: {
    icon: FileText,
    title: (tab, ctx) => ctx.notes.find((n) => n.path === tab.notePath)?.title ?? 'Note',
    subtitle: () => 'Note',
    render: (tab) => (tab.notePath ? <RichNoteEditor path={tab.notePath} /> : null),
    recordHistory: true
  },
  bible: {
    icon: ScrollText,
    title: (tab) =>
      tab.book && tab.chapter != null ? `${bookByCode(tab.book)?.name ?? tab.book} ${tab.chapter}` : 'Bible',
    subtitle: (tab) => `Bible${tab.translation ? ` · ${tab.translation}` : ''}`,
    render: (tab, ctx) =>
      tab.book && tab.chapter != null ? <BiblePane tab={tab} onClose={ctx.close} onReplace={ctx.replace} /> : null,
    recordHistory: true
  },
  boc: {
    icon: BookMarked,
    title: (tab) => {
      const doc = tab.documentCode ? bocDocument(tab.documentCode) : undefined
      return doc?.abbreviation ?? tab.documentCode ?? 'Confessions'
    },
    subtitle: (tab) => {
      const doc = tab.documentCode ? bocDocument(tab.documentCode) : undefined
      return doc ? `${doc.title} · Book of Concord` : 'Book of Concord'
    },
    render: (tab, ctx) =>
      tab.documentCode && tab.sectionOrdinal != null ? (
        <BocPane tab={tab} onClose={ctx.close} onReplace={ctx.replace} />
      ) : null,
    recordHistory: true
  },
  quotes: {
    icon: Quote,
    title: quotesLabel,
    subtitle: () => 'Saved quotes',
    render: (tab) => (tab.quotesGroup ? <QuoteGroupPane group={tab.quotesGroup} /> : null),
    recordHistory: true
  },
  newtab: {
    icon: Plus,
    title: () => 'New Tab',
    subtitle: () => 'Search or open something',
    render: (tab, ctx) =>
      ctx.restrictToProject ? (
        <PanePicker tabId={tab.id} restrictToProject={ctx.restrictToProject} />
      ) : (
        <NewTabPage />
      ),
    recordHistory: false
  },
  library: page(Library, 'Library', 'Your books', () => <LibraryView />),
  notes: page(NotebookPen, 'Notes', 'All notes', () => <NotesView />),
  quotesIndex: page(Quote, 'Quotes', 'Saved quotes', () => <QuotesView />),
  fathers: page(Landmark, 'Church Fathers', 'Church Fathers corpus', () => <FathersPage />),
  settings: page(SettingsIcon, 'Settings', 'loci://settings', () => <Settings />),
  history: page(History, 'History', 'loci://history', () => <HistoryPage />),
  dashboard: page(LayoutDashboard, 'Dashboard', 'Vault health and bibliography', () => <DashboardView />)
}

export function tabDef(kind: TabKind): TabKindDef {
  return TAB_REGISTRY[kind] ?? TAB_REGISTRY.newtab
}

export function tabTitle(tab: Tab, ctx: TitleContext): string {
  return tabDef(tab.kind).title(tab, ctx)
}
