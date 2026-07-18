import {
  bookCodeFromName,
  parseCommentaryHeader,
  type HeaderParseState
} from '../../shared/scriptureRef'

/** One verse-keyed commentary excerpt, as produced by parseCommentaryMarkdown and persisted
 *  (after validation) to commentary_excerpts. `page` is always 0 for Markdown sources — there's
 *  no PDF page to jump back to; the excerpt text is already the full comment. */
export interface ExtractedChunk {
  headerRaw: string
  book: string
  chapterStart: number
  verseStart: number
  chapterEnd: number
  verseEnd: number
  text: string
  page: number
}

// Canonical commentary-Markdown format (see the conversion pipeline / docs):
//
//   # 1 Timothy            <- level-1 heading sets the current book (any recognized spelling)
//
//   ## 1:1-2               <- a heading whose text starts with a reference opens an excerpt;
//   Commentary text…          everything until the next heading is that excerpt's body.
//
//   ## 1:3 Some title      <- optional trailing title after the ref is ignored
//
//   # 2 Timothy            <- switches book
//   ## 2 Timothy 1:1       <- a full "Book chap:verse" heading also switches book + opens an excerpt
//
// Deliberately trivial and unambiguous: excerpt boundaries are explicit headings, never
// inferred from font/geometry — so unlike the PDF pipeline this can't mis-segment. Any
// non-heading line is body text for the excerpt currently open (or dropped as front matter
// before the first excerpt).

const HEADING_RE = /^(#{1,6})\s+(.*\S)\s*$/

/** Parse canonical commentary Markdown into verse-keyed chunks. Pure — no I/O — so it's
 *  directly unit-testable and reused by the indexer, which only supplies the file's text. */
export function parseCommentaryMarkdown(markdown: string): ExtractedChunk[] {
  const state: HeaderParseState = { book: null, chapter: null }
  const chunks: ExtractedChunk[] = []
  let current: ExtractedChunk | null = null

  const flush = (): void => {
    if (current) {
      current.text = current.text.trim()
      chunks.push(current)
      current = null
    }
  }

  for (const rawLine of markdown.split(/\r?\n/)) {
    const heading = HEADING_RE.exec(rawLine)
    if (!heading) {
      if (current) current.text += (current.text ? '\n' : '') + rawLine
      continue
    }

    const content = heading[2].trim()

    // A full "Book chap:verse[-…]" heading resets the book and opens an excerpt.
    const full = parseCommentaryHeader(content, { book: null, chapter: null }, 'book-chapter-verse')
    if (full) {
      flush()
      state.book = full.book
      state.chapter = full.chapterEnd
      current = openChunk(content, full)
      continue
    }

    // A bare "chap:verse[-…]" heading opens an excerpt against the current book.
    if (state.book) {
      const bare = parseCommentaryHeader(content, state, 'chapter-verse')
      if (bare) {
        flush()
        state.chapter = bare.chapterEnd
        current = openChunk(content, { ...bare, book: state.book })
        continue
      }
    }

    // Otherwise the heading is a book name ("# Matthew") — switch books.
    const code = bookCodeFromName(content)
    if (code) {
      flush()
      state.book = code
      state.chapter = null
      continue
    }

    // Unrecognized heading (a stray section title): end the current excerpt so its title text
    // doesn't leak into the previous verse, but don't open a new one.
    flush()
  }

  flush()
  return chunks
}

function openChunk(
  headerRaw: string,
  ref: { book: string; chapterStart: number; verseStart: number; chapterEnd: number; verseEnd: number }
): ExtractedChunk {
  return {
    headerRaw,
    book: ref.book,
    chapterStart: ref.chapterStart,
    verseStart: ref.verseStart,
    chapterEnd: ref.chapterEnd,
    verseEnd: ref.verseEnd,
    text: '',
    page: 0
  }
}
