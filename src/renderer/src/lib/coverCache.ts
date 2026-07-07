// Module-level (app-lifetime) cache of book cover data URLs, shared by every component that
// shows a cover (Library grid/list, search-result thumbnails). Without this, navigating back to
// a view remounts every cover component, each re-invoking the getCover IPC call from scratch —
// even though the underlying image never changed. `undefined` = never fetched; `null` = fetched,
// no cover.
const cache = new Map<string, string | null>()

export function getCachedCover(id: string): string | null | undefined {
  return cache.get(id)
}

export function setCachedCover(id: string, url: string | null): void {
  cache.set(id, url)
}
