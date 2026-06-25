import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'fs'
import { basename, dirname, join, relative } from 'path'
import { getDb } from '../db/connection'
import { readConfig } from './config'
import { sanitizeName } from './library'
import * as search from './search'
import type { BookNote, LinkTarget, NoteSummary, NoteType, VaultHealth } from '../../shared/ipc'

const NOTE_TYPES: NoteType[] = ['note', 'page', 'chapter', 'topic', 'book-note']

function typeFromContent(content: string): NoteType {
  const fm = content.match(/^---\n([\s\S]*?)\n---/)
  if (fm) {
    const m = fm[1].match(/^type:\s*(.+)$/m)
    const t = m?.[1].trim() as NoteType | undefined
    if (t && NOTE_TYPES.includes(t)) return t
  }
  return 'note'
}

function parseTagList(s: string): string[] {
  const t = s.trim()
  if (!t) return []
  if (t.startsWith('[')) {
    return t
      .replace(/^\[|\]$/g, '')
      .split(',')
      .map((x) => x.trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean)
  }
  return t
    .split(/[\s,]+/)
    .map((x) => x.replace(/^#/, ''))
    .filter(Boolean)
}

function tagsFromContent(content: string): string[] {
  const fm = content.match(/^---\n([\s\S]*?)\n---/)
  if (!fm) return []
  const m = fm[1].match(/^tags:\s*(.*)$/m)
  return m ? parseTagList(m[1]) : []
}

interface BookMetaRow {
  title: string
  title_sanitized: string
  author: string | null
}

function bookNoteRelPath(sanitized: string): string {
  return `notes/${sanitized}/${sanitized}.md`
}

function titleFromContent(content: string, fallback: string): string {
  const fm = content.match(/^---\n([\s\S]*?)\n---/)
  if (fm) {
    const m = fm[1].match(/^title:\s*(.+)$/m)
    if (m && m[1].trim()) return m[1].trim()
  }
  const h = content.match(/^#\s+(.+)$/m)
  if (h) return h[1].trim()
  return fallback
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Read the book's source note, creating it (with frontmatter) if it doesn't exist. */
export function getBookNote(bookId: string): BookNote | null {
  const vault = readConfig().vaultPath
  const b = getDb()
    .prepare('SELECT title, title_sanitized, author FROM books WHERE id = ?')
    .get(bookId) as BookMetaRow | undefined
  if (!vault || !b) return null

  const rel = bookNoteRelPath(b.title_sanitized)
  const abs = join(vault, rel)
  if (!existsSync(abs)) {
    mkdirSync(dirname(abs), { recursive: true })
    const fm =
      `---\n` +
      `title: ${b.title.replace(/\r?\n/g, ' ')}\n` +
      `author: ${b.author ?? ''}\n` +
      `type: book-note\n` +
      `---\n\n# ${b.title}\n\n`
    writeFileSync(abs, fm, 'utf-8')
  }
  return { path: rel, content: readFileSync(abs, 'utf-8') }
}

export function saveNote(relPath: string, content: string): void {
  const vault = readConfig().vaultPath
  if (!vault) return
  const abs = join(vault, relPath)
  if (!abs.startsWith(vault)) return // guard against traversal
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, content, 'utf-8')
  search.indexNote(relPath, titleFromContent(content, basename(relPath, '.md')), content)
}

export function readNote(relPath: string): string {
  const vault = readConfig().vaultPath
  if (!vault) return ''
  const abs = join(vault, relPath)
  return existsSync(abs) ? readFileSync(abs, 'utf-8') : ''
}

// ---------- Standalone notes ----------

function standaloneDir(vault: string): string {
  return join(vault, 'notes', 'standalone')
}

export function listStandaloneNotes(): NoteSummary[] {
  const vault = readConfig().vaultPath
  if (!vault) return []
  const dir = standaloneDir(vault)
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith('.md'))
    .map((f) => {
      const rel = `notes/standalone/${f}`
      const content = readFileSync(join(vault, rel), 'utf-8')
      return {
        path: rel,
        title: titleFromContent(content, f.replace(/\.md$/i, '')),
        type: typeFromContent(content),
        tags: tagsFromContent(content)
      }
    })
    .sort((a, b) => a.title.localeCompare(b.title))
}

export function createStandaloneNote(title: string, type: NoteType = 'note'): NoteSummary {
  const vault = readConfig().vaultPath
  if (!vault) throw new Error('No vault')
  const clean = (title || 'Untitled').trim()
  const safeType: NoteType = NOTE_TYPES.includes(type) ? type : 'note'
  const base = sanitizeName(clean)
  let rel = `notes/standalone/${base}.md`
  if (existsSync(join(vault, rel))) {
    rel = `notes/standalone/${base}-${Date.now().toString(36)}.md`
  }
  const abs = join(vault, rel)
  mkdirSync(dirname(abs), { recursive: true })
  const content = `---\ntitle: ${clean}\ntype: ${safeType}\n---\n\n# ${clean}\n\n`
  writeFileSync(abs, content, 'utf-8')
  search.indexNote(rel, clean, content)
  return { path: rel, title: clean, type: safeType, tags: [] }
}

export function deleteNote(relPath: string): void {
  const vault = readConfig().vaultPath
  if (!vault) return
  const abs = join(vault, relPath)
  if (!abs.startsWith(vault) || !existsSync(abs)) return
  try {
    unlinkSync(abs)
  } catch {
    /* best effort */
  }
  search.removeNote(relPath)
}

// ---------- Links & backlinks ----------

function walkMd(dir: string): string[] {
  const out: string[] = []
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  for (const name of entries) {
    const full = join(dir, name)
    let isDir = false
    try {
      isDir = statSync(full).isDirectory()
    } catch {
      continue
    }
    if (isDir) out.push(...walkMd(full))
    else if (name.toLowerCase().endsWith('.md')) out.push(full)
  }
  return out
}

/** Notes that reference `target` via [[target]] / [[target|alias]] / [[target#sec]]. */
export function backlinks(target: string): NoteSummary[] {
  const vault = readConfig().vaultPath
  if (!vault || !target.trim()) return []
  const re = new RegExp(`\\[\\[\\s*${escapeRegex(target.trim())}\\s*(\\||#|\\]\\])`, 'i')
  const out: NoteSummary[] = []
  for (const abs of walkMd(join(vault, 'notes'))) {
    let content: string
    try {
      content = readFileSync(abs, 'utf-8')
    } catch {
      continue
    }
    if (re.test(content)) {
      out.push({
        path: relative(vault, abs).replace(/\\/g, '/'),
        title: titleFromContent(content, basename(abs, '.md')),
        type: typeFromContent(content),
        tags: tagsFromContent(content)
      })
    }
  }
  return out.sort((a, b) => a.title.localeCompare(b.title))
}

/** Scan the vault for stats and unresolved [[wiki-links]]. */
export function vaultHealth(): VaultHealth {
  const db = getDb()
  const vault = readConfig().vaultPath
  const books = (db.prepare('SELECT COUNT(*) AS n FROM books').get() as { n: number }).n
  const indexed = (db.prepare('SELECT COUNT(*) AS n FROM books WHERE indexed = 1').get() as { n: number }).n
  const quotes = (db.prepare('SELECT COUNT(*) AS n FROM quotes').get() as { n: number }).n

  const valid = new Set<string>()
  for (const b of db.prepare('SELECT title FROM books').all() as { title: string }[]) {
    valid.add(b.title.toLowerCase())
  }
  for (const n of listStandaloneNotes()) valid.add(n.title.toLowerCase())

  const brokenLinks: VaultHealth['brokenLinks'] = []
  let notes = 0
  if (vault) {
    const seen = new Set<string>()
    for (const abs of walkMd(join(vault, 'notes'))) {
      notes++
      let content: string
      try {
        content = readFileSync(abs, 'utf-8')
      } catch {
        continue
      }
      const source = relative(vault, abs).replace(/\\/g, '/')
      const sourceTitle = titleFromContent(content, basename(abs, '.md'))
      const re = /\[\[([^\]\n]+)\]\]/g
      let m: RegExpExecArray | null
      while ((m = re.exec(content))) {
        const link = m[1].split('|')[0].split('#')[0].trim()
        if (!link) continue
        const key = `${source}::${link.toLowerCase()}`
        if (seen.has(key)) continue
        seen.add(key)
        if (!valid.has(link.toLowerCase())) brokenLinks.push({ source, sourceTitle, link })
      }
    }
  }
  brokenLinks.sort((a, b) => a.link.localeCompare(b.link))
  return { books, notes, quotes, indexed, brokenLinks }
}

/** Resolve a [[name]] to a book or a standalone note, for navigation. */
export function resolveLink(name: string): LinkTarget {
  const clean = name.trim()
  if (!clean) return null
  const book = getDb()
    .prepare('SELECT id FROM books WHERE title = ? COLLATE NOCASE')
    .get(clean) as { id: string } | undefined
  if (book) return { type: 'book', id: book.id }
  const note = listStandaloneNotes().find((n) => n.title.toLowerCase() === clean.toLowerCase())
  if (note) return { type: 'note', path: note.path }
  return null
}
