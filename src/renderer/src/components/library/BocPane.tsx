import { useEffect, useState } from 'react'
import { PanelLeftClose, PanelLeftOpen, Replace, X } from 'lucide-react'
import { useStore } from '../../store/useStore'
import type { Tab } from '../../store/useStore'
import { api } from '../../lib/api'
import { BOC_DOCUMENTS } from '@shared/bookOfConcord'
import type { BocSectionRow, BocSource } from '@shared/ipc'
import { BocReader } from './BocReader'
import { useOpenElsewhereMenu } from './OpenElsewhere'
import { bocSectionLabel } from '../../lib/bocGrouping'

interface PartGroup {
  part: string | null
  rows: BocSectionRow[]
}

/** Group an ordinal-ordered section list into contiguous runs sharing the same `part` — parts
 *  appear as unbroken runs in reading order, so this reproduces the document's own part
 *  headings without needing a separate lookup. */
function groupByPart(rows: BocSectionRow[]): PartGroup[] {
  const groups: PartGroup[] = []
  for (const r of rows) {
    const last = groups[groups.length - 1]
    if (last && last.part === r.part) last.rows.push(r)
    else groups.push({ part: r.part, rows: [r] })
  }
  return groups
}


/** A Book of Concord document in a center workspace pane: the collapsible document-nav drawer
 *  (mirrors BiblePane's book drawer) plus the BocReader. Navigation and source changes update
 *  *this* pane only. */
