import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Mascot } from './components/Mascot'
import { PinPad } from './components/PinPad'
import { Backdrop, Icon, Sheet, Toasts } from './components/ui'
import { allowedSongs, keepAllowed, loadLibrary, type Library, type Mix } from './lib/library'
import { getPlayer, initPlayer, restartPlayer, setApproved, setMaxVolume, togglePlay, usePlayer, wakeUp } from './lib/player'
import {
  addToPlaylist,
  AuthError,
  beginLogin,
  completeLoginFromUrl,
  createPlaylist,
  deletePlaylist,
  getMe,
  isLoggedIn,
  logout,
  mixDescription,
  mixPlaylistName,
  removeFromPlaylist,
  renamePlaylist,
  replacePlaylistItems,
  updatePlaylistDetails,
  type Me,
  type Song,
  type Track,
} from './lib/spotify'
import { getSettings, hashPin, isNightTime, removeKid, setActiveKid, updateSettings, useSettings, type ThemeName } from './lib/store'
import { toast } from './lib/toast'
import { DEMO } from './lib/demo-flag'
import { KidHome } from './screens/KidHome'
import { NowPlaying, SpeakerSheet } from './screens/NowPlaying'
import { ParentPanel } from './screens/ParentPanel'
import { Setup } from './screens/Setup'
import { Welcome } from './screens/Welcome'
import { WhoIsListening } from './screens/WhoIsListening'

