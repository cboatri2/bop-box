import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Mascot } from './components/Mascot'
import { PinPad } from './components/PinPad'
import { Backdrop, Icon, Sheet, Toasts } from './components/ui'
import { initPlayer, setApproved, usePlayer, wakeUp } from './lib/player'
import {
  addToPlaylist,
  AuthError,
  completeLoginFromUrl,
  ensurePlaylist,
  getMe,
  getPlaylistSongs,
  isLoggedIn,
  logout,
  removeFromPlaylist,
  type Me,
  type Song,
  type Track,
} from './lib/spotify'
import { getSettings, hashPin, isNightTime, updateSettings, useSettings } from './lib/store'
import { toast } from './lib/toast'
import { KidHome } from './screens/KidHome'
import { NowPlaying, SpeakerSheet } from './screens/NowPlaying'
import { ParentPanel } from './screens/ParentPanel'
import { Setup } from './screens/Setup'
import { Welcome } from './screens/Welcome'

export default function App() {
  const [boot, setBoot] = useState<'loading' | 'out' | 'in'>('loading')
  useTheme()

  useEffect(() => {
    completeLoginFromUrl()
      .then((err) => {
        if (err) toast(err, '😕')
      })
      .catch(() => toast('Spotify sign-in failed. Please try again.', '😕'))
      .finally(() => setBoot(isLoggedIn() ? 'in' : 'out'))
  }, [])

  return (
    <>
      <Backdrop />
      {boot === 'out' && <Welcome />}
      {boot === 'in' && <Main />}
      <Toasts />
    </>
  )
}

function useTheme() {
  const s = useSettings()
  const p = usePlayer()
  const [night, setNight] = useState(isNightTime())
  useEffect(() => {
    const t = setInterval(() => setNight(isNightTime()), 60000)
    return () => clearInterval(t)
  }, [])
  const isNight = (s.nightColors && night) || p.sleepy
  useEffect(() => {
    const root = document.documentElement
    root.dataset.theme = s.theme
    root.dataset.night = String(isNight)
    const bg = getComputedStyle(root).getPropertyValue('--bg').trim()
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg || '#FFF6EA')
  }, [s.theme, isNight])
}

type View = 'kid' | 'gate' | 'parent'

function Main() {
  const s = useSettings()
  const p = usePlayer()
  const [me, setMe] = useState<Me | null>(null)
  const [songs, setSongs] = useState<Song[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<View>('kid')
  const [npOpen, setNpOpen] = useState(false)
  const [speakerOpen, setSpeakerOpen] = useState(false)
  const meRef = useRef<Me | null>(null)

  useEffect(() => initPlayer(getSettings().maxVolume), [])
  useEffect(() => setApproved(songs), [songs])

  const load = useCallback(async () => {
    try {
      const m = meRef.current ?? (await getMe())
      meRef.current = m
      setMe(m)
      const st = getSettings()
      const id = await ensurePlaylist(m, st.playlistId, st.kidName)
      if (id !== st.playlistId) updateSettings({ playlistId: id })
      const list = await getPlaylistSongs(id)
      list.sort((a, b) => b.addedAt.localeCompare(a.addedAt))
      setSongs(list)
    } catch (e) {
      if (e instanceof AuthError) {
        logout()
        window.location.reload()
        return
      }
      toast("Couldn't load songs. Check the internet?", '📡')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!s.setupDone) return
    void load()
    // Pick up songs a grown-up added from the Spotify app.
    const onFocus = () => !document.hidden && void load()
    document.addEventListener('visibilitychange', onFocus)
    const t = setInterval(onFocus, 90000)
    return () => {
      document.removeEventListener('visibilitychange', onFocus)
      clearInterval(t)
    }
  }, [s.setupDone, load])

  const onAdd = useCallback(async (tracks: Track[]) => {
    const id = getSettings().playlistId
    if (!id) throw new Error('Playlist not ready')
    const fresh = tracks.filter((t) => !songs.some((x) => x.uri === t.uri))
    for (let i = 0; i < fresh.length; i += 100) await addToPlaylist(id, fresh.slice(i, i + 100).map((t) => t.uri))
    const now = new Date().toISOString()
    setSongs((prev) => [...fresh.map((t) => ({ ...t, addedAt: now })), ...prev])
  }, [songs])

  const onRemove = useCallback(async (uri: string) => {
    const id = getSettings().playlistId
    if (!id) return
    try {
      await removeFromPlaylist(id, [uri])
      setSongs((prev) => prev.filter((x) => x.uri !== uri))
    } catch {
      toast("Couldn't remove that one.", '😕')
    }
  }, [])

  if (!s.setupDone) return <Setup onDone={() => setView('parent')} />

  const noSpeaker = !p.deviceId && (p.sdk === 'unsupported' || p.sdk === 'premium-needed')

  return (
    <>
      {noSpeaker && (
        <div className="banner">
          <span>{p.sdk === 'premium-needed' ? '🔑' : '🔊'}</span>
          <span>
            {p.sdk === 'premium-needed'
              ? 'Ask a grown-up: this Spotify account needs Premium to play music.'
              : "Music can't play in this browser. Pick a speaker!"}
          </span>
          {p.sdk === 'unsupported' && (
            <button className="btn-soft" onClick={() => setSpeakerOpen(true)}>
              Pick speaker
            </button>
          )}
        </div>
      )}

      <KidHome songs={songs} loading={loading} onOpenPlayer={() => setNpOpen(true)} onGrownUps={() => setView('gate')} />
      <NowPlaying open={npOpen} onClose={() => setNpOpen(false)} />
      <SpeakerSheet open={speakerOpen} onClose={() => setSpeakerOpen(false)} />

      <Sheet open={view === 'gate'} onClose={() => setView('kid')} title="Grown-ups only" className="gate">
        <PinPad
          title="Enter your PIN"
          subtitle="This part is for grown-ups."
          onComplete={async (pin) => {
            if ((await hashPin(pin)) !== getSettings().pinHash) return false
            setNpOpen(false)
            setView('parent')
            return true
          }}
        />
        <ForgotPin />
      </Sheet>

      <AnimatePresence>
        {view === 'parent' && (
          <ParentPanel
            me={me}
            songs={songs}
            onAdd={onAdd}
            onRemove={onRemove}
            onClose={() => setView('kid')}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {p.sleepy && (
          <motion.div className="goodnight" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 1.2 }}>
            <div className="moon" />
            <Mascot size={160} mood="sleepy" accessory={s.accessory} />
            <h1 className="h1">Sweet dreams, {s.kidName}!</h1>
            <p className="muted">The music is sleeping now.</p>
            <button className="btn-soft" onClick={wakeUp}>
              <Icon name="star" /> I'm awake
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

function ForgotPin() {
  const [armed, setArmed] = useState(false)
  return armed ? (
    <div className="forgot">
      <p className="muted small">Resetting signs out of Spotify. A grown-up will sign in again and pick a new PIN.</p>
      <button
        className="btn-danger"
        onClick={() => {
          updateSettings({ pinHash: '', setupDone: false })
          logout()
          window.location.reload()
        }}
      >
        Reset PIN
      </button>
    </div>
  ) : (
    <button className="link-btn" onClick={() => setArmed(true)}>
      Forgot PIN?
    </button>
  )
}
