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
  setBookCover: 'library:setBookCover',
  refetchMetadata: 'library:refetchMetadata',
  listShelves: 'library:listShelves',
  createShelf: 'library:createShelf',
  renameShelf: 'library:renameShelf',
  deleteShelf: 'library:deleteShelf',
  reorderShelves: 'library:reorderShelves',
  listTags: 'library:listTags',
  reorderTags: 'library:reorderTags',
  getBookPdf: 'library:getBookPdf',
  setBookLastPage: 'library:setBookLastPage',
  backfillLocal: 'library:backfillLocal',
  relinkBook: 'library:relinkBook',
  addQuote: 'quotes:add',
  listQuotes: 'quotes:list',
  buildBibliography: 'quotes:bibliography',
  setQuoteTags: 'quotes:setTags',
  setQuoteAnnotations: 'quotes:setAnnotations',
  setQuoteText: 'quotes:setText',
  setQuoteCitation: 'quotes:setCitation',
  deleteQuote: 'quotes:delete',
  addCommentaryQuote: 'quotes:addCommentary',
  listCommentaryQuotes: 'quotes:listCommentary',
  listQuoteGroups: 'quotes:listGroups',
  listAllQuotes: 'quotes:listAll',
  addBocQuote: 'quotes:addBoc',
  addBocCommentaryQuote: 'quotes:addBocCommentary',
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
  indexScriptureChapter: 'search:indexScriptureChapter',
  unindexedBooks: 'search:unindexed',
  exportNotePdf: 'export:notePdf',

  listScriptureTranslations: 'scripture:listTranslations',
  getScriptureChapter: 'scripture:getChapter',
  getScripturePassage: 'scripture:getPassage',
  setApiBibleKey: 'scripture:setApiBibleKey',
  hasApiBibleKey: 'scripture:hasApiBibleKey',
  setEsvKey: 'scripture:setEsvKey',
  hasEsvKey: 'scripture:hasEsvKey',
  addScriptureHighlight: 'scripture:addHighlight',
  listScriptureHighlights: 'scripture:listHighlights',
  listScriptureQuotes: 'scripture:listQuotes',
  listScriptureQuoteBooks: 'scripture:listQuoteBooks',

  listCommentarySources: 'commentary:listSources',
  createCommentarySource: 'commentary:createSource',
  addMarkdownCommentarySource: 'commentary:addMarkdownSource',
  updateCommentarySource: 'commentary:updateSource',
  deleteCommentarySource: 'commentary:deleteSource',
  reorderCommentarySources: 'commentary:reorderSources',
  lookupCommentary: 'commentary:lookup',
  listFlaggedCommentary: 'commentary:listFlagged',
  setCommentaryExcerptFlag: 'commentary:setExcerptFlag',
  reassignCommentaryExcerpt: 'commentary:reassignExcerpt',
  indexCommentarySource: 'commentary:indexSource',
  reviewConfirmCommentaryExcerpt: 'commentary:reviewConfirm',
  reviewReassignCommentaryExcerpt: 'commentary:reviewReassign',
  reviewDiscardCommentaryExcerpt: 'commentary:reviewDiscard',
  deleteCommentaryCorrectionsForSource: 'commentary:deleteCorrectionsForSource',

  lookupBocSection: 'boc:lookupSection',
  getBocSection: 'boc:getSection',
  listBocDocumentSections: 'boc:listDocumentSections',
  listBocSources: 'boc:listSources',
  listBocCommentarySources: 'boc:listCommentarySources',

  // main → renderer events
  importProgress: 'library:importProgress',
  libraryChanged: 'library:libraryChanged',
  librarySynced: 'library:librarySynced',
  commentaryIndexProgress: 'commentary:indexProgress'
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
  /** Optional local folder searched first when opening a book (fast local reads). */
  primaryLibraryPath: string | null
  /** When on, imports keep a local copy and Drive-only books are downloaded to disk. */
  keepLocalCopies: boolean
  scriptureTranslation: string
  aiMode: AiMode
  rateCard: RateCard
  hasApiKey: boolean
  /** Whether an API.Bible key is configured (unlocks NKJV/NASB etc.). */
  hasApiBibleKey: boolean
  /** Whether a Crossway ESV API key is configured (unlocks ESV). */
  hasEsvKey: boolean
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
  backupPath: string
  /** Optional existing local PDF folder read first when opening a book; null if none. */
  primaryLibraryPath: string | null
  /** Keep a local copy of books on this device (local-first); false streams from Drive. */
  keepLocalCopies: boolean
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

