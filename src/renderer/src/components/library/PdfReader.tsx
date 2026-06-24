import { useCallback, useEffect, useRef, useState } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize2, X } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { api } from '../../lib/api'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc

type RenderHandle = { cancel: () => void; promise: Promise<void> }

export function PdfReader({ bookId }: { bookId: string }) {
  const book = useStore((s) => s.books.find((b) => b.id === bookId))
  const closeBook = useStore((s) => s.closeBook)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const docRef = useRef<PDFDocumentProxy | null>(null)
  const renderRef = useRef<RenderHandle | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [numPages, setNumPages] = useState(0)
  const [page, setPage] = useState(book?.lastPage ?? 1)
  const [scale, setScale] = useState(1.2)
  const [fitWidth, setFitWidth] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Load the document.
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
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
        docRef.current = doc
        setNumPages(doc.numPages)
        setPage((p) => Math.min(Math.max(1, p), doc.numPages))
        setLoading(false)
      } catch {
        if (!cancelled) {
          setError('Failed to render this PDF.')
          setLoading(false)
        }
      }
    })
    return () => {
      cancelled = true
      if (docRef.current) {
        void docRef.current.destroy()
        docRef.current = null
      }
    }
  }, [bookId])

  const renderPage = useCallback(async () => {
    const doc = docRef.current
    const canvas = canvasRef.current
    if (!doc || !canvas) return
    const pg = await doc.getPage(page)
    let useScale = scale
    if (fitWidth && stageRef.current) {
      const base = pg.getViewport({ scale: 1 })
      const avail = stageRef.current.clientWidth - 56
      useScale = Math.max(0.4, Math.min(3, avail / base.width))
    }
    const viewport = pg.getViewport({ scale: useScale })
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.floor(viewport.width * dpr)
    canvas.height = Math.floor(viewport.height * dpr)
    canvas.style.width = `${Math.floor(viewport.width)}px`
    canvas.style.height = `${Math.floor(viewport.height)}px`
    if (renderRef.current) {
      try {
        renderRef.current.cancel()
      } catch {
        /* noop */
      }
    }
    const task = pg.render({
      canvasContext: ctx,
      viewport,
      transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined
    })
    renderRef.current = task
    try {
      await task.promise
    } catch {
      /* cancelled */
    }
  }, [page, scale, fitWidth])

  useEffect(() => {
    if (!loading && !error) void renderPage()
  }, [renderPage, loading, error, numPages])

  // Re-render on resize while fitting width.
  useEffect(() => {
    if (!fitWidth) return
    const el = stageRef.current
    if (!el) return
    const ro = new ResizeObserver(() => void renderPage())
    ro.observe(el)
    return () => ro.disconnect()
  }, [fitWidth, renderPage])

  // Persist the resume page (debounced).
  useEffect(() => {
    if (loading) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => void api.setBookLastPage(bookId, page), 600)
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [page, bookId, loading])

  const go = useCallback(
    (target: number) => setPage(Math.min(Math.max(1, target), numPages || 1)),
    [numPages]
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'ArrowRight' || e.key === 'PageDown') go(page + 1)
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') go(page - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go, page])

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
          <button className="icon-btn" title="Previous page" onClick={() => go(page - 1)} disabled={page <= 1}>
            <ChevronLeft size={16} />
          </button>
          <span className="reader-page">
            <input
              className="page-input"
              value={String(page)}
              onChange={(e) => {
                const n = Number(e.target.value)
                if (!Number.isNaN(n) && n > 0) go(n)
              }}
            />
            <span className="reader-of">/ {numPages || '—'}</span>
          </span>
          <button className="icon-btn" title="Next page" onClick={() => go(page + 1)} disabled={page >= numPages}>
            <ChevronRight size={16} />
          </button>
          <span className="reader-sep" />
          <button
            className="icon-btn"
            title="Zoom out"
            onClick={() => {
              setFitWidth(false)
              setScale((s) => Math.max(0.4, s - 0.15))
            }}
          >
            <ZoomOut size={16} />
          </button>
          <button
            className="icon-btn"
            title="Zoom in"
            onClick={() => {
              setFitWidth(false)
              setScale((s) => Math.min(3, s + 0.15))
            }}
          >
            <ZoomIn size={16} />
          </button>
          <button
            className={`icon-btn${fitWidth ? ' active' : ''}`}
            title="Fit width"
            onClick={() => setFitWidth(true)}
          >
            <Maximize2 size={16} />
          </button>
        </div>
      </div>
      <div className="reader-stage" ref={stageRef}>
        {loading && <div className="reader-msg">Opening…</div>}
        {error && <div className="reader-msg error">{error}</div>}
        {!loading && !error && <canvas ref={canvasRef} className="pdf-canvas" />}
      </div>
    </div>
  )
}
