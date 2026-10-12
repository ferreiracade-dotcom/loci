# Loci — Cade Article typesetting concepts

These proposals adapt the supplied Article Reformatting Toolkit to Loci's reading pages and note editor. They are design mockups, not implemented app features. Text, references, collection counts, and bibliographic entries in the generated UI images are illustrative; they should not be treated as source transcriptions.

## Proposed page layouts

| Page | Direction | Mockup |
| --- | --- | --- |
| Bible | A typeset reading page with embedded verse numbers and optional study sidebar. | [View](bible-typeset.png) |
| Confessions | Publication typography, contents navigation, and contextual commentary. The reading pattern can also guide Dogmatics, Fathers, and Commentary. | [View](confessions-typeset.png) |
| Library → Articles | An editorial bibliography with filters, indexing, and a document preview. | [View](library-typeset.png) |
| Notes editor | Google Docs-style editing with the Cade Article template applied to the document. | [View](notes-cade-template.png) |
| Settings → Document templates | Choose defaults for new notes and preview the page layout. | [View](template-settings.png) |

## Typography from the uploaded toolkit

- Page: 6 × 9 inches; left/right margins 0.9 inches, top 0.8 inches, bottom 0.9 inches.
- Body: EB Garamond, 11 pt with 16 pt leading, justified paragraphs, 1.5 em first-line indents, no added paragraph gap.
- Opening: centered bold capital title, 13.5/19 pt; small-cap author; smaller source line.
- Section: centered bold capitals; subsection: smaller spaced capitals.
- Quotations: inset on both sides, 10/14 pt; preserve original italics.
- Footnotes: bottom of page, 9/11.5 pt, hanging numbers, short dividing rule.
- Running title: centered spaced capitals; page number centered at the bottom.
- Original journal page markers remain distinct from the new page numbers.

Generated UI images approximate these typography rules. The compiled sample below uses the actual toolkit style and EB Garamond fonts.

## Reusable note template

- [Exact typeset sample — PDF](notes-template.pdf)
- [Exact first-page preview — PNG](notes-template-preview.png)
- [Editable LaTeX note template](notes-template.tex)
- [Cade Article stylesheet](cadearticle.sty)

The stylesheet comes from the supplied toolkit; its font declarations were adjusted to load the bundled font files. Page geometry and typography settings are preserved. EB Garamond font files come from the upstream octaviopardo/EBGaramond12 repository and retain the included SIL Open Font License.

To compile, run `xelatex -no-shell-escape notes-template.tex` twice from this directory. Replace the sample text, opening metadata, and source notes with your own material.

## Notes editing proposal

Keep the requested document-editor experience: title field, formatting toolbar, zoom, ruler, outline, and optional comments. Add a template selector with **Cade Article** as a choice. Selecting that template sets the document's page size, margins, body font, paragraph styles, heading styles, and footnote layout. Users can edit content and override formatting; existing notes keep their current appearance unless the user applies a template.

The app editor would need style metadata and proper footnote and pagination support to reproduce the template. Export should preserve the selected template. This proposal does not implement those features or rewrite existing PDFs: PDF text remains as embedded; the new style applies to native reading text and authored notes.
