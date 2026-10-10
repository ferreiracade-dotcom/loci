"""A dogmatics from The Faith Received -> one Loci dogmatics Markdown file.

The work's own table of contents (its meta.json "structure": entries with a title, a depth and a
page) gives the shape: the entries one level below the title are the loci (the books, "##"), and
every entry below a locus opens a section ("###"). A section under a chapter (a deeper entry)
carries the chapter's title before its own, so "Chapter III. On the Object of Baptism: Who ought
to be baptized". Each entry is found on its page by the heading that best matches its title (the
contents were made from another pass of the translation, so titles and headings differ in
wording and in their numbers); one that cannot be found starts at the top of its page.

The English and Latin editions are paired page by page, as in tfr-to-md.py; each section is the
English with the original underneath ("Latin:").

  python3 tools/tfr-dogmatics-to-md.py <out.md> <slug> [<slug> ...] [options]

Several slugs (a work's volumes) make one file, one work per slug unless --one-work is given.

  --title TITLE        the work's heading (default: the catalogue's title)
  --one-work           all the slugs are one work (volumes of it), under one heading
  --end PAGE           stop before this page (default: the first index page, if listed)
  --book-depth N       the contents depth of the loci (default 2); deeper entries are sections
  --book-match REGEX   only entries at that depth matching REGEX are loci (the rest run on)
  --any-depth          loci and sections by --book-match and --section-match alone, at any depth
  --section-match REGEX  only entries matching REGEX open sections (the rest run on)
  --chapter-match REGEX  sections that lend their title to the ones after them (default: the
                       entries one level below a locus)
  --book-fallback REGEX  in a volume with no entry matching --book-match, the loci are these
  --start-match REGEX  in each volume, leave out the entries more than a page before the first
                       entry matching REGEX (a synopsis of the volume ahead of its text)
  --dedupe             a locus or section listed twice in a volume is kept only where it comes last
  --skip-match REGEX   entries whose pages are left out until the next locus (default: indices)
  --book [VOL:]PAGE=TITLE  a locus the contents miss, starting at the heading on PAGE matching TITLE
  --not-book PAGE      a level-two entry on PAGE that is not a locus (its entries join the one before)
  --rename [VOL:]PAGE=TITLE  a locus's title, where the contents garble it
                       (VOL: in that volume only, counting the slugs from 1)

Hutter, Quenstedt and Calov, as Loci ships them:

  python3 tools/tfr-dogmatics-to-md.py "resources/dogmatics/Hutter Loci Communes.md" leonhard-hutter-loci-communes-theologici --title "Loci Communes Theologici" \\
    --book "136=Topic II. Concerning the Person, or the two Natures of Christ the Savior" \\
    --rename "17=Prolegomena" --rename "27=On Holy Scripture and Unwritten Traditions" --rename "280=On Free Will" --rename "104=On God, One and Triune" --rename "136=On the Person and Two Natures of Christ" \\
    --rename "269=On Necessity and Contingency" --rename "323=On Original Sin" \\
    --rename "603=On the Sacraments in General" --rename "695=On the Lord's Supper" \\
    --rename "897=On the Resurrection of the Dead" --rename "905=On Christian Liberty"

  python3 tools/tfr-dogmatics-to-md.py "resources/dogmatics/Quenstedt Theologia Didactico-Polemica.md" quenstedt-systema-theologicum --title "Theologia Didactico-Polemica" \\
    --book-depth 1 --book-match '^\\W*(?:chap|cap)' \\
    --section-match '\\b(?:section|sectio|question|quaestio|corollar|πόρισμ)' --chapter-match '(?!x)x' \\
    --book "1474=CHAPTER XI. ON RENEWAL." --book "2119=CHAPTER XIX. CONCERNING THE EXTREME JUDGMENT." \\
    --book "2148=CHAPTER XX. ON THE CONSUMMATION OF THE AGE." \\
    --rename "328=On God Considered in Relation, or on the Most Holy Trinity" --rename "1862=On the Cross" \\
    --rename "1907=On the Ecclesiastical Ministry" --rename "2119=On the Last Judgment"

  V=calov-systema-locorum-theologicorum
  python3 tools/tfr-dogmatics-to-md.py "resources/dogmatics/Calov Systema Locorum Theologicorum.md" $V-as-4930128 $V-as-4930294 $V-as-vol-3 $V-as-vol-4 $V-as-4930617 \\
    $V-as-4930764 $V-as-4930937 $V-as-vol-9 $V-as-4931261 $V-as-4931492 $V-as-vol-12 \\
    --one-work --title "Systema Locorum Theologicorum" --any-depth --dedupe --start-match '^\\W*I\\.\\s*N\\.\\s*I\\.\\s*(?:D\\.\\s*)?ABRAHAM' \\
    --book-match '^\\W*(?:I\\.\\s*N\\.\\s*I\\.\\s*)?(?:(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\\s+)?(?:article|articulus)\\b' \\
    --book-fallback '^\\W*(?:chap(?:ter)?|cap(?:ut)?)\\b\\.?\\s*[IVXL1]+\\b' \\
    --chapter-match '^\\W*(?:single\\s+)?(?:chap(?:ter)?|cap(?:ut)?)\\b' \\
    --section-match '\\b(?:chap|cap|question|quaest)' \\
    --rename "7:33=Concerning the Church: Its States Before and After Christ" \\
    --book "10:17=CHAPTER I. ON THE DECALOGUE IN GENERAL" --rename "10:17=On the Decalogue in General" \\
    --book "10:157=CHAPTER I. ON THE FOURTH COMMANDMENT, ON HONORING PARENTS" \\
    --rename "10:157=Concerning the Second Table of the Law, on the Love of Neighbour"

Calov's tomes are those of the Wittenberg edition (1655-77; the sixth is bound with the fifth),
each opening with a synopsis of its own contents before the text.

Downloads are cached in tools/sources/tfr/ (not committed).
"""
import argparse
import difflib
import importlib.util
import json
import re
from pathlib import Path

