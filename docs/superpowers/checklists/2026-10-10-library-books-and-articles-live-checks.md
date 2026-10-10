# Library: Books and Articles — live checks

These checks are for you to run by hand in the Loci app. Nothing here has been run against your real library yet.

Before you start:

1. Back up your vault folder (the Drive folder with `pdfs/`) or make sure Drive has synced.
2. In the worktree folder `D:\Code\Loci-articles`, run `npm run dev`.
3. Keep a short note of the counts you see on the Library page before you begin (Books and Articles).

Each step says what to do and what you should see. If a step does not match, note the step number and what you saw.

---

## 1. Startup and migration

1. Open Loci.
2. Go to the **Library** page.
3. Look at the **Books | Articles** switch at the top.

Expected:
- The app opens and your existing library is still there.
- **Books** is selected by default, and its count matches what you had before.
- **Articles** shows 0 (nothing was converted to an article).
- Wait for the first sync to finish, then check the counts again. They should not change, and no book should be imported twice.

## 2. Articles by folder (vault)

1. Copy a PDF into your vault folder `pdfs/Articles/` (create the `Articles` folder if it does not exist).
2. Wait for sync, or restart Loci.
3. Go to **Library**.

Expected:
- The PDF appears under the **Articles** tab, and the Articles count goes up by one.
- It does not appear under **Books**.

## 3. Articles by folder (local library)

1. Find your local library folder (the one set up in the Setup wizard as "Existing library folder").
2. Make a folder called `articles` (any capital letters are fine, and it can be nested at any depth), for example `<local library>\Some Subfolder\articles\`.
3. Put a PDF in that folder.
4. Put a second PDF directly in the local library folder, outside any `articles` folder.
5. Wait for sync.

Expected:
- The PDF inside the `articles` folder shows under **Articles**.
- A copy of it is placed in your vault's `pdfs/Articles/` folder.
- The second PDF shows under **Books**.

## 4. Add button

1. On the **Books** tab, look at the add button.
   - Expected: it reads **Add books…**.
2. Switch to the **Articles** tab.
   - Expected: it reads **Add articles…**.
3. With the Articles tab open, click **Add articles…** and pick a PDF from your Downloads folder.

Expected:
- The file is copied into your vault's `pdfs/Articles/` folder.
- It appears under **Articles**, not Books.
- Repeat with the Books tab and **Add books…**: the file goes into `pdfs/Books/`.

## 5. Info drawer for an article

1. Click an article in the list to open its info drawer.
2. Read the heading.

Expected:
- The heading reads **Article info**.
- The fields **Journal**, **Volume**, **Issue**, **Pages** and **DOI** are visible.
- **Series** and **Publisher** are not shown.
3. Click **Edit**, change the Journal to something else, and click **Save details**.
4. Close the drawer, open it again, and confirm the change is still there.

## 6. Fill from DOI

Use the DOI of a well-known public article, for example `10.1038/nature14539` (LeCun, Bengio and Hinton, "Deep learning", *Nature*, 2015).

1. Open an article's info drawer and click **Edit**.
2. Paste `10.1038/nature14539` into the DOI field and click **Fill from DOI**.

Expected:
- Title, authors, journal, volume, issue, pages and year fill in on the form.
- Nothing is saved yet. Close the drawer without saving and reopen it: the old values are still there.

3. Try the same DOI written as `https://doi.org/10.1038/nature14539`.
   - Expected: the same fields fill in.
4. Try it as `doi:10.1038/nature14539`.
   - Expected: the same fields fill in.
5. Enter a bogus DOI such as `10.9999/this-does-not-exist` and click **Fill from DOI**.

Expected:
- An error message appears inline, close to the DOI field.
- The other fields do not change.

6. Optional: turn off your network connection, enter the real DOI again, and click **Fill from DOI**.

Expected: the same inline error, with the fields unchanged. Turn the network back on afterwards.

## 7. Move between Books and Articles

1. Open an article and click **Move to Books**.

Expected:
- The PDF moves from `pdfs/Articles/` to `pdfs/Books/` (and from the local `articles` folder, if it had one).
- The item switches to the **Books** tab.
- Its quotes, highlights and shelves are still attached. Open the item's quotes to check.

2. Open a book and click **Move to Articles**.

Expected: the same thing in reverse.

3. Move a file while it is open in the PDF reader, then try again.

Expected: Loci does not overwrite anything. It either moves the file after you close the reader or shows a clear message. Write down what you saw.

4. Wait for a sync.

Expected: the moved item stays where you moved it, and it is not duplicated.

## 8. Citations

1. Open an article and add a quote from it at a page you know, for example page 52.
2. Look at the footnote for the quote.

Expected: it looks like this pattern, using the article's real details:

`Author, "Title," *Journal* 12, no. 3 (1998): 45–67, 52.`

3. Open the article's info drawer, clear **Issue** and **Pages**, and save.
4. Look at the footnote again.

Expected: the issue number and the page range drop out cleanly. There should be no stray commas, "no." or brackets.

5. Add a quote from a book.

Expected: the book citation looks the same as it did before this change.

6. Export a bibliography that includes the article.

Expected: the article is listed in article form (journal, volume, issue, pages), not book form.

## 9. Right panel

1. Open the right-hand panel and find the pill.

Expected: the pill is labelled **Library**.

2. Open it.

Expected:
- There is a **Books | Articles** switch with counts.
- With no articles, the Articles view says **No articles yet**.
- With no books, the Books view says **No books yet**.
- With neither, it says **No books or articles yet**.

## 10. Wording

1. Hover over a Library tab.

Expected: the tab's hover card reads **Library · Book** or **Library · Article**.

2. Open the **History** page.

Expected: entries say **Library · Book** or **Library · Article**.

3. Open the search bar (omnibox) and open an article.

Expected: the breadcrumb reads **Library › Articles › title**.

4. Type in the search bar to get suggestions for an article and a book.

Expected: the hint text says **Book** or **Article**.

5. Open a new tab and look at the **Recent** tiles.

Expected: they say **Book** or **Article**.

6. Run the Setup wizard (or look at its settings).

Expected: the folder field reads **Existing library folder**.

7. Open a commentary excerpt that is linked to a book.

Expected: the button reads **Open in Library** (not "View in PDF").

8. Open a note and find the export button.

Expected: it still reads **Export to PDF**.

9. Search the whole app for a term that appears in an article.

Expected: the search result group for the article shows a small **Article** tag.

10. Search the whole app for a term that appears in a book.

Expected: the result group for the book does not show an "Article" tag.

## 11. Known wording to check

Expected: apart from **Export to PDF** and the file-type filter in the file picker (labelled "PDF"), no screen should use the word "PDF" as an interface label. If you see one, note the screen and the exact text.

---

## What to send back

For each step, note one of: **pass**, **fail**, or **not tested**. For any fail, include the step number, what you expected, and what you saw (a screenshot helps).
