import type { ArticleFields, DoiLookupResult } from '../../shared/ipc'

// Crossref's public REST API needs no key. The global `fetch` is used the same way as in
// scripture.ts. A descriptive User-Agent is Crossref's request for polite clients.
const CROSSREF_WORKS = 'https://api.crossref.org/works/'
const USER_AGENT = 'Loci/1.0 (personal study app)'

/** Strip `https://doi.org/`, `dx.doi.org/`, `doi:` prefixes and whitespace; null if it is not a DOI. */
export function normalizeDoi(input: string): string | null {
  let s = input.trim().replace(/\s+/g, '')
  s = s.replace(/^doi:/i, '').replace(/^(?:https?:\/\/)?(?:dx\.)?doi\.org\//i, '')
  try {
    s = decodeURIComponent(s)
  } catch {
    /* keep it as typed */
  }
  return /^10\.\d{4,9}\/\S+$/.test(s) ? s : null
}

/** Crossref titles can carry JATS/HTML tags and entities. */
function plain(s: string): string {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)
const first = (v: unknown): string | null => (Array.isArray(v) ? str(v[0]) : str(v))

function yearOf(m: Record<string, unknown>): number | null {
  for (const key of ['issued', 'published-print', 'published-online']) {
    const parts = (m[key] as { 'date-parts'?: unknown[][] } | undefined)?.['date-parts']
    const y = parts?.[0]?.[0]
    if (typeof y === 'number' && Number.isFinite(y)) return y
  }
  return null
}

/** Map a Crossref `/works/<doi>` response body to article fields; null when it is not one. */
export function parseCrossref(body: unknown): ArticleFields | null {
  const m = (body as { message?: unknown } | null)?.message
  if (!m || typeof m !== 'object') return null
  const msg = m as Record<string, unknown>
  const doi = str(msg.DOI)
  if (!doi) return null

  const authors = (Array.isArray(msg.author) ? msg.author : [])
    .map((a: { given?: unknown; family?: unknown; name?: unknown }) =>
      str(a?.name) ?? [str(a?.given), str(a?.family)].filter(Boolean).join(' ')
    )
    .filter((n): n is string => !!n)

  const rawTitle = first(msg.title)
  const rawPages = str(msg.page)
  return {
    title: rawTitle ? plain(rawTitle) : null,
    authors,
    journal: first(msg['container-title']) ?? first(msg['short-container-title']),
    volume: str(msg.volume),
    issue: str(msg.issue),
    pages: rawPages ? rawPages.replace(/(\d)\s*[-–—]\s*(\d)/, '$1–$2') : null,
    year: yearOf(msg),
    doi
  }
}

/** Look a DOI up on Crossref. Never throws: every failure is returned as `{ ok: false, error }`. */
export async function lookupDoi(raw: string): Promise<DoiLookupResult> {
  const doi = normalizeDoi(raw)
  if (!doi) return { ok: false, error: 'That does not look like a DOI (it should start with 10.).' }
  const url = CROSSREF_WORKS + doi.split('/').map(encodeURIComponent).join('/')
  let res: Response
  try {
    res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } })
  } catch {
    return { ok: false, error: 'Could not reach Crossref — check your connection.' }
  }
  if (res.status === 404) return { ok: false, error: 'Crossref has no record of that DOI.' }
  if (!res.ok) return { ok: false, error: `Crossref lookup failed (${res.status}).` }
  let body: unknown
  try {
    body = await res.json()
  } catch {
    return { ok: false, error: 'Crossref returned an unexpected response.' }
  }
  const fields = parseCrossref(body)
  return fields ? { ok: true, fields } : { ok: false, error: 'Crossref returned an unexpected response.' }
}
