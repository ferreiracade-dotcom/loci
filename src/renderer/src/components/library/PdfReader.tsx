import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import { TextLayerBuilder } from 'pdfjs-dist/web/pdf_viewer.mjs'
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Maximize2,
  X,
  Highlighter,
  Search as SearchIcon,
  ChevronUp,
  ChevronDown
} from 'lucide-react'
import { useStore, foldTokens } from '../../store/useStore'
import { api } from '../../lib/api'
import type { SearchHit } from '@shared/ipc'

interface Selection {
  text: string
  page: number | null
  x: number
  y: number
}

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc

type RenderHandle = { cancel: () => void; promise: Promise<void> }

const indexedThisSession = new Set<string>()

/** Extract each page's text from an already-loaded doc and send it to the FTS index. */
async function indexBookPages(
  doc: PDFDocumentProxy,
  bookId: string,
  title: string,
  isCancelled: () => boolean
): Promise<void> {
  const pages: { page: number; text: string }[] = []
  for (let n = 1; n <= doc.numPages; n++) {
    if (isCancelled()) return
    try {
      const pg = await doc.getPage(n)
      const tc = await pg.getTextContent()
      pages.push({ page: n, text: tc.items.map((it) => ('str' in it ? it.str : '')).join(' ') })
      pg.cleanup()
    } catch {
      /* skip unreadable page */
    }
    if (n % 25 === 0) await new Promise((r) => setTimeout(r, 0))
  }
  if (!isCancelled()) await api.indexBookText(bookId, title, pages)
}

const GAP = 16

