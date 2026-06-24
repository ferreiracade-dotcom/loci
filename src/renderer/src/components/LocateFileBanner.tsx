import { AlertTriangle, FolderSearch } from 'lucide-react'

interface LocateFileBannerProps {
  message: string
  actionLabel: string
  onAction: () => void
}

/** Soft "Locate file" banner shown when a tracked path is missing (spec §0 Phase 0). */
export function LocateFileBanner({
  message,
  actionLabel,
  onAction
}: LocateFileBannerProps) {
  return (
    <div className="banner" role="alert">
      <AlertTriangle size={16} className="banner-icon" />
      <span className="banner-msg">{message}</span>
      <button className="btn btn-sm" onClick={onAction}>
        <FolderSearch size={14} />
        {actionLabel}
      </button>
    </div>
  )
}
