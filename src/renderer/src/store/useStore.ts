import { create } from 'zustand'
import { api } from '../lib/api'
import { applyTheme } from '../lib/theme'
import { extractAndIndexBook } from '../lib/pdfIndex'
import { DEFAULT_THEME } from '@shared/ipc'
import type {
  Annotation,
  AppState,
  Book,
  BookUpdate,
  ImportProgress,
  ImportResult,
  NewQuote,
  NoteSummary,
  PanelLayout,
  PublicConfig,
  NoteType,
  Quote,
  SearchHit,
  SearchKind,
  SearchScope,
  Shelf,
  Tag,
  ThemePalette,
  WizardData
} from '@shared/ipc'

export type Phase = 'loading' | 'wizard' | 'welcome' | 'ready'

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
      // Restore the book that was open at last quit, scrolled to its last page.
      let openBookId: string | null = null
      let pendingPage: number | null = null
      const lastOpen = await api.getSession('lastOpenBook')
      if (lastOpen) {
        const b = data.books.find((x) => x.id === lastOpen)
        if (b) {
          openBookId = b.id
          pendingPage = b.lastPage > 1 ? b.lastPage : null
        }
      }
      set({ appState, ...data, openBookId, pendingPage, phase: 'welcome' })
      if (openBookId) void get().loadQuotes(openBookId)
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
      set({ openBookId: id, quotes: [], activeNotePath: null, pendingPage: null })
      get().saveLayout({ activeLeftView: 'library' })
      void api.setSession('lastOpenBook', id)
      void get().loadQuotes(id)
    },

    openBookAt: (id, page) => {
      set({
        openBookId: id,
        quotes: [],
        activeNotePath: null,
        pendingPage: page,
        books: get().books.map((b) => (b.id === id ? { ...b, lastPage: page } : b))
      })
      get().saveLayout({ activeLeftView: 'search' })
      void api.setBookLastPage(id, page)
      void api.setSession('lastOpenBook', id)
      void get().loadQuotes(id)
    },

    clearPendingPage: () => set({ pendingPage: null }),

    closeBook: () => {
      set({ openBookId: null, quotes: [] })
      void api.setSession('lastOpenBook', '')
    },

    loadStandaloneNotes: async () => {
      set({ standaloneNotes: await api.listStandaloneNotes() })
    },

    createNote: async (title, type) => {
      const note = await api.createNote(title, type)
      await get().loadStandaloneNotes()
      set({ activeNotePath: note.path })
      get().saveLayout({ activeLeftView: 'notes' })
    },

    openNote: (path) => {
      // Keep any open book; the Notes view opens beside it in the split.
      set({ activeNotePath: path })
      get().saveLayout({ activeLeftView: 'notes' })
    },

    openNoteInLeft: (path) => {
      const { activeNotePath, splitNotePath } = get()
      if (path === activeNotePath) return
      if (path === splitNotePath) {
        // It's already in the right pane — swap the two panes.
        set({ activeNotePath: path, splitNotePath: activeNotePath })
      } else if (activeNotePath && !splitNotePath) {
        // Preserve the current note by moving it into the right pane.
        set({ activeNotePath: path, splitNotePath: activeNotePath })
      } else {
        set({ activeNotePath: path })
      }
      get().saveLayout({ activeLeftView: 'notes' })
    },

    openNoteInSplit: (path) => {
      const { activeNotePath } = get()
      // Nothing to split against (or same note) — just open it normally.
      if (!activeNotePath || activeNotePath === path) {
        get().openNote(path)
        return
      }
      set({ splitNotePath: path })
      get().saveLayout({ activeLeftView: 'notes' })
    },

    closeSplitNote: () => set({ splitNotePath: null }),

    setNotesTagFilter: (tag) => set({ notesTagFilter: tag }),

    // Close Note 1 (left): Note 2 (right), if any, is promoted to Note 1.
    closeLeftNote: () => set({ activeNotePath: get().splitNotePath, splitNotePath: null }),

    deleteNote: async (path) => {
      await api.deleteNote(path)
      const patch: { activeNotePath?: null; splitNotePath?: null } = {}
      if (get().activeNotePath === path) patch.activeNotePath = null
      if (get().splitNotePath === path) patch.splitNotePath = null
      if (Object.keys(patch).length) set(patch)
      await get().loadStandaloneNotes()
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
    setActiveHit: (i) => set({ activeHit: i })
  }
})
