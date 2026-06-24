// Shared IPC contract — imported by main, preload, and renderer.
// The renderer never touches Node/fs directly; everything goes through this surface.

export const Channels = {
  getAppState: 'app:getState',
  chooseFolder: 'dialog:chooseFolder',
  completeWizard: 'wizard:complete',
  unlock: 'auth:unlock',
  getConfig: 'config:get',
  setConfig: 'config:set',
  relocateVault: 'vault:relocate',
  getLayout: 'layout:get',
  setLayout: 'layout:set',
  getSession: 'session:get',
  setSession: 'session:set',
  setApiKey: 'secret:setApiKey',
  hasApiKey: 'secret:hasApiKey',

  listBooks: 'library:listBooks',
  importFromSource: 'library:importFromSource',
  importFiles: 'library:importFiles',
  updateBook: 'library:updateBook',
  deleteBook: 'library:deleteBook',
  setBookShelves: 'library:setBookShelves',
  setBookTags: 'library:setBookTags',
  getCover: 'library:getCover',
  refetchMetadata: 'library:refetchMetadata',
  listShelves: 'library:listShelves',
  createShelf: 'library:createShelf',
  listTags: 'library:listTags'
} as const

export type ChannelName = (typeof Channels)[keyof typeof Channels]

export type AiMode = 'copy-only' | 'copy-api'
export type LibraryView = 'grid' | 'list'

export interface RateCard {
  sonnetInput: number
  sonnetOutput: number
  haikuInput: number
  haikuOutput: number
}

/** Config exposed to the renderer — never includes the encrypted API key. */
export interface PublicConfig {
  setupComplete: boolean
  vaultPath: string | null
  pdfSourcePath: string | null
  backupPath: string | null
  scriptureTranslation: string
  aiMode: AiMode
  rateCard: RateCard
  hasApiKey: boolean
}

export interface AppState {
  setupComplete: boolean
  hasPassword: boolean
  vaultPath: string | null
  vaultExists: boolean
}

export interface WizardData {
  vaultPath: string
  pdfSourcePath: string
  backupPath: string
  password: string
}

export interface PanelLayout {
  leftWidth: number
  notesWidth: number
  resultsWidth: number
  leftCollapsed: boolean
  notesCollapsed: boolean
  activeLeftView: string
  activeRightTab: string
  coverSize: number
  libraryView: LibraryView
}

/** The typed bridge exposed on `window.loci`. */
export interface LociApi {
  getAppState(): Promise<AppState>
  chooseFolder(title: string): Promise<string | null>
  completeWizard(data: WizardData): Promise<AppState>
  unlock(password: string): Promise<boolean>
  getConfig(): Promise<PublicConfig>
  setConfig(patch: Partial<PublicConfig>): Promise<PublicConfig>
  relocateVault(): Promise<AppState>
  getLayout(): Promise<PanelLayout>
  setLayout(patch: Partial<PanelLayout>): Promise<void>
  getSession(key: string): Promise<string | null>
  setSession(key: string, value: string): Promise<void>
  setApiKey(key: string): Promise<boolean>
  hasApiKey(): Promise<boolean>

  listBooks(): Promise<Book[]>
  importFromSource(): Promise<ImportResult>
  importFiles(): Promise<ImportResult>
  updateBook(id: string, patch: BookUpdate): Promise<void>
  deleteBook(id: string): Promise<void>
  setBookShelves(id: string, shelfIds: string[]): Promise<void>
  setBookTags(id: string, tags: string[]): Promise<void>
  getCover(id: string): Promise<string | null>
  refetchMetadata(id: string): Promise<Book | null>
  listShelves(): Promise<Shelf[]>
  createShelf(name: string): Promise<Shelf>
  listTags(): Promise<Tag[]>
}

export type ReadingStatus = 'unread' | 'reading' | 'finished'

export interface Shelf {
  id: string
  name: string
  sortOrder: number
  count: number
}

export interface Tag {
  id: string
  name: string
}

export interface Book {
  id: string
  title: string
  author: string | null
  year: number | null
  publisher: string | null
  city: string | null
  genre: string | null
  status: ReadingStatus
  hasCover: boolean
  pageOffset: number
  quoteCount: number
  lastPage: number
  dateAdded: number
  lastOpened: number | null
  shelfIds: string[]
  tags: string[]
}

export interface BookUpdate {
  title?: string
  author?: string | null
  year?: number | null
  publisher?: string | null
  city?: string | null
  genre?: string | null
  status?: ReadingStatus
  pageOffset?: number
}

export interface ImportResult {
  imported: number
  skipped: number
  failed: number
  titles: string[]
}
