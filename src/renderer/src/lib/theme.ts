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

function clampByte(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)))
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((v) => clampByte(v).toString(16).padStart(2, '0')).join('')
}

/** Darken (amount < 0) or lighten (amount > 0) a hex color. */
function shade(hex: string, amount: number): string {
  const { r, g, b } = hexToRgb(hex)
  const f = 1 + amount
  return rgbToHex(r * f, g * f, b * f)
}

/** Apply the accent color across the app's CSS variables, live. */
export function applyAccent(hex: string): void {
  const { r, g, b } = hexToRgb(hex)
  const s = document.documentElement.style
  s.setProperty('--accent', hex)
  s.setProperty('--accent-40', `rgba(${r}, ${g}, ${b}, 0.4)`)
  s.setProperty('--accent-12', `rgba(${r}, ${g}, ${b}, 0.12)`)
  s.setProperty('--gold', shade(hex, -0.28))
}
