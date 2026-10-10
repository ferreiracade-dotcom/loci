import { parseOsisRef } from '../../../shared/osis'

export interface PassageTarget {
  /** USFM code. */
  book: string
  chapter: number
  /** Verses to highlight in the chapter (empty = none). */
  highlight: number[]
}

/** Where a clicked `a.scripref[data-osis]` should open: the first passage of the osisRef, with its
 *  verses highlighted when it stays within one chapter. null if the value cannot be parsed. */
export function passageFromOsis(osis: string): PassageTarget | null {
  const parsed = parseOsisRef(osis)
  if (parsed.kind !== 'ok') return null
  const p = parsed.passages[0]
  const highlight: number[] = []
  if (p.verseStart !== null && p.chapterStart === p.chapterEnd) {
    const end = Math.min(p.verseEnd ?? p.verseStart, p.verseStart + 199)
    for (let v = p.verseStart; v <= end; v++) highlight.push(v)
  }
  return { book: p.book, chapter: p.chapterStart, highlight }
}
