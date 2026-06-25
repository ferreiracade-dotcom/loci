// Shared IPC contract — imported by main, preload, and renderer.
// The renderer never touches Node/fs directly; everything goes through this surface.

export const Channels = {
  getAppState: 'app:getState',
  chooseFolder: 'dialog:chooseFolder',
  completeWizard: 'wizard:complete',
  getConfig: 'config:get',
  setConfig: 'config:set',
  relocateVault: 'vault:relocate',
  pickWelcomeBackground: 'appearance:pickWelcomeBackground',
  getWelcomeBackground: 'appearance:getWelcomeBackground',
  resetWelcomeBackground: 'appearance:resetWelcomeBackground',
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
  renameShelf: 'library:renameShelf',
  deleteShelf: 'library:deleteShelf',
  listTags: 'library:listTags',
  getBookPdf: 'library:getBookPdf',
  setBookLastPage: 'library:setBookLastPage',
  addQuote: 'quotes:add',
  listQuotes: 'quotes:list',
  setQuoteTags: 'quotes:setTags',
  setQuoteAnnotations: 'quotes:setAnnotations',
  deleteQuote: 'quotes:delete',
  getBookNote: 'notes:getBookNote',
  saveNote: 'notes:save',
  readNote: 'notes:read',
  listStandaloneNotes: 'notes:listStandalone',
  createNote: 'notes:create',
  deleteNote: 'notes:delete',
  backlinks: 'notes:backlinks',
  resolveLink: 'notes:resolveLink',
  vaultHealth: 'vault:health',
  search: 'search:query',
  indexBookText: 'search:indexBookText',
  unindexedBooks: 'search:unindexed',

  // main → renderer events
  importProgress: 'library:importProgress',
  libraryChanged: 'library:libraryChanged'
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

export interface ThemePalette {
  base: string
  sidebar: string
  panel: string
  card: string
  accent: string
  gold: string
  text: string
  muted: string
  border: string
  borderStrong: string
}

/** The default "Candlelit Study" palette (spec §3). */
export const DEFAULT_THEME: ThemePalette = {
  base: '#161310',
  sidebar: '#1e1a15',
  panel: '#231f19',
  card: '#2a251e',
  accent: '#c9a96e',
  gold: '#8b6e42',
  text: '#e8dcc8',
  muted: '#665c47',
  border: '#2e2820',
  borderStrong: '#3d3528'
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
  theme: ThemePalette
  /** Absolute path to a user-chosen unlock background, or null for the bundled default. */
  welcomeBackground: string | null
}

export interface AppState {
  setupComplete: boolean
  vaultPath: string | null
  vaultExists: boolean
}

export interface WizardData {
  vaultPath: string
  pdfSourcePath: string
  backupPath: string
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
  getConfig(): Promise<PublicConfig>
  setConfig(patch: Partial<PublicConfig>): Promise<PublicConfig>
  relocateVault(): Promise<AppState>
  /** Opens an image picker, copies the chosen image into app-data, returns updated config. */
  pickWelcomeBackground(): Promise<PublicConfig>
  /** Data URL of the current unlock background (custom one), or null to use the bundled default. */
  getWelcomeBackground(): Promise<string | null>
  resetWelcomeBackground(): Promise<PublicConfig>
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
  renameShelf(id: string, name: string): Promise<void>
  deleteShelf(id: string): Promise<void>
  listTags(): Promise<Tag[]>
  /** Raw PDF bytes for a book (also marks it opened), or null if the file is missing. */
  getBookPdf(id: string): Promise<Uint8Array | null>
  setBookLastPage(id: string, page: number): Promise<void>
  addQuote(input: NewQuote): Promise<Quote>
  listQuotes(bookId: string): Promise<Quote[]>
  setQuoteTags(quoteId: string, tags: string[]): Promise<void>
  setQuoteAnnotations(quoteId: string, annotations: Annotation[]): Promise<void>
  deleteQuote(quoteId: string): Promise<void>
  getBookNote(bookId: string): Promise<BookNote | null>
  saveNote(path: string, content: string): Promise<void>
  readNote(path: string): Promise<string>
  listStandaloneNotes(): Promise<NoteSummary[]>
  createNote(title: string, type?: NoteType): Promise<NoteSummary>
  deleteNote(path: string): Promise<void>
  backlinks(target: string): Promise<NoteSummary[]>
  resolveLink(name: string): Promise<LinkTarget>
  vaultHealth(): Promise<VaultHealth>
  search(query: string, scope: SearchScope): Promise<SearchHit[]>
  indexBookText(bookId: string, title: string, pages: IndexedPage[]): Promise<void>
  unindexedBooks(): Promise<{ id: string; title: string }[]>

  /** Subscribe to import progress; returns an unsubscribe function. */
  onImportProgress(cb: (p: ImportProgress) => void): () => void
  /** Fired when the book/shelf data changes in the background; returns unsubscribe. */
  onLibraryChanged(cb: () => void): () => void
}

export type ImportPhase = 'importing' | 'enriching' | 'done'

export interface ImportProgress {
  phase: ImportPhase
  done: number
  total: number
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
  indexed: boolean
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

export interface NewQuote {
  bookId: string
  text: string
  page: number | null
  color?: string
}

export interface BookNote {
  /** Vault-relative path to the markdown note. */
  path: string
  content: string
}

export interface Annotation {
  id: string
  text: string
  createdAt: number
}

export type NoteType = 'note' | 'page' | 'chapter' | 'topic' | 'book-note'

export interface NoteSummary {
  path: string
  title: string
  type: NoteType
}

export interface BrokenLink {
  /** Vault-relative path of the note that contains the broken link. */
  source: string
  sourceTitle: string
  /** The [[name]] that resolves to nothing. */
  link: string
}

export interface VaultHealth {
  books: number
  notes: number
  quotes: number
  indexed: number
  brokenLinks: BrokenLink[]
}

export type LinkTarget =
  | { type: 'book'; id: string }
  | { type: 'note'; path: string }
  | null

export type SearchKind = 'all' | 'page' | 'quote' | 'note'

export interface SearchScope {
  kind: SearchKind
  bookId?: string | null
  shelfId?: string | null
  tag?: string | null
}

export interface SearchHit {
  kind: 'page' | 'quote' | 'note'
  bookId: string | null
  ref: string | null
  page: number | null
  title: string
  /** Snippet with ⟦…⟧ marking matched terms. */
  snippet: string
  usedInCount: number
}

export interface IndexedPage {
  page: number
  text: string
}

export interface Quote {
  id: string
  bookId: string
  text: string
  page: number | null
  color: string
  tags: string[]
  /** The user's comments/annotations on this quote (saved, editable). */
  annotations: Annotation[]
  /** Stub citation until the CMOS 18 engine lands in Phase 4. */
  citation: string
  notePath: string | null
  usedIn: string[]
  createdAt: number
}
