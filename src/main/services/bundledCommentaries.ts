import { app } from 'electron'
import { createHash } from 'crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { commentaryVaultDir, readConfig, writeConfig } from './config'

// Commentaries Loci ships itself: books converted for Loci that no site publishes in a usable
// form (Philippi on Romans, re-OCR'd from the 1878 scans; the Lutheran Commentary on the New
// Testament, converted from the 1895-98 scans with its verse headings checked against the KJV/RV;
// Leupold on Genesis, from CCEL's public-domain edition; Bengel's Gnomon, from SermonIndex's module
// with the spaces its Greek had lost restored). They live in resources/commentaries
// in the repository and in the installer's resources; on first launch each is copied into the
// vault's commentaries folder, where the folder sync indexes it and vault sync carries it to
// every device, like any other commentary file.

/** Title and author for each shipped file (a Markdown file carries only its name). */
export const BUNDLED_COMMENTARIES: Record<string, { title: string; author: string }> = {
  'Philippi Romans.md': { title: "Philippi's Commentary on Romans", author: 'F. A. Philippi' },
  'Lutheran Commentary.md': { title: 'The Lutheran Commentary', author: 'ed. Henry Eyster Jacobs' },
  'Leupold Genesis.md': { title: 'Exposition of Genesis', author: 'H. C. Leupold' },
  'Bengel Gnomon.md': { title: "Bengel's Gnomon of the New Testament", author: 'J. A. Bengel' }
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
  if (!existsSync(sourceDir)) return []
  const config = readConfig()
  const recorded = config.bundledCommentaries ?? []
  const done = new Set(recorded)
  const hashes = { ...(config.bundledCommentaryHashes ?? {}) }
  const before = JSON.stringify(hashes)
  const folder = commentaryVaultDir()
  const copied: string[] = []
  for (const fileName of readdirSync(sourceDir).filter((f) => /\.(md|sqlite3)$/i.test(f))) {
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
  if (done.size !== recorded.length) patch.bundledCommentaries = [...done]
  if (JSON.stringify(hashes) !== before) patch.bundledCommentaryHashes = hashes
  if (Object.keys(patch).length) writeConfig(patch)
  return copied
}
