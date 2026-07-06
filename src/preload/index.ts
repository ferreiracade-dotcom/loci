import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'
import { Channels } from '../shared/ipc'
import type { CommentaryIndexProgress, ImportProgress, LociApi, SyncResult } from '../shared/ipc'

const api: LociApi = {
  getAppState: () => ipcRenderer.invoke(Channels.getAppState),
  chooseFolder: (title) => ipcRenderer.invoke(Channels.chooseFolder, title),
  completeWizard: (data) => ipcRenderer.invoke(Channels.completeWizard, data),
  getConfig: () => ipcRenderer.invoke(Channels.getConfig),
  setConfig: (patch) => ipcRenderer.invoke(Channels.setConfig, patch),
  relocateVault: () => ipcRenderer.invoke(Channels.relocateVault),
  pickWelcomeBackground: () => ipcRenderer.invoke(Channels.pickWelcomeBackground),
  getWelcomeBackground: () => ipcRenderer.invoke(Channels.getWelcomeBackground),
  resetWelcomeBackground: () => ipcRenderer.invoke(Channels.resetWelcomeBackground),
  getLayout: () => ipcRenderer.invoke(Channels.getLayout),
  setLayout: (patch) => ipcRenderer.invoke(Channels.setLayout, patch),
  getSession: (key) => ipcRenderer.invoke(Channels.getSession, key),
  setSession: (key, value) => ipcRenderer.invoke(Channels.setSession, key, value),
  setApiKey: (key) => ipcRenderer.invoke(Channels.setApiKey, key),
  hasApiKey: () => ipcRenderer.invoke(Channels.hasApiKey),

  listBooks: () => ipcRenderer.invoke(Channels.listBooks),
  importFromSource: () => ipcRenderer.invoke(Channels.importFromSource),
  importFiles: () => ipcRenderer.invoke(Channels.importFiles),
  updateBook: (id, patch) => ipcRenderer.invoke(Channels.updateBook, id, patch),
  deleteBook: (id) => ipcRenderer.invoke(Channels.deleteBook, id),
  setBookShelves: (id, shelfIds) => ipcRenderer.invoke(Channels.setBookShelves, id, shelfIds),
  setBookTags: (id, tags) => ipcRenderer.invoke(Channels.setBookTags, id, tags),
  getCover: (id) => ipcRenderer.invoke(Channels.getCover, id),
  setBookCover: (id) => ipcRenderer.invoke(Channels.setBookCover, id),
  refetchMetadata: (id) => ipcRenderer.invoke(Channels.refetchMetadata, id),
  listShelves: () => ipcRenderer.invoke(Channels.listShelves),
  createShelf: (name) => ipcRenderer.invoke(Channels.createShelf, name),
  renameShelf: (id, name) => ipcRenderer.invoke(Channels.renameShelf, id, name),
  deleteShelf: (id) => ipcRenderer.invoke(Channels.deleteShelf, id),
  reorderShelves: (orderedIds) => ipcRenderer.invoke(Channels.reorderShelves, orderedIds),
  listTags: () => ipcRenderer.invoke(Channels.listTags),
  reorderTags: (orderedIds) => ipcRenderer.invoke(Channels.reorderTags, orderedIds),
  getBookPdf: (id) => ipcRenderer.invoke(Channels.getBookPdf, id),
  setBookLastPage: (id, page) => ipcRenderer.invoke(Channels.setBookLastPage, id, page),
  backfillLocal: () => ipcRenderer.invoke(Channels.backfillLocal),
  relinkBook: (id) => ipcRenderer.invoke(Channels.relinkBook, id),
  addQuote: (input) => ipcRenderer.invoke(Channels.addQuote, input),
  listQuotes: (bookId) => ipcRenderer.invoke(Channels.listQuotes, bookId),
  buildBibliography: () => ipcRenderer.invoke(Channels.buildBibliography),
  setQuoteTags: (quoteId, tags) => ipcRenderer.invoke(Channels.setQuoteTags, quoteId, tags),
  setQuoteAnnotations: (quoteId, annotations) =>
    ipcRenderer.invoke(Channels.setQuoteAnnotations, quoteId, annotations),
  deleteQuote: (quoteId) => ipcRenderer.invoke(Channels.deleteQuote, quoteId),
  getBookNote: (bookId) => ipcRenderer.invoke(Channels.getBookNote, bookId),
  saveNote: (path, content) => ipcRenderer.invoke(Channels.saveNote, path, content),
  readNote: (path) => ipcRenderer.invoke(Channels.readNote, path),
  listStandaloneNotes: () => ipcRenderer.invoke(Channels.listStandaloneNotes),
  createNote: (title, type) => ipcRenderer.invoke(Channels.createNote, title, type),
  deleteNote: (path) => ipcRenderer.invoke(Channels.deleteNote, path),
  backlinks: (target) => ipcRenderer.invoke(Channels.backlinks, target),
  resolveLink: (name) => ipcRenderer.invoke(Channels.resolveLink, name),
  vaultHealth: () => ipcRenderer.invoke(Channels.vaultHealth),
  search: (query, scope) => ipcRenderer.invoke(Channels.search, query, scope),
  indexBookText: (bookId, title, pages) =>
    ipcRenderer.invoke(Channels.indexBookText, bookId, title, pages),
  indexScriptureChapter: (translation, book, chapter, title, verses) =>
    ipcRenderer.invoke(Channels.indexScriptureChapter, translation, book, chapter, title, verses),
  unindexedBooks: () => ipcRenderer.invoke(Channels.unindexedBooks),
  exportNotePdf: (opts) => ipcRenderer.invoke(Channels.exportNotePdf, opts),

  listScriptureTranslations: () => ipcRenderer.invoke(Channels.listScriptureTranslations),
  getScriptureChapter: (translation, book, chapter) =>
    ipcRenderer.invoke(Channels.getScriptureChapter, translation, book, chapter),
  getScripturePassage: (translation, ref) =>
    ipcRenderer.invoke(Channels.getScripturePassage, translation, ref),
  setApiBibleKey: (key) => ipcRenderer.invoke(Channels.setApiBibleKey, key),
  hasApiBibleKey: () => ipcRenderer.invoke(Channels.hasApiBibleKey),
  setEsvKey: (key) => ipcRenderer.invoke(Channels.setEsvKey, key),
  hasEsvKey: () => ipcRenderer.invoke(Channels.hasEsvKey),
  addScriptureHighlight: (input) => ipcRenderer.invoke(Channels.addScriptureHighlight, input),
  listScriptureHighlights: (translation, book, chapter) =>
    ipcRenderer.invoke(Channels.listScriptureHighlights, translation, book, chapter),
  listScriptureQuotes: (translation, book) =>
    ipcRenderer.invoke(Channels.listScriptureQuotes, translation, book),
  listScriptureQuoteBooks: (translation) =>
    ipcRenderer.invoke(Channels.listScriptureQuoteBooks, translation),

  listCommentarySources: () => ipcRenderer.invoke(Channels.listCommentarySources),
  createCommentarySource: (input) => ipcRenderer.invoke(Channels.createCommentarySource, input),
  createCommentarySourceFromBook: (bookId, displayName, author) =>
    ipcRenderer.invoke(Channels.createCommentarySourceFromBook, bookId, displayName, author),
  updateCommentarySource: (id, patch) =>
    ipcRenderer.invoke(Channels.updateCommentarySource, id, patch),
  deleteCommentarySource: (id) => ipcRenderer.invoke(Channels.deleteCommentarySource, id),
  reorderCommentarySources: (orderedIds) =>
    ipcRenderer.invoke(Channels.reorderCommentarySources, orderedIds),
  lookupCommentary: (book, chapter, verse) =>
    ipcRenderer.invoke(Channels.lookupCommentary, book, chapter, verse),
  listFlaggedCommentary: (sourceId) =>
    ipcRenderer.invoke(Channels.listFlaggedCommentary, sourceId),
  setCommentaryExcerptFlag: (id, flagged) =>
    ipcRenderer.invoke(Channels.setCommentaryExcerptFlag, id, flagged),
  reassignCommentaryExcerpt: (id, patch) =>
    ipcRenderer.invoke(Channels.reassignCommentaryExcerpt, id, patch),
  profileCommentarySource: (sourceId) =>
    ipcRenderer.invoke(Channels.profileCommentarySource, sourceId),
  indexCommentarySource: (sourceId) => ipcRenderer.invoke(Channels.indexCommentarySource, sourceId),
  cancelCommentaryIndexing: (sourceId) =>
    ipcRenderer.invoke(Channels.cancelCommentaryIndexing, sourceId),
  reviewConfirmCommentaryExcerpt: (excerptId) =>
    ipcRenderer.invoke(Channels.reviewConfirmCommentaryExcerpt, excerptId),
  reviewReassignCommentaryExcerpt: (excerptId, patch) =>
    ipcRenderer.invoke(Channels.reviewReassignCommentaryExcerpt, excerptId, patch),
  reviewDiscardCommentaryExcerpt: (excerptId) =>
    ipcRenderer.invoke(Channels.reviewDiscardCommentaryExcerpt, excerptId),
  deleteCommentaryCorrectionsForSource: (pdfRelativePath) =>
    ipcRenderer.invoke(Channels.deleteCommentaryCorrectionsForSource, pdfRelativePath),

  onImportProgress: (cb) => {
    const listener = (_e: IpcRendererEvent, p: ImportProgress): void => cb(p)
    ipcRenderer.on(Channels.importProgress, listener)
    return () => ipcRenderer.removeListener(Channels.importProgress, listener)
  },
  onLibraryChanged: (cb) => {
    const listener = (): void => cb()
    ipcRenderer.on(Channels.libraryChanged, listener)
    return () => ipcRenderer.removeListener(Channels.libraryChanged, listener)
  },
  onLibrarySynced: (cb) => {
    const listener = (_e: IpcRendererEvent, r: SyncResult): void => cb(r)
    ipcRenderer.on(Channels.librarySynced, listener)
    return () => ipcRenderer.removeListener(Channels.librarySynced, listener)
  },
  onCommentaryIndexProgress: (cb) => {
    const listener = (_e: IpcRendererEvent, p: CommentaryIndexProgress): void => cb(p)
    ipcRenderer.on(Channels.commentaryIndexProgress, listener)
    return () => ipcRenderer.removeListener(Channels.commentaryIndexProgress, listener)
  }
}

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('loci', api)
} else {
  // Fallback for the (unused) non-isolated case.
  ;(globalThis as unknown as { loci: LociApi }).loci = api
}