export function BocPane({
  tab,
  onClose,
  onReplace
}: {
  tab: Tab
  onClose?: () => void
  onReplace?: () => void
}) {
  const setTabContent = useStore((s) => s.setTabContent)
  const bocSectionClicked = useStore((s) => s.bocSectionClicked)
  const addBocQuote = useStore((s) => s.addBocQuote)
  const { onContextMenu, menu } = useOpenElsewhereMenu()

  const [sources, setSources] = useState<BocSource[]>([])
  const documentCode = tab.documentCode ?? 'AC'
  const sectionOrdinal = tab.sectionOrdinal ?? 1
  const bocSourceId = tab.bocSourceId ?? sources[0]?.id ?? ''

  const [expanded, setExpanded] = useState<string | null>(documentCode)
  const [sections, setSections] = useState<BocSectionRow[]>([])
  const [sectionsLoading, setSectionsLoading] = useState(false)
  // Panes are narrower than a full-center view, so default the drawer to its rail.
  const [navCollapsed, setNavCollapsed] = useState(true)
  // Needed only to supply sectionNumber/sectionLabel for the quote write path (the ref string
  // alone, e.g. "AC:6", can't be turned back into a number/label — see migration v19 as-built).
  const [currentSection, setCurrentSection] = useState<BocSectionRow | null>(null)

  useEffect(() => {
    void api.listBocSources().then(setSources)
  }, [])

  useEffect(() => {
    void api.getSession('bocNavCollapsed').then((v) => setNavCollapsed(v !== '0'))
  }, [])

  useEffect(() => {
    setExpanded(documentCode)
  }, [documentCode])

  useEffect(() => {
    if (!bocSourceId) return
    let alive = true
    void api
      .getBocSection(documentCode, sectionOrdinal, bocSourceId)
      .then((s) => {
        if (alive) setCurrentSection(s)
      })
      .catch(() => {
        if (alive) setCurrentSection(null)
      })
    return () => {
      alive = false
    }
  }, [documentCode, sectionOrdinal, bocSourceId])

  useEffect(() => {
    if (!expanded || !bocSourceId) {
      setSections([])
      return
    }
    let alive = true
    setSectionsLoading(true)
    void api
      .listBocDocumentSections(expanded, bocSourceId)
      .then((rows) => {
        if (!alive) return
        setSections(rows)
        setSectionsLoading(false)
      })
      .catch(() => {
        if (!alive) return
        setSections([])
        setSectionsLoading(false)
      })
    return () => {
      alive = false
    }
  }, [expanded, bocSourceId])

  const toggleNav = (next: boolean): void => {
    setNavCollapsed(next)
    void api.setSession('bocNavCollapsed', next ? '1' : '0')
  }

  const navigate = (code: string, ordinal: number): void => {
    setTabContent(tab.id, { kind: 'boc', documentCode: code, sectionOrdinal: ordinal, bocSourceId })
    void api.setSession('lastBoc', JSON.stringify({ documentCode: code, ordinal }))
  }

  const pickSource = (id: string): void => {
    setTabContent(tab.id, { kind: 'boc', documentCode, sectionOrdinal, bocSourceId: id })
  }

  const docList = (
    <div className="sv-testament">
      {BOC_DOCUMENTS.map((d) => (
        <div key={d.code} className="sv-book-wrap">
          <button
            className={`sv-book${documentCode === d.code ? ' active' : ''}`}
            onClick={() => setExpanded(expanded === d.code ? null : d.code)}
          >
            {d.title}
          </button>
          {expanded === d.code && (
            <div style={{ paddingLeft: 8 }}>
              {sectionsLoading ? (
                <div className="sr-loading" style={{ height: 'auto', padding: '6px 8px' }}>
                  Loading…
                </div>
              ) : (
                groupByPart(sections).map((g, gi) => (
                  <div key={gi}>
                    {g.part && (
                      <div className="sv-testament-head" style={{ padding: '6px 8px 2px' }}>
                        {g.part}
                      </div>
                    )}
                    {g.rows.map((r) => (
                      <button
                        key={r.ordinal}
                        className={`sv-book${
                          documentCode === d.code && sectionOrdinal === r.ordinal ? ' active' : ''
                        }`}
                        style={{ fontSize: 12.5 }}
                        onClick={() => navigate(d.code, r.ordinal)}
                        onContextMenu={(e) =>
                          onContextMenu(e, {
                            kind: 'boc',
                            documentCode: d.code,
                            sectionOrdinal: r.ordinal,
                            bocSourceId
                          })
                        }
                      >
                        {bocSectionLabel(r)}
                      </button>
                    ))}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )

  return (
    <div className="scripture-view">
      {navCollapsed ? (
        <div className="sv-nav-rail">
          <button className="rail-btn" title="Show documents" onClick={() => toggleNav(false)}>
            <PanelLeftOpen size={16} />
          </button>
          {onReplace && (
            <button className="rail-btn" title="Change content" onClick={onReplace}>
              <Replace size={16} />
            </button>
          )}
          {onClose && (
            <button className="rail-btn" title="Close pane" onClick={onClose}>
              <X size={16} />
            </button>
          )}
        </div>
      ) : (
        <div className="sv-nav">
          <div className="sv-nav-top">
            <div className="sv-nav-bar">
              <span className="sv-nav-title">Confessions</span>
              {onReplace && (
                <button className="icon-btn" title="Change content" onClick={onReplace}>
                  <Replace size={15} />
                </button>
              )}
              <button className="icon-btn" title="Hide documents" onClick={() => toggleNav(true)}>
                <PanelLeftClose size={15} />
              </button>
              {onClose && (
                <button className="icon-btn" title="Close pane" onClick={onClose}>
                  <X size={15} />
                </button>
              )}
            </div>
          </div>
          <div className="sv-books">{docList}</div>
        </div>
      )}

      <div className="sv-main">
        {bocSourceId ? (
          <BocReader
            documentCode={documentCode}
            sectionOrdinal={sectionOrdinal}
            bocSourceId={bocSourceId}
            sources={sources}
            onNavigate={(ordinal) => navigate(documentCode, ordinal)}
            onSectionClick={bocSectionClicked}
            onSourceChange={pickSource}
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
        ) : (
          <div className="sr-loading">Loading Confessions…</div>
        )}
      </div>
      {menu}
    </div>
  )
}
