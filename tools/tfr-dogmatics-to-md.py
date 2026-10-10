"""A dogmatics from The Faith Received -> one Loci dogmatics Markdown file.

The work's own table of contents (its meta.json "structure": entries with a title, a depth and a
page) gives the shape: the entries one level below the title are the loci (the books, "##"), and
every entry below a locus opens a section ("###"). A section under a chapter (a deeper entry)
carries the chapter's title before its own, so "Chapter III. On the Object of Baptism: Who ought
to be baptized". Each entry is found on its page by the heading that best matches its title (the
contents were made from another pass of the translation, so titles and headings differ in
wording and in their numbers); one that cannot be found starts at the top of its page.

The English and Latin editions are paired page by page, as in tfr-to-md.py; each section is the
English with the original underneath ("Latin:").

  python3 tools/tfr-dogmatics-to-md.py <out.md> <slug> [<slug> ...] [options]

Several slugs (a work's volumes) make one file, one work per slug unless --one-work is given.

  --title TITLE        the work's heading (default: the catalogue's title)
  --one-work           all the slugs are one work (volumes of it), under one heading
  --end [VOL:]PAGE     stop before this page (default: the first index page, if listed)
  --drop-running-heads leave out short paragraphs in capitals recurring on three pages or more
  --dump-json PATH     also write each locus's title and paired English/Latin blocks (for merging
                       two editions of a work, as tools/merge-dogmatics-editions.py does)
  --open-titles        name a long stretch's parts by their opening words, not "(continued)"
  --book-depth N       the contents depth of the loci (default 2); deeper entries are sections
  --book-match REGEX   only entries at that depth matching REGEX are loci (the rest run on)
  --any-depth          loci and sections by --book-match and --section-match alone, at any depth
  --section-match REGEX  only entries matching REGEX open sections (the rest run on)
  --chapter-match REGEX  sections that lend their title to the ones after them (default: the
                       entries one level below a locus)
  --book-fallback REGEX  in a volume with no entry matching --book-match, the loci are these
  --start-match REGEX  in each volume, leave out the entries more than a page before the first
                       entry matching REGEX (a synopsis of the volume ahead of its text)
  --dedupe             a locus or section listed twice in a volume is kept only where it comes last
  --skip-match REGEX   entries whose pages are left out until the next locus (default: indices)
  --book [VOL:]PAGE=TITLE  a locus the contents miss, starting at the heading on PAGE matching TITLE
  --skip [VOL:]PAGE=TITLE  leave out from the heading on PAGE matching TITLE to the next locus (an
                       index amid the front matter)
  --trim [VOL:]PAGE=ENGLISH|LATIN  on PAGE, leave out each language's text before these words (a
                       volume's contents run into its first page of text)
  --not-book [VOL:]PAGE  a level-two entry on PAGE that is not a locus (its entries join the one before)
  --rename [VOL:]PAGE=TITLE  a locus's title, where the contents garble it
                       (VOL: in that volume only, counting the slugs from 1)

Hutter, Quenstedt, Calov, Hollaz, Baier, Meisner (the Anthropologia and the Christologia) and Musaeus,
as Loci ships them:

  python3 tools/tfr-dogmatics-to-md.py "resources/dogmatics/Hutter Loci Communes.md" leonhard-hutter-loci-communes-theologici --title "Loci Communes Theologici" --end 1072 \\
    --book "136=Topic II. Concerning the Person, or the two Natures of Christ the Savior" \\
    --rename "17=Prolegomena" --rename "27=On Holy Scripture and Unwritten Traditions" --rename "280=On Free Will" --rename "104=On God, One and Triune" --rename "136=On the Person and Two Natures of Christ" \\
    --rename "269=On Necessity and Contingency" --rename "323=On Original Sin" \\
    --rename "603=On the Sacraments in General" --rename "695=On the Lord's Supper" \\
    --rename "897=On the Resurrection of the Dead" --rename "905=On Christian Liberty"

  python3 tools/tfr-dogmatics-to-md.py "resources/dogmatics/Quenstedt Theologia Didactico-Polemica.md" quenstedt-systema-theologicum --title "Theologia Didactico-Polemica" --end 2175 \\
    --skip "591=CHAPTER I. On Theology in general. page 1" --skip "822=CHAPTER I. On the State of Integrity & the Image of GOD. page 1" \\
    --skip "1483=CHAPTER I. On the Universal Benevolence of GOD. page 1" \\
    --book-depth 1 --book-match '^\\W*(?:chap|cap)' \\
    --section-match '\\b(?:section|sectio|question|quaestio|corollar|πόρισμ)' --chapter-match '(?!x)x' \\
    --book "1474=CHAPTER XI. ON RENEWAL." --book "2119=CHAPTER XIX. CONCERNING THE EXTREME JUDGMENT." \\
    --book "2148=CHAPTER XX. ON THE CONSUMMATION OF THE AGE." \\
    --rename "328=On God Considered in Relation, or on the Most Holy Trinity" --rename "1862=On the Cross" \\
    --rename "1907=On the Ecclesiastical Ministry" --rename "2119=On the Last Judgment"

  V=calov-systema-locorum-theologicorum
  python3 tools/tfr-dogmatics-to-md.py "resources/dogmatics/Calov Systema Locorum Theologicorum.md" $V-as-4930128 $V-as-4930294 $V-as-vol-3 $V-as-vol-4 $V-as-4930617 \\
    $V-as-4930764 $V-as-4930937 $V-as-vol-9 $V-as-4931261 $V-as-4931492 $V-as-vol-12 \\
    --one-work --title "Systema Locorum Theologicorum" --any-depth --dedupe --start-match '^\\W*I\\.\\s*N\\.\\s*I\\.\\s*(?:D\\.\\s*)?ABRAHAM' \\
    --book-match '^\\W*(?:I\\.\\s*N\\.\\s*I\\.\\s*)?(?:(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\\s+)?(?:article|articulus)\\b' \\
    --book-fallback '^\\W*(?:chap(?:ter)?|cap(?:ut)?)\\b\\.?\\s*[IVXL1]+\\b' \\
    --chapter-match '^\\W*(?:single\\s+)?(?:chap(?:ter)?|cap(?:ut)?)\\b' \\
    --section-match '\\b(?:chap|cap|question|quaest)' \\
    --rename "7:33=Concerning the Church: Its States Before and After Christ" \\
    --book "10:17=CHAPTER I. ON THE DECALOGUE IN GENERAL" --rename "10:17=On the Decalogue in General" \\
    --book "10:157=CHAPTER I. ON THE FOURTH COMMANDMENT, ON HONORING PARENTS" \\
    --rename "10:157=Concerning the Second Table of the Law, on the Love of Neighbour"

  python3 tools/tfr-dogmatics-to-md.py "resources/dogmatics/Hollaz Examen Theologicum Acroamaticum.md" david-hollaz-examen-theologicum-acroamaticum \\
    --title "Examen Theologicum Acroamaticum" --end 1414 --any-depth --book-match '(?!x)x' --chapter-match '(?!x)x' \\
    --section-match '^(?!.*\\b(?:chapter|caput|capvt|part|propaedeutics|preface|examen)\\b)' \\
    --book "30=THEOLOGICAL PROPAEDEUTICS CHAPTER I. PRESENTING A GENERAL PROLEGOMENON" --rename "30=Prolegomenon I: On Theology" \\
    --book "61=PRESENTING PROLEGOMENON II." --rename "61=Prolegomenon II: On Religion, the General Object of Theology" \\
    --book "89=CHAPTER III. PROLEGOMENON III. ON THE PROPER AND ADEQUATE PRINCIPLE OF THEOLOGY" --rename "89=Prolegomenon III: On Holy Scripture, the Principle of Theology" \\
    --book "216=OF THE FIRST PART OF THEOLOGY" --rename "216=Concerning God" \\
    --book "311=CHAPTER II. CONCERNING THE HIGHEST MYSTERY OF THE HOLY TRINITY" --rename "311=On the Highest Mystery of the Holy Trinity" \\
    --book "379=CHAPTER III. ON DIVINE ACTIONS IN GENERAL, AND IN PARTICULAR ON CREATION" --rename "379=On Divine Actions in General, and on Creation" \\
    --book "403=CHAPTER IV. CONCERNING ANGELS." --rename "403=Concerning Angels" \\
    --book "435=Q. I. What is man?" --rename "435=Concerning Man" \\
    --book "449=I. What is divine providence?" --rename "449=On Divine Providence" \\
    --book "480=OF THE FIRST PART OF THEOLOGY CHAPTER VII. OF THE FORMAL END OF THEOLOGY" --rename "480=On the Formal End of Theology, the Vision and Enjoyment of God" \\
    --book "490=PART II OF THEOLOGY CONCERNING THE SUBJECT OF THEOLOGY" --rename "490=On the Subject of Theology, Fallen Man, and the Image of God" \\
    --book "517=PART II. CHAPTER II OF THEOLOGY. OF SIN IN GENERAL." --rename "517=Of Sin in General" \\
    --book "535=ON THE FIRST AND ORIGINAL SIN OF MEN." --rename "535=On the First and Original Sin of Men" \\
    --book "566=I. What is actual sin?" --rename "566=On Actual Sin" \\
    --book "598=THEOL. PART II. CHAP. V. CONCERNING THE DEFECT OF FREE WILL" --rename "598=On the Defect of Free Will in Spiritual Matters" \\
    --book "614=THE THIRD PART OF THEOLOGY. CONCERNING THE PRINCIPLES AND MEANS OF SALVATION" --rename "614=On the Principles of Salvation, and the Universal Benevolence of God" \\
    --book "633=CHAPTER II. CONCERNING THE SPECIAL BENEVOLENCE OF GOD AND THE PREDESTINATION" --rename "633=On the Special Benevolence of God, and Predestination" \\
    --book "679=CHAPTER III. CONCERNING THE FRATERNAL REDEMPTION OF CHRIST" --rename "679=On the Redemption of Christ, His Person and Office" \\
    --book "820=CHAPTER IV. ON THE APPLYING GRACE OF THE HOLY SPIRIT" --rename "820=On the Applying Grace of the Holy Spirit, and the Call" \\
    --book "848=CHAPTER V. OF ILLUMINATING GRACE" --rename "848=On Illuminating Grace, and Illumination" \\
    --book "881=CHAPTER VI. CONCERNING THE CONVERTING GRACE OF THE HOLY SPIRIT" --rename "881=On Converting Grace, and Conversion" \\
    --book "905=CHAPTER VII ON REGENERATING GRACE." --rename "905=On Regenerating Grace, and Regeneration" \\
    --book "921=OF JUSTIFYING GRACE, AND THE JUSTIFICATION OF THE SINNER BEFORE GOD." --rename "921=On Justifying Grace, and the Justification of the Sinner" \\
    --book "961=CHAPTER IX. ON INHABITING GRACE, AND ON THE MYSTICAL UNION" --rename "961=On Inhabiting Grace, and the Mystical Union" \\
    --book "975=CHAPTER X. ON RENEWING GRACE AND THE RENEWAL OF JUSTIFIED MEN." --rename "975=On Renewing Grace, and Renewal" \\
    --book "992=CHAPTER XI. OF PRESERVING GRACE, AND THE PERSEVERANCE OF THE FAITHFUL." --rename "992=On Preserving Grace, and Perseverance" \\
    --book "999=CHAPTER XII. CONCERNING GLORIFYING GRACE, AND THE ETERNAL BLESSEDNESS" --rename "999=On Glorifying Grace, and Eternal Blessedness" \\
    --book "1020=CHAPTER I. ON THE MEANS OF SALVATION IN GENERAL, AND ON THE WORD OF THE LAW" --rename "1020=On the Means of Salvation in General, and the Law" \\
    --book "1061=is a proclamation of purely gratuitous grace" --rename "1061=On the Gospel" \\
    --book "1082=THEOL. PART. III. SECT. II. CAPVT III. ON THE SACRAMENTS IN GENERAL" --rename "1082=On the Sacraments in General, and of the Old Testament" \\
    --book "1106=THEOLOGY PART 3, SECTION 2, CHAPTER 4. CONCERNING THE SACRAMENTS OF THE NEW TESTAMENT" --rename "1106=On the Sacraments of the New Testament, and Baptism" \\
    --book "1132=CHAPTER V. OF THE EUCHARIST, OR THE LORD'S SUPPER." --rename "1132=On the Eucharist, or the Lord's Supper" \\
    --book "1170=THEOL. PART. III. SECT. II. CAPVT VI. ON THE PENITENCE OF THE SINNER" --rename "1170=On the Penitence of the Sinner" \\
    --book "1192=CHAPTER VII. ON FAITH IN CHRIST." --rename "1192=On Faith in Christ" \\
    --book "1219=ON THE EFFECTS OF FAITH, OR GOOD WORKS, AND THEIR EXERCISE." --rename "1219=On Good Works, the Effects of Faith" \\
    --book "1252=CHAPTER IX. CONCERNING THE ISAGOGIC, OR EXECUTIVE, MEANS OF SALVATION" --rename "1252=On Death, and the Resurrection of the Dead" \\
    --book "1275=CHAPTER X. CONCERNING THE LAST JUDGMENT AND THE CONSUMMATION OF THE AGE" --rename "1275=On the Last Judgment and the Consummation of the Age" \\
    --book "1305=OF THEOLOGY, CHAPTER I. OF THE CHURCH." --rename "1305=Of the Church" \\
    --book "1360=PART IV OF THEOLOGY, CHAPTER II. ON THE TRIPLE HIERARCHICAL STATE" --rename "1360=On the Threefold Hierarchical State, and the Ministry" \\
    --book "1381=OF THEOLOGY CHAPTER III. OF THE POLITICAL MAGISTRATE." --rename "1381=Of the Political Magistrate"

  B=baier-compendium-theologiae-positivae
  python3 tools/tfr-dogmatics-to-md.py tools/sources/baier/baier-walther.md $B-vol-1 $B-vol-2 $B-vol-3a $B-vol-3b \\
    --one-work --title "Compendium Theologiae Positivae" --any-depth --open-titles --drop-running-heads \\
    --book-match '(?!x)x' --section-match '(?!x)x' --end 4:219 \\
    --trim "2:1=OF POSITIVE THEOLOGY PART ONE|Dei a nomine" \\
    --book "1:1=Prolegomena, Chapter I. On the nature of theology" --rename "1:1=Prolegomena: On the Nature of Theology" \\
    --book "1:77=PROLEGOMENA Chapter II. ON THE PRINCIPLE OF REVEALED THEOLOGY" --rename "1:77=Prolegomena: On the Principle of Revealed Theology, or Holy Scripture" \\
    --book "2:1=THEOLOGY PART ONE Chapter I. CONCERNING GOD. § 1." --rename "2:1=Concerning God" \\
    --book "2:65=Chapter II. On creation" --rename "2:65=On Creation" \\
    --book "2:91=Chapter III. CONCERNING ANGELS. § 1." --rename "2:91=Concerning Angels" \\
    --book "2:129=ON THE IMAGE OF GOD BESTOWED UPON MAN IN THE FIRST CREATION. § 1." --rename "2:129=On the Image of God Bestowed upon Man in the First Creation" \\
    --book "2:146=ON THE PROVIDENCE OF GOD. § 1." --rename "2:146=On the Providence of God" \\
    --book "2:165=PART I. CHAP. VI. Chapter VI. ON ETERNAL BLESSEDNESS. § 1." --rename "2:165=On Eternal Blessedness" \\
    --book "2:187=Chapter VII. Concerning death or eternal damnation" --rename "2:187=Concerning Eternal Death, or Damnation" \\
    --book "2:205=Chapter VIII. ON TEMPORAL DEATH. § 1." --rename "2:205=On Temporal Death" \\
    --book "2:221=Chapter IX. On the resurrection of the dead" --rename "2:221=On the Resurrection of the Dead" \\
    --book "2:231=Chapter X. Concerning the last judgment and the consummation of the age" --rename "2:231=Concerning the Last Judgment and the Consummation of the Age" \\
    --book "2:243=PART TWO Chapter I. CONCERNING SIN IN GENERAL. §" --rename "2:243=Concerning Sin in General" \\
    --book "2:257=Chapter II. On original sin" --rename "2:257=On Original Sin" \\
    --book "2:280=CONCERNING ACTUAL SINS. § 1. Actual sin, by the force of the word" --rename "2:280=Concerning Actual Sins" \\
    --book "3:1=OF POSITIVE THEOLOGY PART THREE Chapter 1. CONCERNING THE GRACE OF GOD" --rename "3:1=Concerning the Grace of God toward Fallen Men" \\
    --book "3:15=CONCERNING CHRIST, THE PRINCIPLE AND FOUNDATION OF OUR SALVATION" --rename "3:15=Of Christ: His Person, States and Office" \\
    --book "3:117=ON FAITH IN CHRIST. § 1." --rename "3:117=On Faith in Christ" \\
    --book "3:153=Chapter IV. ON REGENERATION AND CONVERSION. § 1." --rename "3:153=On Regeneration and Conversion" \\
    --book "3:211=ON JUSTIFICATION. § 1." --rename "3:211=On Justification" \\
    --book "3:255=Chapter VI. ON RENEWAL AND GOOD WORKS. § 1." --rename "3:255=On Renewal and Good Works" \\
    --book "4:2=PART III. CHAP. VII. Chapter VII. CONCERNING THE WORD OF LAW AND GOSPEL. § 1." --rename "4:2=Concerning the Word of Law and Gospel" \\
    --book "4:52=ON THE SACRAMENTS IN GENERAL. § I." --rename "4:52=On the Sacraments in General" \\
    --book "4:71=PART III. CAP. IX. Chapter IX. ON THE SACRAMENTS OF THE OLD TESTAMENT. § I." --rename "4:71=On the Sacraments of the Old Testament" \\
    --book "4:84=Chapter X. ON BAPTISM. § 1." --rename "4:84=On Baptism" \\
    --book "4:131=PART III. CHAP. XI. Chapter XI. OF THE SACRED SUPPER. § 1." --rename "4:131=Of the Holy Supper" \\
    --book "4:165=Chapter XII. On predestination and reprobation" --rename "4:165=On Predestination and Reprobation" \\
    --dump-json tools/sources/baier/walther.json

Calov's tomes are those of the Wittenberg edition (1655-77; the sixth is bound with the fifth),
each opening with a synopsis of its own contents before the text. Hollaz's and Baier's contents
miss or misplace too many chapters to go by, so their chapters are listed here, each found by its
opening words (Hollaz's chapters end with a prayer, a "Suspirium", before the next begins). Baier is
Walther's edition, of which The Faith Received's last volume breaks off after Predestination (the
Church, the Ministry, the Magistrate and the Household survive only in fragments, left out); where a
chapter's opening words did not survive, it starts at the top of the page its running heads begin.
Loci ships Baier merged with his 1686 edition by tools/merge-dogmatics-editions.py, so this Baier
command writes to tools/sources/baier/, for the merge.

Downloads are cached in tools/sources/tfr/ (not committed).

  M=balthasar-meisner-anthropologia-sacra
  python3 tools/tfr-dogmatics-to-md.py "resources/dogmatics/Meisner Anthropologia Sacra.md" $M-vol-1 $M-vol-2 $M-vol-3 \\
    --one-work --title "Anthropologia Sacra" --open-titles --drop-running-heads \\
    --end 1:9999 --end 2:9999 --end 3:9999 \\
    --section-match '^\\W*(?:single\\s+)?(?:question|quaestio|problem|proem|thesis|argument|class|classis)\\b' \\
    --not-book 2:236 --not-book 2:303 --not-book 1:425 \\
    --not-book 1:6 --not-book 2:12 --not-book 3:8 --not-book 1:396 \\
    --book "1:4=TO THE MOST NOBLE AND MAGNIFICENT MEN" --book "2:4=To the Most Reverend, Most Noble, and Magnificent Man, Lord Matthias Hoe ab Hoenegg" \\
    --book "3:4=TO THE MOST ILLUSTRIOUS COUNT AND LORD, LORD GEORGE THURZO" --book "1:396=DISPUTATION X. CONCERNING THE SIN AGAINST THE HOLY SPIRIT" \\
    --rename "1:4=Preface to the First Decade" --rename "2:4=Preface to the Second Decade" --rename "3:4=Preface to the Third Decade" \\
    --rename "1:18=Disputation I. On the Image of God" --rename "1:156=Disputation V. On the Existence and Propagation of Original Sin" \\
    --rename "1:258=Disputation VII. On the Punishment of Original Sin" --rename "1:287=Disputation VIII. On the Remission and Removal of Original Sin" \\
    --rename "1:396=Disputation X. On the Sin Against the Holy Spirit" \\
    --rename "2:50=Disputation II. On the Universal Will and Love of God" --rename "2:100=Disputation III. On the Universal Merit of Christ, and the Calling of Men to Salvation" \\
    --rename "2:256=Disputation VI. On the Immutability of Predestination, and the Use of the Whole Article" --rename "2:382=Disputation IX. On the Fall of the Elect and the Casting Off of the Holy Spirit" \\
    --rename "3:327=Disputation VI. On the Photinian Arguments against the Merit and Satisfaction of Christ" \\
    --rename "2:304=Disputation VII. On the Universal Election Devised by Huber" --rename "2:340=Disputation VIII. On the Number and Certainty of the Elect" \\
    --rename "2:413=Disputation X. On the Reprobation of Unbelievers" \\
    --rename "3:18=Disputation I. On the Nature of Free Will and Its Powers in Civil Actions" \\
    --rename "3:162=Disputation III. On the Papist Arguments for Free Will" \\
    --rename "3:214=Disputation IV. On the Terms of the Article of Justification, and Its Efficient, Impelling and Meritorious Causes" \\
    --rename "3:425=Disputation VII. On the Formal Cause of Our Justification, against the Papists" \\
    --rename "3:487=Disputation VIII. On the Papist Arguments against Justification by Faith Alone" \\
    --rename "3:548=Disputation IX. On the Certainty of Justification, or of the Remission of Sins" \\
    --rename "3:607=Disputation X. On Bellarmine's Arguments against the Certainty of Grace"

  python3 tools/tfr-dogmatics-to-md.py "resources/dogmatics/Meisner Christologia Sacra.md" balthasar-meisner-christologia-sacra \\
    --title "Christologia Sacra" --open-titles --drop-running-heads --end 9999 \\
    --section-match '(?!x)x' \\
    --book "307=Thirty-sixth Disputation, On the PASSION OF OUR REDEEMER JESUS CHRIST" \\
    --rename "81=Tenth Disputation, On the Communication of the Hypostasis" \\
    --rename "435=Fiftieth and Last Disputation. A Synopsis of the Whole Article on the Person, Life and Office of Christ" \\
    --rename "353=Forty-first Disputation. On the Glorious Resurrection of Christ"

  python3 tools/tfr-dogmatics-to-md.py "resources/dogmatics/Musaeus Introductio in Theologiam.md" johannes-musaeus-de-theologia-revelata \\
    --title "Introductio in Theologiam" --any-depth --open-titles --drop-running-heads \\
    --book-match '(?!x)x' --section-match '(?!x)x' \\
    --book "23=INTRODUCTION TO THEOLOGY CHAPTER I. ON THE NAME AND DISTINCTIONS OF THEOLOGY" --rename "23=On the Name and Distinctions of Theology" \\
    --book "45=CHAPTER II. ON NATURAL THEOLOGY." --rename "45=On Natural Theology" \\
    --book "127=CHAPTER III. CONCERNING REVEALED THEOLOGY." --rename "127=On Revealed Theology" \\
    --book "243=THE SECOND PART OF THE INTRODUCTION TO THEOLOGY" --rename "243=Part II: On Holy Scripture, the First Principle of Revealed Theology" \\
    --book "264=CHAPTER II. On the Nature and Quiddity of Holy Scripture." --rename "264=On the Nature and Quiddity of Holy Scripture" \\
    --book "304=CHAPTER III. Concerning the Authority of Holy Scripture." --rename "304=On the Authority of Holy Scripture" \\
    --book "318=CHAPTER IV. Concerning the authority of Holy Scripture, viewed in order to the causing of the assent of faith" --rename "318=On the Authority of Holy Scripture in Causing the Assent of Faith" \\
    --book "325=CHAPTER V. Whence the knowledge of human and opinion-based faith becomes known to us" --rename "325=On the Signs and Motives of Credibility: Internal" \\
    --book "399=CHAPTER V. SECOND SECTION Concerning the external signs and motives of credibility." --rename "399=On the Signs and Motives of Credibility: External" \\
    --book "480=CHAPTER VI. Which still concerns the Authority of Holy Scripture" --rename "480=On the Authority of Holy Scripture in Causing Divine Faith" \\
    --book "559=CHAPTER VII. Concerning the Authority of Holy Scripture in order to norm the doctrine of faith" --rename "559=On the Authority of Holy Scripture as the Norm of Doctrine" \\
    --book "580=CHAP. VIII. Concerning the Efficacy of Holy Scripture." --rename "580=On the Efficacy of Holy Scripture"
"""
import argparse
import difflib
import importlib.util
import json
import re
from pathlib import Path

