// Church Fathers (CCEL ThML) — pure helpers shared by main, preload types and the renderer.

export type FathersSeries = 'anf' | 'npnf1' | 'npnf2'

/** Display label per series. NPNF uses the Chicago-style superscript series numeral. */
export const FATHERS_SERIES_LABEL: Record<FathersSeries, string> = {
  anf: 'ANF',
  npnf1: 'NPNF¹',
  npnf2: 'NPNF²'
}

/** Series ordering used wherever volumes are listed. */
export const FATHERS_SERIES_ORDER: FathersSeries[] = ['anf', 'npnf1', 'npnf2']

/** Decode a CCEL volume code: 'anf01' -> anf/1, 'npnf105' -> npnf1/5, 'npnf214' -> npnf2/14.
 *  Returns null for anything else (so stray files in the folder are ignored). */
export function parseFathersCode(code: string): { series: FathersSeries; number: number } | null {
  const c = code.trim().toLowerCase()
  const anf = /^anf(\d{2})$/.exec(c)
  if (anf) return { series: 'anf', number: Number(anf[1]) }
  const npnf = /^npnf([12])(\d{2})$/.exec(c)
  if (npnf) return { series: npnf[1] === '1' ? 'npnf1' : 'npnf2', number: Number(npnf[2]) }
  return null
}

/** "ANF 1", "NPNF¹ 14"; an unrecognised code is returned unchanged. */
export function fathersVolumeLabel(code: string): string {
  const p = parseFathersCode(code)
  return p ? `${FATHERS_SERIES_LABEL[p.series]} ${p.number}` : code
}
