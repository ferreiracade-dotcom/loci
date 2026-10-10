import { api } from './api'
import type { TabContent } from '../store/workspace'

export interface CommentaryPlace {
  sourceId: string
  book: string
  chapter: number
  verse?: number
}

export interface DogmaticsPlace {
  sourceId: string
  work: number
  book: number
  section?: number
  topic?: string
}

/**
 * Where the Commentary reader opens without a target: where it was last read, else the first
 * source (in the user's order) that has anything indexed, else Matthew 1 with no source (the
 * reader then shows how to add a commentary).
 */
export async function commentaryStartContent(target?: CommentaryPlace): Promise<TabContent> {
  let dest = target
  if (!dest) {
    try {
      const last = await api.getSession('lastCommentary')
      const p = last ? (JSON.parse(last) as { sourceId?: string; book?: string; chapter?: number }) : null
      if (p?.sourceId && p.book && p.chapter) dest = { sourceId: p.sourceId, book: p.book, chapter: p.chapter }
    } catch {
      /* ignore malformed session value */
    }
  }
  if (!dest) {
    try {
      for (const source of await api.listCommentarySources()) {
        const first = (await api.listCommentaryCoverage(source.id))[0]
        if (first) {
          dest = { sourceId: source.id, book: first.book, chapter: first.chapters[0] }
          break
        }
      }
    } catch {
      /* nothing indexed: open the empty reader */
    }
  }
  return {
    kind: 'commentary',
    commentarySourceId: dest?.sourceId ?? '',
    book: dest?.book ?? 'MAT',
    chapter: dest?.chapter ?? 1,
    verse: dest?.verse
  }
}

/**
 * Where the Dogmatics reader opens without a target: where it was last read (book 0 is a
 * topic's overview), else the first indexed source's first book, else an empty reader.
 */
export async function dogmaticsStartContent(target?: DogmaticsPlace): Promise<TabContent> {
  let dest = target
  if (!dest) {
    try {
      const last = await api.getSession('lastDogmatics')
      const p = last ? (JSON.parse(last) as { sourceId?: string; work?: number; book?: number; topic?: string }) : null
      if (p?.sourceId && p.work && (p.book || p.topic))
        dest = { sourceId: p.sourceId, work: p.work, book: p.book ?? 0, topic: p.topic }
    } catch {
      /* ignore malformed session value */
    }
  }
  if (!dest) {
    try {
      for (const source of await api.listDogmaticsSources()) {
        const first = (await api.listDogmaticsOutline(source.id))[0]
        if (first?.books[0]) {
          dest = { sourceId: source.id, work: first.ordinal, book: first.books[0].ordinal }
          break
        }
      }
    } catch {
      /* nothing indexed: open the empty reader */
    }
  }
  return {
    kind: 'dogmatics',
    dogmaticsSourceId: dest?.sourceId ?? '',
    dogmaticsWork: dest?.work ?? 1,
    dogmaticsBook: dest?.book ?? 1,
    sectionOrdinal: dest?.section,
    dogmaticsTopic: dest?.topic
  }
}