spec = importlib.util.spec_from_file_location("tb", Path(__file__).parent / "tfr-books-to-md.py")
tb = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tb)

ORDINAL_WORDS = (r"primus|secundus|tertius|quartus|quintus|sextus|septimus|unicum|first|second|third|fourth|fifth|sixth"
                 r"|seventh|eighth|ninth|tenth|eleventh|twelfth|single|last|final")
INVOCATION = re.compile(r"^\W*I\.\s*N\.\s*I\.\s*")  # "In Nomine Iesu", heading a tome or a locus
ORDINAL_FIRST = re.compile(r"^\W*(?:" + ORDINAL_WORDS + r")\s+(?:article|articulus|chapter|caput)\b[.,:]?\s*", re.I)
LEAD = re.compile(
    r"^\W*(?:sect(?:ion)?\.?\s*\d+\.\s*)?(?:locus|loci|loc\.|article|articulus|art\.|place|caput|chapter|chap\.|cap\.)\s*"
    r"(?:[IVXLC]+\b|\d+\b|" + ORDINAL_WORDS + r")[.,:]?\s*(?:(?:which|that)\s+is,?\s*)?",
    re.I)
SMALL = {"a", "an", "and", "as", "at", "by", "for", "from", "in", "into", "of", "on", "or", "the", "to", "with",
         "concerning", "against", "its", "his", "their"}


