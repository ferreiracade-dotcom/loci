import { useEffect, useState } from 'react'
import { Cloud, CloudOff } from 'lucide-react'
import { useStore } from '../../store/useStore'

/**
 * A lightweight Google-Drive indicator. Loci has no Drive API, so it can't read
 * the real sync state — it shows network status and is only rendered when the
 * vault actually lives under a Drive folder.
 */
export function DriveStatus() {
  const vaultPath = useStore((s) => s.config?.vaultPath ?? null)
  const [online, setOnline] = useState(navigator.onLine)

  useEffect(() => {
    const on = (): void => setOnline(true)
    const off = (): void => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  const onDrive = !!vaultPath && /my drive|google drive|googledrive/i.test(vaultPath)
  if (!onDrive) return null

  return (
    <span
      className={`drive-status${online ? '' : ' offline'}`}
      title={
        online
          ? 'Your vault is in Google Drive. Loci can’t read Drive’s exact sync state, so this reflects your network connection.'
          : 'Offline — Google Drive sync is paused until you reconnect.'
      }
    >
      {online ? <Cloud size={13} /> : <CloudOff size={13} />}
      Drive · {online ? 'Online' : 'Offline'}
    </span>
  )
}
