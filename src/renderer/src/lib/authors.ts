// Authors are stored in a single `author` field, joined with " & ". These helpers
// split that back into individual names (also tolerating ";" and " and " from
// imported metadata) and rejoin them canonically.

export function splitAuthors(s: string | null | undefined): string[] {
  if (!s) return []
  return s
    .split(/\s*[&;]\s*|\s+and\s+/i)
    .map((a) => a.trim())
    .filter(Boolean)
}

export function joinAuthors(authors: string[]): string {
  return authors
    .map((a) => a.trim())
    .filter(Boolean)
    .join(' & ')
}
