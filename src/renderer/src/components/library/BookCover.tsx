import { useEffect, useState } from 'react'
import { BookOpen } from 'lucide-react'
import { api } from '../../lib/api'

interface BookCoverProps {
  id: string
  hasCover: boolean
  title: string
}

/** Lazily loads a book's cover as a data URL via IPC; falls back to a titled card. */
export function BookCover({ id, hasCover, title }: BookCoverProps) {
  const [src, setSrc] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    if (hasCover) {
      void api.getCover(id).then((d) => {
        if (alive) setSrc(d)
      })
    } else {
      setSrc(null)
    }
    return () => {
      alive = false
    }
  }, [id, hasCover])

  if (src) return <img className="cover-img" src={src} alt={title} draggable={false} />
  return (
    <div className="cover-fallback">
      <BookOpen size={26} strokeWidth={1.25} />
      <span>{title}</span>
    </div>
  )
}
