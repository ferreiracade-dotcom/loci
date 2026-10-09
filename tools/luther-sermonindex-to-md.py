"""SermonIndex's "Luther's Commentary on Selected Bible Passages" (MyBible module) -> Loci Markdown.

The module's references cannot be trusted: its entries drift from the verses they belong to, a few
verses at first and whole books by the end (Psalm 82 sits at Psalm 113, Galatians in Ephesians), and
each preface or sermon is repeated on every verse it was spread over, with a placeholder ("No
Commentary on these verses is yet included") on the rest. So each distinct entry is placed by what
it says of itself, in the module's order:

- a sermon by the text in its title ("Sermon for the First Sunday in Lent; Matthew 4:1-11"), the
  parts of a sermon the module split ("[[This sermon is split in two parts...]]") joined again;
- a preface at the first verse of the book it introduces ("Preface To The Book Of Job");
- the running commentaries (Genesis 4:8-9:29, Psalm 82, the Sermon on the Mount, Galatians) by
  their chapter headings ("CHAPTER VI.", "THE SIXTH CHAPTER OF ST. MATTHEW.") and verse labels
  ("V.23, 24."), a label falling back to verse 1 opening the next chapter.

  python3 tools/luther-sermonindex-to-md.py SI-LUTHERCMT.commentaries.SQLite3 "resources/commentaries/Luther.md"

(from https://www.sermonindex.net/modules/mybible/SI-LUTHERCMT.commentaries.zip)
"""
import html
import re
import sqlite3
import sys
from collections import Counter
from pathlib import Path

SHARED = Path(__file__).parent.parent / "src" / "shared"
COUNTS = {code: [int(x) for x in counts.split(",")]
          for code, counts in re.findall(r"'?(\w{3})'?: \[([\d, ]+)\]", (SHARED / "versification.ts").read_text())}
ENTRIES = re.findall(r"\['(\w{3})', '([^']+)', \d+, \[([^\]]*)\]\]", (SHARED / "scriptureRef.ts").read_text())
NAMES = {code: name for code, name, _ in ENTRIES}
ALIASES = {}
for code, name, aliases in ENTRIES:
    for a in [name] + re.findall(r"'([^']+)'", aliases):
        ALIASES[a.lower().rstrip(".")] = code
ALIASES.update({"matt": "MAT", "cor": None, "revelations": "REV", "philipplans": "PHP"})
BOOK = "|".join(sorted((re.escape(a) for a in ALIASES if a), key=len, reverse=True))
PASSAGE = re.compile(rf"\b({BOOK})\.?\s+(\d+)(?::(\d+))?(?:\s*-\s*(\d+)(?::(\d+))?)?((?:\s*[;,]\s*\d+:\d+(?:\s*-\s*\d+(?::\d+)?)?)*)",
                     re.I)
REGION = {10: "GEN", 230: "PSA", 470: "MAT", 560: "GAL", 570: "GAL"}  # where the running commentaries sit (Galatians runs on into Ephesians)
START = {"GEN": 4, "PSA": 82, "MAT": 5, "GAL": 1}
ROMAN = {"I": 1, "V": 5, "X": 10, "L": 50}
ORDINAL = {"FIRST": 1, "SECOND": 2, "THIRD": 3, "FOURTH": 4, "FIFTH": 5, "SIXTH": 6, "SEVENTH": 7}
stats = Counter()


def roman(s):
    v = [ROMAN[c] for c in s]
    return sum(-a if a < b else a for a, b in zip(v, v[1:] + [0]))


def paragraphs(h):
    h = h.replace("\x97", "—").replace("\x93", "“").replace("\x94", "”").replace("\x92", "’").replace("\x91", "‘")
    h = re.sub(r"<br\s*/?>", "\n", h)
    out = []
    for p in re.split(r"</p>|\n", h):
        t = html.unescape(re.sub(r"<[^>]+>", "", p))
        t = re.sub(r"\s+", " ", t).strip()
        if t:
            out.append(re.sub(r"^#+\s*", "", t))
    return out