export default function App() {
  const [boot, setBoot] = useState<'loading' | 'out' | 'in'>('loading')
  useTheme()

  useEffect(() => {
    if (DEMO) {
      if (!getSettings().setupDone) void hashPin('1234').then((h) => updateSettings({ kidName: 'Sunny', pinHash: h, setupDone: true, approvedPlaylists: ['car', 'disney', 'bed'] }))
      setBoot('in')
      return
    }
    completeLoginFromUrl()
      .then(({ error, acct, kidId }) => {
        if (error) toast(error, '😕')
        // A grown-up just connected their playlists from inside the grown-up corner: go back there.
        else if (acct === 'grownup') sessionStorage.setItem('bopbox.justConnected', '1')
        // A kid was just signed in with their own Spotify (from "Add a kid" or Settings).
        else if (kidId) {
          setActiveKid(kidId)
          updateSettings({ ownAccount: true })
          sessionStorage.setItem('bopbox.justConnected', '1')
          toast(`${getSettings().kidName} is signed in to Spotify!`, '🎉')
        }
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

export type MixOps = {
  create: (name: string, emoji: string, color: ThemeName) => Promise<Mix | null>
  edit: (id: string, name: string, emoji: string, color: ThemeName) => Promise<void>
  remove: (id: string) => Promise<void>
  addSong: (id: string, song: Song) => Promise<void>
  removeSong: (id: string, uri: string) => Promise<void>
  reorder: (id: string, songs: Song[]) => Promise<void>
}

type View = 'kid' | 'gate' | 'parent' | 'add-kid'

function Main() {
  const s = useSettings()
  const p = usePlayer()
  const [me, setMe] = useState<Me | null>(null)
  const [lib, setLib] = useState<Library | null>(null)
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<View>('kid')
  const [npOpen, setNpOpen] = useState(false)
  const [speakerOpen, setSpeakerOpen] = useState(false)
  const meRef = useRef<Me | null>(null)
  const busy = useRef(false)
  // With several kids on one device, start by asking who's listening.
  const [picking, setPicking] = useState(() => getSettings().kids.length > 1)
  const [gateNext, setGateNext] = useState<'parent' | 'add-kid'>('parent')

  // Returning from connecting a grown-up's playlists: reopen the grown-up corner (that flow started there).
  useEffect(() => {
    if (sessionStorage.getItem('bopbox.justConnected')) {
      sessionStorage.removeItem('bopbox.justConnected')
      setPicking(false)
      setView('parent')
    }
  }, [])
  const prevKid = useRef<string | null>(null)
  const lastKid = useRef<string | null>(null)
  const [needsLogin, setNeedsLogin] = useState(false)

  useEffect(() => initPlayer(getSettings().maxVolume), [])

  // What the kid may hear, and her mixes trimmed to only those songs.
  const allowed = useMemo(() => allowedSongs(lib, s.hideExplicit), [lib, s.hideExplicit])
  const allowedSet = useMemo(() => new Set(allowed.map((x) => x.uri)), [allowed])
  const mixes = useMemo(
    () => (lib?.mixes ?? []).map((m) => ({ ...m, songs: keepAllowed(m.songs, allowedSet) })),
    [lib, allowedSet],
  )
  const shelves = useMemo(
    () =>
      [lib?.picked, ...(lib?.shelves ?? [])]
        .filter((x): x is NonNullable<typeof x> => !!x)
        .map((sh) => ({ ...sh, songs: keepAllowed(sh.songs, allowedSet) }))
        .filter((sh) => sh.songs.length > 0),
    [lib, allowedSet],
  )
  useEffect(() => setApproved(allowed), [allowed])

  const load = useCallback(async () => {
    if (busy.current) return
    busy.current = true
    try {
      if (import.meta.env.DEV && DEMO) {
        const { demoLibrary } = await import('./lib/demo')
        setMe({ id: 'demo', display_name: 'Demo grown-up', product: 'premium' })
        const st = getSettings()
        const fresh = demoLibrary(st.approvedPlaylists, st.kids[0]?.id === st.kidId)
        setLib((L) => (L ? { ...fresh, mixes: L.mixes } : fresh))
        return
      }
      const kidAtStart = getSettings().kidId
      const m = meRef.current ?? (await getMe())
      meRef.current = m
      setMe(m)
      const next = await loadLibrary(m)
      if (getSettings().kidId === kidAtStart) setLib(next) // ignore a load for a kid we've switched away from
    } catch (e) {
      if (e instanceof AuthError && e.acct === 'main') {
        // A kid with their own account needs that account signed in again; never fall back to another.
        if (getSettings().ownAccount) {
          setNeedsLogin(true)
          return
        }
        logout()
        window.location.reload()
        return
      }
      toast("Couldn't load songs. Check the internet?", '📡')
    } finally {
      busy.current = false
      setLoading(false)
    }
  }, [])

  // Switching kids: pause, apply that kid's volume cap, and load their library.
  useEffect(() => {
    if (!s.setupDone || !s.kidId) return
    if (!getPlayer().paused) void togglePlay()
    // Different kid, maybe a different Spotify account: forget who "me" is and reconnect the player.
    if (lastKid.current && lastKid.current !== s.kidId) restartPlayer()
    lastKid.current = s.kidId
    meRef.current = null
    setNeedsLogin(false)
    setMaxVolume(getSettings().maxVolume)
    setLib(null)
    setLoading(true)
    busy.current = false
    void load()
  }, [s.kidId, s.setupDone, load])

  useEffect(() => {
    if (!s.setupDone) return
    // Pick up songs a grown-up added from the Spotify app.
    const onFocus = () => !document.hidden && void load()
    document.addEventListener('visibilitychange', onFocus)
    const t = setInterval(onFocus, 90000)
    return () => {
      document.removeEventListener('visibilitychange', onFocus)
      clearInterval(t)
    }
  }, [s.setupDone, load])

  // ── "Picked for you" (grown-up adds songs one by one) ──
  const picked = lib?.picked.songs ?? []

  const onAdd = useCallback(
    async (tracks: Track[]) => {
      const id = getSettings().playlistId
      if (!id || !lib) throw new Error('Playlist not ready')
      const fresh = tracks.filter((t) => !lib.picked.songs.some((x) => x.uri === t.uri))
      for (let i = 0; i < fresh.length; i += 100) await addToPlaylist(id, fresh.slice(i, i + 100).map((t) => t.uri))
      const now = new Date().toISOString()
      setLib((L) => L && { ...L, picked: { ...L.picked, songs: [...fresh.map((t) => ({ ...t, addedAt: now })), ...L.picked.songs] } })
    },
    [lib],
  )

  const onRemove = useCallback(async (uri: string) => {
    const id = getSettings().playlistId
    if (!id) return
    try {
      await removeFromPlaylist(id, [uri])
      setLib((L) => L && { ...L, picked: { ...L.picked, songs: L.picked.songs.filter((x) => x.uri !== uri) } })
    } catch {
      toast("Couldn't remove that one.", '😕')
    }
  }, [])

  // ── Kid's mixes ──
  const patchMix = (id: string, fn: (m: Mix) => Mix | null) =>
    setLib((L) => L && { ...L, mixes: L.mixes.map((m) => (m.id === id ? fn(m) : m)).filter((m): m is Mix => !!m) })

  const mixOps: MixOps = useMemo(
    () => ({
      async create(name, emoji, color) {
        try {
          const st = getSettings()
          const pl = await createPlaylist(
            mixPlaylistName(emoji, name, st.kidName),
            mixDescription(st.kidName, color, emoji, st.playlistId),
          )
          updateSettings((x) => ({ mixMeta: { ...x.mixMeta, [pl.id]: { emoji, color, kid: st.playlistId } } }))
          const mix: Mix = { id: pl.id, name, emoji, color, songs: [] }
          setLib((L) => L && { ...L, mixes: [...L.mixes, mix] })
          return mix
        } catch {
          toast("Couldn't make that mix. Try again?", '😕')
          return null
        }
      },
      async edit(id, name, emoji, color) {
        patchMix(id, (m) => ({ ...m, name, emoji, color }))
        const st = getSettings()
        updateSettings((x) => ({ mixMeta: { ...x.mixMeta, [id]: { emoji, color, kid: st.playlistId } } }))
        await updatePlaylistDetails(id, {
          name: mixPlaylistName(emoji, name, st.kidName),
          description: mixDescription(st.kidName, color, emoji, st.playlistId),
        }).catch(() => toast("Couldn't save that.", '😕'))
      },
      async remove(id) {
        try {
          await deletePlaylist(id)
          patchMix(id, () => null)
          updateSettings((st) => {
            const { [id]: _gone, ...rest } = st.mixMeta
            void _gone
            return { mixMeta: rest }
          })
        } catch {
          toast("Couldn't delete that mix.", '😕')
        }
      },
      async addSong(id, song) {
        patchMix(id, (m) => (m.songs.some((x) => x.uri === song.uri) ? m : { ...m, songs: [...m.songs, song] }))
        await addToPlaylist(id, [song.uri], false).catch(() => {
          patchMix(id, (m) => ({ ...m, songs: m.songs.filter((x) => x.uri !== song.uri) }))
          toast("Couldn't add that song.", '😕')
        })
      },
      async removeSong(id, uri) {
        patchMix(id, (m) => ({ ...m, songs: m.songs.filter((x) => x.uri !== uri) }))
        await removeFromPlaylist(id, [uri]).catch(() => toast("Couldn't take that out.", '😕'))
      },
      async reorder(id, songs) {
        patchMix(id, (m) => ({ ...m, songs }))
        await replacePlaylistItems(id, songs.map((x) => x.uri)).catch(() => toast("Couldn't save the order.", '😕'))
      },
    }),
    [],
  )

  if (!s.setupDone) return <Setup onDone={() => setView('parent')} />

  if (view === 'add-kid') {
    const onDevice = new Set(s.kids.map((k) => k.playlistId).filter(Boolean))
    return (
      <Setup
        mode="add"
        existing={(lib?.boxes ?? []).filter((b) => !onDevice.has(b.id))}
        onDone={() => {
          setPicking(false)
          setView('parent')
          toast(`${getSettings().kidName} is all set!`, '🎉')
        }}
        onCancel={() => {
          const now = getSettings().kidId
          if (now && now !== prevKid.current) removeKid(now)
          setActiveKid(prevKid.current)
          setView('parent')
        }}
      />
    )
  }

  if (needsLogin && view === 'kid') {
    return (
      <main className="center-screen">
        <div className="card setup-card">
          <Mascot size={130} mood="sleepy" accessory={s.accessory} />
          <h1 className="h1">{s.kidName} needs to sign in again</h1>
          <p className="muted">Spotify signed {s.kidName}'s account out. A grown-up can sign it back in.</p>
          <button className="btn-candy btn-lg" onClick={() => s.kidId && void beginLogin('main', s.kidId)}>
            Sign in with {s.kidName}'s Spotify
          </button>
          {s.kids.length > 1 && (
            <button className="link-btn" onClick={() => setPicking(true)}>
              Switch who's listening
            </button>
          )}
        </div>
      </main>
    )
  }

  if (picking && s.kids.length > 1) {
    return (
      <WhoIsListening
        kids={s.kids}
        onPick={(id: string) => {
          setActiveKid(id)
          setPicking(false)
        }}
        onGrownUps={() => {
          setGateNext('parent')
          setView('gate')
          setPicking(false)
        }}
      />
    )
  }

  const startAddKid = () => {
    prevKid.current = getSettings().kidId
    setActiveKid(null)
    setView('add-kid')
  }

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

      <KidHome
        songs={allowed}
        shelves={shelves}
        mixes={mixes}
        mixOps={mixOps}
        loading={loading}
        onOpenPlayer={() => setNpOpen(true)}
        onGrownUps={() => {
          setGateNext('parent')
          setView('gate')
        }}
        onSwitchKid={s.kids.length > 1 ? () => setPicking(true) : undefined}
      />
      <NowPlaying open={npOpen} onClose={() => setNpOpen(false)} mixes={mixes} mixOps={mixOps} />
      <SpeakerSheet open={speakerOpen} onClose={() => setSpeakerOpen(false)} />

      <Sheet open={view === 'gate'} onClose={() => setView('kid')} title="Grown-ups only" className="gate">
        <PinPad
          title="Enter your PIN"
          subtitle="This part is for grown-ups."
          onComplete={async (pin) => {
            if ((await hashPin(pin)) !== getSettings().pinHash) return false
            setNpOpen(false)
            if (gateNext === 'add-kid') startAddKid()
            else setView('parent')
            return true
          }}
        />
        <ForgotPin />
      </Sheet>

      <AnimatePresence>
        {view === 'parent' && (
          <ParentPanel
            me={me}
            songs={picked}
            playlists={lib?.playlists ?? []}
            grownup={lib?.grownup ?? null}
            pickedId={lib?.picked.id}
            onApprovedChange={() => void load()}
            onAddKid={startAddKid}
            onRenameKid={(name) => {
              const old = getSettings().kidName
              updateSettings({ kidName: name })
              const pid = getSettings().playlistId
              if (pid) renamePlaylist(pid, name).catch(() => {})
              // Keep "💃 Dance Party · Name" in sync in Spotify.
              for (const m of lib?.mixes ?? []) {
                if (old !== name) void updatePlaylistDetails(m.id, { name: mixPlaylistName(m.emoji, m.name, name) }).catch(() => {})
              }
            }}
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
