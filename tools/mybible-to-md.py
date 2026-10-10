"""A SermonIndex commentary (MyBible module) -> Loci commentary Markdown, its Greek and Hebrew repaired.

SermonIndex's modules come from scans whose Greek and Hebrew suffered on the way:

- The Greek lost the spaces between words ("ἡσοφίατοῦθεοῦ" for "ἡ σοφία τοῦ θεοῦ"). Each run is
  split back into words by the vocabulary of the Greek New Testament and the Septuagint, and only
  where every word carries its accent or is a proclitic or enclitic.
- The Hebrew was stored in the Hebrew Windows code page and read back as the Greek one, each letter
  a Greek letter ("μπτωι" for לנפשי); pointed Hebrew has " ?" between its letters as well
  ("ςִ ?πְ ?ιָ ?ο" for עִנְיָן). Decoding is exact; the spaces it lost are restored from the Hebrew
  Bible's vocabulary.
- Words broken at the end of a printed line keep their hyphen ("right-eous", "de-<br/>scribed"):
  where the word whole occurs elsewhere in the module, it is joined.

A chapter's introduction (verse 0) is filed at its verse 1, a book's (chapter 0) at 1:1.

  python3 tools/mybible-to-md.py <module.SQLite3> <out.md> [report.txt]

Hengstenberg, as Loci ships it (from https://www.sermonindex.net/modules/mybible/SI-HENGSTENBERG.commentaries.zip):

  python3 tools/mybible-to-md.py SI-HENGSTENBERG.commentaries.SQLite3 "resources/commentaries/Hengstenberg.md"

Downloads are cached in tools/sources/mybible/ (not committed).
"""
import html
import json
import re
import sqlite3
import sys
import unicodedata
import urllib.request
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

CACHE = Path(__file__).parent / "sources" / "mybible"
SHARED = Path(__file__).parent.parent / "src" / "shared"
GREEK = re.compile(r"[Ͱ-Ͽἀ-῿]+")
BOOKS = dict(zip(range(10, 740, 10), "GEN EXO LEV NUM DEU JOS JDG RUT 1SA 2SA 1KI 2KI 1CH 2CH EZR NEH - - EST - - "
                                      "JOB PSA PRO ECC SNG - - ISA JER LAM - EZK DAN HOS JOL AMO OBA JON MIC NAM HAB "
                                      "ZEP HAG ZEC MAL MAT MRK LUK JHN ACT ROM 1CO 2CO GAL EPH PHP COL 1TH 2TH 1TI "
                                      "2TI TIT PHM HEB JAS 1PE 2PE 1JN 2JN 3JN JUD REV".split()))
NAMES = dict(re.findall(r"\['(\w{3})', '([^']+)'", (SHARED / "scriptureRef.ts").read_text()))
COUNTS = {code: [int(x) for x in counts.split(",")]
          for code, counts in re.findall(r"'?(\w{3})'?: \[([\d, ]+)\]", (SHARED / "versification.ts").read_text())}
NT_CODES = list(BOOKS.values())[list(BOOKS.values()).index("MAT"):]
stats = Counter()
examples = {"greek": [], "hebrew": [], "joined": []}


def fetch(tr, book, ch, folder="greek", pattern=GREEK):
    """The words of one chapter from bible.helloao.org, cached."""
    f = CACHE / folder / (f"{tr}-{book}-{ch}.json" if folder == "greek" else f"{book}-{ch}.json")
    if not f.exists():
        f.parent.mkdir(parents=True, exist_ok=True)
        try:
            with urllib.request.urlopen(f"https://bible.helloao.org/api/{tr}/{book}/{ch}.json", timeout=60) as r:
                data = json.load(r)
        except Exception:
            return []
        words = []
        for item in data.get("chapter", {}).get("content", []):
            if item.get("type") == "verse":
                text = " ".join(x if isinstance(x, str) else x.get("text", "") for x in item.get("content", []))
                words.extend(pattern.findall(text))
        f.write_text(json.dumps(words, ensure_ascii=False))
    return json.loads(f.read_text())


def key(w):
    """Forms as printed in running text: a final grave is the acute of the word alone, and
    capitals and final sigma are case matters."""
    w = unicodedata.normalize("NFC", w).replace("ς", "σ")
    w = unicodedata.normalize("NFD", w.lower()).replace("̀", "́")
    return unicodedata.normalize("NFC", w)


