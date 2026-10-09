import type { LucideIcon } from 'lucide-react'
import {
  BookMarked,
  History,
  Landmark,
  LayoutDashboard,
  Library,
  NotebookPen,
  Quote,
  ScrollText
} from 'lucide-react'
import { useStore } from '../../store/useStore'
import type { PageKind } from '../../store/useStore'
import { SearchView } from '../library/SearchView'
import { openBibleTab, openConfessionsTab } from './openViews'

interface Tile {
  label: string
  icon: LucideIcon
  open: () => void
}

/**
 * Phase-1 New Tab page: the Loci search page with tiles for the main views. Opening anything
 * from here fills this tab (the store's New Tab reuse rule). The full New Tab page (recent
 * passages, continue reading) is phase 5.
 */
export function NewTabPage() {
  const openPage = useStore((s) => s.openPage)
  const page = (kind: PageKind) => () => openPage(kind)
  const tiles: Tile[] = [
    { label: 'Bible', icon: ScrollText, open: () => void openBibleTab() },
    { label: 'Confessions', icon: BookMarked, open: () => void openConfessionsTab() },
    { label: 'Fathers', icon: Landmark, open: page('fathers') },
    { label: 'Library', icon: Library, open: page('library') },
    { label: 'Notes', icon: NotebookPen, open: page('notes') },
    { label: 'Quotes', icon: Quote, open: page('quotesIndex') },
    { label: 'History', icon: History, open: page('history') },
    { label: 'Dashboard', icon: LayoutDashboard, open: page('dashboard') }
  ]
  return (
    <div className="ntp">
      <div className="ntp-word">Loci</div>
      <div className="ntp-search">
        <SearchView />
      </div>
      <div className="ntp-tiles">
        {tiles.map((t) => {
          const Icon = t.icon
          return (
            <button key={t.label} className="ntp-tile" onClick={t.open}>
              <span className="ntp-tile-ic">
                <Icon size={20} />
              </span>
              {t.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
