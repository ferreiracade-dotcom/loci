"""A work on several books from The Faith Received -> one Loci commentary Markdown file.

For annotations in the manner of Calov's Biblia Illustrata: one volume holds several books, each
opening with prefaces, each chapter with an argument, and the comments marked by a verse number
("Vers. 3.", "V. 3.", "3.") or only by the Greek words they take up ("Κλητὸς.", "Βίβλος
γενέσεως.]"). A comment with no number is set at the verse whose Greek it quotes, looked for from
the verse in hand onwards in the chapter's Greek text (Tischendorf and the Byzantine text). In the
Old Testament the comments take up the Vulgate's words in capitals ("IN PRINCIPIO CREAVIT DEUS)"),
looked for in the Clementine Vulgate; they also catch the chapters that pages set in two columns
put out of order. The Psalms are numbered as the Hebrew (the title counted) and Daniel 3 and 4 as
the Vulgate; both are mapped to Loci's numbering.

The English and Latin editions are paired page by page; each excerpt is the English with the
original underneath, as in tfr-to-md.py.

  python3 tools/tfr-books-to-md.py <out.md> <slug> CODE@PAGE[:REGEX] ... [<slug> CODE@PAGE ...]

Calov's three volumes, as Loci ships them:

  python3 tools/tfr-books-to-md.py "resources/commentaries/Calov Gospels and Acts.md" \
      calov-biblia-novi-testamenti-illustrata-vol-1 MAT@168 MRK@508 LUK@549 JHN@692 ACT@862
  python3 tools/tfr-books-to-md.py "resources/commentaries/Calov Romans to 2 Thessalonians.md" \
      calov-biblia-novi-testamenti-illustrata-vol-2-part-1 ROM@10 1CO@255 2CO@428 GAL@535 \
      EPH@650:EPHESIOS PHP@742 COL@803 1TH@857 2TH@893
  python3 tools/tfr-books-to-md.py "resources/commentaries/Calov 1 Timothy to Revelation.md" \
      calov-biblia-novi-testamenti-illustrata-vol-2 1TI@8 2TI@81 TIT@131 PHM@164 HEB@175 JAS@470 \
      1PE@544 2PE@612 1JN@657 2JN@760 3JN@765 JUD@769 REV@790
  python3 tools/tfr-books-to-md.py "resources/commentaries/Calov Genesis to Song of Songs.md" \
      calov-biblia-veteris-testamenti-illustrata-vol-1 "GEN@251:AD GENESIN" EXO@355 LEV@504 NUM@544 \
      DEU@591 JOS@692 JDG@733 RUT@776 "1SA@780:AD LIBRUM PRI" 2SA@798 1KI@825 2KI@848 1CH@873 \
      "2CH@887:POSTER" EZR@901 "NEH@908:TATA I NEHEM" EST@914 JOB@922 PSA@964 "PRO@1164:AD LIBRUM PR" \
      ECC@1265 SNG@1289 LAM@1331 ADD@1341:SUPPL
  python3 tools/tfr-books-to-md.py "resources/commentaries/Calov Isaiah to Malachi.md" \
      calov-biblia-veteris-testamenti-illustrata-vol-2 "ISA@21:PROPHETAM" JER@400 EZK@508 DAN@600 \
      HOS@719 JOL@781 AMO@807 OBA@826 JON@834 MIC@841 NAM@887 HAB@895 ZEP@905 HAG@919 ZEC@935 MAL@1054

(The third Old Testament volume, the Apocrypha, has no place in Loci's versification.)

CODE@PAGE starts a book (USFM code) on that page of the work (the reader's page numbers): at the
heading matching REGEX on that page or the one before, or else at the first opening heading
there ("I. N. J. ANNOTATA...", "PRÆLOQUIUM..."), or else at the top of the page. What comes
before a volume's first book (dedications, a harmony of the Gospels) introduces that book.
ADD@PAGE marks a supplement to the notes ("Ad Gen. 2. v. 7.", "Ad cap. 22. v. 4.") running to the
volume's end: each note is filed as an Addition at the verse it names.
Downloads are cached in tools/sources/tfr/ (not committed).
"""
import difflib
import json
import re
import sys
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from tfr_greek import GREEK_WORD, NT, bare  # noqa: E402

BASE = "https://mo-tfr-library.mo-podcast-feed.workers.dev/v1/works"
NS = "{http://www.tei-c.org/ns/1.0}"
CACHE = Path(__file__).parent / "sources" / "tfr"
SHARED = Path(__file__).parent.parent / "src" / "shared"
ROMAN = {"I": 1, "V": 5, "X": 10, "L": 50, "C": 100}

OPENING = re.compile(r"^(?:I\.?\s*N\b|IN\.\s*J|J\.\s*N|N\.\s*J)|PRÆLOQ|PRAELOQ|PROOEM|PRÆFAT|PROLEGOM|ΠΡΟΛΕΓ"
                     r"|\bANNOT|NOTATA|OTATA\b|TATA IN|^ANNO\b")
