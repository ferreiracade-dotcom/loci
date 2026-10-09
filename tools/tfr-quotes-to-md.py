"""A one-book commentary from The Faith Received whose verses are marked only by the text quoted
-> Loci commentary Markdown.

Heshusius on 1 Corinthians sets each verse (or run of verses) he expounds in italics before his
exposition, with no verse number: "Paulus vocatus Apostolus Iesu Christi, per voluntatem Dei..."
Each paragraph that opens with italics is matched against the chapter in the Clementine Vulgate:
where its words are the words of a verse (or of a run of verses, the first verse by the quote's
opening words, the last by its closing ones), an excerpt opens there. Chapter headings ("CAPUT
XII.") count only in sequence, so a treatise's own chapters ("DE COENA DOMINI. CAPUT I. ...")
stay within the chapter that holds it; a treatise heading, "Loci Doctrinae" and the like open an
excerpt of their own at the verse in hand.

  python3 tools/tfr-quotes-to-md.py <slug> <book code> <out.md> [--from-head REGEX]

Heshusius, as Loci ships him:

  python3 tools/tfr-quotes-to-md.py heshusius-explicatio-in-1-corinthios 1CO \\
      "resources/commentaries/Heshusius 1 Corinthians.md" --from-head "^ARGUMENTUM"
"""
import argparse
import importlib.util
import json
import re
import xml.etree.ElementTree as ET
from pathlib import Path

spec = importlib.util.spec_from_file_location("tfr_books", Path(__file__).parent / "tfr-books-to-md.py")
tb = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tb)
NS = tb.NS


def lead_italic(el):
    """The italic text a paragraph opens with, or ""."""
    if (el.text or "").strip():
        return ""
    parts = []
    for ch in el:
        if ch.tag.replace(NS, "") == "hi" and "italic" in (ch.get("rend") or ""):
            parts.append(tb.text_of(ch))
            if (ch.tail or "").strip():
                break
        elif ch.tag.replace(NS, "") in ("pb", "fw"):
            continue
        else:
            break
    return " ".join(" ".join(parts).split())


def pages(slug, lang, tei_v):
    """[[(kind, text, part, lead)]] per page."""
    root = ET.fromstring(tb.get(slug, f"tei.{lang}.xml?v={tei_v}"))
    out = [[]]

    def walk(el):
        for e in el:
            tag = e.tag.replace(NS, "")
            if tag == "pb":
                out.append([])
            elif tag in ("head", "p", "item"):
                t = tb.text_of(e)
                if t:
                    out[-1].append(("head" if tag == "head" else "p", t, e.get("part"),
                                    lead_italic(e) if tag == "p" else ""))
                for _ in e.iter(NS + "pb"):
                    out.append([])
            elif tag in ("div", "list", "body"):
                walk(e)

    walk(root.find(f"{NS}text/{NS}body"))
    return out


def vulgate(code, ch, memo={}):
    """{verse: set of words} of a chapter of the Clementine Vulgate."""
    if (code, ch) not in memo:
        memo[code, ch] = {v: {tb.latin(w) for w in tb.LATIN_WORD.findall(t)}
                          for v, t in tb.fetch_verses("lat_clv", code, ch).items()}
    return memo[code, ch]


def content(text):
    return [w for w in (tb.latin(x) for x in tb.LATIN_WORD.findall(text)) if len(w) >= 2 and w not in tb.STOP]