def words(s):
    return re.findall(r"[a-z]+", s.lower())


def similarity(title, head):
    a, b = words(title), words(head)
    if not a or not b:
        return 0.0
    return difflib.SequenceMatcher(None, a, b[: len(a) + 4], autojunk=False).ratio()


def tidy(title, keep_number=False):
    """A title as the reader shows it: no "ARTICLE XIX. which is", no shouting, no full stop, and
    only the English of a contents entry that gives both ("On Baptism. — DE BAPTISMO.")."""
    t = " ".join(title.split()).split(" — ")[0]
    t = INVOCATION.sub("", t)
    if not keep_number:
        stripped = ORDINAL_FIRST.sub("", LEAD.sub("", t))
        stripped = re.sub(r"^\W*and\s+(?:the\s+)?(?:last|final)\b[.,]?\s*", "", stripped, flags=re.I)
        if len(words(stripped)) >= 1:
            t = stripped
    letters = [c for c in t if c.isalpha()]
    if letters and sum(c.isupper() for c in letters) / len(letters) > 0.5 or re.search(r"\b[A-Z]{4,}\b", t):
        out = []
        for i, w in enumerate(t.split()):
            if re.fullmatch(r"[IVXLC]+[.,:]?", w):
                out.append(w)  # a Roman numeral
            elif w.isupper() or w[:1].isupper() and w[1:].isupper():
                low = w.lower()
                out.append(low if i and low.strip(".,:;") in SMALL else low[:1].upper() + low[1:])
            else:
                out.append(w)
        t = " ".join(out)
    t = t.strip(" .,;:")
    if len(t) > 140:
        t = t[:140].rsplit(" ", 1)[0].rstrip(",;:") + "…"
    return t[:1].upper() + t[1:]


