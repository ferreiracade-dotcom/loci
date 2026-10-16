// Public-domain translations Loci ships; copyrighted API ones (ESV/NKJV/NASB) are session-only.
const CITEABLE_TRANSLATIONS = new Set(['BSB', 'BLB'])

/** True when passages of this translation may be stored as quotes/highlights. */
export function isCiteableTranslation(id: string): boolean {
  return CITEABLE_TRANSLATIONS.has(id)
}
