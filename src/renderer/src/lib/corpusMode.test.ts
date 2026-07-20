import { describe, expect, it } from 'vitest'
import { modeForTabKind, resolveCorpusMode, migrateRightTabId, MODES_FOR_PILL } from './corpusMode'

describe('modeForTabKind', () => {
  it('maps centre tab kinds onto corpus modes', () => {
    expect(modeForTabKind('pdf')).toBe('books')
    expect(modeForTabKind('bible')).toBe('bible')
    expect(modeForTabKind('boc')).toBe('confessions')
  })
  it('returns null for kinds with no corpus', () => {
    expect(modeForTabKind('note')).toBeNull()
    expect(modeForTabKind('picker')).toBeNull()
    expect(modeForTabKind(undefined)).toBeNull()
  })
})

describe('resolveCorpusMode', () => {
  const both: ('bible' | 'confessions')[] = ['bible', 'confessions']

  it('follows the focused tab when nothing is pinned', () => {
    expect(resolveCorpusMode(both, null, 'boc')).toBe('confessions')
    expect(resolveCorpusMode(both, null, 'bible')).toBe('bible')
  })

  // The whole point of sticky: a pin must survive a tab change.
  it('keeps a pinned mode even when the focused tab says otherwise', () => {
    expect(resolveCorpusMode(both, 'bible', 'boc')).toBe('bible')
    expect(resolveCorpusMode(both, 'confessions', 'bible')).toBe('confessions')
  })

  it('ignores a pin the pill cannot offer', () => {
    // 'books' is not a Texts mode; fall back to following the tab.
    expect(resolveCorpusMode(both, 'books', 'boc')).toBe('confessions')
  })

  it('keeps the first available mode when the tab has no corpus', () => {
    expect(resolveCorpusMode(both, null, 'note')).toBe('bible')
    expect(resolveCorpusMode(both, null, undefined)).toBe('bible')
  })

  it('ignores a focused kind the pill cannot offer', () => {
    // A PDF is focused but Texts has no books mode — do not blank, keep the default.
    expect(resolveCorpusMode(both, null, 'pdf')).toBe('bible')
  })
})

describe('migrateRightTabId', () => {
  it('maps every legacy id to a surviving pill and mode', () => {
    expect(migrateRightTabId('book-notes')).toEqual({ pill: 'quotes', mode: 'books' })
    expect(migrateRightTabId('scripture-highlights')).toEqual({ pill: 'quotes', mode: 'bible' })
    expect(migrateRightTabId('standalone-notes')).toEqual({ pill: 'notes', mode: null })
    expect(migrateRightTabId('backlinks')).toEqual({ pill: 'notes', mode: null })
    expect(migrateRightTabId('reference-pdf')).toEqual({ pill: 'books', mode: null })
    expect(migrateRightTabId('reference-bible')).toEqual({ pill: 'texts', mode: 'bible' })
    expect(migrateRightTabId('reference-boc')).toEqual({ pill: 'texts', mode: 'confessions' })
    expect(migrateRightTabId('commentary')).toEqual({ pill: 'commentary', mode: 'bible' })
    expect(migrateRightTabId('boc-commentary')).toEqual({ pill: 'commentary', mode: 'confessions' })
  })

  it('passes through ids that are already new pills', () => {
    expect(migrateRightTabId('quotes')).toEqual({ pill: 'quotes', mode: null })
    expect(migrateRightTabId('texts')).toEqual({ pill: 'texts', mode: null })
  })

  it('falls back to quotes for an unknown id', () => {
    expect(migrateRightTabId('tags')).toEqual({ pill: 'quotes', mode: null })
    expect(migrateRightTabId('')).toEqual({ pill: 'quotes', mode: null })
  })

  it('offers a mode list for every pill, and single-mode pills offer none', () => {
    expect(MODES_FOR_PILL.texts).toEqual(['bible', 'confessions'])
    expect(MODES_FOR_PILL.commentary).toEqual(['bible', 'confessions'])
    expect(MODES_FOR_PILL.notes).toEqual([])
    expect(MODES_FOR_PILL.books).toEqual([])
  })
})
