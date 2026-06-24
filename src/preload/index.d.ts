import type { LociApi } from '../shared/ipc'

declare global {
  interface Window {
    loci: LociApi
  }
}

export {}