# "Vers. 3.", "V. 3", "(Vers. 18.", "Verf. 4." (a long s read as f), "vers. I."
VERSE = re.compile(r"^[\s(\[*]{0,3}(?:(?:[Vv]ers(?:e|us)?|[Vv]erf|[Vv]er)\s*\.?\s*(\d{1,3}|[IVX]{1,4}(?=\.))"
                   r"|[Vv]\s*\.\s*(\d{1,3}))\b(?:\s*[.,]\s*(\d{1,3})\b)?")
BARE_NUMBER = re.compile(r"^[\s(]{0,2}(\d{1,3})\.\s+(?=[Ͱ-Ͽἀ-῿(])")  # "14. Πλὴν καλῶς"
# "PARS I. INSCRIPTIO. v. 1.", but not an outline's "ad v. 21." ("to verse 21")
IN_HEAD = re.compile(r"(?<!ad)(?<!usque)(?:^|[.\s])v(?:ers)?\.\s*(\d{1,3})\b")
CHAPTER = re.compile(r"\bCAP(?:UT|ITIS)?\.?\s*([IVXL]{1,7}|UNICUM)\b", re.I)
# "PSALMUS III.", "PSALM. XX.", "Ps. XXIII.", misread "Pl. XXVIII.", "Pf. XXXIII."
PSALM = re.compile(r"(?:^|[.\s])\W*(?:PSAL(?:M(?:US|VS)?)?\.?|P[sSlLfF]\.)\s*([IVXLC]{1,9})\b\.?", re.I)
LEMMA_END = re.compile(r"[\])]")
DEBUG = bool(__import__("os").environ.get("TFR_DEBUG"))


def roman(s):
    s = s.upper().replace("IIX", "VIII")
    if s == "UNICUM":
        return 1
    vals = [ROMAN[c] for c in s if c in ROMAN]
    return sum(-a if a < b else a for a, b in zip(vals, vals[1:] + [0]))


def number(s):
    return int(s) if s.isdigit() else roman(s)


def get(slug, name, timeout=300):
    f = CACHE / slug / name.split("?")[0]
    if not f.exists():
        f.parent.mkdir(parents=True, exist_ok=True)
        req = urllib.request.Request(f"{BASE}/{slug}/{name}", headers={
            "User-Agent": "Mozilla/5.0", "Referer": "https://mereorthodoxy.com/"})
        f.write_bytes(urllib.request.urlopen(req, timeout=timeout).read())
    return f.read_bytes()


def text_of(el):
    parts = [el.text or ""]
    for ch in el:
        if ch.tag.replace(NS, "") not in ("fw", "pb", "gap", "note"):
            parts.append(text_of(ch))
        parts.append(ch.tail or "")
    return " ".join("".join(parts).split())


def pages(slug, lang, tei_v):
    """[[(kind, text, part)]] per page: 'head' or 'p' (list items as 'p'), in document order."""
    root = ET.fromstring(get(slug, f"tei.{lang}.xml?v={tei_v}"))
    out = [[]]

    def walk(el):
        for e in el:
            tag = e.tag.replace(NS, "")
            if tag == "pb":
                out.append([])
            elif tag in ("head", "p", "item"):
                t = text_of(e)
                if t:
                    out[-1].append(("head" if tag == "head" else "p", t, e.get("part")))
                for pb in e.iter(NS + "pb"):  # a page break inside a paragraph
                    out.append([])
            elif tag in ("div", "list", "body"):
                walk(e)

    walk(root.find(f"{NS}text/{NS}body"))
    return out


def pair(en, la):
    """One page's English and Latin blocks, paired; where the two differ (a heading run into a
    paragraph in one of them), the blocks are matched by kind and the rest set side by side."""
    if [b[0] for b in en] == [b[0] for b in la]:
        return [(a[0], a[1], b[1], b[2]) for a, b in zip(en, la)]
    out = []
    sm = difflib.SequenceMatcher(None, [b[0] for b in en], [b[0] for b in la], autojunk=False)
    for op, i1, i2, j1, j2 in sm.get_opcodes():
        if op == "equal":
            out += [(a[0], a[1], b[1], b[2]) for a, b in zip(en[i1:i2], la[j1:j2])]
            continue
        ea, lb = en[i1:i2], la[j1:j2]
        for k in range(max(len(ea), len(lb))):
            a = ea[k] if k < len(ea) else None
            b = lb[k] if k < len(lb) else None
            kind = (b or a)[0]
            out.append((kind, a[1] if a else "", b[1] if b else "", (b or a)[2]))
    return out


def book_names():
    found = re.findall(r"\['(\w+)', '([^']+)'", (SHARED / "scriptureRef.ts").read_text())
    return dict(found)


def verse_counts():
    table = (SHARED / "versification.ts").read_text()
    return {code: [int(x) for x in counts.split(",")]
            for code, counts in re.findall(r"'?(\w+)'?: \[([\d, ]+)\]", table)}


NAMES, COUNTS = book_names(), verse_counts()


