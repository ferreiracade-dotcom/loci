import { useEffect, useRef, useState } from 'react'
import { Pause, Play } from 'lucide-react'
import { api } from '../../lib/api'
import type { ScriptureAudioTrack } from '@shared/ipc'

function fmt(t: number): string {
  if (!isFinite(t) || t < 0) t = 0
  const m = Math.floor(t / 60)
  const s = Math.floor(t % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2]
function speedLabel(r: number): string {
  return `${r}×`
}

/**
 * Chapter audio for translations that ship narrations (currently BSB via the Free Use
 * API — direct, non-expiring MP3s). Mounted fresh per chapter, so navigating resets it.
 */
export function ScriptureAudio({ tracks }: { tracks: ScriptureAudioTrack[] }) {
  const [reader, setReader] = useState(tracks[0]?.reader ?? '')
  const [rate, setRate] = useState(1)
  const [playing, setPlaying] = useState(false)
  const [cur, setCur] = useState(0)
  const [dur, setDur] = useState(0)
  const audioRef = useRef<HTMLAudioElement>(null)

  // Restore narrator + speed preferences on mount.
  useEffect(() => {
    void api.getSession('scriptureAudioReader').then((v) => {
      if (v && tracks.some((t) => t.reader === v)) setReader(v)
    })
    void api.getSession('scriptureAudioRate').then((v) => {
      const r = Number(v)
      if (SPEEDS.includes(r)) setRate(r)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const active = tracks.find((t) => t.reader === reader) ?? tracks[0]

  // When the source changes (narrator switch within this chapter), reset the element.
  useEffect(() => {
    const a = audioRef.current
    if (!a) return
    setPlaying(false)
    setCur(0)
    setDur(0)
    a.load()
  }, [active?.url])

  // Apply playback speed (load() resets it to the default, so re-assert on source change).
  useEffect(() => {
    const a = audioRef.current
    if (!a) return
    a.defaultPlaybackRate = rate
    a.playbackRate = rate
  }, [rate, active?.url])

  if (!active) return null

  const toggle = (): void => {
    const a = audioRef.current
    if (!a) return
    if (a.paused) void a.play()
    else a.pause()
  }

  const pickReader = (r: string): void => {
    setReader(r)
    void api.setSession('scriptureAudioReader', r)
  }

  const pickRate = (r: number): void => {
    setRate(r)
    void api.setSession('scriptureAudioRate', String(r))
  }

  const seek = (v: number): void => {
    const a = audioRef.current
    if (a) a.currentTime = v
    setCur(v)
  }

  return (
    <div className="sr-audio">
      <button
        className="sr-audio-btn"
        title={playing ? 'Pause' : 'Listen to this chapter'}
        onClick={toggle}
      >
        {playing ? <Pause size={15} /> : <Play size={15} />}
      </button>
      <span className="sr-audio-time">{fmt(cur)}</span>
      <input
        className="sr-audio-seek"
        type="range"
        min={0}
        max={dur || 0}
        step={0.5}
        value={cur}
        disabled={!dur}
        onChange={(e) => seek(Number(e.target.value))}
      />
      <span className="sr-audio-time">{dur ? fmt(dur) : '—:—'}</span>
      <select
        className="sr-audio-rate"
        title="Playback speed"
        value={rate}
        onChange={(e) => pickRate(Number(e.target.value))}
      >
        {SPEEDS.map((r) => (
          <option key={r} value={r}>
            {speedLabel(r)}
          </option>
        ))}
      </select>
      {tracks.length > 1 && (
        <select
          className="sr-audio-reader"
          title="Narrator"
          value={active.reader}
          onChange={(e) => pickReader(e.target.value)}
        >
          {tracks.map((t) => (
            <option key={t.reader} value={t.reader}>
              {t.label}
            </option>
          ))}
        </select>
      )}
      <audio
        ref={audioRef}
        src={active.url}
        preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(e) => setCur(e.currentTarget.currentTime)}
        onDurationChange={(e) => setDur(e.currentTarget.duration)}
        onLoadedMetadata={(e) => {
          setDur(e.currentTarget.duration)
          e.currentTarget.playbackRate = rate
        }}
        onEnded={() => setPlaying(false)}
      />
    </div>
  )
}
