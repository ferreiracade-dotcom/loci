import { create } from 'zustand'
import { api } from '../lib/api'
import { applyTheme } from '../lib/theme'
import { extractAndIndexBook } from '../lib/pdfIndex'
import { BOOKS, parseReference } from '@shared/scriptureRef'
import { DEFAULT_THEME } from '@shared/ipc'
import { parseNote, serializeFrontMatter } from '../lib/noteFrontmatter'
import type {
  Annotation,
  AppState,
  BackfillResult,
  Book,
  BookUpdate,
  CommentaryMatch,
  ImportProgress,
  ImportResult,
  NewQuote,
  NewScriptureHighlight,
  NoteSummary,
  PanelLayout,
  ProjectItem,
  PublicConfig,
  NoteType,
  Quote,
  ScriptureTranslation,
  SearchHit,
  SearchKind,
  SearchScope,
  Shelf,
  Tag,
  ThemePalette,
  WizardData
} from '@shared/ipc'

export type Phase = 'loading' | 'wizard' | 'welcome' | 'ready'

// --- Center workspace (Phase 8.7 Stage 3) ---
// 'empty' is a not-yet-filled pane that shows the content picker.
export type PaneKind = 'note' | 'bible' | 'pdf' | 'empty' | 'quotes'

/** A group of saved quotes opened in the center: a PDF, a Bible chapter, or a commentary source. */
export type QuoteGroupRef =
  | { type: 'book'; bookId: string; title: string }
  // `chapter` omitted = every chapter of this book (the "Bible book" grouping mode).
  | { type: 'scripture'; book: string; chapter?: number; translation: string; name: string }
  | { type: 'commentary'; sourceId: string; displayName: string }
  | { type: 'author'; author: string }
  | { type: 'tag'; tag: string }

/** One slot in the center workspace. Only the fields for its `kind` are set. */
export interface Pane {
  id: string
  kind: PaneKind
  notePath?: string
  bookId?: string
  book?: string
  chapter?: number
  highlight?: number[]
  translation?: string
  quotesGroup?: QuoteGroupRef
}

/** Content to place into a pane. */
export type PaneContent =
  | { kind: 'note'; notePath: string }
  | { kind: 'pdf'; bookId: string }
  | { kind: 'bible'; book: string; chapter: number; highlight?: number[]; translation?: string }
  | { kind: 'quotes'; quotesGroup: QuoteGroupRef }

function paneFromContent(c: PaneContent): Pane {
  return { id: crypto.randomUUID(), ...c }
}

/**
 * Legacy "active context" fields derived from the focused pane, so peripheral consumers
 * (QuotesPanel, BacklinksPanel, ScriptureHighlightsPanel, ReferenceBiblePanel, …) keep
 * reporting what's focused in the center without being rewritten. Scripture fields are only
 * included when a Bible pane is present, so closing/focusing other panes never clobbers them.
 */
function reflectPanes(panes: Pane[], activeId: string | null): Partial<Store> {
  const active = panes.find((p) => p.id === activeId)
  const pdf = active?.kind === 'pdf' ? active : panes.find((p) => p.kind === 'pdf')
  const notePanes = panes.filter((p) => p.kind === 'note')
  const activeNote = active?.kind === 'note' ? active : notePanes[0]
  const biblePanes = panes.filter((p) => p.kind === 'bible')
  const activeBible = active?.kind === 'bible' ? active : biblePanes[0]
  const patch: Partial<Store> = {
    openBookId: pdf?.bookId ?? null,
    activeNotePath: activeNote?.notePath ?? null
  }
  if (activeBible?.book && activeBible.chapter != null) {
    patch.scripturePassage = {
      book: activeBible.book,
      chapter: activeBible.chapter,
      highlight: activeBible.highlight ?? []
    }
    if (activeBible.translation) patch.scriptureTranslation = activeBible.translation
  }
  return patch
}

/** The note pane (if any) whose note is a Project — independent of which pane has focus, since
 *  a project's sibling pane (the sources surface) restricts based on this, not on focus. */
function findProjectPane(panes: Pane[], standaloneNotes: NoteSummary[]): Pane | null {
  return (
    panes.find(
      (p) =>
        p.kind === 'note' &&
        standaloneNotes.find((n) => n.path === p.notePath)?.type === 'project'
    ) ?? null
  )
}

function sameProjectItem(a: ProjectItem, b: ProjectItem): boolean {
  if (a.kind !== b.kind) return false
  if (a.kind === 'book' && b.kind === 'book') return a.id === b.id
  if (a.kind === 'note' && b.kind === 'note') return a.path === b.path
  if (a.kind === 'scripture' && b.kind === 'scripture') {
    return a.book === b.book && a.chapter === b.chapter
  }
  return false
}

/** Rewrite a project note's `items:` frontmatter line, preserving everything else. */
async function writeProjectItems(path: string, items: ProjectItem[]): Promise<void> {
  const raw = await api.readNote(path)
  const { fm, body } = parseNote(raw)
  fm.items = items
  await api.saveNote(path, `${serializeFrontMatter(fm)}\n\n${body}`)
}

