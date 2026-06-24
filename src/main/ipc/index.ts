import { ipcMain, dialog, BrowserWindow } from 'electron'
import type { OpenDialogOptions } from 'electron'
import { Channels } from '../../shared/ipc'
import type { AppState, BookUpdate, PanelLayout, PublicConfig, WizardData } from '../../shared/ipc'
import * as auth from '../services/auth'
import * as library from '../services/library'
import { hasApiKey, readConfig, setApiKey, toPublicConfig, writeConfig } from '../services/config'
import { getLayout, getSession, setLayout, setSession } from '../services/state'
import { scaffoldVault, vaultExists } from '../services/vault'

function appState(): AppState {
  const cfg = readConfig()
  return {
    setupComplete: cfg.setupComplete,
    hasPassword: auth.hasPassword(),
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
    auth.setPassword(data.password)
    writeConfig({
      setupComplete: true,
      vaultPath: data.vaultPath,
      pdfSourcePath: data.pdfSourcePath,
      backupPath: data.backupPath
    })
    return appState()
  })

  ipcMain.handle(Channels.unlock, (_e, password: string) => auth.verifyPassword(password))

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

  ipcMain.handle(Channels.getLayout, () => getLayout())
  ipcMain.handle(Channels.setLayout, (_e, patch: Partial<PanelLayout>) => setLayout(patch))
  ipcMain.handle(Channels.getSession, (_e, key: string) => getSession(key))
  ipcMain.handle(Channels.setSession, (_e, key: string, value: string) => setSession(key, value))
  ipcMain.handle(Channels.setApiKey, (_e, key: string) => setApiKey(key))
  ipcMain.handle(Channels.hasApiKey, () => hasApiKey())

  // --- Library (Phase 1) ---
  ipcMain.handle(Channels.listBooks, () => library.listBooks())
  ipcMain.handle(Channels.importFromSource, () => library.importFromSource())
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
    return library.importPaths(res.filePaths)
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
}
