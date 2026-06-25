import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'fs'
import { basename, dirname, join, relative } from 'path'
import { getDb } from '../db/connection'
import { readConfig } from './config'
import { sanitizeName } from './library'
import type { BookNote, LinkTarget, NoteSummary } from '../../shared/ipc'

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
      return { path: rel, title: titleFromContent(content, f.replace(/\.md$/i, '')) }
    })
    .sort((a, b) => a.title.localeCompare(b.title))
}

export function createStandaloneNote(title: string): NoteSummary {
  const vault = readConfig().vaultPath
  if (!vault) throw new Error('No vault')
  const clean = (title || 'Untitled').trim()
  const base = sanitizeName(clean)
  let rel = `notes/standalone/${base}.md`
  if (existsSync(join(vault, rel))) {
    rel = `notes/standalone/${base}-${Date.now().toString(36)}.md`
  }
  const abs = join(vault, rel)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, `---\ntitle: ${clean}\ntype: note\n---\n\n# ${clean}\n\n`, 'utf-8')
  return { path: rel, title: clean }
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
        title: titleFromContent(content, basename(abs, '.md'))
      })
    }
  }
  return out.sort((a, b) => a.title.localeCompare(b.title))
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