function persistWorkspace(panes: Pane[], activePaneId: string | null, paneRatio: number): void {
  // Don't persist not-yet-filled (empty) panes — they'd restore as blank pickers.
  const keep = panes.filter((p) => p.kind !== 'empty')
  const active = keep.some((p) => p.id === activePaneId) ? activePaneId : (keep[0]?.id ?? null)
  void api.setSession('workspace', JSON.stringify({ panes: keep, activePaneId: active, paneRatio }))
}

interface Store {
  phase: Phase
  appState: AppState | null
  config: PublicConfig | null
  layout: PanelLayout | null

  books: Book[]
  shelves: Shelf[]
  tags: Tag[]
  activeShelf: string | null
  libraryBusy: boolean
  /** Transient status line (e.g. a startup library-sync summary), shown by the Shell. */
  toast: string | null
  importProgress: ImportProgress | null
  openBookId: string | null
  quotes: Quote[]
  /** Bumped when the open book's note changes on disk (e.g. a quote was captured). */
  noteReloadToken: number
  standaloneNotes: NoteSummary[]
  activeNotePath: string | null
  /** A standalone note opened for editing in the right Notes sidebar, or null. */
  sidebarNotePath: string | null
  /** Filter the standalone-notes list to a single tag, or null for all. */
  notesTagFilter: string | null
  /** Target page to jump to when (re)opening a book from search; consumed by the reader. */
  pendingPage: { bookId: string; page: number } | null
  indexing: { done: number; total: number } | null
  /** Progress of a whole-Bible (BSB) indexing pass, or null when idle. */
  bibleIndexing: { done: number; total: number } | null
  searchResults: SearchHit[]
  /** Folded query tokens, used to flash-highlight matches when jumping to a page. */
  searchTerms: string[]
  /** Persisted search inputs so the bar survives moving between books. */
  searchQuery: string
  searchKind: SearchKind
  searchShelf: string
  searchTag: string
  /** Index of the result the user last opened, highlighted in the results panel. */
  activeHit: number | null
  /** True after clicking a search hit opened the reading workspace — shows a "back to search
   *  results" affordance there. Cleared on any deliberate navigation away from 'reading'. */
  cameFromSearch: boolean

  // --- Scripture (Phase 8) ---
  scriptureTranslations: ScriptureTranslation[]
  /** Selected translation id (mirrors config.scriptureTranslation). */
  scriptureTranslation: string
  /** The passage shown in the Bible reader, or null until first opened. */
  scripturePassage: { book: string; chapter: number; highlight: number[] } | null
  /** When true, a second translation column is shown beside the reader (compare view). */
  scriptureCompareOpen: boolean
  /** Second translation id for the compare column. */
  scriptureCompareTranslation: string
  /** The verse a commentary lookup ran against, or null before any verse has been clicked. */
  commentaryLookup: { book: string; chapter: number; verse: number } | null
  /** Results of that lookup, grouped by source in the reference sidebar. */
  commentaryMatches: CommentaryMatch[]

  // --- Center workspace (Phase 8.7 Stage 3) ---
  /** Up to two typed panes (note/bible/pdf) shown in the center; the source of truth. */
  panes: Pane[]
  /** Focused pane — receives "open" actions and feeds the derived context fields. */
  activePaneId: string | null
  /** Split ratio between the two panes (0.2–0.8). */
  paneRatio: number
  /** The Project note open in either pane, and its source collection, or null. */
  activeProject: { path: string; items: ProjectItem[] } | null

  init: () => Promise<void>
  enter: () => void
  setThemeColor: (key: keyof ThemePalette, value: string) => Promise<void>
  setTheme: (theme: ThemePalette) => Promise<void>
  resetTheme: () => Promise<void>
  completeWizard: (data: WizardData) => Promise<void>
  relocateVault: () => Promise<void>
  refreshConfig: () => Promise<void>

  setLayoutLocal: (patch: Partial<PanelLayout>) => void
  saveLayout: (patch: Partial<PanelLayout>) => void
  persistLayout: () => void