def bare(w):
    d = unicodedata.normalize("NFD", w.lower().replace("ς", "σ"))
    return "".join(ch for ch in d if not unicodedata.combining(ch))


# --- Greek --------------------------------------------------------------------------------------
NT = {b: len(COUNTS[b]) for b in NT_CODES}
VOCAB = set()
jobs = [(tr, b, c) for b, n in NT.items() for c in range(1, n + 1) for tr in ("grc_gtr", "grc_byz", "grc_tis")]
lxx = json.loads(urllib.request.urlopen("https://bible.helloao.org/api/grc_bre/books.json", timeout=60).read())["books"]
jobs += [("grc_bre", b["id"], c) for b in lxx for c in range(1, b["numberOfChapters"] + 1)]
with ThreadPoolExecutor(8) as ex:
    for words in ex.map(lambda j: fetch(*j), jobs):
        VOCAB.update(key(w) for w in words)
VOCAB.update(key(w) for w in ("Θεὸς", "Θεοῦ", "Θεῷ", "Θεὸν", "Κύριος", "Κυρίου", "Κυρίῳ", "Κύριον", "Χριστὸς",
                               "Ἰησοῦς", "Πνεῦμα", "Πνεύματος", "Δαυὶδ"))
BARE = {bare(w) for w in VOCAB if len(bare(w)) >= 2}
MAXLEN = max(len(w) for w in VOCAB)
ACCENTS = "́̀͂"
ELIDED = ("ἐπ", "ἀπ", "ὑπ", "ἐφ", "ἀφ", "ὑφ", "κατ", "καθ", "μετ", "μεθ", "παρ", "δι", "ἀλλ", "ἀνθ", "ἀντ", "οὐδ",
          "μηδ")
PROCLITIC = {bare(w) for w in ("ὁ", "ἡ", "οἱ", "αἱ", "ἐν", "εἰς", "ἐκ", "ἐξ", "εἰ", "ὡς", "οὐ", "οὐκ", "οὐχ") + ELIDED}
VOCAB.update(key(w) for w in ELIDED)
BARE.update(bare(w) for w in ELIDED)
ARTICLE = {bare(w) for w in ("ὁ", "ἡ", "οἱ", "αἱ")}
ENCLITIC = {bare(w) for w in ("μου", "μοι", "με", "σου", "σοι", "σε", "τις", "τι", "τινος", "τινι", "τινα", "εστι",
                                "εστιν", "εισι", "εισιν", "εἰμι", "φημι", "φησι", "φησιν", "πως", "ποτε", "που", "γε", "τε",
                                "τοι", "περ")}


def accents(w):
    return sum(1 for ch in unicodedata.normalize("NFD", w) if ch in ACCENTS)


def split_run(run):
    """Fewest known words covering the run; an unknown stretch costs more than any known split."""
    n = len(run)
    best = [(0.0, -1, False)] + [(1e9, -1, False)] * n
    for i in range(1, n + 1):
        for j in range(max(0, i - MAXLEN), i):
            if best[j][0] >= 1e9:
                continue
            piece = run[j:i]
            if key(piece) in VOCAB or bare(piece) in BARE:
                cost, ok = best[j][0] + (1 if key(piece) in VOCAB else 1.4), True
            else:
                cost, ok = best[j][0] + 3 + 0.2 * (i - j), False
            if cost < best[i][0]:
                best[i] = (cost, j, ok)
    parts, i = [], n
    while i > 0:
        _, j, ok = best[i]
        parts.append((run[j:i], ok))
        i = j
    merged = []
    for p, ok in reversed(parts):
        if merged and not ok and not merged[-1][1]:
            merged[-1] = (merged[-1][0] + p, False)
        else:
            merged.append((p, ok))
    return merged


def plausible(run, parts):
    """Every word carries an accent but the proclitics and enclitics; a run with one accent splits
    only after an article ("ὁβασιλεὺς"), never "ἐκπειράζειν" into "ἐκ πειράζειν"."""
    for p, _ in parts:
        b = bare(p)
        if not accents(p) and b not in PROCLITIC and b not in ENCLITIC and not (len(b) >= 3 and b in BARE):
            return False
    n = accents(run)
    if n >= 2:
        return True
    if n != 1:
        return False
    k = next(i for i, (p, _) in enumerate(parts) if accents(p))
    return all(bare(p) in ARTICLE for p, _ in parts[:k]) and all(bare(p) in PROCLITIC | ENCLITIC for p, _ in parts[k + 1:])


