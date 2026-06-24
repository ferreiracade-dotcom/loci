import { useEffect } from 'react'
import { useStore } from './store/useStore'
import { Wizard } from './components/Wizard'
import { WelcomeScreen } from './components/WelcomeScreen'
import { Shell } from './components/Shell'

export default function App() {
  const phase = useStore((s) => s.phase)
  const init = useStore((s) => s.init)

  useEffect(() => {
    void init()
  }, [init])

  if (phase === 'wizard') return <Wizard />
  if (phase === 'welcome') return <WelcomeScreen />
  if (phase === 'ready') return <Shell />

  return (
    <div className="boot">
      <span className="boot-mark">Loci</span>
    </div>
  )
}