  setActiveShelf: (shelfId: string | null) => void
  setToast: (msg: string | null) => void
  openBook: (id: string) => void
  openBookAt: (id: string, page: number) => void
  clearPendingPage: () => void
  /** Jump the open book to a page and flash-highlight the given terms (in-book search). */
  jumpToBookPage: (bookId: string, page: number, terms: string[]) => void
  closeBook: () => void
  loadStandaloneNotes: () => Promise<void>
  createNote: (title: string, type?: NoteType) => Promise<void>
  openNote: (path: string) => void
  openNoteInSplit: (path: string) => void
  setNotesTagFilter: (tag: string | null) => void
  deleteNote: (path: string) => Promise<void>
  openSidebarNote: (path: string) => void
  closeSidebarNote: () => void
  navigateLink: (name: string) => Promise<void>
  loadQuotes: (bookId: string) => Promise<void>
  addQuote: (input: NewQuote) => Promise<void>
  setQuoteTags: (quoteId: string, tags: string[]) => Promise<void>
  setQuoteText: (quoteId: string, text: string) => Promise<void>
  deleteQuote: (quoteId: string) => Promise<void>
  /** Open a group of saved quotes (PDF / Bible chapter / commentary source) as a center pane. */
  openQuotesGroup: (group: QuoteGroupRef) => void
  /** Bump the shared reload token so quote panels/panes/nav re-fetch after an edit. */
  bumpReload: () => void
  refreshLibrary: () => Promise<void>
  importFromSource: () => Promise<ImportResult>
  importFiles: () => Promise<ImportResult>
  updateBook: (id: string, patch: BookUpdate) => Promise<void>
  deleteBook: (id: string) => Promise<void>
  backfillLocal: () => Promise<BackfillResult>
  relinkBook: (id: string) => Promise<Book | null>
  setBookShelves: (id: string, shelfIds: string[]) => Promise<void>
  setBookTags: (id: string, tags: string[]) => Promise<void>
  setQuoteAnnotations: (quoteId: string, annotations: Annotation[]) => Promise<void>
  refetchMetadata: (id: string) => Promise<void>
  createShelf: (name: string) => Promise<void>
  renameShelf: (id: string, name: string) => Promise<void>
  deleteShelf: (id: string) => Promise<void>
  /** Persist a new display order for all shelves (full list of ids, in the desired order). */
  reorderShelves: (orderedIds: string[]) => Promise<void>
  /** Persist a new display order for all tags (full list of ids, in the desired order). */
  reorderTags: (orderedIds: string[]) => Promise<void>
  startIndexing: () => Promise<void>
  cancelIndexing: () => void
  /** Fetch and index every chapter of the BSB (public-domain) so the whole Bible is searchable. */
  startBibleIndexing: () => Promise<void>
  cancelBibleIndexing: () => void
  runSearch: (query: string, scope: SearchScope) => Promise<void>
  clearSearch: () => void
  setSearchQuery: (q: string) => void
  setSearchKind: (k: SearchKind) => void
  setSearchShelf: (s: string) => void
  setSearchTag: (t: string) => void
  setActiveHit: (i: number | null) => void
  /** Mark that the reading workspace is about to be opened from a search-hit click. */
  markCameFromSearch: () => void
  /** The "back to search results" action — returns to the Search view without closing panes. */
  returnToSearch: () => void

  loadScripture: () => Promise<void>
  setScriptureTranslation: (id: string) => void
  navigateScripture: (book: string, chapter: number, highlight?: number[]) => void
  /** A verse was clicked in any ScriptureReader instance — runs the commentary lookup and
   *  switches the reference sidebar to show it. */
  verseClicked: (book: string, chapter: number, verse: number) => Promise<void>
  /** Open/focus the Bible as a center pane (left-rail "Scripture" entry). */
  showScripture: () => Promise<void>
  /** Resolve a reference string and open it in a Bible pane beside the current pane. */
  openScripture: (ref: string) => Promise<void>
  toggleScriptureCompare: () => void
  setCompareTranslation: (id: string) => void
  addScriptureHighlight: (input: NewScriptureHighlight) => Promise<void>
  deleteScriptureHighlight: (id: string) => Promise<void>

  // --- Center workspace ---
  openInPane: (content: PaneContent, opts?: { split?: boolean }) => void
  closePane: (id: string) => void
  focusPane: (id: string) => void
  setPaneRatio: (r: number) => void
  setPaneContent: (id: string, content: PaneContent) => void
  /** Append an empty second pane (the content picker), if there's room. */
  addPane: () => void
  /** Reset a pane to the content picker without closing it. */
  setPaneEmpty: (id: string) => void
  /** Create a note and place it into a specific pane (used by the picker). */
  createNoteInPane: (id: string, title: string, type?: NoteType) => Promise<NoteSummary>

  // --- Project notes ---
  /** Recompute `activeProject` from the current panes; a no-op refetch if unchanged. */
  refreshActiveProject: () => Promise<void>
  addProjectItem: (item: ProjectItem) => Promise<void>
  removeProjectItem: (item: ProjectItem) => Promise<void>
}

export function foldTokens(query: string): string[] {
  return (
    query
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .match(/[\p{L}\p{N}]+/gu) ?? []
  )
}

interface ShellData {
  config: PublicConfig
  layout: PanelLayout
  books: Book[]
  shelves: Shelf[]
  tags: Tag[]
  standaloneNotes: NoteSummary[]
}

async function loadAll(): Promise<ShellData> {
  const [config, layout, books, shelves, tags, standaloneNotes] = await Promise.all([
    api.getConfig(),
    api.getLayout(),
    api.listBooks(),
    api.listShelves(),
    api.listTags(),
    api.listStandaloneNotes()
  ])
  return { config, layout, books, shelves, tags, standaloneNotes }
}