def drop_running_heads(flat):
    """Leave out running heads set as paragraphs ("PART I. CHAP. VII.", "DE PRINCIPIO THEOLOGIAE."):
    short paragraphs in capitals that recur on three or more pages."""
    def key(t):
        letters = [c for c in t if c.isalpha()]
        if not t or len(t) > 90 or not letters or sum(c.isupper() for c in letters) < 0.8 * len(letters):
            return None
        return re.sub(r"[^A-Z]", "", t.upper())
    pages = {}
    for b in flat:
        for t in (b[2], b[3]):
            k = key(t)
            if k:
                pages.setdefault(k, set()).add(b[0])
    common = {k for k, ps in pages.items() if len(ps) >= 3}
    return [b for b in flat if b[1] == "head" or not all(key(t) in common for t in (b[2], b[3]) if t)]


def blocks_of(slug):
    meta = json.loads(tb.get(slug, "meta.json"))
    en, la = tb.pages(slug, "en", meta["tei_v"]), tb.pages(slug, "la", meta["tei_v"])
    assert len(en) == len(la), (slug, len(en), len(la))
    flat = []  # (page, kind, en, la, part): part "F" or "M" goes on from the page before
    for n, (pe, pl) in enumerate(zip(en, la)):
        flat += [(n, b[0], b[1], b[2], b[3]) for b in tb.pair(pe, pl)]
    return meta, flat


