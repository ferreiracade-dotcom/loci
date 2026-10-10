import { create } from 'zustand'
import { api } from '../lib/api'
import { applyTheme } from '../lib/theme'
import { extractAndIndexBook } from '../lib/pdfIndex'
import { BOOKS, parseReference } from '@shared/scriptureRef'
import { bocDocument } from '@shared/bookOfConcord'
import { DEFAULT_THEME } from '@shared/ipc'
import { parseNote, serializeFrontMatter } from '../lib/noteFrontmatter'
import type { CorpusMode, RefPill } from '../lib/corpusMode'
import type {
  Annotation,
  AppState,
  BackfillResult,
  Book,
  BookUpdate,
  BocCommentaryMatch,
  BocQuoteInput,
  CommentaryMatch,
  FathersQuoteInput,
  BookKind,
  ImportProgress,
  ImportResult,
  NewQuote,
  NewScriptureHighlight,
  NoteSummary,
  PanelLayout,
  ProjectItem,
  PublicConfig,
  NoteType,
  Quote,
  ScriptureTranslation,
  SearchHit,
  SearchKind,
  SearchScope,
  Shelf,
  Tag,
  ThemePalette,
  WizardData
} from '@shared/ipc'

export type Phase = 'loading' | 'wizard' | 'welcome' | 'ready'

import {
  EMPTY_WORKSPACE,
  closeOtherTabs as pureCloseOtherTabs,
  closeTab as pureCloseTab,
  closeTabsToRight as pureCloseTabsToRight,
  cycleTab as pureCycleTab,
  duplicateTab as pureDuplicateTab,
  findProjectTab,
  focusTab as pureFocusTab,
  goHistory as pureGoHistory,
  goToHistoryIndex as pureGoToHistoryIndex,
  focusedTab,
  isEmptyNewTab,
  openTab as pureOpenTab,
  parsePersistedWorkspace,
  reflectWorkspace,
  reopenClosedTab as pureReopenClosedTab,
  reorderTab as pureReorderTab,
  replaceTabContent as pureReplaceTabContent,
  sanitizeWorkspace,
  selectTabByNumber as pureSelectTabByNumber,
  serializeWorkspace,
  setPinned as pureSetPinned,
  setSplitRatio as pureSetSplitRatio,
  setTabContent as pureSetTabContent,
  sortedTabs,
  splitPartner,
  splitTabs as pureSplitTabs,
  unsplitTab as pureUnsplitTab,
  validateRestoredTabs
} from './workspace'
import type { ClosedTab, PageKind, Tab, TabContent, TabLocation, Workspace, QuoteGroupRef } from './workspace'
import {
  EMPTY_BOOKMARKS,
  addBookmark as pureAddBookmark,
  addFolder as pureAddFolder,
  editBookmark as pureEditBookmark,
  editFolder as pureEditFolder,
  moveNode as pureMoveNode,
  parseBookmarks,
  removeBookmark as pureRemoveBookmark,
  removeFolder as pureRemoveFolder,
  renameBookmark as pureRenameBookmark,
  toggleBookmark as pureToggleBookmark
} from './bookmarks'
import type { Bookmark, BookmarkFolder, Bookmarks } from './bookmarks'
import {
  addTabToGroup as pureAddTabToGroup,
  closeGroup as pureCloseGroup,
  createGroup as pureCreateGroup,
  deleteGroup as pureDeleteGroup,
  moveGroup as pureMoveGroup,
  moveTabTo as pureMoveTabTo,
  newTabInGroup as pureNewTabInGroup,
  openGroup as pureOpenGroup,
  parseGroups,
  reconcileGroups,
  removeTabFromGroup as pureRemoveTabFromGroup,
  serializeGroups,
  toggleGroupCollapsed as pureToggleGroupCollapsed,
  ungroup as pureUngroup,
  updateGroup as pureUpdateGroup
} from './tabGroups'
import type { GroupColor, GroupState, TabGroup } from './tabGroups'
import { createSequentialQueue } from '../lib/sequentialQueue'
import { commentaryStartContent, dogmaticsStartContent, fathersStartContent } from '../lib/readerStart'
import { diffItems, isEmptyChanges, stableJson } from '@shared/sync'
import type { DeviceTabs, SyncChanges, SyncItem, SyncKind, SyncSnapshot } from '@shared/sync'
import {
  bookmarksToItems,
  buildGroups,
  groupItems,
  itemsToBookmarks,
  mergeRemoteGroups,
  parseGroupItems
} from './syncModel'

export type {
  ClosedTab,
  PageKind,
  Tab,
  TabContent,
  TabLocation,
  Workspace,
  QuoteGroupRef,
  Bookmark,
  BookmarkFolder,
  Bookmarks,
  GroupColor,
  TabGroup
}
export { focusedTab, splitPartner }

/**
 * What is typed in each New Tab page's search box (by tab id), so the empty-New-Tab reuse rule
 * can tell an untouched page from one in use. Not persisted.
 */
export const newTabDrafts = new Map<string, string>()

/** Rewrite a project note's `items:` frontmatter line, preserving everything else. */
async function writeProjectItems(path: string, items: ProjectItem[]): Promise<void> {
  const raw = await api.readNote(path)
  const { fm, body } = parseNote(raw)
  fm.items = items
  await api.saveNote(path, `${serializeFrontMatter(fm)}\n\n${body}`)
}

function sameProjectItem(a: ProjectItem, b: ProjectItem): boolean {
  if (a.kind !== b.kind) return false
  if (a.kind === 'book' && b.kind === 'book') return a.id === b.id
  if (a.kind === 'note' && b.kind === 'note') return a.path === b.path
  if (a.kind === 'scripture' && b.kind === 'scripture') {
    return a.book === b.book && a.chapter === b.chapter
  }
  return false
}

const queuePersist = createSequentialQueue()

function persistWorkspace(ws: Workspace): void {
  const payload = serializeWorkspace(ws)
  queuePersist(() => api.setSession('workspace', payload))
}

const queueSync = createSequentialQueue()

/**
 * Bookmarks and tab groups sync between devices (see src/shared/sync.ts): main keeps this
 * device's records in the vault's `app/sync/<deviceId>/` and pushes the merged view of every
 * device's records. The renderer sends only what the user changed here. Nothing is sent before
 * init has read the merged view.
 */
let syncReady = false
let syncSeq = 0

/** Bookmark changes sent to main and not yet recorded (they win over a merged view meanwhile). */
const pendingBookmarks = new Map<string, { item: SyncItem | null; seq: number }>()

/** Group ids sent to main and not yet recorded. */
const pendingGroups = new Map<string, number>()

/** The last synced form of each group (sent from here or received), as stable JSON. */
let syncedGroups = new Map<string, string>()

function sendChanges(kind: SyncKind, changes: SyncChanges, onDone: (seq: number) => void): number {
  const seq = ++syncSeq
  queueSync(async () => {
    try {
      await api.syncPut(kind, changes)
    } catch (e) {
      console.error('[sync] could not record a change', e)
    } finally {
      onDone(seq)
    }
  })
  return seq
}

function sendBookmarkChanges(prev: Bookmarks, next: Bookmarks): void {
  if (!syncReady) return
  const changes = diffItems(bookmarksToItems(prev), bookmarksToItems(next))
  if (isEmptyChanges(changes)) return
  const seq = sendChanges('bookmarks', changes, (done) => {
    for (const [id, p] of pendingBookmarks) if (p.seq === done) pendingBookmarks.delete(id)
  })
  for (const it of changes.upserts) pendingBookmarks.set(it.id, { item: it, seq })
  for (const id of changes.deletes) pendingBookmarks.set(id, { item: null, seq })
}

/** The merged bookmarks with this device's unrecorded changes laid over them. */
function bookmarksWithPending(items: SyncItem[]): Bookmarks {
  const byId = new Map(items.map((i) => [i.id, i]))
  for (const [id, p] of pendingBookmarks) {
    if (p.item) byId.set(id, p.item)
    else byId.delete(id)
  }
  return itemsToBookmarks([...byId.values()])
}

function bookmarksFingerprint(b: Bookmarks): string {
  return stableJson(bookmarksToItems(b).sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0)))
}

let groupsTimer: ReturnType<typeof setTimeout> | null = null
let flushGroupSync: () => void = () => {}
let lastLocalGroups: string | null = null

/** Local (this device's) group state: open/collapsed and every saved tab's history. */
function localGroupsPayload(groups: TabGroup[], ws: Workspace): string {
  const parsed = JSON.parse(serializeGroups(groups, ws)) as { groups: unknown[] }
  return JSON.stringify({ version: 2, groups: parsed.groups, synced: [...syncedGroups.keys()] })
}

function parseLocalGroups(json: string | null): { groups: TabGroup[]; synced: Set<string> } | null {
  if (!json) return null
  try {
    const raw = JSON.parse(json) as { groups?: unknown; synced?: unknown }
    const groups = parseGroups(JSON.stringify({ groups: raw.groups }))
    const synced = new Set(Array.isArray(raw.synced) ? raw.synced.filter((x): x is string => typeof x === 'string') : [])
    return { groups, synced }
  } catch {
    return null
  }
}

