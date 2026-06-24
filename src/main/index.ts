import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { closeDb, getDb } from './db/connection'
import { registerIpc } from './ipc'
import { backupSnapshot } from './services/backup'
import { enrichPending } from './services/library'
import { Channels } from '../shared/ipc'

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

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  getDb() // open DB + run migrations before the window loads
  registerIpc()
  createWindow()

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
