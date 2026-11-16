import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { PinPad } from '../components/PinPad'
import { Icon, Sheet, useExitSafe } from '../components/ui'
import { setMaxVolume } from '../lib/player'
import {
  art,
  artistNames,
  beginLogin,
  disconnectGrownup,
  kidHasOwnAccount,
  deviceSignedIn,
  isGrownupConnected,
  getAlbumTracks,
  getPlaylistSongs,
  getTrack,
  logout,
  parseSpotifyLink,
  searchTracks,
  type Me,
  type PlaylistInfo,
  type Song,
  type Track,
  forgetKidAccount,
} from '../lib/spotify'
import { isBopBoxPlaylist, type Library } from '../lib/library'
import { clearLog, logEvent, readLog } from '../lib/log'
import { hashPin, removeKid, setActiveKid, updateSettings, useSettings } from '../lib/store'
import { Mascot } from '../components/Mascot'
import { toast } from '../lib/toast'
import { BuddyPicker } from './Setup'

type Tab = 'playlists' | 'add' | 'list' | 'wishes' | 'settings'

type Props = {
  me: Me | null
  songs: Song[]
  playlists: PlaylistInfo[]
  grownup: Library['grownup']
  pickedId?: string
  onApprovedChange: () => void
  onAddKid: () => void
  onRenameKid: (name: string) => void
  onAdd: (tracks: Track[]) => Promise<void>
  onRemove: (uri: string) => Promise<void>
  onClose: () => void
  initialTab?: Tab
}

export function ParentPanel({ me, songs, playlists, grownup, pickedId, onApprovedChange, onAddKid, onRenameKid, onAdd, onRemove, onClose, initialTab = 'playlists' }: Props) {
  const s = useSettings()
  const [tab, setTab] = useState<Tab>(initialTab)
  const [query, setQuery] = useState('')
  const name = s.kidName || 'Kiddo'
  const exitSafe = useExitSafe()

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'playlists', label: 'Playlists', count: s.approvedPlaylists.length },
    { id: 'add', label: 'Add songs' },
    { id: 'list', label: 'Picked for you', count: songs.length },
    { id: 'wishes', label: 'Wishes', count: s.wishes.length },
    { id: 'settings', label: 'Settings' },
  ]

  return (
    <motion.div
      style={exitSafe}
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

      <div className="kid-switch" role="radiogroup" aria-label="Which kid">
        {s.kids.map((k) => (
          <button
            key={k.id}
            role="radio"
            aria-checked={k.id === s.kidId}
            data-theme={k.theme}
            className={`kid-chip ${k.id === s.kidId ? 'is-on' : ''}`}
            onClick={() => setActiveKid(k.id)}
          >
            <Mascot size={34} accessory={k.accessory} />
            {k.kidName}
          </button>
        ))}
        <button className="kid-chip kid-chip-add" onClick={onAddKid}>
          <Icon name="plus" size={16} /> Add a kid
        </button>
      </div>

      <nav className="tabs" role="tablist">
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={`tab ${tab === t.id ? 'is-on' : ''}`} onClick={() => setTab(t.id)}>
            <span>{t.label}</span>
            {!!t.count && <span className="tab-count">{t.count}</span>}
            {tab === t.id && <motion.span layoutId="tab-pill" className="tab-pill" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
          </button>
        ))}
      </nav>

      <div className="parent-body">
        {tab === 'playlists' && (
          <ApprovedPlaylists me={me} playlists={playlists} grownup={grownup} pickedId={pickedId} onChange={onApprovedChange} onAddSongs={() => setTab('add')} />
        )}
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
        {tab === 'settings' && <Settings key={s.kidId} me={me} onRenameKid={onRenameKid} />}
      </div>
    </motion.div>
  )
}

// ── Approved playlists ──────────────────────────────────────────────────────

