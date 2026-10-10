import { parseLooseReferences, parseReference, refLabel } from '@shared/scriptureRef'
import type { ParsedRef } from '@shared/scriptureRef'
import { bocDocument, parseBocQuery } from '@shared/bookOfConcord'
import type { PageKind, TabContent, TabKind, TabLocation } from '../../store/workspace'

/** What picking an omnibox suggestion does. */
export type OmniAction =
  /** Show this location (in the current tab, or a new one with Alt+Enter). */
  | { type: 'open'; content: TabContent }
  /** A Confessions article: its section ordinal is looked up when it is opened. */
  | { type: 'boc'; code: string; article?: string; section?: string }
  /** The Bible or Confessions at the last-read place. */
  | { type: 'view'; view: 'bible' | 'confessions' | 'commentary' | 'dogmatics' }
  | { type: 'switch'; tabId: string }
  | { type: 'search'; query: string }

export interface Suggestion {
  action: OmniAction
  label: string
  /** Right-aligned hint: "Bible", "Switch to this tab", "Library", … */
  hint: string
  /** Which tab kind's icon to show; 'search' for the search row. */
  icon: TabKind | 'search'
}

export interface OmniData {
  /** Open tabs with their titles; `currentTabId` is left out of the matches. */
  tabs: { id: string; kind: TabKind; title: string }[]
  currentTabId: string | null
  bookmarks: { title: string; location: TabLocation }[]
  books: { id: string; title: string }[]
  notes: { path: string; title: string }[]
  /** Translation for parsed Bible references. */
  translation: string
}

const PAGES: { label: string; kind: PageKind }[] = [
  { label: 'Library', kind: 'library' },
  { label: 'Notes', kind: 'notes' },
  { label: 'Quotes', kind: 'quotesIndex' },
  { label: 'Church Fathers', kind: 'fathers' },
  { label: 'History', kind: 'history' },
  { label: 'Bookmarks', kind: 'bookmarks' },
  { label: 'Settings', kind: 'settings' }
]

const LIMITS = { bible: 3, boc: 3, tabs: 3, bookmarks: 3, titles: 5, total: 12 }

/**
 * How well `title` matches `q` (both compared case-insensitively): 0 = starts with it, 1 = a
 * word starts with it, 2 = contains it, 3 = contains every word of it; null = no match.
 */