export function PdfReader({ bookId, embedded = false }: { bookId: string; embedded?: boolean }) {
  const book = useStore((s) => s.books.find((b) => b.id === bookId))
  const closeBook = useStore((s) => s.closeBook)
  const addQuote = useStore((s) => s.addQuote)
  const relinkBook = useStore((s) => s.relinkBook)
  const pendingPage = useStore((s) => s.pendingPage)
  const clearPendingPage = useStore((s) => s.clearPendingPage)
  const searchTerms = useStore((s) => s.searchTerms)
  const jumpToBookPage = useStore((s) => s.jumpToBookPage)
  const [sel, setSel] = useState<Selection | null>(null)
  const [savedMsg, setSavedMsg] = useState(false)
  // In-book search (this book's indexed pages only) — a small Ctrl+F-style box in the toolbar.
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchHits, setSearchHits] = useState<SearchHit[]>([])
  const [hitIndex, setHitIndex] = useState(0)
  // Bumped to re-attempt the load after reconnecting a missing file.
  const [reloadKey, setReloadKey] = useState(0)
  const [relinking, setRelinking] = useState(false)

  const stageRef = useRef<HTMLDivElement>(null)
  const docRef = useRef<PDFDocumentProxy | null>(null)
  const slotRefs = useRef<(HTMLDivElement | null)[]>([])
  const renderedRef = useRef<Set<number>>(new Set())
  const tasksRef = useRef<Map<number, RenderHandle>>(new Map())
  // Official pdf.js text-layer builders per page; cancel() deregisters their selection listener.
  const textBuildersRef = useRef<Map<number, TextLayerBuilder>>(new Map())
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const didInitialScroll = useRef(false)
  // True while the user is dragging a selection — pauses lazy load/unload so text
  // layers aren't torn down mid-drag (which makes the selection jump).
  const selectingRef = useRef(false)

  const [numPages, setNumPages] = useState(0)
  const [base, setBase] = useState<{ w: number; h: number } | null>(null)
  const [containerW, setContainerW] = useState(0)
  const [manualScale, setManualScale] = useState(1)
  const [fitWidth, setFitWidth] = useState(true)
  const [currentPage, setCurrentPage] = useState(book?.lastPage ?? 1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const effScale = useMemo(() => {
    if (!base) return 1
    if (fitWidth && containerW) return Math.max(0.4, Math.min(3, (containerW - 56) / base.w))
    return manualScale
  }, [base, containerW, fitWidth, manualScale])

  // Load document + first page dimensions.
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setBase(null)
    setNumPages(0)
    renderedRef.current.clear()
    didInitialScroll.current = false
    void api.getBookPdf(bookId).then(async (data) => {
      if (cancelled) return
      if (!data) {
        setError('Could not open this PDF — the file may have moved or be offline.')
        setLoading(false)
        return
      }
      try {
        const doc = await pdfjsLib.getDocument({ data }).promise
        if (cancelled) {
          void doc.destroy()
          return
        }
        const first = await doc.getPage(1)
        const vp = first.getViewport({ scale: 1 })
        docRef.current = doc
        slotRefs.current = new Array(doc.numPages).fill(null)
        setBase({ w: vp.width, h: vp.height })
        setNumPages(doc.numPages)
        setLoading(false)
        if (book && !book.indexed && !indexedThisSession.has(bookId)) {
          indexedThisSession.add(bookId)
          void indexBookPages(doc, bookId, book.title, () => cancelled)
        }
      } catch {
        if (!cancelled) {
          setError('Failed to render this PDF.')
          setLoading(false)
        }
      }
    })
    return () => {
      cancelled = true
      tasksRef.current.forEach((t) => {
        try {
          t.cancel()
        } catch {
          /* noop */
        }
      })
      tasksRef.current.clear()
      textBuildersRef.current.forEach((b) => {
        try {
          b.cancel()
        } catch {
          /* noop */
        }
      })
      textBuildersRef.current.clear()
      renderedRef.current.clear()
      if (docRef.current) {
        void docRef.current.destroy()
        docRef.current = null
      }
    }
  }, [bookId, reloadKey])

  // Track the container width for fit-width.
  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    setContainerW(el.clientWidth)
    const ro = new ResizeObserver(() => setContainerW(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [loading])

  const renderPage = useCallback(
    async (pageNum: number, slot: HTMLDivElement) => {
      const doc = docRef.current
      if (!doc) return
      try {
        const pg = await doc.getPage(pageNum)
        if (!renderedRef.current.has(pageNum)) return
        // Scale per page from its OWN width so every page fits and the text layer
        // (sized to the slot) matches the rendered canvas exactly.
        const natural = pg.getViewport({ scale: 1 })
        const scale =
          fitWidth && containerW
            ? Math.max(0.4, Math.min(3, (containerW - 56) / natural.width))
            : manualScale
        const viewport = pg.getViewport({ scale })
        slot.style.width = `${Math.floor(viewport.width)}px`
        slot.style.height = `${Math.floor(viewport.height)}px`
        const dpr = window.devicePixelRatio || 1
        const canvas = document.createElement('canvas')
        canvas.className = 'pdf-canvas'
        canvas.width = Math.floor(viewport.width * dpr)
        canvas.height = Math.floor(viewport.height * dpr)
        canvas.style.width = '100%'
        canvas.style.height = '100%'
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        // Drop any previous text layer for this page (deregisters its selection listener).
        const prevBuilder = textBuildersRef.current.get(pageNum)
        if (prevBuilder) {
          prevBuilder.cancel()
          textBuildersRef.current.delete(pageNum)
        }
        slot.replaceChildren(canvas)
        const task = pg.render({
          canvasContext: ctx,
          viewport,
          transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined
        })
        tasksRef.current.set(pageNum, task)
        await task.promise.catch(() => {})
        if (!renderedRef.current.has(pageNum)) return

        // Official pdf.js text layer — handles selection (including the endOfContent backstop
        // that anchors to the drag start) the way the Firefox PDF reader does.
        const builder = new TextLayerBuilder({ pdfPage: pg })
        builder.div.style.setProperty('--scale-factor', String(viewport.scale))
        slot.appendChild(builder.div)
        textBuildersRef.current.set(pageNum, builder)
        await builder.render(viewport).catch(() => {})
        if (!renderedRef.current.has(pageNum)) {
          builder.cancel()
          textBuildersRef.current.delete(pageNum)
          builder.div.remove()
        }
      } catch {
        /* ignore */
      }
    },
    [fitWidth, containerW, manualScale]
  )

  // Render pages near the viewport; unload far ones. Re-runs when scale changes.
  useEffect(() => {
    if (loading || error || !base || !numPages) return
    const stage = stageRef.current
    if (!stage) return

    // Scale changed → drop everything and re-render the visible window.
    renderedRef.current.clear()
    tasksRef.current.forEach((t) => {
      try {
        t.cancel()
      } catch {
        /* noop */
      }
    })
    tasksRef.current.clear()
    textBuildersRef.current.forEach((b) => {
      try {
        b.cancel()
      } catch {
        /* noop */
      }
    })
    textBuildersRef.current.clear()
    slotRefs.current.forEach((s) => s?.replaceChildren())

    let raf = 0
    const sync = (): void => {
      const top = stage.scrollTop
      const bottom = top + stage.clientHeight
      const margin = stage.clientHeight
      slotRefs.current.forEach((slot, i) => {
        if (!slot) return
        const pageNum = i + 1
        const sTop = slot.offsetTop
        const sBottom = sTop + slot.offsetHeight
        const visible = sBottom >= top - margin && sTop <= bottom + margin
        if (visible && !renderedRef.current.has(pageNum)) {
          renderedRef.current.add(pageNum)
          void renderPage(pageNum, slot)
        } else if (!visible && renderedRef.current.has(pageNum) && !selectingRef.current) {
          renderedRef.current.delete(pageNum)
          const t = tasksRef.current.get(pageNum)
          if (t) {
            try {
              t.cancel()
            } catch {
              /* noop */
            }
            tasksRef.current.delete(pageNum)
          }
          const b = textBuildersRef.current.get(pageNum)
          if (b) {
            b.cancel()
            textBuildersRef.current.delete(pageNum)
          }
          slot.replaceChildren()
        }
      })
      // Current page = last slot whose top is above the viewport's upper third.
      const probe = top + 80
      let cur = 1
      for (let i = 0; i < slotRefs.current.length; i++) {
        const s = slotRefs.current[i]
        if (s && s.offsetTop <= probe) cur = i + 1
        else break
      }
      setCurrentPage(cur)
    }

    const onScroll = (): void => {
      if (raf) return
      raf = window.requestAnimationFrame(() => {
        raf = 0
        sync()
      })
    }

    stage.addEventListener('scroll', onScroll, { passive: true })

    // Jump to the resume page on first layout.
    if (!didInitialScroll.current) {
      didInitialScroll.current = true
      const target = slotRefs.current[Math.min(Math.max(1, book?.lastPage ?? 1), numPages) - 1]
      if (target) stage.scrollTop = Math.max(0, target.offsetTop - GAP)
    }
    sync()

    return () => {
      stage.removeEventListener('scroll', onScroll)
      if (raf) window.cancelAnimationFrame(raf)
    }
  }, [effScale, base, numPages, loading, error, renderPage, book?.lastPage])

  // Persist the resume page (debounced).
  useEffect(() => {
    if (loading) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => void api.setBookLastPage(bookId, currentPage), 700)
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [currentPage, bookId, loading])

  const goToPage = useCallback(
    (target: number) => {
      const n = Math.min(Math.max(1, target), numPages || 1)
      const slot = slotRefs.current[n - 1]
      const stage = stageRef.current
      if (slot && stage) stage.scrollTo({ top: Math.max(0, slot.offsetTop - GAP), behavior: 'smooth' })
    },
    [numPages]
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      if (e.key === 'ArrowRight' || e.key === 'PageDown') goToPage(currentPage + 1)
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') goToPage(currentPage - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [goToPage, currentPage])

  // Safety net: clear the selecting flag even if the mouse is released outside the stage,
  // so lazy load/unload resumes.
  useEffect(() => {
    const onUp = (): void => {
      selectingRef.current = false
    }
    document.addEventListener('mouseup', onUp)
    return () => document.removeEventListener('mouseup', onUp)
  }, [])

  // Jump to a search result: center the matched word and keep it highlighted.
  // The page renders lazily and can be slow, so we scroll it in, then observe its
  // text layer and act when it appears — however long that takes — rather than
  // polling against a fixed deadline that slow pages can miss.
  useEffect(() => {
    if (!pendingPage || loading || !numPages) return
    const p = Math.min(Math.max(1, pendingPage), numPages)
    const fold = (s: string): string =>
      s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
    const folded = searchTerms.map(fold)

    let cancelled = false
    let observer: MutationObserver | null = null
    let settleTimer: ReturnType<typeof setTimeout> | null = null
    let giveUpTimer: ReturnType<typeof setTimeout> | null = null
    let slotTries = 0

    const cleanup = (): void => {
      observer?.disconnect()
      observer = null
      if (settleTimer) clearTimeout(settleTimer)
      if (giveUpTimer) clearTimeout(giveUpTimer)
    }

    const land = (slot: HTMLElement): void => {
      if (cancelled) return
      cleanup()
      const spans = slot.querySelectorAll<HTMLElement>('.textLayer span')
      document
        .querySelectorAll<HTMLElement>('.textLayer span.pdf-search-hit')
        .forEach((el) => el.classList.remove('pdf-search-hit'))
      const hits: HTMLElement[] = []
      spans.forEach((sp) => {
        const txt = fold(sp.textContent ?? '')
        if (txt && folded.some((t) => txt.includes(t))) {
          sp.classList.add('pdf-search-hit')
          hits.push(sp)
        }
      })
      if (hits.length) hits[0].scrollIntoView({ block: 'center', behavior: 'auto' })
      else slot.scrollIntoView({ block: 'start', behavior: 'auto' })
      clearPendingPage()
    }

    const start = (): void => {
      if (cancelled) return
      const slot = slotRefs.current[p - 1]
      if (!slot) {
        if (slotTries++ < 20) window.setTimeout(start, 150)
        else clearPendingPage()
        return
      }
      // Scroll the page in so its text layer renders.
      slot.scrollIntoView({ block: 'start', behavior: 'auto' })
      const hasSpans = (): boolean => slot.querySelectorAll('.textLayer span').length > 0
      if (!folded.length || hasSpans()) {
        land(slot)
        return
      }
      // Wait for the text layer; settle 80ms after the last addition so the layer
      // is fully rendered before we scan it, with a 15s safety net.
      observer = new MutationObserver(() => {
        if (!hasSpans()) return
        if (settleTimer) clearTimeout(settleTimer)
        settleTimer = setTimeout(() => land(slot), 80)
      })
      observer.observe(slot, { childList: true, subtree: true })
      giveUpTimer = setTimeout(() => land(slot), 15000)
    }

    window.setTimeout(start, 150)
    return () => {
      cancelled = true
      cleanup()
    }
  }, [pendingPage, loading, numPages, clearPendingPage, searchTerms])

  // In-book search: query this book's indexed pages only, in page order (not FTS relevance —
  // Prev/Next through a book reads naturally top-to-bottom, like a browser's find-in-page).
  useEffect(() => {
    if (!searchOpen || !searchQuery.trim()) {
      setSearchHits([])
      return
    }
    let cancelled = false
    const t = setTimeout(() => {
      void api.search(searchQuery, { kind: 'page', bookId }).then((hits) => {
        if (cancelled) return
        const sorted = [...hits].sort((a, b) => (a.page ?? 0) - (b.page ?? 0))
        setSearchHits(sorted)
        setHitIndex(0)
        if (sorted.length) jumpToBookPage(sorted[0].page ?? 1, foldTokens(searchQuery))
      })
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, searchOpen, bookId])

  const stepHit = (dir: 1 | -1): void => {
    if (!searchHits.length) return
    const next = (hitIndex + dir + searchHits.length) % searchHits.length
    setHitIndex(next)
    jumpToBookPage(searchHits[next].page ?? 1, foldTokens(searchQuery))
  }

  const closeSearch = (): void => {
    setSearchOpen(false)
    setSearchQuery('')
    setSearchHits([])
    document
      .querySelectorAll<HTMLElement>('.textLayer span.pdf-search-hit')
      .forEach((el) => el.classList.remove('pdf-search-hit'))
  }

  // Reconnect a missing/offline book to a file on disk, then re-attempt the load.
  const relink = async (): Promise<void> => {
    setRelinking(true)
    try {
      const updated = await relinkBook(bookId)
      if (updated) setReloadKey((k) => k + 1)
    } finally {
      setRelinking(false)
    }
  }

  const zoom = (delta: number): void => {
    setFitWidth(false)
    setManualScale((s) => Math.max(0.4, Math.min(3, (fitWidth ? effScale : s) + delta)))
  }

  const onStageMouseDown = (): void => {
    setSel(null)
    // Pause lazy load/unload so text layers aren't torn down mid-drag.
    selectingRef.current = true
  }

  const onStageMouseUp = (): void => {
    selectingRef.current = false
    const s = window.getSelection()
    // Normalize the same way pdf.js does on copy, so quotes with ligatures (ﬁ→fi), Greek, or
    // German diacritics (decomposed → composed) and soft hyphens are captured cleanly.
    const text = s ? pdfjsLib.normalizeUnicode(s.toString()).replace(/\s+/g, ' ').trim() : ''
    const stage = stageRef.current
    if (!text || !s || s.rangeCount === 0 || !stage) {
      setSel(null)
      return
    }
    const rect = s.getRangeAt(0).getBoundingClientRect()
    const sr = stage.getBoundingClientRect()
    const node = s.anchorNode
    const el = node && node.nodeType === 1 ? (node as Element) : (node?.parentElement ?? null)
    const slot = el?.closest('.page-slot') as HTMLElement | null
    const page = slot ? Number(slot.getAttribute('data-page')) : null
    setSel({
      text,
      page,
      x: rect.left - sr.left + stage.scrollLeft + rect.width / 2,
      y: rect.top - sr.top + stage.scrollTop
    })
  }

  const onAddQuote = async (): Promise<void> => {
    if (!sel) return
    await addQuote({ bookId, text: sel.text, page: sel.page })
    window.getSelection()?.removeAllRanges()
    setSel(null)
    setSavedMsg(true)
    window.setTimeout(() => setSavedMsg(false), 1800)
  }

  const slotW = base ? Math.floor(base.w * effScale) : 0
  const slotH = base ? Math.floor(base.h * effScale) : 0

  // Memoized so frequent re-renders (scroll updates currentPage) don't reset the
  // per-page sizes that renderPage sets imperatively.
  const pagesEl = useMemo(
    () => (
      <div className="reader-pages" style={{ gap: GAP }}>
        {Array.from({ length: numPages }, (_, i) => (
          <div
            key={i}
            ref={(el) => {
              slotRefs.current[i] = el
            }}
            className="page-slot"
            data-page={i + 1}
            style={{ width: slotW, height: slotH }}
          />
        ))}
      </div>
    ),
    [numPages, slotW, slotH]
  )

  return (
    <div className="reader">
      <div className="reader-toolbar">
        {!embedded && (
          <button className="btn btn-sm" onClick={closeBook}>
            <X size={14} /> Library
          </button>
        )}
        <div className="reader-title" title={book?.title}>
          {book?.title ?? 'Document'}
        </div>
        <div className="reader-controls">
          <button className="icon-btn" title="Previous page" onClick={() => goToPage(currentPage - 1)} disabled={currentPage <= 1}>
            <ChevronLeft size={16} />
          </button>
          <span className="reader-page">
            <input
              className="page-input"
              value={String(currentPage)}
              onChange={(e) => {
                const n = Number(e.target.value)
                if (!Number.isNaN(n) && n > 0) goToPage(n)
              }}
            />
            <span className="reader-of">/ {numPages || '—'}</span>
          </span>
          <button className="icon-btn" title="Next page" onClick={() => goToPage(currentPage + 1)} disabled={currentPage >= numPages}>
            <ChevronRight size={16} />
          </button>
          <span className="reader-sep" />
          {searchOpen ? (
            <span className="reader-search">
              <SearchIcon size={14} />
              <input
                className="reader-search-input"
                autoFocus
                placeholder="Search this book…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') stepHit(e.shiftKey ? -1 : 1)
                  else if (e.key === 'Escape') closeSearch()
                }}
              />
              {searchQuery.trim() && (
                <span className="reader-search-count">
                  {searchHits.length ? `${hitIndex + 1}/${searchHits.length}` : '0/0'}
                </span>
              )}
              <button
                className="icon-btn"
                title="Previous match"
                disabled={!searchHits.length}
                onClick={() => stepHit(-1)}
              >
                <ChevronUp size={14} />
              </button>
              <button
                className="icon-btn"
                title="Next match"
                disabled={!searchHits.length}
                onClick={() => stepHit(1)}
              >
                <ChevronDown size={14} />
              </button>
              <button className="icon-btn" title="Close search" onClick={closeSearch}>
                <X size={14} />
              </button>
            </span>
          ) : (
            <button className="icon-btn" title="Search this book" onClick={() => setSearchOpen(true)}>
              <SearchIcon size={16} />
            </button>
          )}
          <span className="reader-sep" />
          <button className="icon-btn" title="Zoom out" onClick={() => zoom(-0.15)}>
            <ZoomOut size={16} />
          </button>
          <button className="icon-btn" title="Zoom in" onClick={() => zoom(0.15)}>
            <ZoomIn size={16} />
          </button>
          <button className={`icon-btn${fitWidth ? ' active' : ''}`} title="Fit width" onClick={() => setFitWidth(true)}>
            <Maximize2 size={16} />
          </button>
        </div>
      </div>
      <div className="reader-stage" ref={stageRef} onMouseDown={onStageMouseDown} onMouseUp={onStageMouseUp}>
        {loading && <div className="reader-msg">Opening…</div>}
        {error && (
          <div className="reader-msg error">
            <div>{error}</div>
            <button className="btn btn-sm" disabled={relinking} onClick={() => void relink()}>
              {relinking ? 'Locating…' : 'Locate file…'}
            </button>
          </div>
        )}
        {!loading && !error && base && pagesEl}
        {sel && (
          <button
            className="quote-pop"
            style={{ left: sel.x, top: sel.y }}
            onMouseDown={(e) => {
              e.preventDefault()
              e.stopPropagation()
            }}
            onClick={() => void onAddQuote()}
          >
            <Highlighter size={14} /> Add quote{sel.page ? ` · p.${sel.page}` : ''}
          </button>
        )}
        {savedMsg && <div className="reader-saved">Quote added</div>}
      </div>
    </div>
  )
}
