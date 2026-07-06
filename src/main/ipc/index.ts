import { ipcMain, dialog, BrowserWindow } from 'electron'
import type { OpenDialogOptions } from 'electron'
import { Channels } from '../../shared/ipc'
import type {
  Annotation,
  AppState,
  BookUpdate,
  CommentaryExcerptReassign,
  CommentaryIndexProgress,
  CommentarySourceUpdate,
  ExportOptions,
  ImportProgress,
  IndexedPage,
  NewCommentarySource,
  NewQuote,
  NewScriptureHighlight,
  NoteType,
  PanelLayout,
  PublicConfig,
  SearchScope,
  WizardData
} from '../../shared/ipc'
import * as library from '../services/library'
import * as quotes from '../services/quotes'
import * as notes from '../services/notes'
import * as search from '../services/search'
import * as exporter from '../services/export'
import * as scripture from '../services/scripture'
import * as commentary from '../services/commentary'
import * as commentaryIndex from '../services/commentaryIndex'
import { deleteCorrectionsForSource } from '../services/commentaryCorrections'
import {
  getWelcomeBackgroundDataUrl,
  hasApiBibleKey,
  hasApiKey,
  hasEsvKey,
  readConfig,
  resetWelcomeBackground,
  setApiBibleKey,
  setApiKey,
  setEsvKey,
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
      backupPath: data.backupPath,
      primaryLibraryPath: data.primaryLibraryPath,
      keepLocalCopies: data.keepLocalCopies
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
  ipcMain.handle(Channels.setBookCover, async (e, id: string) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const opts: OpenDialogOptions = {
      title: 'Choose cover image',
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp'] }]
    }
    const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    if (res.canceled || !res.filePaths[0]) return null
    return library.setBookCover(id, res.filePaths[0])
  })
  ipcMain.handle(Channels.refetchMetadata, (_e, id: string) => library.refetchMetadata(id))
  ipcMain.handle(Channels.listShelves, () => library.listShelves())
  ipcMain.handle(Channels.createShelf, (_e, name: string) => library.createShelf(name))
  ipcMain.handle(Channels.renameShelf, (_e, id: string, name: string) =>
    library.renameShelf(id, name)
  )
  ipcMain.handle(Channels.deleteShelf, (_e, id: string) => library.deleteShelf(id))
  ipcMain.handle(Channels.reorderShelves, (_e, orderedIds: string[]) =>
    library.reorderShelves(orderedIds)
  )
  ipcMain.handle(Channels.listTags, () => library.listTags())
  ipcMain.handle(Channels.reorderTags, (_e, orderedIds: string[]) => library.reorderTags(orderedIds))
  ipcMain.handle(Channels.getBookPdf, (_e, id: string) => library.getBookPdf(id))
  ipcMain.handle(Channels.setBookLastPage, (_e, id: string, page: number) =>
    library.setBookLastPage(id, page)
  )
  ipcMain.handle(Channels.backfillLocal, (e) =>
    library.backfillLocalCopies(() => e.sender.send(Channels.libraryChanged))
  )
  ipcMain.handle(Channels.relinkBook, async (e, id: string) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const opts: OpenDialogOptions = {
      title: 'Locate this book’s PDF',
      properties: ['openFile'],
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    }
    const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    if (res.canceled || !res.filePaths[0]) return null
    const book = library.relinkBookToFile(id, res.filePaths[0])
    if (book) e.sender.send(Channels.libraryChanged)
    return book
  })

  // --- Quotes (Phase 2b) ---
  ipcMain.handle(Channels.addQuote, (_e, input: NewQuote) => quotes.addQuote(input))
  ipcMain.handle(Channels.listQuotes, (_e, bookId: string) => quotes.listQuotes(bookId))
  ipcMain.handle(Channels.buildBibliography, () => quotes.buildBibliography())
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
  ipcMain.handle(Channels.createNote, (_e, title: string, type?: NoteType) =>
    notes.createStandaloneNote(title, type)
  )
  ipcMain.handle(Channels.deleteNote, (_e, path: string) => notes.deleteNote(path))
  ipcMain.handle(Channels.backlinks, (_e, target: string) => notes.backlinks(target))
  ipcMain.handle(Channels.resolveLink, (_e, name: string) => notes.resolveLink(name))
  ipcMain.handle(Channels.vaultHealth, () => notes.vaultHealth())
  ipcMain.handle(Channels.exportNotePdf, (_e, opts: ExportOptions) => exporter.exportNotePdf(opts))

  // --- Search (Phase 3) ---
  ipcMain.handle(Channels.search, (_e, query: string, scope: SearchScope) =>
    search.search(query, scope)
  )
  ipcMain.handle(Channels.indexBookText, (_e, bookId: string, title: string, pages: IndexedPage[]) =>
    search.indexBookText(bookId, title, pages)
  )
  ipcMain.handle(
    Channels.indexScriptureChapter,
    (
      _e,
      translation: string,
      book: string,
      chapter: number,
      title: string,
      verses: { verse: number; text: string }[]
    ) => search.indexScriptureChapter(translation, book, chapter, title, verses)
  )
  ipcMain.handle(Channels.unindexedBooks, () => search.unindexedBooks())

  // --- Scripture (Phase 8) ---
  ipcMain.handle(Channels.listScriptureTranslations, () => scripture.listTranslations())
  ipcMain.handle(Channels.getScriptureChapter, (_e, translation: string, book: string, chapter: number) =>
    scripture.getChapter(translation, book, chapter)
  )
  ipcMain.handle(Channels.getScripturePassage, (_e, translation: string, ref: string) =>
    scripture.getPassage(translation, ref)
  )
  ipcMain.handle(Channels.setApiBibleKey, (_e, key: string) => {
    const ok = setApiBibleKey(key)
    scripture.invalidateRegistry()
    return ok
  })
  ipcMain.handle(Channels.hasApiBibleKey, () => hasApiBibleKey())
  ipcMain.handle(Channels.setEsvKey, (_e, key: string) => {
    const ok = setEsvKey(key)
    scripture.invalidateRegistry()
    return ok
  })
  ipcMain.handle(Channels.hasEsvKey, () => hasEsvKey())
  ipcMain.handle(Channels.addScriptureHighlight, (_e, input: NewScriptureHighlight) =>
    quotes.addScriptureQuote(input)
  )
  ipcMain.handle(
    Channels.listScriptureHighlights,
    (_e, translation: string, book: string, chapter: number) =>
      quotes.listScriptureHighlights(translation, book, chapter)
  )
  ipcMain.handle(Channels.listScriptureQuotes, (_e, translation: string, book: string) =>
    quotes.listScriptureQuotes(translation, book)
  )
  ipcMain.handle(Channels.listScriptureQuoteBooks, (_e, translation: string) =>
    quotes.listScriptureQuoteBooks(translation)
  )

  // --- Commentary (verse-keyed ingestion) ---
  ipcMain.handle(Channels.listCommentarySources, () => commentary.listSources())
  ipcMain.handle(Channels.createCommentarySource, (_e, input: NewCommentarySource) =>
    commentary.createSource(input)
  )
  ipcMain.handle(
    Channels.createCommentarySourceFromBook,
    (_e, bookId: string, displayName: string, author: string | null) =>
      commentary.createSourceFromBook(bookId, displayName, author)
  )
  ipcMain.handle(Channels.addMarkdownCommentarySource, async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const opts: OpenDialogOptions = {
      title: 'Choose a commentary Markdown file',
      properties: ['openFile'],
      filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }]
    }
    const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    if (res.canceled || !res.filePaths[0]) return null
    return commentary.createSourceFromMarkdown(res.filePaths[0])
  })
  ipcMain.handle(Channels.updateCommentarySource, (_e, id: string, patch: CommentarySourceUpdate) =>
    commentary.updateSource(id, patch)
  )
  ipcMain.handle(Channels.deleteCommentarySource, (_e, id: string) => commentary.deleteSource(id))
  ipcMain.handle(Channels.reorderCommentarySources, (_e, orderedIds: string[]) =>
    commentary.reorderSources(orderedIds)
  )
  ipcMain.handle(Channels.lookupCommentary, (_e, book: string, chapter: number, verse: number) =>
    commentary.lookupVerse(book, chapter, verse)
  )
  ipcMain.handle(Channels.listFlaggedCommentary, (_e, sourceId?: string) =>
    commentary.listFlagged(sourceId)
  )
  ipcMain.handle(Channels.setCommentaryExcerptFlag, (_e, id: string, flagged: boolean) =>
    commentary.setExcerptFlag(id, flagged)
  )
  ipcMain.handle(
    Channels.reassignCommentaryExcerpt,
    (_e, id: string, patch: CommentaryExcerptReassign) => commentary.reassignExcerpt(id, patch)
  )
  ipcMain.handle(Channels.profileCommentarySource, (_e, sourceId: string) =>
    commentaryIndex.profileCommentarySource(sourceId)
  )
  ipcMain.handle(Channels.indexCommentarySource, async (e, sourceId: string) => {
    const notify = (p: CommentaryIndexProgress): void => e.sender.send(Channels.commentaryIndexProgress, p)
    const result = await commentaryIndex.indexSource(sourceId, notify)
    e.sender.send(Channels.libraryChanged)
    return result
  })
  ipcMain.handle(Channels.cancelCommentaryIndexing, (_e, sourceId: string) =>
    commentaryIndex.cancelIndexing(sourceId)
  )
  ipcMain.handle(Channels.reviewConfirmCommentaryExcerpt, (_e, excerptId: string) =>
    commentary.reviewConfirm(excerptId)
  )
  ipcMain.handle(
    Channels.reviewReassignCommentaryExcerpt,
    (_e, excerptId: string, patch: CommentaryExcerptReassign) =>
      commentary.reviewReassign(excerptId, patch)
  )
  ipcMain.handle(Channels.reviewDiscardCommentaryExcerpt, (_e, excerptId: string) =>
    commentary.reviewDiscard(excerptId)
  )
  ipcMain.handle(Channels.deleteCommentaryCorrectionsForSource, (_e, pdfRelativePath: string) =>
    deleteCorrectionsForSource(pdfRelativePath)
  )
}
