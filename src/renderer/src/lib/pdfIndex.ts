import * as pdfjsLib from 'pdfjs-dist'
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { api } from './api'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

/** Load a book's PDF, extract per-page text, and send it to the FTS index.
 *  Yields to the UI periodically so a large book doesn't block rendering. */
export async function extractAndIndexBook(bookId: string, title: string): Promise<void> {
  const data = await api.getBookPdf(bookId)
  if (!data) return
  const doc = await pdfjsLib.getDocument({ data }).promise
  try {
    const pages: { page: number; text: string }[] = []
    for (let n = 1; n <= doc.numPages; n++) {
      const pg = await doc.getPage(n)
      const tc = await pg.getTextContent()
      pages.push({ page: n, text: tc.items.map((it) => ('str' in it ? it.str : '')).join(' ') })
      pg.cleanup()
      if (n % 25 === 0) await tick()
    }
    await api.indexBookText(bookId, title, pages)
  } finally {
    await doc.destroy()
  }
}