def source_counts(code):
    """Verses per chapter as the commentary numbers them. Calov follows Grotius, who numbers as the
    Vulgate: in the Psalms as the Hebrew (a psalm's title counted, so 3:9 is Loci's 3:8), in Daniel
    3 with the Song of the Three (3:91 is 3:24), and elsewhere as the Clementine Vulgate, whose
    chapters now and then break elsewhere (Job 40:10 is 40:15, Jonah 2:1 is 1:17). to_loci() maps
    back to Loci's numbering."""
    if code in NT:
        return COUNTS[code]
    if code not in source_counts.memo:
        if code == "PSA":
            counts = hebrew_psalm_counts()
        else:
            counts = [max(fetch_verses("lat_clv", code, c) or {0: ""}) or n for c, n in enumerate(COUNTS[code], 1)]
            if code == "DAN":
                counts[2:4] = [100, 34]
        source_counts.memo[code] = counts
    return source_counts.memo[code]


source_counts.memo = {}


def chapter_runs(code):
    """{chapter: (first chapter, last chapter)} for each run of chapters whose verses the Vulgate
    divides otherwise than Loci but which hold the same verses between them (Job 39-41: 35, 28
    and 25 verses against 30, 24 and 34)."""
    if code not in chapter_runs.memo:
        vul, eng, runs, i = source_counts(code), COUNTS[code], {}, 0
        while i < len(eng):
            if vul[i] != eng[i]:
                for j in range(i + 1, min(i + 4, len(eng))):
                    if sum(vul[i:j + 1]) == sum(eng[i:j + 1]):
                        runs.update({c: (i + 1, j + 1) for c in range(i + 1, j + 2)})
                        i = j
                        break
            i += 1
        chapter_runs.memo[code] = runs
    return chapter_runs.memo[code]


chapter_runs.memo = {}


def to_loci(code, c, v):
    """A verse as the commentary numbers it, as (chapter, verse) in Loci's numbering."""
    if code in NT:
        return c, v
    if code == "PSA":
        extra = source_counts(code)[c - 1] - COUNTS[code][c - 1]
        return c, max(1, min(v - max(extra, 0), COUNTS[code][c - 1]))
    if code == "DAN" and c == 3:
        return (3, v) if v <= 23 else (3, 23) if v <= 90 else (3, v - 67) if v <= 97 else (4, v - 97)
    if code == "DAN" and c == 4:
        return 4, min(v + 3, COUNTS[code][3])
    if c in chapter_runs(code):
        first, last = chapter_runs(code)[c]
        pos = sum(source_counts(code)[first - 1:c - 1]) + v
        for k in range(first, last + 1):
            if pos <= COUNTS[code][k - 1] or k == last:
                return k, max(1, min(pos, COUNTS[code][k - 1]))
            pos -= COUNTS[code][k - 1]
    return c, max(1, min(v, COUNTS[code][c - 1]))


def fetch_verses(tr, code, ch):
    """{verse: text} of one chapter from bible.helloao.org, cached."""
    f = CACHE / "greek" / f"verses-{tr}-{code}-{ch}.json"
    if not f.exists():
        f.parent.mkdir(parents=True, exist_ok=True)
        url = f"https://bible.helloao.org/api/{tr}/{code}/{ch}.json"
        with urllib.request.urlopen(url, timeout=60) as r:
            data = json.load(r)
        vs = {}
        for item in data.get("chapter", {}).get("content", []):
            if item.get("type") == "verse":
                vs[item["number"]] = " ".join(x if isinstance(x, str) else x.get("text", "") for x in item["content"])
        f.write_text(json.dumps(vs, ensure_ascii=False), encoding="utf8")
    # (an older cache holds each verse's Greek words, not its text)
    return {int(v): " ".join(t) if isinstance(t, list) else t for v, t in json.loads(f.read_text(encoding="utf8")).items()}


def latin(w):
    """A Latin word as both the Vulgate and the old prints spell it: "SVNT", "ejus", "cœli"."""
    w = w.lower().replace("æ", "ae").replace("œ", "oe").replace("ę", "ae")
    return w.replace("v", "u").replace("j", "i")


LATIN_WORD = re.compile(r"[A-Za-zÆŒæœę]+")


def vulgate_psalm(h):
    """[(Vulgate psalm, first verse, verses to subtract)] holding Psalm h of the Hebrew numbering,
    which Calov follows; the Vulgate joins 9 and 10, 114 and 115, and splits 116 and 147."""
    if h <= 8 or h >= 148:
        return [(h, 1, 0)]
    if h == 9:
        return [(9, 1, 0)]
    if h == 10:
        return [(9, 22, 21)]
    if h <= 113 or 117 <= h <= 146:
        return [(h - 1, 1, 0)]
    if h in (114, 115):
        return [(113, 1, 0) if h == 114 else (113, 9, 8)]
    if h == 116:
        return [(114, 1, 0), (115, 1, -9)]
    return [(146, 1, 0), (147, 1, -11)]  # 147


