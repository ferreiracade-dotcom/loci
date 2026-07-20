import { useEffect, useState } from 'react'
import { useStore } from '../../store/useStore'
import { api } from '../../lib/api'
import { BOC_DOCUMENTS } from '@shared/bookOfConcord'
import type { BocSectionRow, BocSource } from '@shared/ipc'
import { bocSectionLabel } from '../../lib/bocGrouping'
import { BocReader } from './BocReader'
import { OpenInCenterButton } from './OpenInCenterButton'

/**
 * A live Book of Concord in the reference panel — independent of any center BoC pane, with its
 * own document/section location restored across restarts. The Confessions twin of
 * ReferenceBiblePanel; reuses BocReader, so quotes captured here take the same write path.
 */
export function ReferenceBocPanel() {
  const bocSectionClicked = useStore((s) => s.bocSectionClicked)
  const addBocQuote = useStore((s) => s.addBocQuote)

  const [sources, setSources] = useState<BocSource[]>([])
  const [documentCode, setDocumentCode] = useState('AC')
  const [sectionOrdinal, setSectionOrdinal] = useState(1)
  const [sections, setSections] = useState<BocSectionRow[]>([])

  const bocSourceId = sources[0]?.id ?? ''
  const currentSection = sections.find((r) => r.ordinal === sectionOrdinal) ?? null

  useEffect(() => {
    void api.listBocSources().then(setSources)
  }, [])

  useEffect(() => {
    void api.getSession('refBocLoc').then((v) => {
      if (!v) return
      try {
        const p = JSON.parse(v) as { documentCode?: string; ordinal?: number }
        if (p.documentCode && p.ordinal != null) {
          setDocumentCode(p.documentCode)
          setSectionOrdinal(p.ordinal)
        }
      } catch {
        /* ignore malformed session value */
      }
    })
  }, [])

  useEffect(() => {
    if (!bocSourceId) {
      setSections([])
      return
    }
    let alive = true
    void api
      .listBocDocumentSections(documentCode, bocSourceId)
      .then((rows) => {
        if (alive) setSections(rows)
      })
      .catch(() => {
        if (alive) setSections([])
      })
    return () => {
      alive = false
    }
  }, [documentCode, bocSourceId])

  const navigate = (code: string, ordinal: number): void => {
    setDocumentCode(code)
    setSectionOrdinal(ordinal)
    void api.setSession('refBocLoc', JSON.stringify({ documentCode: code, ordinal }))
  }

  // Switching documents lands on its first section — the previous ordinal means nothing here.
  const pickDocument = (code: string): void => navigate(code, 1)

  if (!bocSourceId) {
    return <div className="sr-loading">Loading Confessions…</div>
  }

  return (
    <div className="ref-bible">
      <div className="ref-bible-head">
        <select
          className="ref-boc-select"
          value={documentCode}
          onChange={(e) => pickDocument(e.target.value)}
          title="Document"
        >
          {BOC_DOCUMENTS.map((d) => (
            <option key={d.code} value={d.code}>
              {d.abbreviation}
            </option>
          ))}
        </select>
        <select
          className="ref-boc-select ref-boc-section-select"
          value={sectionOrdinal}
          onChange={(e) => navigate(documentCode, Number(e.target.value))}
          title="Section"
        >
          {sections.map((r) => (
            <option key={r.ordinal} value={r.ordinal}>
              {bocSectionLabel(r)}
            </option>
          ))}
        </select>
        <OpenInCenterButton content={{ kind: 'boc', documentCode, sectionOrdinal, bocSourceId }} />
      </div>
      <BocReader
        documentCode={documentCode}
        sectionOrdinal={sectionOrdinal}
        bocSourceId={bocSourceId}
        sources={sources}
        onNavigate={(ordinal) => navigate(documentCode, ordinal)}
        onSectionClick={(code, ordinal) =>
          void bocSectionClicked(
            code,
            ordinal,
            currentSection ? { number: currentSection.number, label: currentSection.label } : undefined
          )
        }
        onQuote={(paragraph, text, color) =>
          void addBocQuote({
            bocSourceId,
            documentCode,
            sectionOrdinal,
            sectionNumber: currentSection?.number ?? null,
            sectionLabel: currentSection?.label ?? '',
            paragraph,
            text,
            color
          })
        }
        compact
      />
    </div>
  )
}