spec = importlib.util.spec_from_file_location("tb", Path(__file__).parent / "tfr-books-to-md.py")
tb = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tb)

ORDINAL_WORDS = (r"primus|secundus|tertius|quartus|quintus|sextus|septimus|unicum|first|second|third|fourth|fifth|sixth"
                 r"|seventh|eighth|ninth|tenth|eleventh|twelfth|single|last|final")
INVOCATION = re.compile(r"^\W*I\.\s*N\.\s*I\.\s*")  # "In Nomine Iesu", heading a tome or a locus
ORDINAL_FIRST = re.compile(r"^\W*(?:" + ORDINAL_WORDS + r")\s+(?:article|articulus|chapter|caput)\b[.,:]?\s*", re.I)
LEAD = re.compile(
    r"^\W*(?:sect(?:ion)?\.?\s*\d+\.\s*)?(?:locus|loci|loc\.|article|articulus|art\.|place|caput|chapter|chap\.|cap\.)\s*"
    r"(?:[IVXLC]+\b|\d+\b|" + ORDINAL_WORDS + r")[.,:]?\s*(?:(?:which|that)\s+is,?\s*)?",
    re.I)
SMALL = {"a", "an", "and", "as", "at", "by", "for", "from", "in", "into", "of", "on", "or", "the", "to", "with",
         "concerning", "against", "its", "his", "their"}


def words(s):
    return re.findall(r"[a-z]+", s.lower())


def similarity(title, head):
    a, b = words(title), words(head)
    if not a or not b:
        return 0.0
    return difflib.SequenceMatcher(None, a, b[: len(a) + 4], autojunk=False).ratio()


