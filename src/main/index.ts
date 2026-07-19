import { app, BrowserWindow, Menu, shell } from 'electron'
import type { MenuItemConstructorOptions } from 'electron'
import { existsSync, unlinkSync } from 'fs'
import { join } from 'path'
import { closeDb, getDataDir, getDb } from './db/connection'
import { registerIpc } from './ipc'
import { backupSnapshot } from './services/backup'
import {
  applyFilenameAuthorMigration,
  applySidecarResync,
  backfillLocalCopies,
  enrichPending,
  syncLibrary
} from './services/library'
import { readConfig } from './services/config'
import { applyRelinkMap, applyTitleClean } from './services/relink'
import { rebuildAllSidecars } from './services/sidecar'
import { syncVault } from './services/vaultsync'
import { syncCommentaryFolder } from './services/commentaryIndex'
import { syncBocFolder } from './services/bocIndex'
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

  // On load: reconcile the catalog with the local + Drive book folders (auto-add new books,
  // mirror the two sides, prune stale rows), tell the renderer what changed, then resume any
  // metadata enrichment left pending from a previous session. Deferred a moment so the window
  // paints and the renderer's initial data IPC completes before the (cooperative) rebuild runs.
  win.webContents.once('did-finish-load', () => {
    const send = (channel: string, payload?: unknown): void => {
      if (!win.isDestroyed()) win.webContents.send(channel, payload)
    }
    setTimeout(() => {
      void (async () => {
        try {
          const result = await syncLibrary(
            (p) => send(Channels.importProgress, p),
            () => send(Channels.libraryChanged)
          )
          send(Channels.librarySynced, result)
        } catch (e) {
          console.error('[sync] startup library sync failed', e)
        }
        // Pull offline copies down in the background (only when "keep local copies" is on), so the
        // catalog is usable immediately and books stream from Drive until their local copy lands.
        if (readConfig().keepLocalCopies) {
          void backfillLocalCopies(() => send(Channels.libraryChanged)).catch((e) =>
            console.error('[sync] background backfill failed', e)
          )
        }
        await enrichPending(
          (p) => send(Channels.importProgress, p),
          () => send(Channels.libraryChanged)
        )
      })()
    }, 1500)
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
  try {
    syncVault() // seed the local notes/highlights vault from Drive + back up (best-effort)
  } catch {
    /* Drive may be offline — local vault still works */
  }
  applyRelinkMap() // one-time library-consolidation relink, if pending
  applyTitleClean() // one-time: strip trailing author from titles, if pending
  applyFilenameAuthorMigration() // one-time: derive missing authors from file names, if pending
  applySidecarResync() // one-time: refresh sidecars left stale by the migration above, if pending
  registerIpc()
  createWindow()
  maybeRebuildSidecars() // one-time whole-library sidecar write, if pending
  // Auto-register + index any Markdown commentaries the vault carries (best-effort; new/changed
  // files only). Makes vault commentaries appear on every device without manual re-adding.
  // Deferred so the window paints before the (synchronous) index work runs.
  setTimeout(() => void syncCommentaryFolder().catch(() => {}), 2000)
  // Same auto-register + index, for the Book of Concord's confessions/ + confessions-commentary/
  // vault folders. Staggered a beat after the commentary sync so the two don't contend.
  setTimeout(() => void syncBocFolder().catch(() => {}), 2500)

  // Keep the Drive backup fresh during long sessions (best-effort, skips when offline).
  setInterval(() => {
    try {
      syncVault()
    } catch {
      /* best effort */
    }
  }, 180_000)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  // Final notes/highlights backup to Drive, local snapshot, then release the DB and quit.
  try {
    syncVault()
  } catch {
    /* best effort */
  }
  backupSnapshot()
  closeDb()
  if (process.platform !== 'darwin') app.quit()
})
