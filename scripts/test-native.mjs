// better-sqlite3 is a native addon: its compiled .node binary only works with the exact Node
// ABI it was built against. This repo's binary is normally built for ELECTRON's bundled Node
// (ABI 130, currently Electron 33 / Node 20.18) — that's what the real app needs to run. But
// `npx vitest` executes under whatever plain `node` is on PATH (ABI 137 as of Node 24), so any
// test that opens a real Database() crashes immediately with an ABI mismatch — before the
// test's own logic ever runs (see src/main/services/commentary.test.ts).
//
// Rebuilding the binary for plain Node makes the tests pass but breaks the app on next launch,
// and vice versa — you can't have one binary serve both ABIs at once, and this repo's Electron
// version (33, Node 20) doesn't support requiring vitest's own ESM-only dependency chain, so
// running vitest itself through Electron's Node isn't an option either.
//
// This script keeps ONE cached copy of each ABI variant on disk (built once, reused after) and
// swaps the active binary before/after the real test run — restoring the Electron variant in a
// `finally` so the app is never left broken, even if a test fails or this script itself errors.
//
// Usage: node scripts/test-native.mjs [...vitest args]  (npm run test:native forwards args)

import { existsSync, copyFileSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const releaseDir = join(repoRoot, 'node_modules', 'better-sqlite3', 'build', 'Release')
const active = join(releaseDir, 'better_sqlite3.node')
const electronVariant = join(releaseDir, 'better_sqlite3.electron-abi130.node')
const plainNodeVariant = join(releaseDir, 'better_sqlite3.plainnode-abi137.node')

function log(msg) {
  console.error(`[test-native] ${msg}`)
}

function npmBin(name) {
  return join(repoRoot, 'node_modules', '.bin', process.platform === 'win32' ? `${name}.cmd` : name)
}

/** Read the Electron version this repo targets, so the cached Electron variant always matches
 *  whatever's actually installed rather than a value baked into this script. */
function electronVersion() {
  const pkg = JSON.parse(readFileSync(join(repoRoot, 'node_modules', 'electron', 'package.json'), 'utf8'))
  return pkg.version
}

if (!existsSync(electronVariant)) {
  log('no cached Electron-ABI binary yet — building one via @electron/rebuild (first run only)...')
  const ver = electronVersion()
  const res = spawnSync(npmBin('electron-rebuild'), ['--force', '--version', ver, '--only', 'better-sqlite3'], {
    cwd: repoRoot,
    stdio: 'inherit',
    shell: true
  })
  if (res.status !== 0) throw new Error('electron-rebuild failed — see output above')
  copyFileSync(active, electronVariant)
}

if (!existsSync(plainNodeVariant)) {
  log('no cached plain-Node-ABI binary yet — building one via npm rebuild (first run only)...')
  const res = spawnSync('npm', ['rebuild', 'better-sqlite3'], { cwd: repoRoot, stdio: 'inherit', shell: true })
  if (res.status !== 0) throw new Error('npm rebuild failed — see output above')
  copyFileSync(active, plainNodeVariant)
  // Immediately restore the Electron variant as the active file — the block below will swap it
  // to plain-Node deliberately, but nothing else should ever observe the plain-Node one active.
  copyFileSync(electronVariant, active)
}

let exitCode = 1
try {
  log('swapping in the plain-Node ABI binary for the test run...')
  copyFileSync(plainNodeVariant, active)

  const res = spawnSync(npmBin('vitest'), ['run', ...process.argv.slice(2)], {
    cwd: repoRoot,
    stdio: 'inherit',
    shell: true
  })
  exitCode = res.status ?? 1
} finally {
  log('restoring the Electron ABI binary...')
  copyFileSync(electronVariant, active)
}

process.exit(exitCode)