def verse_words(code, ch):
    """[set of bare words] for each verse of a chapter: from both Greek texts for the New Testament,
    from the Vulgate (whose words the Old Testament's comments take up) for the Old."""
    key = (code, ch)
    if key not in verse_words.memo:
        verses = {}
        if code in NT:
            for tr in ("grc_tis", "grc_byz"):
                for v, t in fetch_verses(tr, code, ch).items():
                    verses.setdefault(v, set()).update(bare(w) for w in GREEK_WORD.findall(t))
        else:
            for vch, first, minus in vulgate_psalm(ch) if code == "PSA" else [(ch, 1, 0)]:
                for v, t in fetch_verses("lat_clv", code, vch).items():
                    if v >= first:
                        verses.setdefault(v - minus, set()).update(latin(w) for w in LATIN_WORD.findall(t))
        verse_words.memo[key] = verses
    return verse_words.memo[key]


def hebrew_psalm_counts():
    """Verses in each psalm as Calov numbers them, the title counted (the Hebrew's numbering)."""
    return [max(fetch_verses("hbo_wlc", "PSA", c)) for c in range(1, 151)]


verse_words.memo = {}
STOP = {"και", "δε", "ο", "η", "το", "του", "τη", "την", "τον", "των", "τοις", "ταις", "εν", "εισ", "γαρ",
        "ουν", "μη", "ου", "ουκ", "τι", "τισ", "οτι", "αυτου", "αυτοισ", "αυτον", "υμιν", "υμασ", "ημιν",
        "ημασ", "μου", "σου", "υμων", "ημων", "εκ", "απο", "προσ", "επι", "δια", "κατα", "μετα", "περι",
        "υπο", "αλλα", "ινα", "ωσ", "τα", "τουσ", "τασ", "αι", "οι", "ει", "εστιν", "ην",
        "et", "in", "de", "ad", "ab", "ex", "cum", "non", "est", "sunt", "qui", "quae", "quod", "ut", "eius",
        "eum", "eam", "eos", "se", "sed", "autem", "enim", "tu", "te", "me", "mihi", "tibi", "nos", "uos",
        "super", "per", "pro", "sicut", "quia", "quoniam", "ne", "nec", "neque", "si", "ego", "meus", "mea",
        "meum", "tuus", "tua", "tuum", "suus", "sua", "suum", "suam", "suis", "hic", "haec", "hoc", "erit",
        "esse", "fuit", "ea", "id", "ille", "illa", "illud", "omnis", "omnes", "omnia", "sibi", "uel", "ac",
        "atque", "quoque", "ui", "quam", "ad", "a", "e", "o"}


def lemma(text, code="MAT"):
    """The words a comment takes up: its opening Greek ("Βίβλος γενέσεως.] This is not..."), or in
    the Old Testament its opening Latin in capitals ("Vers. 3. IN PRINCIPIO CREAVIT DEUS) ...")."""
    if code not in NT:
        text = re.sub(r"(\w)- (\w)", r"\1\2", text[:300])
        text = re.sub(r"^[\W\d]*(?:(?:Ad\s+)?[Vv]er[sf](?:u|us)?\.?\s*(?:eod(?:em)?\.?|eund(?:em)?\.?|\d+\.?)?)?", "", text)
        m = re.match(r"^[\W\d]*((?:[A-ZÆŒ]{2,}[\s,.;:?!&]*|[AEO][\s,]+){1,20})", text)
        if not m:
            return []
        return [w for w in (latin(x) for x in LATIN_WORD.findall(m.group(1))) if len(w) >= 2]
    head = LEMMA_END.split(text, 1)[0] if LEMMA_END.search(text[:200]) else text[:200]
    m = re.match(r"^[\W\d]*((?:[Ͱ-Ͽἀ-῿᾽᾿'’]+[\s,.;·:]*){1,14})", head)
    if not m:
        return []
    return [w for w in (bare(x) for x in GREEK_WORD.findall(m.group(1))) if len(w) >= 2]


def locate(words, code, ch, at):
    """The verse at or after `at` (or the one before it) whose Greek the lemma quotes, or None."""
    verses = verse_words(code, ch)
    if not words:
        return None
    content = [w for w in words if w not in STOP]
    if not content or len(content) == 1 and len(content[0]) < 5:
        return None
    best = None
    reach = 12 if code in NT else 60  # the Old Testament's comments pass over more verses
    for v in [at] + list(range(at + 1, at + reach)) + [at - 1]:
        vw = verses.get(v)
        if not vw:
            continue
        hits = sum(w in vw for w in content)
        score = hits / len(content)
        if v - at > 12 and (len(content) < 2 or score < 1):
            continue  # far on, only on every word of two or more
        if score >= 0.75 and (best is None or score > best[0] + 0.2):
            best = (score, v)
    if best is None and len(content) >= 2:
        # Back to an earlier verse ("Vers. 7." then a remark on verse 2): only on every word.
        back = [v for v in range(max(1, at - 8), at - 1) if all(w in verses.get(v, ()) for w in content)]
        if len(back) == 1:
            return back[0]
    return best[1] if best else None


def title_case(head):
    small = {"a", "an", "and", "of", "on", "the", "to", "in", "for", "by", "from", "with", "or"}
    words = head.split()
    return " ".join(w if re.fullmatch(r"[IVXLC]+\.?", w) else w.lower() if k and w.lower() in small
                    and not words[k - 1].endswith(".") else w[:1].upper() + w[1:].lower()
                    for k, w in enumerate(words))[:90].rstrip(" .,")