/** Group changes are sent on a short debounce (an open group's tabs change with navigation). */
function scheduleGroupSync(immediate = false): void {
  if (groupsTimer) clearTimeout(groupsTimer)
  groupsTimer = null
  if (immediate) flushGroupSync()
  else groupsTimer = setTimeout(() => flushGroupSync(), 600)
}

/** Write any pending group change now (the window is closing). */
export function flushGroups(): void {
  if (groupsTimer) scheduleGroupSync(true)
}

/** Zoom steps, as Chrome's (percent). */
export const ZOOM_STEPS = [50, 67, 75, 80, 90, 100, 110, 125, 150, 175, 200]

interface Store {
  phase: Phase
  appState: AppState | null
  config: PublicConfig | null
  layout: PanelLayout | null

  books: Book[]
  shelves: Shelf[]
  tags: Tag[]
  activeShelf: string | null
  libraryBusy: boolean
  /** Transient status line (e.g. a startup library-sync summary), shown by the Shell. */
  toast: string | null
  importProgress: ImportProgress | null
  openBookId: string | null
  quotes: Quote[]
  /** Bumped when the open book's note changes on disk (e.g. a quote was captured). */
  noteReloadToken: number
  standaloneNotes: NoteSummary[]
  activeNotePath: string | null
  /** A standalone note opened for editing in the right Notes sidebar, or null. */
  sidebarNotePath: string | null
  /** Filter the standalone-notes list to a single tag, or null for all. */
  notesTagFilter: string | null
  /** Target page to jump to when (re)opening a book from search; consumed by the reader. */
  pendingPage: { bookId: string; page: number } | null
  indexing: { done: number; total: number } | null
  /** Progress of a whole-Bible (BSB) indexing pass, or null when idle. */
  bibleIndexing: { done: number; total: number } | null
  /**
   * Search results per query and scope (see `searchKey`), so two Search tabs open at once (say,
   * side by side in a split) each show their own results.
   */
  searches: Record<string, SearchEntry>
  /** Folded query tokens, used to flash-highlight matches when jumping to a page. */
  searchTerms: string[]
  /** Persisted search inputs so the bar survives moving between books. */
  searchKind: SearchKind
  searchShelf: string
  searchTag: string

  // --- Scripture (Phase 8) ---
  scriptureTranslations: ScriptureTranslation[]
  /** Selected translation id (mirrors config.scriptureTranslation). */
  scriptureTranslation: string
  /** The passage shown in the Bible reader, or null until first opened. */
  scripturePassage: { book: string; chapter: number; highlight: number[] } | null
  /** When true, a second translation column is shown beside the reader (compare view). */
  scriptureCompareOpen: boolean
  /** Second translation id for the compare column. */
  scriptureCompareTranslation: string
  /** The verse a commentary lookup ran against, or null before any verse has been clicked. */
  commentaryLookup: { book: string; chapter: number; verse: number } | null
  /** Results of that lookup, grouped by source in the reference sidebar. */
  commentaryMatches: CommentaryMatch[]
  /** The BoC section a commentary lookup ran against, or null before any section has been clicked.
   *  Carries the section's number/label because a commentary quote's citation needs them and they
   *  can't be recovered from the ordinal alone (see migration v19 as-built). */
  bocLookup: {
    documentCode: string
    ordinal: number
    sectionNumber: string | null
    sectionLabel: string
  } | null
  /** Results of that lookup, grouped by source in the reference sidebar. */
  bocMatches: BocCommentaryMatch[]
  /** The mode each multi-mode reference pill is pinned to. Absent = follow the focused tab.
   *  Mirrored to the session store under `refMode:<pill>`; deliberately NOT in PanelLayout,
   *  which is a database row. */
  refModes: Partial<Record<RefPill, CorpusMode>>
  /** A passage another surface (a Fathers scripture link) asked the Texts-pill Bible to show.
   *  A fresh object per request, so asking for the same passage twice still re-navigates. */
  refBibleTarget: { book: string; chapter: number; highlight: number[] } | null

  // --- Tab workspace (one Chrome-style strip) ---
  /** Every open tab, in strip order via `order`; the source of truth. */
  tabs: Tab[]
  /** The focused tab (the focused half, for a split). Feeds the derived context fields. */
  activeTabId: string | null
  /** Divider position per split id. */
  splitRatios: Record<string, number>
  /** Recently closed tabs, most recent last. */
  closedTabs: ClosedTab[]
  /** Bumped per tab by Reload (F5 / Ctrl+R) to remount its content. */
  reloadKeys: Record<string, number>
  /** Page zoom, percent. */
  zoom: number
  /** The Project note open in either pane, and its source collection, or null. */
  activeProject: { path: string; items: ProjectItem[] } | null
  /** Bookmarks (☆ / Ctrl+D) and their folders. */
  bookmarks: Bookmarks
  /** Saved tab groups, open and closed (tabs of open ones carry `groupId`). */
  groups: TabGroup[]
  /** Bookmarks bar visibility (Ctrl+Shift+B). Per device, not synced. */
  showBookmarksBar: boolean
  /** Other devices' open tabs ("Tabs from other devices" on the History page). */
  remoteDevices: DeviceTabs[]
  /** Fold in the merged bookmarks and tab groups main pushes after another device's changes. */
  applySync: (s: SyncSnapshot) => void

  init: () => Promise<void>
  enter: () => void
  setThemeColor: (key: keyof ThemePalette, value: string) => Promise<void>
  setTheme: (theme: ThemePalette) => Promise<void>
  resetTheme: () => Promise<void>
  completeWizard: (data: WizardData) => Promise<void>
  relocateVault: () => Promise<void>
  refreshConfig: () => Promise<void>

  setLayoutLocal: (patch: Partial<PanelLayout>) => void
  saveLayout: (patch: Partial<PanelLayout>) => void
  persistLayout: () => void

  setActiveShelf: (shelfId: string | null) => void
  setToast: (msg: string | null) => void
  openBook: (id: string) => void
  openBookAt: (id: string, page: number) => void
  clearPendingPage: () => void
  /** Jump the open book to a page and flash-highlight the given terms (in-book search). */
  jumpToBookPage: (bookId: string, page: number, terms: string[]) => void
  closeBook: () => void
  loadStandaloneNotes: () => Promise<void>
  createNote: (title: string, type?: NoteType) => Promise<void>
  openNote: (path: string) => void
  openNoteInSplit: (path: string) => void
  setNotesTagFilter: (tag: string | null) => void
  deleteNote: (path: string) => Promise<void>
  openSidebarNote: (path: string) => void
  closeSidebarNote: () => void
  navigateLink: (name: string) => Promise<void>
  loadQuotes: (bookId: string) => Promise<void>
  addQuote: (input: NewQuote) => Promise<void>
  setQuoteTags: (quoteId: string, tags: string[]) => Promise<void>
  setQuoteText: (quoteId: string, text: string) => Promise<void>
  deleteQuote: (quoteId: string) => Promise<void>
  /** Open a group of saved quotes (PDF / Bible chapter / commentary source) as a center pane. */
  openQuotesGroup: (group: QuoteGroupRef) => void
  /** Bump the shared reload token so quote panels/panes/nav re-fetch after an edit. */
  bumpReload: () => void
  refreshLibrary: () => Promise<void>
  importFromSource: () => Promise<ImportResult>
  importFiles: (kind?: BookKind) => Promise<ImportResult>
  updateBook: (id: string, patch: BookUpdate) => Promise<void>
  deleteBook: (id: string) => Promise<void>
  backfillLocal: () => Promise<BackfillResult>
  relinkBook: (id: string) => Promise<Book | null>
  setBookShelves: (id: string, shelfIds: string[]) => Promise<void>
  setBookTags: (id: string, tags: string[]) => Promise<void>
  setQuoteAnnotations: (quoteId: string, annotations: Annotation[]) => Promise<void>
  refetchMetadata: (id: string) => Promise<void>
  createShelf: (name: string) => Promise<void>
  renameShelf: (id: string, name: string) => Promise<void>
  deleteShelf: (id: string) => Promise<void>
  /** Persist a new display order for all shelves (full list of ids, in the desired order). */
  reorderShelves: (orderedIds: string[]) => Promise<void>
  /** Persist a new display order for all tags (full list of ids, in the desired order). */
  reorderTags: (orderedIds: string[]) => Promise<void>
  startIndexing: () => Promise<void>
  cancelIndexing: () => void
  /** Fetch and index every chapter of the BSB (public-domain) so the whole Bible is searchable. */
  startBibleIndexing: () => Promise<void>
  cancelBibleIndexing: () => void
  runSearch: (query: string, scope: SearchScope) => Promise<void>
  clearSearch: () => void
  setSearchKind: (k: SearchKind) => void
  setSearchShelf: (s: string) => void
  setSearchTag: (t: string) => void
  /** Mark the result the user opened in the search `key` (highlighted in its results list). */
  setActiveHit: (key: string, i: number | null, query?: string) => void

