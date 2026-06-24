import type { LucideIcon } from 'lucide-react'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  subtitle?: string
}

export function EmptyState({ icon: Icon, title, subtitle }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <Icon size={40} strokeWidth={1.25} />
      </div>
      <h2 className="empty-title">{title}</h2>
      {subtitle && <p className="empty-sub">{subtitle}</p>}
    </div>
  )
}