def match(quote, code, ch, at):
    """(first verse, last verse) of the chapter the quote gives, looked for from a little before the
    verse in hand, or None. Heshusius translates afresh ("lacte vos potavi" where the Vulgate has
    "lac vobis potum dedi"), so the words need only mostly agree: the quote's opening words choose
    its first verse, its closing words its last, and the whole must be mostly those verses' words."""
    words = content(quote)
    if len(words) < 3:
        return None
    verses = vulgate(code, ch)

    def hits(ws, v):
        vw = verses.get(v, ())
        return [w for w in ws if w in vw]

    head, tail = words[:8], words[-8:]
    best = None
    for v in sorted(verses):
        if v < at - 2:
            continue
        h = hits(head, v)
        score = len(h) / len(head)
        if len(h) >= min(3, len(head)) and sum(len(w) >= 4 for w in h) >= 2 and score >= 0.4:
            if best is None or score > best[0] + 0.15:
                best = (score, v)
    if best is None:
        return None
    first = last = best[1]
    for v in range(first, min(first + 15, max(verses) + 1)):
        if len(hits(tail, v)) / len(tail) >= 0.4:
            last = v
    span = set().union(*(verses.get(v, set()) for v in range(first, last + 1)))
    if sum(w in span for w in words) / len(words) < 0.45:
        return None
    return first, last


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("slug")
    ap.add_argument("code")
    ap.add_argument("out")
    ap.add_argument("--from-head", default=r"^ARGUMENT")
    args = ap.parse_args()
    meta = json.loads(tb.get(args.slug, "meta.json"))
    en, la = pages(args.slug, "en", meta["tei_v"]), pages(args.slug, "la", meta["tei_v"])
    assert len(en) == len(la)
    blocks = []
    for pe, pl in zip(en, la):
        leads = [b[3] for b in pl]
        paired = tb.pair([b[:3] for b in pe], [b[:3] for b in pl])
        # pair() keeps the Latin's blocks in order: give each its lead back.
        li = 0
        for kind, t_en, t_la, part in paired:
            lead = ""
            while li < len(pl) and pl[li][1] != t_la:
                li += 1
            if li < len(pl):
                lead = leads[li]
                li += 1
            blocks.append((kind, t_en, t_la, part, lead))
    start = next(i for i, b in enumerate(blocks) if b[0] == "head" and re.search(args.from_head, b[2]))
    code, counts = args.code, tb.COUNTS[args.code]
    excerpts, cur = [], None
    chapter, verse, treatise = 0, 1, ""
    stats = {"chapters": 0, "verses": 0}

    def open_(c, v, v2=None, title=""):
        nonlocal cur
        cur = {"c": c, "v": v, "v2": v2 or v, "title": title, "en": [], "la": []}
        excerpts.append(cur)

    open_(1, 1, title="Introduction")
    for kind, t_en, t_la, part, lead in blocks[start:]:
        src = t_la or t_en
        m = re.match(r"^\W*CAPUT\s+([IVXL]+)\b", src) if kind == "head" else None
        if m and tb.roman(m.group(1)) == chapter + 1 and chapter < len(counts):
            chapter, verse, treatise = chapter + 1, 1, ""
            open_(chapter, 1, title="Argument")
            stats["chapters"] += 1
        elif chapter and kind == "head" and re.search(r"Loci Doctrinae|DE COENA|SECUNDA PARS|^\W*CAPUT", src):
            # "Loci Doctrinae.", "DE COENA DOMINI.", a treatise's own "CAPUT V.": a section of its own
            # at the verse in hand.
            title = tb.title_case(t_en or t_la)
            if re.match(r"^\W*DE\s+[A-Z]", src):
                treatise = title  # "Concerning the Lord's Supper", whose own chapters follow
            elif re.match(r"^\W*CAPUT", src) and treatise:
                title = f"{treatise}: {title}"
            open_(chapter, verse, title=title)
        elif chapter and kind == "p" and lead:
            found = match(lead, code, chapter, verse)
            if found:
                v, v2 = found
                stats["verses"] += 1
                verse = max(verse, v2)
                if cur["title"] == "" and cur["c"] == chapter and cur["v"] <= v <= cur["v2"]:
                    cur["v2"] = max(cur["v2"], v2)  # a phrase of the passage in hand taken up again
                elif cur["en"] or cur["title"] not in ("", "Argument") or (cur["c"], cur["v"]) != (chapter, v):
                    open_(chapter, v, v2)
                else:
                    cur["v"], cur["v2"] = v, v2
        if part in ("M", "F") and cur["en"] and kind == "p":
            cur["en"][-1] += " " + t_en
            cur["la"][-1] += " " + t_la
        else:
            cur["en"].append(t_en)
            cur["la"].append(t_la)
    excerpts = [e for e in excerpts if e["en"] or e["la"]]
    # Where the exposition steps back to an earlier verse, the excerpts go in verse order.
    intro = [e for e in excerpts if e["c"] == 1 and e["title"] == "Introduction"]
    excerpts = intro + sorted((e for e in excerpts if e not in intro),
                              key=lambda e: (e["c"], e["v"], e["title"] != "Argument"))
    lines = [f"# {tb.NAMES[code]}", ""]
    for k, e in enumerate(excerpts):
        head = f"{e['c']}:{e['v']}" if e["v2"] <= e["v"] else f"{e['c']}:{e['v']}-{e['v2']}"
        lines.append(f"## {head} {e['title']}".rstrip())
        if k == 0:
            lines.append(f"[{meta['author']}, {meta.get('title_la') or meta['title']} ({meta.get('volume', '')}). "
                         f"English: machine translation, The Faith Received (Mere Orthodoxy); the original "
                         f"follows each comment.]")
        lines.append("\n\n".join(p for p in e["en"] if p))
        la_ = [p for p in e["la"] if p]
        if la_:
            lines.append("\nLatin:\n\n" + "\n\n".join(la_))
        lines.append("")
    Path(args.out).write_text("\n".join(lines), encoding="utf8")
    print(stats, len(excerpts), "excerpts")


if __name__ == "__main__":
    main()
