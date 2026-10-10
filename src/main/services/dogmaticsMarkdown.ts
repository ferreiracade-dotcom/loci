/** One section of a dogmatic work, as produced by parseDogmaticsMarkdown and persisted to
 *  dogmatics_sections. Ordinals are 1-based positions in file order (the navigation keys);
 *  numbers and titles are what the edition prints, kept for display and citation. */
export interface DogmaticsSection {
  workOrdinal: number
  workTitle: string
  bookOrdinal: number
  bookNumber: string | null
  bookTitle: string
  sectionOrdinal: number
  sectionNumber: string | null
  sectionTitle: string
  text: string
}

// Dogmatics Markdown, read the way a commentary is (Bible book, chapter, verse):
//
//   # Loci Theologici              <- a work (the Bible-book level); a file may hold several
//
//   ## 1 On Holy Scripture         <- a book of the work (the chapter level): an optional
//                                     leading number, then its title
//
//   ### 1 Prooemium                <- a section (the verse level): an optional leading number
//   Text…                             (the edition's §), then an optional title; everything to
//                                     the next heading is its text
//
// Text under a book before its first section becomes an unnumbered section of its own (an
// introduction). Text before the first book is front matter and is dropped. Ordinals are
// assigned in file order, so the edition's own numbering (which may restart, skip or repeat)
// never decides where a section is shelved.

const HEADING_RE = /^(#{1,3})\s+(.*\S)\s*$/
const NUMBERED_RE = /^(?:§\s*)?(\d+[a-z]?)(?:[.:)]|\s|$)\s*(.*)$/i

/** "12 On the Church" -> { number: "12", title: "On the Church" }; "Preface" -> no number. */
export function splitNumber(heading: string): { number: string | null; title: string } {
  const m = NUMBERED_RE.exec(heading.trim())
  if (!m) return { number: null, title: heading.trim() }
  return { number: m[1], title: m[2].trim() }
}

export function parseDogmaticsMarkdown(markdown: string): DogmaticsSection[] {
  const sections: DogmaticsSection[] = []
  let work: { ordinal: number; title: string } | null = null
  let book: { ordinal: number; number: string | null; title: string } | null = null
  let workCount = 0
  let bookCount = 0
  let sectionCount = 0
  let current: DogmaticsSection | null = null

  const flush = (): void => {
    if (!current) return
    current.text = current.text.trim()
    if (current.text || current.sectionNumber || current.sectionTitle) sections.push(current)
    else sectionCount-- // an empty implicit introduction takes no ordinal
    current = null
  }

  const open = (number: string | null, title: string): DogmaticsSection | null => {
    if (!work || !book) return null
    sectionCount++
    return {
      workOrdinal: work.ordinal,
      workTitle: work.title,
      bookOrdinal: book.ordinal,
      bookNumber: book.number,
      bookTitle: book.title,
      sectionOrdinal: sectionCount,
      sectionNumber: number,
      sectionTitle: title,
      text: ''
    }
  }

  for (const rawLine of markdown.split(/\r?\n/)) {
    const heading = HEADING_RE.exec(rawLine)
    if (!heading) {
      if (!current && book && rawLine.trim()) current = open(null, '')
      if (current) current.text += (current.text ? '\n' : '') + rawLine
      continue
    }
    const level = heading[1].length
    const content = heading[2].trim()
    flush()
    if (level === 1) {
      workCount++
      bookCount = 0
      work = { ordinal: workCount, title: content }
      book = null
    } else if (level === 2) {
      if (!work) {
        // A book with no work heading: the file is one untitled work.
        workCount++
        work = { ordinal: workCount, title: '' }
      }
      bookCount++
      sectionCount = 0
      book = { ordinal: bookCount, ...splitNumber(content) }
    } else {
      const s = splitNumber(content)
      current = open(s.number, s.title)
    }
  }
  flush()
  return sections
}
