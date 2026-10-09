import { useStore } from '../../store/useStore'
import { api } from '../../lib/api'

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