def tidy(title, keep_number=False):
    """A title as the reader shows it: no "ARTICLE XIX. which is", no shouting, no full stop, and
    only the English of a contents entry that gives both ("On Baptism. — DE BAPTISMO.")."""
    t = " ".join(title.split()).split(" — ")[0]
    t = INVOCATION.sub("", t)
    if not keep_number:
        stripped = ORDINAL_FIRST.sub("", LEAD.sub("", t))
        stripped = re.sub(r"^\W*and\s+(?:the\s+)?(?:last|final)\b[.,]?\s*", "", stripped, flags=re.I)
        if len(words(stripped)) >= 1:
            t = stripped
    letters = [c for c in t if c.isalpha()]
    if letters and sum(c.isupper() for c in letters) / len(letters) > 0.5 or re.search(r"\b[A-Z]{4,}\b", t):
        out = []
        for i, w in enumerate(t.split()):
            if re.fullmatch(r"[IVXLC]+[.,:]?", w):
                out.append(w)  # a Roman numeral
            elif w.isupper() or w[:1].isupper() and w[1:].isupper():
                low = w.lower()
                out.append(low if i and low.strip(".,:;") in SMALL else low[:1].upper() + low[1:])
            else:
                out.append(w)
        t = " ".join(out)
    t = t.strip(" .,;:")
    if len(t) > 140:
        t = t[:140].rsplit(" ", 1)[0].rstrip(",;:") + "…"
    return t[:1].upper() + t[1:]


def blocks_of(slug):
    meta = json.loads(tb.get(slug, "meta.json"))
    en, la = tb.pages(slug, "en", meta["tei_v"]), tb.pages(slug, "la", meta["tei_v"])
    assert len(en) == len(la), (slug, len(en), len(la))
    flat = []  # (page, kind, en, la, part): part "F" or "M" goes on from the page before
    for n, (pe, pl) in enumerate(zip(en, la)):
        flat += [(n, b[0], b[1], b[2], b[3]) for b in tb.pair(pe, pl)]
    return meta, flat


def locate(flat, entries):
    """The block each contents entry starts at, in order: the best-matching heading on its page or
    a page either side (a heading and the one after it may together make the title), else the top
    of its page."""
    at, floor = [], 0
    by_page = {}
    for i, b in enumerate(flat):
        by_page.setdefault(b[0], []).append(i)
    for e in entries:
        best, score = None, 0.0
        for p in (e["page"], e["page"] + 1, e["page"] - 1):
            for i in by_page.get(p, []):
                if i < floor or flat[i][1] != "head":
                    continue
                s = similarity(e["title"], flat[i][2])
                if i + 1 < len(flat) and flat[i + 1][1] == "head":
                    s = max(s, similarity(e["title"], flat[i][2] + " " + flat[i + 1][2]))
                s -= 0.05 * abs(p - e["page"])
                if s > score:
                    best, score = i, s
        if best is None or score < 0.45:
            top = [i for i in by_page.get(e["page"], []) if i >= floor]
            best = top[0] if top else floor
        at.append(best)
        floor = best
    return at


def paragraphs(blocks, lang):
    """One language's paragraphs, a paragraph broken by a page joined up again."""
    out = []
    for b in blocks:
        t = b[lang]
        if not t:
            continue
        if out and b[4] in ("F", "M"):
            out[-1] = out[-1][:-1] + t if re.search(r"\w-$", out[-1]) else out[-1] + " " + t
        else:
            out.append(t)
    return out


def section_text(blocks):
    en = paragraphs(blocks, 2)
    # The Latin keeps the printer's line-end hyphens ("reli- qua"): close them up.
    la = [re.sub(r"(\w)- (\w)", r"\1\2", p) for p in paragraphs(blocks, 3)]
    text = "\n\n".join(en)
    if la:
        text += "\n\nLatin:\n\n" + "\n\n".join(la)
    return text.strip()


LONG = 20000  # characters of English and Latin together, about three pages