/** Result of making the library available offline (copying Drive-only books to the local cache). */
export interface BackfillResult {
  /** Books copied from the Drive vault into the local cache. */
  connected: number
  /** Books that already had a usable local copy. */
  alreadyLocal: number
  /** Books whose file couldn't be located (e.g. moved/deleted, or Drive offline). */
  missing: number
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
  /** Pick an image file and set it as the book's cover; returns the new cover data URL. */
  setBookCover(id: string): Promise<string | null>
  refetchMetadata(id: string): Promise<Book | null>
  listShelves(): Promise<Shelf[]>
  createShelf(name: string): Promise<Shelf>
  renameShelf(id: string, name: string): Promise<void>
  deleteShelf(id: string): Promise<void>
  /** Persist a new display order for all shelves (full list of ids, in the desired order). */
  reorderShelves(orderedIds: string[]): Promise<void>
  listTags(): Promise<Tag[]>
  /** Persist a new display order for all tags (full list of ids, in the desired order). */
  reorderTags(orderedIds: string[]): Promise<void>
  /** Raw PDF bytes for a book (also marks it opened), or null if the file is missing. */
  getBookPdf(id: string): Promise<Uint8Array | null>
  setBookLastPage(id: string, page: number): Promise<void>
  /** Copy every Drive-only book into the local cache so the whole library is offline-ready. */
  backfillLocal(): Promise<BackfillResult>
  /** Point a book at a chosen PDF on disk (copies it local); returns the updated book. */
  relinkBook(id: string): Promise<Book | null>
  addQuote(input: NewQuote): Promise<Quote>
  listQuotes(bookId: string): Promise<Quote[]>
  /** CMOS 18 bibliography entries for every cited book, sorted by author. */
  buildBibliography(): Promise<BibliographyEntry[]>
  setQuoteTags(quoteId: string, tags: string[]): Promise<void>
  setQuoteAnnotations(quoteId: string, annotations: Annotation[]): Promise<void>
  /** Replace a quote's body text (markdown; supports inline bold/italic/strike). Re-mirrors
   *  into whichever note/sidecar the quote is homed in. */
  setQuoteText(quoteId: string, text: string): Promise<void>
  /** Hand-edit a quote's citation; pass null to reset back to auto-generation. */
  setQuoteCitation(quoteId: string, citation: string | null): Promise<void>
  deleteQuote(quoteId: string): Promise<void>
  /** Capture a commentary excerpt (or a selected portion of one) as a quote. */
  addCommentaryQuote(input: CommentaryQuoteInput): Promise<Quote>
  /** Saved commentary quotes for one source, ordered by chapter then verse. */
  listCommentaryQuotes(sourceId: string): Promise<Quote[]>
  /** Everything that has saved quotes, for the Quotes nav section: books (PDFs), Bible
   *  chapters (for the given translation), and commentary sources. */
  listQuoteGroups(translation: string): Promise<QuoteGroups>
  /** Every saved quote (book/Scripture/commentary alike), for cross-cutting groupings
   *  (by author, by tag) that aren't tied to a single book/source. */
  listAllQuotes(): Promise<Quote[]>
  /** Capture a Book of Concord section excerpt (or a selected portion of one) as a quote. */
  addBocQuote(input: BocQuoteInput): Promise<Quote>
  /** Capture a Book of Concord commentary excerpt as a quote (anchored to the commentary
   *  source rather than the primary-text source). */
  addBocCommentaryQuote(input: BocQuoteInput): Promise<Quote>
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
  /** Index a Bible chapter's verses for search — a no-op unless translation is 'BSB'
   *  (copyrighted translations are never persisted, enforced on the main-process side too). */
  indexScriptureChapter(
    translation: string,
    book: string,
    chapter: number,
    title: string,
    verses: ScriptureVerse[]
  ): Promise<void>
  unindexedBooks(): Promise<{ id: string; title: string }[]>
  /** Render a note to a styled academic PDF; returns the saved path or null if cancelled. */
  exportNotePdf(opts: ExportOptions): Promise<string | null>

