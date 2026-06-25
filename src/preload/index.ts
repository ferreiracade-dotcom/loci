import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'
import { Channels } from '../shared/ipc'
import type { ImportProgress, LociApi } from '../shared/ipc'

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
  refetchMetadata: (id) => ipcRenderer.invoke(Channels.refetchMetadata, id),
  listShelves: () => ipcRenderer.invoke(Channels.listShelves),
  createShelf: (name) => ipcRenderer.invoke(Channels.createShelf, name),
  listTags: () => ipcRenderer.invoke(Channels.listTags),
  getBookPdf: (id) => ipcRenderer.invoke(Channels.getBookPdf, id),
  setBookLastPage: (id, page) => ipcRenderer.invoke(Channels.setBookLastPage, id, page),
  addQuote: (input) => ipcRenderer.invoke(Channels.addQuote, input),
  listQuotes: (bookId) => ipcRenderer.invoke(Channels.listQuotes, bookId),
  setQuoteTags: (quoteId, tags) => ipcRenderer.invoke(Channels.setQuoteTags, quoteId, tags),
  setQuoteAnnotations: (quoteId, annotations) =>
    ipcRenderer.invoke(Channels.setQuoteAnnotations, quoteId, annotations),
  deleteQuote: (quoteId) => ipcRenderer.invoke(Channels.deleteQuote, quoteId),
  getBookNote: (bookId) => ipcRenderer.invoke(Channels.getBookNote, bookId),
  saveNote: (path, content) => ipcRenderer.invoke(Channels.saveNote, path, content),
  readNote: (path) => ipcRenderer.invoke(Channels.readNote, path),
  listStandaloneNotes: () => ipcRenderer.invoke(Channels.listStandaloneNotes),
  createNote: (title) => ipcRenderer.invoke(Channels.createNote, title),
  deleteNote: (path) => ipcRenderer.invoke(Channels.deleteNote, path),
  backlinks: (target) => ipcRenderer.invoke(Channels.backlinks, target),
  resolveLink: (name) => ipcRenderer.invoke(Channels.resolveLink, name),
  search: (query, scope) => ipcRenderer.invoke(Channels.search, query, scope),
  indexBookText: (bookId, title, pages) =>
    ipcRenderer.invoke(Channels.indexBookText, bookId, title, pages),
  unindexedBooks: () => ipcRenderer.invoke(Channels.unindexedBooks),

  onImportProgress: (cb) => {
    const listener = (_e: IpcRendererEvent, p: ImportProgress): void => cb(p)
    ipcRenderer.on(Channels.importProgress, listener)
    return () => ipcRenderer.removeListener(Channels.importProgress, listener)
  },
  onLibraryChanged: (cb) => {
    const listener = (): void => cb()
    ipcRenderer.on(Channels.libraryChanged, listener)
    return () => ipcRenderer.removeListener(Channels.libraryChanged, listener)
  }
}

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('loci', api)
} else {
  // Fallback for the (unused) non-isolated case.
  ;(globalThis as unknown as { loci: LociApi }).loci = api
}
