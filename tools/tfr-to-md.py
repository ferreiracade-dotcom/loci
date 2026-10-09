"""The Faith Received (Mere Orthodoxy) commentary -> Loci commentary Markdown.

Each work has parallel TEI editions, English and original (tei.en.xml, tei.la.xml), paragraph for
paragraph. Verse headings ("V. 1.", "V. 3. & V. 4.") and chapter headings ("CHAPTER II.") divide
the commentary; each excerpt is the English for its verses with the original underneath.

  python3 tools/tfr-to-md.py <slug> <Book name> <out.md> [--from-head REGEX] [--stop-head REGEX]

<slug> is the work's id in a reader link (".../read/?w=gerhard-commentarius-in-1-petri"). Downloads
are cached in tools/sources/tfr/ (not committed). Example:

  python3 tools/tfr-to-md.py gerhard-commentarius-in-1-petri "1 Peter" "resources/commentaries/Gerhard 1 Peter.md"
"""
import argparse
import json
import re
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

BASE = "https://mo-tfr-library.mo-podcast-feed.workers.dev/v1/works"
NS = "{http://www.tei-c.org/ns/1.0}"
ROMAN = {"I": 1, "V": 5, "X": 10, "L": 50, "C": 100}

ap = argparse.ArgumentParser()
ap.add_argument("slug")
ap.add_argument("book")
ap.add_argument("out")
ap.add_argument("--from-head", default=r"PROLEGOMENA")
ap.add_argument("--stop-head", default=r"^INDEX")
ap.add_argument("--cache", default=str(Path(__file__).parent / "sources" / "tfr"))
args = ap.parse_args()
cache = Path(args.cache) / args.slug
cache.mkdir(parents=True, exist_ok=True)


def get(name):
    f = cache / name
    if not f.exists():
        req = urllib.request.Request(f"{BASE}/{args.slug}/{name}", headers={
            "User-Agent": "Mozilla/5.0", "Referer": "https://mereorthodoxy.com/"})
        f.write_bytes(urllib.request.urlopen(req, timeout=120).read())
    return f.read_bytes()


meta = json.loads(get("meta.json"))


def roman(s):
    vals = [ROMAN[c] for c in s if c in ROMAN]
    return sum(-a if a < b else a for a, b in zip(vals, vals[1:] + [0]))


def text_of(el):
    """Plain text of an element: italics and markup dropped, Greek and references kept as is."""
    parts = [el.text or ""]
    for ch in el:
        tag = ch.tag.replace(NS, "")
        if tag not in ("fw", "pb", "gap", "note"):
            parts.append(text_of(ch))
        parts.append(ch.tail or "")
    return " ".join("".join(parts).split())


def blocks(lang):
    """[(kind, text, part)] in document order: kind 'head' or 'p' (lists flattened to 'p')."""
    root = ET.fromstring(get_tei(lang))
    body = root.find(f"{NS}text/{NS}body")
    out = []
    for el in body:
        tag = el.tag.replace(NS, "")
        if tag == "head":
            out.append(("head", text_of(el), None))
        elif tag == "p":
            out.append(("p", text_of(el), el.get("part")))
        elif tag == "list":
            for item in el:
                t = text_of(item)
                if t:
                    out.append(("p", t, None))
    return out


def get_tei(lang):
    f = cache / f"tei.{lang}.xml"
    if not f.exists():
        req = urllib.request.Request(f"{BASE}/{args.slug}/tei.{lang}.xml?v={meta['tei_v']}", headers={
            "User-Agent": "Mozilla/5.0", "Referer": "https://mereorthodoxy.com/"})
        f.write_bytes(urllib.request.urlopen(req, timeout=300).read())
    return f.read_bytes()


en, orig = blocks("en"), blocks("la")
assert len(en) == len(orig), (len(en), len(orig))
for (k1, _, _), (k2, _, _) in zip(en, orig):
    assert k1 == k2

VERSE = re.compile(r"^V(?:ers?)?\.\s*\d")
CHAPTER = re.compile(r"^(?:CHAPTER|CAPUT)\s+([IVXLC]+)\b", re.I)

excerpts = []  # dict(c, v, v2, title, en[], la[])
cur = None
chapter, last_v, started, stopped = 1, 0, False, False


