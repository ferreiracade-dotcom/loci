import { create } from 'zustand'
import { api } from '../lib/api'
import type { AppState, PanelLayout, PublicConfig, WizardData } from '@shared/ipc'

export type Phase = 'loading' | 'wizard' | 'locked' | 'ready'

interface Store {
  phase: Phase
  appState: AppState | null
  config: PublicConfig | null
  layout: PanelLayout | null

  init: () => Promise<void>
  unlock: (password: string) => Promise<boolean>
  completeWizard: (data: WizardData) => Promise<void>
  relocateVault: () => Promise<void>
  refreshConfig: () => Promise<void>

  /** Update layout in memory only (used during a drag). */
  setLayoutLocal: (patch: Partial<PanelLayout>) => void
  /** Update layout in memory and persist the patch immediately. */
  saveLayout: (patch: Partial<PanelLayout>) => void
  /** Persist the whole current layout (used at the end of a drag). */
  persistLayout: () => void
}

async function loadShellData(): Promise<{ config: PublicConfig; layout: PanelLayout }> {
  const [config, layout] = await Promise.all([api.getConfig(), api.getLayout()])
  return { config, layout }
}

export const useStore = create<Store>((set, get) => ({
  phase: 'loading',
  appState: null,
  config: null,
  layout: null,

  init: async () => {
    const appState = await api.getAppState()
    if (!appState.setupComplete) {
      set({ appState, phase: 'wizard' })
      return
    }
    const { config, layout } = await loadShellData()
    set({ appState, config, layout, phase: appState.hasPassword ? 'locked' : 'ready' })
  },

  unlock: async (password) => {
    const ok = await api.unlock(password)
    if (ok) {
      const { config, layout } = await loadShellData()
      set({ config, layout, phase: 'ready' })
    }
    return ok
  },

  completeWizard: async (data) => {
    const appState = await api.completeWizard(data)
    const { config, layout } = await loadShellData()
    set({ appState, config, layout, phase: 'ready' })
  },

  relocateVault: async () => {
    const appState = await api.relocateVault()
    const config = await api.getConfig()
    set({ appState, config })
  },

  refreshConfig: async () => {
    set({ config: await api.getConfig() })
  },

  setLayoutLocal: (patch) => {
    const layout = get().layout
    if (layout) set({ layout: { ...layout, ...patch } })
  },

  saveLayout: (patch) => {
    const layout = get().layout
    if (!layout) return
    set({ layout: { ...layout, ...patch } })
    void api.setLayout(patch)
  },

  persistLayout: () => {
    const layout = get().layout
    if (layout) void api.setLayout(layout)
  }
}))
