"""Repair Greek that a transcription typed in a misread Greek font (used by tfr-to-md.py).

Some transcriptions on The Faith Received set the Greek in a font whose letters were mapped wrongly:
ς for ρ and for the στ ligature, η for κ, σ for δ, γ for λ, σθ for θ, a breathing standing apart
from its capital ("Α᾽"): "Αβςαμ έέννσε" for Ἀβραὰμ ἐγέννησε. The commentary's Greek is mostly
the verse in hand, so each word that is not a word of the Greek New Testament is compared with the
words of the chapter being commented on (Tischendorf and the Byzantine text), counting those
misreadings as small slips; when one form is clearly closest, it replaces the misreading. Any
other word (a classical quotation, a lexical form) is left as it is.
"""
import json
import re
import unicodedata
import urllib.request
from collections import Counter
from functools import lru_cache
from pathlib import Path

GREEK_WORD = re.compile(r"[Ͱ-Ͽἀ-῿]+")
TEXTS = ("grc_tis", "grc_byz")
NT = {"MAT": 28, "MRK": 16, "LUK": 24, "JHN": 21, "ACT": 28, "ROM": 16, "1CO": 16, "2CO": 13, "GAL": 6,
      "EPH": 6, "PHP": 4, "COL": 4, "1TH": 5, "2TH": 3, "1TI": 6, "2TI": 4, "TIT": 3, "PHM": 1, "HEB": 13,
      "JAS": 5, "1PE": 5, "2PE": 3, "1JN": 5, "2JN": 1, "3JN": 1, "JUD": 1, "REV": 22}
# Misreadings of the font, both ways: each costs 0.3 where another letter costs 1.
SLIPS = {frozenset(p) for p in ("ςρ", "ηκ", "σδ", "γλ", "νγ", "θσ", "πρ", "ωπ", "βπ", "τγ", "νυ", "οθ")}
# A breathing or accent set apart from its capital: "Α᾽" is Ἀ, "Α῎" is Ἄ.
SPACING = {"᾽": "̓", "᾿": "̓", "῾": "̔", "῎": "̓́", "῍": "̓̀",
           "῞": "̔́", "῝": "̔̀", "῏": "̓͂", "῟": "̔͂"}


def bare(w):
    d = unicodedata.normalize("NFD", w.lower())
    return "".join(c for c in d if not unicodedata.combining(c)).replace("ς", "σ")


class Repair:
    def __init__(self, book, cache):
        self.book, self.cache = book, Path(cache)
        self.cache.mkdir(parents=True, exist_ok=True)
        self.stats = Counter()

    def words(self, tr, book, ch):
        f = self.cache / f"{tr}-{book}-{ch}.json"
        if not f.exists():
            url = f"https://bible.helloao.org/api/{tr}/{book}/{ch}.json"
            with urllib.request.urlopen(url, timeout=60) as r:
                data = json.load(r)
            words = []
            for item in data.get("chapter", {}).get("content", []):
                if item.get("type") == "verse":
                    for x in item.get("content", []):
                        words += GREEK_WORD.findall(x if isinstance(x, str) else x.get("text", ""))
            f.write_text(json.dumps(words, ensure_ascii=False), encoding="utf8")
        return json.loads(f.read_text(encoding="utf8"))

    @lru_cache(None)
    def chapter(self, ch):
        """{bare form: Counter(accented forms)} of one chapter of the book."""
        forms = {}
        for tr in TEXTS:
            for w in self.words(tr, self.book, ch):
                forms.setdefault(bare(w), Counter())[w.lower()] += 1
        return forms

    @lru_cache(None)
    def vocabulary(self):
        return frozenset(bare(w) for b, n in NT.items() for c in range(1, n + 1) for tr in TEXTS
                         for w in self.words(tr, b, c))

    @staticmethod
    def distance(a, b):
        """From the misreading a to the form b: font slips cost 0.3 (ς or σ for στ, σθ for θ too),
        a lost γ or τ 0.4, anything else 1."""
        n, m, inf = len(a), len(b), 99.0
        d = [[inf] * (m + 1) for _ in range(n + 1)]
        d[0][0] = 0
        for i in range(n + 1):
            for j in range(m + 1):
                x = d[i][j]
                if x >= inf:
                    continue
                if i < n and j < m:
                    c = 0 if a[i] == b[j] else 0.3 if frozenset((a[i], b[j])) in SLIPS else 1
                    d[i + 1][j + 1] = min(d[i + 1][j + 1], x + c)
                if i < n and a[i] == "σ" and b[j:j + 2] == "στ":
                    d[i + 1][j + 2] = min(d[i + 1][j + 2], x + 0.3)
                if a[i:i + 2] == "σθ" and b[j:j + 1] == "θ":
                    d[i + 2][j + 1] = min(d[i + 2][j + 1], x + 0.3)
                if j < m:
                    d[i][j + 1] = min(d[i][j + 1], x + (0.4 if b[j] in "γτ" else 1))
                if i < n:
                    d[i + 1][j] = min(d[i + 1][j], x + 1)
        return d[n][m]

    @lru_cache(None)
    def word(self, w, ch):
        b = bare(w)
        if len(b) < 3 or b in self.vocabulary():
            return w
        self.stats["unknown"] += 1
        forms = self.chapter(ch)
        scored = sorted((self.distance(b, f), f) for f in forms if abs(len(f) - len(b)) <= 3)
        if not scored:
            return w
        cost, form = scored[0]
        allowed = min(0.35 * max(1, len(b) // 3), 1.2)
        if (cost > allowed or len(scored) > 1 and scored[1][0] <= cost + 0.2
                or self.distance(b[-2:], form[-2:]) > 0.6  # another ending is another form
                or b[1:] == form):  # "ὁβασιλεὺς": the article run in, not a misreading
            return w
        best = forms[form].most_common(1)[0][0]
        self.stats["repaired"] += 1
        return best[0].upper() + best[1:] if w[0].isupper() else best

    def text(self, text, ch):
        text = re.sub(r"([ΑΕΗΙΟΥΩΡ])([᾽᾿῾῎῍῞῝῏῟])",
                      lambda m: unicodedata.normalize("NFC", m.group(1) + SPACING[m.group(2)]), text)
        return GREEK_WORD.sub(lambda m: self.word(m.group(0), ch), text)
