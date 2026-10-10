# Church Fathers — live checks

On `main`. The 38 volumes ship in `resources/fathers` and install into the vault's `fathers/` folder on launch, like the bundled commentaries. Run `npm run dev` from `D:\Code\Loci`. Indexing starts after the dogmatics sync (~3 s after launch) and takes about 1–2 minutes the first time. Automated: 422/422 tests, typecheck clean, validator --strict exit 0.

## Manual GUI checklist (user performs; agent did not launch the app)

1. **Startup indexing.** Launch Loci; nothing to copy by hand. Afterwards `%APPDATA%\Loci\vault\fathers` holds 38 files. The app stays responsive. Open **Church Fathers** (rail, church icon — Dogmatics keeps the landmark icon). The drawer lists ANF, NPNF¹, NPNF² volumes, each "(indexing…)" at first, then ready. No ⚠ rows.
2. **Error handling.** Put a junk file named `anf99.xml` (any text) in the folder and relaunch. The drawer shows `anf99` with ⚠, and the error text appears on click. Every other volume is unaffected. Delete the file afterwards.
3. **Volumes tree.** Expand ANF 1: author groups (Clement of Rome, … Irenaeus) contain works, which contain sections. "Editor" tags appear on introductory notes and prefaces. Clicking a section opens it in the reader. Prev/next buttons walk the volume.
4. **Authors view.** Toggle **Authors**. Authors are ordered by date with dates beside the names. None are undated except pseudo-authors. Clicking an author shows name, dates, bio and works across volumes. Clicking a work opens its first section.
5. **Reader.** Open ANF 1 → Irenaeus → *Against Heresies* Book III. Text is readable (small caps, italics, line/verse blocks). Faint margin labels `p. 414`, `p. 415`… appear where printed pages turn. The header shows the start page. Footnote markers (`¹`) open a popover with the note. A Scripture link inside the popover works. Clicking elsewhere closes it.
6. **Scripture links.** Click a dotted-underlined reference (e.g. `1 Pet. v. 1-5`). The right panel switches to **Texts → Bible** at that passage, with the verses highlighted. Click a second reference: it navigates. A deuterocanonical reference (Sir., Wisd.) is plain text, not a link.
7. **Quotes.** Select a sentence in the reader, pick a colour swatch. The right panel **Quotes → Fathers** shows the quote with citation `Irenaeus, *Against Heresies* III.3 (ANF 1:415)`, where the page matches the margin label at the start of the selection. The file `notes/fathers/Irenaeus.md` exists in the vault with the quote block. Delete the quote; the file disappears.
8. **Catena.** Open John 3 in Scripture and click verse 16. Right panel → **Commentary → Fathers** (the switch): "Fathers on John 3:16", with entries ordered by author date (Justin/Irenaeus before Augustine…). Each entry shows snippet, volume/page, passage, and "in a footnote" where applicable. Click an entry: the Fathers tab opens at that section. Click another verse: the catena updates and the pill stays on Fathers. With no verse clicked, the catena shows the open chapter grouped by verse.
9. **Pill following.** Focus a Fathers tab with the Commentary and Quotes pills unpinned: both switch to Fathers automatically. Texts stays on Bible/Confessions.
10. **Search.** Search view → **Fathers** scope → search `apostolic succession` (or any phrase). Hits are grouped per volume ("ANF 1"), and rows show section title and `p. N`. Clicking a hit opens the reader at that section. The **All** scope includes Fathers hits.
11. **Persistence.** Close and reopen the app. The Fathers tab restores on the same section. The rail entry resumes where you left off. Drawer collapse state and the Volumes/Authors choice are remembered.
12. **Confessions/Bible unaffected.** Open a Book of Concord document and a Bible chapter. Their panels, commentary and quotes behave as before.

### Additional cases (added in Task 12)

13. **Page-break selection, start.** In ANF 1 Irenaeus, select text starting just after a `p. N` margin label. Save a quote. The citation page must be the page that label starts, not the previous page.
14. **Page-break selection, across.** Select text that crosses a page break (starts before a label, ends after it). Save a quote. The citation must use the page at the start of the selection. Check the cited page against the label.
15. **Triple-click with mid-paragraph page break.** Triple-click a paragraph that contains a page break in its middle. Save a quote. The citation must use the page at the start of the selected text, which is the page before the mid-paragraph break.
16. **Scripture link with panel collapsed.** Collapse the right panel. Click a scripture link in a Father. The panel opens on **Texts → Bible** at the clicked passage, not the previously viewed chapter.
17. **Scripture link on another pill.** Put the right panel on Quotes (or Commentary). Click a scripture link in a Father. The panel switches to Texts → Bible at the clicked passage, not the previously viewed chapter.
18. **Search hit lands on section.** Search Fathers scope for a phrase that appears in a mid-volume section (not the first section of its work). The reader opens on that exact section, not the first section of the work.
19. **Catena, Commentary pinned to Fathers.** Pin the Commentary pill to Fathers. Click verse 16 in John 3. The catena shows "Fathers on John 3:16" and stays on Fathers when you click another verse.
20. **Catena, Commentary not pinned.** Unpin the Commentary pill. Click a Fathers entry in the catena, then click another verse. Check that the pill's state matches item 9 behaviour and the catena does not jump to another pill unexpectedly.

21. **Quote text has no footnote digits.** Select a sentence containing a footnote marker (superscript number) and save a quote. The saved text reads cleanly ("the apostles, who…", not "the apostles,25 who…"), with words and the letter "s" intact.
22. **Quotes navigator.** Quotes view → Source mode shows a **Church Fathers** group per volume with your Fathers quotes; Author mode files them under the Father's name (not "Scripture"). Opening a quote's source jumps to the section in the reader.
23. **Removed volume.** Move one `.xml` out of the vault folder and relaunch: that volume disappears from the drawer and search; quotes from it still show their citation. Put it back afterwards.
24. **Catena truncation.** On a heavily cited chapter (e.g. Matthew 5 without a verse, or John 1), if the list is long a "Showing the first N" note appears.
