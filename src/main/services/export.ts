import { BrowserWindow, dialog } from 'electron'
import { marked } from 'marked'
import { userInfo } from 'os'
import { join } from 'path'
import { writeFileSync, unlinkSync } from 'fs'
import { getDataDir } from '../db/connection'
import { readNote } from './notes'
import { buildBibliography } from './quotes'
import type { ExportOptions } from '../../shared/ipc'

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function inlineItalics(s: string): string {
  return escapeHtml(s).replace(/\*([^*]+)\*/g, '<em>$1</em>')
}

function stripFrontmatter(md: string): string {
  return md.replace(/^---\n[\s\S]*?\n---\n?/, '')
}

function noteTitle(md: string): string {
  const fm = md.match(/^---\n([\s\S]*?)\n---/)
  if (fm) {
    const m = fm[1].match(/^title:\s*(.+)$/m)
    if (m && m[1].trim()) return m[1].trim()
  }
  const h = md.match(/^#\s+(.+)$/m)
  return h ? h[1].trim() : 'Notes'
}

/** Markdown → HTML, with [[wiki-links]] flattened and in-app #tags dropped. */
function bodyHtml(md: string): string {
  const flattened = stripFrontmatter(md)
    .replace(/\[\[([^\]]+)\]\]/g, (_m, inner: string) => {
      const [target, alias] = inner.split('|')
      return (alias ?? target).split('#')[0].trim()
    })
    // Drop inline #tags (used only in-app for sorting/linking). Headings ("# ")
    // are untouched because a hashtag has no space after the '#'.
    .replace(/(^|[\s(])#([A-Za-z][\w-]+)\b/gm, '$1')
  return marked.parse(flattened, { async: false }) as string
}

const PRINT_CSS = `
  @page { size: A4; }
  * { box-sizing: border-box; }
  body { font-family: 'Crimson Pro', Georgia, 'Times New Roman', serif; color: #1b1b1b; font-size: 12pt; line-height: 1.55; margin: 0; }
  .cover { height: 9.2in; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; page-break-after: always; }
  .cover h1 { font-size: 30pt; margin: 0 0 10pt; font-weight: 600; }
  .cover .by { font-size: 14pt; margin: 4pt 0; color: #333; }
  .cover .date { color: #666; font-size: 12pt; }
  main { }
  h1, h2, h3 { font-weight: 600; line-height: 1.25; }
  blockquote { border-left: 3px solid #b88a3e; background: #faf5ea; margin: 12pt 0; padding: 7pt 14pt; color: #322f29; }
  blockquote p { margin: 4pt 0; }
  em { font-style: italic; }
  h2.biblio-h { border-top: 1px solid #ccc; padding-top: 12pt; margin-top: 22pt; }
  ol.biblio { font-size: 11pt; padding-left: 20pt; }
  ol.biblio li { margin-bottom: 8pt; }
  a { color: inherit; text-decoration: none; }
  img { max-width: 100%; }
`

function buildDoc(opts: ExportOptions, md: string): string {
  const title = noteTitle(md)
  const date = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
  const author = opts.author ?? userInfo().username
  let biblio = ''
  if (opts.includeBibliography) {
    const entries = buildBibliography()
    if (entries.length) {
      const items = entries.map((e) => `<li>${inlineItalics(e)}</li>`).join('')
      biblio = `<h2 class="biblio-h">Bibliography</h2><ol class="biblio">${items}</ol>`
    }
  }
  const by = author ? `<p class="by">Notes by ${escapeHtml(author)}</p>` : ''
  return `<!doctype html><html><head><meta charset="utf-8"><style>${PRINT_CSS}</style></head><body><section class="cover"><h1>${escapeHtml(
    title
  )}</h1>${by}<p class="date">${date}</p></section><main>${bodyHtml(md)}${biblio}</main></body></html>`
}

/** Render a note to a styled academic PDF via Electron's print engine. */
export async function exportNotePdf(opts: ExportOptions): Promise<string | null> {
  const md = readNote(opts.notePath)
  if (!md) return null

  const html = buildDoc(opts, md)
  const tmp = join(getDataDir(), 'export-temp.html')
  writeFileSync(tmp, html, 'utf-8')

  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true } })
  try {
    await win.loadFile(tmp)
    const pdf = await win.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      margins: { top: 0.8, bottom: 0.8, left: 0.9, right: 0.9 }
    })
    const safe = noteTitle(md).replace(/[^\w.-]+/g, '_').slice(0, 60) || 'notes'
    const res = await dialog.showSaveDialog({
      title: 'Export PDF',
      defaultPath: `${safe}.pdf`,
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    })
    if (res.canceled || !res.filePath) return null
    writeFileSync(res.filePath, pdf)
    return res.filePath
  } finally {
    win.destroy()
    try {
      unlinkSync(tmp)
    } catch {
      /* best effort */
    }
  }
}
