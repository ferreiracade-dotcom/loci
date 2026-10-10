import { app } from 'electron'
import { createHash } from 'crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { commentaryVaultDir, readConfig, writeConfig } from './config'

// Commentaries Loci ships itself: books converted for Loci that no site publishes in a usable
// form (Philippi on Romans, re-OCR'd from the 1878 scans; the Lutheran Commentary on the New
// Testament, converted from the 1895-98 scans with its verse headings checked against the KJV/RV;
// Leupold on Genesis, from CCEL's public-domain edition; Bengel's Gnomon, from SermonIndex's module
// with the spaces its Greek had lost restored; Hengstenberg, from SermonIndex's module with its
// Greek and Hebrew repaired by tools/mybible-to-md.py; Luther's prefaces, Church Postil sermons and
// commentaries on Genesis 4-9, Psalm 82, the Sermon on the Mount and Galatians, from SermonIndex's
// module with each entry put back at its passage by tools/luther-sermonindex-to-md.py; Gerhard on 1 and 2 Peter and on Matthew, and
// Calov's Biblia Illustrata on both Testaments, Heshusius on 1 Corinthians, and Melanchthon's
// commentaries, from The Faith Received's Latin and its machine translation, by tools/tfr-to-md.py,
// tools/tfr-books-to-md.py and tools/tfr-quotes-to-md.py). They live in resources/commentaries
// in the repository and in the installer's resources; on first launch each is copied into the
// vault's commentaries folder, where the folder sync indexes it and vault sync carries it to
// every device, like any other commentary file.

/** Title and author for each shipped file (a Markdown file carries only its name). */
export const BUNDLED_COMMENTARIES: Record<string, { title: string; author: string }> = {
  'Philippi Romans.md': { title: "Philippi's Commentary on Romans", author: 'F. A. Philippi' },
  'Lutheran Commentary.md': { title: 'The Lutheran Commentary', author: 'ed. Henry Eyster Jacobs' },
  'Leupold Genesis.md': { title: 'Exposition of Genesis', author: 'H. C. Leupold' },
  'Bengel Gnomon.md': { title: "Bengel's Gnomon of the New Testament", author: 'J. A. Bengel' },
  'Gerhard 1 Peter.md': { title: 'Commentary on the First Epistle of Peter', author: 'Johann Gerhard' },
  'Gerhard 2 Peter.md': { title: 'Commentary on the Second Epistle of Peter', author: 'Johann Gerhard' },
  'Gerhard Matthew.md': { title: 'Posthumous Annotations on the Gospel of Matthew', author: 'Johann Gerhard' },
  'Calov Gospels and Acts.md': { title: 'Biblia Illustrata: Gospels and Acts', author: 'Abraham Calov' },
  'Calov Romans to 2 Thessalonians.md': { title: 'Biblia Illustrata: Romans to 2 Thessalonians', author: 'Abraham Calov' },
  'Calov 1 Timothy to Revelation.md': { title: 'Biblia Illustrata: 1 Timothy to Revelation', author: 'Abraham Calov' },
  'Calov Genesis to Song of Songs.md': {
    title: 'Biblia Illustrata: Genesis to Song of Songs, with Lamentations',
    author: 'Abraham Calov'
  },
  'Calov Isaiah to Malachi.md': { title: 'Biblia Illustrata: Isaiah to Malachi', author: 'Abraham Calov' },
  'Heshusius 1 Corinthians.md': {
    title: 'Explanation of the First Epistle to the Corinthians',
    author: 'Tilemann Heshusius'
  },
  'Melanchthon John.md': { title: 'Annotations on the Gospel of John (1523)', author: 'Philip Melanchthon' },
  'Melanchthon Romans.md': { title: 'Commentaries on the Epistle to the Romans (1540)', author: 'Philip Melanchthon' },
  'Melanchthon Daniel.md': { title: 'Commentary on the Prophet Daniel', author: 'Philip Melanchthon' },
  'Melanchthon Proverbs.md': { title: 'Explanation of the Proverbs of Solomon (1552)', author: 'Philip Melanchthon' },
  'Melanchthon Colossians.md': { title: 'Scholia on the Epistle to the Colossians', author: 'Philip Melanchthon' },
  'Melanchthon Opera 14.md': {
    title: 'Opera, vol. 14: Proverbs (1555), Ecclesiastes, the Sunday Gospels, Matthew',
    author: 'Philip Melanchthon'
  },
  'Melanchthon Opera 15.md': {
    title: 'Opera, vol. 15: John, Romans, Corinthians, Colossians, Philippians, Timothy',
    author: 'Philip Melanchthon'
  },
  'Luther Selected Passages.md': { title: "Luther's Commentary on Selected Bible Passages", author: 'Martin Luther' },
  'Hengstenberg.md': {
    title: "Hengstenberg's Commentaries on Psalms, Ecclesiastes, Ezekiel, John and Revelation",
    author: 'E. W. Hengstenberg'
  }
}