def passage(text):
    """(book, c, v, c2, v2) of the first passage named, its further parts ("; 10:1-5") included."""
    m = PASSAGE.search(text)
    if not m:
        return None
    code = ALIASES.get(m.group(1).lower().rstrip("."))
    if m.group(1).lower().startswith("cor"):
        code = None
    if not code:
        m2 = re.match(r"([12])\s*cor", text[max(0, m.start() - 3):m.end()].strip(), re.I)
        code = {"1": "1CO", "2": "2CO"}.get(m2.group(1)) if m2 else None
    if not code:
        return None
    c, v = int(m.group(2)), int(m.group(3) or 1)
    if m.group(4) and m.group(5):
        c2, v2 = int(m.group(4)), int(m.group(5))
    elif m.group(4):
        c2, v2 = c, int(m.group(4))
    elif m.group(3):
        c2, v2 = c, v
    else:
        c2, v2 = c, COUNTS[code][c - 1]  # a whole chapter ("1 Corinthians 13")
    for part in re.findall(r"(\d+):(\d+)(?:\s*-\s*(\d+)(?::(\d+))?)?", m.group(6) or ""):
        pc, pv, e1, e2 = part
        c2, v2 = (int(e1), int(e2)) if e2 else (int(pc), int(e1 or pv))
    if (c2, v2) < (c, v) or c2 > len(COUNTS[code]):
        c2, v2 = c, v
    return code, c, v, c2, min(v2, COUNTS[code][c2 - 1])


PREFACES = [("introduction to the old testament", "GEN"), ("new testament", "MAT"), ("sermon on the mount", "MAT"),
            ("book of job", "JOB"), ("psalter", "PSA"), ("books of solomon", "PRO"), ("preacher", "ECC"),
            ("prophet jeremiah", "JER"), ("prophet ezekiel", "EZK"), ("prophet daniel", "DAN"),
            ("prophet hosea", "HOS"), ("the prophets", "ISA"), ("acts of the apostles", "ACT"),
            ("to the romans", "ROM"), ("first epistle of saint paul to the corinthians", "1CO"),
            ("second epistle of saint paul to the corinthians", "2CO"), ("galatians", "GAL"), ("ephesians", "EPH"),
            ("philipp", "PHP"), ("colossians", "COL"), ("first epistle of saint paul to the thessalonians", "1TH"),
            ("second epistle of saint paul to the thessalonians", "2TH"), ("first epistle of saint paul to timothy", "1TI"),
            ("second epistle of saint paul to timothy", "2TI"), ("titus", "TIT"), ("philemon", "PHM"),
            ("hebrews", "HEB"), ("saint james and saint jude", "JAS"), ("first epistle of saint peter", "1PE"),
            ("second epistle of saint peter", "2PE"), ("three epistles of saint john", "1JN"),
            ("revelation of saint john", "REV")]


def preface_book(title):
    """The book a preface stands before ("the Prophets" before Isaiah, "the Books of Solomon" before
    Proverbs, "the Three Epistles of Saint John" before 1 John)."""
    t = title.lower()
    return next((code for words, code in PREFACES if words in t), None)


def title_case(s):
    small = {"a", "an", "and", "of", "on", "the", "to", "in", "for", "by", "from", "with", "or", "after", "before"}
    return " ".join(w if k == 0 or w.lower() not in small else w.lower() for k, w in enumerate(s.split()))


