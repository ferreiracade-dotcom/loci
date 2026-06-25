import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize2, X, Highlighter } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { api } from '../../lib/api'

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
    } catch {
      /* skip unreadable page */
    }
  }
  if (!isCancelled()) await api.indexBookText(bookId, title, pages)
}

const GAP = 16

export function PdfReader({ bookId }: { bookId: string }) {
  const book = useStore((s) => s.books.find((b) => b.id === bookId))
  const closeBook = useStore((s) => s.closeBook)
  const addQuote = useStore((s) => s.addQuote)
  const pendingPage = useStore((s) => s.pendingPage)
  const clearPendingPage = useStore((s) => s.clearPendingPage)
  const [sel, setSel] = useState<Selection | null>(null)
  const [savedMsg, setSavedMsg] = useState(false)

  const stageRef = useRef<HTMLDivElement>(null)
  const docRef = useRef<PDFDocumentProxy | null>(null)
  const slotRefs = useRef<(HTMLDivElement | null)[]>([])
  const renderedRef = useRef<Set<number>>(new Set())
  const tasksRef = useRef<Map<number, RenderHandle>>(new Map())
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const didInitialScroll = useRef(false)

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
      renderedRef.current.clear()
      if (docRef.current) {
        void docRef.current.destroy()
        docRef.current = null
      }
    }
  }, [bookId])

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
        slot.replaceChildren(canvas)
        const task = pg.render({
          canvasContext: ctx,
          viewport,
          transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined
        })
        tasksRef.current.set(pageNum, task)
        await task.promise.catch(() => {})
        if (!renderedRef.current.has(pageNum)) return

        // Selectable text layer over the canvas.
        const textDiv = document.createElement('div')
        textDiv.className = 'textLayer'
        textDiv.style.setProperty('--scale-factor', String(viewport.scale))
        slot.appendChild(textDiv)
        const textContent = await pg.getTextContent()
        if (!renderedRef.current.has(pageNum)) {
          textDiv.remove()
          return
        }
        const textLayer = new pdfjsLib.TextLayer({
          textContentSource: textContent,
          container: textDiv,
          viewport
        })
        await textLayer.render()
        const eoc = document.createElement('div')
        eoc.className = 'endOfContent'
        textDiv.appendChild(eoc)
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
        } else if (!visible && renderedRef.current.has(pageNum)) {
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
      if (e.key === 'ArrowRight' || e.key === 'PageDown') goToPage(currentPage + 1)
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') goToPage(currentPage - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [goToPage, currentPage])

  // Jump to a page requested from search.
  useEffect(() => {
    if (pendingPage && !loading && numPages) {
      goToPage(pendingPage)
      clearPendingPage()
    }
  }, [pendingPage, loading, numPages, goToPage, clearPendingPage])

  const zoom = (delta: number): void => {
    setFitWidth(false)
    setManualScale((s) => Math.max(0.4, Math.min(3, (fitWidth ? effScale : s) + delta)))
  }

  const setSelecting = (on: boolean): void => {
    stageRef.current?.querySelectorAll('.textLayer').forEach((tl) => tl.classList.toggle('selecting', on))
  }

  const onStageMouseDown = (e: MouseEvent): void => {
    setSel(null)
    setSelecting(false)
    // Only the page under the cursor gets the endOfContent backstop, so a drag
    // can't bleed selection across pages in the continuous scroll.
    ;(e.target as Element).closest?.('.textLayer')?.classList.add('selecting')
  }

  const onStageMouseUp = (): void => {
    setSelecting(false)
    const s = window.getSelection()
    const text = s?.toString().replace(/\s+/g, ' ').trim() ?? ''
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
        <button className="btn btn-sm" onClick={closeBook}>
          <X size={14} /> Library
        </button>
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
        {error && <div className="reader-msg error">{error}</div>}
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