  /** Translations available given configured keys (BSB always; NKJV/NASB/ESV with keys). */
  listScriptureTranslations(): Promise<ScriptureTranslation[]>
  /** A whole chapter for the reader (all verses, no highlight). */
  getScriptureChapter(
    translation: string,
    book: string,
    chapter: number
  ): Promise<ScripturePassage | null>
  /** Resolve a reference string (e.g. "Rom 3:28") to just its verse(s), for hover/click. */
  getScripturePassage(translation: string, ref: string): Promise<ScripturePassage | null>
  setApiBibleKey(key: string): Promise<boolean>
  hasApiBibleKey(): Promise<boolean>
  setEsvKey(key: string): Promise<boolean>
  hasEsvKey(): Promise<boolean>
  /** Save a verse-range highlight as a citeable Scripture quote (BSB/public-domain only). */
  addScriptureHighlight(input: NewScriptureHighlight): Promise<Quote>
  /** Existing highlights for a chapter, for re-highlighting on return. */
  listScriptureHighlights(
    translation: string,
    book: string,
    chapter: number
  ): Promise<ScriptureHighlight[]>
  /** Saved Scripture quotes for a book (all chapters), ordered by chapter then verse. */
  listScriptureQuotes(translation: string, book: string): Promise<Quote[]>
  /** Books (for a translation) that have at least one saved Scripture quote. */
  listScriptureQuoteBooks(translation: string): Promise<ScriptureQuoteBook[]>

  listCommentarySources(): Promise<CommentarySource[]>
  createCommentarySource(input: NewCommentarySource): Promise<CommentarySource>
  /** Prompt for a canonical commentary-Markdown (.md) file and register it as a source —
   *  headings are the excerpt boundaries, nothing to profile. Null if cancelled. */
  addMarkdownCommentarySource(): Promise<CommentarySource | null>
  updateCommentarySource(id: string, patch: CommentarySourceUpdate): Promise<void>
  deleteCommentarySource(id: string): Promise<void>
  /** Persist a new display order for all commentary sources (full list of ids, in order). */
  reorderCommentarySources(orderedIds: string[]): Promise<void>
  /** Every non-flagged excerpt covering this verse, grouped by source (sidebar lookup). */
  lookupCommentary(book: string, chapter: number, verse: number): Promise<CommentaryMatch[]>
  listFlaggedCommentary(sourceId?: string): Promise<CommentaryExcerpt[]>
  setCommentaryExcerptFlag(id: string, flagged: boolean): Promise<void>
  reassignCommentaryExcerpt(id: string, patch: CommentaryExcerptReassign): Promise<void>
  /** Parse + validate + persist excerpts for a Markdown source, replaying any saved corrections. */
  indexCommentarySource(sourceId: string): Promise<CommentaryIndexSummary>
  /** Review-queue actions: each both updates the excerpt and records a correction so the
   *  decision survives a re-index. */
  reviewConfirmCommentaryExcerpt(excerptId: string): Promise<void>
  reviewReassignCommentaryExcerpt(excerptId: string, patch: CommentaryExcerptReassign): Promise<void>
  reviewDiscardCommentaryExcerpt(excerptId: string): Promise<void>
  deleteCommentaryCorrectionsForSource(pdfRelativePath: string): Promise<void>

  lookupBocSection(documentCode: string, ordinal: number): Promise<BocCommentaryMatch[]>
  getBocSection(documentCode: string, ordinal: number, sourceId: string): Promise<BocSectionRow | null>
  listBocDocumentSections(documentCode: string, sourceId: string): Promise<BocSectionRow[]>
  listBocSources(): Promise<BocSource[]>
  listBocCommentarySources(): Promise<BocSource[]>

  /** Subscribe to import progress; returns an unsubscribe function. */
  onImportProgress(cb: (p: ImportProgress) => void): () => void
  /** Subscribe to commentary indexing progress; returns an unsubscribe function. */
  onCommentaryIndexProgress(cb: (p: CommentaryIndexProgress) => void): () => void
  /** Fired when the book/shelf data changes in the background; returns unsubscribe. */
  onLibraryChanged(cb: () => void): () => void
  /** Fired when the startup folder sync finishes, with a summary of what changed. */
  onLibrarySynced(cb: (r: SyncResult) => void): () => void
}

export type ImportPhase = 'importing' | 'enriching' | 'done'

export interface ImportProgress {
  phase: ImportPhase
  done: number
  total: number
}

export type ReadingStatus = 'unread' | 'reading' | 'finished'

/** Where a book's PDF will be read from when opened. */
export type PdfSource = 'local' | 'drive' | 'missing'

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
  series: string | null
  seriesNumber: string | null
  seriesAbbr: string | null
  year: number | null
  publisher: string | null
  city: string | null
  genre: string | null
  status: ReadingStatus
  hasCover: boolean
  pdfSource: PdfSource
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
  series?: string | null
  seriesNumber?: string | null
  seriesAbbr?: string | null
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

/** Result of a folder-driven library sync (vault + local library reconciliation). */
export interface SyncResult {
  /** Books newly added to the catalog this sync. */
  added: number
  /** Stale catalog rows removed (their Drive PDF was gone). */
  removed: number
  /** Total books in the catalog after the sync. */
  total: number
  /** Titles of the newly added books (for the summary toast). */
  titles: string[]
}

