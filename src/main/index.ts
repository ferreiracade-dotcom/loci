import { app, BrowserWindow, Menu, shell } from 'electron'
import type { MenuItemConstructorOptions } from 'electron'
import { existsSync, unlinkSync } from 'fs'
import { join } from 'path'
import { closeDb, getDataDir, getDb } from './db/connection'
import { registerIpc } from './ipc'
import { backupSnapshot } from './services/backup'
import { enrichPending } from './services/library'
import { applyRelinkMap, applyTitleClean } from './services/relink'
import { rebuildAllSidecars } from './services/sidecar'
import { Channels } from '../shared/ipc'

/** One-time whole-library sidecar write, triggered by a flag file, run off the boot path. */
function maybeRebuildSidecars(): void {
  const flag = join(getDataDir(), 'sidecar-rebuild.flag')
  if (!existsSync(flag)) return
  setTimeout(() => {
    try {
      const n = rebuildAllSidecars((done, total) => {
        if (done === total) console.log(`[sidecar] wrote sidecars for ${total} books`)
      })
      console.log(`[sidecar] rebuild complete (${n} books)`)
    } catch (e) {
      console.error('[sidecar] rebuild failed', e)
    }
    try {
      unlinkSync(flag)
    } catch {
      /* best effort */
    }
  }, 1500)
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 940,
    minHeight: 600,
    show: false,
    backgroundColor: '#161310',
    title: 'Loci',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.on('ready-to-show', () => win.show())

  // Resume any metadata enrichment left pending from a previous session.
  win.webContents.once('did-finish-load', () => {
    const send = (channel: string, payload?: unknown): void => {
      if (!win.isDestroyed()) win.webContents.send(channel, payload)
    }
    void enrichPending(
      (p) => send(Channels.importProgress, p),
      () => send(Channels.libraryChanged)
    )
  })

  // Open external links in the system browser, never in-app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // Right-click clipboard menu (cut/copy/paste) for editable fields + the editor.
  win.webContents.on('context-menu', (_e, params) => {
    const { isEditable, editFlags, selectionText } = params
    const items: MenuItemConstructorOptions[] = []
    if (isEditable) {
      items.push(
        { role: 'cut', enabled: editFlags.canCut },
        { role: 'copy', enabled: editFlags.canCopy },
        { role: 'paste', enabled: editFlags.canPaste },
        { type: 'separator' },
        { role: 'selectAll' }
      )
    } else if (selectionText && selectionText.trim().length > 0) {
      items.push({ role: 'copy' })
    }
    if (items.length) Menu.buildFromTemplate(items).popup({ window: win })
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  getDb() // open DB + run migrations before the window loads
  applyRelinkMap() // one-time library-consolidation relink, if pending
  applyTitleClean() // one-time: strip trailing author from titles, if pending
  registerIpc()
  createWindow()
  maybeRebuildSidecars() // one-time whole-library sidecar write, if pending

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  // Local backup snapshot on close (spec §2), then release the DB and quit.
  backupSnapshot()
  closeDb()
  if (process.platform !== 'darwin') app.quit()
})
