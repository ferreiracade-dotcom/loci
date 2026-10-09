import { net } from 'electron'
import { existsSync, mkdirSync, renameSync, writeFileSync } from 'fs'
import { join } from 'path'
import { commentaryVaultDir, readConfig, writeConfig } from './config'
import { extractFromZip } from './mybible'
import type { SermonIndexModule } from '../../shared/ipc'

// SermonIndex publishes each of its commentaries as a MyBible module zip. Downloaded modules go
// into the vault's `commentaries/` folder beside the Markdown sources, so they reach every
// device the same way (vault sync) and the startup folder sync registers + indexes them there.

const BASE = 'https://www.sermonindex.net'

/** Commentaries offered for one-click install. A curated list, not the site's whole catalog —
 *  each entry's module file was checked against its SermonIndex page. */
export const SERMON_INDEX_CATALOG: SermonIndexModule[] = [
  { slug: 'lenski', moduleCode: 'SI-LENSKI', title: "Lenski's Commentary on the New Testament", author: 'R. C. H. Lenski', passageComments: true },
  { slug: 'popular', moduleCode: 'SI-POPULAR', title: 'The Popular Commentary of the Bible', author: 'Paul E. Kretzmann' },
  { slug: 'luthercmt', moduleCode: 'SI-LUTHERCMT', title: "Luther's Commentary on Selected Bible Passages", author: 'Martin Luther' },
  { slug: 'keildelitzsch', moduleCode: 'SI-KD', title: 'Keil and Delitzsch Commentary on the Old Testament', author: 'C. F. Keil & F. Delitzsch', passageComments: true },
  { slug: 'hengstenberg', moduleCode: 'SI-HENGSTENBERG', title: "Hengstenberg's Commentary on Selected Books", author: 'E. W. Hengstenberg' },
  { slug: 'gnomon', moduleCode: 'SI-GNOMON', title: "Bengel's Gnomon of the New Testament", author: 'J. A. Bengel' },
  { slug: 'lange', moduleCode: 'SI-LANGE', title: "Lange's Commentary on the Holy Scriptures", author: 'J. P. Lange' },
  { slug: 'calcom', moduleCode: 'SI-CALCOM', title: "Calvin's Commentaries", author: 'John Calvin' }
]

/** The module's file name inside the vault's commentaries folder. Kept as the publisher's own
 *  name so a manually downloaded copy of the same module lands on the same source. */
export function moduleFileName(moduleCode: string): string {
  return `${moduleCode}.commentaries.SQLite3`
}

/** Catalog entry for a commentaries-folder file name, if it is a SermonIndex module. */
export function catalogEntryForFile(fileName: string): SermonIndexModule | undefined {
  return SERMON_INDEX_CATALOG.find((m) => moduleFileName(m.moduleCode).toLowerCase() === fileName.toLowerCase())
}

/** Download a catalog module into the vault's commentaries folder; returns its vault-relative
 *  path. Written via a temp file + rename, so an interrupted download never leaves a truncated
 *  module for the folder sync to choke on. */
export async function downloadModule(
  slug: string,
  onProgress?: (received: number, total: number) => void
): Promise<string> {
  const entry = SERMON_INDEX_CATALOG.find((m) => m.slug === slug)
  if (!entry) throw new Error(`Unknown SermonIndex commentary: ${slug}`)
  const res = await net.fetch(`${BASE}/modules/mybible/${entry.moduleCode}.commentaries.zip`)
  if (!res.ok || !res.body) throw new Error(`SermonIndex download failed (HTTP ${res.status})`)

  const total = Number(res.headers.get('content-length')) || 0
  const parts: Buffer[] = []
  let received = 0
  const reader = res.body.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    parts.push(Buffer.from(value))
    received += value.byteLength
    onProgress?.(received, total)
  }

  const { data } = extractFromZip(Buffer.concat(parts), (name) => /\.sqlite3$/i.test(name))
  const folder = commentaryVaultDir()
  mkdirSync(folder, { recursive: true })
  const fileName = moduleFileName(entry.moduleCode)
  const dest = join(folder, fileName)
  writeFileSync(`${dest}.part`, data)
  renameSync(`${dest}.part`, dest)
  return `commentaries/${fileName}`
}

/** Modules installed by default. Lenski replaces the PDF-converted copy; Keil & Delitzsch is
 *  the Old Testament counterpart. Adding a slug here installs it on the next launch. */
const DEFAULT_MODULES = ['lenski', 'keildelitzsch']

/** Install each default module once, unless the vault already has it (e.g. synced from another
 *  device). Each is recorded only once present, so an offline launch retries on the next one;
 *  removing a default afterwards does not bring it back. */
export async function installDefaultModules(): Promise<string[]> {
  const cfg = readConfig()
  // Builds before per-module tracking recorded a single flag, which then meant Lenski.
  const done = new Set(cfg.sermonIndexDefaults ?? (cfg.sermonIndexDefaultsInstalled ? ['lenski'] : []))
  const installed: string[] = []
  for (const slug of DEFAULT_MODULES) {
    if (done.has(slug)) continue
    const entry = SERMON_INDEX_CATALOG.find((m) => m.slug === slug)!
    if (!existsSync(join(commentaryVaultDir(), moduleFileName(entry.moduleCode)))) {
      try {
        installed.push(await downloadModule(slug))
      } catch {
        continue // offline or the site is down: try again next launch
      }
    }
    done.add(slug)
    writeConfig({ sermonIndexDefaults: [...done] })
  }
  return installed
}
