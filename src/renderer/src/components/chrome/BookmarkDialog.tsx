import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useStore } from '../../store/useStore'
import type { TabLocation } from '../../store/useStore'
import { childrenOf, folderSubtree } from '../../store/bookmarks'
import type { Bookmarks } from '../../store/bookmarks'

/** What the bookmark dialog edits. */
export type BookmarkDialogRequest =
  | { type: 'editBookmark'; id: string }
  | { type: 'editFolder'; id: string }
  | { type: 'newFolder'; parentId?: string }
  | { type: 'newBookmark'; location: TabLocation; title: string; parentId?: string }

const DIALOG_EVENT = 'loci:bookmark-dialog'

/** Open the bookmark dialog from anywhere (bar, manager, menus). */
export function openBookmarkDialog(req: BookmarkDialogRequest): void {
  window.dispatchEvent(new CustomEvent<BookmarkDialogRequest>(DIALOG_EVENT, { detail: req }))
}

/** Folders as indented options ("Bookmarks bar" first), leaving out `exclude`'s subtree. */
function folderOptions(b: Bookmarks, exclude?: string): { id: string; label: string }[] {
  const skip = exclude ? folderSubtree(b, exclude) : new Set<string>()
  const out: { id: string; label: string }[] = [{ id: '', label: 'Bookmarks bar' }]
  const walk = (parent: string | undefined, depth: number): void => {
    for (const n of childrenOf(b, parent)) {
      if (n.type !== 'folder' || skip.has(n.item.id)) continue
      out.push({ id: n.item.id, label: `${'   '.repeat(depth)}${n.item.title}` })
      walk(n.item.id, depth + 1)
    }
  }
  walk(undefined, 1)
  return out
}

/** Mounted once in the shell; shows the dialog when asked. */
export function BookmarkDialogHost() {
  const [req, setReq] = useState<BookmarkDialogRequest | null>(null)
  useEffect(() => {
    const on = (e: Event): void => setReq((e as CustomEvent<BookmarkDialogRequest>).detail)
    window.addEventListener(DIALOG_EVENT, on)
    return () => window.removeEventListener(DIALOG_EVENT, on)
  }, [])
  if (!req) return null
  return <BookmarkDialog req={req} onClose={() => setReq(null)} />
}

function BookmarkDialog({ req, onClose }: { req: BookmarkDialogRequest; onClose: () => void }) {
  const bookmarks = useStore((s) => s.bookmarks)
  const s = useStore.getState()
  const existing =
    req.type === 'editBookmark'
      ? bookmarks.bookmarks.find((m) => m.id === req.id)
      : req.type === 'editFolder'
        ? bookmarks.folders.find((f) => f.id === req.id)
        : undefined
  const initialTitle =
    existing?.title ?? (req.type === 'newBookmark' ? req.title : req.type === 'newFolder' ? 'New folder' : '')
  const initialParent =
    existing?.parentId ?? (req.type === 'newFolder' || req.type === 'newBookmark' ? req.parentId : undefined) ?? ''
  const [title, setTitle] = useState(initialTitle)
  const [parent, setParent] = useState(initialParent)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  if ((req.type === 'editBookmark' || req.type === 'editFolder') && !existing) return null

  const heading = {
    editBookmark: 'Edit bookmark',
    editFolder: 'Edit folder',
    newFolder: 'New folder',
    newBookmark: 'Add bookmark'
  }[req.type]
  const options = folderOptions(bookmarks, req.type === 'editFolder' ? req.id : undefined)

  const save = (): void => {
    const t = title.trim()
    if (!t) return
    const parentId = parent || null
    switch (req.type) {
      case 'editBookmark':
        s.editBookmark(req.id, { title: t, parentId })
        break
      case 'editFolder':
        s.editBookmarkFolder(req.id, { title: t, parentId })
        break
      case 'newFolder':
        s.addBookmarkFolder(t, parentId ?? undefined)
        break
      case 'newBookmark': {
        const m = s.addBookmark(req.location, t, parentId ?? undefined)
        // An existing bookmark for this location is edited instead of duplicated.
        s.editBookmark(m.id, { title: t, parentId })
        break
      }
    }
    onClose()
  }

  return createPortal(
    <div className="bmd-backdrop" onMouseDown={onClose}>
      <form
        className="bmd"
        role="dialog"
        aria-label={heading}
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation()
            onClose()
          }
        }}
      >
        <h6>{heading}</h6>
        <label>
          Name
          <input ref={inputRef} value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label>
          Folder
          <select value={parent} onChange={(e) => setParent(e.target.value)}>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <div className="bm-bubble-btns">
          <button type="button" className="bm-btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="bm-btn primary" disabled={!title.trim()}>
            Save
          </button>
        </div>
      </form>
    </div>,
    document.body
  )
}
