import type { ProjectItem } from '@shared/ipc'

export interface FrontMatter {
  title?: string
  type?: string
  tags: string[]
  /** Only meaningful when type === 'project' — the note's added sources. */
  items: ProjectItem[]
  /** Other frontmatter lines preserved verbatim. */
  rest: string[]
}

function parseTagList(s: string): string[] {
  const t = s.trim()
  if (!t) return []
  if (t.startsWith('[')) {
    return t
      .replace(/^\[|\]$/g, '')
      .split(',')
      .map((x) => x.trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean)
  }
  return t
    .split(/[\s,]+/)
    .map((x) => x.replace(/^#/, ''))
    .filter(Boolean)
}

function isProjectItem(x: unknown): x is ProjectItem {
  if (!x || typeof x !== 'object') return false
  const o = x as Record<string, unknown>
  if (o.kind === 'book') return typeof o.id === 'string'
  if (o.kind === 'note') return typeof o.path === 'string'
  if (o.kind === 'scripture') return typeof o.book === 'string' && typeof o.chapter === 'number'
  return false
}

/** items: is stored as a JSON array on one line — simplest way to hold nested objects
 *  (book ids, note paths with slashes/commas, scripture refs) in a single-line frontmatter
 *  field without inventing a quoting scheme. */
function parseItemList(s: string): ProjectItem[] {
  const t = s.trim()
  if (!t) return []
  try {
    const arr: unknown = JSON.parse(t)
    return Array.isArray(arr) ? arr.filter(isProjectItem) : []
  } catch {
    return []
  }
}

export function parseNote(raw: string): { fm: FrontMatter; body: string } {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
  if (!m) return { fm: { tags: [], items: [], rest: [] }, body: raw }
  const fm: FrontMatter = { tags: [], items: [], rest: [] }
  for (const line of m[1].split(/\r?\n/)) {
    const title = line.match(/^title:\s*(.*)$/)
    if (title) {
      fm.title = title[1].trim()
      continue
    }
    const type = line.match(/^type:\s*(.*)$/)
    if (type) {
      fm.type = type[1].trim()
      continue
    }
    const tags = line.match(/^tags:\s*(.*)$/)
    if (tags) {
      fm.tags = parseTagList(tags[1])
      continue
    }
    const items = line.match(/^items:\s*(.*)$/)
    if (items) {
      fm.items = parseItemList(items[1])
      continue
    }
    if (line.trim()) fm.rest.push(line)
  }
  return { fm, body: raw.slice(m[0].length).replace(/^\s+/, '') }
}

export function serializeFrontMatter(fm: FrontMatter): string {
  const lines = ['---']
  if (fm.title != null) lines.push(`title: ${fm.title}`)
  if (fm.type != null) lines.push(`type: ${fm.type}`)
  lines.push(`tags: [${fm.tags.join(', ')}]`)
  if (fm.type === 'project' || fm.items.length) lines.push(`items: ${JSON.stringify(fm.items)}`)
  lines.push(...fm.rest)
  lines.push('---')
  return lines.join('\n')
}
