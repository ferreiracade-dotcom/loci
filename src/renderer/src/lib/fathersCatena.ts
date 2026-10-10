export interface CatenaTarget {
  /** USFM code. */
  book: string
  chapter: number
  /** null = the whole chapter. */
  verse: number | null
}

/**
 * Which passage the Fathers catena should show. A clicked verse (`commentaryLookup`, the same
 * trigger Bible commentary uses) wins — but only while it is still in the chapter the reader is
 * on; once the reader moves to another chapter the catena follows it at chapter level rather
 * than showing a stale verse. With nothing clicked and no Bible open there is no target.
 */
export function resolveCatenaTarget(
  lookup: { book: string; chapter: number; verse: number } | null,
  passage: { book: string; chapter: number } | null
): CatenaTarget | null {
  if (lookup && (!passage || (passage.book === lookup.book && passage.chapter === lookup.chapter))) {
    return { book: lookup.book, chapter: lookup.chapter, verse: lookup.verse }
  }
  if (passage) return { book: passage.book, chapter: passage.chapter, verse: null }
  return null
}
