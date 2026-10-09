import { useStore } from '../../store/useStore'
import type { TabContent } from '../../store/useStore'
import { api } from '../../lib/api'
import { bocSectionMatches } from '@shared/bookOfConcord'
import { parseReference } from '@shared/scriptureRef'
import type { OmniAction } from './omnibox'

/**
 * Open the Bible in a new tab at the last-read chapter (a bookmark-style open: always a new
 * tab, or the focused New Tab page).
 */
export async function openBibleTab(): Promise<void> {
  const s = useStore.getState()
  let p = s.scripturePassage
  if (!p) {
    try {
      const last = await api.getSession('lastScripture')
      const parsed = last ? (JSON.parse(last) as { book?: string; chapter?: number }) : null
      if (parsed?.book && parsed.chapter) p = { book: parsed.book, chapter: parsed.chapter, highlight: [] }
    } catch {
      /* ignore malformed session value */
    }
  }
  p ??= { book: 'JHN', chapter: 1, highlight: [] }
  useStore.getState().openTab({
    kind: 'bible',
    book: p.book,
    chapter: p.chapter,
    highlight: [],
    translation: useStore.getState().scriptureTranslation
  })
  if (useStore.getState().scriptureTranslations.length === 0) void useStore.getState().loadScripture()
}

/** Open the Confessions in a new tab at the last-read section (AC 1 by default). */
export async function openConfessionsTab(): Promise<void> {
  let doc = { documentCode: 'AC', ordinal: 1 }
  try {
    const last = await api.getSession('lastBoc')
    if (last) {
      const p = JSON.parse(last) as { documentCode?: string; ordinal?: number }
      if (p.documentCode && p.ordinal != null) doc = { documentCode: p.documentCode, ordinal: p.ordinal }
    }
  } catch {
    /* ignore malformed session value */
  }
  useStore.getState().openTab({ kind: 'boc', documentCode: doc.documentCode, sectionOrdinal: doc.ordinal })
}

/** Where the Bible was last read (JHN 1 by default), as tab content. */
export async function lastBibleContent(): Promise<TabContent> {
  const s = useStore.getState()
  let p: { book: string; chapter: number } | null = s.scripturePassage
  if (!p) {
    try {
      const last = await api.getSession('lastScripture')
      const parsed = last ? (JSON.parse(last) as { book?: string; chapter?: number }) : null
      if (parsed?.book && parsed.chapter) p = { book: parsed.book, chapter: parsed.chapter }
    } catch {
      /* ignore malformed session value */
    }
  }
  p ??= { book: 'JHN', chapter: 1 }
  return { kind: 'bible', book: p.book, chapter: p.chapter, highlight: [], translation: s.scriptureTranslation }
}

/** Where the Confessions were last read (AC, first section, by default). */
export async function lastBocContent(): Promise<TabContent> {
  try {
    const last = await api.getSession('lastBoc')
    const p = last ? (JSON.parse(last) as { documentCode?: string; ordinal?: number }) : null
    if (p?.documentCode && p.ordinal != null) return { kind: 'boc', documentCode: p.documentCode, sectionOrdinal: p.ordinal }
  } catch {
    /* ignore malformed session value */
  }
  return { kind: 'boc', documentCode: 'AC', sectionOrdinal: 1 }
}

/**
 * The section ordinal for a Confessions article ("AC" + "IV"): looked up in the indexed
 * source's section list (numbers are kept verbatim there). Without an article, or when the
 * article isn't found, the document's first section.
 */
export async function resolveBocTarget(code: string, article?: string): Promise<TabContent> {
  const s = useStore.getState()
  const current = s.tabs.find((t) => t.id === s.activeTabId)
  let sourceId = current?.kind === 'boc' ? current.bocSourceId : undefined
  try {
    if (!sourceId) sourceId = (await api.listBocSources())[0]?.id
    if (sourceId) {
      const rows = await api.listBocDocumentSections(code, sourceId)
      const hit = article ? rows.find((r) => bocSectionMatches(r.number, article)) : undefined
      const ordinal = hit?.ordinal ?? rows[0]?.ordinal ?? 1
      return { kind: 'boc', documentCode: code, sectionOrdinal: ordinal, bocSourceId: sourceId }
    }
  } catch {
    /* fall through to the first section */
  }
  return { kind: 'boc', documentCode: code, sectionOrdinal: 1 }
}

/**
 * Show `content` in the focused tab (pushing its history), or in a new foreground tab. This is
 * what the omnibox's Enter / Alt+Enter do.
 */
