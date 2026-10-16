import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { bookByCode } from '../../shared/scriptureRef'
import type { InterlinearChapter, InterlinearWord } from '../../shared/ipc'
import { bundledScriptureDir } from './scripture'

type InterlinearBook = Record<string, Record<string, InterlinearWord[]>>
const books = new Map<string, InterlinearBook>()

/** Load one book's interlinear lazily (cached); an empty book if missing/unreadable. */
function loadBook(code: string): InterlinearBook {
  const hit = books.get(code)
  if (hit) return hit
  let data: InterlinearBook = {}
  try {
    const path = join(bundledScriptureDir(), 'interlinear', code + '.json')
    if (existsSync(path)) data = JSON.parse(readFileSync(path, 'utf8')) as InterlinearBook
  } catch {
    data = {}
  }
  books.set(code, data)
  return data
}

/** Interlinear words for a chapter grouped by verse (ascending); null for an unknown book or a chapter outside the book (matches scripture.getChapter);
 *  an in-range chapter with no bundled data yields empty verses. */
export function getInterlinearChapter(book: string, chapter: number): InterlinearChapter | null {
  const def = bookByCode(String(book ?? ''))
  if (!def || !Number.isInteger(chapter) || chapter < 1 || chapter > def.chapters) return null
  const rows = loadBook(def.code)[String(chapter)] ?? {}
  const verses = Object.keys(rows)
    .map(Number)
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b)
    .map((verse) => ({ verse, words: rows[String(verse)] ?? [] }))
  return { book: def.code, chapter, verses }
}
