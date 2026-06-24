import { useEffect } from 'react'
import { useStore } from './store/useStore'
import { Wizard } from './components/Wizard'
import { LockScreen } from './components/LockScreen'
import { Shell } from './components/Shell'

export default function App() {
  const phase = useStore((s) => s.phase)
  const init = useStore((s) => s.init)

  useEffect(() => {
    void init()
  }, [init])

  if (phase === 'wizard') return <Wizard />
  if (phase === 'locked') return <LockScreen />
  if (phase === 'ready') return <Shell />

  return (
    <div className="boot">
      <span className="boot-mark">Loci</span>
    </div>
  )
}
