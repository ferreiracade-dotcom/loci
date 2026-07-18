import { documentCodeFromName, type BocDocumentCode } from '../../shared/bookOfConcord'

export interface BocSection {
  documentCode: BocDocumentCode
  ordinal: number
  number: string | null
  label: string
  part: string | null
  text: string
  headerRaw: string
}

const HEADING_RE = /^(#{1,6})\s+(?=\S)(.*)$/

export function parseBocMarkdown(markdown: string): BocSection[] {
  let document: BocDocumentCode | null = null
  const sections: BocSection[] = []
  let current: BocSection | null = null

  const flush = (): void => {
    if (current) { current.text = current.text.trim(); sections.push(current); current = null }
  }

  for (const rawLine of markdown.split(/\r?\n/)) {
    const heading = HEADING_RE.exec(rawLine)
    if (!heading) {
      if (current) current.text += (current.text ? '\n' : '') + rawLine
      continue
    }
    const level = heading[1].length
    const content = heading[2]

    if (level === 1) {
      flush()
      document = documentCodeFromName(content) ?? null
      continue
    }

    // level >= 2: try the pipe contract "ordinal | number | label | part".
    const parts = content.split('|').map((s) => s.trim())
    const ordinal = Number(parts[0])
    if (document && parts.length >= 3 && Number.isInteger(ordinal) && ordinal >= 1 && parts[2]) {
      flush()
      current = {
        documentCode: document,
        ordinal,
        number: parts[1] ? parts[1] : null,
        label: parts[2],
        part: parts[3] ? parts[3] : null,
        text: '',
        headerRaw: content
      }
      continue
    }

    // Non-contract heading (stray title, or no document set): end current, open nothing.
    flush()
  }

  flush()
  return sections
}
