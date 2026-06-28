import { create } from 'zustand'
import { api } from '../lib/api'
import { applyTheme } from '../lib/theme'
import { extractAndIndexBook } from '../lib/pdfIndex'
import { parseReference } from '@shared/scriptureRef'
import { DEFAULT_THEME } from '@shared/ipc'
import type {
  Annotation,
  AppState,
  Book,
  BookUpdate,
  ImportProgress,
  ImportResult,
  NewQuote,
  NewScriptureHighlight,
  NoteSummary,
  PanelLayout,
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
export type PaneKind = 'note' | 'bible' | 'pdf'

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
}

/** Content to place into a pane. */
export type PaneContent =
  | { kind: 'note'; notePath: string }
  | { kind: 'pdf'; bookId: string }
  | { kind: 'bible'; book: string; chapter: number; highlight?: number[]; translation?: string }

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
  const otherNote = notePanes.find((p) => p.id !== activeNote?.id)
  const biblePanes = panes.filter((p) => p.kind === 'bible')
  const activeBible = active?.kind === 'bible' ? active : biblePanes[0]
  const patch: Partial<Store> = {
    openBookId: pdf?.bookId ?? null,
    activeNotePath: activeNote?.notePath ?? null,
    splitNotePath: otherNote?.notePath ?? null
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

function persistWorkspace(panes: Pane[], activePaneId: string | null, paneRatio: number): void {
  void api.setSession('workspace', JSON.stringify({ panes, activePaneId, paneRatio }))
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
  importProgress: ImportProgress | null
  openBookId: string | null
  quotes: Quote[]
  /** Bumped when the open book's note changes on disk (e.g. a quote was captured). */
  noteReloadToken: number
  standaloneNotes: NoteSummary[]
  activeNotePath: string | null
  /** A second note shown side-by-side in the Notes view, or null. */
  splitNotePath: string | null
  /** A standalone note opened for editing in the right Notes sidebar, or null. */
  sidebarNotePath: string | null
  /** Filter the standalone-notes list to a single tag, or null for all. */
  notesTagFilter: string | null
  /** Target page to jump to when (re)opening a book from search; consumed by the reader. */
  pendingPage: number | null
  indexing: { done: number; total: number } | null
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

  // --- Scripture (Phase 8) ---
  scriptureTranslations: ScriptureTranslation[]
  /** Selected translation id (mirrors config.scriptureTranslation). */
  scriptureTranslation: string
  /** The passage shown in the Bible reader, or null until first opened. */
  scripturePassage: { book: string; chapter: number; highlight: number[] } | null
  /** When true, the Bible reader is shown as a split beside the open note. */
  scriptureSplitOpen: boolean
  /** When true, a second translation column is shown beside the reader (compare view). */
  scriptureCompareOpen: boolean
  /** Second translation id for the compare column. */
  scriptureCompareTranslation: string

  // --- Center workspace (Phase 8.7 Stage 3) ---
  /** Up to two typed panes (note/bible/pdf) shown in the center; the source of truth. */
  panes: Pane[]
  /** Focused pane — receives "open" actions and feeds the derived context fields. */
  activePaneId: string | null
  /** Split ratio between the two panes (0.2–0.8). */
  paneRatio: number

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
  openBook: (id: string) => void
  openBookAt: (id: string, page: number) => void
  clearPendingPage: () => void
  closeBook: () => void
  loadStandaloneNotes: () => Promise<void>
  createNote: (title: string, type?: NoteType) => Promise<void>
  openNote: (path: string) => void
  openNoteInLeft: (path: string) => void
  openNoteInSplit: (path: string) => void
  setNotesTagFilter: (tag: string | null) => void
  closeSplitNote: () => void
  closeLeftNote: () => void
  deleteNote: (path: string) => Promise<void>
  openSidebarNote: (path: string) => void
  closeSidebarNote: () => void
  navigateLink: (name: string) => Promise<void>
  loadQuotes: (bookId: string) => Promise<void>
  addQuote: (input: NewQuote) => Promise<void>
  setQuoteTags: (quoteId: string, tags: string[]) => Promise<void>
  deleteQuote: (quoteId: string) => Promise<void>
  refreshLibrary: () => Promise<void>
  importFromSource: () => Promise<ImportResult>
  importFiles: () => Promise<ImportResult>
  updateBook: (id: string, patch: BookUpdate) => Promise<void>
  deleteBook: (id: string) => Promise<void>
  setBookShelves: (id: string, shelfIds: string[]) => Promise<void>
  setBookTags: (id: string, tags: string[]) => Promise<void>
  setQuoteAnnotations: (quoteId: string, annotations: Annotation[]) => Promise<void>
  refetchMetadata: (id: string) => Promise<void>
  createShelf: (name: string) => Promise<void>
  renameShelf: (id: string, name: string) => Promise<void>
  deleteShelf: (id: string) => Promise<void>
  startIndexing: () => Promise<void>
  cancelIndexing: () => void
  runSearch: (query: string, scope: SearchScope) => Promise<void>
  clearSearch: () => void
  setSearchQuery: (q: string) => void
  setSearchKind: (k: SearchKind) => void
  setSearchShelf: (s: string) => void
  setSearchTag: (t: string) => void
  setActiveHit: (i: number | null) => void

  loadScripture: () => Promise<void>
  setScriptureTranslation: (id: string) => void
  navigateScripture: (book: string, chapter: number, highlight?: number[]) => void
  /** Open/focus the Bible as a center pane (left-rail "Scripture" entry). */
  showScripture: () => Promise<void>
  /** Resolve a reference string and open it in a Bible pane beside the current pane. */
  openScripture: (ref: string) => Promise<void>
  closeScriptureSplit: () => void
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
}

function foldTokens(query: string): string[] {
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
    importProgress: null,
    openBookId: null,
    quotes: [],
    noteReloadToken: 0,
    standaloneNotes: [],
    activeNotePath: null,
    splitNotePath: null,
    sidebarNotePath: null,
    notesTagFilter: null,
    pendingPage: null,
    indexing: null,
    searchResults: [],
    searchTerms: [],
    searchQuery: '',
    searchKind: 'all',
    searchShelf: '',
    searchTag: '',
    activeHit: null,
    scriptureTranslations: [],
    scriptureTranslation: '',
    scripturePassage: null,
    scriptureSplitOpen: false,
    scriptureCompareOpen: false,
    scriptureCompareTranslation: '',
    panes: [],
    activePaneId: null,
    paneRatio: 0.5,

    init: async () => {
      if (!listenersBound) {
        listenersBound = true
        api.onImportProgress((p) => set({ importProgress: p.phase === 'done' ? null : p }))
        api.onLibraryChanged(() => scheduleRefresh())
      }
      const appState = await api.getAppState()
      if (!appState.setupComplete) {
        set({ appState, phase: 'wizard' })
        return
      }
      const data = await loadAll()
      applyTheme(data.config.theme)
      // Restore the center workspace (panes) saved at last quit.
      let panes: Pane[] = []
      let activePaneId: string | null = null
      let paneRatio = 0.5
      const ws = await api.getSession('workspace')
      if (ws) {
        try {
          const parsed = JSON.parse(ws) as {
            panes?: Pane[]
            activePaneId?: string | null
            paneRatio?: number
          }
          if (Array.isArray(parsed.panes)) {
            // Drop PDF panes whose book no longer exists; keep note/bible panes (checked lazily).
            panes = parsed.panes
              .filter((p) => (p.kind === 'pdf' ? data.books.some((b) => b.id === p.bookId) : true))
              .slice(0, 2)
            activePaneId = panes.some((p) => p.id === parsed.activePaneId)
              ? (parsed.activePaneId ?? null)
              : (panes[0]?.id ?? null)
            if (typeof parsed.paneRatio === 'number') paneRatio = parsed.paneRatio
          }
        } catch {
          /* ignore malformed value */
        }
      }
      // Back-compat: no saved workspace but a last open book → restore it as a PDF pane.
      if (panes.length === 0) {
        const lastOpen = await api.getSession('lastOpenBook')
        const b = lastOpen ? data.books.find((x) => x.id === lastOpen) : undefined
        if (b) {
          panes = [{ id: crypto.randomUUID(), kind: 'pdf', bookId: b.id }]
          activePaneId = panes[0].id
        }
      }
      const reflected = reflectPanes(panes, activePaneId)
      const pdfPane = panes.find((p) => p.kind === 'pdf')
      const pdfBook = pdfPane ? data.books.find((b) => b.id === pdfPane.bookId) : undefined
      const pendingPage = pdfBook && pdfBook.lastPage > 1 ? pdfBook.lastPage : null
      // Show the workspace if it has content, so restored panes aren't hidden behind a navigator.
      const layout = panes.length
        ? { ...data.layout, activeLeftView: 'reading' }
        : data.layout
      set({
        appState,
        ...data,
        layout,
        panes,
        activePaneId,
        paneRatio,
        ...reflected,
        pendingPage,
        phase: 'welcome'
      })
      if (reflected.openBookId) void get().loadQuotes(reflected.openBookId)
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
      void api.setLayout(patch)
    },

    persistLayout: () => {
      const layout = get().layout
      if (layout) void api.setLayout(layout)
    },

    setActiveShelf: (shelfId) => set({ activeShelf: shelfId }),

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
        pendingPage: page,
        books: get().books.map((b) => (b.id === id ? { ...b, lastPage: page } : b))
      })
      get().saveLayout({ activeLeftView: 'reading' })
      void api.setBookLastPage(id, page)
      void api.setSession('lastOpenBook', id)
      void get().loadQuotes(id)
    },

    clearPendingPage: () => set({ pendingPage: null }),

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

    openNoteInLeft: (path) => {
      // Open in the active pane (no split).
      get().openInPane({ kind: 'note', notePath: path })
      get().saveLayout({ activeLeftView: 'reading' })
    },

    openNoteInSplit: (path) => {
      get().openInPane({ kind: 'note', notePath: path }, { split: true })
      get().saveLayout({ activeLeftView: 'reading' })
    },

    closeSplitNote: () => {
      const notes = get().panes.filter((p) => p.kind === 'note')
      if (notes[1]) get().closePane(notes[1].id)
    },

    setNotesTagFilter: (tag) => set({ notesTagFilter: tag }),

    // Close the first note pane (the other, if any, remains).
    closeLeftNote: () => {
      const notes = get().panes.filter((p) => p.kind === 'note')
      if (notes[0]) get().closePane(notes[0].id)
    },

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

    showScripture: async () => {
      if (get().scriptureTranslations.length === 0) await get().loadScripture()
      const bible = get().panes.find((p) => p.kind === 'bible')
      if (bible) {
        get().focusPane(bible.id)
        get().saveLayout({ activeLeftView: 'reading' })
      } else {
        const p = get().scripturePassage ?? { book: 'JHN', chapter: 1, highlight: [] }
        get().navigateScripture(p.book, p.chapter, p.highlight)
      }
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

    closeScriptureSplit: () => set({ scriptureSplitOpen: false }),

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
    },

    closePane: (id) => {
      const { panes, activePaneId } = get()
      const next = panes.filter((p) => p.id !== id)
      const activeId = activePaneId === id ? (next[0]?.id ?? null) : activePaneId
      set({ panes: next, activePaneId: activeId, ...reflectPanes(next, activeId) })
      persistWorkspace(next, activeId, get().paneRatio)
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
    }
  }
})
