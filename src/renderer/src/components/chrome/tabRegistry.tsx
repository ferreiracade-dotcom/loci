import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  Bookmark as BookmarkIcon,
  BookMarked,
  BookOpen,
  Church,
  FileText,
  History,
  Landmark,
  Library,
  MessageSquareQuote,
  NotebookPen,
  Plus,
  Quote,
  ScrollText,
  Search,
  Settings as SettingsIcon
} from 'lucide-react'
import type { Tab, TabKind, TabLocation } from '../../store/workspace'
import type { BookKind, ProjectItem } from '@shared/ipc'
import { KIND_LABEL, KIND_PLURAL } from '@shared/libraryKind'
import { bookByCode } from '@shared/scriptureRef'
import { bocDocument } from '@shared/bookOfConcord'
import { dogmaticsTopic } from '@shared/dogmaticsTopics'
import { fathersVolumeLabel } from '@shared/fathers'
import { ALL_COMMENTARIES } from '@shared/ipc'
import { RichNoteEditor } from '../library/RichNoteEditor'
import { PdfReader } from '../library/PdfReader'
import { BiblePane } from '../library/BiblePane'
import { BocPane } from '../library/BocPane'
import { QuoteGroupPane } from '../library/QuoteGroupPane'
import { CommentaryPane } from '../library/CommentaryPane'
import { DogmaticsPane } from '../library/DogmaticsPane'
import { FathersPane } from '../library/FathersPane'
import { PanePicker } from '../library/PanePicker'
import { LibraryView } from '../library/LibraryView'
import { NotesView } from '../library/NotesView'
import { QuotesView } from '../library/QuotesView'
import { Settings } from '../Settings'
import { NewTabPage } from './NewTabPage'
import { SearchPage } from './SearchPage'
import { HistoryPage } from './HistoryPage'
import { BookmarksManager } from './BookmarksManager'

/** What a tab's title may need to look up. */
export interface TitleContext {
  books: { id: string; title: string; kind?: BookKind }[]
  notes: { path: string; title: string }[]
  /** The focused Confessions section's number/label, when the caller has looked it up. */
  bocSection?: { number: string | null; label: string } | null
  /** The focused Commentary/Dogmatics/Fathers tab's source (Fathers: the author), work and
   *  place (Dogmatics book, Fathers section), when the caller has looked them up. */
  reader?: { source?: string; work?: string; place?: string } | null
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
  /** Secondary line for hover cards and the History page. `ctx` lets a kind look up details
   *  (a library tab says Book or Article). */
  subtitle: (tab: Tab, ctx?: { books: { id: string; kind?: BookKind }[] }) => string
  /** The tab's content, or null when its fields are incomplete (falls back to New Tab). */
  render: (tab: Tab, ctx: RenderContext) => ReactNode | null
  /** Record visits to this kind on the History page. */
  recordHistory: boolean
  /** The omnibox breadcrumb (`Bible › John 3:16 (BSB)`). Default: the title alone. */
  breadcrumb?: (tab: Tab, ctx: TitleContext) => string[]
  /** What the omnibox selects for editing (Ctrl+L) and a new bookmark is named. Default: title. */
  locationText?: (tab: Tab, ctx: TitleContext) => string
}

/** ":16" or ":16-18" for a run of highlighted verses; "" when none. */
function verseSuffix(highlight: number[] | undefined): string {
  if (!highlight || highlight.length === 0) return ''
  const lo = Math.min(...highlight)
  const hi = Math.max(...highlight)
  return lo === hi ? `:${lo}` : `:${lo}-${hi}`
}

function bibleRef(tab: Tab): string {
  if (!tab.book || tab.chapter == null) return 'Bible'
  return `${bookByCode(tab.book)?.name ?? tab.book} ${tab.chapter}${verseSuffix(tab.highlight)}`
}

function bocParts(tab: Tab, ctx: TitleContext): [string, string] {
  const doc = tab.documentCode ? bocDocument(tab.documentCode) : undefined
  const abbr = doc?.abbreviation ?? tab.documentCode ?? 'Confessions'
  const sec = ctx.bocSection
  const where = sec ? (sec.number ?? sec.label) : tab.sectionOrdinal != null ? `§${tab.sectionOrdinal}` : ''
  return [abbr, where]
}

