import type { VersificationTable } from '../../shared/versification'
import type { ExtractedChunk } from './commentaryMarkdown'

export interface ValidationResult {
  confidence: number
  flagged: boolean
  reasons: string[]
}

function wordCount(text: string): number {
  const trimmed = text.trim()
  return trimmed ? trimmed.split(/\s+/).length : 0
}

function maxVerseFor(versification: VersificationTable, book: string, chapter: number): number | null {
  const chapters = versification[book]
  if (!chapters || chapter < 1 || chapter > chapters.length) return null
  return chapters[chapter - 1]
}

/** Validate one extracted chunk against the previous one (sequence), a versification
 *  table (bounds), and the source's own median chunk length (size, self-relative since
 *  commentary verbosity varies wildly by author). `flagged` chunks are excluded from the
 *  reference sidebar until reviewed (Phase 4); the size check alone never flags, only
 *  lowers `confidence`. */
export function validateChunk(
  chunk: ExtractedChunk,
  prev: ExtractedChunk | null,
  versification: VersificationTable,
  sourceMedianWordCount: number
): ValidationResult {
  const reasons: string[] = []
  let flagged = false
  let confidence = 1

  // 1. Sequence check — verse references within a book should be non-decreasing. A book
  // change (or the very first chunk) has nothing to compare against.
  if (prev && prev.book === chunk.book) {
    const prevKey = prev.chapterStart * 1000 + prev.verseStart
    const curKey = chunk.chapterStart * 1000 + chunk.verseStart
    if (curKey < prevKey) {
      flagged = true
      reasons.push(
        `Out of sequence: ${chunk.chapterStart}:${chunk.verseStart} follows ${prev.chapterStart}:${prev.verseStart}`
      )
    }
  }

  // 2. Bounds check — verse numbers must exist in their chapter, per the versification table.
  // Unknown books/chapters (table gaps) are not flagged — absence of data isn't evidence of error.
  const startMax = maxVerseFor(versification, chunk.book, chunk.chapterStart)
  if (startMax != null && chunk.verseStart > startMax) {
    flagged = true
    reasons.push(`Verse ${chunk.verseStart} exceeds ${chunk.book} ${chunk.chapterStart}'s ${startMax} verses`)
  }
  const endMax = maxVerseFor(versification, chunk.book, chunk.chapterEnd)
  if (endMax != null && chunk.verseEnd > endMax) {
    flagged = true
    reasons.push(`Verse ${chunk.verseEnd} exceeds ${chunk.book} ${chunk.chapterEnd}'s ${endMax} verses`)
  }

  // 3. Size check — an outlier relative to this source's own median (self-relative, since
  // verbosity varies enormously by author). Lowers confidence only; never flags alone.
  const words = wordCount(chunk.text)
  if (words < 20) {
    confidence *= 0.6
    reasons.push(`Short excerpt (${words} words)`)
  } else if (sourceMedianWordCount > 0 && words > sourceMedianWordCount * 10) {
    confidence *= 0.6
    reasons.push(`Unusually long excerpt (${words} words, source median ${sourceMedianWordCount})`)
  }

  return { confidence, flagged, reasons }
}

export interface ValidatedChunk extends ExtractedChunk, ValidationResult {}

export interface CoverageSummary {
  booksCovered: string[]
  totalCount: number
  flaggedCount: number
  /** Chapters of a covered book with zero excerpts (only checked for chapters between the
   *  first and last chapter actually touched by this source, per book). */
  chaptersWithNoCoverage: { book: string; chapter: number }[]
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0
  const sorted = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/** Validate a whole source's freshly extracted chunks and compute a coverage summary,
 *  called between extraction and writing to the index. */
export function validateSource(
  chunks: ExtractedChunk[],
  versification: VersificationTable
): { chunks: ValidatedChunk[]; coverage: CoverageSummary } {
  const medianWords = median(chunks.map((c) => wordCount(c.text)))

  const validated: ValidatedChunk[] = []
  let prev: ExtractedChunk | null = null
  for (const chunk of chunks) {
    const result = validateChunk(chunk, prev, versification, medianWords)
    validated.push({ ...chunk, ...result })
    prev = chunk
  }

  const byBook = new Map<string, ExtractedChunk[]>()
  for (const c of chunks) byBook.set(c.book, [...(byBook.get(c.book) ?? []), c])

  const chaptersWithNoCoverage: { book: string; chapter: number }[] = []
  for (const [book, bookChunks] of byBook) {
    const chaptersTouched = new Set(bookChunks.flatMap((c) => [c.chapterStart, c.chapterEnd]))
    const min = Math.min(...chaptersTouched)
    const max = Math.max(...chaptersTouched)
    for (let ch = min; ch <= max; ch++) {
      if (!chaptersTouched.has(ch)) chaptersWithNoCoverage.push({ book, chapter: ch })
    }
  }

  return {
    chunks: validated,
    coverage: {
      booksCovered: [...byBook.keys()],
      totalCount: chunks.length,
      flaggedCount: validated.filter((c) => c.flagged).length,
      chaptersWithNoCoverage
    }
  }
}