def trim_page(flat, page, en_from, la_from):
    """The page's English before en_from and Latin before la_from left out (blocks left empty go)."""
    out, seen = [], {2: False, 3: False}
    for b in flat:
        b = list(b)
        if b[0] == page:
            for lang, mark in ((2, en_from), (3, la_from)):
                if not seen[lang]:
                    at = b[lang].find(mark)
                    if at < 0:
                        b[lang] = ""
                    else:
                        b[lang], seen[lang] = b[lang][at:], True
            if not b[2] and not b[3]:
                continue
        out.append(tuple(b))
    return out


def locate(flat, entries):
    """The block each contents entry starts at, in order: the best-matching heading on its page or
    a page either side (a heading and the one after it may together make the title), else the top
    of its page."""
    at, floor = [], 0
    by_page = {}
    for i, b in enumerate(flat):
        by_page.setdefault(b[0], []).append(i)
    for e in entries:
        best, score = None, 0.0
        for p in (e["page"], e["page"] + 1, e["page"] - 1):
            for i in by_page.get(p, []):
                if i < floor or flat[i][1] != "head" and not e.get("added"):
                    continue  # a locus given by --book may open at a paragraph
                s = similarity(e["title"], flat[i][2])
                if i + 1 < len(flat) and flat[i + 1][1] == "head":
                    s = max(s, similarity(e["title"], flat[i][2] + " " + flat[i + 1][2]))
                s -= 0.05 * abs(p - e["page"])
                if s > score:
                    best, score = i, s
        if best is None or score < 0.45:
            top = [i for i in by_page.get(e["page"], []) if i >= floor]
            best = top[0] if top else floor
        at.append(best)
        floor = best
    return at