export const useStore = create<Store>((set, get) => {
  let listenersBound = false
  let refreshTimer: ReturnType<typeof setTimeout> | null = null
  let lastRefresh = 0
  let indexCancel = false
  let bibleIndexCancel = false

  // Coalesce background "library changed" events into at most one refresh per 1.5s.
  const scheduleRefresh = (): void => {
    const since = Date.now() - lastRefresh
    if (since >= 1500) {
      lastRefresh = Date.now()
      void get().refreshLibrary()
    } else if (refreshTimer === null) {
      refreshTimer = setTimeout(() => {
        refreshTimer = null
        lastRefresh = Date.now()
        void get().refreshLibrary()
      }, 1500 - since)
    }
  }

  return {
    phase: 'loading',
    appState: null,
    config: null,
    layout: null,
    books: [],
    shelves: [],
    tags: [],
    activeShelf: null,
    libraryBusy: false,
    toast: null,
    importProgress: null,
    openBookId: null,
    quotes: [],
    noteReloadToken: 0,
    standaloneNotes: [],
    activeNotePath: null,
    sidebarNotePath: null,
    notesTagFilter: null,
    pendingPage: null,
    indexing: null,
    bibleIndexing: null,
    searchResults: [],
    searchTerms: [],
    searchQuery: '',
    searchKind: 'all',
    searchShelf: '',
    searchTag: '',
    activeHit: null,
    cameFromSearch: false,
    scriptureTranslations: [],
    scriptureTranslation: '',
    scripturePassage: null,
    scriptureCompareOpen: false,
    scriptureCompareTranslation: '',
    commentaryLookup: null,
    commentaryMatches: [],
    panes: [],
    activePaneId: null,
    paneRatio: 0.5,
    activeProject: null,

    init: async () => {
      if (!listenersBound) {
        listenersBound = true
        api.onImportProgress((p) => set({ importProgress: p.phase === 'done' ? null : p }))
        api.onLibraryChanged(() => scheduleRefresh())
        api.onLibrarySynced((r) => {
          void get().refreshLibrary()
          if (r.added === 0 && r.removed === 0) return // nothing to announce on a no-op sync
          const parts: string[] = []
          if (r.added > 0) {
            const shown = r.titles.slice(0, 3).join(', ')
            const more = r.titles.length > 3 ? ` +${r.titles.length - 3} more` : ''
            parts.push(
              `Added ${r.added} book${r.added === 1 ? '' : 's'}${shown ? `: ${shown}${more}` : ''}`
            )
          }
          if (r.removed > 0) parts.push(`removed ${r.removed}`)
          set({ toast: `${parts.join(' · ')} · ${r.total} in library` })
        })
      }
      const appState = await api.getAppState()
      if (!appState.setupComplete) {
        set({ appState, phase: 'wizard' })
        return
      }
      const data = await loadAll()
      applyTheme(data.config.theme)
      // Never auto-restore workspace panes on launch — landing back in a PDF/note pane (or with
      // two panes still open) is exactly the clutter the user doesn't want. Instead, land on
      // whatever *screen* they were last on: if that was the reading workspace itself, translate
      // its last pane kind to the equivalent list view (a note pane -> the Notes list, anything
      // else -> the Library) rather than reopening the pane.
      let landingView = data.layout.activeLeftView
      if (landingView === 'reading') {
        landingView = 'library'
        const ws = await api.getSession('workspace')
        if (ws) {
          try {
            const parsed = JSON.parse(ws) as { panes?: Pane[]; activePaneId?: string | null }
            const panes = Array.isArray(parsed.panes) ? parsed.panes : []
            const lastPane = panes.find((p) => p.id === parsed.activePaneId) ?? panes[0]
            if (lastPane?.kind === 'note') landingView = 'notes'
          } catch {
            /* ignore malformed value */
          }
        }
      }
      const layout = { ...data.layout, activeLeftView: landingView }
      const reflected = reflectPanes([], null)
      set({
        appState,
        ...data,
        layout,
        panes: [],
        activePaneId: null,
        paneRatio: 0.5,
        ...reflected,
        // Seed the selected translation from config so a Bible pane can render its
        // (offline-cached) text immediately, before the translation registry has resolved.
        scriptureTranslation: data.config.scriptureTranslation || 'BSB',
        pendingPage: null,
        phase: 'welcome'
      })
      void get().refreshActiveProject()
    },

    enter: () => set({ phase: 'ready' }),

    setThemeColor: async (key, value) => {
      const cfg = get().config
      if (!cfg) return
      const theme = { ...cfg.theme, [key]: value }
      applyTheme(theme)
      const config = await api.setConfig({ theme })
      set({ config })
    },

    setTheme: async (theme) => {
      applyTheme(theme)
      const config = await api.setConfig({ theme })
      set({ config })
    },

    resetTheme: async () => {
      applyTheme(DEFAULT_THEME)
      const config = await api.setConfig({ theme: DEFAULT_THEME })
      set({ config })
    },

    completeWizard: async (data) => {
      const appState = await api.completeWizard(data)
      const all = await loadAll()
      applyTheme(all.config.theme)
      set({ appState, ...all, phase: 'ready' })
    },

    relocateVault: async () => {
      const appState = await api.relocateVault()
      set({ appState, config: await api.getConfig() })
    },

    refreshConfig: async () => {
      set({ config: await api.getConfig() })
    },

    setLayoutLocal: (patch) => {
      const layout = get().layout
      if (layout) set({ layout: { ...layout, ...patch } })
    },

    saveLayout: (patch) => {
      const layout = get().layout
      if (!layout) return
      set({ layout: { ...layout, ...patch } })
      // Any deliberate move away from the reading workspace retires the "back to search" link —
      // it only makes sense while a search hit's pane is still showing.
      if (patch.activeLeftView && patch.activeLeftView !== 'reading' && get().cameFromSearch) {
        set({ cameFromSearch: false })
      }
      void api.setLayout(patch)
    },

    persistLayout: () => {
      const layout = get().layout
      if (layout) void api.setLayout(layout)
    },

    setActiveShelf: (shelfId) => set({ activeShelf: shelfId }),

    setToast: (msg) => set({ toast: msg }),

    openBook: (id) => {
      get().openInPane({ kind: 'pdf', bookId: id })
      set({ quotes: [], pendingPage: null })
      get().saveLayout({ activeLeftView: 'reading' })
      void api.setSession('lastOpenBook', id)
      void get().loadQuotes(id)
    },

    openBookAt: (id, page) => {
      get().openInPane({ kind: 'pdf', bookId: id })
      set({
        quotes: [],
        pendingPage: { bookId: id, page },
        books: get().books.map((b) => (b.id === id ? { ...b, lastPage: page } : b))
      })
      get().saveLayout({ activeLeftView: 'reading' })
      void api.setBookLastPage(id, page)
      void api.setSession('lastOpenBook', id)
      void get().loadQuotes(id)
    },

    clearPendingPage: () => set({ pendingPage: null }),

    jumpToBookPage: (bookId, page, terms) =>
      set({ pendingPage: { bookId, page }, searchTerms: terms }),

    closeBook: () => {
      const pdf = get().panes.find((p) => p.kind === 'pdf')
      if (pdf) get().closePane(pdf.id)
      set({ quotes: [] })
      void api.setSession('lastOpenBook', '')
    },

    loadStandaloneNotes: async () => {
      set({ standaloneNotes: await api.listStandaloneNotes() })
    },

    createNote: async (title, type) => {
      const note = await api.createNote(title, type)
      await get().loadStandaloneNotes()
      get().openInPane({ kind: 'note', notePath: note.path })
      get().saveLayout({ activeLeftView: 'reading' })
    },

    openNote: (path) => {
      get().openInPane({ kind: 'note', notePath: path })
      get().saveLayout({ activeLeftView: 'reading' })
    },

    openNoteInSplit: (path) => {
      get().openInPane({ kind: 'note', notePath: path }, { split: true })
      get().saveLayout({ activeLeftView: 'reading' })
    },

    setNotesTagFilter: (tag) => set({ notesTagFilter: tag }),

    deleteNote: async (path) => {
      await api.deleteNote(path)
      // Close any center pane showing this note; clear the sidebar note if it matches.
      for (const p of get().panes.filter((p) => p.kind === 'note' && p.notePath === path)) {
        get().closePane(p.id)
      }
      if (get().sidebarNotePath === path) {
        set({ sidebarNotePath: null })
        void api.setSession('sidebarNote', '')
      }
      await get().loadStandaloneNotes()
    },

    openSidebarNote: (path) => {
      set({ sidebarNotePath: path })
      void api.setSession('sidebarNote', path)
    },

    closeSidebarNote: () => {
      set({ sidebarNotePath: null })
      void api.setSession('sidebarNote', '')
    },

    navigateLink: async (name) => {
      const target = await api.resolveLink(name)
      if (!target) return
      if (target.type === 'book') get().openBook(target.id)
      else get().openNote(target.path)
    },

    loadQuotes: async (bookId) => {
      const quotes = await api.listQuotes(bookId)
      if (get().openBookId === bookId) set({ quotes })
    },

    addQuote: async (input) => {
      await api.addQuote(input)
      await get().loadQuotes(input.bookId)
      await get().refreshLibrary()
      set({ noteReloadToken: get().noteReloadToken + 1 })
    },

    setQuoteTags: async (quoteId, tags) => {
      await api.setQuoteTags(quoteId, tags)
      const id = get().openBookId
      if (id) await get().loadQuotes(id)
    },

    setQuoteText: async (quoteId, text) => {
      await api.setQuoteText(quoteId, text)
      set({
        quotes: get().quotes.map((q) => (q.id === quoteId ? { ...q, text } : q)),
        // Bump so open quote panes / the reference panels reload with the new text.
        noteReloadToken: get().noteReloadToken + 1
      })
    },

    openQuotesGroup: (group) => {
      get().openInPane({ kind: 'quotes', quotesGroup: group })
      get().saveLayout({ activeLeftView: 'reading' })
    },

    bumpReload: () => set({ noteReloadToken: get().noteReloadToken + 1 }),

    setQuoteAnnotations: async (quoteId, annotations) => {
      await api.setQuoteAnnotations(quoteId, annotations)
      // Update in place so the panel doesn't lose scroll/focus.
      set({
        quotes: get().quotes.map((q) => (q.id === quoteId ? { ...q, annotations } : q))
      })
    },

    deleteQuote: async (quoteId) => {
      await api.deleteQuote(quoteId)
      const id = get().openBookId
      if (id) await get().loadQuotes(id)
      await get().refreshLibrary()
      set({ noteReloadToken: get().noteReloadToken + 1 })
    },

    refreshLibrary: async () => {
      const [books, shelves, tags] = await Promise.all([
        api.listBooks(),
        api.listShelves(),
        api.listTags()
      ])
      set({ books, shelves, tags })
    },

    importFromSource: async () => {
      set({ libraryBusy: true })
      try {
        const result = await api.importFromSource()
        await get().refreshLibrary()
        return result
      } finally {
        set({ libraryBusy: false })
      }
    },

    importFiles: async () => {
      set({ libraryBusy: true })
      try {
        const result = await api.importFiles()
        await get().refreshLibrary()
        return result
      } finally {
        set({ libraryBusy: false })
      }
    },

    updateBook: async (id, patch) => {
      await api.updateBook(id, patch)
      await get().refreshLibrary()
    },

    deleteBook: async (id) => {
      await api.deleteBook(id)
      await get().refreshLibrary()
    },

    backfillLocal: async () => {
      const res = await api.backfillLocal()
      await get().refreshLibrary()
      return res
    },

    relinkBook: async (id) => {
      const book = await api.relinkBook(id)
      if (book) await get().refreshLibrary()
      return book
    },

    setBookShelves: async (id, shelfIds) => {
      await api.setBookShelves(id, shelfIds)
      await get().refreshLibrary()
    },

    setBookTags: async (id, tags) => {
      await api.setBookTags(id, tags)
      await get().refreshLibrary()
    },

    refetchMetadata: async (id) => {
      set({ libraryBusy: true })
      try {
        await api.refetchMetadata(id)
        await get().refreshLibrary()
      } finally {
        set({ libraryBusy: false })
      }
    },

    createShelf: async (name) => {
      await api.createShelf(name)
      await get().refreshLibrary()
    },

    renameShelf: async (id, name) => {
      await api.renameShelf(id, name)
      await get().refreshLibrary()
    },

    deleteShelf: async (id) => {
      await api.deleteShelf(id)
      if (get().activeShelf === id) set({ activeShelf: null })
      await get().refreshLibrary()
    },

    reorderShelves: async (orderedIds) => {
      // Optimistic: the caller already knows the desired order, so reflect it immediately
      // rather than waiting on a round trip before the UI updates.
      const byId = new Map(get().shelves.map((s) => [s.id, s]))
      const shelves = orderedIds.map((id) => byId.get(id)).filter((s): s is Shelf => !!s)
      set({ shelves })
      await api.reorderShelves(orderedIds)
    },

    reorderTags: async (orderedIds) => {
      const byId = new Map(get().tags.map((t) => [t.id, t]))
      const tags = orderedIds.map((id) => byId.get(id)).filter((t): t is Tag => !!t)
      set({ tags })
      await api.reorderTags(orderedIds)
    },

    startIndexing: async () => {
      if (get().indexing) return
      indexCancel = false
      const pending = await api.unindexedBooks()
      if (pending.length === 0) {
        set({ indexing: { done: 0, total: 0 } })
        setTimeout(() => set({ indexing: null }), 1800)
        return
      }
      set({ indexing: { done: 0, total: pending.length } })
      for (let i = 0; i < pending.length; i++) {
        if (indexCancel) break
        set({ indexing: { done: i, total: pending.length } })
        try {
          await extractAndIndexBook(pending[i].id, pending[i].title)
        } catch {
          /* skip unreadable book */
        }
        await new Promise((r) => setTimeout(r, 20)) // let the UI breathe between books
      }
      set({ indexing: null })
      await get().refreshLibrary()
    },

    cancelIndexing: () => {
      indexCancel = true
    },

    startBibleIndexing: async () => {
      if (get().bibleIndexing) return
      bibleIndexCancel = false
      const total = BOOKS.reduce((sum, b) => sum + b.chapters, 0)
      set({ bibleIndexing: { done: 0, total } })
      let done = 0
      chapters: for (const b of BOOKS) {
        for (let c = 1; c <= b.chapters; c++) {
          if (bibleIndexCancel) break chapters
          try {
            const passage = await api.getScriptureChapter('BSB', b.code, c)
            if (passage) {
              await api.indexScriptureChapter('BSB', b.code, c, passage.reference, passage.verses)
            }
          } catch {
            /* skip a chapter that fails to fetch — the pass can be re-run later */
          }
          done++
          set({ bibleIndexing: { done, total } })
          // Already-cached chapters return almost instantly; this only meaningfully throttles
          // the (much slower) network fetches on a fresh pass, to stay a polite API citizen.
          await new Promise((r) => setTimeout(r, 40))
        }
      }
      set({ bibleIndexing: null })
    },

    cancelBibleIndexing: () => {
      bibleIndexCancel = true
    },

    runSearch: async (query, scope) => {
      if (!query.trim()) {
        set({ searchResults: [], searchTerms: [], activeHit: null })
        return
      }
      const results = await api.search(query, scope)
      set({ searchResults: results, searchTerms: foldTokens(query), activeHit: null })
    },

    clearSearch: () => set({ searchResults: [], searchTerms: [], activeHit: null }),

    setSearchQuery: (q) => set({ searchQuery: q }),
    setSearchKind: (k) => set({ searchKind: k }),
    setSearchShelf: (s) => set({ searchShelf: s }),
    setSearchTag: (t) => set({ searchTag: t }),
    setActiveHit: (i) => set({ activeHit: i }),
    markCameFromSearch: () => set({ cameFromSearch: true }),
    returnToSearch: () => {
      set({ cameFromSearch: false })
      get().saveLayout({ activeLeftView: 'search' })
    },

    loadScripture: async () => {
      const translations = await api.listScriptureTranslations()
      const want = get().config?.scriptureTranslation ?? ''
      const translation = translations.some((t) => t.id === want)
        ? want
        : (translations[0]?.id ?? '')
      let passage = get().scripturePassage
      if (!passage) {
        const last = await api.getSession('lastScripture')
        if (last) {
          try {
            const p = JSON.parse(last) as { book?: string; chapter?: number }
            if (p.book && p.chapter) passage = { book: p.book, chapter: p.chapter, highlight: [] }
          } catch {
            /* ignore malformed session value */
          }
        }
        if (!passage) passage = { book: 'JHN', chapter: 1, highlight: [] }
      }
      // Restore the compare column (second translation + open flag) from the session.
      let compareOpen = get().scriptureCompareOpen
      let compareTranslation = get().scriptureCompareTranslation
      if (!compareTranslation) {
        const lastCompare = (await api.getSession('lastScriptureCompare')) ?? ''
        compareTranslation = translations.some((t) => t.id === lastCompare)
          ? lastCompare
          : (translations.find((t) => t.id !== translation)?.id ?? translation)
      }
      if (!compareOpen) compareOpen = (await api.getSession('scriptureCompareOpen')) === '1'
      set({
        scriptureTranslations: translations,
        scriptureTranslation: translation,
        scripturePassage: passage,
        scriptureCompareOpen: compareOpen,
        scriptureCompareTranslation: compareTranslation
      })
    },

    setScriptureTranslation: (id) => {
      set({ scriptureTranslation: id })
      const cfg = get().config
      if (cfg) set({ config: { ...cfg, scriptureTranslation: id } })
      void api.setConfig({ scriptureTranslation: id })
    },

    // Route a passage into a Bible pane: reuse the existing Bible pane if there is one,
    // otherwise open one (beside a single pane, or replacing the focused pane when full).
    navigateScripture: (book, chapter, highlight = []) => {
      const { panes, scriptureTranslation } = get()
      const bible = panes.find((p) => p.kind === 'bible')
      if (bible) {
        get().setPaneContent(bible.id, {
          kind: 'bible',
          book,
          chapter,
          highlight,
          translation: bible.translation || scriptureTranslation
        })
      } else {
        get().openInPane(
          { kind: 'bible', book, chapter, highlight, translation: scriptureTranslation },
          { split: panes.length === 1 }
        )
      }
      get().saveLayout({ activeLeftView: 'reading' })
      void api.setSession('lastScripture', JSON.stringify({ book, chapter }))
    },

    verseClicked: async (book, chapter, verse) => {
      set({ commentaryLookup: { book, chapter, verse }, commentaryMatches: [] })
      const matches = await api.lookupCommentary(book, chapter, verse)
      // A later click may have landed while this lookup was in flight — don't overwrite it.
      const stillCurrent = get().commentaryLookup
      const stale =
        stillCurrent?.book !== book || stillCurrent?.chapter !== chapter || stillCurrent?.verse !== verse
      if (stale) return
      set({ commentaryMatches: matches })
      get().saveLayout({ activeRightTab: 'commentary', notesCollapsed: false })
    },

    showScripture: async () => {
      const bible = get().panes.find((p) => p.kind === 'bible')
      if (bible) {
        get().focusPane(bible.id)
        get().saveLayout({ activeLeftView: 'reading' })
      } else {
        // Open the reader from local state right away. The translation registry can hit the
        // network to resolve copyrighted versions, so it must NOT gate the view switch — it is
        // loaded in the background below and fills the translation picker when it arrives.
        let passage = get().scripturePassage
        if (!passage) {
          const last = await api.getSession('lastScripture')
          if (last) {
            try {
              const p = JSON.parse(last) as { book?: string; chapter?: number }
              if (p.book && p.chapter) passage = { book: p.book, chapter: p.chapter, highlight: [] }
            } catch {
              /* ignore malformed session value */
            }
          }
          if (!passage) passage = { book: 'JHN', chapter: 1, highlight: [] }
        }
        get().navigateScripture(passage.book, passage.chapter, passage.highlight)
      }
      if (get().scriptureTranslations.length === 0) void get().loadScripture()
    },

    openScripture: async (refStr) => {
      const ref = parseReference(refStr)
      if (!ref) return
      if (get().scriptureTranslations.length === 0) await get().loadScripture()
      const start = ref.verseStart
      const highlight =
        start != null
          ? Array.from({ length: (ref.verseEnd ?? start) - start + 1 }, (_, i) => start + i)
          : []
      get().navigateScripture(ref.book, ref.chapter, highlight)
    },

    toggleScriptureCompare: () => {
      const next = !get().scriptureCompareOpen
      // On first open, default the second column to a translation other than the primary.
      let compare = get().scriptureCompareTranslation
      if (next && !compare) {
        const { scriptureTranslations: ts, scriptureTranslation: primary } = get()
        compare = ts.find((t) => t.id !== primary)?.id ?? primary
      }
      set({ scriptureCompareOpen: next, scriptureCompareTranslation: compare })
      void api.setSession('scriptureCompareOpen', next ? '1' : '')
    },

    setCompareTranslation: (id) => {
      set({ scriptureCompareTranslation: id })
      void api.setSession('lastScriptureCompare', id)
    },

    addScriptureHighlight: async (input) => {
      await api.addScriptureHighlight(input)
      // Bump the shared token so the reader re-marks verses and panels reload.
      set({ noteReloadToken: get().noteReloadToken + 1 })
    },

    deleteScriptureHighlight: async (id) => {
      await api.deleteQuote(id)
      // Bump the shared token so the reader drops the verse mark and panels reload.
      set({ noteReloadToken: get().noteReloadToken + 1 })
    },

    openInPane: (content, opts) => {
      const { panes, activePaneId } = get()
      let next: Pane[]
      let activeId: string
      if (opts?.split) {
        if (panes.length >= 2) {
          // Both panes full — replace the one that isn't focused.
          const keep = activePaneId ?? panes[0].id
          const target = panes.find((p) => p.id !== keep) ?? panes[1]
          const np = { ...paneFromContent(content), id: target.id }
          next = panes.map((p) => (p.id === target.id ? np : p))
          activeId = target.id
        } else {
          const np = paneFromContent(content)
          next = [...panes, np]
          activeId = np.id
        }
      } else if (panes.length === 0) {
        const np = paneFromContent(content)
        next = [np]
        activeId = np.id
      } else {
        // Replace the focused pane's content in place.
        const target = panes.find((p) => p.id === activePaneId) ?? panes[0]
        const np = { ...paneFromContent(content), id: target.id }
        next = panes.map((p) => (p.id === target.id ? np : p))
        activeId = target.id
      }
      set({ panes: next, activePaneId: activeId, ...reflectPanes(next, activeId) })
      persistWorkspace(next, activeId, get().paneRatio)
      void get().refreshActiveProject()
    },

    closePane: (id) => {
      const { panes, activePaneId } = get()
      const next = panes.filter((p) => p.id !== id)
      const activeId = activePaneId === id ? (next[0]?.id ?? null) : activePaneId
      set({ panes: next, activePaneId: activeId, ...reflectPanes(next, activeId) })
      persistWorkspace(next, activeId, get().paneRatio)
      void get().refreshActiveProject()
    },

    focusPane: (id) => {
      const { panes, activePaneId } = get()
      if (id === activePaneId || !panes.some((p) => p.id === id)) return
      set({ activePaneId: id, ...reflectPanes(panes, id) })
      persistWorkspace(panes, id, get().paneRatio)
    },

    setPaneRatio: (r) => {
      const ratio = Math.min(0.8, Math.max(0.2, r))
      set({ paneRatio: ratio })
      persistWorkspace(get().panes, get().activePaneId, ratio)
    },

    setPaneContent: (id, content) => {
      const { panes } = get()
      const next = panes.map((p) => (p.id === id ? { ...paneFromContent(content), id } : p))
      set({ panes: next, activePaneId: id, ...reflectPanes(next, id) })
      persistWorkspace(next, id, get().paneRatio)
      void get().refreshActiveProject()
    },

    addPane: () => {
      const { panes } = get()
      if (panes.length >= 2) return
      const np: Pane = { id: crypto.randomUUID(), kind: 'empty' }
      const next = [...panes, np]
      set({ panes: next, activePaneId: np.id, ...reflectPanes(next, np.id) })
      persistWorkspace(next, np.id, get().paneRatio)
    },

    setPaneEmpty: (id) => {
      const { panes } = get()
      const next = panes.map((p) => (p.id === id ? { id, kind: 'empty' as const } : p))
      set({ panes: next, activePaneId: id, ...reflectPanes(next, id) })
      persistWorkspace(next, id, get().paneRatio)
      void get().refreshActiveProject()
    },

    createNoteInPane: async (id, title, type) => {
      const note = await api.createNote(title, type)
      await get().loadStandaloneNotes()
      get().setPaneContent(id, { kind: 'note', notePath: note.path })
      return note
    },

    refreshActiveProject: async () => {
      const { panes, standaloneNotes, activeProject } = get()
      const projectPane = findProjectPane(panes, standaloneNotes)
      if (!projectPane?.notePath) {
        if (activeProject) set({ activeProject: null })
        return
      }
      // Already tracking this exact project — don't clobber items just added/removed locally.
      if (activeProject?.path === projectPane.notePath) return
      const raw = await api.readNote(projectPane.notePath)
      const { fm } = parseNote(raw)
      // Guard against a stale response if the workspace changed again while this was in flight.
      if (findProjectPane(get().panes, get().standaloneNotes)?.notePath !== projectPane.notePath) {
        return
      }
      set({ activeProject: { path: projectPane.notePath, items: fm.items } })
    },

    addProjectItem: async (item) => {
      const proj = get().activeProject
      if (!proj || proj.items.some((i) => sameProjectItem(i, item))) return
      const items = [...proj.items, item]
      set({ activeProject: { ...proj, items } })
      await writeProjectItems(proj.path, items)
    },

    removeProjectItem: async (item) => {
      const proj = get().activeProject
      if (!proj) return
      const items = proj.items.filter((i) => !sameProjectItem(i, item))
      set({ activeProject: { ...proj, items } })
      await writeProjectItems(proj.path, items)
    }
  }
})