def chapters_quoted(code, excerpt):
    """The chapters whose Greek the excerpt's lemmas quote, each lemma (3+ words) counted where it
    fits one chapter only."""
    found = []
    for para in excerpt["la"] or excerpt["en"]:
        words = [w for w in lemma(para, code) if w not in STOP]
        if len(words) < 3:
            continue
        fits = [c for c in range(1, len(COUNTS[code]) + 1)
                if any(all(w in ws for w in words) for ws in verse_words(code, c).values())]
        if len(fits) == 1:
            found.append(fits[0])
    return found


def relabel(code, excerpts, stats):
    """A misprinted chapter heading ("CAPUT VIII." over chapter VII) or a missed one sets a run of
    comments under the wrong chapter: when a run's lemmas quote another chapter and never its own,
    it is that chapter's."""
    runs, run = [], []
    for e in excerpts:
        if e["title"].startswith("Introduction"):
            continue
        if run and e["seg"] != run[-1]["seg"]:
            runs.append(run)
            run = []
        run.append(e)
    if run:
        runs.append(run)
    for run in runs:
        c = run[0]["c"]
        quoted = [q for e in run for q in chapters_quoted(code, e)]
        home = quoted.count(c)
        others = {q: quoted.count(q) for q in set(quoted) if q != c}
        if not others:
            continue
        best = max(others, key=others.get)
        if home == 0 and others[best] >= 3 and others[best] >= 0.6 * len(quoted) and abs(best - c) <= 2:
            if all(e["v"] <= source_counts(code)[best - 1] for e in run):
                for e in run:
                    e["c"] = best
                    e["v2"] = min(e["v2"], source_counts(code)[best - 1])
                stats["relabelled"] = stats.get("relabelled", 0) + 1
                if DEBUG:
                    print("  ", code, "relabel", c, "->", best, quoted[:12])


def regroup(code, excerpts, stats):
    """Where a page set in two columns came out interleaved, comments of one chapter sit among
    another's. In the Old Testament, whose lemmas are the Vulgate's words, a comment none of whose
    lemmas is found in its chapter, and whose lemmas fit one verse of a nearby chapter, goes there."""
    counts = source_counts(code)
    for e in excerpts:
        if e["title"].startswith(("Introduction", "Argument")):
            continue
        lemmas = [ws for ws in ([w for w in lemma(p, code) if w not in STOP] for p in e["la"]) if len(ws) >= 2]
        if not lemmas:
            continue

        def fits(c):
            return [v for v, vw in verse_words(code, c).items() if any(all(w in vw for w in ws) for ws in lemmas)]

        if fits(e["c"]):
            continue
        found = {c: fits(c) for c in range(max(1, e["c"] - 3), min(len(counts), e["c"] + 3) + 1) if c != e["c"]}
        found = {c: vs for c, vs in found.items() if vs}
        if len(found) == 1:
            (c, vs), = found.items()
            if DEBUG:
                print("  ", code, "regroup", f"{e['c']}:{e['v']} -> {c}:{vs[0]}", lemmas[0][:6])
            e["c"], e["v"], e["v2"] = c, vs[0], vs[0]
            stats["regrouped"] = stats.get("regrouped", 0) + 1


SUPPLEMENT_BOOK = {"gen": "GEN", "genes": "GEN", "exod": "EXO", "lev": "LEV", "levit": "LEV", "num": "NUM",
                   "numer": "NUM", "deut": "DEU", "devt": "DEU", "devteronom": "DEU", "deuteronom": "DEU",
                   "psal": "PSA", "psalm": "PSA", "pfal": "PSA", "pfalm": "PSA", "ps": "PSA"}
SUPPLEMENT_REF = re.compile(r"\b(Genes|Gen|Exod|Levit|Lev|Numer|Num|De[uv]teronom|De[uv]t|P[sf]alm|P[sf]al|Ps)\.?,?\s*"
                            r"(?:c(?:ap)?\.\s*)?(\d+|(?-i:[IVXLC]+)\b)", re.I)
SUPPLEMENT_CHAPTER = re.compile(r"\b(?:cap|c)\.\s*(\d+)")
SUPPLEMENT_VERSE = re.compile(r"\b(?:v|[Vv]er[sf](?:u|us)?)\.?\s*(\d+)|^\W*(?:Ad\s+)?[^,.]*?\d+\s*[,.]\s*(\d+)\b")