function commentaryRef(tab: Tab): string {
  if (!tab.book || tab.chapter == null) return 'Commentary'
  return `${bookByCode(tab.book)?.name ?? tab.book} ${tab.chapter}${tab.verse ? `:${tab.verse}` : ''}`
}

function commentarySource(tab: Tab, ctx: TitleContext): string | undefined {
  if (tab.commentarySourceId === ALL_COMMENTARIES) return 'All commentaries'
  return ctx.reader?.source
}

/** A dogmatics tab's place: the topic it reads across the works, else its book's title. */
function dogmaticsPlace(tab: Tab, ctx: TitleContext): string | undefined {
  if (tab.dogmaticsTopic) return dogmaticsTopic(tab.dogmaticsTopic)?.name
  return ctx.reader?.place
}

/** A Fathers tab's location parts: author, work and section when looked up, else the volume. */
function fathersParts(tab: Tab, ctx: TitleContext): string[] {
  const r = ctx.reader
  if (tab.fathersAuthor) return [r?.source ?? 'Author']
  if (!tab.fathersVolume) return []
  const parts = [r?.source, r?.work, r?.place].filter((x): x is string => !!x)
  return parts.length ? parts : [fathersVolumeLabel(tab.fathersVolume)]
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
    case 'dogmatics':
      return g.displayName
    case 'boc':
    case 'fathers':
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
    subtitle: (tab, ctx) => {
      const kind = ctx?.books.find((b) => b.id === tab.bookId)?.kind
      return kind ? `Library · ${KIND_LABEL[kind]}` : 'Library'
    },
    render: (tab) => (tab.bookId ? <PdfReader bookId={tab.bookId} embedded /> : null),
    recordHistory: true,
    breadcrumb: (tab, ctx) => {
      const kind = ctx.books.find((b) => b.id === tab.bookId)?.kind
      const title = TAB_REGISTRY.pdf.title(tab, ctx)
      return kind ? ['Library', KIND_PLURAL[kind], title] : ['Library', title]
    }
  },
  note: {
    icon: FileText,
    title: (tab, ctx) => ctx.notes.find((n) => n.path === tab.notePath)?.title ?? 'Note',
    subtitle: () => 'Note',
    render: (tab) => (tab.notePath ? <RichNoteEditor path={tab.notePath} /> : null),
    recordHistory: true,
    breadcrumb: (tab, ctx) => ['Notes', TAB_REGISTRY.note.title(tab, ctx)]
  },
  bible: {
    icon: ScrollText,
    title: (tab) =>
      tab.book && tab.chapter != null ? `${bookByCode(tab.book)?.name ?? tab.book} ${tab.chapter}` : 'Bible',
    subtitle: (tab) => `Bible${tab.translation ? ` · ${tab.translation}` : ''}`,
    render: (tab) => (tab.book && tab.chapter != null ? <BiblePane tab={tab} /> : null),
    recordHistory: true,
    breadcrumb: (tab) => ['Bible', `${bibleRef(tab)}${tab.translation ? ` (${tab.translation})` : ''}`],
    locationText: bibleRef
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
    render: (tab) => (tab.documentCode && tab.sectionOrdinal != null ? <BocPane tab={tab} /> : null),
    recordHistory: true,
    breadcrumb: (tab, ctx) => ['Confessions', ...bocParts(tab, ctx).filter(Boolean)],
    locationText: (tab, ctx) => bocParts(tab, ctx).filter(Boolean).join(' ')
  },
  commentary: {
    icon: MessageSquareQuote,
    title: (tab) =>
      tab.book && tab.chapter != null ? `${bookByCode(tab.book)?.name ?? tab.book} ${tab.chapter}` : 'Commentary',
    subtitle: () => 'Commentary',
    render: (tab) => (tab.book && tab.chapter != null ? <CommentaryPane tab={tab} /> : null),
    recordHistory: true,
    breadcrumb: (tab, ctx) => ['Commentary', commentarySource(tab, ctx) ?? '', commentaryRef(tab)].filter(Boolean),
    locationText: (tab, ctx) => {
      const source = commentarySource(tab, ctx)
      return source ? `${source}, ${commentaryRef(tab)}` : `Commentary, ${commentaryRef(tab)}`
    }
  },
  dogmatics: {
    icon: Landmark,
    title: (tab) => (tab.dogmaticsTopic ? dogmaticsTopic(tab.dogmaticsTopic)?.name : undefined) ?? 'Dogmatics',
    subtitle: (tab) => (tab.dogmaticsTopic ? 'Dogmatics · topic' : 'Dogmatics'),
    render: (tab) => <DogmaticsPane tab={tab} />,
    recordHistory: true,
    breadcrumb: (tab, ctx) =>
      ['Dogmatics', tab.dogmaticsTopic ? '' : (ctx.reader?.source ?? ''), dogmaticsPlace(tab, ctx) ?? ''].filter(Boolean),
    locationText: (tab, ctx) => {
      const place = dogmaticsPlace(tab, ctx)
      const source = tab.dogmaticsTopic ? undefined : ctx.reader?.source
      return [source, place].filter(Boolean).join(', ') || 'Dogmatics'
    }
  },
  quotes: {
    icon: Quote,
    title: quotesLabel,
    subtitle: () => 'Saved quotes',
    render: (tab) => (tab.quotesGroup ? <QuoteGroupPane group={tab.quotesGroup} /> : null),
    recordHistory: true,
    breadcrumb: (tab) => ['Quotes', quotesLabel(tab)]
  },
  newtab: {
    icon: Plus,
    title: () => 'New Tab',
    subtitle: () => 'Search or open something',
    render: (tab, ctx) =>
      ctx.restrictToProject ? (
        <PanePicker tabId={tab.id} restrictToProject={ctx.restrictToProject} />
      ) : (
        <NewTabPage tabId={tab.id} />
      ),
    recordHistory: false,
    breadcrumb: () => [],
    locationText: () => ''
  },
  search: {
    icon: Search,
    title: (tab) => (tab.query ? `${tab.query} - Search` : 'Search'),
    subtitle: () => 'Loci search',
    render: (tab) => <SearchPage tabId={tab.id} query={tab.query ?? ''} />,
    recordHistory: true,
    breadcrumb: (tab) => ['Search', tab.query ?? ''],
    locationText: (tab) => tab.query ?? ''
  },
  library: page(Library, 'Library', 'Your books', () => <LibraryView />),
  notes: page(NotebookPen, 'Notes', 'All notes', () => <NotesView />),
  quotesIndex: page(Quote, 'Quotes', 'Saved quotes', () => <QuotesView />),
  fathers: {
    icon: Church,
    // Volume code only in the strip (main's choice); the omnibox has author › work › section.
    title: (tab) => (tab.fathersVolume && !tab.fathersAuthor ? fathersVolumeLabel(tab.fathersVolume) : 'Church Fathers'),
    subtitle: (tab) => (tab.fathersAuthor ? 'Church Fathers · author' : 'Church Fathers'),
    render: (tab) => <FathersPane tab={tab} />,
    recordHistory: true,
    breadcrumb: (tab, ctx) => ['Church Fathers', ...fathersParts(tab, ctx)],
    locationText: (tab, ctx) => fathersParts(tab, ctx).join(', ') || 'Church Fathers'
  },
  settings: page(SettingsIcon, 'Settings', 'loci://settings', () => <Settings />),
  history: page(History, 'History', 'loci://history', () => <HistoryPage />),
  bookmarks: page(BookmarkIcon, 'Bookmarks', 'loci://bookmarks', () => <BookmarksManager />)
}

export function tabDef(kind: TabKind): TabKindDef {
  return TAB_REGISTRY[kind] ?? TAB_REGISTRY.newtab
}

export function tabTitle(tab: Tab, ctx: TitleContext): string {
  return tabDef(tab.kind).title(tab, ctx)
}

/** The omnibox breadcrumb for a tab (empty for a New Tab page, which shows a placeholder). */
export function tabBreadcrumb(tab: Tab, ctx: TitleContext): string[] {
  const def = tabDef(tab.kind)
  return def.breadcrumb ? def.breadcrumb(tab, ctx) : [def.title(tab, ctx)]
}

/** A tab's location as one line of text: what Ctrl+L selects and a new bookmark is called. */
export function tabLocationText(tab: Tab, ctx: TitleContext): string {
  const def = tabDef(tab.kind)
  return def.locationText ? def.locationText(tab, ctx) : def.title(tab, ctx)
}

/** A pseudo-tab for a history entry or bookmark location, so the registry can label it. */
export function locationTab(loc: TabLocation): Tab {
  return { id: '', order: 0, ...loc }
}
