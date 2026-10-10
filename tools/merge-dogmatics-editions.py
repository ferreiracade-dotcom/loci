"""Two editions of one dogmatics -> one Loci dogmatics Markdown file, aligned paragraph by paragraph.

Made for Baier's Compendium Theologiae Positivae: the 1686 edition (complete, its paragraphs
numbered "§ I." and each followed by Baier's notes, in English only; a Loci Markdown file from
tools/pdf-dogmatics-to-md.py) and Walther's edition (1879), the same text with Walther's long
notes and the Latin, from The Faith Received (the --dump-json of tools/tfr-dogmatics-to-md.py),
breaking off after Predestination. The 1686 edition is the spine: each of its chapters and §s is
kept as it is, and under each § comes the stretch of Walther's edition that begins with that
paragraph (his translation of it, his notes on it), with the Latin folded below.

Each § is found in Walther's chapter by its words (both are translations of the same Latin): the §s
of a chapter are placed in order where their words best match the start of a paragraph, a § with
no good match sharing the stretch of the one before. Whatever of Walther's chapter comes before its
first placed § goes with the first.

  python3 tools/merge-dogmatics-editions.py <spine.md> <walther.json> <walther.md> <out.md> \\
      --title TITLE --map SPINE:WALTHER ... [--insert AFTER:WALTHER ...]

--map pairs a spine chapter (or several joined by +, which share one of Walther's chapters, as
1686's three sections on Christ share Walther's one chapter) with a chapter of Walther's, by their
numbers in the two files. --insert puts a chapter only Walther has after a spine chapter, as it
stands in the Walther Markdown. Spine chapters not mapped are kept alone.

Baier, as Loci ships him:

  python3 tools/merge-dogmatics-editions.py tools/sources/baier/baier-1686.md \\
      tools/sources/baier/walther.json tools/sources/baier/baier-walther.md \\
      "resources/dogmatics/Baier Compendium Theologiae Positivae.md" \\
      --title "Compendium Theologiae Positivae (1686, with Walther's Notes)" \\
      --map 1:1 2:2 3:3 4:4 5:5 6:6 7:7 8:8 9:9 10:10 11:11 12:12 13:13 14:14 15:15 \\
      --insert 15:16 --map 16+17+18:17 19:18 20:19 21:20 22:21 23:22 24:23 25:24 26:25 27:26 28:27

followed by a line under the title crediting the two editions.
(walther.json and the Walther Markdown come from the Baier command in tfr-dogmatics-to-md.py, run
with --dump-json walther.json; the spine from pdf-dogmatics-to-md.py.)
"""
import argparse
import importlib.util
import json
import math
import re
from pathlib import Path

spec = importlib.util.spec_from_file_location("td", Path(__file__).parent / "tfr-dogmatics-to-md.py")
td = importlib.util.module_from_spec(spec)
spec.loader.exec_module(td)

STOP = set("the of and to in a is that which by be as for this or are it from with not but on his he they "
           "their its also an at we so who those these than all one has have was were said".split())


def words(t):
    return {w for w in re.findall(r"[a-z]+", t.lower()) if w not in STOP and len(w) > 2}


def chapters(md):
    """[(heading line, intro text, [(section heading, text)])] from a Loci dogmatics file."""
    out = []
    for chunk in re.split(r"\n(?=## )", md)[1:]:
        head, _, body = chunk.partition("\n")
        parts = re.split(r"\n(?=### )", body)
        secs = []
        for sc in parts[1:]:
            h, _, t = sc.partition("\n")
            secs.append((h, t.strip()))
        out.append((head, parts[0].strip(), secs))
    return out