def supplements(blocks, stats):
    """{book: [excerpt]} from a volume's supplement to its notes, keyed "Ad Gen. 2. v. 7.", "Ad cap.
    22. v. 4." (the book in hand), "Vers. 18." (the chapter in hand), "PSAL. XIIX."."""
    out, cur = {}, None
    code, c, v = "GEN", 1, 1
    for kind, t_en, t_la, part in blocks:
        src = t_la or t_en
        ref = None
        if kind == "head" and len(src) < 300:
            book = SUPPLEMENT_REF.search(src)
            chap = SUPPLEMENT_CHAPTER.search(src)
            verse = SUPPLEMENT_VERSE.search(src)
            if book:
                code = SUPPLEMENT_BOOK[book.group(1).lower()]
                c = number(book.group(2).upper()) if not book.group(2).isdigit() else int(book.group(2))
                rest = src[book.end():]
                vm = re.match(r"\s*[,.]\s*(\d+)\b", rest) or SUPPLEMENT_VERSE.search(rest)
                v = int(next(g for g in vm.groups() if g)) if vm else 1
                ref = True
            elif chap:
                c = int(chap.group(1))
                rest = src[chap.end():]
                vm = re.match(r"\s*[,.]\s*(\d+)\b", rest) or SUPPLEMENT_VERSE.search(rest)
                v = int(next(g for g in vm.groups() if g)) if vm else 1
                ref = True
            elif verse and re.match(r"^\W*(?:Ad\s+|Sub\s+finem\s+)?(?:v|[Vv]er[sf])", src, re.I):
                v = int(next(g for g in verse.groups() if g))
                ref = True
        if ref and code in COUNTS and c <= len(source_counts(code)):
            v = max(1, min(v, source_counts(code)[c - 1]))
            cur = {"c": c, "v": v, "v2": v, "title": "Addition", "en": [], "la": [], "seg": -1}
            out.setdefault(code, []).append(cur)
            stats["additions"] = stats.get("additions", 0) + 1
        if cur is None:
            continue  # the supplement's own preface
        if part in ("M", "F") and cur["en"] and kind == "p":
            cur["en"][-1] += " " + t_en
            cur["la"][-1] += " " + t_la
        else:
            cur["en"].append(t_en)
            cur["la"].append(t_la)
    for code, es in out.items():
        for e in es:
            settle(code, e, stats)
    return out


def settle(code, e, stats):
    """An addition's reference, checked against the Vulgate words it takes up: the supplement
    numbers the Psalms now as the Hebrew, now as the Vulgate ("Ad Psal. 78." for Psalm 79), and
    misprints some ("Ad Psal. 74." for 47)."""
    lemmas = [ws for ws in ([w for w in lemma(p, code) if w not in STOP] for p in e["la"][:3]) if len(ws) >= 2]
    if not lemmas:
        return
    counts = source_counts(code)

    def fits(c):
        return [v for v, vw in verse_words(code, c).items() if any(all(w in vw for w in ws) for ws in lemmas)]

    for chapters in ([e["c"]], [e["c"] - 1, e["c"] + 1], range(1, len(counts) + 1)):
        if chapters is not None and len(chapters) > 2 and max(len(ws) for ws in lemmas) < 3:
            return
        found = {c: fits(c) for c in chapters if 1 <= c <= len(counts)}
        found = {c: vs for c, vs in found.items() if vs}
        if len(found) == 1:
            (c, vs), = found.items()
            v = min(vs, key=lambda x: abs(x - e["v"]))
            if (c, v) != (e["c"], e["v"]):
                if DEBUG:
                    print("  ", code, "addition", f"{e['c']}:{e['v']} -> {c}:{v}", lemmas[0][:6])
                stats["additions settled"] = stats.get("additions settled", 0) + 1
            e["c"], e["v"], e["v2"] = c, v, v
            return
        if found:
            return