def paragraphs(blocks, lang):
    """One language's paragraphs, a paragraph broken by a page joined up again."""
    out = []
    for b in blocks:
        t = b[lang]
        if not t:
            continue
        if out and b[4] in ("F", "M"):
            out[-1] = out[-1][:-1] + t if re.search(r"\w-$", out[-1]) else out[-1] + " " + t
        else:
            out.append(t)
    return out


def section_text(blocks):
    en = paragraphs(blocks, 2)
    # The Latin keeps the printer's line-end hyphens ("reli- qua"): close them up.
    la = [re.sub(r"(\w)- (\w)", r"\1\2", p) for p in paragraphs(blocks, 3)]
    text = "\n\n".join(en)
    if la:
        text += "\n\nLatin:\n\n" + "\n\n".join(la)
    return text.strip()


LONG = 20000  # characters of English and Latin together, about three pages


def opening(blocks):
    """A part's first words, as far as the end of a clause, to title it by."""
    text = next((b[2] for b in blocks if b[2] and b[1] == "p"), "")
    text = re.sub(r"^[\W\d]+", "", text)
    cut = re.match(r"(.{20,80}?)[.;:?!](?:\s|$)", text)
    t = cut.group(1) if cut else text[:80].rsplit(" ", 1)[0]
    return t + ("" if cut else "…")