export function navigateOrOpen(content: TabContent, newTab: boolean): void {
  const s = useStore.getState()
  if (newTab || !s.activeTabId) s.openTab(content, { forceNew: true })
  else s.navigateTab(s.activeTabId, content)
  if (content.kind === 'bible') {
    void api.setSession('lastScripture', JSON.stringify({ book: content.book, chapter: content.chapter }))
    if (s.scriptureTranslations.length === 0) void s.loadScripture()
  } else if (content.kind === 'boc') {
    void api.setSession('lastBoc', JSON.stringify({ documentCode: content.documentCode, ordinal: content.sectionOrdinal }))
  }
}

/** Carry out an omnibox suggestion. */
export async function runOmniAction(action: OmniAction, newTab: boolean): Promise<void> {
  const s = useStore.getState()
  switch (action.type) {
    case 'switch':
      s.focusTab(action.tabId)
      return
    case 'open':
      navigateOrOpen(action.content, newTab)
      return
    case 'view':
      navigateOrOpen(action.view === 'bible' ? await lastBibleContent() : await lastBocContent(), newTab)
      return
    case 'boc':
      navigateOrOpen(await resolveBocTarget(action.code, action.article), newTab)
      return
    case 'search':
      s.setSearchQuery(action.query)
      navigateOrOpen({ kind: 'newtab' }, newTab)
      return
  }
}

/** Ctrl+click or middle-click: Chrome's "open link in a background tab". */
export function isBackgroundClick(e: { ctrlKey: boolean; metaKey: boolean; button: number }): boolean {
  return e.ctrlKey || e.metaKey || e.button === 1
}

/** The last background tab opened from a tab, so the next one lands after it (as in Chrome). */
let lastChild: { opener: string; tabId: string } | null = null

/**
 * Open `content` in a background tab next to the focused one. Several opened in a row from the
 * same tab line up in the order they were opened, after it.
 */
export function openInBackground(content: TabContent): void {
  const s = useStore.getState()
  const opener = s.activeTabId
  const chained = lastChild && lastChild.opener === opener && s.tabs.some((t) => t.id === lastChild!.tabId)
  const tabId = s.openTab(content, { activate: false, forceNew: true, after: chained ? lastChild!.tabId : opener })
  lastChild = opener ? { opener, tabId } : null
}

/** Highlight list for a verse span. */
function verseSpan(start?: number, end?: number): number[] {
  if (start == null) return []
  return Array.from({ length: (end ?? start) - start + 1 }, (_, i) => start + i)
}

/** A Bible chapter (optionally verses) in a background tab. */
export function openBibleInBackground(book: string, chapter: number, highlight: number[] = []): void {
  const s = useStore.getState()
  openInBackground({ kind: 'bible', book, chapter, highlight, translation: s.scriptureTranslation })
  if (s.scriptureTranslations.length === 0) void s.loadScripture()
}

/** A typed Scripture reference ("Rom 3:28") in a background tab. */
export function openScriptureRefInBackground(raw: string): void {
  const ref = parseReference(raw)
  if (ref) openBibleInBackground(ref.book, ref.chapter, verseSpan(ref.verseStart, ref.verseEnd))
}

/** A [[wiki link]] target (book or note) in a background tab. */
export async function openLinkInBackground(name: string): Promise<void> {
  const target = await api.resolveLink(name)
  if (!target) return
  if (target.type === 'book') openInBackground({ kind: 'pdf', bookId: target.id })
  else openInBackground({ kind: 'note', notePath: target.path })
}

/**
 * A bookmark-style open: always a new tab (the owner's choice, see the spec's open question 1),
 * in the foreground at the end of the strip, or in the background next to the focused tab.
 */
export function openInNewTab(content: TabContent, background: boolean): void {
  const s = useStore.getState()
  if (background) openInBackground(content)
  else s.openTab(content, { forceNew: true, after: null, groupId: null })
  if (content.kind === 'bible' && s.scriptureTranslations.length === 0) void s.loadScripture()
}

/** The fixed views on the bookmarks bar. */
export type FixedView = 'bible' | 'confessions' | 'fathers' | 'library' | 'notes' | 'quotesIndex'

/** Where a fixed bookmarks-bar entry goes: the Bible and Confessions resume where you were. */
export async function fixedViewContent(view: FixedView): Promise<TabContent> {
  if (view === 'bible') return lastBibleContent()
  if (view === 'confessions') return lastBocContent()
  return { kind: view }
}