def split_long(title, prefix, body):
    """A section too long to read as one (the contents skip the headings below a chapter), cut at
    its own headings into parts of a few pages, each titled by the prefix and its first heading."""
    size = lambda bs: sum(len(b[2]) + len(b[3]) for b in bs)
    if size(body) <= LONG:
        return [(title, body)]
    parts = [[title, []]]
    for b in body:
        if b[1] == "head" and size(parts[-1][1]) >= LONG / 4 and len(words(b[2])) >= 1:
            parts.append([None, []])
        if parts[-1][0] is None and b[1] == "head":
            parts[-1][0] = f"{prefix}: {tidy(b[2], keep_number=True)}"
        elif parts[-1][0] is not None and parts[-1][0].endswith(":") is False and b[1] == "head" \
                and parts[-1][1] and all(x[1] == "head" for x in parts[-1][1]):
            parts[-1][0] += f" {tidy(b[2], keep_number=True)}"  # "PROPOSITION I." then its words
        parts[-1][1].append(b)
    # A stretch with no headings at all is cut between paragraphs.
    out = []
    for t, bs in parts:
        t = t or title
        while size(bs) > 2 * LONG:
            n, run = 0, 0
            while n < len(bs) and run < LONG:
                run += len(bs[n][2]) + len(bs[n][3])
                n += 1
            out.append((t, bs[:n]))
            bs = bs[n:]
            t = t if t.endswith("(continued)") else f"{t} (continued)"
        out.append((t, bs))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("out")
    ap.add_argument("slugs", nargs="+")
    ap.add_argument("--title")
    ap.add_argument("--one-work", action="store_true")
    ap.add_argument("--end", type=int)
    ap.add_argument("--book-depth", type=int, default=2)
    ap.add_argument("--book-match")
    ap.add_argument("--any-depth", action="store_true")
    ap.add_argument("--book-fallback")
    ap.add_argument("--start-match")
    ap.add_argument("--dedupe", action="store_true")
    ap.add_argument("--skip-match", default=r"\bindex\b|^\W*indices\b")
    ap.add_argument("--section-match")
    ap.add_argument("--chapter-match")
    ap.add_argument("--book", action="append", default=[])
    ap.add_argument("--not-book", action="append", type=int, default=[])
    ap.add_argument("--rename", action="append", default=[])
    args = ap.parse_args()

    def scoped(spec_):
        """("VOLUME:PAGE" or "PAGE", TITLE) -> (volume or None, page, title)."""
        where, _, title = spec_.partition("=")
        vol, _, page = where.rpartition(":")
        return (int(vol) if vol else None), int(page), title

    adds = [scoped(x) for x in args.book]
    renames = [scoped(x) for x in args.rename]
    depth = args.book_depth
    book_rx = re.compile(args.book_match, re.I) if args.book_match else None
    skip_rx = re.compile(args.skip_match, re.I)
    section_rx = re.compile(args.section_match, re.I) if args.section_match else None
    chapter_rx = re.compile(args.chapter_match, re.I) if args.chapter_match else None

    out, n_books, n_sections = [], 0, 0
    for k, slug in enumerate(args.slugs):
        meta, flat = blocks_of(slug)
        if k == 0 or not args.one_work:
            out.append(f"# {args.title or meta.get('title') or slug}\n")
            n_books = 0
        index_pages = [int(x["page"]) for x in meta.get("index_pages") or [] if str(x["page"]).isdigit()]
        end = args.end or (min(index_pages) if index_pages and not book_rx else flat[-1][0] + 1)
        structure = meta["structure"]
        if args.start_match:
            # A tome's synopsis of its own contents comes before its body; the body opens with
            # this heading, its locus title at most a page before it.
            first = next((e["page"] for e in structure if re.search(args.start_match, e["title"])), None)
            if first is not None:
                structure = [e for e in structure if e["page"] >= first - 1]
        tome_book_rx = book_rx
        if args.book_fallback and not any(book_rx.search(e["title"]) for e in structure):
            tome_book_rx = re.compile(args.book_fallback, re.I)  # a tome with no loci of that kind
        entries = []
        for e in structure:
            if e["page"] >= end or not args.any_depth and e["depth"] < depth:
                continue
            e = dict(e)
            if args.any_depth:
                # Wording, not depth: the contents nest chapters differently from tome to tome.
                if skip_rx.search(e["title"]):
                    e["kind"] = "skip"
                elif tome_book_rx.search(e["title"]):
                    e["kind"] = "book"
                elif section_rx and not section_rx.search(e["title"]):
                    continue
                else:
                    e["kind"] = "section"
                    e["chapter"] = bool(chapter_rx and chapter_rx.search(e["title"]))
            elif e["depth"] == depth:
                if skip_rx.search(e["title"]):
                    e["kind"] = "skip"
                elif e["page"] in args.not_book or book_rx and not book_rx.search(e["title"]):
                    continue  # a part's title page and the like: not a boundary
                else:
                    e["kind"] = "book"
            elif section_rx and not section_rx.search(e["title"]):
                continue  # runs on in the section before
            else:
                e["kind"] = "section"
                e["chapter"] = bool(chapter_rx.search(e["title"])) if chapter_rx else e["depth"] == depth + 1
            entries.append(e)
        for vol, page, title in adds:
            if vol in (None, k + 1):
                entries.append({"title": title, "depth": depth, "page": page, "kind": "book", "added": True})
        entries.sort(key=lambda e: (e["page"], 0 if e.get("added") else 1))
        # A locus entry that only names the locus the next one titles ("Place XXXII." then "On the
        # Civil Magistracy." on the same page) folds into it.
        merged = []
        for e in entries:
            if (merged and merged[-1]["kind"] == "book" and e["kind"] == "book" and merged[-1]["page"] == e["page"]
                    and not words(LEAD.sub("", merged[-1]["title"]))):
                merged[-1] = dict(e, title=merged[-1]["title"] + " " + e["title"])
                continue
            merged.append(e)
        # The same heading listed twice (once misplaced under the locus before, or with --dedupe
        # anywhere in the volume, as in a synopsis ahead of the text): keep the later. Short titles
        # ("Section I. Didactic") recur rightly.
        entries = [e for i, e in enumerate(merged)
                   if not (i + 1 < len(merged) and e["kind"] == "section" and merged[i + 1]["page"] - e["page"] <= 5
                           and similarity(e["title"], merged[i + 1]["title"]) > 0.9)
                   and not (i + 1 < len(merged) and e["kind"] == merged[i + 1]["kind"] == "book"
                            and merged[i + 1]["page"] == e["page"]
                            and similarity(tidy(e["title"]), tidy(merged[i + 1]["title"])) > 0.8)
                   and not (args.dedupe and e["kind"] in ("book", "section") and len(words(tidy(e["title"]))) >= 4
                            and any(x["kind"] == e["kind"] and similarity(tidy(e["title"]), tidy(x["title"])) > 0.95
                                    for x in merged[i + 1:i + 400]))]
        at = locate(flat, entries)
        stop = next((i for i, b in enumerate(flat) if b[0] >= end), len(flat))
        chapter, skipping = None, True  # before a volume's first locus: front matter
        for j, e in enumerate(entries):
            start = at[j]
            finish = at[j + 1] if j + 1 < len(entries) else stop
            if e["kind"] == "skip":
                skipping = True
                continue
            if start >= finish and e["kind"] == "section":
                continue  # an entry found at the same heading as the next
            body = flat[start:finish]
            if body and body[0][1] == "head":
                body = body[1:]  # the heading itself is the title
            if e["kind"] == "book":
                skipping = False
                n_books += 1
                chapter = None
                title = next((t for vol, page, t in renames if page == e["page"] and vol in (None, k + 1)),
                             None) or tidy(e["title"])
                out.append(f"\n## {n_books} {title}\n")
                # A long opening, too, is cut: its first part is the locus's introduction.
                for k_, (sub, part) in enumerate(split_long(title, title, body)):
                    if k_:
                        out.append(f"\n### {sub}\n")
                        n_sections += 1
                    text = section_text(part)
                    if text:
                        out.append(text + "\n")
                continue
            if skipping:
                continue
            own = tidy(e["title"], keep_number=True)
            if e["chapter"]:
                # Its title as a prefix, to the end of its first clause.
                chapter = re.split(r"[:;]\s|,\s(?=and in particular|that is|or\b)", own)[0]
                if len(chapter) > 80:
                    chapter = chapter[:80].rsplit(" ", 1)[0].rstrip(",") + "…"
                title = own
            else:
                title = f"{chapter}: {own}" if chapter else own
            for title, part in split_long(title, chapter or own, body):
                if len(title) > 220:
                    title = title[:220].rsplit(" ", 1)[0] + "…"
                if re.match(r"\d", title):
                    title = "No. " + title  # not a section number of the edition's
                out.append(f"\n### {title}\n")
                text = section_text(part)
                if text:
                    out.append(text + "\n")
                n_sections += 1
    Path(args.out).write_text("\n".join(out).lstrip() + "\n")
    print(f"{args.out}: {n_books} loci, {n_sections} sections")


if __name__ == "__main__":
    main()
