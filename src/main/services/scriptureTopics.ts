import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import type { ScriptureTopic, ScriptureTopicHit } from '../../shared/ipc'
import { bundledScriptureDir } from './scripture'

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200

let topics: Record<string, string[]> | null = null

/** Load the topical index once (lazily); empty if missing/unreadable. */
function loadTopics(): Record<string, string[]> {
  if (topics) return topics
  let data: Record<string, string[]> = {}
  try {
    const path = join(bundledScriptureDir(), 'topics.json')
    if (existsSync(path)) data = JSON.parse(readFileSync(path, 'utf8')) as Record<string, string[]>
  } catch {
    data = {}
  }
  topics = data
  return data
}

/** Case-insensitive name search: prefix matches first, then substring, each alphabetical. */
export function searchScriptureTopics(query: string, limit?: number): ScriptureTopicHit[] {
  const q = String(query ?? '').trim().toLowerCase()
  if (!q) return []
  const cap = Math.min(
    Math.max(1, Math.floor(Number.isFinite(limit) ? (limit as number) : DEFAULT_LIMIT)),
    MAX_LIMIT
  )
  const data = loadTopics()
  const prefix: string[] = []
  const inner: string[] = []
  for (const name of Object.keys(data)) {
    const i = name.toLowerCase().indexOf(q)
    if (i === 0) prefix.push(name)
    else if (i > 0) inner.push(name)
  }
  const cmp = (a: string, b: string): number =>
    a.toLowerCase().localeCompare(b.toLowerCase()) || a.localeCompare(b)
  return [...prefix.sort(cmp), ...inner.sort(cmp)]
    .slice(0, cap)
    .map((name) => ({ name, refCount: data[name].length }))
}

/** A topic's references, or null if the name is not in the index. */
export function getScriptureTopic(name: string): ScriptureTopic | null {
  const data = loadTopics()
  const key = String(name ?? '')
  if (!Object.prototype.hasOwnProperty.call(data, key)) return null
  return { name: key, refs: data[key] }
}