def add(text_en, text_la, part):
    # A paragraph the page break divided (part="F" continues part="I") is one paragraph again.
    if part in ("M", "F") and cur["en"]:
        cur["en"][-1] += " " + text_en
        cur["la"][-1] += " " + text_la
    else:
        cur["en"].append(text_en)
        cur["la"].append(text_la)


for (kind, t_en, part), (_, t_la, _) in zip(en, orig):
    if kind == "head" and (re.search(args.stop_head, t_la) or re.search(args.stop_head, t_en)):
        stopped = True
    if stopped:
        break
    if not started:
        if kind == "head" and re.search(args.from_head, t_la + " " + t_en):
            started = True
            cur = {"c": 1, "v": 1, "v2": 1, "title": "Introduction", "en": [], "la": []}
            excerpts.append(cur)
        else:
            continue
    if kind == "head":
        m = CHAPTER.match(t_la) or CHAPTER.match(t_en)
        if m:
            n = roman(m.group(1).upper())
            if n != chapter:
                chapter = n
                last_v = 0
            cur["en"].append(t_en)
            cur["la"].append(t_la)
            continue
        if VERSE.match(t_la):
            nums = [int(x) for x in re.findall(r"\d+", t_la)]
            v1, v2 = nums[0], max(nums)
            if v1 < last_v:  # "V. 1." again before its chapter heading: the next chapter
                chapter += 1
            if cur and cur["title"] == "" and (cur["c"], cur["v"]) == (chapter, v1):
                cur["v2"] = max(cur["v2"], v2)  # "V. 2." repeated: the same comment goes on
            else:
                cur = {"c": chapter, "v": v1, "v2": v2, "title": "", "en": [], "la": []}
                excerpts.append(cur)
            last_v = v2
            continue
        # Any other heading is part of the text.
        cur["en"].append(t_en)
        cur["la"].append(t_la)
        continue
    if t_en or t_la:
        add(t_en, t_la, part)

# Questions and observations on a run of verses come after the last of them ("Quaeritur hoc loco"
# after 3:18 asks about 3:15): they become an excerpt of their own on the whole run, set after the
# run's first verse, so each verse of the run finds them.
QO = re.compile(r"^\W*(Quaeritur|Quaestio|Quaestiones|Observationes|Observatio)\b")
out, prev_qo = [], {}
for e in excerpts:
    k = next((i for i, p in enumerate(e["la"]) if QO.match(p)), None) if not e["title"] else None
    start = prev_qo.get(e["c"], 0) + 1
    if k is not None:
        prev_qo[e["c"]] = e["v2"]
    if k is None or k == 0 or start >= e["v"]:
        out.append(e)
        continue
    qo = {"c": e["c"], "v": start, "v2": e["v2"], "title": "Questions and observations",
          "en": e["en"][k:], "la": e["la"][k:]}
    e["en"], e["la"] = e["en"][:k], e["la"][:k]
    out.append(e)
    # after the excerpt on the run's first verse
    at = next(i for i, x in enumerate(out) if x["c"] == e["c"] and x["v"] >= start and not x["title"])
    out.insert(at + 1, qo)
excerpts = out

lines = [f"# {args.book}", ""]
for k, e in enumerate(excerpts):
    if not e["en"]:
        continue
    head = f"{e['c']}:{e['v']}" if e["v2"] <= e["v"] else f"{e['c']}:{e['v']}-{e['v2']}"
    lines.append(f"## {head} {e['title']}".rstrip())
    if e["title"] == "Introduction":
        lines.append(f"[{meta['author']}, {meta.get('title_la') or meta['title']} ({meta.get('volume', '')}). "
                     f"English: machine translation, The Faith Received (Mere Orthodoxy); the original follows "
                     f"each comment.]")
    lines.append("\n\n".join(re.sub(r"^#+\s*", "", p) for p in e["en"]))
    lines.append("\nLatin:\n\n" + "\n\n".join(re.sub(r"^#+\s*", "", p) for p in e["la"]))
    lines.append("")
Path(args.out).write_text("\n".join(lines), encoding="utf8")
print(len([e for e in excerpts if e["en"]]), "excerpts; chapters", sorted({e["c"] for e in excerpts}))
