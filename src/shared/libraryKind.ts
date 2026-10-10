// Books vs articles: the folder a file lives in decides its kind. Pure string logic (no Node
// `path`) so main and renderer can share it and tests run without Electron.

import type { BookKind } from './ipc'

export interface KindRoots {
  /** `<vault>/pdfs`, or null when no vault is configured. */
  vaultPdfs: string | null
  /** The user's local PDF library folder, or null. */
  localLibrary: string | null
}

export const KIND_LABEL: Record<BookKind, string> = { book: 'Book', article: 'Article' }
export const KIND_PLURAL: Record<BookKind, string> = { book: 'Books', article: 'Articles' }

export function ofKind<T extends { kind: BookKind }>(items: T[], kind: BookKind): T[] {
  return items.filter((i) => i.kind === kind)
}

/** The path segments of `file` below `root`, or null when `file` is not strictly inside it.
 *  Compares case-insensitively and treats `\` and `/` alike (Windows paths). */
function segmentsUnder(file: string, root: string | null): string[] | null {
  if (!root) return null
  const f = file.replace(/\\/g, '/')
  const r = root.replace(/\\/g, '/').replace(/\/+$/, '')
  if (f.length <= r.length + 1) return null
  if (f.slice(0, r.length).toLowerCase() !== r.toLowerCase() || f[r.length] !== '/') return null
  return f
    .slice(r.length + 1)
    .split('/')
    .filter(Boolean)
}

const isArticlesDir = (s: string): boolean => s.toLowerCase() === 'articles'

/**
 * The kind a file's location implies, or null when it is under neither root (the id-named cache
 * copy, an external original). Vault: `pdfs/Articles/**` is an article, anything else a book.
 * Local library: a file below ANY directory named `Articles` (case-insensitive, any depth) is an
 * article; the file name itself never counts.
 */
export function kindFromPath(file: string, roots: KindRoots): BookKind | null {
  const v = segmentsUnder(file, roots.vaultPdfs)
  if (v) return v.length > 1 && isArticlesDir(v[0]) ? 'article' : 'book'
  const l = segmentsUnder(file, roots.localLibrary)
  if (l) return l.slice(0, -1).some(isArticlesDir) ? 'article' : 'book'
  return null
}
