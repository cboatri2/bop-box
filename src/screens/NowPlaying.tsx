import { AnimatePresence, motion, useDragControls } from 'motion/react'
import { useEffect, useState } from 'react'
import { Mascot } from '../components/Mascot'
import { buzz, Icon, SafeLayer, Sheet, useTick } from '../components/ui'
import { dominantColor } from '../lib/color'
import {
  chooseDevice,
  listDevices,
  livePosition,
  seek,
  setSleepTimer,
  setVolume,
  skip,
  togglePlay,
  usePlayer,
} from '../lib/player'
import type { MixOps } from '../App'
import type { Mix } from '../lib/library'
import { art, artistNames, type Device, type Song } from '../lib/spotify'
import { toggleFavorite, useSettings } from '../lib/store'
import { toast } from '../lib/toast'

const fmt = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

export function NowPlaying({ open, onClose, mixes, mixOps }: { open: boolean; onClose: () => void; mixes: Mix[]; mixOps: MixOps }) {
  const p = usePlayer()
  const s = useSettings()
  const [color, setColor] = useState<string | null>(null)
  const [sheet, setSheet] = useState<null | 'sleep' | 'speaker' | 'mix'>(null)
  const drag = useDragControls()
  useTick(open && !p.paused, 250)

  const cover = p.track ? art(p.track) : ''
  useEffect(() => {
    let live = true
    dominantColor(cover).then((c) => live && setColor(c))
    return () => {
      live = false
    }
  }, [cover])

  const pos = livePosition(p)
  const pct = p.duration ? (pos / p.duration) * 100 : 0
  const fav = p.track ? s.favorites.includes(p.track.uri) : false
  const sleepLeft = p.sleepEndsAt ? Math.max(0, p.sleepEndsAt - Date.now()) : 0

  return (
    <AnimatePresence>
      {open && p.track && (
        <SafeLayer
          key="np"
          className="np"
          style={{ ['--np' as string]: color ?? 'var(--accent)' }}
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', stiffness: 300, damping: 34 }}
          drag="y"
          dragControls={drag}
          dragListener={false}
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={{ top: 0, bottom: 0.6 }}
          onDragEnd={(_, info) => {
            if (info.offset.y > 120 || info.velocity.y > 600) onClose()
          }}
          role="dialog"
          aria-label="Now playing"
        >
          <div className="np-bg" />
          <div className="np-inner">
            <div className="np-top" onPointerDown={(e) => drag.start(e)}>
              <button className="np-icon" aria-label="Close player" onClick={onClose}>
                <Icon name="down" size={30} />
              </button>
              <button className="np-where" onClick={() => setSheet('speaker')}>
                <Icon name="speaker" size={16} /> {p.deviceName}
              </button>
              <button
                className={`np-icon ${p.sleepEndsAt ? 'is-on' : ''}`}
                aria-label="Sleep timer"
                onClick={() => setSheet('sleep')}
              >
                <Icon name="moon" size={24} />
                {p.sleepEndsAt && <span className="np-sleep-left">{Math.ceil(sleepLeft / 60000)}m</span>}
              </button>
            </div>

            <div className={`np-stage ${p.paused ? '' : 'is-playing'}`}>
              <div className="np-vinyl">
                <img src={cover} alt="" className="np-vinyl-label" />
              </div>
              <AnimatePresence mode="popLayout">
                <motion.img
                  key={cover}
                  src={cover}
                  alt=""
                  className="np-art"
                  initial={{ scale: 0.7, opacity: 0, rotate: -8 }}
                  animate={{ scale: p.paused ? 0.94 : 1, opacity: 1, rotate: 0 }}
                  exit={{ scale: 0.7, opacity: 0, rotate: 8 }}
                  transition={{ type: 'spring', stiffness: 260, damping: 20 }}
                  draggable={false}
                />
              </AnimatePresence>
            </div>

            <div className="np-meta">
              <div className="np-titles">
                <h2 className="np-title">{p.track.name}</h2>
                <p className="np-artist">{artistNames(p.track)}</p>
              </div>
              <motion.button className="np-heart" aria-label="Put in a mix" whileTap={{ scale: 1.2 }} onClick={() => setSheet('mix')}>
                <Icon name="plus" size={30} />
              </motion.button>
              <motion.button
                className={`np-heart ${fav ? 'is-on' : ''}`}
                aria-label={fav ? 'Remove from favorites' : 'Add to favorites'}
                aria-pressed={fav}
                whileTap={{ scale: 1.45 }}
                onClick={() => {
                  buzz()
                  toggleFavorite(p.track!.uri)
                  if (!fav) toast('Added to your favorites!', '💖')
                }}
              >
                <Icon name={fav ? 'heart-fill' : 'heart'} size={30} />
              </motion.button>
            </div>

            <div className="np-progress">
              <div className="np-bar">
                <span className="np-fill" style={{ width: `${pct}%` }} />
                <span className="np-knob" style={{ left: `${pct}%` }} />
                <input
                  type="range"
                  min={0}
                  max={p.duration || 1}
                  value={pos}
                  onChange={(e) => void seek(Number(e.target.value))}
                  aria-label="Song position"
                />
              </div>
              <div className="np-times">
                <span>{fmt(pos)}</span>
                <span>{fmt(p.duration)}</span>
              </div>
            </div>

            <div className="np-controls">
              <motion.button whileTap={{ scale: 0.86 }} className="np-btn" aria-label="Previous song" onClick={() => void skip(-1)}>
                <Icon name="prev" size={34} />
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.9 }}
                className="np-play"
                aria-label={p.paused ? 'Play' : 'Pause'}
                onClick={() => {
                  buzz()
                  void togglePlay()
                }}
              >
                <Icon name={p.paused ? 'play' : 'pause'} size={48} />
              </motion.button>
              <motion.button whileTap={{ scale: 0.86 }} className="np-btn" aria-label="Next song" onClick={() => void skip(1)}>
                <Icon name="next" size={34} />
              </motion.button>
            </div>

            {!isIOS && (
              <label className="np-volume">
                <span aria-hidden="true">🔈</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(p.volume * 100)}
                  onChange={(e) => setVolume(Number(e.target.value) / 100)}
                  aria-label="Volume"
                  style={{ ['--v' as string]: `${p.volume * 100}%` }}
                />
                <span aria-hidden="true">🔊</span>
              </label>
            )}
          </div>

          <div className="np-buddy">
            <Mascot size={92} accessory={s.accessory} bop={!p.paused} notes={!p.paused} mood={p.paused ? 'happy' : 'singing'} />
          </div>

          <SleepSheet open={sheet === 'sleep'} onClose={() => setSheet(null)} active={!!p.sleepEndsAt} />
          <SpeakerSheet open={sheet === 'speaker'} onClose={() => setSheet(null)} />
          <PutInMixSheet
            open={sheet === 'mix'}
            onClose={() => setSheet(null)}
            mixes={mixes}
            song={{ ...p.track, explicit: false, addedAt: new Date().toISOString() }}
            mixOps={mixOps}
          />
        </SafeLayer>
      )}
    </AnimatePresence>
  )
}

