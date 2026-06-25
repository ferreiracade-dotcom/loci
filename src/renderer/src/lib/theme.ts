import { type ThemePalette } from '@shared/ipc'

export interface AccentPreset {
  id: string
  label: string
  color: string
}

export const ACCENT_PRESETS: AccentPreset[] = [
  { id: 'amber', label: 'Amber', color: '#c9a96e' },
  { id: 'jade', label: 'Jade', color: '#7faa86' },
  { id: 'wine', label: 'Wine', color: '#b06a7a' },
  { id: 'slate', label: 'Slate', color: '#8793ad' }
]

/** Editable palette tokens, in display order. */
export const PALETTE_FIELDS: { key: keyof ThemePalette; label: string }[] = [
  { key: 'base', label: 'Background' },
  { key: 'sidebar', label: 'Sidebar' },
  { key: 'panel', label: 'Panel' },
  { key: 'card', label: 'Card' },
  { key: 'accent', label: 'Accent' },
  { key: 'gold', label: 'Gold' },
  { key: 'text', label: 'Text' },
  { key: 'muted', label: 'Muted text' },
  { key: 'border', label: 'Border' },
  { key: 'borderStrong', label: 'Strong border' }
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
