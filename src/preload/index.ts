import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'
import { Channels } from '../shared/ipc'
import type { ImportProgress, LociApi } from '../shared/ipc'

const api: LociApi = {
  getAppState: () => ipcRenderer.invoke(Channels.getAppState),
  chooseFolder: (title) => ipcRenderer.invoke(Channels.chooseFolder, title),
  completeWizard: (data) => ipcRenderer.invoke(Channels.completeWizard, data),
  unlock: (password) => ipcRenderer.invoke(Channels.unlock, password),
  getConfig: () => ipcRenderer.invoke(Channels.getConfig),
  setConfig: (patch) => ipcRenderer.invoke(Channels.setConfig, patch),
  relocateVault: () => ipcRenderer.invoke(Channels.relocateVault),
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
