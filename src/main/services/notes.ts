import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { getDb } from '../db/connection'
import { readConfig } from './config'
import type { BookNote } from '../../shared/ipc'

interface BookMetaRow {
  title: string
  title_sanitized: string
  author: string | null
}

/** Source-note path for a book, matching the convention used when quotes are captured. */
function bookNoteRelPath(sanitized: string): string {
  return `notes/${sanitized}/${sanitized}.md`
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
  // Guard against path traversal; notes always live under the vault.
  const abs = join(vault, relPath)
  if (!abs.startsWith(vault)) return
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, content, 'utf-8')
}
