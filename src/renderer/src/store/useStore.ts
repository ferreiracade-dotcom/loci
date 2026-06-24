import { create } from 'zustand'
import { api } from '../lib/api'
import type {
  AppState,
  Book,
  BookUpdate,
  ImportResult,
  PanelLayout,
  PublicConfig,
  Shelf,
  Tag,
  WizardData
} from '@shared/ipc'

export type Phase = 'loading' | 'wizard' | 'locked' | 'ready'

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

  init: () => Promise<void>
  unlock: (password: string) => Promise<boolean>
  completeWizard: (data: WizardData) => Promise<void>
  relocateVault: () => Promise<void>
  refreshConfig: () => Promise<void>

  setLayoutLocal: (patch: Partial<PanelLayout>) => void
  saveLayout: (patch: Partial<PanelLayout>) => void
  persistLayout: () => void

  setActiveShelf: (shelfId: string | null) => void
  refreshLibrary: () => Promise<void>
  importFromSource: () => Promise<ImportResult>
  importFiles: () => Promise<ImportResult>
  updateBook: (id: string, patch: BookUpdate) => Promise<void>
  deleteBook: (id: string) => Promise<void>
  setBookShelves: (id: string, shelfIds: string[]) => Promise<void>
  setBookTags: (id: string, tags: string[]) => Promise<void>
  refetchMetadata: (id: string) => Promise<void>
  createShelf: (name: string) => Promise<void>
}

interface ShellData {
  config: PublicConfig
  layout: PanelLayout
  books: Book[]
  shelves: Shelf[]
  tags: Tag[]
}

async function loadAll(): Promise<ShellData> {
  const [config, layout, books, shelves, tags] = await Promise.all([
    api.getConfig(),
    api.getLayout(),
    api.listBooks(),
    api.listShelves(),
    api.listTags()
  ])
  return { config, layout, books, shelves, tags }
}

export const useStore = create<Store>((set, get) => ({
  phase: 'loading',
  appState: null,
  config: null,
  layout: null,
  books: [],
  shelves: [],
  tags: [],
  activeShelf: null,
  libraryBusy: false,

  init: async () => {
    const appState = await api.getAppState()
    if (!appState.setupComplete) {
      set({ appState, phase: 'wizard' })
      return
    }
    const data = await loadAll()
    set({ appState, ...data, phase: appState.hasPassword ? 'locked' : 'ready' })
  },

  unlock: async (password) => {
    const ok = await api.unlock(password)
    if (ok) set({ ...(await loadAll()), phase: 'ready' })
    return ok
  },

  completeWizard: async (data) => {
    const appState = await api.completeWizard(data)
    set({ appState, ...(await loadAll()), phase: 'ready' })
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
  }
}))
