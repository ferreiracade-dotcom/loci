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
    id: 'hermas',
    name: 'Hermas',
    sortYear: 150,
    datesLabel: 'fl. 2nd century',
    bio: 'Roman Christian, author of The Shepherd, a visionary work on repentance that was widely read in the early church.'
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
    id: 'tatian',
    name: 'Tatian',
    sortYear: 180,
    datesLabel: 'c. 120–c. 180',
    bio: 'Syrian pupil of Justin Martyr, author of an Address to the Greeks and the Diatessaron gospel harmony.'
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
    id: 'athanasius',
    name: 'Athanasius',
    sortYear: 373,
    datesLabel: 'c. 296–373',
    bio: 'Bishop of Alexandria and chief defender of the full deity of Christ at and after the Council of Nicaea.'
  },
  {
    id: 'chrysostom',
    name: 'John Chrysostom',
    sortYear: 407,
    datesLabel: 'c. 347–407',
    bio: 'Archbishop of Constantinople renowned for his expository preaching, from which he took the name "golden mouth".'
  },
  {
    id: 'jerome',
    name: 'Jerome',
    sortYear: 420,
    datesLabel: 'c. 347–420',
    bio: 'Scholar who translated the Bible into Latin (the Vulgate) and wrote extensive commentaries and letters.'
  },
  {
    id: 'augustine',
    name: 'Augustine',
    sortYear: 430,
    datesLabel: '354–430',
    bio: 'Bishop of Hippo whose Confessions, City of God and anti-Pelagian writings shaped Western theology.'
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
  'anf03:iv': 'tertullian' // div1 "Apologetic." — heads there say "apologetic"
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
  'second_title_page'
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
