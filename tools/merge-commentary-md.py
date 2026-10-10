"""Merge Loci commentary Markdown files into one: each book's excerpts from every file, the
introductions first and the rest in verse order (a file's own order kept among equals); a source
note repeated word for word is kept once.

  python3 tools/merge-commentary-md.py <out.md> <part.md> ...
"""
import re
import sys
from pathlib import Path

SHARED = Path(__file__).parent.parent / "src" / "shared"
ORDER = [name for _, name in re.findall(r"\['(\w{3})', '([^']+)', \d+", (SHARED / "scriptureRef.ts").read_text())]


def main(out, *parts):
    books, notes = {}, set()
    for part in parts:
        book = None
        for block in re.split(r"(?m)^(?=#{1,2} )", Path(part).read_text(encoding="utf8")):
            if block.startswith("# "):
                book = block[2:].strip()
                books.setdefault(book, [])
            elif block.startswith("## ") and book:
                m = re.match(r"## (\d+):(\d+)", block)
                head, _, body = block.partition("\n")
                note = re.match(r"\[[^\n]*the original follows each comment\.\]\n", body)
                if note:
                    body = body if note.group(0) not in notes else body[note.end():]
                    notes.add(note.group(0))
                books[book].append((head, body, int(m.group(1)), int(m.group(2)), "Introduction" in head))
    lines = []
    for book in sorted(books, key=ORDER.index):
        es = books[book]
        es = [e for e in es if e[4] and (e[2], e[3]) == (1, 1)] + sorted(
            (e for e in es if not (e[4] and (e[2], e[3]) == (1, 1))), key=lambda e: (e[2], e[3]))
        lines += [f"# {book}", ""]
        for head, body, *_ in es:
            lines.append(head)
            lines.append(body.rstrip("\n"))
            lines.append("")
    Path(out).write_text("\n".join(lines) + "\n", encoding="utf8")


if __name__ == "__main__":
    main(*sys.argv[1:])
