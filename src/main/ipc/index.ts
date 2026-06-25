import { ipcMain, dialog, BrowserWindow } from 'electron'
import type { OpenDialogOptions } from 'electron'
import { Channels } from '../../shared/ipc'
import type {
  Annotation,
  AppState,
  BookUpdate,
  ImportProgress,
  IndexedPage,
  NewQuote,
  PanelLayout,
  PublicConfig,
  SearchScope,
  WizardData
} from '../../shared/ipc'
import * as library from '../services/library'
import * as quotes from '../services/quotes'
import * as notes from '../services/notes'
import * as search from '../services/search'
import {
  getWelcomeBackgroundDataUrl,
  hasApiKey,
  readConfig,
  resetWelcomeBackground,
  setApiKey,
  setWelcomeBackgroundFromFile,
  toPublicConfig,
  writeConfig
} from '../services/config'
import { getLayout, getSession, setLayout, setSession } from '../services/state'
import { scaffoldVault, vaultExists } from '../services/vault'

function appState(): AppState {
  const cfg = readConfig()
  return {
    setupComplete: cfg.setupComplete,
    vaultPath: cfg.vaultPath,
    vaultExists: vaultExists()
  }
}

async function pickFolder(
  sender: Electron.WebContents,
  title: string,
  allowCreate = true
): Promise<string | null> {
  const win = BrowserWindow.fromWebContents(sender)
  const opts: OpenDialogOptions = {
    title,
    properties: allowCreate ? ['openDirectory', 'createDirectory'] : ['openDirectory']
  }
  const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
  return res.canceled || res.filePaths.length === 0 ? null : res.filePaths[0]
}

