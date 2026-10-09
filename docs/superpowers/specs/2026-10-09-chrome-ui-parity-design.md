# Chrome UI Parity: Design Spec

Date: 2026-10-09
Status: Implemented (phases 1 to 5)
Mockup: `docs/superpowers/mockups/2026-10-09-chrome-ui-mockup.html`

## Summary

Make Loci look and behave like Google Chrome, because Chrome is the UI the
owner already knows by muscle memory. The window becomes a single
Chrome-style tab strip drawn into the title bar, a toolbar with
Back/Forward/Reload and an omnibox, a bookmarks bar, Chrome tab groups, a
Chrome split view and a side panel. The left icon rail goes away; every
view (Bible, Confessions, Fathers, Library, Notes, Quotes, Search,
Settings, History) is something that opens in a tab.

## Goals

- Someone fluent in Chrome can use Loci without learning anything new:
  same layout, same mouse behaviour (left, middle, right click, drag), same
  keyboard shortcuts.
- One tab strip for the whole window, not one per pane.
- Typing a reference (`rom 3:28`, `AC IV`) or a book title into the
  omnibox opens it directly.
- Tab groups that can be collapsed, closed (hidden but saved) and pinned
  to or unpinned from the bookmarks bar.
- Everything (tabs, groups, splits, per-tab history) survives a restart.

## Non-goals

- Graph and Pages views. They are empty placeholders today and are left
  out of the new chrome until they have content.
- Chrome features with no Loci equivalent: extensions, profiles beyond the
  vault, incognito, downloads, sync settings UI.
- Multiple windows and tearing a tab out into a new window. Possible
  later; not in this design.
- A light theme for the new chrome. It uses the existing dark brown and
  gold palette.

## Current state (for context)

- `src/main/index.ts` creates a framed `BrowserWindow` with the standard
  Windows title bar.
- `ThreePanel.tsx` lays out the left `IconRail` (views from
  `navigation.ts` `LEFT_VIEWS`), the `CenterWorkspace` and the right
  reference panel (`RIGHT_TABS`: Quotes, Notes, Books, Texts, Commentary).
- `CenterWorkspace.tsx` renders one or two panes. Each pane has its own
  `TabStrip`. The tab model lives in `store/workspace.ts`
  (`TabKind = 'note' | 'bible' | 'pdf' | 'quotes' | 'picker' | 'boc'`)
  and is persisted through `persistWorkspace` in `useStore.ts`, per the
  2026-07-17 tabbed panes spec.
- Settings is a modal (`Settings.tsx`), Quick Capture is Ctrl+Shift+N.

## Layout

```
[tab search][pinned][pinned][tab][tab][group ▾][split tab A | B][+]   _ □ ×
 ←  →  ↻  | Bible › John 3:16 (BSB)                      ☆ | 🎧 ✎ ◫ ⋮
[● Romans study][● Baptism] ⊞ | Bible  Confessions  Fathers  Library  Notes  Quotes | my bookmarks…
-----------------------------------------------------------+-------------
                     tab content                           | side panel
```

1. **Tab strip (title bar).** The window uses
   `titleBarStyle: 'hidden'` with `titleBarOverlay` so Windows draws its
   own minimise/maximise/close buttons on the right and keeps snap
   layouts. The empty part of the strip is a drag region.
2. **Toolbar.** Back, Forward, Reload; the omnibox; toolbar icons for
   audio, quick capture and the side panel; the ⋮ menu.
3. **Bookmarks bar.** Pinned tab groups and the ⊞ tab groups menu on the
   left, then the fixed bookmarks, then the owner's own bookmarks and
   folders. Toggled with Ctrl+Shift+B.
4. **Content and side panel.** The current right reference panel becomes
   Chrome's side panel, toggled from the ◫ icon, with a dropdown to pick
   Quotes, Notes, Books, Texts or Commentary.

## Decisions made during brainstorming