def convert(code, prelude, blocks, stats, extra=()):
    """Excerpts for one book: dicts c, v, v2, title, en[], la[]. The prelude (what precedes a
    volume's first book) only introduces it: its chapters ("CAPUT II." of a harmony) are not the
    book's."""
    counts = source_counts(code)
    chapter_head = PSALM if code == "PSA" else CHAPTER
    excerpts, cur = [], None
    chapter, verse = 0, 0

    seg = 0  # a stretch between chapter boundaries, for relabel()
    seen = set()  # chapters opened
    summary = False  # the last block a chapter's summary standing without its "CAPUT"

    def start(c, v, title="", v2=None):
        nonlocal cur
        cur = {"c": c, "v": v, "v2": v2 or v, "title": title, "en": [], "la": [], "seg": seg}
        excerpts.append(cur)

    def add(kind, t_en, t_la, part):
        if part in ("M", "F") and cur["en"] and kind == "p":
            cur["en"][-1] += " " + t_en
            cur["la"][-1] += " " + t_la
        else:
            cur["en"].append(t_en)
            cur["la"].append(t_la)

    start(1, 1, "Introduction")
    for kind, t_en, t_la, part in prelude:
        if kind == "head" and OPENING.search(t_la or t_en) and cur["en"]:
            start(1, 1, "Introduction: " + title_case(t_en or t_la))
        add(kind, t_en, t_la, part)
    for kind, t_en, t_la, part in blocks:
        src = t_la or t_en
        # Chapters: "CAPUT IV.", "PARS II. CAPITIS VI.", "ANNOTATA AD GALAT. CAP. II. v. 4."
        m = chapter_head.search(src) if kind == "head" else chapter_head.search(src[:90]) if re.search(
            r"ARGUMENT", src[:120]) else None
        if not m and kind == "head" and chapter == 0 and len(counts) == 1 and re.search(r"ARGUMENT", src):
            m = re.match(r"()", "")  # a one-chapter book: its argument opens chapter 1
        if m:
            n = roman(m.group(1)) if m.group(1) else 1
            again = n == chapter and verse >= 5 and re.match(r"^\W*CAPUT\s+[IVXL]+\.?\s*(?:ARGUMENT|$)", src)
            # Set in two columns, a page's chapters can come out of order ("XXXI, XXXIV, XXXII, XXXV"):
            # a heading that is plainly a chapter's may go back to one passed over, or on by three.
            plain = kind == "head" and re.match(r"^\W*(?:PARS\b.*?)?(?:CAP(?:UT)?|PSAL\w*|P[sSlLfF])\.?\s*[IVXLC]+\b", src)
            ahead = 3 if plain else 2
            back = plain and n < chapter and n >= chapter - 3 and n not in seen
            if chapter < n <= min(chapter + ahead, len(counts)) or again or back:
                # A heading for the chapter in hand, after its comments ("CAPUT VIII." twice, the
                # first a misprint for VII.), opens a stretch of its own too: relabel() settles it.
                if DEBUG: print("  ", code, n, "head" if kind == "head" else "p", "|", src[:110])
                chapter, verse, seg = n, 0, seg + 1
                seen.add(n)
                start(n, 1, "Argument")
                stats["chapters"] += 1
        if chapter == 0:
            if kind == "head" and OPENING.search(src) and cur["en"]:
                start(1, 1, "Introduction: " + title_case(t_en or t_la))
            add(kind, t_en, t_la, part)
            continue
        # A verse number, or the Greek the comment takes up.
        v = v2 = None
        m = VERSE.match(src)
        if not m and kind == "p" and BARE_NUMBER.match(src):
            # "14. Πλὴν καλῶς": a verse number, unless the Greek after it is another verse's
            # ("13. Τὸ αὐτὸ φρονεῖν" is verse 2's; the number is a page's or a note's).
            found = locate(lemma(src, code), code, chapter, max(verse, 1))
            m = BARE_NUMBER.match(src) if found is None or found == int(BARE_NUMBER.match(src).group(1)) else None
        if not m and kind == "head" and len(src) < 200 and not re.search(r"\bPartes\b", src):
            m = IN_HEAD.search(src)
        if m:
            if m.re is VERSE:
                raw = m.group(1) or m.group(2)
                n = number(raw)
                if not raw.isdigit():
                    # "Vers. II." is as often a misread 11 as 2: the one that follows on
                    as_digits = int(raw.replace("I", "1")) if set(raw) == {"I"} else n
                    n = min((x for x in (n, as_digits) if x >= verse - 1), default=n,
                            key=lambda x: abs(x - verse))
                n2 = int(m.group(3)) if m.group(3) else n
            else:
                n = n2 = int(m.group(1))
            restart = n <= 2 and verse >= 8 or summary and n <= 5 and verse >= 10 and code not in NT
            if restart and code not in NT:
                # The Vulgate's words settle it: "Vers. 2. PONE INSIDIAS" after verse 18 is the
                # next chapter's only if the next chapter has them there.
                words = [w for w in lemma(src, code) if w not in STOP]
                if len(words) >= 2:
                    def has(c):
                        return c <= len(counts) and any(
                            all(w in verse_words(code, c).get(x, ()) for w in words) for x in (n - 1, n, n + 1))
                    restart = not has(chapter) and has(chapter + 1) or not has(chapter) and not any(
                        has(c) for c in range(max(1, chapter - 3), chapter + 4))
            if restart and chapter < len(counts):
                if DEBUG: print("  ", code, chapter + 1, "restart", "|", src[:110])
                # "Vers. 1." after the chapter's later verses, with no heading: the next chapter
                chapter, verse = next(c for c in range(chapter + 1, len(counts) + 1) if c not in seen
                                      or c == len(counts)), 0
                seen.add(chapter)
                start(chapter, 1, "Argument")
                stats["chapters"] += 1
            # "Vers. 3." may go back (a number misread before it set the verse too far on); a bare
            # "21." must follow on from the verse in hand.
            lowest, highest = (1, verse + 25) if m.re is VERSE else (verse - 1, verse + 5)
            if code == "DAN" and chapter == 3 and m.re is VERSE:
                highest = 100  # past the Song of the Three, which Calov leaves to the Apocrypha
            if 1 <= n <= counts[chapter - 1] and lowest <= n <= highest:
                v, v2 = n, max(n, min(n2, counts[chapter - 1])) if n2 - n <= 4 else n
                stats["numbered"] += 1
        if v is None and (kind == "head" or LEMMA_END.search(src[:160])):
            v = locate(lemma(src, code), code, chapter, max(verse, 1))
            if v is not None:
                stats["by lemma"] += 1
        if v is not None and v != verse:
            verse = v
            if (cur["c"], cur["v"]) == (chapter, v) and cur["title"] in ("", "Argument"):
                cur["v2"] = max(cur["v2"], v2 or v)
            else:
                start(chapter, v, v2=v2)
        elif v is not None and v2:
            cur["v2"] = max(cur["v2"], v2)
        add(kind, t_en, t_la, part)
        # "Ruth in agro Boas spicas colligens...": a chapter's summary, its "CAPUT II." lost
        summary = kind == "head" and v is None and len(src) > 30 and sum(c.islower() for c in src) > len(src) / 2

    relabel(code, excerpts, stats)
    if code not in NT:
        regroup(code, excerpts, stats)
    excerpts += extra
    for e in excerpts:
        if code == "DAN" and e["c"] == 3 and 24 <= e["v"] <= 90 and not e["title"]:
            e["title"] = "On the Song of the Three (Vulgate 3:24-90)"
        if e["title"].startswith(("Introduction", "Argument")):
            continue
        (c, v), (c2, v2) = to_loci(code, e["c"], e["v"]), to_loci(code, e["c"], e["v2"])
        e["c"], e["v"], e["v2"] = c, v, v2 if c2 == c else v
    # An argument with no comment after it before verse 1's, and comments out of the text's order
    # ("15, 14"), go with their verses: within a chapter, excerpts in verse order.
    intro = [e for e in excerpts if e["title"].startswith("Introduction") and e["en"]]
    rest = [e for e in excerpts if not e["title"].startswith("Introduction") and (e["en"] or e["la"])]
    rest.sort(key=lambda e: (e["c"], e["v"], e["title"] != "Argument"))
    return intro + rest