export function registerIpc(): void {
  ipcMain.handle(Channels.getAppState, () => appState())

  ipcMain.handle(Channels.chooseFolder, (e, title: string) => pickFolder(e.sender, title))

  ipcMain.handle(Channels.completeWizard, (_e, data: WizardData) => {
    scaffoldVault(data.vaultPath)
    writeConfig({
      setupComplete: true,
      vaultPath: data.vaultPath,
      pdfSourcePath: data.pdfSourcePath,
      backupPath: data.backupPath
    })
    return appState()
  })

  ipcMain.handle(Channels.getConfig, () => toPublicConfig())

  ipcMain.handle(Channels.setConfig, (_e, patch: Partial<PublicConfig>) => {
    // Strip the read-only flag; never accept secrets through the public config path.
    const { hasApiKey: _omit, ...safe } = patch ?? {}
    writeConfig(safe)
    return toPublicConfig()
  })

  ipcMain.handle(Channels.relocateVault, async (e) => {
    const picked = await pickFolder(e.sender, 'Locate vault folder', false)
    if (picked) writeConfig({ vaultPath: picked })
    return appState()
  })

  ipcMain.handle(Channels.pickWelcomeBackground, async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const opts: OpenDialogOptions = {
      title: 'Choose unlock background',
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp'] }]
    }
    const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    if (!res.canceled && res.filePaths[0]) setWelcomeBackgroundFromFile(res.filePaths[0])
    return toPublicConfig()
  })
  ipcMain.handle(Channels.getWelcomeBackground, () => getWelcomeBackgroundDataUrl())
  ipcMain.handle(Channels.resetWelcomeBackground, () => {
    resetWelcomeBackground()
    return toPublicConfig()
  })

  ipcMain.handle(Channels.getLayout, () => getLayout())
  ipcMain.handle(Channels.setLayout, (_e, patch: Partial<PanelLayout>) => setLayout(patch))
  ipcMain.handle(Channels.getSession, (_e, key: string) => getSession(key))
  ipcMain.handle(Channels.setSession, (_e, key: string, value: string) => setSession(key, value))
  ipcMain.handle(Channels.setApiKey, (_e, key: string) => setApiKey(key))
  ipcMain.handle(Channels.hasApiKey, () => hasApiKey())

  // --- Library (Phase 1) ---
  ipcMain.handle(Channels.listBooks, () => library.listBooks())

  ipcMain.handle(Channels.importFromSource, async (e) => {
    const notify = (p: ImportProgress): void => e.sender.send(Channels.importProgress, p)
    const changed = (): void => e.sender.send(Channels.libraryChanged)
    const result = await library.quickImport(library.collectSourcePdfs(), notify)
    changed()
    void library.enrichPending(notify, changed) // background, throttled
    return result
  })

  ipcMain.handle(Channels.importFiles, async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const opts: OpenDialogOptions = {
      title: 'Import PDFs',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    }
    const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    if (res.canceled || res.filePaths.length === 0) {
      return { imported: 0, skipped: 0, failed: 0, titles: [] }
    }
    const notify = (p: ImportProgress): void => e.sender.send(Channels.importProgress, p)
    const changed = (): void => e.sender.send(Channels.libraryChanged)
    const result = await library.quickImport(res.filePaths, notify)
    changed()
    void library.enrichPending(notify, changed) // background, throttled
    return result
  })
  ipcMain.handle(Channels.updateBook, (_e, id: string, patch: BookUpdate) =>
    library.updateBook(id, patch)
  )
  ipcMain.handle(Channels.deleteBook, (_e, id: string) => library.deleteBook(id))
  ipcMain.handle(Channels.setBookShelves, (_e, id: string, shelfIds: string[]) =>
    library.setBookShelves(id, shelfIds)
  )
  ipcMain.handle(Channels.setBookTags, (_e, id: string, tags: string[]) =>
    library.setBookTags(id, tags)
  )
  ipcMain.handle(Channels.getCover, (_e, id: string) => library.getCoverDataUrl(id))
  ipcMain.handle(Channels.refetchMetadata, (_e, id: string) => library.refetchMetadata(id))
  ipcMain.handle(Channels.listShelves, () => library.listShelves())
  ipcMain.handle(Channels.createShelf, (_e, name: string) => library.createShelf(name))
  ipcMain.handle(Channels.listTags, () => library.listTags())
  ipcMain.handle(Channels.getBookPdf, (_e, id: string) => library.getBookPdf(id))
  ipcMain.handle(Channels.setBookLastPage, (_e, id: string, page: number) =>
    library.setBookLastPage(id, page)
  )

  // --- Quotes (Phase 2b) ---
  ipcMain.handle(Channels.addQuote, (_e, input: NewQuote) => quotes.addQuote(input))
  ipcMain.handle(Channels.listQuotes, (_e, bookId: string) => quotes.listQuotes(bookId))
  ipcMain.handle(Channels.setQuoteTags, (_e, quoteId: string, tags: string[]) =>
    quotes.setQuoteTags(quoteId, tags)
  )
  ipcMain.handle(Channels.setQuoteAnnotations, (_e, quoteId: string, annotations: Annotation[]) =>
    quotes.setQuoteAnnotations(quoteId, annotations)
  )
  ipcMain.handle(Channels.deleteQuote, (_e, quoteId: string) => quotes.deleteQuote(quoteId))

  // --- Notes (Phase 2c) ---
  ipcMain.handle(Channels.getBookNote, (_e, bookId: string) => notes.getBookNote(bookId))
  ipcMain.handle(Channels.saveNote, (_e, path: string, content: string) =>
    notes.saveNote(path, content)
  )
  ipcMain.handle(Channels.readNote, (_e, path: string) => notes.readNote(path))
  ipcMain.handle(Channels.listStandaloneNotes, () => notes.listStandaloneNotes())
  ipcMain.handle(Channels.createNote, (_e, title: string) => notes.createStandaloneNote(title))
  ipcMain.handle(Channels.deleteNote, (_e, path: string) => notes.deleteNote(path))
  ipcMain.handle(Channels.backlinks, (_e, target: string) => notes.backlinks(target))
  ipcMain.handle(Channels.resolveLink, (_e, name: string) => notes.resolveLink(name))

  // --- Search (Phase 3) ---
  ipcMain.handle(Channels.search, (_e, query: string, scope: SearchScope) =>
    search.search(query, scope)
  )
  ipcMain.handle(Channels.indexBookText, (_e, bookId: string, title: string, pages: IndexedPage[]) =>
    search.indexBookText(bookId, title, pages)
  )
  ipcMain.handle(Channels.unindexedBooks, () => search.unindexedBooks())
}
