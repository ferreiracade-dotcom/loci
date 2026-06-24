import type { LociApi } from '@shared/ipc'

// The typed bridge exposed by the preload script.
export const api: LociApi = window.loci
