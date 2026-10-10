// Curated Church Fathers author table. CCEL's ThML files carry NO author dates, so the Authors
// view and the catena's date ordering come from here, keyed by CCEL's `authorID` (the value in a
// contained work's <ThML.head><electronicEdInfo><authorID>).
//
// Reseeded into the fathers_authors table on every sync (seedFathersAuthors), so editing this
// file needs no migration. An author the files mention but this table lacks is still shown —
// undated and sorted last — and tools/validate-thml.mjs lists them so the table can be completed.
import type Database from 'better-sqlite3'

export interface FatherAuthor {
  /** CCEL authorID, e.g. 'irenaeus'. */
  id: string
  name: string
  /** Approximate year used only for ordering (death year, or floruit for the obscure). */
  sortYear: number
  /** Human date label shown beside the name, e.g. 'c. 130–c. 202'. */
  datesLabel: string
  /** One or two plain sentences for the author page. */
  bio: string
}

/** Ascending by sortYear (then name). A unit test enforces this. */
export const FATHERS_AUTHORS: FatherAuthor[] = [
  {
    id: 'clement_rome',
    name: 'Clement of Rome',
    sortYear: 99,
    datesLabel: 'fl. c. 96',
    bio: 'Bishop of Rome at the end of the first century, traditionally the author of the First Epistle to the Corinthians.'
  },
  {
    id: 'ignatius',
    name: 'Ignatius of Antioch',
    sortYear: 108,
    datesLabel: 'c. 35–c. 108',
    bio: 'Bishop of Antioch who was taken to Rome for martyrdom and wrote seven letters to churches on the way.'
  },
  {
    id: 'barnabas',
    name: 'Barnabas (Epistle of)',
    sortYear: 130,
    datesLabel: 'c. 70–135',
    bio: 'Name attached to an early Christian letter that reads the Old Testament as pointing to Christ; its real author is unknown.'
  },
  {
    id: 'papias',
    name: 'Papias of Hierapolis',
    sortYear: 130,
    datesLabel: 'c. 60–c. 130',
    bio: 'Bishop of Hierapolis who collected the sayings of the apostles; his work survives only in quotations by later writers.'
  },
  {
    id: 'aristides',
    name: 'Aristides of Athens',
    sortYear: 135,
    datesLabel: 'fl. c. 125–140',
    bio: 'Athenian philosopher who addressed an Apology for the Christian faith to the emperor, one of the earliest such defences.'
  },
  {
    id: 'hermas',
    name: 'Hermas',
    sortYear: 150,
    datesLabel: 'fl. 2nd century',
    bio: 'Roman Christian, author of The Shepherd, a visionary work on repentance that was widely read in the early church.'
  },
  {
    id: 'mathetes',
    name: 'Mathetes',
    sortYear: 150,
    datesLabel: 'fl. 2nd century',
    bio: 'Unknown author, calling himself a "disciple" (mathetes), of the Epistle to Diognetus, an early defence of Christian life and belief addressed to a pagan inquirer.'
  },
  {
    id: 'polycarp',
    name: 'Polycarp of Smyrna',
    sortYear: 155,
    datesLabel: 'c. 69–c. 155',
    bio: 'Bishop of Smyrna who knew the apostle John according to Irenaeus; martyred in old age.'
  },
  {
    id: 'justin_martyr',
    name: 'Justin Martyr',
    sortYear: 165,
    datesLabel: 'c. 100–c. 165',
    bio: 'Philosopher turned Christian apologist in Rome who defended the faith to the emperor and was martyred there.'
  },
  {
    id: 'athenagoras',
    name: 'Athenagoras of Athens',
    sortYear: 177,
    datesLabel: 'fl. c. 177',
    bio: 'Athenian Christian philosopher who wrote a Plea for the Christians to Marcus Aurelius and a treatise on the resurrection of the dead.'
  },
  {
    id: 'tatian',
    name: 'Tatian',
    sortYear: 180,
    datesLabel: 'c. 120–c. 180',
    bio: 'Syrian pupil of Justin Martyr, author of an Address to the Greeks and the Diatessaron gospel harmony.'
  },
  {
    id: 'theophilus',
    name: 'Theophilus of Antioch',
    sortYear: 185,
    datesLabel: 'd. c. 185',
    bio: 'Bishop of Antioch who defended the faith in three books To Autolycus and was among the first to use the word "Trinity".'
  },
  {
    id: 'caius',
    name: 'Caius (Gaius) of Rome',
    sortYear: 200,
    datesLabel: 'fl. c. 200',
    bio: 'Roman churchman who debated the Montanist Proclus; little of his writing survives beyond fragments.'
  },
  {
    id: 'irenaeus',
    name: 'Irenaeus',
    sortYear: 202,
    datesLabel: 'c. 130–c. 202',
    bio: 'Bishop of Lyons who wrote Against Heresies, the main answer to Gnosticism and a key witness to the apostolic tradition.'
  },
  {
    id: 'clement_alex',
    name: 'Clement of Alexandria',
    sortYear: 215,
    datesLabel: 'c. 150–c. 215',
    bio: 'Head of the catechetical school in Alexandria who sought to show Christianity as the true philosophy.'
  },
  {
    id: 'tertullian',
    name: 'Tertullian',
    sortYear: 220,
    datesLabel: 'c. 155–c. 220',
    bio: 'Carthaginian lawyer turned theologian, the first major Christian writer in Latin.'
  },
  {
    id: 'felix',
    name: 'Minucius Felix',
    sortYear: 225,
    datesLabel: 'fl. c. 200–250',
    bio: 'Roman lawyer whose dialogue Octavius is one of the earliest Latin defences of Christianity; his exact date is disputed.'
  },
  {
    id: 'asterius_urbanus',
    name: 'Asterius Urbanus',
    sortYear: 232,
    datesLabel: 'fl. c. 232',
    bio: 'Author of an early work against the Montanists, preserved in extracts quoted by Eusebius.'
  },
  {
    id: 'hippolytus',
    name: 'Hippolytus',
    sortYear: 236,
    datesLabel: 'c. 170–c. 236',
    bio: 'Roman presbyter and teacher, author of the Refutation of All Heresies and biblical commentaries; died in exile.'
  },
  {
    id: 'juliusafricanus',
    name: 'Julius Africanus',
    sortYear: 240,
    datesLabel: 'c. 160–c. 240',
    bio: 'Christian chronographer from Palestine who wrote a world history and letters on the Gospel genealogies and the story of Susanna.'
  },
  {
    id: 'commodianus',
    name: 'Commodianus',
    sortYear: 250,
    datesLabel: 'fl. 3rd century',
    bio: 'Latin Christian poet whose Instructions and Carmen apologeticum survive; his date and place are uncertain.'
  },
  {
    id: 'novatian',
    name: 'Novatian',
    sortYear: 250,
    datesLabel: 'fl. c. 250',
    bio: 'Roman presbyter whose treatise On the Trinity is an important early Latin work; he led a rigorist schism against Pope Cornelius.'
  },
  {
    id: 'alexander_capp',
    name: 'Alexander of Cappadocia',
    sortYear: 251,
    datesLabel: 'd. c. 251',
    bio: 'Bishop of Jerusalem who founded a theological library there and was a friend of Origen; died in prison under Decius.'
  },
  {
    id: 'origen',
    name: 'Origen',
    sortYear: 254,
    datesLabel: 'c. 185–c. 254',
    bio: 'Alexandrian scholar and teacher, the most prolific early biblical commentator and a pioneer of systematic theology.'
  },
  {
    id: 'cyprian',
    name: 'Cyprian',
    sortYear: 258,
    datesLabel: 'c. 200–258',
    bio: 'Bishop of Carthage who wrote on the unity of the church and was martyred under Valerian.'
  },
  {
    id: 'dionysius_gr',
    name: 'Dionysius of Alexandria',
    sortYear: 265,
    datesLabel: 'd. c. 265',
    bio: 'Pupil of Origen and bishop of Alexandria who led the church through persecution and wrote letters on the Sabellian controversy.'
  },
  {
    id: 'theognostus',
    name: 'Theognostus of Alexandria',
    sortYear: 265,
    datesLabel: 'fl. c. 260–280',
    bio: 'Head of the catechetical school at Alexandria; his Hypotyposes survives only in fragments.'
  },
  {
    id: 'dionysius_rome',
    name: 'Dionysius of Rome',
    sortYear: 268,
    datesLabel: 'd. 268',
    bio: 'Bishop of Rome 259–268 who rebuked Dionysius of Alexandria for speaking of the Son in ways that seemed to divide the Godhead.'
  },
  {
    id: 'gregory_thau',
    name: 'Gregory Thaumaturgus',
    sortYear: 270,
    datesLabel: 'c. 213–c. 270',
    bio: 'Pupil of Origen and bishop of Neocaesarea in Pontus, remembered as the "wonder-worker".'
  },
  {
    id: 'malchion',
    name: 'Malchion',
    sortYear: 270,
    datesLabel: 'fl. c. 270',
    bio: 'Presbyter and head of a school of rhetoric at Antioch who confuted Paul of Samosata at the synod of 268.'
  },
  {
    id: 'archelaus',
    name: 'Archelaus of Carchar',
    sortYear: 278,
    datesLabel: 'fl. c. 278',
    bio: 'Bishop credited with a record of his disputation with the Persian heresiarch Mani (the Acts of Archelaus).'
  },
  {
    id: 'anatolius',
    name: 'Anatolius of Laodicea',
    sortYear: 282,
    datesLabel: 'd. c. 282',
    bio: 'Alexandrian scholar and bishop of Laodicea in Syria, known for work on the dating of Easter and on mathematics.'
  },
  {
    id: 'alexander_lyc',
    name: 'Alexander of Lycopolis',
    sortYear: 300,
    datesLabel: 'fl. c. 300',
    bio: 'Egyptian pagan philosopher who wrote a treatise against the Manichaeans.'
  },
  {
    id: 'arnobius',
    name: 'Arnobius of Sicca',
    sortYear: 300,
    datesLabel: 'fl. c. 300',
    bio: 'North African teacher of rhetoric who wrote Against the Nations, a Latin defence of Christianity against pagan charges.'
  },
  {
    id: 'theonas',
    name: 'Theonas of Alexandria',
    sortYear: 300,
    datesLabel: 'd. c. 300',
    bio: 'Bishop of Alexandria 282–300; a letter on the duties of a Christian in the emperor\'s household is attributed to him.'
  },
  {
    id: 'victorinus',
    name: 'Victorinus of Pettau',
    sortYear: 304,
    datesLabel: 'd. c. 304',
    bio: 'Bishop of Pettau (Poetovio) in Pannonia, the earliest Latin biblical commentator; martyred under Diocletian.'
  },
  {
    id: 'phileas',
    name: 'Phileas of Thmuis',
    sortYear: 307,
    datesLabel: 'd. c. 307',
    bio: 'Bishop of Thmuis in Egypt whose letter to his flock describes the martyrdoms he witnessed; martyred under Diocletian.'
  },
  {
    id: 'pierus',
    name: 'Pierus of Alexandria',
    sortYear: 309,
    datesLabel: 'd. c. 309',
    bio: 'Presbyter of Alexandria, called "the younger Origen" for his learning and eloquence.'
  },
  {
    id: 'pamphilus',
    name: 'Pamphilus of Caesarea',
    sortYear: 310,
    datesLabel: 'd. 310',
    bio: 'Presbyter and scholar of Caesarea, teacher of Eusebius, who wrote an Apology for Origen with Eusebius; martyred under Maximin.'
  },
  {
    id: 'methodius',
    name: 'Methodius of Olympus',
    sortYear: 311,
    datesLabel: 'd. c. 311',
    bio: 'Bishop and writer who opposed Origen\'s views on the resurrection; author of the Banquet of the Ten Virgins.'
  },
  {
    id: 'peter_alexandria',
    name: 'Peter of Alexandria',
    sortYear: 311,
    datesLabel: 'd. 311',
    bio: 'Bishop of Alexandria whose canonical epistle set penitential rules for those who lapsed under Diocletian; martyred in 311.'
  },
  {
    id: 'lactantius',
    name: 'Lactantius',
    sortYear: 325,
    datesLabel: 'c. 250–c. 325',
    bio: 'North African rhetorician and Christian apologist, called the "Christian Cicero", author of the Divine Institutes.'
  },
  {
    id: 'alexander_alexandria',
    name: 'Alexander of Alexandria',
    sortYear: 326,
    datesLabel: 'd. c. 326',
    bio: 'Bishop of Alexandria who first opposed Arius and was the predecessor of Athanasius.'
  },
  {
    id: 'eusebius',
    name: 'Eusebius of Caesarea',
    sortYear: 339,
    datesLabel: 'c. 260–c. 339',
    bio: 'Bishop of Caesarea in Palestine and author of the Church History, the chief source for the first three centuries.'
  },
  {
    id: 'athanasius',
    name: 'Athanasius',
    sortYear: 373,
    datesLabel: 'c. 296–373',
    bio: 'Bishop of Alexandria and chief defender of the full deity of Christ at and after the Council of Nicaea.'
  },
  {
    id: 'basil',
    name: 'Basil of Caesarea',
    sortYear: 379,
    datesLabel: 'c. 330–379',
    bio: 'Bishop of Caesarea in Cappadocia, a leading defender of Nicene doctrine and author of On the Holy Spirit.'
  },
  {
    id: 'cyril_jerusalem',
    name: 'Cyril of Jerusalem',
    sortYear: 386,
    datesLabel: 'c. 313–386',
    bio: 'Bishop of Jerusalem whose Catechetical Lectures explain the creed and sacraments to candidates for baptism.'
  },
  {
    id: 'gregory_nazianzen',
    name: 'Gregory of Nazianzus',
    sortYear: 390,
    datesLabel: '329–390',
    bio: 'Cappadocian bishop, orator and poet, known as "the Theologian" for his Five Theological Orations on the Trinity.'
  },
  {
    id: 'gregorynyssa',
    name: 'Gregory of Nyssa',
    sortYear: 395,
    datesLabel: 'c. 335–c. 395',
    bio: 'Younger brother of Basil and bishop of Nyssa, a speculative theologian and mystical writer among the Cappadocian Fathers.'
  },
  {
    id: 'ambrose',
    name: 'Ambrose of Milan',
    sortYear: 397,
    datesLabel: 'c. 339–397',
    bio: 'Roman governor turned bishop of Milan, a preacher and teacher who guided Augustine to the faith.'
  },
  {
    id: 'chrysostom',
    name: 'John Chrysostom',
    sortYear: 407,
    datesLabel: 'c. 347–407',
    bio: 'Archbishop of Constantinople renowned for his expository preaching, from which he took the name "golden mouth".'
  },
  {
    id: 'rufinus',
    name: 'Rufinus of Aquileia',
    sortYear: 411,
    datesLabel: 'c. 345–411',
    bio: 'Monk and translator who rendered Origen, Eusebius and others from Greek into Latin; lifelong friend and later opponent of Jerome.'
  },
  {
    id: 'jerome',
    name: 'Jerome',
    sortYear: 420,
    datesLabel: 'c. 347–420',
    bio: 'Scholar who translated the Bible into Latin (the Vulgate) and wrote extensive commentaries and letters.'
  },
  {
    id: 'sulpitius_severus',
    name: 'Sulpitius Severus',
    sortYear: 425,
    datesLabel: 'c. 363–c. 425',
    bio: 'Gallic Christian writer, biographer of Martin of Tours and author of a Sacred History from creation to his own day.'
  },
  {
    id: 'augustine',
    name: 'Augustine',
    sortYear: 430,
    datesLabel: '354–430',
    bio: 'Bishop of Hippo whose Confessions, City of God and anti-Pelagian writings shaped Western theology.'
  },
  {
    id: 'cassian',
    name: 'John Cassian',
    sortYear: 435,
    datesLabel: 'c. 360–c. 435',
    bio: 'Monk who brought the teaching of the Egyptian desert fathers to the West in his Institutes and Conferences.'
  },
  {
    id: 'socrates',
    name: 'Socrates Scholasticus',
    sortYear: 439,
    datesLabel: 'c. 380–after 439',
    bio: 'Constantinopolitan lawyer who continued Eusebius with a Church History covering the years 305–439.'
  },
  {
    id: 'vincent_lerins',
    name: 'Vincent of Lérins',
    sortYear: 445,
    datesLabel: 'd. c. 445',
    bio: 'Monk of the island of Lérins whose Commonitory states the test of catholic faith: what has been believed everywhere, always and by all.'
  },
  {
    id: 'sozomen',
    name: 'Sozomen',
    sortYear: 450,
    datesLabel: 'c. 400–c. 450',
    bio: 'Lawyer in Constantinople who wrote a Church History covering the years 324–425.'
  },
  {
    id: 'theodoret',
    name: 'Theodoret of Cyrus',
    sortYear: 458,
    datesLabel: 'c. 393–c. 458',
    bio: 'Bishop of Cyrrhus in Syria, an exegete and theologian of the Antiochene school who also wrote a Church History.'
  },
  {
    id: 'leo_great',
    name: 'Leo the Great',
    sortYear: 461,
    datesLabel: 'c. 400–461',
    bio: 'Bishop of Rome 440–461 whose Tome shaped the Christology of the Council of Chalcedon.'
  },
  {
    id: 'venantius',
    name: 'Venantius Fortunatus',
    sortYear: 600,
    datesLabel: 'c. 540–c. 600',
    bio: 'Italian poet and later bishop of Poitiers, to whom the Latin Easter poem in this collection is ascribed.'
  },
  {
    id: 'gregory_great',
    name: 'Gregory the Great',
    sortYear: 604,
    datesLabel: 'c. 540–604',
    bio: 'Bishop of Rome 590–604, author of the Pastoral Rule and Moral Reflections on Job, and a founder of medieval Christian culture.'
  },
  {
    id: 'john_damascus',
    name: 'John of Damascus',
    sortYear: 749,
    datesLabel: 'c. 675–c. 749',
    bio: 'Syrian monk and theologian whose Exposition of the Orthodox Faith summarises the teaching of the Greek Fathers.'
  }
]