  loadScripture: () => Promise<void>
  setScriptureTranslation: (id: string) => void
  navigateScripture: (book: string, chapter: number, highlight?: number[]) => void
  /** A verse was clicked in any ScriptureReader instance — runs the commentary lookup and
   *  switches the reference sidebar to show it. */
  verseClicked: (book: string, chapter: number, verse: number) => Promise<void>
  /** Open/focus the Bible as a center pane (left-rail "Scripture" entry). */
  showScripture: () => Promise<void>
  /** Resolve a reference string and open it in a Bible pane beside the current pane. */
  openScripture: (ref: string) => Promise<void>
  toggleScriptureCompare: () => void
  setCompareTranslation: (id: string) => void
  addScriptureHighlight: (input: NewScriptureHighlight) => Promise<void>
  deleteScriptureHighlight: (id: string) => Promise<void>

  // --- Reference panel pins ---
  /** Pin a reference pill to a corpus mode. Persisted to the session store. */
  setRefMode: (pill: RefPill, mode: CorpusMode) => void
  /** Capture a selection from a Church Fathers section as a quote. */
  addFathersQuote: (input: FathersQuoteInput) => Promise<void>

  // --- Book of Concord (Confessions) ---
  /** Route a document/section into a BoC pane: reuse the existing BoC pane if there is one,
   *  otherwise open one. */
  navigateBoc: (documentCode: string, ordinal: number, bocSourceId?: string) => void
  /** A section was clicked in any BocReader instance — runs the commentary lookup and
   *  switches the reference sidebar to show it. */
  bocSectionClicked: (
    documentCode: string,
    ordinal: number,
    section?: { number: string | null; label: string }
  ) => Promise<void>
  /** Open/focus the Book of Concord as a center pane (left-rail "Confessions" entry). */
  showConfessions: () => Promise<void>
  /** Open (or focus) the commentary reader tab. With a target, the reader jumps there; without
   *  one it resumes the last-read chapter, else the first indexed source's first chapter. */
  showCommentary: (target?: { sourceId: string; book: string; chapter: number; verse?: number }) => Promise<void>
  /** Open (or focus) the dogmatics reader tab. With a target, the reader jumps there; without
   *  one it resumes where the user left off, else the first indexed source's first book. */
  showDogmatics: (target?: { sourceId: string; work: number; book: number; section?: number; topic?: string }) => Promise<void>
  addBocQuote: (input: BocQuoteInput) => Promise<void>
  /** Quote an excerpt from a BoC *commentary* source (anchored to the commentary source row,
   *  not the primary text — they live in separate tables). */
  addBocCommentaryQuote: (input: BocQuoteInput) => Promise<void>

  // --- Church Fathers ---
  /** Route a volume/section into a Fathers pane: reuse the focused or any existing Fathers tab,
   *  otherwise open one. */
  navigateFathers: (volumeCode: string, sectionId: string) => void
  /** Same routing, but to an author's page. */
  openFathersAuthor: (authorId: string) => void
  /** Open/focus the Fathers as a center pane (left-rail "Church Fathers" entry), resuming where
   *  the user left off. */
  showFathers: () => Promise<void>
  /** Show a passage in the Texts pill's Bible (a scripture link was clicked in a Father). */
  showPassageInTexts: (book: string, chapter: number, highlight?: number[]) => void

  // --- Tab workspace ---
  /**
   * Open content in a new tab and focus it; returns the tab id. By default it lands right after
   * the focused tab (`after: null` = end of strip). Like Chrome navigating from its New Tab page,
   * opening content while a New Tab page is focused fills that tab instead (`forceNew` opts out).
   */
  openTab: (
    content: TabContent,
    opts?: { activate?: boolean; after?: string | null; forceNew?: boolean; groupId?: string | null }
  ) => string
  /** Ctrl+T / "+": a New Tab page at the end of the strip. */
  newTab: (after?: string | null) => void
  /**
   * Open a page tab (Library, Notes, Settings, …) in a new tab, or in the focused tab when it is
   * an empty New Tab page. Settings, History and Bookmarks focus an existing one.
   */
  openPage: (kind: PageKind) => void
  /**
   * The empty-New-Tab reuse rule: when the focused tab is an empty New Tab page (nothing typed,
   * no history beyond itself), show `content` there and return true; otherwise do nothing.
   */
  fillEmptyNewTab: (content: TabContent) => boolean
  /** Open content in a new tab joined in a split with the focused tab. */
  openTabInSplit: (content: TabContent) => void
  closeTab: (tabId: string) => void
  closeOtherTabs: (tabId: string) => void
  closeTabsToRight: (tabId: string) => void
  reopenClosedTab: () => void
  duplicateTab: (tabId: string) => void
  setPinned: (tabId: string, pinned: boolean) => void
  /** Join two open tabs into a split view. */
  splitTabs: (a: string, b: string) => void
  unsplitTab: (tabId: string) => void
  /** Move a tab (and its split partner) to a strip position. */
  reorderTab: (tabId: string, targetIndex: number) => void
  setTabContent: (tabId: string, content: TabContent) => void
  /** Change a tab's current location without adding a history entry. */
  replaceTabContent: (tabId: string, content: TabContent) => void
  /** Turn a tab back into a New Tab page without closing it. */
  resetTabToNewTab: (tabId: string) => void
  focusTab: (tabId: string) => void
  cycleTab: (dir: 1 | -1) => void
  selectTabByNumber: (n: number) => void
  setSplitRatio: (splitId: string, r: number) => void
  /** Remount a tab's content (F5 / Ctrl+R); never reloads the window. */
  reloadTab: (tabId: string) => void
  /** Navigate a tab in place, pushing its history (same as setTabContent). */
  navigateTab: (tabId: string, content: TabContent) => void
  /** Back / Forward (Alt+Left / Alt+Right) in a tab's own history; defaults to the focused tab. */
  goBack: (tabId?: string) => void
  goForward: (tabId?: string) => void
  /** Jump to an entry of a tab's history (the Back/Forward dropdown). */
  goToHistoryIndex: (tabId: string, index: number) => void
  /** ☆ / Ctrl+D: bookmark a location, or remove its bookmark. Returns the new bookmark, if any. */
  toggleBookmark: (location: TabLocation, title: string) => Bookmark | null
  renameBookmark: (id: string, title: string) => void
  removeBookmark: (id: string) => void
  /** Add a bookmark (no duplicate per location) into a folder or the bar. */
  addBookmark: (location: TabLocation, title: string, parentId?: string) => Bookmark
  addBookmarkFolder: (title: string, parentId?: string) => BookmarkFolder
  /** Edit dialog: rename and/or move (parentId null = the bar). */
  editBookmark: (id: string, patch: { title?: string; parentId?: string | null }) => void
  editBookmarkFolder: (id: string, patch: { title?: string; parentId?: string | null }) => void
  removeBookmarkFolder: (id: string) => void
  /** Drag: move a bookmark or folder into a parent at an index. */
  moveBookmarkNode: (id: string, parentId: string | undefined, index: number) => void
  toggleBookmarksBar: () => void

  // --- Tab groups ---
  /** Put a tab (and its split partner) in a new group; returns the group id. */
  createGroup: (tabId: string) => string | null
  /** ⊞ "Create new tab group": a New Tab page in a new group. */
  createGroupWithNewTab: () => string | null
  addTabToGroup: (tabId: string, groupId: string) => void
  removeTabFromGroup: (tabId: string) => void
  updateGroup: (id: string, patch: Partial<Pick<TabGroup, 'name' | 'color' | 'pinnedToBar'>>) => void
  toggleGroupCollapsed: (id: string) => void
  /** Hide a group: its tabs are saved into it and leave the strip. */
  closeGroup: (id: string) => void
  /** Restore a closed group's tabs, or switch to an open one. */
  openGroup: (id: string) => void
  deleteGroup: (id: string) => void
  ungroup: (id: string) => void
  newTabInGroup: (id: string) => void
  /** Drag a group's label to a strip position (index into the strip without its tabs). */
  moveGroup: (id: string, targetIndex: number) => void
  /** Drag a tab to a strip position and into (or out of) a group. */
  moveTab: (tabId: string, targetIndex: number, groupId: string | null) => void
  /** Step zoom in (+1) / out (-1), or reset (0). */
  stepZoom: (dir: 1 | -1 | 0) => void
  /** Create a note and place it into a specific tab (used by the picker). */
  createNoteInTab: (id: string, title: string, type?: NoteType) => Promise<NoteSummary>

  // --- Project notes ---
  /** Recompute `activeProject` from the current panes; a no-op refetch if unchanged. */
  refreshActiveProject: () => Promise<void>
  addProjectItem: (item: ProjectItem) => Promise<void>
  removeProjectItem: (item: ProjectItem) => Promise<void>
}

/** One search's results, and the hit last opened from them. */
export interface SearchEntry {
  results: SearchHit[]
  activeHit: number | null
}

/** How many searches' results are kept (the oldest are dropped first). */
const MAX_SEARCHES = 20

/** The key a search's results are kept under: its query and scope. */
export function searchKey(query: string, scope: SearchScope): string {
  return JSON.stringify([
    query.trim(),
    scope.kind ?? 'all',
    scope.shelfId ?? '',
    scope.tag ?? '',
    scope.bookId ?? '',
    scope.items ?? null
  ])
}