def main(src, out):
    db = sqlite3.connect(src)
    rows = db.execute("SELECT book_number, chapter_number_from, verse_number_from, text FROM commentaries "
                      "ORDER BY book_number, chapter_number_from, verse_number_from").fetchall()
    seen, entries = set(), []
    for bn, c, v, t in rows:
        if t and t not in seen:
            seen.add(t)
            entries.append((bn, t))
    excerpts = []  # dicts: book, c, v, c2, v2, title, paras, order
    run = {"book": None, "c": 0, "v": 0}
    last_note, last_sermon = None, None
    for n, (bn, t) in enumerate(entries):
        paras = paragraphs(t)
        if any("No Commentary on these verses is yet included" in p for p in paras[:3]):
            stats["placeholders"] += 1
            continue
        note = paras[0] if paras[0].startswith("[[") else None
        body = paras[1:] if note else paras
        # A book's name standing before its preface ("Galatians", "1 Corinthians").
        if len(body) > 1 and body[0].lower().rstrip(".") in ALIASES and len(body[0]) < 20:
            body = body[1:]
        head = body[0] if body else ""
        if len(body) > 1 and len(head) < 30 and re.match(r"^(?:From The )?Preface To\b", body[1], re.I):
            body, head = body[1:], body[1]  # "Acts of the Apostles" over its preface
        if re.match(r"^(?:From The )?(?:Luther's )?(?:Preface|Introduction) To\b", head, re.I):
            code = preface_book(head)
            if not code:
                stats["prefaces unplaced"] += 1
                print("unplaced preface:", head[:80])
                continue
            c = 5 if "sermon on the mount" in head.lower() else 1
            excerpts.append({"book": code, "c": c, "v": 1, "c2": c, "v2": 1, "order": n, "paras": body,
                             "title": "Introduction: " + title_case(re.sub(r"\s*\d{4}.*$|\s*\(\d.*$", "", head))})
            stats["prefaces"] += 1
            continue
        sermon = next((p for p in body[:3] if re.match(r"^(?:A |Second |Third )?(?:\w+ )?(?:Christmas )?Sermon\b", p)
                       and passage(p)), None)
        if sermon or (note and note == last_note and last_sermon):
            if sermon:
                code, c, v, c2, v2 = passage(sermon)
                last_sermon = {"book": code, "c": c, "v": v, "c2": c2, "v2": v2, "order": n,
                               "title": title_case(sermon.split(";")[0].strip()), "paras": list(body)}
                excerpts.append(last_sermon)
                stats["sermons"] += 1
            else:
                last_sermon["paras"] += body  # the next part of a sermon the module split
                stats["sermon parts joined"] += 1
            last_note = note
            continue
        if note and passage(note) and not sermon:
            # A part whose note names the passage but whose title the module left out.
            code, c, v, c2, v2 = passage(note)
            last_sermon = {"book": code, "c": c, "v": v, "c2": c2, "v2": v2, "order": n, "title": "Sermon",
                           "paras": list(body)}
            excerpts.append(last_sermon)
            last_note = note
            stats["sermons by note"] += 1
            continue
        # The running commentaries.
        book = REGION.get(bn)
        if not book:
            stats["entries unplaced"] += 1
            print("unplaced:", bn, head[:80])
            continue
        if run["book"] != book:
            run = {"book": book, "c": START[book], "v": 1}
        cur = None
        pending = []
        for p in body:
            m = re.match(r"^(?:THE\s+)?CHAPTER\s+([IVXL]+)\b|^THE\s+(\w+)\s+CHAPTER", p)
            if m:
                run["c"] = roman(m.group(1)) if m.group(1) else ORDINAL.get(m.group(2), run["c"])
                run["v"] = 1
                pending.append(p)
                continue
            m = re.match(r"^V\.\s?(\d+)[a-z]?(?:\s*(?:-|,)\s*(\d+))?", p)
            if m:
                vn = int(m.group(1))
                if vn < run["v"] and vn <= 2 and run["c"] < len(COUNTS[book]):
                    run["c"] += 1  # Galatians: verse 1 again is the next chapter
                vn = min(vn, COUNTS[book][run["c"] - 1])
                v2 = max(vn, min(int(m.group(2) or vn), COUNTS[book][run["c"] - 1]))
                run["v"] = vn
                if cur and (cur["c"], cur["v"]) == (run["c"], vn):
                    cur["v2"] = max(cur["v2"], v2)
                else:
                    cur = {"book": book, "c": run["c"], "v": vn, "c2": run["c"], "v2": v2, "order": n,
                           "title": "", "paras": []}
                    excerpts.append(cur)
                cur["paras"] += pending + [p]
                pending = []
                continue
            if cur is None and len(p) < 200:
                pending.append(p)  # a section heading before the verse it opens
            elif cur is None:
                # Running text before any label in this entry: it goes on with the verse in hand.
                prev = next((e for e in reversed(excerpts) if e["book"] == book and not e["title"]), None)
                if prev:
                    prev["paras"] += pending + [p]
                else:
                    cur = {"book": book, "c": run["c"], "v": run["v"], "c2": run["c"], "v2": run["v"],
                           "order": n, "title": "", "paras": pending + [p]}
                    excerpts.append(cur)
                pending = []
            else:
                cur["paras"] += pending + [p]
                pending = []
        if pending:
            target = cur or next((e for e in reversed(excerpts) if e["book"] == book), None)
            if target:
                target["paras"] += pending
        stats["commentary entries"] += 1

    codes = [code for code, _, _ in ENTRIES]
    excerpts.sort(key=lambda e: (codes.index(e["book"]), e["c"], e["v"], not e["title"].startswith("Introduction"),
                                 e["order"]))
    lines, cur_book = [], None
    for e in excerpts:
        if e["book"] != cur_book:
            lines += [f"# {NAMES[e['book']]}", ""]
            cur_book = e["book"]
        c, v, c2, v2 = e["c"], e["v"], e["c2"], e["v2"]
        ref = f"{c}:{v}" if (c2, v2) <= (c, v) else f"{c}:{v}-{v2}" if c2 == c else f"{c}:{v}-{c2}:{v2}"
        lines.append(f"## {ref} {e['title']}".rstrip())
        lines.append("\n\n".join(e["paras"]))
        lines.append("")
    Path(out).write_text("\n".join(lines), encoding="utf8")
    print(dict(stats), len(excerpts), "excerpts")


if __name__ == "__main__":
    main(*sys.argv[1:])
