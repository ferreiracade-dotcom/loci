import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Landmark,
  PanelLeftClose,
  PanelLeftOpen
} from 'lucide-react'
import { useStore } from '../../store/useStore'
import type { Tab } from '../../store/useStore'
import { api } from '../../lib/api'
import { FATHERS_SERIES_LABEL, FATHERS_SERIES_ORDER } from '@shared/fathers'
import type { FathersAuthorSummary, FathersSectionSummary, FathersVolume } from '@shared/ipc'
import { groupFathersSections, sectionLabel } from '../../lib/fathersGrouping'
import { FathersReader } from './FathersReader'
import { FathersAuthorPage } from './FathersAuthorPage'
import { useOpenElsewhereMenu } from './OpenElsewhere'

type NavView = 'volumes' | 'authors'

/** The Church Fathers in a center workspace pane: a collapsible drawer (Volumes tree / Authors
 *  list) beside the reader or an author page. Navigation updates *this* tab only. */
export function FathersPane({ tab }: { tab: Tab }) {
  const navigateFathers = useStore((s) => s.navigateFathers)
  const openFathersAuthor = useStore((s) => s.openFathersAuthor)
  const showPassageInTexts = useStore((s) => s.showPassageInTexts)
  const addFathersQuote = useStore((s) => s.addFathersQuote)
  const { onContextMenu, menu } = useOpenElsewhereMenu()

  const volumeCode = tab.fathersVolume
  const sectionId = tab.fathersSection
  const authorId = tab.fathersAuthor

  const [volumes, setVolumes] = useState<FathersVolume[] | null>(null)
  const [authors, setAuthors] = useState<FathersAuthorSummary[] | null>(null)
  const [navView, setNavView] = useState<NavView>('volumes')
  // Panes are narrower than a full-center view, so default the drawer to its rail.
  const [navCollapsed, setNavCollapsed] = useState(true)
  const [expandedVolume, setExpandedVolume] = useState<string | null>(volumeCode ?? null)
  const [sectionsByVolume, setSectionsByVolume] = useState<Record<string, FathersSectionSummary[]>>({})
  const [collapsedAuthors, setCollapsedAuthors] = useState<Set<string>>(new Set())

  const [loadError, setLoadError] = useState<string | null>(null)
  const signature = useRef('')
  const refresh = useCallback(async () => {
    try {
      const [v, a] = await Promise.all([api.listFathersVolumes(), api.listFathersAuthors()])
      // A re-indexed volume has a different section list: drop the cached trees when anything moved.
      const sig = JSON.stringify(v.map((x) => [x.code, x.status, x.sectionCount]))
      if (signature.current && signature.current !== sig) setSectionsByVolume({})
      signature.current = sig
      setVolumes(v)
      setAuthors(a)
      setLoadError(null)
    } catch (err) {
      // The poll keeps retrying while the list is empty; show why instead of loading forever.
      setLoadError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // The startup sync indexes volumes one by one in the background: keep refreshing while the list
  // is empty or any volume is still waiting, so the drawer fills in without reopening the pane.
  const needsPoll = volumes === null || volumes.length === 0 || volumes.some((v) => v.status === 'unindexed')
  useEffect(() => {
    if (!needsPoll) return
    const t = window.setInterval(() => void refresh(), 5000)
    return () => window.clearInterval(t)
  }, [needsPoll, refresh])

  useEffect(() => {
    void api.getSession('fathersNavCollapsed').then((v) => setNavCollapsed(v !== '0'))
    void api.getSession('fathersNavView').then((v) => setNavView(v === 'authors' ? 'authors' : 'volumes'))
  }, [])

  // Keep the expanded volume following the tab (a catena click or search hit can change it).
  useEffect(() => {
    if (volumeCode) setExpandedVolume(volumeCode)
  }, [volumeCode])

  // Load a volume's section list the first time it is expanded.
  useEffect(() => {
    if (!expandedVolume || sectionsByVolume[expandedVolume]) return
    let alive = true
    void api.listFathersSections(expandedVolume).then((rows) => {
      if (alive) setSectionsByVolume((prev) => ({ ...prev, [expandedVolume]: rows }))
    })
    return () => {
      alive = false
    }
  }, [expandedVolume, sectionsByVolume])

  const toggleNav = (next: boolean): void => {
    setNavCollapsed(next)
    void api.setSession('fathersNavCollapsed', next ? '1' : '0')
  }
  const pickView = (v: NavView): void => {
    setNavView(v)
    void api.setSession('fathersNavView', v)
  }
  const toggleAuthorGroup = (key: string): void =>
    setCollapsedAuthors((prev) => {
      const n = new Set(prev)
      if (n.has(key)) n.delete(key)
      else n.add(key)
      return n
    })

  const volumesNav = (
    <div className="sv-testament">
      {volumes === null && loadError ? (
        <div className="quotes-empty">Could not load the Church Fathers list: {loadError}</div>
      ) : volumes === null ? (
        <div className="sr-loading" style={{ height: 'auto', padding: '6px 8px' }}>
          Loading…
        </div>
      ) : volumes.length === 0 ? (
        <div className="quotes-empty">
          No volumes found. Copy CCEL ThML files (anf01.xml …) into the vault&apos;s <b>fathers</b> folder and
          restart Loci.
        </div>
      ) : (
        FATHERS_SERIES_ORDER.map((series) => {
          const inSeries = volumes.filter((v) => v.series === series)
          if (inSeries.length === 0) return null
          return (
            <div key={series}>
              <div className="sv-testament-head">{FATHERS_SERIES_LABEL[series]}</div>
              {inSeries.map((v) => (
                <div key={v.code} className="sv-book-wrap">
                  <button
                    className={`sv-book${volumeCode === v.code ? ' active' : ''}`}
                    title={v.status === 'error' ? `Failed to index: ${v.error ?? 'unknown error'}` : v.title}
                    onClick={() => setExpandedVolume(expandedVolume === v.code ? null : v.code)}
                  >
                    <span className="fathers-vol-num">{v.number}</span> {v.title || v.code}
                    {v.status === 'error' && <AlertTriangle size={12} className="fathers-vol-warn" />}
                    {v.status === 'unindexed' && <span className="fathers-vol-pending"> (indexing…)</span>}
                  </button>
                  {v.status === 'error' && expandedVolume === v.code && (
                    <div className="fathers-vol-error">{v.error ?? 'This volume failed to index.'}</div>
                  )}
                  {expandedVolume === v.code && v.status === 'indexed' && (
                    <div style={{ paddingLeft: 8 }}>
                      {(sectionsByVolume[v.code] ? groupFathersSections(sectionsByVolume[v.code]) : null)?.map((g) => {
                        const open = !collapsedAuthors.has(g.key)
                        return (
                          <div key={g.key}>
                            <button
                              className="sv-testament-head fathers-author-head"
                              onClick={() => toggleAuthorGroup(g.key)}
                            >
                              {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />} {g.authorName}
                            </button>
                            {open &&
                              g.works.map((w, wi) => (
                                <div key={wi}>
                                  {w.workTitle && <div className="fathers-work-head">{w.workTitle}</div>}
                                  {w.sections.map((s) => (
                                    <button
                                      key={s.id}
                                      className={`sv-book${volumeCode === v.code && sectionId === s.id ? ' active' : ''}`}
                                      style={{ fontSize: 12.5 }}
                                      title={s.titles.join(' › ')}
                                      onClick={() => navigateFathers(v.code, s.id)}
                                      onContextMenu={(e) =>
                                        onContextMenu(e, {
                                          kind: 'fathers',
                                          fathersVolume: v.code,
                                          fathersSection: s.id
                                        })
                                      }
                                    >
                                      {sectionLabel(s)}
                                      {s.editorial && <span className="fathers-tag"> Editor</span>}
                                    </button>
                                  ))}
                                </div>
                              ))}
                          </div>
                        )
                      }) ?? (
                        <div className="sr-loading" style={{ height: 'auto', padding: '6px 8px' }}>
                          Loading…
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )
        })
      )}
    </div>
  )

  const authorsNav = (
    <div className="sv-testament">
      {authors === null && loadError ? (
        <div className="quotes-empty">Could not load the Church Fathers list: {loadError}</div>
      ) : authors === null ? (
        <div className="sr-loading" style={{ height: 'auto', padding: '6px 8px' }}>
          Loading…
        </div>
      ) : authors.length === 0 ? (
        <div className="quotes-empty">No authors indexed yet.</div>
      ) : (
        authors.map((a) => (
          <button
            key={a.id}
            className={`sv-book${authorId === a.id ? ' active' : ''}`}
            title={`${a.workCount} work${a.workCount === 1 ? '' : 's'}`}
            onClick={() => openFathersAuthor(a.id)}
          >
            {a.name}
            {a.datesLabel && <span className="fathers-dates"> {a.datesLabel}</span>}
          </button>
        ))
      )}
    </div>
  )

  let main: React.ReactNode
  if (authorId) {
    main = (
      <FathersAuthorPage
        authorId={authorId}
        onOpenWork={(code, sectionId2) => navigateFathers(code, sectionId2)}
      />
    )
  } else if (volumeCode && sectionId) {
    main = (
      <FathersReader
        volumeCode={volumeCode}
        sectionId={sectionId}
        onNavigate={(id) => navigateFathers(volumeCode, id)}
        onPassage={(book, chapter, highlight) => showPassageInTexts(book, chapter, highlight)}
        onAuthor={(id) => openFathersAuthor(id)}
        onQuote={(q) =>
          void addFathersQuote({
            volumeCode,
            sectionId,
            page: q.page,
            paragraph: q.paragraph,
            text: q.text,
            color: q.color
          })
        }
        compact
      />
    )
  } else {
    main = (
      <div className="sr-loading" style={{ flexDirection: 'column' }}>
        <Landmark size={22} />
        <div>Choose a volume or an author from the drawer.</div>
        {navCollapsed && (
          <button className="btn btn-sm" onClick={() => toggleNav(false)}>
            Open drawer
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="scripture-view">
      {navCollapsed ? (
        <div className="sv-nav-rail">
          <button className="rail-btn" title="Show volumes and authors" onClick={() => toggleNav(false)}>
            <PanelLeftOpen size={16} />
          </button>
        </div>
      ) : (
        <div className="sv-nav">
          <div className="sv-nav-top">
            <div className="sv-nav-bar">
              <span className="sv-nav-title">Church Fathers</span>
              <button className="icon-btn" title="Hide drawer" onClick={() => toggleNav(true)}>
                <PanelLeftClose size={15} />
              </button>
            </div>
            <div className="seg tiny fathers-nav-toggle">
              <button className={`seg-btn${navView === 'volumes' ? ' active' : ''}`} onClick={() => pickView('volumes')}>
                Volumes
              </button>
              <button className={`seg-btn${navView === 'authors' ? ' active' : ''}`} onClick={() => pickView('authors')}>
                Authors
              </button>
            </div>
          </div>
          <div className="sv-books">{navView === 'volumes' ? volumesNav : authorsNav}</div>
        </div>
      )}

      <div className="sv-main">{main}</div>
      {menu}
    </div>
  )
}