export function matchScore(title: string, q: string): number | null {
  const t = title.toLowerCase()
  const s = q.trim().toLowerCase()
  if (!s) return null
  if (t.startsWith(s)) return 0
  if (t.split(/[\s\-–—:,.;()'"“”‘’/]+/).some((w) => w.startsWith(s))) return 1
  if (t.includes(s)) return 2
  const words = s.split(/\s+/).filter(Boolean)
  if (words.length > 1 && words.every((w) => t.includes(w))) return 3
  return null
}

function ranked<T>(items: T[], title: (t: T) => string, q: string, limit: number): T[] {
  return items
    .map((it) => ({ it, score: matchScore(title(it), q) }))
    .filter((x): x is { it: T; score: number } => x.score != null)
    .sort((a, b) => a.score - b.score || title(a.it).length - title(b.it).length)
    .slice(0, limit)
    .map((x) => x.it)
}

function bibleSuggestion(ref: ParsedRef, translation: string): Suggestion {
  const start = ref.verseStart
  const highlight =
    start != null ? Array.from({ length: (ref.verseEnd ?? start) - start + 1 }, (_, i) => start + i) : []
  return {
    action: {
      type: 'open',
      content: { kind: 'bible', book: ref.book, chapter: ref.chapter, highlight, translation }
    },
    label: refLabel(ref),
    hint: 'Bible',
    icon: 'bible'
  }
}

/**
 * The omnibox suggestion list for `query`, in Chrome's spirit: parsed references first (Bible,
 * then Confessions; a reference matched only by a book-name prefix comes after the Confessions,
 * so "ac 4" means the Augsburg Confession before Acts), then open tabs, bookmarks, books, notes
 * and views by title, and finally "Search Loci for …". Empty for a blank query.
 */
export function buildSuggestions(query: string, data: OmniData, opts: { searchFirst?: boolean } = {}): Suggestion[] {
  const q = query.trim()
  if (!q) return []
  const out: Suggestion[] = []

  const exact = parseReference(q)
  const loose = exact ? [] : parseLooseReferences(q, LIMITS.bible)
  if (exact) out.push(bibleSuggestion(exact, data.translation))

  const boc = parseBocQuery(q).slice(0, LIMITS.boc)
  for (const b of boc) {
    const doc = bocDocument(b.code)
    out.push({
      action: b.section
        ? { type: 'boc', code: b.code, section: b.section }
        : { type: 'boc', code: b.code, article: b.article },
      label: b.section
        ? `${doc?.title ?? b.code}, ${b.section}`
        : `${doc?.title ?? b.code}${b.article ? `, Article ${b.article}` : ''}`,
      hint: 'Confessions',
      icon: 'boc'
    })
  }
  for (const ref of loose) out.push(bibleSuggestion(ref, data.translation))

  // Title matches need two characters, as Chrome's history matches do.
  if (q.length >= 2) {
    const others = data.tabs.filter((t) => t.id !== data.currentTabId)
    for (const t of ranked(others, (t) => t.title, q, LIMITS.tabs)) {
      out.push({ action: { type: 'switch', tabId: t.id }, label: t.title, hint: 'Switch to this tab', icon: t.kind })
    }
    for (const b of ranked(data.bookmarks, (b) => b.title, q, LIMITS.bookmarks)) {
      out.push({ action: { type: 'open', content: b.location }, label: b.title, hint: 'Bookmark', icon: b.location.kind })
    }
    type TitleHit = { title: string; suggestion: Suggestion }
    const titled: TitleHit[] = [
      ...data.books.map((b) => ({
        title: b.title,
        suggestion: {
          action: { type: 'open', content: { kind: 'pdf', bookId: b.id } },
          label: b.title,
          hint: 'Library',
          icon: 'pdf'
        } satisfies Suggestion
      })),
      ...data.notes.map((n) => ({
        title: n.title,
        suggestion: {
          action: { type: 'open', content: { kind: 'note', notePath: n.path } },
          label: n.title,
          hint: 'Note',
          icon: 'note'
        } satisfies Suggestion
      })),
      { title: 'Bible', suggestion: { action: { type: 'view', view: 'bible' }, label: 'Bible', hint: 'Go to', icon: 'bible' } },
      {
        title: 'Confessions',
        suggestion: { action: { type: 'view', view: 'confessions' }, label: 'Confessions', hint: 'Go to', icon: 'boc' }
      },
      {
        title: 'Commentary',
        suggestion: { action: { type: 'view', view: 'commentary' }, label: 'Commentary', hint: 'Go to', icon: 'commentary' }
      },
      {
        title: 'Dogmatics',
        suggestion: { action: { type: 'view', view: 'dogmatics' }, label: 'Dogmatics', hint: 'Go to', icon: 'dogmatics' }
      },
      ...PAGES.map((p) => ({
        title: p.label,
        suggestion: { action: { type: 'open', content: { kind: p.kind } }, label: p.label, hint: 'Go to', icon: p.kind } satisfies Suggestion
      }))
    ]
    for (const hit of ranked(titled, (h) => h.title, q, LIMITS.titles)) out.push(hit.suggestion)
  }

  const capped = out.slice(0, LIMITS.total - 1)
  const search: Suggestion = { action: { type: 'search', query: q }, label: `Search Loci for “${q}”`, hint: '', icon: 'search' }
  // The New Tab page's box is a search box first: a plain query (no exact Bible or Confessions
  // reference) puts "Search Loci for …" on top, so Enter shows the results.
  if (opts.searchFirst && !exact && boc.length === 0) return [search, ...capped]
  capped.push(search)
  return capped
}
