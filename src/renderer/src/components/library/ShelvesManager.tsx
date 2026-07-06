import { useEffect, useState } from 'react'
import { X, Plus, Trash2, ChevronUp, ChevronDown } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { DrawerOverlay } from '../DrawerOverlay'
import type { Shelf, Tag } from '@shared/ipc'

/** Move the item at `index` up or down one spot; a no-op at either end. */
function moved<T>(list: T[], index: number, dir: -1 | 1): T[] {
  const j = index + dir
  if (j < 0 || j >= list.length) return list
  const next = list.slice()
  ;[next[index], next[j]] = [next[j], next[index]]
  return next
}

function ShelfRow({
  shelf,
  onMove,
  canMoveUp,
  canMoveDown
}: {
  shelf: Shelf
  onMove: (dir: -1 | 1) => void
  canMoveUp: boolean
  canMoveDown: boolean
}) {
  const renameShelf = useStore((s) => s.renameShelf)
  const deleteShelf = useStore((s) => s.deleteShelf)
  const [name, setName] = useState(shelf.name)

  useEffect(() => {
    setName(shelf.name)
  }, [shelf.id, shelf.name])

  const commit = (): void => {
    const n = name.trim()
    if (n && n !== shelf.name) void renameShelf(shelf.id, n)
    else setName(shelf.name)
  }

  return (
    <div className="shelf-mgr-row">
      <div className="mgr-reorder">
        <button className="icon-btn" title="Move up" disabled={!canMoveUp} onClick={() => onMove(-1)}>
          <ChevronUp size={13} />
        </button>
        <button
          className="icon-btn"
          title="Move down"
          disabled={!canMoveDown}
          onClick={() => onMove(1)}
        >
          <ChevronDown size={13} />
        </button>
      </div>
      <input
        className="field"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          else if (e.key === 'Escape') setName(shelf.name)
        }}
      />
      <span className="shelf-mgr-count" title="Books on this shelf">
        {shelf.count}
      </span>
      <button
        className="icon-btn"
        title="Delete shelf"
        onClick={() => {
          if (window.confirm(`Delete shelf “${shelf.name}”? Your books stay in the library.`))
            void deleteShelf(shelf.id)
        }}
      >
        <Trash2 size={14} />
      </button>
    </div>
  )
}

function TagRow({
  tag,
  onMove,
  canMoveUp,
  canMoveDown
}: {
  tag: Tag
  onMove: (dir: -1 | 1) => void
  canMoveUp: boolean
  canMoveDown: boolean
}) {
  return (
    <div className="shelf-mgr-row">
      <div className="mgr-reorder">
        <button className="icon-btn" title="Move up" disabled={!canMoveUp} onClick={() => onMove(-1)}>
          <ChevronUp size={13} />
        </button>
        <button
          className="icon-btn"
          title="Move down"
          disabled={!canMoveDown}
          onClick={() => onMove(1)}
        >
          <ChevronDown size={13} />
        </button>
      </div>
      <span className="shelf-mgr-tag-name">#{tag.name}</span>
    </div>
  )
}

export function ShelvesManager({ onClose }: { onClose: () => void }) {
  const shelves = useStore((s) => s.shelves)
  const tags = useStore((s) => s.tags)
  const createShelf = useStore((s) => s.createShelf)
  const reorderShelves = useStore((s) => s.reorderShelves)
  const reorderTags = useStore((s) => s.reorderTags)
  const [newName, setNewName] = useState('')

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const add = (): void => {
    const n = newName.trim()
    if (!n) return
    void createShelf(n)
    setNewName('')
  }

  const moveShelf = (index: number, dir: -1 | 1): void => {
    void reorderShelves(moved(shelves, index, dir).map((s) => s.id))
  }
  const moveTag = (index: number, dir: -1 | 1): void => {
    void reorderTags(moved(tags, index, dir).map((t) => t.id))
  }

  return (
    <DrawerOverlay onClose={onClose}>
      <div className="drawer-head">
          <h2 className="drawer-title">Shelves &amp; Tags</h2>
          <button className="icon-btn" title="Close" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <div className="drawer-body">
          <h3 className="mgr-sec-title">Shelves</h3>
          <div className="shelf-add">
            <input
              className="field"
              placeholder="New shelf name…"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') add()
              }}
            />
            <button className="btn btn-primary btn-sm" disabled={!newName.trim()} onClick={add}>
              <Plus size={14} /> Add
            </button>
          </div>
          <div className="shelf-mgr-list">
            {shelves.map((s, i) => (
              <ShelfRow
                key={s.id}
                shelf={s}
                onMove={(dir) => moveShelf(i, dir)}
                canMoveUp={i > 0}
                canMoveDown={i < shelves.length - 1}
              />
            ))}
          </div>
          <p className="folder-hint">
            Rename inline, reorder with the arrows; deleting a shelf keeps the books themselves.
          </p>

          <h3 className="mgr-sec-title">Tags</h3>
          {tags.length === 0 ? (
            <p className="folder-hint">
              No tags yet — add them from a book&apos;s info panel and they&apos;ll appear here to
              reorder.
            </p>
          ) : (
            <>
              <div className="shelf-mgr-list">
                {tags.map((t, i) => (
                  <TagRow
                    key={t.id}
                    tag={t}
                    onMove={(dir) => moveTag(i, dir)}
                    canMoveUp={i > 0}
                    canMoveDown={i < tags.length - 1}
                  />
                ))}
              </div>
              <p className="folder-hint">This order is used anywhere tags are listed or grouped.</p>
            </>
          )}
        </div>
    </DrawerOverlay>
  )
}