| Topic | Decision |
|---|---|
| Left sidebar | Removed. Views become tabs. |
| Settings | In the ⋮ menu; opens as a tab (like `chrome://settings`). |
| History, Bookmarks manager, Reopen closed tab | In the ⋮ menu. |
| New tab | Opens the Search page: a large search box with tiles for recent passages, continue reading and recent notes. Replaces Dashboard. |
| Bible, Confessions, Fathers, Library, Notes, Quotes | Fixed entries on the bookmarks bar. |
| Left-clicking a bookmark | **Always opens a new tab** (owner's choice; see open question 1). |
| Two things side by side | Chrome split view: two tabs joined into one double tab in the strip. |
| Hiding tabs | Chrome saved tab groups: closing a group hides its tabs; it stays listed in the ⊞ menu and, if pinned, as a chip on the bookmarks bar. |
| Phase order | Owner has no preference beyond the technical dependencies below. |

## Data model changes

Extends `store/workspace.ts`. The existing `Tab` content fields stay.

```ts
export type TabKind =
  | 'note' | 'bible' | 'pdf' | 'quotes' | 'boc'        // content, unchanged
  | 'newtab'                                           // replaces 'picker'
  | 'library' | 'notes' | 'quotesIndex' | 'fathers'    // former left views
  | 'settings' | 'history' | 'bookmarks'               // ⋮ menu pages

export interface Tab {
  id: string
  order: number
  kind: TabKind
  pinned?: boolean
  groupId?: string
  splitId?: string          // two tabs sharing a splitId render side by side
  history: TabLocation[]    // back/forward stack, capped (e.g. 50)
  historyIndex: number
  // ...existing content fields (notePath, bookId, book, chapter, ...)
}

export interface TabGroup {
  id: string
  name: string
  color: GroupColor         // Chrome's 9 colours
  collapsed: boolean
  pinnedToBar: boolean
  open: boolean             // false = hidden; tabs kept in savedTabs
  savedTabs: Tab[]          // snapshot while closed
}

export interface Bookmark { id: string; title: string; location: TabLocation; parentId?: string }
export interface BookmarkFolder { id: string; title: string; parentId?: string }
```

- `paneOrder` and per-pane `activeTabId` are replaced by a single
  `activeTabId`. A split is a pair of tabs with the same `splitId` plus a
  `splitRatio`; the focused half decides what the omnibox shows.
- `reflectPanes` keeps the same output shape, resolved from the focused
  tab (the focused half of a split), so its consumers do not change.
- Tab groups and bookmarks are stored in the vault (so they travel with
  it), not only in `session_state`.
- History entries go in SQLite with a timestamp, for the History page.
- Migration: on first launch, existing tabs from both panes become one
  strip (left pane first). If two panes were open, their active tabs
  become one split tab.

## Interaction reference

**Tabs**
- Left click: activate. Middle click or ×: close. Drag: reorder; drag into
  or out of a group.
- Hover about 0.5 s: hover card with title and location.
- Right click: New tab to the right, Add tab to group (new or existing),
  Split with…, Reload, Duplicate, Pin/Unpin, Close, Close other tabs, Close
  tabs to the right, Reopen closed tab.

**Group label in the strip**
- Left click: collapse/expand. Right click: rename, colour, pin/unpin from
  bookmarks bar, new tab in group, ungroup, close group, delete group.

**Bookmarks bar**
- Left click: open in a new tab. Ctrl or middle click: new background tab.
- Right click: Open in new tab, Edit, Delete, Add folder, Show bookmarks
  bar. Folders open a dropdown.
- ⊞ menu: Create new tab group, then every saved group. Clicking a group
  opens it, or switches to it if it is already open.

**Omnibox**
- Shows a breadcrumb of the focused tab's location
  (`Bible › John 3:16 (BSB)`, `Confessions › AC › IV`).
- Typing gives a suggestion list: parsed references first, then open tabs,
  bookmarks, books and notes by title, then "Search Loci for …".
- Enter opens in the current tab; Alt+Enter opens in a new tab.
- ☆ adds or edits a bookmark for the current location.

**Inside content**
- Clicking a cross-reference navigates the current tab and pushes history.
  Ctrl or middle click opens it in a background tab.

**Keyboard**
Ctrl+T, Ctrl+W, Ctrl+Shift+T, Ctrl+Tab / Ctrl+Shift+Tab, Ctrl+1 to 8,
Ctrl+9 (last tab), Ctrl+L, Ctrl+D, Ctrl+F, Ctrl+H, Ctrl+Shift+B,
Ctrl+Shift+O (bookmarks manager), Alt+Left / Alt+Right, F5 / Ctrl+R,
Ctrl+Plus / Ctrl+Minus / Ctrl+0. Ctrl+Shift+N stays Quick Capture
(Chrome uses it for incognito, which Loci does not have).

## Phases

Each phase ships on its own and leaves the app usable.

1. **Window and tabs.** Hidden title bar with overlay buttons, single tab
   strip, pinned tabs, hover cards, tab context menu, split view, former
   left views as tab kinds, ⋮ menu with Settings and History as tabs,
   keyboard shortcuts, session restore and migration. Left rail removed.
   Until phase 3, the former left views are reached from the ⋮ menu and
   the New Tab page.
2. **Toolbar.** Per-tab Back/Forward/Reload, omnibox with reference
   parsing and suggestions, ☆, toolbar icons, side panel restyle.
3. **Bookmarks bar.** Fixed entries, user bookmarks and folders,
   bookmarks manager tab.
4. **Tab groups.** Colours, collapse, close/reopen, ⊞ menu, pin to bar.
5. **New Tab page.** Search box and tiles; Dashboard view retired.
   As built: a plain query opens a `search` tab (the query is its
   location, so Back returns to the New Tab page); the Dashboard's vault
   health and bibliography fold out at the bottom of the New Tab page;
   removed tiles come back once the place is visited again. Opening a
   bookmark, bookmarks-bar entry, ⋮ view or closed group while the focused
   tab is an empty New Tab page fills that page instead of adding a tab.

Phases 1 and 2 come first. Phases 3 to 5 can go in any order.

## Testing

- Store unit tests (vitest) for every tab, split, group, history and
  bookmark mutation, and for the migration from the two-pane model.
- Omnibox reference parser tests covering Bible books and abbreviations,
  Confessions document codes and articles, and ambiguous input.
- Persistence round trip: save, reload, compare, including closed groups.
- Manual pass in the real app on Windows for title bar dragging, snap
  layouts and every shortcut, since some are only visible there.

## Open questions

1. **Bookmark left click.** Chrome opens a bookmark in the *current* tab;
   the owner chose "always new tab". Worth revisiting after phase 3 is in
   daily use, since the goal is Chrome muscle memory. Making it a setting
   is cheap.
2. **Split with more than two tabs.** Chrome allows only two. This spec
   matches that.
3. **Where Quick Capture lives in the toolbar** versus staying only as a
   shortcut. Mockup shows it as a toolbar icon.