/**
 * CCEL's contained-work head sometimes names the wrong author (anf01's Epistle of Barnabas and
 * Fragments of Papias both say "ignatius"), and multi-author NPNF volumes carry no head at all.
 * Key: `${volumeCode}:${div1 id}`; value: the authorID for every section under that div1, or
 * `null` when the div1 has no single author. tools/validate-thml.mjs lists the candidates.
 */
export const FATHERS_AUTHOR_OVERRIDES: Record<string, string | null> = {
  'anf01:vi': 'barnabas',
  'anf01:vii': 'papias',
  'anf03:iv': 'tertullian', // div1 "Apologetic." — heads there say "apologetic"
  // Two different Dionysii share CCEL's id 'dionysius'.
  'anf06:iv': 'dionysius_gr', // Dionysius of Alexandria
  'anf07:vii': 'dionysius_rome', // Dionysius of Rome, Against the Sabellians
  'anf07:v': 'asterius_urbanus', // heads use both 'asterius' and 'asterius_urbanus'
  // Collections, apocrypha, documents and councils: no single author.
  'anf05:vii': null, // Appendix
  'anf07:viii': null, // Teaching of the Twelve Apostles
  'anf07:ix': null, // Constitutions of the Holy Apostles
  'anf07:xi': null, // Nicene Creed
  'anf07:xii': null, // Early Liturgies
  'anf08:iii': null, // Testaments of the Twelve Patriarchs
  'anf08:iv': null, // Excerpts of Theodotus
  'anf08:vii': null, // Apocrypha of the New Testament
  'anf08:viii': null, // The Decretals
  'anf08:ix': null, // Memoirs of Edessa and other Syriac documents
  'anf08:x': null, // Remains of the Second and Third Centuries
  'anf09:iii': null, // Gospel of Peter
  'anf09:v': null, // Apocalypse of Peter
  'anf09:vi': null, // Vision of Paul
  'anf09:vii': null, // Apocalypse of the Virgin
  'anf09:viii': null, // Apocalypse of Sedrach
  'anf09:ix': null, // Testament of Abraham
  'anf09:x': null, // Acts of Xanthippe and Polyxena
  'anf09:xi': null, // Narrative of Zosimus
  'anf09:xiv': null, // Passion of the Scillitan Martyrs
  // Multi-author NPNF volumes carry no heads: attribute each div1 by its title.
  'npnf202:ii': 'socrates',
  'npnf202:iii': 'sozomen',
  'npnf203:iv': 'theodoret',
  'npnf203:v': null, // Jerome and Gennadius, Lives of Illustrious Men
  'npnf203:vi': 'rufinus', // Life and works of Rufinus (with Jerome's Apology against Rufinus)
  'npnf207:ii': 'cyril_jerusalem',
  'npnf207:iii': 'gregory_nazianzen',
  'npnf207:iv': 'gregory_nazianzen',
  'npnf209:iii': 'john_damascus',
  'npnf211:ii': 'sulpitius_severus',
  'npnf211:iii': 'vincent_lerins',
  'npnf211:iv': 'cassian',
  'npnf212:ii': 'leo_great',
  'npnf212:iii': 'gregory_great',
  'npnf213:ii': 'gregory_great',
  'npnf213:iii': null, // Ephraim the Syrian and Aphrahat in one div1
  // The Seven Ecumenical Councils and the canons.
  'npnf214:vii': null,
  'npnf214:viii': null,
  'npnf214:ix': null,
  'npnf214:x': null,
  'npnf214:xi': null,
  'npnf214:xii': null,
  'npnf214:xiii': null,
  'npnf214:xiv': null,
  'npnf214:xv': null,
  'npnf214:xvi': null,
  'npnf214:xvii': null
}