def learn_own_greek(texts):
    """The commentary's own Greek, where the module kept a word on its own, is vocabulary too: it
    covers the classical and patristic words."""
    own = Counter()
    for t in texts:
        for w in GREEK.findall(t or ""):
            if accents(w) == 1 and len(w) >= 3 and not (bare(w)[:1] in ("ο", "η") and bare(w)[1:] in BARE) \
                    and not (bare(w)[:2] in ("οι", "αι") and bare(w)[2:] in BARE):
                own[key(w)] += 1
    for w, n in own.items():
        parts = split_run(w)
        if n >= 2 and not (len(parts) > 1 and all(ok for _, ok in parts) and plausible(w, parts)):
            VOCAB.add(w)
            BARE.add(bare(w))


def respace(m):
    run = m.group(0)
    if key(run) in VOCAB or len(run) < 4:
        return run
    stats["greek runs"] += 1
    parts = split_run(run)
    if len(parts) == 1 or not plausible(run, parts) or sum(len(p) for p, ok in parts if ok) < 0.6 * len(run):
        stats["greek left whole"] += 1
        return run
    stats["greek respaced"] += 1
    new = " ".join(p for p, _ in parts)
    if len(examples["greek"]) < 300:
        examples["greek"].append(f"{run} -> {new}")
    return new


# --- Hebrew -------------------------------------------------------------------------------------
POINTS = re.compile(r"[֑-ֽֿ-ׇ]")
HEB_LETTERS = re.compile(r"[א-ת]+")
HEB_VOCAB, HEB_FREQ = set(), Counter()
OT = [b for b in BOOKS.values() if b != "-" and b not in NT_CODES]
with ThreadPoolExecutor(8) as ex:
    for words in ex.map(lambda j: fetch("hbo_wlc", *j, folder="wlc", pattern=re.compile(r"[֐-׿]+")),
                        [(b, c) for b in OT for c in range(1, len(COUNTS[b]) + 1)]):
        for w in words:
            for x in POINTS.sub("", w).split("־"):
                HEB_FREQ[x] += 1
                if len(x) >= 2:  # single letters are the text's paragraph marks (ס, פ)
                    HEB_VOCAB.add(x)
HEB_MAX = max(len(w) for w in HEB_VOCAB)
# Letters Greek never shows unaccented (ΰ, ϊ), a maqaf (Ξ) between lower-case letters, or a final ς
# mid-word: these are Hebrew for certain.
SURE_HEBREW = re.compile(r"[ΰϊ]|(?<=[α-ω])Ξ(?=[α-ω])|ς(?=.)")
# Pointed Hebrew: a letter, its points, and " ?" before the next ("ςִ ?πְ ?ιָ ?ο").
POINTED = re.compile("[\u0370-\u03ff\u05d0-\u05ea\u0591-\u05c7]*[\u0591-\u05c7][\u0370-\u03ff\u05d0-\u05ea\u0591-\u05c7]*"
                     "(?: \\?[\u0370-\u03ff\u05d0-\u05ea\u0591-\u05c7]+)*")


def as_hebrew(run):
    try:
        return "".join(c if POINTS.match(c) or HEB_LETTERS.match(c) else c.encode("cp1253").decode("cp1255")
                       for c in run)
    except (UnicodeEncodeError, UnicodeDecodeError):
        return None


def heb_split(word):
    n = len(word)
    best = [(0.0, -1, False)] + [(1e9, -1, False)] * n
    for i in range(1, n + 1):
        for j in range(max(0, i - HEB_MAX), i):
            if best[j][0] < 1e9:
                ok = word[j:i] in HEB_VOCAB
                cost = best[j][0] + (1 if ok else 3 + 0.3 * (i - j))
                if cost < best[i][0]:
                    best[i] = (cost, j, ok)
    parts, i = [], n
    while i > 0:
        _, j, ok = best[i]
        parts.append((word[j:i], ok))
        i = j
    return parts[::-1]


def spaced(chunk):
    """Space a decoded run only where every piece is a Hebrew Bible word and a final form inside
    it (ם ן ץ ף ך) or its length makes two words sure; a pointed word is one word."""
    if POINTS.search(chunk):
        return chunk
    parts = heb_split(chunk)
    sure = re.search(r"[ךםןףץ](?=.)", chunk) or len(chunk) >= 7
    return " ".join(p for p, _ in parts) if sure and all(ok for _, ok in parts) else chunk