def align(secs, blocks):
    """The block each § begins at (or None), in order, maximising how well the §s' own words (before
    their notes) match the paragraphs they are set at."""
    mains = [words(re.split(r"\n\nNotes?\.", t)[0]) for _, t in secs]
    cand = []
    for k, m in enumerate(mains):
        row = {}
        for j, b in enumerate(blocks):
            bw = words(b["en"])
            if len(bw) < 6 or not m:
                continue
            s = len(m & bw) / math.sqrt(len(m) * len(bw))
            if re.match(r"^\W*(?:§\s*)?\d+\.\s", b["en"]):
                s += 0.15  # Walther's own paragraph numbers
            if s >= 0.35:
                row[j] = s
        cand.append(row)
    # best[k][j]: the best total for §s 0..k with § k at block j; skipping a § scores nothing.
    n = len(blocks)
    prev = [0.0] * (n + 1)  # prev[j]: best total so far with the last placed § before block j
    back = []
    for k in range(len(secs)):
        cur_at = {}
        for j, s in cand[k].items():
            cur_at[j] = prev[j] + s
        # Running best over "§ k placed at or before j" or "§ k skipped".
        nxt, choice, run, run_from = [0.0] * (n + 1), [None] * (n + 1), float("-inf"), None
        for j in range(n + 1):
            if j - 1 in cur_at and cur_at[j - 1] > run:
                run, run_from = cur_at[j - 1], j - 1
            if prev[j] >= run:
                nxt[j], choice[j] = prev[j], None
            else:
                nxt[j], choice[j] = run, run_from
        back.append(choice)
        prev = nxt
    # Walk back from the end.
    at, j = [None] * len(secs), n
    for k in range(len(secs) - 1, -1, -1):
        c = back[k][j]
        at[k] = c
        if c is not None:
            j = c
    return at


def walther_text(blocks):
    if not blocks:
        return ""
    tuples = [(b["page"], b["kind"], b["en"], b["la"], b["part"]) for b in blocks]
    return td.section_text(tuples)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("spine")
    ap.add_argument("walther_json")
    ap.add_argument("walther_md")
    ap.add_argument("out")
    ap.add_argument("--title", required=True)
    ap.add_argument("--map", nargs="+", action="extend", default=[])
    ap.add_argument("--insert", nargs="+", action="extend", default=[])
    args = ap.parse_args()

    spine = chapters(Path(args.spine).read_text())
    walther = json.loads(Path(args.walther_json).read_text())
    walther_md = chapters(Path(args.walther_md).read_text())
    mapping = {}
    for m in args.map:
        left, right = m.split(":")
        group = [int(x) - 1 for x in left.split("+")]
        for x in group:
            mapping[x] = (group, int(right) - 1)
    inserts = {}
    for m in args.insert:
        after, w = m.split(":")
        inserts.setdefault(int(after) - 1, []).append(int(w) - 1)

    out = [f"# {args.title}\n"]
    n_books, placed, total = 0, 0, 0
    done = set()
    spans = {}
    for i, (head, intro, secs) in enumerate(spine):
        if i in mapping and i not in done:
            group, w = mapping[i]
            # The §s of the whole group, in order, aligned to the one chapter of Walther's.
            flat = [(g, n, s) for g in group for n, s in enumerate(spine[g][2])]
            blocks = walther[w]["blocks"]
            at = align([s for _, _, s in flat], blocks)
            starts = [(k, a) for k, a in enumerate(at) if a is not None]
            placed += len(starts)
            total += len(flat)
            span = {}
            for idx, (k, a) in enumerate(starts):
                end = starts[idx + 1][1] if idx + 1 < len(starts) else len(blocks)
                span[k] = blocks[0 if idx == 0 else a:end]
            for k, (g, n, _) in enumerate(flat):
                spans[(g, n)] = span.get(k, [])
            done.update(group)
        n_books += 1
        title = re.sub(r"^##\s+\d+\s+", "", head)
        out.append(f"\n## {n_books} {title}\n")
        if intro:
            out.append(intro + "\n")
        for n, (h, t) in enumerate(secs):
            out.append(f"\n{h}\n")
            extra = walther_text(spans.get((i, n), []))
            if extra:
                english, _, latin = extra.partition("\n\nLatin:\n\n")
                t = t + "\n\nFrom Walther's edition (1879):\n\n" + english
                if latin:
                    t += "\n\nLatin:\n\n" + latin
            out.append(t + "\n")
        for w in inserts.get(i, []):
            whead, wintro, wsecs = walther_md[w]
            n_books += 1
            wtitle = re.sub(r"^##\s+\d+\s+", "", whead)
            out.append(f"\n## {n_books} {wtitle} (Walther's edition)\n")
            if wintro:
                out.append(wintro + "\n")
            for h, t in wsecs:
                out.append(f"\n{h}\n{t}\n")
    Path(args.out).write_text("\n".join(out).replace("\n\n\n", "\n\n"))
    print(f"{args.out}: {n_books} chapters; {placed} of {total} paragraphs found in Walther's edition")


if __name__ == "__main__":
    main()
