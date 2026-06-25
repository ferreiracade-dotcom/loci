import { useEffect, useState } from 'react'
import { X, Plus, Trash2 } from 'lucide-react'
import { useStore } from '../../store/useStore'
import type { Shelf } from '@shared/ipc'

function ShelfRow({ shelf }: { shelf: Shelf }) {
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

export function ShelvesManager({ onClose }: { onClose: () => void }) {
  const shelves = useStore((s) => s.shelves)
  const createShelf = useStore((s) => s.createShelf)
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

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <h2 className="drawer-title">Shelves</h2>
          <button className="icon-btn" title="Close" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <div className="drawer-body">
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
            {shelves.map((s) => (
              <ShelfRow key={s.id} shelf={s} />
            ))}
          </div>
          <p className="folder-hint">Rename inline; deleting a shelf keeps the books themselves.</p>
        </div>
      </div>
    </div>
  )
}