def hebrew(text):
    def pointed(m):
        h = as_hebrew(m.group(0).replace(" ?", ""))
        if not h or not HEB_LETTERS.search(h):
            return m.group(0)
        stats["hebrew pointed"] += 1
        if len(examples["hebrew"]) < 300:
            examples["hebrew"].append(f"{m.group(0)} -> {h}")
        return h

    text = POINTED.sub(pointed, text)

    def fix(m):
        nonlocal text
        run = m.group(0)
        # A lone letter in a note on the Hebrew ("the δ is added", "followed by α of the object"):
        # the Hebrew letter, where Hebrew stands near it.
        if len(run) == 1 and letters and run in "αβγδεζηθικλμνξοπρςστυφχψωΰϊ" and re.search(
                "[\u05d0-\u05ea]", text[max(0, m.start() - 200):m.end() + 200]):
            h = as_hebrew(run)
            if h and HEB_LETTERS.fullmatch(h):
                stats["hebrew letters"] += 1
                return h
        # Real Greek is accented; ΰ, ϊ and ΐ carry marks of their own, but here are Hebrew (א, ת).
        if any(unicodedata.combining(ch) for ch in unicodedata.normalize("NFD", re.sub("[ΰϊΐ]", "", run))) or len(run) < 2:
            return run
        if run.isupper() or (bare(run) in BARE and not SURE_HEBREW.search(run)):
            return run  # Greek capitals, or a Greek word the module left unaccented ("γνωμη")
        h = as_hebrew(run)
        if not h or not HEB_LETTERS.search(h) or not re.fullmatch(r"[א-ת־ְ-ׇ]+", h):
            return run
        near = text[max(0, m.start() - 80):m.start()]
        plain = POINTS.sub("", h)
        segs = [seg for chunk in plain.split("־") for seg in heb_split(chunk)]
        whole = sum(len(p) for p, ok in segs if ok) == len(plain.replace("־", "")) and len(plain) >= 2
        common = HEB_FREQ.get(plain, 0) >= 5 and len(plain) >= 3
        # Sure by its letters, or wholly Hebrew Bible words: long, common, or beside "Heb." or other
        # Hebrew, so an unaccented Greek word ("γε", "πειθω") stays Greek.
        # The commentary's real Greek is accented, so an unaccented run that is no Greek word is
        # Hebrew in an English sentence ("from a substantive ρμ", "πγβμ is uncertain").
        foreign = bare(run) not in BARE and bare(run) not in PROCLITIC | ENCLITIC
        if not (SURE_HEBREW.search(run) or foreign or (whole and (len(plain) >= 5 or common
                                                       or re.search("Heb|[\u05d0-\u05ea]", near)))):
            return run
        stats["hebrew decoded"] += 1
        out = "־".join(spaced(chunk) for chunk in h.split("־"))
        if len(examples["hebrew"]) < 300:
            examples["hebrew"].append(f"{run} -> {out}")
        return out

    letters = False
    text = GREEK.sub(fix, text)
    letters = True  # then the lone letters, now that the Hebrew around them reads as Hebrew
    return GREEK.sub(fix, text)


# --- English ------------------------------------------------------------------------------------
WORD = re.compile(r"[A-Za-z]+")


def dehyphenate(text, known):
    """Rejoin a word broken at a printed line's end ("right-eous", "de-<br/>scribed") where the
    whole word occurs elsewhere in the module; "self-evident" keeps its hyphen."""
    def join(m):
        a, br, b = m.group(1), m.group(2), m.group(3)
        whole = (a + b).lower()
        if known.get(whole, 0) >= 1 and (br or known.get(whole, 0) > known.get(f"{a}-{b}".lower(), 0)):
            stats["hyphens joined"] += 1
            if len(examples["joined"]) < 200:
                examples["joined"].append(f"{a}-{b} -> {a + b}")
            return a + b
        return f"{a}-{b}" if br else m.group(0)
    return re.sub(r"\b([A-Za-z]+)-(\s*<br\s*/?>\s*)?([a-z]+)\b", join, text)


