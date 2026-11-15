import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { PinPad } from '../components/PinPad'
import { Icon, Sheet } from '../components/ui'
import { setMaxVolume } from '../lib/player'
import {
  art,
  artistNames,
  getAlbumTracks,
  getPlaylistSongs,
  getTrack,
  logout,
  parseSpotifyLink,
  searchTracks,
  type Me,
  type Song,
  type Track,
} from '../lib/spotify'
import { hashPin, updateSettings, useSettings } from '../lib/store'
import { toast } from '../lib/toast'
import { BuddyPicker } from './Setup'

type Tab = 'add' | 'list' | 'wishes' | 'settings'

type Props = {
  me: Me | null
  songs: Song[]
  onAdd: (tracks: Track[]) => Promise<void>
  onRemove: (uri: string) => Promise<void>
  onClose: () => void
  initialTab?: Tab
}

export function ParentPanel({ me, songs, onAdd, onRemove, onClose, initialTab = 'add' }: Props) {
  const s = useSettings()
  const [tab, setTab] = useState<Tab>(initialTab)
  const [query, setQuery] = useState('')
  const name = s.kidName || 'Kiddo'

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'add', label: 'Add songs' },
    { id: 'list', label: `${name}'s songs`, count: songs.length },
    { id: 'wishes', label: 'Wishes', count: s.wishes.length },
    { id: 'settings', label: 'Settings' },
  ]

  return (
    <motion.div
      className="parent"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.2 }}
      role="dialog"
      aria-label="Grown-up corner"
    >
      <header className="parent-head">
        <div>
          <p className="eyebrow">
            <Icon name="lock" size={14} /> Grown-up corner
          </p>
          <h1 className="h1">{name}'s music box</h1>
        </div>
        <button className="btn-candy" onClick={onClose}>
          Back to {name} <Icon name="music" size={20} />
        </button>
      </header>

      <nav className="tabs" role="tablist">
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={`tab ${tab === t.id ? 'is-on' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
            {!!t.count && <span className="tab-count">{t.count}</span>}
            {tab === t.id && <motion.span layoutId="tab-pill" className="tab-pill" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
          </button>
        ))}
      </nav>

      <div className="parent-body">
        {tab === 'add' && <AddSongs songs={songs} onAdd={onAdd} query={query} setQuery={setQuery} />}
        {tab === 'list' && <SongList songs={songs} onRemove={onRemove} onAddMore={() => setTab('add')} />}
        {tab === 'wishes' && (
          <Wishes
            onFind={(q) => {
              setQuery(q)
              setTab('add')
            }}
          />
        )}
        {tab === 'settings' && <Settings me={me} />}
      </div>
    </motion.div>
  )
}

// ── Add songs ───────────────────────────────────────────────────────────────

function AddSongs({
  songs,
  onAdd,
  query,
  setQuery,
}: {
  songs: Song[]
  onAdd: (t: Track[]) => Promise<void>
  query: string
  setQuery: (q: string) => void
}) {
  const s = useSettings()
  const [results, setResults] = useState<Track[]>([])
  const [heading, setHeading] = useState<string | null>(null)
  const [offset, setOffset] = useState(0)
  const [more, setMore] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [adding, setAdding] = useState<Set<string>>(new Set())
  const reqId = useRef(0)

  const have = useMemo(() => new Set(songs.flatMap((x) => [x.uri, x.linked_from?.uri].filter(Boolean) as string[])), [songs])

  useEffect(() => {
    const q = query.trim()
    if (!q) {
      setResults([])
      setHeading(null)
      setErr(null)
      return
    }
    const id = ++reqId.current
    const t = setTimeout(async () => {
      setBusy(true)
      setErr(null)
      try {
        const link = parseSpotifyLink(q)
        if (link?.kind === 'track') {
          const tr = await getTrack(link.id)
          if (id !== reqId.current) return
          setResults([tr])
          setHeading('From your link')
          setMore(false)
        } else if (link?.kind === 'album') {
          const a = await getAlbumTracks(link.id)
          if (id !== reqId.current) return
          setResults(a.tracks)
          setHeading(`Album · ${a.name}`)
          setMore(false)
        } else if (link?.kind === 'playlist') {
          const pl = await getPlaylistSongs(link.id)
          if (id !== reqId.current) return
          setResults(pl)
          setHeading('From your playlist')
          setMore(false)
        } else {
          const r = await searchTracks(q, 0)
          if (id !== reqId.current) return
          setResults(r.items)
          setHeading(null)
          setOffset(0)
          setMore(!!r.next)
        }
      } catch (e) {
        if (id !== reqId.current) return
        setResults([])
        setErr(
          parseSpotifyLink(q)?.kind === 'playlist'
            ? "Spotify only lets apps open playlists you own or collaborate on."
            : (e as Error).message || 'Search failed',
        )
      } finally {
        if (id === reqId.current) setBusy(false)
      }
    }, 380)
    return () => clearTimeout(t)
  }, [query])

  const loadMore = async () => {
    const next = offset + 10
    setBusy(true)
    try {
      const r = await searchTracks(query.trim(), next)
      setResults((prev) => [...prev, ...r.items.filter((t) => !prev.some((p) => p.uri === t.uri))])
      setOffset(next)
      setMore(!!r.next && next < 990)
    } finally {
      setBusy(false)
    }
  }

  const visible = s.hideExplicit ? results.filter((t) => !t.explicit) : results
  const hidden = results.length - visible.length
  const addable = visible.filter((t) => !have.has(t.uri))

  const add = async (tracks: Track[]) => {
    const uris = tracks.map((t) => t.uri)
    setAdding((a) => new Set([...a, ...uris]))
    try {
      await onAdd(tracks)
      toast(tracks.length === 1 ? `Added “${tracks[0].name}”` : `Added ${tracks.length} songs`, '🎉')
    } catch {
      toast("Couldn't add that. Try again?", '😕')
    } finally {
      setAdding((a) => {
        const n = new Set(a)
        uris.forEach((u) => n.delete(u))
        return n
      })
    }
  }

  return (
    <section>
      <label className="search">
        <Icon name="search" />
        <input
          className="search-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search songs, artists… or paste a Spotify link"
          autoFocus
          enterKeyHint="search"
          aria-label="Search Spotify"
        />
        {query && (
          <button className="search-clear" aria-label="Clear" onClick={() => setQuery('')}>
            <Icon name="x" size={18} />
          </button>
        )}
      </label>

      {!query && (
        <div className="hint-cards">
          <div className="hint">
            <Icon name="search" />
            <div>
              <b>Search</b>
              <p>Type a song, artist or movie soundtrack.</p>
            </div>
          </div>
          <div className="hint">
            <Icon name="link" />
            <div>
              <b>Paste a link</b>
              <p>In the Spotify app, tap Share → Copy link on any song or album, then paste it here.</p>
            </div>
          </div>
          <div className="hint">
            <Icon name="music" />
            <div>
              <b>Or use Spotify itself</b>
              <p>
                Anything you add to the playlist “{s.kidName || 'My'}'s Bop Box ✨” in Spotify shows up here too.
              </p>
            </div>
          </div>
        </div>
      )}

      {err && <p className="error-note">{err}</p>}

      {heading && visible.length > 1 && (
        <div className="result-head">
          <b>{heading}</b>
          {addable.length > 0 && (
            <button className="btn-soft" onClick={() => void add(addable)}>
              <Icon name="plus" size={18} /> Add all {addable.length}
            </button>
          )}
        </div>
      )}

      <ul className="rows">
        <AnimatePresence initial={false}>
          {visible.map((t) => {
            const inList = have.has(t.uri)
            const isAdding = adding.has(t.uri)
            return (
              <motion.li key={t.uri} className="row" layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                <img className="row-art" src={art(t, 'sm')} alt="" loading="lazy" />
                <div className="row-text">
                  <span className="row-title">
                    {t.explicit && <span className="e-badge" title="Explicit">E</span>}
                    {t.name}
                  </span>
                  <span className="row-sub">
                    {artistNames(t)} · {t.album.name}
                  </span>
                </div>
                <button
                  className={`btn-add ${inList ? 'is-added' : ''}`}
                  disabled={inList || isAdding}
                  onClick={() => void add([t])}
                  aria-label={inList ? `${t.name} is already added` : `Add ${t.name}`}
                >
                  {inList ? <><Icon name="check" size={18} /> Added</> : isAdding ? '…' : <><Icon name="plus" size={18} /> Add</>}
                </button>
              </motion.li>
            )
          })}
        </AnimatePresence>
      </ul>

      {hidden > 0 && (
        <p className="muted small center">
          {hidden} explicit {hidden === 1 ? 'song' : 'songs'} hidden. You can change this in Settings.
        </p>
      )}
      {query && !busy && !err && results.length === 0 && <p className="muted center">No songs found. Try different words?</p>}
      {busy && <p className="muted center">Looking…</p>}
      {more && !busy && (
        <button className="btn-soft load-more" onClick={() => void loadMore()}>
          Show more
        </button>
      )}
    </section>
  )
}

// ── Song list ───────────────────────────────────────────────────────────────

function SongList({ songs, onRemove, onAddMore }: { songs: Song[]; onRemove: (uri: string) => Promise<void>; onAddMore: () => void }) {
  const [confirm, setConfirm] = useState<string | null>(null)
  if (!songs.length) {
    return (
      <div className="empty-parent">
        <p className="muted">No songs yet.</p>
        <button className="btn-candy" onClick={onAddMore}>
          <Icon name="plus" /> Add the first song
        </button>
      </div>
    )
  }
  return (
    <ul className="rows">
      <AnimatePresence initial={false}>
        {songs.map((t) => (
          <motion.li key={t.uri} className="row" layout exit={{ opacity: 0, x: -40, height: 0, marginBottom: 0, paddingTop: 0, paddingBottom: 0 }}>
            <img className="row-art" src={art(t, 'sm')} alt="" loading="lazy" />
            <div className="row-text">
              <span className="row-title">
                {t.explicit && <span className="e-badge">E</span>}
                {t.name}
              </span>
              <span className="row-sub">
                {artistNames(t)} · added {new Date(t.addedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              </span>
            </div>
            {confirm === t.uri ? (
              <div className="confirm">
                <button className="btn-danger" onClick={() => void onRemove(t.uri).then(() => setConfirm(null))}>
                  Remove
                </button>
                <button className="btn-ghost" onClick={() => setConfirm(null)}>
                  Keep
                </button>
              </div>
            ) : (
              <button className="icon-btn icon-btn-quiet" aria-label={`Remove ${t.name}`} onClick={() => setConfirm(t.uri)}>
                <Icon name="trash" size={20} />
              </button>
            )}
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  )
}

// ── Wishes ──────────────────────────────────────────────────────────────────

function Wishes({ onFind }: { onFind: (q: string) => void }) {
  const s = useSettings()
  if (!s.wishes.length) {
    return (
      <div className="empty-parent">
        <p className="muted">
          No wishes yet. When {s.kidName || 'your kiddo'} taps the ⭐ and wishes for a song, it shows up here.
        </p>
      </div>
    )
  }
  return (
    <ul className="rows">
      {s.wishes.map((w) => (
        <li key={w.id} className="row">
          <span className="wish-star">⭐</span>
          <div className="row-text">
            <span className="row-title">{w.text}</span>
            <span className="row-sub">{new Date(w.at).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}</span>
          </div>
          <button className="btn-add" onClick={() => onFind(w.text)}>
            <Icon name="search" size={18} /> Find it
          </button>
          <button
            className="icon-btn icon-btn-quiet"
            aria-label="Dismiss wish"
            onClick={() => updateSettings((x) => ({ wishes: x.wishes.filter((y) => y.id !== w.id) }))}
          >
            <Icon name="x" size={18} />
          </button>
        </li>
      ))}
    </ul>
  )
}

// ── Settings ────────────────────────────────────────────────────────────────

function Settings({ me }: { me: Me | null }) {
  const s = useSettings()
  const [pinOpen, setPinOpen] = useState(false)
  const [first, setFirst] = useState<string | null>(null)
  const [name, setName] = useState(s.kidName)

  return (
    <section className="settings">
      <div className="set-card">
        <h3>Name</h3>
        <input
          className="field"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() && updateSettings({ kidName: name.trim() })}
          maxLength={24}
        />
      </div>

      <div className="set-card">
        <h3>Music buddy</h3>
        <BuddyPicker />
      </div>

      <div className="set-card">
        <h3>Listening rules</h3>
        <Toggle
          label="Hide explicit songs"
          hint="Explicit songs won't show up when you search."
          on={s.hideExplicit}
          onChange={(v) => updateSettings({ hideExplicit: v })}
        />
        <div className="set-row">
          <div>
            <b>Loudest volume</b>
            <p className="muted small">The volume slider can't go past this. (Phones and iPads use their own volume buttons.)</p>
          </div>
          <div className="vol-cap">
            <input
              type="range"
              min={10}
              max={100}
              step={5}
              value={s.maxVolume}
              style={{ ['--v' as string]: `${((s.maxVolume - 10) / 90) * 100}%` }}
              onChange={(e) => {
                const v = Number(e.target.value)
                updateSettings({ maxVolume: v })
                setMaxVolume(v)
              }}
              aria-label="Loudest volume"
            />
            <b>{s.maxVolume}%</b>
          </div>
        </div>
        <Toggle
          label="Cozy night colors"
          hint="Softer, darker colors from 7:30 pm to 6:30 am."
          on={s.nightColors}
          onChange={(v) => updateSettings({ nightColors: v })}
        />
      </div>

      <div className="set-card">
        <h3>Grown-up PIN</h3>
        <button className="btn-soft" onClick={() => { setFirst(null); setPinOpen(true) }}>
          Change PIN
        </button>
      </div>

      <div className="set-card">
        <h3>Spotify</h3>
        <p className="muted">
          Signed in as <b>{me?.display_name ?? me?.id ?? '…'}</b>
          {me?.product && me.product !== 'premium' && (
            <span className="error-note block">This account isn't Premium, so songs can't play inside Bop Box.</span>
          )}
        </p>
        <button
          className="btn-ghost danger"
          onClick={() => {
            logout()
            window.location.reload()
          }}
        >
          Sign out of Spotify
        </button>
      </div>

      <Sheet open={pinOpen} onClose={() => setPinOpen(false)} title="New PIN">
        <PinPad
          key={first ? 'b' : 'a'}
          title={first ? 'Once more' : 'Pick 4 new numbers'}
          onComplete={async (pin) => {
            if (!first) {
              setFirst(pin)
              return true
            }
            if (pin !== first) {
              setFirst(null)
              return false
            }
            updateSettings({ pinHash: await hashPin(pin) })
            setPinOpen(false)
            toast('PIN updated', '🔒')
            return true
          }}
        />
      </Sheet>
    </section>
  )
}

function Toggle({ label, hint, on, onChange }: { label: string; hint?: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="set-row">
      <div>
        <b>{label}</b>
        {hint && <p className="muted small">{hint}</p>}
      </div>
      <button role="switch" aria-checked={on} aria-label={label} className={`switch ${on ? 'is-on' : ''}`} onClick={() => onChange(!on)}>
        <motion.span layout className="switch-knob" transition={{ type: 'spring', stiffness: 600, damping: 34 }} />
      </button>
    </div>
  )
}