function SleepSheet({ open, onClose, active }: { open: boolean; onClose: () => void; active: boolean }) {
  const pick = (m: number | null) => {
    setSleepTimer(m)
    onClose()
    toast(m ? `Music will get sleepy in ${m} minutes` : 'Sleep timer off', m ? '🌙' : '☀️')
  }
  return (
    <Sheet open={open} onClose={onClose} title="Sleepy time">
      <p className="muted">The music will softly fade away.</p>
      <div className="sleep-grid">
        {[5, 10, 15, 30, 45, 60].map((m) => (
          <button key={m} className="sleep-opt" onClick={() => pick(m)}>
            <b>{m}</b>
            <span>min</span>
          </button>
        ))}
      </div>
      {active && (
        <button className="btn-soft" onClick={() => pick(null)}>
          Turn off sleep timer
        </button>
      )}
    </Sheet>
  )
}

export function SpeakerSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const p = usePlayer()
  const [devices, setDevices] = useState<Device[] | null>(null)
  useEffect(() => {
    if (!open) return
    setDevices(null)
    listDevices().then(setDevices)
  }, [open])

  const pick = (id: string, name: string) => {
    void chooseDevice(id, name)
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose} title="Where should music play?">
      <div className="device-list">
        {p.sdkDeviceId && (
          <button className={`device ${p.deviceId === p.sdkDeviceId ? 'is-on' : ''}`} onClick={() => pick(p.sdkDeviceId!, 'This device')}>
            <span className="device-emoji">📱</span>
            <span>Right here</span>
            {p.deviceId === p.sdkDeviceId && <Icon name="check" />}
          </button>
        )}
        {devices === null && <p className="muted">Looking for speakers…</p>}
        {devices?.map((d) => (
          <button key={d.id} className={`device ${p.deviceId === d.id ? 'is-on' : ''}`} onClick={() => pick(d.id!, d.name)}>
            <span className="device-emoji">{d.type === 'Speaker' ? '🔊' : d.type === 'TV' ? '📺' : d.type === 'Computer' ? '💻' : '🎵'}</span>
            <span>{d.name}</span>
            {p.deviceId === d.id && <Icon name="check" />}
          </button>
        ))}
        {devices?.length === 0 && !p.sdkDeviceId && (
          <p className="muted">No speakers found. Open Spotify on a speaker or computer, then try again.</p>
        )}
      </div>
    </Sheet>
  )
}

function PutInMixSheet({ open, onClose, mixes, song, mixOps }: { open: boolean; onClose: () => void; mixes: Mix[]; song: Song; mixOps: MixOps }) {
  return (
    <Sheet open={open} onClose={onClose} title="Put this song in a mix">
      {mixes.length === 0 ? (
        <p className="muted">You don't have any mixes yet. Tap “Make a mix” on the home screen!</p>
      ) : (
        <div className="device-list">
          {mixes.map((m) => {
            const has = m.songs.some((x) => x.uri === song.uri)
            return (
              <button
                key={m.id}
                className={`device ${has ? 'is-on' : ''}`}
                onClick={() => {
                  buzz()
                  if (has) void mixOps.removeSong(m.id, song.uri)
                  else {
                    void mixOps.addSong(m.id, song)
                    toast(`Added to ${m.name}!`, m.emoji)
                  }
                }}
              >
                <span className="device-emoji">{m.emoji}</span>
                <span>{m.name}</span>
                <Icon name={has ? 'check' : 'plus'} />
              </button>
            )
          })}
        </div>
      )}
    </Sheet>
  )
}