export interface NewQuote {
  bookId: string
  text: string
  page: number | null
  color?: string
}

/** Capture a commentary excerpt (or a selection within it) as a quote, anchored to a verse. */
export interface CommentaryQuoteInput {
  /** The commentary source the excerpt came from. */
  sourceId: string
  /** USFM book code the verse belongs to, e.g. "JAS". */
  book: string
  chapter: number
  verseStart: number
  verseEnd?: number
  /** The excerpt text to store (whole bubble, or the user's selection within it). */
  text: string
  color?: string
}

/** Capture a Book of Concord section (or commentary) excerpt as a quote. Used for both
 *  `addBocQuote` (anchored to the primary-text source) and `addBocCommentaryQuote` (anchored
 *  to the commentary source) — same shape either way, since both are a document/section/
 *  paragraph reference plus the excerpt text. */
export interface BocQuoteInput {
  /** The boc_sources (or, for `addBocCommentaryQuote`, boc_commentary_sources) row id. */
  bocSourceId: string
  documentCode: string
  sectionOrdinal: number
  /** Numbered sections (e.g. "IV"); null for unnumbered ones (Preface, Conclusion). */
  sectionNumber: string | null
  sectionLabel: string
  /** The specific `[N]` paragraph quoted, if any. */
  paragraph: number | null
  text: string
  color?: string
}

/** Rows for the Quotes nav section: everything that has at least one saved quote. */
export interface QuoteGroups {
  /** Library PDFs with book quotes. */
  books: { bookId: string; title: string; count: number }[]
  /** Bible chapters (for the active translation) with saved highlights. */
  scripture: { book: string; chapter: number; name: string; count: number }[]
  /** Commentary sources with captured quotes. */
  commentary: { sourceId: string; displayName: string; author: string | null; count: number }[]
}

export interface Annotation {
  id: string
  text: string
  createdAt: number
}

export type NoteType = 'note' | 'page' | 'chapter' | 'topic' | 'book-note' | 'project'

export interface NoteSummary {
  path: string
  title: string
  type: NoteType
  tags: string[]
}

/** A source added to a project note's collection (see NoteType 'project'). */
export type ProjectItem =
  | { kind: 'book'; id: string }
  | { kind: 'note'; path: string }
  | { kind: 'scripture'; book: string; chapter: number }

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

export interface BibliographyEntry {
  /** CMOS 18 bibliography line (markdown italics for the title). */
  entry: string
  /** How many quotes are captured from this source. */
  quotes: number
}

export interface ExportOptions {
  /** Vault-relative path of the note to export. */
  notePath: string
  includeBibliography: boolean
  /** Cover byline; defaults to the OS user name if omitted. */
  author?: string | null
}

export type LinkTarget =
  | { type: 'book'; id: string }
  | { type: 'note'; path: string }
  | null

export type SearchKind = 'all' | 'page' | 'quote' | 'note' | 'scripture' | 'confession'

export interface SearchScope {
  kind: SearchKind
  bookId?: string | null
  shelfId?: string | null
  tag?: string | null
  /** Restrict to exactly this set of sources (a project's collection). */
  items?: ProjectItem[] | null
}