/** Where the shipped commentary files are: the installer's resources, or the repository. */
export function bundledCommentaryDir(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'commentaries')
    : join(app.getAppPath(), 'resources', 'commentaries')
}

const sha256 = (path: string): string => createHash('sha256').update(readFileSync(path)).digest('hex')

/** Copy each shipped commentary into the vault once, unless the vault already has a file of
 *  that name (synced from another device). Each is recorded once present, so removing one
 *  afterwards does not bring it back. A newer shipped version (a better conversion) replaces the
 *  vault copy while that copy is still the one Loci put there, never one the user has changed.
 *  Returns the file names copied or updated. */
export function installBundledCommentaries(sourceDir: string = bundledCommentaryDir()): string[] {
  return installBundled(sourceDir, commentaryVaultDir(), 'bundledCommentaries', 'bundledCommentaryHashes')
}

/** The same once-only, update-while-untouched install, for any shipped folder (the dogmatics
 *  use it too), recording what it did under the given config keys. */
export function installBundled(
  sourceDir: string,
  folder: string,
  recordKey: 'bundledCommentaries' | 'bundledDogmatics' | 'bundledFathers',
  hashKey: 'bundledCommentaryHashes' | 'bundledDogmaticsHashes' | 'bundledFathersHashes'
): string[] {
  if (!existsSync(sourceDir)) return []
  const config = readConfig()
  const recorded = config[recordKey] ?? []
  const done = new Set(recorded)
  const hashes = { ...(config[hashKey] ?? {}) }
  const before = JSON.stringify(hashes)
  const copied: string[] = []
  for (const fileName of readdirSync(sourceDir).filter((f) => /\.(md|sqlite3|xml)$/i.test(f))) {
    const source = join(sourceDir, fileName)
    const dest = join(folder, fileName)
    const shipped = sha256(source)
    if (!done.has(fileName)) {
      if (!existsSync(dest)) {
        mkdirSync(folder, { recursive: true })
        copyFileSync(source, dest)
        copied.push(fileName)
      }
      done.add(fileName)
      // A different copy already in the vault (synced from another device, which keeps it up to
      // date itself, or the user's own file of that name) is left alone, now and later.
      const found = sha256(dest)
      hashes[fileName] = found === shipped ? shipped : `kept:${found}`
    }
    if (!existsSync(dest)) continue // removed by the user: stays removed
    const current = sha256(dest)
    // Installed by a Loci from before versions were recorded: that copy is Loci's.
    const installed = hashes[fileName] ?? current
    if (shipped !== installed && current === installed) {
      copyFileSync(source, dest)
      if (!copied.includes(fileName)) copied.push(fileName)
      hashes[fileName] = shipped
    } else {
      // Already the shipped version (another device updated it and sync brought it): Loci's.
      hashes[fileName] = current === shipped ? shipped : installed
    }
  }
  const patch: Partial<typeof config> = {}
  if (done.size !== recorded.length) patch[recordKey] = [...done]
  if (JSON.stringify(hashes) !== before) patch[hashKey] = hashes
  if (Object.keys(patch).length) writeConfig(patch)
  return copied
}
