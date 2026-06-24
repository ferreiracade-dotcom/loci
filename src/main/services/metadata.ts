import { writeFileSync } from 'fs'

export interface FetchedMeta {
  title?: string
  author?: string
  year?: number
  publisher?: string
  genre?: string
  coverUrl?: string
}

interface GoogleVolume {
  volumeInfo?: {
    title?: string
    authors?: string[]
    publishedDate?: string
    publisher?: string
    categories?: string[]
    imageLinks?: { thumbnail?: string; smallThumbnail?: string }
  }
}

/** Best-effort metadata lookup via the free Google Books API (no key required). */
export async function fetchBookMeta(title: string): Promise<FetchedMeta | null> {
  try {
    const q = encodeURIComponent(`intitle:${title}`)
    const res = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${q}&maxResults=1`)
    if (!res.ok) return null
    const data = (await res.json()) as { items?: GoogleVolume[] }
    const v = data.items?.[0]?.volumeInfo
    if (!v) return null
    const yearMatch = typeof v.publishedDate === 'string' ? v.publishedDate.match(/\d{4}/) : null
    return {
      title: v.title,
      author: Array.isArray(v.authors) ? v.authors.join(', ') : undefined,
      year: yearMatch ? Number(yearMatch[0]) : undefined,
      publisher: v.publisher,
      genre: Array.isArray(v.categories) ? v.categories[0] : undefined,
      coverUrl: v.imageLinks?.thumbnail ?? v.imageLinks?.smallThumbnail
    }
  } catch {
    return null
  }
}

export async function downloadCover(coverUrl: string, destPath: string): Promise<boolean> {
  try {
    const res = await fetch(coverUrl.replace(/^http:/, 'https:'))
    if (!res.ok) return false
    writeFileSync(destPath, Buffer.from(await res.arrayBuffer()))
    return true
  } catch {
    return false
  }
}
