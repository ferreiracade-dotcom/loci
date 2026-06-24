import { contextBridge, ipcRenderer } from 'electron'
import { Channels } from '../shared/ipc'
import type { LociApi } from '../shared/ipc'

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
  hasApiKey: () => ipcRenderer.invoke(Channels.hasApiKey)
}

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('loci', api)
} else {
  // Fallback for the (unused) non-isolated case.
  ;(globalThis as unknown as { loci: LociApi }).loci = api
}