def split_long(title, prefix, body, open_titles=False):
    """A section too long to read as one (the contents skip the headings below a chapter), cut at
    its own headings into parts of a few pages, each titled by the prefix and its first heading."""
    size = lambda bs: sum(len(b[2]) + len(b[3]) for b in bs)
    if size(body) <= LONG:
        return name_bare([(title, body)], prefix, open_titles)
    parts = [[title, []]]
    for b in body:
        if b[1] == "head" and size(parts[-1][1]) >= LONG / 4 and len(words(b[2])) >= 1:
            parts.append([None, []])
        if parts[-1][0] is None and b[1] == "head":
            parts[-1][0] = f"{prefix}: {tidy(b[2], keep_number=True)}"
        elif parts[-1][0] is not None and parts[-1][0].endswith(":") is False and b[1] == "head" \
                and parts[-1][1] and all(x[1] == "head" for x in parts[-1][1]):
            parts[-1][0] += f" {tidy(b[2], keep_number=True)}"  # "PROPOSITION I." then its words
        parts[-1][1].append(b)
    # A stretch with no headings at all is cut between paragraphs.
    out = []
    for t, bs in parts:
        t = t or title
        while size(bs) > 2 * LONG:
            n, run = 0, 0
            while n < len(bs) and run < LONG:
                run += len(bs[n][2]) + len(bs[n][3])
                n += 1
            out.append((t, bs[:n]))
            bs = bs[n:]
            if open_titles:
                t = f"{prefix}: {opening(bs)}"  # a part with no heading, named by its opening
            else:
                t = t if t.endswith("(continued)") else f"{t} (continued)"
        out.append((t, bs))
    return name_bare(out, prefix, open_titles)


BARE = re.compile(r"(?:(?:chap(?:ter)?|caput|cap|member|membrum|section|sectio)\.?\s+)?(?:[IVXLC]+|\d+)\.?"
                  r"(?:\s+(?:[IVXLC]+|\d+)\.?)*", re.I)


