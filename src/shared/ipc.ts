// Shared IPC contract — imported by main, preload, and renderer.
// The renderer never touches Node/fs directly; everything goes through this surface.

export const Channels = {
  getAppState: 'app:getState',
  chooseFolder: 'dialog:chooseFolder',
  completeWizard: 'wizard:complete',
  unlock: 'auth:unlock',
  getConfig: 'config:get',
  setConfig: 'config:set',
  relocateVault: 'vault:relocate',
  getLayout: 'layout:get',
  setLayout: 'layout:set',
  getSession: 'session:get',
  setSession: 'session:set',
  setApiKey: 'secret:setApiKey',
  hasApiKey: 'secret:hasApiKey'
} as const

export type ChannelName = (typeof Channels)[keyof typeof Channels]

export type AiMode = 'copy-only' | 'copy-api'
export type LibraryView = 'grid' | 'list'

export interface RateCard {
  sonnetInput: number
  sonnetOutput: number
  haikuInput: number
  haikuOutput: number
}

/** Config exposed to the renderer — never includes the encrypted API key. */
export interface PublicConfig {
  setupComplete: boolean
  vaultPath: string | null
  pdfSourcePath: string | null
  backupPath: string | null
  scriptureTranslation: string
  aiMode: AiMode
  rateCard: RateCard
  hasApiKey: boolean
}

export interface AppState {
  setupComplete: boolean
  hasPassword: boolean
  vaultPath: string | null
  vaultExists: boolean
}

export interface WizardData {
  vaultPath: string
  pdfSourcePath: string
  backupPath: string
  password: string
}

export interface PanelLayout {
  leftWidth: number
  notesWidth: number
  resultsWidth: number
  leftCollapsed: boolean
  notesCollapsed: boolean
  activeLeftView: string
  activeRightTab: string
  coverSize: number
  libraryView: LibraryView
}

/** The typed bridge exposed on `window.loci`. */
export interface LociApi {
  getAppState(): Promise<AppState>
  chooseFolder(title: string): Promise<string | null>
  completeWizard(data: WizardData): Promise<AppState>
  unlock(password: string): Promise<boolean>
  getConfig(): Promise<PublicConfig>
  setConfig(patch: Partial<PublicConfig>): Promise<PublicConfig>
  relocateVault(): Promise<AppState>
  getLayout(): Promise<PanelLayout>
  setLayout(patch: Partial<PanelLayout>): Promise<void>
  getSession(key: string): Promise<string | null>
  setSession(key: string, value: string): Promise<void>
  setApiKey(key: string): Promise<boolean>
  hasApiKey(): Promise<boolean>
}
