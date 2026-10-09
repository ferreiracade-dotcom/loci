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

Melanchthon, whose lemmas are headings in Erasmus's Latin ("Gratia vobis & pax."), found the same way:

  python3 tools/tfr-quotes-to-md.py melanchthon-in-ioannem-annotationes JHN "resources/commentaries/Melanchthon John.md" \\
      --from-head "^IN PRINCIPIO" --start-chapter 1
  python3 tools/tfr-quotes-to-md.py melanchthon-commentarii-in-romanos ROM "resources/commentaries/Melanchthon Romans.md" \\
      --from-head "^ARGUMENTUM"
  python3 tools/tfr-quotes-to-md.py melanchthon-in-danielem-prophetam DAN "resources/commentaries/Melanchthon Daniel.md" \\
      --from-head "^ARGUMENTUM" --sections-only
  python3 tools/tfr-quotes-to-md.py melanchthon-explicatio-proverbiorum PRO "resources/commentaries/Melanchthon Proverbs.md" \\
      --from-head "^PRAEFATIO"
  python3 tools/tfr-quotes-to-md.py melanchthon-scholia-in-colossenses COL "resources/commentaries/Melanchthon Colossians.md" \\
      --from-head "SCHOLIA IN"

The Corpus Reformatorum volumes (philipp-melanchthon-opera-vol-14, -15) hold several works each: each is
converted from its pages to a part file, and tools/merge-commentary-md.py joins the parts. "(?!)"
matches no heading, so a part starts at its first page.

  vol. 14  PRO --pages 14-57; ECC --pages 58-93; --pericopes --pages 95-287 --from-head "^Dominica prima";
           MAT --pages 288-292 --start-chapter 1 --label "Notes on Matthew";
           MAT --pages 293-542 --from-head "^CONCIONES" --label "Sermons on Matthew"
           (pages 543-637, the Annotations on John of 1523, are Melanchthon John.md)
  vol. 15  JHN --pages 14-233; ROM --pages 235-259 --start-chapter 1 --label "Disposition of Romans";
           ROM --pages 414-545; 1CO --pages 546-621 --start-chapter 1; 2CO --pages 622-629;
           COL --pages 630-660 --start-chapter 1; PHP --pages 661-668 --start-chapter 1;
           1TI --pages 669-711 --start-chapter 1; 2TI --pages 712-725 --start-chapter 1
           (pages 260-413, the Commentarii on Romans, are largely Melanchthon Romans.md's text)

  python3 tools/merge-commentary-md.py "resources/commentaries/Melanchthon Opera 14.md" <parts in that order>
"""
import argparse
import unicodedata
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
        memo[code, ch] = {v: {stem(w) for w in words(t)} for v, t in tb.fetch_verses("lat_clv", code, ch).items()}
    return memo[code, ch]


def words(text):
    """Latin words as the Vulgate and the old prints both spell them ("iusticia", "quòd", "vo-catus")."""
    text = re.sub(r"(\w)-\s*(\w)", r"\1\2", text)
    text = "".join(ch for ch in unicodedata.normalize("NFD", text) if not unicodedata.combining(ch))
    return [re.sub(r"ci(?=[aeiou])", "ti", tb.latin(w)) for w in tb.LATIN_WORD.findall(text)]


def stem(w):
    """A word's first letters: an Erasmus "vivet" is the Vulgate's "vivit", "gloriamur" "gloriemur"."""
    return w[:4] if len(w) >= 5 else w


# Headings that order an argument, not words of the text ("Item.", "Alius.", "Respond:").
STRUCTURAL = {"item", "alius", "alia", "aliud", "respond", "responsio", "obiectio", "obiecto", "argumentum", "textus",
              "enarratio", "epilogus", "summa", "sententia", "locus", "loci", "quaestio", "solutio", "exordium",
              "declaratio", "effectus", "maioris", "minoris", "conclusio", "propositio", "confirmatio"}


def content(text):
    return [w for w in words(text) if len(w) >= 2 and w not in tb.STOP]


def match(quote, code, ch, at):
    """(first verse, last verse) of the chapter the quote gives, looked for from a little before the
    verse in hand, or None. The lemma may be the Vulgate's or another translation's (Heshusius's own,
    Erasmus's for Melanchthon: "lacte vos potavi" where the Vulgate has "lac vobis potum dedi"), so
    the words need only mostly agree, compared by their stems: the quote's opening words choose its
    first verse, its closing words its last, and the whole must be mostly those verses' words. A
    verse far on from the one in hand needs more of them."""
    ws = content(quote)
    verses = vulgate(code, ch)
    if not verses:
        return None
    if len(ws) < 3:
        # A lemma of a word or two ("Vocatus.", "Astutiam."): the nearest verse on that has them.
        ws = [w for w in ws if len(w) >= 4]
        if not ws or set(ws) & STRUCTURAL:
            return None
        near = [v for v in [at, at - 1] + list(range(at + 1, at + 9)) if v >= 1
                and all(stem(w) in verses.get(v, ()) for w in ws)]
        return (near[0], near[0]) if near else None
    ks = [stem(w) for w in ws]

    def hits(part, v):
        vw = verses.get(v, ())
        return [w for w in part if w in vw]

    head, tail = ks[:8], ks[-8:]
    need = 2 if len(head) <= 4 else 3
    best = None
    for v in sorted(verses):
        if v < at - 8:
            continue
        h = hits(head, v)
        score = len(h) / len(head)
        far = v - at > 20 or v < at - 2  # well on, or back to a verse passed over: on better evidence
        if len(h) >= need and sum(len(w) >= 4 for w in h) >= 2 and score >= (0.6 if far else 0.4):
            if best is None or score > best[0] + 0.15 or score >= best[0] and best[1] < at - 2 <= v:
                best = (score, v)
    if best is None:
        return None
    first = last = best[1]
    if len(ks) < 12:
        return first, last  # a phrase: one verse (its words recur in later verses, as "Iesu Christi" does)
    for v in range(first, min(first + 15, max(verses) + 1)):
        if len(hits(tail, v)) / len(tail) >= 0.4:
            last = v
    span = set().union(*(verses.get(v, set()) for v in range(first, last + 1)))
    if sum(w in span for w in ks) / len(ks) < 0.45:
        return None
    return first, last


ORDINALS = sorted([("UNDECIMUM", 11), ("UNDECIMO", 11), ("DUODECIMUM", 12), ("DUODECIMO", 12), ("TREDECIMUM", 13),
                   ("TREDECIMO", 13), ("VIGESIMUM", 20), ("VICESIMUM", 20), ("DECIMUM", 10), ("DECIMO", 10),
                   ("PRIMUM", 1), ("PRIMO", 1), ("PRIMU", 1), ("SECUNDUM", 2), ("SECUNDO", 2), ("TERTIUM", 3),
                   ("TERTIO", 3), ("QUARTUM", 4), ("QUARTO", 4), ("QUINTUM", 5), ("QUINTO", 5), ("SEXTUM", 6),
                   ("SEXTO", 6), ("SEPTIMUM", 7), ("SEPTIMO", 7), ("OCTAVUM", 8), ("OCTAVO", 8), ("NONUM", 9),
                   ("NONO", 9), ("NOVUM", 9)], key=lambda x: -len(x[0]))  # "Caput novum": a misprint for nonum


def ordinal(word):
    """ "DECIMUMQUINTUM" 15, "VIGESIMUMPRIMUM" 21, or None."""
    total = 0
    while word:
        stem = next(((w, n) for w, n in ORDINALS if word.startswith(w)), None)
        if not stem:
            return None
        total += stem[1]
        word = word[len(stem[0]):]
    return total or None


def chapter_number(src):
    """The chapter a heading opens: "CAPUT IIII.", "Caput I.", "CAP. I.", "CAPUT. XI.", "CAPUT SECUN-DUM.",
    "CAPUT DECIMUM-QUINTUM.", "Caput tredecimum.", "De Capite septimo.", "IN DECIMUM QUARTUM CAPUT
    IOANNIS", "PARS II. CAPUT V.", "Confirmatio. Cap. IV.", "EPISTOLAE SECUND Caput primum"."""
    src = re.sub(r"(\w)-\s*(\w)", r"\1\2", src).upper()
    m = re.match(r"^\W*(?:[\w.]+\s+){0,3}?CAP(?:UT|ITE)?\s*\.?\s*([IVXL]+\b|[A-Z]+(?:\s+[A-Z]+)?)", src)
    if m:
        word = m.group(1)
        if re.fullmatch(r"[IVXL]+", word):
            return tb.roman(word)
        n = ordinal(word.replace(" ", "")) or ordinal(word.split()[0])
        if n:
            return n
    m = re.match(r"^\W*IN\s+([A-Z]+(?:\s+[A-Z]+)?)\s+CAPUT", src)
    return ordinal(m.group(1).replace(" ", "")) if m else None


GOSPEL = {"MATTH": "MAT", "MARC": "MRK", "LUC": "LUK", "IOH": "JHN", "IOAN": "JHN", "ACTOR": "ACT", "HISTORIA ACTOR": "ACT"}
GOSPEL_REF = re.compile(r"\b(Matth|Marc|Luc|Ioh|Ioan|Actor)\w*\.?\s*(\d+)?", re.I)
FEAST = re.compile(r"^\W*(?:Dominica|Die\b|In Die|In Epiphan|Feria|De S\.|De Trinitate|Evangelium (?:in )?die|"
                   r"Evangelium in die|In Pentecoste|In Evangelium|Historia de|Iohanne Baptista)", re.I)


LECTIONARY = [(r"Good Friday|Parasceve", ("JHN", 18, 1, 40)), (r"Monday of Pentecost|Feria II", ("JHN", 3, 16, 21)),
              (r"Tuesday of Pentecost|Feria III", ("JHN", 10, 1, 11)), (r"John the Baptist", ("LUK", 1, 57, 80))]


def feast_title(head):
    """ "Second Sunday of Advent" from "Second Sunday of Advent. Gospel of Luke 21. Of the signs of the
    last judgment.", "Day of Michael" from "Gospel on the day of Michael, Matthew 18. Of the Angels."."""
    t = re.sub(r"(?i)^\W*(?:the )?gospel (?:on|for|in) (?:the )?", "", head)
    t = re.sub(r"(?i)[.,;]?\s*(?:the )?gospel\b.*$", "", t)
    t = re.sub(r"(?i)[.,;]?\s*\b(?:Matth|Matthew|Mark|Luke|John|Acts|Lucae|Iohan)\w*\.?\s*\d.*$", "", t)
    t = t.strip(" .,;")
    while re.search(r"(?i)[ ,]+(?:from|with|on|of|the|in|coherent)$", t):
        t = re.sub(r"(?i)[ ,]+(?:from|with|on|of|the|in|coherent)$", "", t)
    if len(t) < 4:  # "On the Gospel of the rich man and Lazarus"
        m = re.search(r"(?i)gospel (?:concerning|about|of|on) (?:the )?(.+?)(?:,|\.|$)", head)
        t = m.group(1) if m else ""
    return tb.title_case(t) or "Gospel"


def find_reading(text, books=("MAT", "MRK", "LUK", "JHN")):
    """(book, chapter, first, last) of the Gospel a reading's opening words are, searched in every
    chapter of the books, or None."""
    ks = [stem(w) for w in content(text)][:10]
    if len(ks) < 4:
        return None
    best = None
    for b in books:
        for c in range(1, len(tb.COUNTS[b]) + 1):
            for v, vw in vulgate(b, c).items():
                score = sum(w in vw for w in ks) / len(ks)
                if best is None or score > best[0]:
                    best = (score, b, c, v)
    return best[1:] + (best[3],) if best and best[0] >= 0.6 else None


def pericopes(args, blocks, meta):
    """Annotations on the Sunday and feast Gospels: each section filed at its reading."""
    excerpts, cur = [], None
    stats = {"readings": 0, "by heading": 0, "by search": 0, "unplaced": 0}
    pending = None  # a feast heading whose reading is not yet known

    def open_(b, c, v, v2, title):
        nonlocal cur
        cur = {"b": b, "c": c, "v": v, "v2": v2, "title": title, "en": [], "la": []}
        excerpts.append(cur)

    for kind, t_en, t_la, part, lead in blocks:
        src = t_la or t_en
        if kind == "head" and FEAST.search(src):
            pending = {"title": feast_title(t_en or t_la), "en": [], "la": [], "b": None, "c": None}
        if pending is not None:
            # The reading named in a heading ("Evangelium Lucae 21.") or at the head of its text ("Matth. 21. Et cum...").
            m = GOSPEL_REF.search(src) if kind == "head" else GOSPEL_REF.match(src)
            if m and m.group(1).lower().startswith("act") and not re.search(r"(?i)histori", src):
                m = None  # Acts named in a heading of a Gospel's section, not its reading
            if m and not pending["b"]:
                pending["b"] = next(v for k, v in GOSPEL.items() if m.group(1).upper().startswith(k[:3]))
                pending["c"] = int(m.group(2)) if m.group(2) else None
            pending["en"].append(t_en)
            pending["la"].append(t_la)
            # The reading itself: a paragraph long enough to be found.
            if kind == "p" and len(content(src)) >= 6:
                text = GOSPEL_REF.sub("", src, count=1) if m else src
                place = None
                if pending["b"] and pending["c"]:
                    found = match(text, pending["b"], pending["c"], 1)
                    place = (pending["b"], pending["c"]) + found if found else (pending["b"], pending["c"], 1, 1)
                    stats["by heading"] += 1
                else:
                    r = find_reading(text, (pending["b"],) if pending["b"] else ("MAT", "MRK", "LUK", "JHN"))
                    if r:
                        b, c, v, _ = r
                        found = match(text, b, c, v) or (v, v)
                        place = (b, c) + found
                        stats["by search"] += 1
                if not place:
                    # Feasts whose reading the annotation does not quote: the historic lectionary's.
                    place = next((r for rx, r in LECTIONARY if re.search(rx, pending["title"], re.I)), None)
                if place:
                    b, c, v, v2 = place
                    open_(b, c, v, v2, pending["title"])
                    cur["en"], cur["la"] = pending["en"], pending["la"]
                    stats["readings"] += 1
                else:
                    stats["unplaced"] += 1
                    print("  no reading:", pending["title"])
                    if cur:
                        cur["en"] += pending["en"]
                        cur["la"] += pending["la"]
                pending = None
            continue
        if cur is None:
            continue
        if part in ("M", "F") and cur["en"] and kind == "p":
            cur["en"][-1] += " " + t_en
            cur["la"][-1] += " " + t_la
        else:
            cur["en"].append(t_en)
            cur["la"].append(t_la)
    order = list(tb.NAMES)
    excerpts.sort(key=lambda e: (order.index(e["b"]), e["c"], e["v"]))
    lines, book = [], None
    for k, e in enumerate(excerpts):
        if e["b"] != book:
            lines += [f"# {tb.NAMES[e['b']]}", ""]
            book = e["b"]
        head = f"{e['c']}:{e['v']}" if e["v2"] <= e["v"] else f"{e['c']}:{e['v']}-{e['v2']}"
        title = e["title"]
        if args.label:
            title = f"Introduction: {args.label}" if title == "Introduction" else f"{args.label}: {title}" if title else args.label
        lines.append(f"## {head} {title}".rstrip())
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


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("slug")
    ap.add_argument("code")
    ap.add_argument("out")
    ap.add_argument("--from-head", default=r"^ARGUMENT")
    ap.add_argument("--start-chapter", type=int, default=0, help="the chapter the start heading opens, where it has no CAPUT")
    ap.add_argument("--sections-only", action="store_true",
                    help="no verse matching: a work that sets out each chapter's text, then treats it by topics (Daniel)")
    ap.add_argument("--pericopes", action="store_true",
                    help="annotations on the Sunday and feast Gospels: each section at its reading (code is ignored)")
    ap.add_argument("--label", help="a name set before each excerpt's title, to tell this work from others merged with it")
    ap.add_argument("--pages", help="A-B: only these pages of the work (a volume holding several)")
    args = ap.parse_args()
    meta = json.loads(tb.get(args.slug, "meta.json"))
    en, la = pages(args.slug, "en", meta["tei_v"]), pages(args.slug, "la", meta["tei_v"])
    assert len(en) == len(la)
    blocks = []
    first, last = (int(x) for x in args.pages.split("-")) if args.pages else (0, len(la) - 1)
    for pe, pl in list(zip(en, la))[first:last + 1]:
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
    start = next((i for i, b in enumerate(blocks) if b[0] == "head" and re.search(args.from_head, b[2])), 0)
    if args.pericopes:
        return pericopes(args, blocks[start:], meta)
    code, counts = args.code, tb.COUNTS[args.code]
    excerpts, cur = [], None
    chapter, verse, treatise = 0, 1, ""
    stats = {"chapters": 0, "verses": 0}

    def open_(c, v, v2=None, title=""):
        nonlocal cur
        cur = {"c": c, "v": v, "v2": v2 or v, "title": title, "en": [], "la": []}
        excerpts.append(cur)

    open_(1, 1, title="Introduction")
    if args.start_chapter:
        chapter = args.start_chapter
        open_(chapter, 1, title="Argument")
    for kind, t_en, t_la, part, lead in blocks[start:]:
        src = t_la or t_en
        n = chapter_number(src) if kind == "head" else None
        found = match(src, code, chapter, verse) if chapter and kind == "head" and n is None and not args.sections_only and not (
            treatise and len(content(src)) < 3) else None
        if chapter and not found and n is None and not args.sections_only and not treatise and kind == "head":
            # A chapter whose heading the edition lacks: a lemma that is plainly one of the next chapters' opens it.
            text = src
            if len(content(text)) >= 4:
                for c in range(chapter + 1, min(chapter + 4, len(counts) + 1)):
                    ahead = match(text, code, c, 1)
                    if ahead and ahead[0] <= 6:
                        chapter, verse, n = c, 1, None
                        open_(chapter, 1, title="Argument")
                        stats["chapters by lemma"] = stats.get("chapters by lemma", 0) + 1
                        found = ahead if kind == "head" else None
                        break
        if n and chapter < n <= min(chapter + 4, len(counts)):
            chapter, verse, treatise = n, 1, ""
            open_(chapter, 1, title="Argument")
            stats["chapters"] += 1
        elif found:
            # A heading that is the text expounded ("Gratia vobis & pax.").
            v, v2 = found
            stats["verses"] += 1
            verse = v2
            if cur["title"] == "" and cur["c"] == chapter and cur["v"] <= v <= cur["v2"] and not cur["en"]:
                cur["v2"] = max(cur["v2"], v2)
            elif cur["en"] or cur["title"] not in ("", "Argument") or (cur["c"], cur["v"]) != (chapter, v):
                open_(chapter, v, v2)
            else:
                cur["v"], cur["v2"] = v, v2
        elif chapter and kind == "head" and re.search(r"Loci Doctrinae|DE COENA|SECUNDA PARS|^\W*CAPUT|^\W*LOCI\b|"
                                                      r"^\W*DE\s+[A-Z]{3}", src):
            # "Loci Doctrinae.", "DE COENA DOMINI.", a treatise's own "CAPUT V.": a section of its own
            # at the verse in hand.
            title = tb.title_case(t_en or t_la)
            if re.match(r"^\W*DE\s+[A-Z]", src):
                treatise = title  # "Concerning the Lord's Supper", whose own chapters follow
            elif re.match(r"^\W*CAPUT", src) and treatise:
                title = f"{treatise}: {title}"
            open_(chapter, verse, title=title)
        elif chapter and kind == "p" and lead and not args.sections_only:
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
        if code not in tb.NT and not e["title"].startswith(("Introduction", "Argument")):
            # The Vulgate's numbering, which the lemmas were found by, to Loci's.
            (c, v), (c2, v2) = tb.to_loci(code, e["c"], e["v"]), tb.to_loci(code, e["c"], e["v2"])
            e["c"], e["v"], e["v2"] = c, v, v2 if c2 == c else v
        head = f"{e['c']}:{e['v']}" if e["v2"] <= e["v"] else f"{e['c']}:{e['v']}-{e['v2']}"
        title = e["title"]
        if args.label:
            title = f"Introduction: {args.label}" if title == "Introduction" else f"{args.label}: {title}" if title else args.label
        lines.append(f"## {head} {title}".rstrip())
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