/** `searches` with `key` set (moved to the newest position), capped at MAX_SEARCHES. */
export function withSearch(
  searches: Record<string, SearchEntry>,
  key: string,
  entry: SearchEntry
): Record<string, SearchEntry> {
  const next: Record<string, SearchEntry> = {}
  const keys = Object.keys(searches).filter((k) => k !== key)
  for (const k of keys.slice(Math.max(0, keys.length - (MAX_SEARCHES - 1)))) next[k] = searches[k]
  next[key] = entry
  return next
}

export function foldTokens(query: string): string[] {
  return (
    query
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .match(/[\p{L}\p{N}]+/gu) ?? []
  )
}

interface ShellData {
  config: PublicConfig
  layout: PanelLayout
  books: Book[]
  shelves: Shelf[]
  tags: Tag[]
  standaloneNotes: NoteSummary[]
}

async function loadAll(): Promise<ShellData> {
  const [config, layout, books, shelves, tags, standaloneNotes] = await Promise.all([
    api.getConfig(),
    api.getLayout(),
    api.listBooks(),
    api.listShelves(),
    api.listTags(),
    api.listStandaloneNotes()
  ])
  return { config, layout, books, shelves, tags, standaloneNotes }
}

export const useStore = create<Store>((set, get) => {
  let listenersBound = false
  let refreshTimer: ReturnType<typeof setTimeout> | null = null
  let lastRefresh = 0
  let indexCancel = false
  let bibleIndexCancel = false

  // Shared by navigateFathers / openFathersAuthor: the focused tab if it is already a Fathers tab,
  // else any existing Fathers tab, else a new one.
  const routeFathers = (content: TabContent): void => {
    const current = focusedTab(get())
    const existing = current?.kind === 'fathers' ? current : get().tabs.find((t) => t.kind === 'fathers')
    if (existing) {
      get().setTabContent(existing.id, content)
      get().focusTab(existing.id)
    } else {
      get().openTab(content)
    }
  }

  // Coalesce background "library changed" events into at most one refresh per 1.5s.
  const scheduleRefresh = (): void => {
    const since = Date.now() - lastRefresh
    if (since >= 1500) {
      lastRefresh = Date.now()
      void get().refreshLibrary()
    } else if (refreshTimer === null) {
      refreshTimer = setTimeout(() => {
        refreshTimer = null
        lastRefresh = Date.now()
        void get().refreshLibrary()
      }, 1500 - since)
    }
  }

  const currentWs = (): Workspace => {
    const { tabs, activeTabId, splitRatios, closedTabs } = get()
    return { tabs, activeTabId, splitRatios, closed: closedTabs }
  }

  flushGroupSync = (): void => {
    groupsTimer = null
    if (!syncReady) return
    const groups = get().groups
    const ws = currentWs()
    const items = groupItems(groups, ws)
    const upserts: SyncItem[] = []
    const live = new Set<string>()
    for (const item of items) {
      live.add(item.id)
      const json = stableJson(item)
      if (syncedGroups.get(item.id) === json) continue
      syncedGroups.set(item.id, json)
      upserts.push(item as unknown as SyncItem)
    }
    const deletes = [...syncedGroups.keys()].filter((id) => !live.has(id))
    for (const id of deletes) syncedGroups.delete(id)
    if (upserts.length || deletes.length) {
      const seq = sendChanges('tabGroups', { upserts, deletes }, (done) => {
        for (const [id, s] of pendingGroups) if (s === done) pendingGroups.delete(id)
      })
      for (const it of upserts) pendingGroups.set(it.id, seq)
      for (const id of deletes) pendingGroups.set(id, seq)
    }
    const local = localGroupsPayload(groups, ws)
    if (local !== lastLocalGroups) {
      lastLocalGroups = local
      queuePersist(() => api.setSession('tabGroupsLocal', local))
    }
  }

  // Apply a workspace change (and optionally new groups): enforce the group invariants, update
  // state + the reflected legacy fields, persist (sequenced, so an older write can never land
  // after a newer one), and refresh the project context.
  const commit = (proposed: Workspace, proposedGroups: TabGroup[] = get().groups): void => {
    const prev = currentWs()
    const prevGroups = get().groups
    const { ws: next, groups } = reconcileGroups(prev, proposed, proposedGroups)
    const wsSame =
      next.tabs === prev.tabs &&
      next.activeTabId === prev.activeTabId &&
      next.splitRatios === prev.splitRatios &&
      next.closed === prev.closed
    if (wsSame && groups === prevGroups) return
    set({
      tabs: next.tabs,
      activeTabId: next.activeTabId,
      splitRatios: next.splitRatios,
      closedTabs: next.closed,
      groups,
      ...reflectWorkspace(next)
    })
    if (!wsSame) persistWorkspace(next)
    scheduleGroupSync(groups !== prevGroups)
    if (next.tabs !== prev.tabs) void get().refreshActiveProject()
  }

  const groupState = (): GroupState => ({ ws: currentWs(), groups: get().groups })
  const commitGroups = (s: GroupState): void => commit(s.ws, s.groups)

  const setBookmarks = (bookmarks: Bookmarks): void => {
    const prev = get().bookmarks
    if (bookmarks === prev) return
    set({ bookmarks })
    sendBookmarkChanges(prev, bookmarks)
  }

  return {
    phase: 'loading',
    appState: null,
    config: null,
    layout: null,
    books: [],
    shelves: [],
    tags: [],
    activeShelf: null,
    libraryBusy: false,
    toast: null,
    importProgress: null,
    openBookId: null,
    quotes: [],
    noteReloadToken: 0,
    standaloneNotes: [],
    activeNotePath: null,
    sidebarNotePath: null,
    notesTagFilter: null,
    pendingPage: null,
    indexing: null,
    bibleIndexing: null,
    searches: {},
    searchTerms: [],
    searchKind: 'all',
    searchShelf: '',
    searchTag: '',
    scriptureTranslations: [],
    scriptureTranslation: '',
    scripturePassage: null,
    scriptureCompareOpen: false,
    scriptureCompareTranslation: '',
    commentaryLookup: null,
    commentaryMatches: [],
    bocLookup: null,
    bocMatches: [],
    refModes: {},
    refBibleTarget: null,
    tabs: [],
    activeTabId: null,
    splitRatios: {},
    closedTabs: [],
    reloadKeys: {},
    zoom: 100,
    activeProject: null,
    bookmarks: EMPTY_BOOKMARKS,
    groups: [],
    showBookmarksBar: true,
    remoteDevices: [],

    init: async () => {
      if (!listenersBound) {
        listenersBound = true
        api.onImportProgress((p) => set({ importProgress: p.phase === 'done' ? null : p }))
        api.onLibraryChanged(() => scheduleRefresh())
        api.onLibrarySynced((r) => {
          void get().refreshLibrary()
          if (r.added === 0 && r.removed === 0) return // nothing to announce on a no-op sync
          const parts: string[] = []
          if (r.added > 0) {
            const shown = r.titles.slice(0, 3).join(', ')
            const more = r.titles.length > 3 ? ` +${r.titles.length - 3} more` : ''
            parts.push(
              `Added ${r.added} book${r.added === 1 ? '' : 's'}${shown ? `: ${shown}${more}` : ''}`
            )
          }
          if (r.removed > 0) parts.push(`removed ${r.removed}`)
          set({ toast: `${parts.join(' · ')} · ${r.total} in library` })
        })
      }
      const appState = await api.getAppState()
      if (!appState.setupComplete) {
        set({ appState, phase: 'wizard' })
        return
      }
      const data = await loadAll()
      applyTheme(data.config.theme)
      // Restore the workspace (migrating the old two-pane format if that's what's stored):
      // validate every tab's reference against what's still in the library/notes list (a book
      // or note can be deleted while the app is closed), then sanitize focus/splits around
      // whatever survives. An empty strip gets a New Tab page, like Chrome.
      const restored = parsePersistedWorkspace(await api.getSession('workspace'))
      let workspace: Workspace = sanitizeWorkspace({
        ...restored,
        tabs: validateRestoredTabs(restored.tabs, data.books, data.standaloneNotes)
      })
      if (workspace.tabs.length === 0) {
        workspace = pureOpenTab(EMPTY_WORKSPACE, { kind: 'newtab' }).ws
      }
      // Bookmarks and saved groups sync between devices through the vault; whether a group is
      // open (and its tabs' histories) is this device's own state, kept in the session.
      const snapshot = await api.syncInit()
      const local =
        parseLocalGroups(await api.getSession('tabGroupsLocal')) ??
        // First start with sync: the pre-sync groups file seeds open/collapsed and histories,
        // and every group in it counts as already synced.
        (() => {
          const groups = parseGroups(snapshot.legacyTabGroups)
          return { groups, synced: new Set(groups.map((g) => g.id)) }
        })()
      let bookmarks = bookmarksWithPending(snapshot.bookmarks)
      const groupItemsIn = parseGroupItems(snapshot.tabGroups)
      const unsynced = new Set(local.groups.filter((g) => !local.synced.has(g.id)).map((g) => g.id))
      const grouped = buildGroups(groupItemsIn, local.groups, workspace, unsynced)
      workspace = grouped.ws
      syncedGroups = new Map(groupItemsIn.map((g) => [g.id, stableJson(g)]))
      syncReady = true
      // Phase 2 kept bookmarks in session_state: move them over once, if nothing synced yet.
      const sessionBookmarks = await api.getSession('bookmarks')
      if (sessionBookmarks && bookmarks.bookmarks.length === 0 && bookmarks.folders.length === 0) {
        const legacy = parseBookmarks(sessionBookmarks)
        sendBookmarkChanges(EMPTY_BOOKMARKS, legacy)
        bookmarks = legacy
        void api.setSession('bookmarks', '')
      }
      const showBookmarksBar = (await api.getSession('showBookmarksBar')) !== '0'
      const zoomRaw = Number(await api.getSession('zoom'))
      const zoom = ZOOM_STEPS.includes(zoomRaw) ? zoomRaw : 100
      if (zoom !== 100) api.setZoomFactor(zoom / 100)
      const reflected = reflectWorkspace(workspace)
      set({
        appState,
        ...data,
        tabs: workspace.tabs,
        activeTabId: workspace.activeTabId,
        splitRatios: workspace.splitRatios,
        closedTabs: workspace.closed,
        zoom,
        bookmarks,
        groups: grouped.groups,
        showBookmarksBar,
        remoteDevices: snapshot.devices,
        ...reflected,
        // Seed the selected translation from config so a Bible pane can render its
        // (offline-cached) text immediately, before the translation registry has resolved.
        scriptureTranslation: data.config.scriptureTranslation || 'BSB',
        pendingPage: null,
        phase: 'welcome'
      })
      scheduleGroupSync() // records groups made here but never recorded, and open-group drift
      const pins: Partial<Record<RefPill, CorpusMode>> = {}
      await Promise.all(
        (['quotes', 'texts', 'commentary'] as RefPill[]).map(async (pill) => {
          const v = await api.getSession(`refMode:${pill}`)
          if (v === 'books' || v === 'bible' || v === 'confessions' || v === 'fathers') pins[pill] = v
        })
      )
      set({ refModes: pins })
      void get().refreshActiveProject()
    },

    enter: () => set({ phase: 'ready' }),

    setThemeColor: async (key, value) => {
      const cfg = get().config
      if (!cfg) return
      const theme = { ...cfg.theme, [key]: value }
      applyTheme(theme)
      const config = await api.setConfig({ theme })
      set({ config })
    },

    setTheme: async (theme) => {
      applyTheme(theme)
      const config = await api.setConfig({ theme })
      set({ config })
    },

    resetTheme: async () => {
      applyTheme(DEFAULT_THEME)
      const config = await api.setConfig({ theme: DEFAULT_THEME })
      set({ config })
    },

    completeWizard: async (data) => {
      await api.completeWizard(data)
      // Load exactly as a normal start does: the session, plus the bookmarks and tab groups an
      // existing vault already holds. Starting from empty ones here would overwrite the vault's
      // copies (and, through the Drive sync, every other device's) on the first change.
      await get().init()
      set({ phase: 'ready' })
    },

    relocateVault: async () => {
      const appState = await api.relocateVault()
      set({ appState, config: await api.getConfig() })
    },

    refreshConfig: async () => {
      set({ config: await api.getConfig() })
    },

    setLayoutLocal: (patch) => {
      const layout = get().layout
      if (layout) set({ layout: { ...layout, ...patch } })
    },

    saveLayout: (patch) => {
      const layout = get().layout
      if (!layout) return
      set({ layout: { ...layout, ...patch } })
      void api.setLayout(patch)
    },

    persistLayout: () => {
      const layout = get().layout
      if (layout) void api.setLayout(layout)
    },

    setActiveShelf: (shelfId) => set({ activeShelf: shelfId }),

    setToast: (msg) => set({ toast: msg }),

    openBook: (id) => {
      get().openTab({ kind: 'pdf', bookId: id })
      set({ quotes: [], pendingPage: null })
      void api.setSession('lastOpenBook', id)
      void get().loadQuotes(id)
    },

    openBookAt: (id, page) => {
      get().openTab({ kind: 'pdf', bookId: id })
      set({
        quotes: [],
        pendingPage: { bookId: id, page },
        books: get().books.map((b) => (b.id === id ? { ...b, lastPage: page } : b))
      })
      void api.setBookLastPage(id, page)
      void api.setSession('lastOpenBook', id)
      void get().loadQuotes(id)
    },

    clearPendingPage: () => set({ pendingPage: null }),

    jumpToBookPage: (bookId, page, terms) =>
      set({ pendingPage: { bookId, page }, searchTerms: terms }),

    closeBook: () => {
      const pdf = get().tabs.find((t) => t.kind === 'pdf')
      if (pdf) get().closeTab(pdf.id)
      set({ quotes: [] })
      void api.setSession('lastOpenBook', '')
    },

    loadStandaloneNotes: async () => {
      set({ standaloneNotes: await api.listStandaloneNotes() })
    },

    createNote: async (title, type) => {
      const note = await api.createNote(title, type)
      await get().loadStandaloneNotes()
      get().openTab({ kind: 'note', notePath: note.path })
    },

    openNote: (path) => {
      get().openTab({ kind: 'note', notePath: path })
    },

    openNoteInSplit: (path) => {
      get().openTabInSplit({ kind: 'note', notePath: path })
    },

    setNotesTagFilter: (tag) => set({ notesTagFilter: tag }),

    deleteNote: async (path) => {
      await api.deleteNote(path)
      // Close any tab showing this note; clear the sidebar note if it matches.
      for (const t of get().tabs.filter((t) => t.kind === 'note' && t.notePath === path)) {
        get().closeTab(t.id)
      }
      if (get().sidebarNotePath === path) {
        set({ sidebarNotePath: null })
        void api.setSession('sidebarNote', '')
      }
      await get().loadStandaloneNotes()
    },

    openSidebarNote: (path) => {
      set({ sidebarNotePath: path })
      void api.setSession('sidebarNote', path)
    },

    closeSidebarNote: () => {
      set({ sidebarNotePath: null })
      void api.setSession('sidebarNote', '')
    },

    navigateLink: async (name) => {
      const target = await api.resolveLink(name)
      if (!target) return
      if (target.type === 'book') get().openBook(target.id)
      else get().openNote(target.path)
    },

    loadQuotes: async (bookId) => {
      const quotes = await api.listQuotes(bookId)
      if (get().openBookId === bookId) set({ quotes })
    },

    addQuote: async (input) => {
      await api.addQuote(input)
      await get().loadQuotes(input.bookId)
      await get().refreshLibrary()
      set({ noteReloadToken: get().noteReloadToken + 1 })
    },

    setQuoteTags: async (quoteId, tags) => {
      await api.setQuoteTags(quoteId, tags)
      const id = get().openBookId
      if (id) await get().loadQuotes(id)
    },

    setQuoteText: async (quoteId, text) => {
      await api.setQuoteText(quoteId, text)
      set({
        quotes: get().quotes.map((q) => (q.id === quoteId ? { ...q, text } : q)),
        // Bump so open quote panes / the reference panels reload with the new text.
        noteReloadToken: get().noteReloadToken + 1
      })
    },

    openQuotesGroup: (group) => {
      get().openTab({ kind: 'quotes', quotesGroup: group })
    },

    bumpReload: () => set({ noteReloadToken: get().noteReloadToken + 1 }),

    setQuoteAnnotations: async (quoteId, annotations) => {
      await api.setQuoteAnnotations(quoteId, annotations)
      // Update in place so the panel doesn't lose scroll/focus.
      set({
        quotes: get().quotes.map((q) => (q.id === quoteId ? { ...q, annotations } : q))
      })
    },

    deleteQuote: async (quoteId) => {
      await api.deleteQuote(quoteId)
      const id = get().openBookId
      if (id) await get().loadQuotes(id)
      await get().refreshLibrary()
      set({ noteReloadToken: get().noteReloadToken + 1 })
    },

    refreshLibrary: async () => {
      const [books, shelves, tags] = await Promise.all([
        api.listBooks(),
        api.listShelves(),
        api.listTags()
      ])
      set({ books, shelves, tags })
    },

    importFromSource: async () => {
      set({ libraryBusy: true })
      try {
        const result = await api.importFromSource()
        await get().refreshLibrary()
        return result
      } finally {
        set({ libraryBusy: false })
      }
    },

    importFiles: async (kind) => {
      set({ libraryBusy: true })
      try {
        const result = await api.importFiles(kind)
        await get().refreshLibrary()
        return result
      } finally {
        set({ libraryBusy: false })
      }
    },

    updateBook: async (id, patch) => {
      await api.updateBook(id, patch)
      await get().refreshLibrary()
    },

    deleteBook: async (id) => {
      await api.deleteBook(id)
      await get().refreshLibrary()
    },

    backfillLocal: async () => {
      const res = await api.backfillLocal()
      await get().refreshLibrary()
      return res
    },

    relinkBook: async (id) => {
      const book = await api.relinkBook(id)
      if (book) await get().refreshLibrary()
      return book
    },

    setBookShelves: async (id, shelfIds) => {
      await api.setBookShelves(id, shelfIds)
      await get().refreshLibrary()
    },

    setBookTags: async (id, tags) => {
      await api.setBookTags(id, tags)
      await get().refreshLibrary()
    },

    refetchMetadata: async (id) => {
      set({ libraryBusy: true })
      try {
        await api.refetchMetadata(id)
        await get().refreshLibrary()
      } finally {
        set({ libraryBusy: false })
      }
    },

    createShelf: async (name) => {
      await api.createShelf(name)
      await get().refreshLibrary()
    },

    renameShelf: async (id, name) => {
      await api.renameShelf(id, name)
      await get().refreshLibrary()
    },

    deleteShelf: async (id) => {
      await api.deleteShelf(id)
      if (get().activeShelf === id) set({ activeShelf: null })
      await get().refreshLibrary()
    },

    reorderShelves: async (orderedIds) => {
      // Optimistic: the caller already knows the desired order, so reflect it immediately
      // rather than waiting on a round trip before the UI updates.
      const byId = new Map(get().shelves.map((s) => [s.id, s]))
      const shelves = orderedIds.map((id) => byId.get(id)).filter((s): s is Shelf => !!s)
      set({ shelves })
      await api.reorderShelves(orderedIds)
    },

    reorderTags: async (orderedIds) => {
      const byId = new Map(get().tags.map((t) => [t.id, t]))
      const tags = orderedIds.map((id) => byId.get(id)).filter((t): t is Tag => !!t)
      set({ tags })
      await api.reorderTags(orderedIds)
    },

    startIndexing: async () => {
      if (get().indexing) return
      indexCancel = false
      const pending = await api.unindexedBooks()
      if (pending.length === 0) {
        set({ indexing: { done: 0, total: 0 } })
        setTimeout(() => set({ indexing: null }), 1800)
        return
      }
      set({ indexing: { done: 0, total: pending.length } })
      for (let i = 0; i < pending.length; i++) {
        if (indexCancel) break
        set({ indexing: { done: i, total: pending.length } })
        try {
          await extractAndIndexBook(pending[i].id, pending[i].title)
        } catch {
          /* skip unreadable book */
        }
        await new Promise((r) => setTimeout(r, 20)) // let the UI breathe between books
      }
      set({ indexing: null })
      await get().refreshLibrary()
    },

    cancelIndexing: () => {
      indexCancel = true
    },

    startBibleIndexing: async () => {
      if (get().bibleIndexing) return
      bibleIndexCancel = false
      const total = BOOKS.reduce((sum, b) => sum + b.chapters, 0)
      set({ bibleIndexing: { done: 0, total } })
      let done = 0
      chapters: for (const b of BOOKS) {
        for (let c = 1; c <= b.chapters; c++) {
          if (bibleIndexCancel) break chapters
          try {
            const passage = await api.getScriptureChapter('BSB', b.code, c)
            if (passage) {
              await api.indexScriptureChapter('BSB', b.code, c, passage.reference, passage.verses)
            }
          } catch {
            /* skip a chapter that fails to fetch — the pass can be re-run later */
          }
          done++
          set({ bibleIndexing: { done, total } })
          // Already-cached chapters return almost instantly; this only meaningfully throttles
          // the (much slower) network fetches on a fresh pass, to stay a polite API citizen.
          await new Promise((r) => setTimeout(r, 40))
        }
      }
      set({ bibleIndexing: null })
    },

    cancelBibleIndexing: () => {
      bibleIndexCancel = true
    },

    runSearch: async (query, scope) => {
      const key = searchKey(query, scope)
      if (!query.trim()) {
        set((s) => ({ searches: withSearch(s.searches, key, { results: [], activeHit: null }) }))
        return
      }
      const results = await api.search(query, scope)
      // Keyed by query and scope: a slower search for another tab can't replace these results.
      set((s) => ({
        searches: withSearch(s.searches, key, { results, activeHit: null }),
        searchTerms: foldTokens(query)
      }))
    },

    clearSearch: () => set({ searches: {}, searchTerms: [] }),

    setSearchKind: (k) => set({ searchKind: k }),
    setSearchShelf: (s) => set({ searchShelf: s }),
    setSearchTag: (t) => set({ searchTag: t }),
    setActiveHit: (key, i, query) =>
      set((s) => {
        const entry = s.searches[key]
        if (!entry) return {}
        return {
          searches: { ...s.searches, [key]: { ...entry, activeHit: i } },
          ...(query !== undefined ? { searchTerms: foldTokens(query) } : {})
        }
      }),

    loadScripture: async () => {
      const translations = await api.listScriptureTranslations()
      const want = get().config?.scriptureTranslation ?? ''
      const translation = translations.some((t) => t.id === want)
        ? want
        : (translations[0]?.id ?? '')
      let passage = get().scripturePassage
      if (!passage) {
        const last = await api.getSession('lastScripture')
        if (last) {
          try {
            const p = JSON.parse(last) as { book?: string; chapter?: number }
            if (p.book && p.chapter) passage = { book: p.book, chapter: p.chapter, highlight: [] }
          } catch {
            /* ignore malformed session value */
          }
        }
        if (!passage) passage = { book: 'JHN', chapter: 1, highlight: [] }
      }
      // Restore the compare column (second translation + open flag) from the session.
      let compareOpen = get().scriptureCompareOpen
      let compareTranslation = get().scriptureCompareTranslation
      if (!compareTranslation) {
        const lastCompare = (await api.getSession('lastScriptureCompare')) ?? ''
        compareTranslation = translations.some((t) => t.id === lastCompare)
          ? lastCompare
          : (translations.find((t) => t.id !== translation)?.id ?? translation)
      }
      if (!compareOpen) compareOpen = (await api.getSession('scriptureCompareOpen')) === '1'
      set({
        scriptureTranslations: translations,
        scriptureTranslation: translation,
        scripturePassage: passage,
        scriptureCompareOpen: compareOpen,
        scriptureCompareTranslation: compareTranslation
      })
    },

    setScriptureTranslation: (id) => {
      set({ scriptureTranslation: id })
      const cfg = get().config
      if (cfg) set({ config: { ...cfg, scriptureTranslation: id } })
      void api.setConfig({ scriptureTranslation: id })
    },

    // In-place navigation, like clicking a link in a browser tab: if the active tab is already
    // showing the Bible, it navigates there. Only explicit "open" actions create a new tab.
    navigateScripture: (book, chapter, highlight = []) => {
      const { scriptureTranslation } = get()
      const current = focusedTab(get())
      if (current?.kind === 'bible') {
        get().setTabContent(current.id, {
          kind: 'bible',
          book,
          chapter,
          highlight,
          translation: current.translation || scriptureTranslation
        })
      } else {
        get().openTab({ kind: 'bible', book, chapter, highlight, translation: scriptureTranslation })
      }
      void api.setSession('lastScripture', JSON.stringify({ book, chapter }))
    },

    verseClicked: async (book, chapter, verse) => {
      set({ commentaryLookup: { book, chapter, verse }, commentaryMatches: [] })
      const matches = await api.lookupCommentary(book, chapter, verse)
      // A later click may have landed while this lookup was in flight — don't overwrite it.
      const stillCurrent = get().commentaryLookup
      const stale =
        stillCurrent?.book !== book || stillCurrent?.chapter !== chapter || stillCurrent?.verse !== verse
      if (stale) return
      set({ commentaryMatches: matches })
      get().saveLayout({ activeRightTab: 'commentary', notesCollapsed: false })
      // A click on a verse is a request for *this* passage's commentary — more specific than
      // whatever the pill was pinned to, so it re-pins. Except a pin on Fathers: the catena
      // follows the same click (it reads `commentaryLookup`), so leave it be.
      if (get().refModes.commentary !== 'fathers') get().setRefMode('commentary', 'bible')
    },

    showScripture: async () => {
      const bible = get().tabs.find((t) => t.kind === 'bible')
      if (bible) {
        get().focusTab(bible.id)
        } else {
        // Open the reader from local state right away. The translation registry can hit the
        // network to resolve copyrighted versions, so it must NOT gate the view switch — it is
        // loaded in the background below and fills the translation picker when it arrives.
        let passage = get().scripturePassage
        if (!passage) {
          const last = await api.getSession('lastScripture')
          if (last) {
            try {
              const p = JSON.parse(last) as { book?: string; chapter?: number }
              if (p.book && p.chapter) passage = { book: p.book, chapter: p.chapter, highlight: [] }
            } catch {
              /* ignore malformed session value */
            }
          }
          if (!passage) passage = { book: 'JHN', chapter: 1, highlight: [] }
        }
        get().navigateScripture(passage.book, passage.chapter, passage.highlight)
      }
      if (get().scriptureTranslations.length === 0) void get().loadScripture()
    },

    openScripture: async (refStr) => {
      const ref = parseReference(refStr)
      if (!ref) return
      if (get().scriptureTranslations.length === 0) await get().loadScripture()
      const start = ref.verseStart
      const highlight =
        start != null
          ? Array.from({ length: (ref.verseEnd ?? start) - start + 1 }, (_, i) => start + i)
          : []
      get().navigateScripture(ref.book, ref.chapter, highlight)
    },

    toggleScriptureCompare: () => {
      const next = !get().scriptureCompareOpen
      // On first open, default the second column to a translation other than the primary.
      let compare = get().scriptureCompareTranslation
      if (next && !compare) {
        const { scriptureTranslations: ts, scriptureTranslation: primary } = get()
        compare = ts.find((t) => t.id !== primary)?.id ?? primary
      }
      set({ scriptureCompareOpen: next, scriptureCompareTranslation: compare })
      void api.setSession('scriptureCompareOpen', next ? '1' : '')
    },

    setCompareTranslation: (id) => {
      set({ scriptureCompareTranslation: id })
      void api.setSession('lastScriptureCompare', id)
    },

    addScriptureHighlight: async (input) => {
      await api.addScriptureHighlight(input)
      // Bump the shared token so the reader re-marks verses and panels reload.
      set({ noteReloadToken: get().noteReloadToken + 1 })
    },

    deleteScriptureHighlight: async (id) => {
      await api.deleteQuote(id)
      // Bump the shared token so the reader drops the verse mark and panels reload.
      set({ noteReloadToken: get().noteReloadToken + 1 })
    },

    // --- Reference panel pins ---
    setRefMode: (pill, mode) => {
      set({ refModes: { ...get().refModes, [pill]: mode } })
      void api.setSession(`refMode:${pill}`, mode)
    },

    addFathersQuote: async (input) => {
      try {
        await api.addFathersQuote(input)
        // Bump the shared token so the Quotes panel reloads.
        set({ noteReloadToken: get().noteReloadToken + 1 })
      } catch (err) {
        set({ toast: err instanceof Error ? err.message : 'Could not save this quote' })
      }
    },

    // --- Book of Concord (Confessions) ---
    // In-place navigation, like navigateScripture: if the active tab is already showing the BoC
    // reader, it navigates there. Only explicit "open" actions create a new tab.
    navigateBoc: (documentCode, ordinal, bocSourceId) => {
      const current = focusedTab(get())
      if (current?.kind === 'boc') {
        get().setTabContent(current.id, {
          kind: 'boc',
          documentCode,
          sectionOrdinal: ordinal,
          bocSourceId: bocSourceId ?? current.bocSourceId
        })
      } else {
        get().openTab({ kind: 'boc', documentCode, sectionOrdinal: ordinal, bocSourceId })
      }
      void api.setSession('lastBoc', JSON.stringify({ documentCode, ordinal }))
    },

    bocSectionClicked: async (documentCode, ordinal, section) => {
      set({
        bocLookup: {
          documentCode,
          ordinal,
          sectionNumber: section?.number ?? null,
          sectionLabel: section?.label ?? ''
        },
        bocMatches: []
      })
      const matches = await api.lookupBocSection(documentCode, ordinal)
      // A later click may have landed while this lookup was in flight — don't overwrite it.
      const stillCurrent = get().bocLookup
      const stale = stillCurrent?.documentCode !== documentCode || stillCurrent?.ordinal !== ordinal
      if (stale) return
      set({ bocMatches: matches })
      get().saveLayout({ activeRightTab: 'commentary', notesCollapsed: false })
      get().setRefMode('commentary', 'confessions')
    },

    showConfessions: async () => {
      const boc = get().tabs.find((t) => t.kind === 'boc')
      if (boc) {
        get().focusTab(boc.id)
        } else {
        // Resume where the user left off, falling back to the Augsburg Confession's first
        // section. (Unlike showScripture there is no background registry load to keep off the
        // critical path — BoC sources are local files, resolved by the reader itself.)
        let doc = { documentCode: 'AC', ordinal: 1 }
        const last = await api.getSession('lastBoc')
        if (last) {
          try {
            const p = JSON.parse(last) as { documentCode?: string; ordinal?: number }
            // Skip a code the registry no longer has (e.g. the pre-merge per-creed codes).
            if (p.documentCode && bocDocument(p.documentCode) && p.ordinal != null) {
              doc = { documentCode: p.documentCode, ordinal: p.ordinal }
            }
          } catch {
            /* ignore malformed session value */
          }
        }
        get().navigateBoc(doc.documentCode, doc.ordinal)
      }
    },

    showCommentary: async (target) => {
      const existing = get().tabs.find((t) => t.kind === 'commentary')
      if (existing && !target) {
        get().focusTab(existing.id)
        return
      }
      const content = await commentaryStartContent(target)
      if (existing) {
        get().setTabContent(existing.id, content)
        get().focusTab(existing.id)
      } else if (target) {
        // Jumping in from a verse (the reference bar): keep the Bible visible beside it.
        get().openTabInSplit(content)
      } else {
        get().openTab(content)
      }
    },

    showDogmatics: async (target) => {
      const existing = get().tabs.find((t) => t.kind === 'dogmatics')
      if (existing && !target) {
        get().focusTab(existing.id)
        return
      }
      const content = await dogmaticsStartContent(target)
      if (existing) {
        get().setTabContent(existing.id, content)
        get().focusTab(existing.id)
      } else {
        get().openTab(content)
      }
    },

    addBocQuote: async (input) => {
      await api.addBocQuote(input)
      // Bump the shared token so the reader re-marks paragraphs and panels reload.
      set({ noteReloadToken: get().noteReloadToken + 1 })
    },

    addBocCommentaryQuote: async (input) => {
      await api.addBocCommentaryQuote(input)
      set({ noteReloadToken: get().noteReloadToken + 1 })
    },

    // --- Church Fathers ---
    // In-place navigation, like navigateBoc: the focused tab if it is already a Fathers tab,
    // else any existing Fathers tab (so a catena click does not pile up tabs), else a new one.
    navigateFathers: (volumeCode, sectionId) => {
      routeFathers({ kind: 'fathers', fathersVolume: volumeCode, fathersSection: sectionId })
      void api.setSession('lastFathers', JSON.stringify({ volumeCode, sectionId }))
    },

    openFathersAuthor: (authorId) => {
      routeFathers({ kind: 'fathers', fathersAuthor: authorId })
    },

    showFathers: async () => {
      const existing = get().tabs.find((t) => t.kind === 'fathers')
      if (existing) {
        get().focusTab(existing.id)
          return
      }
      // Resume where the user left off; with no history the pane opens on its volume list.
      get().openTab(await fathersStartContent())
    },

    showPassageInTexts: (book, chapter, highlight = []) => {
      set({ refBibleTarget: { book, chapter, highlight } })
      get().setRefMode('texts', 'bible')
      // Same patch as ThreePanel.selectRightTab: open the panel and give a reader pill room.
      const widen = (get().layout?.notesWidth ?? 0) < 460 ? { notesWidth: 560 } : {}
      get().saveLayout({ activeRightTab: 'texts', notesCollapsed: false, ...widen })
    },

    openTab: (content, opts = {}) => {
      const current = focusedTab(get())
      if (
        !opts.forceNew &&
        opts.activate !== false &&
        content.kind !== 'newtab' &&
        (current?.kind === 'newtab' || current?.kind === 'search')
      ) {
        get().setTabContent(current.id, content)
        return current.id
      }
      let after = opts.after === undefined ? get().activeTabId : opts.after
      // A tab opened next to a grouped tab joins its group (Chrome's links and "New tab to the
      // right"), unless the caller says otherwise; then it goes just past the group instead.
      const anchorGroup = get().tabs.find((t) => t.id === after)?.groupId
      const groupId = opts.groupId !== undefined ? opts.groupId : (anchorGroup ?? null)
      if (anchorGroup && groupId !== anchorGroup) {
        const members = sortedTabs(get().tabs).filter((t) => t.groupId === anchorGroup)
        after = members[members.length - 1]?.id ?? after
      }
      const { ws: opened, tabId } = pureOpenTab(currentWs(), content, { activate: opts.activate, after })
      const next = groupId
        ? { ...opened, tabs: opened.tabs.map((t) => (t.id === tabId ? { ...t, groupId } : t)) }
        : opened
      commit(next)
      return tabId
    },

    newTab: (after = null) => {
      get().openTab({ kind: 'newtab' }, { after })
    },

    openPage: (kind) => {
      if (kind === 'settings' || kind === 'history' || kind === 'bookmarks') {
        const existing = get().tabs.find((t) => t.kind === kind)
        if (existing) {
          get().focusTab(existing.id)
          return
        }
      }
      if (get().fillEmptyNewTab({ kind })) return
      // Pages open beside the focused tab but never inside its group.
      get().openTab({ kind }, { forceNew: true, groupId: null })
    },

    fillEmptyNewTab: (content) => {
      const current = focusedTab(get())
      if (!current || !isEmptyNewTab(current, newTabDrafts.get(current.id))) return false
      get().setTabContent(current.id, content)
      return true
    },

    openTabInSplit: (content) => {
      const anchor = get().activeTabId
      const id = get().openTab(content, { forceNew: true })
      if (anchor && anchor !== id) get().splitTabs(anchor, id)
      get().focusTab(id)
    },

    closeTab: (tabId) => {
      let next = pureCloseTab(currentWs(), tabId)
      // Chrome closes the window with its last tab; Loci keeps a New Tab page instead.
      if (next.tabs.length === 0) next = pureOpenTab(next, { kind: 'newtab' }).ws
      commit(next)
    },

    closeOtherTabs: (tabId) => commit(pureCloseOtherTabs(currentWs(), tabId)),

    closeTabsToRight: (tabId) => commit(pureCloseTabsToRight(currentWs(), tabId)),

    reopenClosedTab: () => {
      const { ws: next, tabId } = pureReopenClosedTab(currentWs())
      if (tabId) commit(next)
    },

    duplicateTab: (tabId) => {
      const { ws: next, tabId: id } = pureDuplicateTab(currentWs(), tabId)
      if (id) commit(next)
    },

    setPinned: (tabId, pinned) => commit(pureSetPinned(currentWs(), tabId, pinned)),

    splitTabs: (a, b) => commit(pureSplitTabs(currentWs(), a, b)),

    unsplitTab: (tabId) => commit(pureUnsplitTab(currentWs(), tabId)),

    reorderTab: (tabId, targetIndex) => commit(pureReorderTab(currentWs(), tabId, targetIndex)),

    setTabContent: (tabId, content) => commit(pureSetTabContent(currentWs(), tabId, content)),

    replaceTabContent: (tabId, content) => commit(pureReplaceTabContent(currentWs(), tabId, content)),

    resetTabToNewTab: (tabId) => {
      get().setTabContent(tabId, { kind: 'newtab' })
    },

    focusTab: (tabId) => {
      if (get().activeTabId === tabId) return
      commit(pureFocusTab(currentWs(), tabId))
    },

    cycleTab: (dir) => commit(pureCycleTab(currentWs(), dir)),

    selectTabByNumber: (n) => commit(pureSelectTabByNumber(currentWs(), n)),

    setSplitRatio: (splitId, r) => commit(pureSetSplitRatio(currentWs(), splitId, r)),

    reloadTab: (tabId) => {
      const keys = get().reloadKeys
      set({ reloadKeys: { ...keys, [tabId]: (keys[tabId] ?? 0) + 1 } })
    },

    navigateTab: (tabId, content) => get().setTabContent(tabId, content),

    goBack: (tabId) => {
      const id = tabId ?? get().activeTabId
      if (id) commit(pureGoHistory(currentWs(), id, -1))
    },

    goForward: (tabId) => {
      const id = tabId ?? get().activeTabId
      if (id) commit(pureGoHistory(currentWs(), id, 1))
    },

    goToHistoryIndex: (tabId, index) => commit(pureGoToHistoryIndex(currentWs(), tabId, index)),

    toggleBookmark: (location, title) => {
      const { bookmarks, added } = pureToggleBookmark(get().bookmarks, location, title)
      setBookmarks(bookmarks)
      return added
    },

    renameBookmark: (id, title) => setBookmarks(pureRenameBookmark(get().bookmarks, id, title)),

    removeBookmark: (id) => setBookmarks(pureRemoveBookmark(get().bookmarks, id)),

    addBookmark: (location, title, parentId) => {
      const { bookmarks, bookmark } = pureAddBookmark(get().bookmarks, location, title, undefined, parentId)
      setBookmarks(bookmarks)
      return bookmark
    },

    addBookmarkFolder: (title, parentId) => {
      const { bookmarks, folder } = pureAddFolder(get().bookmarks, title, parentId)
      setBookmarks(bookmarks)
      return folder
    },

    editBookmark: (id, patch) => setBookmarks(pureEditBookmark(get().bookmarks, id, patch)),

    editBookmarkFolder: (id, patch) => setBookmarks(pureEditFolder(get().bookmarks, id, patch)),

    removeBookmarkFolder: (id) => setBookmarks(pureRemoveFolder(get().bookmarks, id)),

    moveBookmarkNode: (id, parentId, index) => setBookmarks(pureMoveNode(get().bookmarks, id, parentId, index)),

    applySync: (snapshot) => {
      if (!syncReady) return
      const bookmarks = bookmarksWithPending(snapshot.bookmarks)
      if (bookmarksFingerprint(bookmarks) !== bookmarksFingerprint(get().bookmarks)) set({ bookmarks })
      // A group change still on its debounce must be recorded as pending before merging.
      if (groupsTimer) scheduleGroupSync(true)
      const before = groupState()
      const items = parseGroupItems(snapshot.tabGroups)
      const r = mergeRemoteGroups(before, items, syncedGroups, new Set(pendingGroups.keys()))
      syncedGroups = r.synced
      if (r.state !== before) commit(r.state.ws, r.state.groups)
      if (stableJson(snapshot.devices) !== stableJson(get().remoteDevices)) set({ remoteDevices: snapshot.devices })
    },

    toggleBookmarksBar: () => {
      const show = !get().showBookmarksBar
      set({ showBookmarksBar: show })
      void api.setSession('showBookmarksBar', show ? '1' : '0')
    },

    createGroup: (tabId) => {
      const r = pureCreateGroup(groupState(), tabId)
      if (r.groupId) commitGroups(r)
      return r.groupId
    },

    createGroupWithNewTab: () => {
      const tabId = get().openTab({ kind: 'newtab' }, { forceNew: true, after: null, groupId: null })
      return get().createGroup(tabId)
    },

    addTabToGroup: (tabId, groupId) => commitGroups(pureAddTabToGroup(groupState(), tabId, groupId)),

    removeTabFromGroup: (tabId) => commitGroups(pureRemoveTabFromGroup(groupState(), tabId)),

    updateGroup: (id, patch) => {
      const groups = pureUpdateGroup(get().groups, id, patch)
      if (groups !== get().groups) commit(currentWs(), groups)
    },

    toggleGroupCollapsed: (id) => commitGroups(pureToggleGroupCollapsed(groupState(), id)),

    closeGroup: (id) => commitGroups(pureCloseGroup(groupState(), id)),

    openGroup: (id) => {
      // Opening a closed group from an empty New Tab page fills that page's place: the blank
      // tab goes away (and is not offered by Reopen closed tab).
      const before = focusedTab(get())
      const group = get().groups.find((g) => g.id === id)
      const replace =
        !!group &&
        !group.open &&
        !!before &&
        !before.groupId &&
        !before.pinned &&
        !before.splitId &&
        isEmptyNewTab(before, newTabDrafts.get(before.id))
      commitGroups(pureOpenGroup(groupState(), id))
      if (replace && get().activeTabId !== before.id && get().tabs.length > 1) {
        const closed = currentWs().closed
        commit({ ...pureCloseTab(currentWs(), before.id), closed })
      }
    },

    deleteGroup: (id) => commitGroups(pureDeleteGroup(groupState(), id)),

    ungroup: (id) => commitGroups(pureUngroup(groupState(), id)),

    newTabInGroup: (id) => commitGroups(pureNewTabInGroup(groupState(), id)),

    moveGroup: (id, targetIndex) => commitGroups(pureMoveGroup(groupState(), id, targetIndex)),

    moveTab: (tabId, targetIndex, groupId) => commitGroups(pureMoveTabTo(groupState(), tabId, targetIndex, groupId)),

    stepZoom: (dir) => {
      const cur = get().zoom
      let zoom = 100
      if (dir === 1) zoom = ZOOM_STEPS.find((z) => z > cur) ?? ZOOM_STEPS[ZOOM_STEPS.length - 1]
      else if (dir === -1) zoom = [...ZOOM_STEPS].reverse().find((z) => z < cur) ?? ZOOM_STEPS[0]
      set({ zoom })
      api.setZoomFactor(zoom / 100)
      void api.setSession('zoom', String(zoom))
    },

    createNoteInTab: async (id, title, type) => {
      const note = await api.createNote(title, type)
      await get().loadStandaloneNotes()
      get().setTabContent(id, { kind: 'note', notePath: note.path })
      return note
    },

    refreshActiveProject: async () => {
      const { tabs, standaloneNotes, activeProject } = get()
      const projectTab = findProjectTab(tabs, standaloneNotes)
      if (!projectTab?.notePath) {
        if (activeProject) set({ activeProject: null })
        return
      }
      // Already tracking this exact project — don't clobber items just added/removed locally.
      if (activeProject?.path === projectTab.notePath) return
      const raw = await api.readNote(projectTab.notePath)
      const { fm } = parseNote(raw)
      // Guard against a stale response if the workspace changed again while this was in flight.
      if (findProjectTab(get().tabs, get().standaloneNotes)?.notePath !== projectTab.notePath) {
        return
      }
      set({ activeProject: { path: projectTab.notePath, items: fm.items } })
    },

    addProjectItem: async (item) => {
      const proj = get().activeProject
      if (!proj || proj.items.some((i) => sameProjectItem(i, item))) return
      const items = [...proj.items, item]
      set({ activeProject: { ...proj, items } })
      await writeProjectItems(proj.path, items)
    },

    removeProjectItem: async (item) => {
      const proj = get().activeProject
      if (!proj) return
      const items = proj.items.filter((i) => !sameProjectItem(i, item))
      set({ activeProject: { ...proj, items } })
      await writeProjectItems(proj.path, items)
    }
  }
})