function ApprovedPlaylists({
  me,
  playlists,
  grownup,
  pickedId,
  onChange,
  onAddSongs,
}: {
  me: Me | null
  playlists: PlaylistInfo[]
  grownup: Library['grownup']
  pickedId?: string
  onChange: () => void
  onAddSongs: () => void
}) {
  const s = useSettings()
  const name = s.kidName || 'your kiddo'
  const approved = new Set(s.approvedPlaylists)
  const yours = playlists.filter((p) => !isBopBoxPlaylist(p, pickedId))
  const readable = yours.filter((p) => p.owner.id === me?.id || p.collaborative)
  const others = yours.length - readable.length
  const grownupName = grownup?.me.display_name || 'your'
  const [confirmOff, setConfirmOff] = useState(false)

  const toggle = (id: string) => {
    updateSettings((st) => ({
      approvedPlaylists: st.approvedPlaylists.includes(id)
        ? st.approvedPlaylists.filter((x) => x !== id)
        : [...st.approvedPlaylists, id],
    }))
    onChange()
  }

  const row = (p: PlaylistInfo, owner?: string) => (
    <li key={p.id} className="row">
      {p.images[0] ? <img className="row-art" src={p.images[0].url} alt="" loading="lazy" /> : <span className="wish-star">🎵</span>}
      <div className="row-text">
        <span className="row-title">{p.name}</span>
        <span className="row-sub">
          {p.total} {p.total === 1 ? 'song' : 'songs'}
          {p.owner.id !== owner && ' · collaborative'}
        </span>
      </div>
      <button
        role="switch"
        aria-checked={approved.has(p.id)}
        aria-label={`Let ${name} play ${p.name}`}
        className={`switch ${approved.has(p.id) ? 'is-on' : ''}`}
        onClick={() => toggle(p.id)}
      >
        <motion.span layout className="switch-knob" transition={{ type: 'spring', stiffness: 600, damping: 34 }} />
      </button>
    </li>
  )

  return (
    <section>
      <p className="lead">
        Turn on the playlists {name} can listen to. Each one becomes a shelf in {name}'s music box, and stays in sync:
        add or remove songs in Spotify and Bop Box follows.
      </p>
      {s.hideExplicit && <p className="muted small">Explicit songs stay hidden, even inside these playlists.</p>}

      {grownup ? (
        <>
          <div className="list-head">
            <h3>From {grownupName === 'your' ? 'your' : `${grownupName}'s`} Spotify</h3>
            {confirmOff ? (
              <span className="confirm">
                <button
                  className="btn-danger"
                  onClick={() => {
                    disconnectGrownup()
                    setConfirmOff(false)
                    onChange()
                  }}
                >
                  Disconnect
                </button>
                <button className="btn-ghost" onClick={() => setConfirmOff(false)}>
                  Keep
                </button>
              </span>
            ) : (
              <button className="link-btn inline" onClick={() => setConfirmOff(true)}>
                Disconnect
              </button>
            )}
          </div>
          <ul className="rows">{grownup.playlists.filter((p) => !isBopBoxPlaylist(p)).map((p) => row(p, grownup.me.id))}</ul>
          {grownup.playlists.length === 0 && <p className="muted center">No playlists in that account yet.</p>}
        </>
      ) : (
        <div className="connect-card">
          <span className="connect-icon">
            <Icon name="link" size={26} />
          </span>
          <div>
            <b>Use playlists from your own Spotify</b>
            <p>
              Already have playlists for the kids in another account? Connect it once on this device. Bop Box can
              only <em>read</em> its playlists. It can't play, change or delete anything there.
            </p>
            <button className="btn-candy" onClick={() => void beginLogin('grownup')}>
              Connect a grown-up's Spotify
            </button>
          </div>
        </div>
      )}

      <div className="list-head">
        <h3>From this device's account{me?.display_name ? ` (${me.display_name})` : ''}</h3>
      </div>
      <ul className="rows">
        <li className="row">
          <span className="wish-star">✨</span>
          <div className="row-text">
            <span className="row-title">Picked for you</span>
            <span className="row-sub">Songs you add one at a time in Bop Box. Always on.</span>
          </div>
          <button className="btn-add" onClick={onAddSongs}>
            <Icon name="plus" size={18} /> Add songs
          </button>
        </li>
        {readable.map((p) => row(p, me?.id))}
      </ul>
      {others > 0 && (
        <p className="muted small center">
          {others} playlist{others === 1 ? '' : 's'} made by other people {others === 1 ? 'is' : 'are'} hidden. Spotify
          only lets apps read playlists you made. To use one, copy its songs into a playlist of your own.
        </p>
      )}
    </section>
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
              <b>Or use whole playlists</b>
              <p>Turn on your own playlists in the Playlists tab. They stay in sync with Spotify.</p>
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

function Settings({ me, onRenameKid }: { me: Me | null; onRenameKid: (name: string) => void }) {
  const s = useSettings()
  const [pinOpen, setPinOpen] = useState(false)
  const [first, setFirst] = useState<string | null>(null)
  const [name, setName] = useState(s.kidName)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const ownAccount = !!s.ownAccount || kidHasOwnAccount(s.kidId)

  return (
    <section className="settings">
      <p className="eyebrow">Just for {s.kidName}</p>

      <div className="set-card">
        <h3>{s.kidName}'s Spotify account</h3>
        <p className="muted">
          {ownAccount ? 'Listens with their own account: ' : "Shares this device's account: "}
          <b>{me?.display_name ?? me?.id ?? '…'}</b>
          {me?.product && me.product !== 'premium' && (
            <span className="error-note block">This account isn't Premium, so songs can't play inside Bop Box.</span>
          )}
        </p>
        {!ownAccount && (
          <p className="muted small">
            Give {s.kidName} their own account so they can listen at the same time as everyone else.
          </p>
        )}
        <button className="btn-soft" onClick={() => s.kidId && void beginLogin('main', s.kidId)}>
          {ownAccount ? 'Switch account' : `Sign in with ${s.kidName}'s own Spotify`}
        </button>
        {ownAccount && deviceSignedIn() && (
          <button
            className="link-btn"
            onClick={() => {
              if (!s.kidId) return
              forgetKidAccount(s.kidId)
              updateSettings({ ownAccount: false })
              logEvent(`${s.kidName} switched back to this device's account`)
              window.location.reload()
            }}
          >
            Use this device's account instead
          </button>
        )}
      </div>
      <div className="set-card">
        <h3>Name</h3>
        <input
          className="field"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            const n = name.trim()
            if (!n || n === s.kidName) return
            onRenameKid(n)
          }}
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
          hint="Explicit songs are hidden everywhere in Bop Box, even inside approved playlists."
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
      </div>

      {s.kids.length > 1 && (
        <div className="set-card">
          <h3>Remove {s.kidName}</h3>
          <p className="muted small">
            Takes {s.kidName} off this device. Their songs and mixes stay in your Spotify, and you can add them back any time.
          </p>
          {confirmRemove ? (
            <div className="confirm">
              <button className="btn-danger" onClick={() => s.kidId && removeKid(s.kidId)}>
                Remove {s.kidName}
              </button>
              <button className="btn-ghost" onClick={() => setConfirmRemove(false)}>
                Keep
              </button>
            </div>
          ) : (
            <button className="btn-soft" onClick={() => setConfirmRemove(true)}>
              Remove from this device
            </button>
          )}
        </div>
      )}

      <p className="eyebrow set-divider">For everyone on this device</p>

      <div className="set-card">
        <h3>Colors</h3>
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
        <h3>Sign out</h3>
        <p className="muted small">Signs every Spotify account out of Bop Box on this device.</p>
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

      <Troubleshooting />

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

function Troubleshooting() {
  const s = useSettings()
  const [open, setOpen] = useState(false)
  const [, bump] = useState(0)
  const entries = readLog().slice().reverse()
  const fmt = (t: number) =>
    new Date(t).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  return (
    <div className="set-card">
      <h3>Troubleshooting</h3>
      {!open ? (
        <button className="btn-soft" onClick={() => setOpen(true)}>
          Show sign-in details
        </button>
      ) : (
        <>
          <ul className="diag">
            <li>Shared device account: <b>{deviceSignedIn() ? 'signed in' : 'not signed in'}</b></li>
            {s.kids.map((k) => (
              <li key={k.id}>
                {k.kidName}: <b>{k.ownAccount || kidHasOwnAccount(k.id) ? (kidHasOwnAccount(k.id) ? 'own account, signed in' : 'own account, NOT signed in') : 'uses shared account'}</b>
              </li>
            ))}
            <li>Grown-up playlists: <b>{isGrownupConnected() ? 'connected' : 'not connected'}</b></li>
          </ul>
          <p className="muted small">Recent events (newest first):</p>
          {entries.length ? (
            <ol className="diag-log">
              {entries.slice(0, 20).map((e, i) => (
                <li key={i}>
                  <span>{fmt(e.at)}</span> {e.what}
                </li>
              ))}
            </ol>
          ) : (
            <p className="muted small">Nothing yet.</p>
          )}
          <button className="btn-ghost" onClick={() => { clearLog(); bump((n) => n + 1) }}>
            Clear log
          </button>
        </>
      )}
    </div>
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
