import { app } from 'electron'
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'fs'
import { join } from 'path'
import { commentaryVaultDir, readConfig, writeConfig } from './config'

// Commentaries Loci ships itself: books converted for Loci that no site publishes in a usable
// form (Philippi on Romans, re-OCR'd from the 1878 scans; the Lutheran Commentary on the New
// Testament, converted from the 1895-98 scans with its verse headings checked against the KJV/RV). They live in resources/commentaries
// in the repository and in the installer's resources; on first launch each is copied into the
// vault's commentaries folder, where the folder sync indexes it and vault sync carries it to
// every device, like any other commentary file.

/** Title and author for each shipped file (a Markdown file carries only its name). */
export const BUNDLED_COMMENTARIES: Record<string, { title: string; author: string }> = {
  'Philippi Romans.md': { title: "Philippi's Commentary on Romans", author: 'F. A. Philippi' },
  'Lutheran Commentary.md': { title: 'The Lutheran Commentary', author: 'ed. Henry Eyster Jacobs' }
}

/** Where the shipped commentary files are: the installer's resources, or the repository. */
export function bundledCommentaryDir(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'commentaries')
    : join(app.getAppPath(), 'resources', 'commentaries')
}

/** Copy each shipped commentary into the vault once, unless the vault already has a file of
 *  that name (synced from another device). Each is recorded once present, so removing one
 *  afterwards does not bring it back. Returns the file names copied. */
export function installBundledCommentaries(sourceDir: string = bundledCommentaryDir()): string[] {
  if (!existsSync(sourceDir)) return []
  const recorded = readConfig().bundledCommentaries ?? []
  const done = new Set(recorded)
  const folder = commentaryVaultDir()
  const copied: string[] = []
  for (const fileName of readdirSync(sourceDir).filter((f) => /\.(md|sqlite3)$/i.test(f))) {
    if (done.has(fileName)) continue
    const dest = join(folder, fileName)
    if (!existsSync(dest)) {
      mkdirSync(folder, { recursive: true })
      copyFileSync(join(sourceDir, fileName), dest)
      copied.push(fileName)
    }
    done.add(fileName)
  }
  if (done.size !== recorded.length) writeConfig({ bundledCommentaries: [...done] })
  return copied
}
