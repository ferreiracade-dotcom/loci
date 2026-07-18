import { randomUUID } from 'crypto'
import { getDb } from '../db/connection'
import type { BocSource, BocSectionRow, BocCommentaryMatch } from '../../shared/ipc'

interface NewSource { displayName: string; author: string | null; mdRelativePath: string; sortOrder?: number }
interface SectionInput { documentCode: string; ordinal: number; number: string | null; label: string; part: string | null; text: string }
interface ExcerptInput { documentCode: string; sectionStart: number; sectionEnd: number; text: string; headerRaw: string }

function insertSource(table: 'boc_sources' | 'boc_commentary_sources', input: NewSource): BocSource {
  const id = randomUUID()
  getDb().prepare(`INSERT INTO ${table} (id, display_name, author, md_relative_path, sort_order) VALUES (?,?,?,?,?)`)
    .run(id, input.displayName, input.author, input.mdRelativePath, input.sortOrder ?? 0)
  return { id, displayName: input.displayName, author: input.author, mdRelativePath: input.mdRelativePath, sortOrder: input.sortOrder ?? 0, status: 'unindexed' }
}
export function createSource(i: NewSource): BocSource { return insertSource('boc_sources', i) }
export function createCommentarySource(i: NewSource): BocSource { return insertSource('boc_commentary_sources', i) }

export function replaceSections(sourceId: string, sections: SectionInput[]): void {
  const db = getDb()
  db.transaction(() => {
    db.prepare('DELETE FROM boc_texts WHERE source_id = ?').run(sourceId)
    const ins = db.prepare(`INSERT INTO boc_texts
      (id, source_id, document_code, section_ordinal, section_number, section_label, section_part, text)
      VALUES (?,?,?,?,?,?,?,?)`)
    for (const s of sections)
      ins.run(randomUUID(), sourceId, s.documentCode, s.ordinal, s.number, s.label, s.part, s.text)
  })()
}

export function replaceCommentaryExcerpts(sourceId: string, excerpts: ExcerptInput[]): void {
  const db = getDb()
  db.transaction(() => {
    db.prepare('DELETE FROM boc_commentary_excerpts WHERE source_id = ?').run(sourceId)
    const ins = db.prepare(`INSERT INTO boc_commentary_excerpts
      (id, source_id, document_code, section_start, section_end, text, header_raw) VALUES (?,?,?,?,?,?,?)`)
    for (const e of excerpts)
      ins.run(randomUUID(), sourceId, e.documentCode, e.sectionStart, e.sectionEnd, e.text, e.headerRaw)
  })()
}

function rowToSection(r: any): BocSectionRow {
  return { ordinal: r.section_ordinal, number: r.section_number, label: r.section_label, part: r.section_part, text: r.text }
}

export function getSection(documentCode: string, ordinal: number, sourceId: string): BocSectionRow | null {
  const r = getDb().prepare(
    `SELECT section_ordinal, section_number, section_label, section_part, text
     FROM boc_texts WHERE document_code = ? AND section_ordinal = ? AND source_id = ?`
  ).get(documentCode, ordinal, sourceId)
  return r ? rowToSection(r) : null
}

export function listSections(documentCode: string, sourceId: string): BocSectionRow[] {
  return (getDb().prepare(
    `SELECT section_ordinal, section_number, section_label, section_part, text
     FROM boc_texts WHERE document_code = ? AND source_id = ? ORDER BY section_ordinal`
  ).all(documentCode, sourceId) as any[]).map(rowToSection)
}

function listFrom(table: 'boc_sources' | 'boc_commentary_sources'): BocSource[] {
  return (getDb().prepare(
    `SELECT id, display_name, author, md_relative_path, sort_order, status FROM ${table} ORDER BY sort_order, display_name`
  ).all() as any[]).map((r) => ({
    id: r.id, displayName: r.display_name, author: r.author, mdRelativePath: r.md_relative_path, sortOrder: r.sort_order, status: r.status
  }))
}
export function listSources(): BocSource[] { return listFrom('boc_sources') }
export function listCommentarySources(): BocSource[] { return listFrom('boc_commentary_sources') }

export function lookupBocSection(documentCode: string, ordinal: number): BocCommentaryMatch[] {
  return (getDb().prepare(
    `SELECT e.id, e.source_id, s.display_name, s.author, s.sort_order, e.text, e.section_start, e.section_end
     FROM boc_commentary_excerpts e JOIN boc_commentary_sources s ON s.id = e.source_id
     WHERE e.document_code = ? AND e.section_start <= ? AND e.section_end >= ?
     ORDER BY s.sort_order, e.section_start`
  ).all(documentCode, ordinal, ordinal) as any[]).map((r) => ({
    excerptId: r.id, sourceId: r.source_id, sourceDisplayName: r.display_name, sourceAuthor: r.author,
    sortOrder: r.sort_order, text: r.text, sectionStart: r.section_start, sectionEnd: r.section_end
  }))
}
