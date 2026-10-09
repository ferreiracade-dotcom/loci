import { Landmark } from 'lucide-react'
import { EmptyState } from '../EmptyState'

/** Placeholder for the Church Fathers view; the real view replaces this in the tab registry. */
export function FathersPage() {
  return (
    <EmptyState
      icon={Landmark}
      title="Church Fathers"
      subtitle="The Church Fathers corpus will open here."
    />
  )
}