def main(argv):
    out_path, specs = argv[0], argv[1:]
    volumes, slug = [], None
    for s in specs:
        if "@" in s:
            code, rest = s.split("@", 1)
            page, _, rx = rest.partition(":")
            volumes[-1][1].append((code, int(page), rx))
        else:
            volumes.append((s, []))
    books, sources, additions = {}, {}, {}
    for slug, starts in volumes:
        meta = json.loads(get(slug, "meta.json"))
        en, la = pages(slug, "en", meta["tei_v"]), pages(slug, "la", meta["tei_v"])
        assert len(en) == len(la), (slug, len(en), len(la))
        flat = []  # (page, kind, en, la, part)
        for n, (pe, pl) in enumerate(zip(en, la)):
            flat += [(n,) + b for b in pair(pe, pl)]
        index = []
        last_verse_at = -1
        for code, page, rx in starts:
            near = [i for i, b in enumerate(flat) if b[0] in (page - 1, page)]
            prev_verse = max([i for i in near if flat[i][0] == page - 1 and VERSE.match(flat[i][3])] or [-1])
            heads = [i for i in near if flat[i][1] == "head" and i > prev_verse and i > last_verse_at]
            pick = [i for i in heads if (re.search(rx, flat[i][3]) if rx else OPENING.search(flat[i][3]))]
            at = pick[0] if pick else next(i for i in near if flat[i][0] == page)
            index.append((code, at))
            last_verse_at = at
        for k, (code, at) in enumerate(index):
            end = index[k + 1][1] if k + 1 < len(index) else len(flat)
            prelude = [b[1:] for b in flat[:at]] if k == 0 else []
            body = [b[1:] for b in flat[at:end]]
            # The volume's indexes ("INDEX MATERIARUM") and its "FINIS" end the last book.
            stop = next((i for i, b in enumerate(body) if b[0] == "head" and i > 0
                         and re.match(r"^\W*(?:INDEX|FINIS(?!\s+LIBRI)|SUPPL)\b", b[2], re.I)),  # the Latin: "ELENCHUS" is an "INDEX" in English
                        len(body))
            if code == "ADD":
                for c, es in supplements(body[:stop], {}).items():
                    additions.setdefault(c, []).extend(es)
                print(slug[-14:], "additions from page", flat[at][0], {c: len(es) for c, es in additions.items()})
                continue
            books[code] = (prelude, body[:stop])
            sources[code] = meta
            print(slug[-14:], code, "from page", flat[at][0], "|", flat[at][3][:50])
    order = list(NAMES)
    lines = []
    stats_all = {}
    for code in sorted(books, key=order.index):
        stats = {"chapters": 0, "numbered": 0, "by lemma": 0}
        excerpts = convert(code, *books[code], stats, additions.get(code, ()))
        print(code, stats, len(excerpts), "excerpts")
        stats_all[code] = stats
        lines += [f"# {NAMES[code]}", ""]
        meta = sources[code]
        for k, e in enumerate(excerpts):
            v, v2 = e["v"], e["v2"]
            head = f"{e['c']}:{v}" if v2 <= v else f"{e['c']}:{v}-{v2}"
            lines.append(f"## {head} {e['title']}".rstrip())
            if k == 0:
                lines.append(f"[{meta['author']}, {meta.get('title_la') or meta['title']} ({meta.get('volume', '')}). "
                             f"English: machine translation, The Faith Received (Mere Orthodoxy); the original "
                             f"follows each comment.]")
            en = [re.sub(r"^#+\s*", "", p) for p in e["en"] if p]
            la = [re.sub(r"^#+\s*", "", p) for p in e["la"] if p]
            lines.append("\n\n".join(en))
            if la:
                lines.append("\nLatin:\n\n" + "\n\n".join(la))
            lines.append("")
    Path(out_path).write_text("\n".join(lines), encoding="utf8")


if __name__ == "__main__":
    main(sys.argv[1:])