export interface SearchHit {
  kind: 'page' | 'quote' | 'note' | 'scripture'
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

export type ScriptureProvider = 'free-use' | 'api-bible' | 'esv'

/** A translation offered in the Bible reader's dropdown. */
export interface ScriptureTranslation {
  /** Stable Loci id, e.g. "BSB", "NKJV", "ESV". */
  id: string
  name: string
  abbr: string
  provider: ScriptureProvider
  /** Attribution/copyright line to display while reading. */
  copyright: string | null
}

export interface ScriptureVerse {
  verse: number
  text: string
}

/** A narrated reading of a chapter (e.g. BSB offers several readers). */
export interface ScriptureAudioTrack {
  /** Provider's reader id, e.g. "david". */
  reader: string
  /** Display label, e.g. "David". */
  label: string
  /** Direct MP3 URL. */
  url: string
}

/** A chapter (for the reader) or a referenced slice (for hover/click). */
export interface ScripturePassage {
  translation: string
  translationName: string
  /** Human label, e.g. "Romans 3" or "Romans 3:28-30". */
  reference: string
  /** USFM book code. */
  book: string
  bookName: string
  chapter: number
  verses: ScriptureVerse[]
  /** Verse numbers to highlight (from the original reference); [] for a plain chapter. */
  highlight: number[]
  copyright: string | null
  /** Narrated readings of this chapter, when the provider offers audio (e.g. BSB). */
  audio?: ScriptureAudioTrack[]
}

/** Request to highlight a verse range as a citeable Scripture quote. */
export interface NewScriptureHighlight {
  /** Translation id (also used as the citation abbreviation; BSB/public-domain only). */
  translation: string
  /** USFM book code, e.g. "JHN". */
  book: string
  chapter: number
  verseStart: number
  verseEnd?: number
  /** Verse text to store (clean, no verse numbers). */
  text: string
  color?: string
}

/** A saved Scripture highlight, used to re-mark verses when a chapter reopens. */
export interface ScriptureHighlight {
  id: string
  verseStart: number
  verseEnd: number
  color: string
}

/** A book with saved Scripture quotes, for the highlights panel's book selector. */
export interface ScriptureQuoteBook {
  /** USFM book code, e.g. "JHN". */
  book: string
  name: string
  count: number
}

/** Registered verse-keyed commentary source (a canonical Markdown file in the vault). `bookId`
 *  is vestigial — always null now — kept because it's still a real, indexed schema column. */
export interface CommentarySource {
  id: string
  bookId: string | null
  displayName: string
  author: string | null
  pdfRelativePath: string
  sortOrder: number
  indexedAt: string | null
  status: 'unindexed' | 'indexing' | 'indexed' | 'needs_review' | 'error'
}

export interface NewCommentarySource {
  displayName: string
  author: string | null
  bookId: string | null
  pdfRelativePath: string
}

export interface CommentarySourceUpdate {
  displayName?: string
  author?: string | null
  sortOrder?: number
  status?: CommentarySource['status']
  indexedAt?: string | null
}

/** A single indexed commentary chunk, keyed to a verse range. */
export interface CommentaryExcerpt {
  id: string
  sourceId: string
  book: string
  chapterStart: number
  verseStart: number
  chapterEnd: number
  verseEnd: number
  text: string
  pageNumber: number
  headerRaw: string | null
  confidence: number
  flagged: boolean
  /** Human-readable reasons this excerpt failed validation (empty if never flagged). */
  flagReasons: string[]
}

export interface CommentaryExcerptReassign {
  book: string
  chapterStart: number
  verseStart: number
  chapterEnd: number
  verseEnd: number
}

export type CommentaryIndexPhase = 'extracting' | 'validating' | 'done'

export interface CommentaryIndexProgress {
  phase: CommentaryIndexPhase
  done: number
  total: number
}

export interface CommentaryIndexSummary {
  totalCount: number
  flaggedCount: number
  booksCovered: string[]
  chaptersWithNoCoverage: { book: string; chapter: number }[]
  orphanedCorrections: number
  cancelled: boolean
}

/** A commentary excerpt joined with its source, for the reference sidebar. */
export interface CommentaryMatch {
  excerptId: string
  sourceId: string
  sourceDisplayName: string
  sourceAuthor: string | null
  sortOrder: number
  bookId: string | null
  text: string
  pageNumber: number
  chapterStart: number
  verseStart: number
  chapterEnd: number
  verseEnd: number
}

export interface BocSource {
  id: string
  displayName: string
  author: string | null
  mdRelativePath: string
  sortOrder: number
  status: string
}
export interface BocSectionRow {
  ordinal: number
  number: string | null
  label: string
  part: string | null
  text: string
}
export interface BocCommentaryMatch {
  excerptId: string
  sourceId: string
  sourceDisplayName: string
  sourceAuthor: string | null
  sortOrder: number
  text: string
  sectionStart: number
  sectionEnd: number
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
  /** The displayed citation: `citationOverride` if the user hand-edited it, else auto-generated. */
  citation: string
  /** The user's hand-edited citation text, if they overrode the auto-generated one. */
  citationOverride?: string
  notePath: string | null
  usedIn: string[]
  createdAt: number
  /** For Scripture quotes (book_id null): the chapter, for grouping in the panel. */
  scriptureChapter?: number
  /** For commentary quotes: the source's display name (used as the group label). */
  commentarySource?: string
  /** For commentary quotes: the source's author, if set (for grouping by author). */
  commentaryAuthor?: string
  /** For commentary quotes: the human verse-ref label, e.g. "James 1:1". */
  commentaryRef?: string
  /** For Scripture AND commentary quotes: the USFM book code the quote is anchored to, so the
   *  card can jump back to that passage. */
  scriptureBook?: string
  /** For Scripture AND commentary quotes: the verse range the quote is anchored to. */
  verseStart?: number
  verseEnd?: number
}
