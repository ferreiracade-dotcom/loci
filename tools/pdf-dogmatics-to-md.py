"""A dogmatics typeset in Word as a two-column PDF -> one Loci dogmatics Markdown file.

Made for Kaden Green's translation of Baier's Compendium Theologiae Positivae (Jena 1686), whose
pages run: a running head at the top, a page number at the foot, chapter titles in large type
across both columns ("CHAPTER II." / "ON FAITH IN CHRIST."), and the text in two columns of
numbered paragraphs ("§ I. ...", "§ II. ...") each followed by its "Notes.". Each chapter (or
section of a chapter, as Part III, Chapter I has three) becomes a book, and each § a section
numbered as the edition numbers it.

  python3 tools/pdf-dogmatics-to-md.py <in.pdf> <out.md> --title TITLE

The translation is modern and not for redistribution, so its Markdown goes to the user's own vault
(the dogmatics folder), not into resources/dogmatics.
"""
import argparse
import re

import pdfplumber

TOP, FOOT = 45, 720  # running heads above, page numbers below (points)
TITLE_SIZE = 16  # chapter titles are set larger than the 12-point text
ROMAN = {"I": 1, "V": 5, "X": 10, "L": 50, "C": 100}


def roman(s):
    vals = [ROMAN[c] for c in s.upper()]
    return sum(-a if a < b else a for a, b in zip(vals, vals[1:] + [0]))


def page_lines(page):
    """A page's lines in reading order: titles across the page as they come, and each run of
    two-column text left column first, then right. A gap of more than a line between rows starts a
    new paragraph (an empty line)."""
    mid = page.width / 2
    words = [w for w in page.extract_words(x_tolerance=1.5, y_tolerance=2, extra_attrs=["size"])
             if TOP < w["top"] < FOOT]
    rows = []
    for w in sorted(words, key=lambda w: (round(w["top"]), w["x0"])):
        if rows and abs(rows[-1][0] - w["top"]) < 2.5:
            rows[-1][1].append(w)
        else:
            rows.append([w["top"], [w]])

    def text(ws):
        return " ".join(w["text"] for w in sorted(ws, key=lambda w: w["x0"]))

    out, cols = [], None

    def column(lst, top, ws):
        if lst and top - lst[-1][0] > 20:
            lst.append((top, ""))
        lst.append((top, text(ws)))

    def flush():
        nonlocal cols
        if cols:
            for side in cols:
                out.extend(t for _, t in side)
                out.append("")
        cols = None

    for top, ws in rows:
        title = max(w["size"] for w in ws) >= TITLE_SIZE
        across = any(w["x0"] < mid - 4 and w["x1"] > mid + 4 for w in ws)
        if title or across:
            flush()
            out.append(("# " if title else "") + text(ws))
            out.append("")
        else:
            cols = cols or ([], [])
            left = [w for w in ws if w["x1"] <= mid + 4]
            right = [w for w in ws if w["x0"] >= mid - 4]
            if left:
                column(cols[0], top, left)
            if right:
                column(cols[1], top, right)
    flush()
    return out


def paragraphs(lines):
    """Lines -> paragraphs; a title line ("# ...") stands alone. A paragraph cut by a column or page
    end runs on when the next line does not open a new one (a §, "Notes.", or a capital after a
    full stop)."""
    paras, cur = [], []
    for line in lines:
        if line.startswith("# "):
            if cur:
                paras.append(" ".join(cur))
                cur = []
            paras.append(line)
        elif not line.strip():
            if cur:
                paras.append(" ".join(cur))
                cur = []
        else:
            cur.append(line.strip())
    if cur:
        paras.append(" ".join(cur))
    # Join a paragraph to the one before when it was only cut by a column or page break.
    out = []
    for p in paras:
        if (out and not p.startswith("# ") and not out[-1].startswith("# ")
                and not re.match(r"^(§|Notes\.)", p) and not re.search(r"[.!?:”\")]$", out[-1])):
            out[-1] += " " + p
        else:
            out.append(p)
    return out


def title_case(s):
    small = {"a", "an", "and", "as", "at", "by", "for", "in", "of", "on", "or", "the", "to", "upon", "with"}
    words = s.lower().split()
    return " ".join(w if i and w in small else w[:1].upper() + w[1:] for i, w in enumerate(words)).rstrip(".")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf")
    ap.add_argument("out")
    ap.add_argument("--title", required=True)
    args = ap.parse_args()

    lines = []
    with pdfplumber.open(args.pdf) as pdf:
        for page in pdf.pages:
            lines += page_lines(page)
    paras = paragraphs(lines)

    out = [f"# {args.title}\n"]
    books, part, i = 0, None, 0
    pending = []  # title lines of the chapter being opened
    section_no = None
    started = False
    while i < len(paras):
        p = paras[i]
        if p.startswith("# "):
            pending.append(p[2:].strip())
            i += 1
            continue
        if pending:
            heads = " ".join(pending)
            pending = []
            m = re.search(r"PART (ONE|TWO|THREE|FOUR) OF [A-Z ]*?THEOLOGY", heads)
            if m:
                part = m.group(1).title()
                heads = heads.replace(m.group(0), " ")
            if "CHAPTER" in heads:
                ch = re.search(r"CHAPTER\s+([IVXL]+)", heads)
                name = re.sub(r"\bCHAPTER\s+[IVXL]+\.?|\bSECTION\s+[IVXL]+\.?|^\W*PROLEGOMENA\b", "", heads.strip()).strip(" .")
                label = title_case(re.sub(r"\s+", " ", name)) or f"Chapter {ch.group(1)}"
                if part is None:
                    label = f"Prolegomena: {label}"
                books += 1
                started = True
                out.append(f"\n## {books} {label}\n")
            elif started and heads.strip():
                out.append(f"\n{heads.strip()}\n")
        if not started:
            i += 1
            continue
        m = re.match(r"^§\s*([IVXL]+)\.\s*(.*)$", p)
        if m:
            section_no = roman(m.group(1))
            # Titled by its opening clause, so the list of sections can be read down.
            opening = re.match(r"(.{15,90}?)[,;:.](?:\s|$)", m.group(2))
            name = opening.group(1) if opening else m.group(2)[:80].rsplit(" ", 1)[0] + "…"
            out.append(f"\n### {section_no} {name}\n")
            out.append(f"{m.group(2)}\n")
        else:
            out.append(p + "\n")
        i += 1
    open(args.out, "w").write("\n".join(out).replace("\n\n\n", "\n\n"))
    print(f"{args.out}: {books} books, {sum(1 for x in out if x.startswith(chr(10) + '### '))} sections")


if __name__ == "__main__":
    main()
