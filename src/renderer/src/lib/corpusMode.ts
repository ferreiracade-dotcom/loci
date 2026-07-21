/** Which corpus a multi-mode reference panel is currently showing. */
export type CorpusMode = 'books' | 'bible' | 'confessions'

/** The five reference-panel pills. */
export type RefPill = 'quotes' | 'notes' | 'books' | 'texts' | 'commentary'

/** Modes each pill can offer. An empty list means the pill is single-mode and shows no switch. */
export const MODES_FOR_PILL: Record<RefPill, CorpusMode[]> = {
  quotes: ['books', 'bible', 'confessions'],
  notes: [],
  books: [],
  texts: ['bible', 'confessions'],
  commentary: ['bible', 'confessions']
}

/** The corpus implied by a focused centre tab, or null for tabs that have none. */
export function modeForTabKind(kind: string | undefined): CorpusMode | null {
  if (kind === 'pdf') return 'books'
  if (kind === 'bible') return 'bible'
  if (kind === 'boc') return 'confessions'
  return null
}

/** Which mode a pill shows: a usable pin wins, else follow the focused tab, else keep the
 *  pill's first mode. Never returns a mode the pill cannot offer. */
export function resolveCorpusMode(
  available: CorpusMode[],
  pinned: CorpusMode | null,
  focusedTabKind: string | undefined
): CorpusMode {
  if (pinned && available.includes(pinned)) return pinned
  const followed = modeForTabKind(focusedTabKind)
  if (followed && available.includes(followed)) return followed
  return available[0]
}

/** Legacy `activeRightTab` values, which are persisted in the database, mapped onto the new
 *  pills. Applied on read so an older stored value still resolves — no data migration. */
const LEGACY_TABS: Record<string, { pill: RefPill; mode: CorpusMode | null }> = {
  'book-notes': { pill: 'quotes', mode: 'books' },
  'scripture-highlights': { pill: 'quotes', mode: 'bible' },
  'standalone-notes': { pill: 'notes', mode: null },
  // The Backlinks panel is gone; Notes is the nearest surviving home.
  backlinks: { pill: 'notes', mode: null },
  'reference-pdf': { pill: 'books', mode: null },
  'reference-bible': { pill: 'texts', mode: 'bible' },
  'reference-boc': { pill: 'texts', mode: 'confessions' },
  commentary: { pill: 'commentary', mode: 'bible' },
  'boc-commentary': { pill: 'commentary', mode: 'confessions' }
}

const PILLS: RefPill[] = ['quotes', 'notes', 'books', 'texts', 'commentary']

export function migrateRightTabId(id: string): { pill: RefPill; mode: CorpusMode | null } {
  const legacy = LEGACY_TABS[id]
  if (legacy) return legacy
  if ((PILLS as string[]).includes(id)) return { pill: id as RefPill, mode: null }
  return { pill: 'quotes', mode: null }
}
