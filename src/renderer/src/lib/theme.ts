import { DEFAULT_THEME, type ThemePalette } from '@shared/ipc'

export interface ThemePreset {
  id: string
  label: string
  theme: ThemePalette
}

/** Curated full-app themes (light, neutral dark, and a few coloured). */
export const THEME_PRESETS: ThemePreset[] = [
  { id: 'candlelit', label: 'Candlelit', theme: DEFAULT_THEME },
  {
    id: 'parchment',
    label: 'Parchment · Light',
    theme: {
      base: '#efe9dc',
      sidebar: '#e7e0cf',
      panel: '#f5f0e6',
      card: '#fffdf6',
      accent: '#a06a2c',
      gold: '#b48a52',
      text: '#2b2620',
      muted: '#837a66',
      border: '#dcd3c0',
      borderStrong: '#c7bca4'
    }
  },
  {
    id: 'mist',
    label: 'Mist · Light',
    theme: {
      base: '#eef1f4',
      sidebar: '#e4e8ee',
      panel: '#f4f6f9',
      card: '#ffffff',
      accent: '#3f6f9a',
      gold: '#6f86a0',
      text: '#23282f',
      muted: '#717a86',
      border: '#d6dce4',
      borderStrong: '#c1cad4'
    }
  },
  {
    id: 'onyx',
    label: 'Onyx · Dark',
    theme: {
      base: '#0a0a0b',
      sidebar: '#121214',
      panel: '#171719',
      card: '#1e1e21',
      accent: '#ededed',
      gold: '#8c8c92',
      text: '#f3f3f4',
      muted: '#8a8a90',
      border: '#242428',
      borderStrong: '#34343a'
    }
  },
  {
    id: 'slate',
    label: 'Slate · Dark',
    theme: {
      base: '#14161a',
      sidebar: '#1b1e24',
      panel: '#20242b',
      card: '#272c34',
      accent: '#84a0c6',
      gold: '#566884',
      text: '#dce2ec',
      muted: '#6a7280',
      border: '#2a3038',
      borderStrong: '#39414c'
    }
  },
  {
    id: 'jade',
    label: 'Jade · Dark',
    theme: {
      base: '#121613',
      sidebar: '#171d18',
      panel: '#1c241d',
      card: '#222c23',
      accent: '#84b08c',
      gold: '#517a5c',
      text: '#dde7de',
      muted: '#5e6c60',
      border: '#273028',
      borderStrong: '#36433a'
    }
  }
]

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  let h = hex.replace('#', '').trim()
  if (h.length === 3) {
    h = h
      .split('')
      .map((c) => c + c)
      .join('')
  }
  const n = parseInt(h, 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

/** Apply the full palette to the app's CSS variables, live. */
export function applyTheme(t: ThemePalette): void {
  const s = document.documentElement.style
  const baseRgb = hexToRgb(t.base)
  s.setProperty('--base-rgb', `${baseRgb.r}, ${baseRgb.g}, ${baseRgb.b}`)
  s.setProperty('--base', t.base)
  s.setProperty('--sidebar', t.sidebar)
  s.setProperty('--panel', t.panel)
  s.setProperty('--card', t.card)
  s.setProperty('--accent', t.accent)
  s.setProperty('--gold', t.gold)
  s.setProperty('--text', t.text)
  s.setProperty('--muted', t.muted)
  s.setProperty('--border', t.border)
  s.setProperty('--border-strong', t.borderStrong)
  const { r, g, b } = hexToRgb(t.accent)
  s.setProperty('--accent-40', `rgba(${r}, ${g}, ${b}, 0.4)`)
  s.setProperty('--accent-12', `rgba(${r}, ${g}, ${b}, 0.12)`)
}