# Characters the scans' text lost ("Rosenm\ufffdller"), where the word or the use says what they were:
# a section sign, curly quotes, the umlauts and ligature of a few names.
LOST = [("\ufffd\u02dc", "§"), ("\ufffdg", "“"), ("\ufffdh", "”"), ("\ufffde", "‘"), ("Rosenm\ufffdller", "Rosenmüller"),
        ("K\ufffdper", "Küper"), ("R\ufffdckert", "Rückert"), ("\ufffdcumenical", "Œcumenical"), ("P\ufffd.", "Pu."),
        ("G\ufffdlg\ufffdl", "Gülgül"), ("B\ufffdlb\ufffdl", "Bülbül")]


def to_text(h):
    h = h or ""
    for bad, good in LOST:
        h = h.replace(bad, good)
    h = h.replace("\ufffd", "\u2014")  # the rest stood between words or clauses: a dash
    h = re.sub(r"<br\s*/?>", "\n", h)
    h = re.sub(r"</p>\s*", "\n\n", h)
    t = html.unescape(re.sub(r"<[^>]+>", "", h))
    t = re.sub(r"[ \t]+", " ", t)
    t = re.sub(r"(?m)^ +| +$", "", t)
    t = re.sub(r"(?m)^#+\s*", "", t)  # a line opening with "#" is not a heading
    return re.sub(r"\n{3,}", "\n\n", t).strip()


def marks(t):
    """Accents stored apart from their letters ("θηρι\u0301ον"), some with " ?" before them ("ἀ ?\u0301νω"),
    set back on them, so the word is one word again."""
    t = re.sub("(?<=[\u0370-\u03ff\u1f00-\u1fff\u0300-\u036f]) \\?(?=[\u0300-\u036f])", "", t)
    t = re.sub("(?<=[\u0300-\u036f]) \\?(?=[\u0370-\u03ff\u1f00-\u1fff\\s,.;:)])", "", t)
    return unicodedata.normalize("NFC", t)


def main(src, out, report=None):
    db = sqlite3.connect(src)
    rows = db.execute("SELECT book_number, chapter_number_from, verse_number_from, chapter_number_to, "
                      "verse_number_to, text FROM commentaries ORDER BY book_number, chapter_number_from, "
                      "verse_number_from").fetchall()
    learn_own_greek(r[5] for r in rows)
    plain = " ".join(re.sub(r"<[^>]+>", " ", r[5] or "") for r in rows)
    known = Counter(w.lower() for w in WORD.findall(plain))
    known.update(m.lower() for m in re.findall(r"\b[A-Za-z]+-[a-z]+\b", plain))
    lines, cur = [], None
    for bn, c, v, c2, v2, text in rows:
        book = BOOKS.get(bn)
        if not book or book == "-":
            stats["rows skipped"] += 1
            continue
        if book != cur:
            lines += [f"# {NAMES[book]}", ""]
            cur = book
        title = ""
        if c == 0 or v == 0:
            c, v, c2, v2, title = max(c, 1), 1, max(c, 1), 1, " Introduction"
        c2, v2 = c2 or c, v2 or v
        if v2 > COUNTS[book][c2 - 1]:
            # A row whose end verse is the end chapter ("29:17 to 29:30" for "Ezekiel 29:17 to
            # Ezekiel 30:19"): the comment's own opening gives the passage.
            m = re.search(rf"\b{c}:{v}\s*(?:-|to)\s*(?:[A-Z][a-z]+\s+)?(\d+):(\d+)", re.sub(r"<[^>]+>", "", text)[:200])
            c2, v2 = (int(m.group(1)), int(m.group(2))) if m else (c2, COUNTS[book][c2 - 1])
            stats["ranges mended"] += 1
        ref = f"{c}:{v}" if (c2, v2) <= (c, v) else f"{c}:{v}-{v2}" if c2 == c else f"{c}:{v}-{c2}:{v2}"
        body = GREEK.sub(respace, hebrew(marks(to_text(dehyphenate(text or "", known)))))
        lines += [f"## {ref}{title}", body, ""]
    Path(out).write_text("\n".join(lines), encoding="utf8")
    print(dict(stats))
    if report:
        Path(report).write_text(json.dumps(stats) + "\n" + "\n\n".join(
            k.upper() + "\n" + "\n".join(v) for k, v in examples.items()), encoding="utf8")


if __name__ == "__main__":
    main(*sys.argv[1:])