/**
 * authorIDs CCEL puts on heads that are not people: collections, front matter, appendices. A
 * section carrying one is stored with no author (it lists under "Unattributed" in the drawer
 * and never in the Authors view).
 */
export const FATHERS_NON_AUTHOR_IDS: ReadonlySet<string> = new Set([
  'anonymous',
  'early_liturgies',
  'appendix',
  'title_page',
  'title_pages',
  'second_title_page',
  'rutherford_an', // translator of The Passion of the Scillitan Martyrs
  'zosimus', // The Narrative of Zosimus and the Testament of Abraham are anonymous apocrypha
  'theodotus' // Excerpts of Theodotus: Clement's notes on a Valentinian Gnostic, not a Father's own work
])

/** The authorID a section is stored under: the per-div1 override if there is one, else what the
 *  parser read from the files, with CCEL's pseudo-authors turned into null. A `null` override is
 *  deliberate (a div1 with no single author). `sectionId` may carry the parser's '~2' suffix. */
export function correctedAuthor(volumeCode: string, sectionId: string, parsed: string | null): string | null {
  const key = `${volumeCode}:${sectionId.replace(/~\d+$/, '').split('.')[0]}`
  if (key in FATHERS_AUTHOR_OVERRIDES) return FATHERS_AUTHOR_OVERRIDES[key]
  return parsed && FATHERS_NON_AUTHOR_IDS.has(parsed) ? null : parsed
}

/** Upsert the curated table into fathers_authors. Idempotent; edits to the table propagate. */
export function seedFathersAuthors(db: Database.Database): void {
  const upsert = db.prepare(
    `INSERT INTO fathers_authors (id, name, sort_year, dates_label, bio) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name, sort_year = excluded.sort_year,
       dates_label = excluded.dates_label, bio = excluded.bio`
  )
  db.transaction(() => {
    for (const a of FATHERS_AUTHORS) upsert.run(a.id, a.name, a.sortYear, a.datesLabel, a.bio)
  })()
}
