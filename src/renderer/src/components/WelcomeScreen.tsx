import { useEffect, useState } from 'react'
import { useStore } from '../store/useStore'
import { api } from '../lib/api'
import defaultBg from '../assets/unlock-default.jpg'

export function WelcomeScreen() {
  const enter = useStore((s) => s.enter)
  const customBackground = useStore((s) => s.config?.welcomeBackground ?? null)
  // Don't seed with the default painting when a custom one is set, or it flashes
  // before the (async) custom image loads.
  const [bg, setBg] = useState<string | null>(customBackground ? null : defaultBg)

  useEffect(() => {
    let alive = true
    if (customBackground) {
      void api.getWelcomeBackground().then((d) => {
        if (alive) setBg(d || defaultBg)
      })
    } else {
      setBg(defaultBg)
    }
    return () => {
      alive = false
    }
  }, [customBackground])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Enter' || e.key === ' ') enter()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enter])

  return (
    <div
      className="welcome"
      style={{
        backgroundColor: 'var(--base)',
        backgroundImage: bg ? `url("${bg}")` : undefined
      }}
    >
      <div className="welcome-scrim" />
      <div className="welcome-content">
        <h1 className="welcome-brand">Loci</h1>
        <p className="welcome-sub">The Commonplace</p>
        <button className="btn btn-primary welcome-enter" onClick={enter} autoFocus>
          Enter
        </button>
      </div>
      {!customBackground && (
        <div className="welcome-credit">
          Georges de La Tour, <em>St. Joseph the Carpenter</em> (c. 1642) · public domain
        </div>
      )}
    </div>
  )
}