def name_bare(parts, prefix, open_titles):
    """With --open-titles, a part titled only by a number ("XII.", "Chapter II") is named by its
    opening words as well."""
    if not open_titles:
        return parts
    out = []
    for t, bs in parts:
        head, _, own = t.rpartition(": ")
        if BARE.fullmatch(own.strip()):
            named = f"{own.strip().rstrip('.')}. {opening(bs)}"
            t = f"{head}: {named}" if head and head.strip(" .") != own.strip(" .") else named
        out.append((t, bs))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("out")
    ap.add_argument("slugs", nargs="+")
    ap.add_argument("--title")
    ap.add_argument("--one-work", action="store_true")
    ap.add_argument("--end", action="append", default=[])
    ap.add_argument("--open-titles", action="store_true")
    ap.add_argument("--drop-running-heads", action="store_true")
    ap.add_argument("--dump-json")
    ap.add_argument("--book-depth", type=int, default=2)
    ap.add_argument("--book-match")
    ap.add_argument("--any-depth", action="store_true")
    ap.add_argument("--book-fallback")
    ap.add_argument("--start-match")
    ap.add_argument("--dedupe", action="store_true")
    ap.add_argument("--skip-match", default=r"\bindex\b|^\W*indices\b")
    ap.add_argument("--section-match")
    ap.add_argument("--chapter-match")
    ap.add_argument("--book", action="append", default=[])
    ap.add_argument("--skip", action="append", default=[])
    ap.add_argument("--trim", action="append", default=[])
    ap.add_argument("--not-book", action="append", default=[])
    ap.add_argument("--rename", action="append", default=[])
    args = ap.parse_args()

    def scoped(spec_):
        """("VOLUME:PAGE" or "PAGE", TITLE) -> (volume or None, page, title)."""
        where, _, title = spec_.partition("=")
        vol, _, page = where.rpartition(":")
        return (int(vol) if vol else None), int(page), title

    adds = [scoped(x) for x in args.book]
    skips = [scoped(x) for x in args.skip]
    trims = [scoped(x) for x in args.trim]
    ends = [scoped(x + "=") for x in args.end]
    renames = [scoped(x) for x in args.rename]
    not_books = [scoped(x + "=")[:2] for x in args.not_book]
    depth = args.book_depth
    book_rx = re.compile(args.book_match, re.I) if args.book_match else None
    skip_rx = re.compile(args.skip_match, re.I)
    section_rx = re.compile(args.section_match, re.I) if args.section_match else None
    chapter_rx = re.compile(args.chapter_match, re.I) if args.chapter_match else None

    out, n_books, n_sections = [], 0, 0
    dump = []  # with --dump-json: each locus's title and its paired blocks, for merging editions
    for k, slug in enumerate(args.slugs):
        meta, flat = blocks_of(slug)
        for vol, page, words_ in trims:
            if vol in (None, k + 1):
                flat = trim_page(flat, page, *words_.split("|"))
        if args.drop_running_heads:
            flat = drop_running_heads(flat)
        if k == 0 or not args.one_work:
            out.append(f"# {args.title or meta.get('title') or slug}\n")
            n_books = 0
        index_pages = [int(x["page"]) for x in meta.get("index_pages") or [] if str(x["page"]).isdigit()]
        end = next((page for vol, page, _ in ends if vol in (None, k + 1)), None) or (
            min(index_pages) if index_pages and not book_rx else flat[-1][0] + 1)
        structure = meta["structure"]
        if args.start_match:
            # A tome's synopsis of its own contents comes before its body; the body opens with
            # this heading, its locus title at most a page before it.
            first = next((e["page"] for e in structure if re.search(args.start_match, e["title"])), None)
            if first is not None:
                structure = [e for e in structure if e["page"] >= first - 1]
        tome_book_rx = book_rx
        if args.book_fallback and not any(book_rx.search(e["title"]) for e in structure):
            tome_book_rx = re.compile(args.book_fallback, re.I)  # a tome with no loci of that kind
        entries = []
        for e in structure:
            if e["page"] >= end or not args.any_depth and e["depth"] < depth:
                continue
            e = dict(e)
            if args.any_depth:
                # Wording, not depth: the contents nest chapters differently from tome to tome.
                if skip_rx.search(e["title"]):
                    e["kind"] = "skip"
                elif tome_book_rx.search(e["title"]):
                    e["kind"] = "book"
                elif section_rx and not section_rx.search(e["title"]):
                    continue
                else:
                    e["kind"] = "section"
                    e["chapter"] = bool(chapter_rx and chapter_rx.search(e["title"]))
            elif e["depth"] == depth:
                if skip_rx.search(e["title"]):
                    e["kind"] = "skip"
                elif any(page == e["page"] and vol in (None, k + 1) for vol, page in not_books) or book_rx and not book_rx.search(e["title"]):
                    continue  # a part's title page and the like: not a boundary
                else:
                    e["kind"] = "book"
            elif section_rx and not section_rx.search(e["title"]):
                continue  # runs on in the section before
            else:
                e["kind"] = "section"
                e["chapter"] = bool(chapter_rx.search(e["title"])) if chapter_rx else e["depth"] == depth + 1
            entries.append(e)
        for vol, page, title in adds:
            if vol in (None, k + 1):
                entries.append({"title": title, "depth": depth, "page": page, "kind": "book", "added": True})
        for vol, page, title in skips:
            if vol in (None, k + 1):
                entries.append({"title": title, "depth": depth, "page": page, "kind": "skip", "added": True})
        entries.sort(key=lambda e: (e["page"], 0 if e.get("added") else 1))
        # A locus entry that only names the locus the next one titles ("Place XXXII." then "On the
        # Civil Magistracy." on the same page) folds into it.
        merged = []
        for e in entries:
            if (merged and merged[-1]["kind"] == "book" and e["kind"] == "book" and merged[-1]["page"] == e["page"]
                    and not words(LEAD.sub("", merged[-1]["title"]))):
                merged[-1] = dict(e, title=merged[-1]["title"] + " " + e["title"])
                continue
            merged.append(e)
        # The same heading listed twice (once misplaced under the locus before, or with --dedupe
        # anywhere in the volume, as in a synopsis ahead of the text): keep the later. Short titles
        # ("Section I. Didactic") recur rightly.
        entries = [e for i, e in enumerate(merged)
                   if not (i + 1 < len(merged) and e["kind"] == "section" and merged[i + 1]["page"] - e["page"] <= 5
                           and similarity(e["title"], merged[i + 1]["title"]) > 0.9)
                   and not (i + 1 < len(merged) and e["kind"] == merged[i + 1]["kind"] == "book"
                            and merged[i + 1]["page"] == e["page"]
                            and similarity(tidy(e["title"]), tidy(merged[i + 1]["title"])) > 0.8)
                   and not (args.dedupe and e["kind"] in ("book", "section") and len(words(tidy(e["title"]))) >= 4
                            and any(x["kind"] == e["kind"] and similarity(tidy(e["title"]), tidy(x["title"])) > 0.95
                                    for x in merged[i + 1:i + 400]))]
        at = locate(flat, entries)
        stop = next((i for i, b in enumerate(flat) if b[0] >= end), len(flat))
        chapter, skipping = None, True  # before a volume's first locus: front matter
        for j, e in enumerate(entries):
            start = at[j]
            finish = at[j + 1] if j + 1 < len(entries) else stop
            if e["kind"] == "skip":
                skipping = True
                continue
            if start >= finish and e["kind"] == "section":
                continue  # an entry found at the same heading as the next
            body = flat[start:finish]
            if body and body[0][1] == "head":
                body = body[1:]  # the heading itself is the title
            if args.dump_json and (e["kind"] == "book" or e["kind"] == "section" and not skipping):
                if e["kind"] == "book":
                    dump.append({"title": None, "blocks": []})
                if dump:
                    dump[-1]["blocks"] += [{"page": b[0], "kind": b[1], "en": b[2], "la": b[3], "part": b[4]}
                                           for b in flat[start:finish]]
            if e["kind"] == "book":
                skipping = False
                n_books += 1
                chapter = None
                title = next((t for vol, page, t in renames if page == e["page"] and vol in (None, k + 1)),
                             None) or tidy(e["title"])
                if dump:
                    dump[-1]["title"] = title
                out.append(f"\n## {n_books} {title}\n")
                # A long opening, too, is cut: its first part is the locus's introduction.
                for k_, (sub, part) in enumerate(split_long(title, title, body, args.open_titles)):
                    if k_:
                        if args.open_titles and sub.startswith(f"{title}: "):
                            sub = sub[len(title) + 2:]  # the locus is shown already; its parts by their own words
                        out.append(f"\n### {sub}\n")
                        n_sections += 1
                    text = section_text(part)
                    if text:
                        out.append(text + "\n")
                continue
            if skipping:
                continue
            own = tidy(e["title"], keep_number=True)
            if e["chapter"]:
                # Its title as a prefix, to the end of its first clause.
                chapter = re.split(r"[:;]\s|,\s(?=and in particular|that is|or\b)", own)[0]
                if len(chapter) > 80:
                    chapter = chapter[:80].rsplit(" ", 1)[0].rstrip(",") + "…"
                title = own
            else:
                title = f"{chapter}: {own}" if chapter else own
            for title, part in split_long(title, chapter or own, body, args.open_titles):
                if len(title) > 220:
                    title = title[:220].rsplit(" ", 1)[0] + "…"
                if re.match(r"\d", title):
                    title = "No. " + title  # not a section number of the edition's
                out.append(f"\n### {title}\n")
                text = section_text(part)
                if text:
                    out.append(text + "\n")
                n_sections += 1
    Path(args.out).write_text("\n".join(out).lstrip() + "\n")
    if args.dump_json:
        Path(args.dump_json).write_text(json.dumps(dump, ensure_ascii=False))
    print(f"{args.out}: {n_books} loci, {n_sections} sections")


if __name__ == "__main__":
    main()
