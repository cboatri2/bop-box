import { AnimatePresence, motion } from 'motion/react'
import { memo, useMemo, useState } from 'react'
import { Mascot } from '../components/Mascot'
import { Burst, buzz, Equalizer, Icon, Sheet, useTick } from '../components/ui'
import { livePosition, playSongs, skip, togglePlay, usePlayer } from '../lib/player'
import { art, artistNames, type Song } from '../lib/spotify'
import { toggleFavorite, updateSettings, useSettings } from '../lib/store'
import { toast } from '../lib/toast'

const TILTS = [-2.4, 1.8, -1.2, 2.6, -2, 1.2, -2.8, 2.2]
const NEW_MS = 4 * 24 * 3600 * 1000

function greeting() {
  const h = new Date().getHours()
  if (h < 5 || h >= 20) return 'Cozy night'
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

type Props = {
  songs: Song[]
  loading: boolean
  onOpenPlayer: () => void
  onGrownUps: () => void
}

export function KidHome({ songs, loading, onOpenPlayer, onGrownUps }: Props) {
  const s = useSettings()
  const p = usePlayer()
  const [filter, setFilter] = useState<'all' | 'favs'>('all')
  const [burst, setBurst] = useState(0)
  const [wishOpen, setWishOpen] = useState(false)

  const favSet = useMemo(() => new Set(s.favorites), [s.favorites])
  const shown = useMemo(
    () => (filter === 'favs' ? songs.filter((x) => favSet.has(x.uri)) : songs),
    [songs, filter, favSet],
  )
  const playingUri = p.track?.uri
  const isPlaying = !p.paused && !!p.track

  const play = async (list: Song[], i: number) => {
    buzz()
    const ok = await playSongs(list, i)
    if (ok) onOpenPlayer()
  }

  const surprise = () => {
    if (!songs.length) return
    setBurst((b) => b + 1)
    const pool = shown.length ? shown : songs
    const shuffled = [...pool].sort(() => Math.random() - 0.5)
    void play(shuffled, 0)
  }

  return (
    <main className="kid">
      <header className="kid-header">
        <Mascot size={84} accessory={s.accessory} bop={isPlaying} notes={isPlaying} mood={isPlaying ? 'singing' : 'happy'} />
        <div className="kid-hello">
          <h1 className="hello">
            {greeting()}, <span className="hello-name">{s.kidName}!</span>
          </h1>
          <p className="hello-sub">What do you want to listen to?</p>
        </div>
        <div className="corner-btns">
          <button className="icon-btn" aria-label="Wish for a song" onClick={() => setWishOpen(true)}>
            <Icon name="star" />
          </button>
          <button className="icon-btn icon-btn-quiet" aria-label="Grown-ups" onClick={onGrownUps}>
            <Icon name="lock" size={20} />
          </button>
        </div>
      </header>

      <div className="action-row">
        <span className="burst-anchor">
          <button className="btn-candy btn-lg surprise" onClick={surprise} disabled={!songs.length}>
            <Icon name="dice" size={26} /> Surprise me!
          </button>
          <Burst fire={burst} />
        </span>
        <div className="chips" role="tablist">
          <button role="tab" aria-selected={filter === 'all'} className={`chip ${filter === 'all' ? 'is-on' : ''}`} onClick={() => setFilter('all')}>
            <Icon name="music" size={18} /> All songs <b>{songs.length}</b>
          </button>
          <button role="tab" aria-selected={filter === 'favs'} className={`chip ${filter === 'favs' ? 'is-on' : ''}`} onClick={() => setFilter('favs')}>
            <Icon name="heart-fill" size={18} /> Favorites <b>{favSet.size}</b>
          </button>
        </div>
      </div>

      {loading && !songs.length ? (
        <div className="grid">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="song skeleton" style={{ ['--tilt' as string]: `${TILTS[i % TILTS.length]}deg` }}>
              <div className="song-art" />
              <div className="sk-line" />
              <div className="sk-line short" />
            </div>
          ))}
        </div>
      ) : shown.length === 0 ? (
        <div className="empty">
          <Mascot size={130} mood="wow" accessory={s.accessory} />
          {filter === 'favs' ? (
            <>
              <h2 className="h2">No favorites yet</h2>
              <p className="muted">Tap the little heart on a song you love!</p>
            </>
          ) : (
            <>
              <h2 className="h2">Your music box is empty!</h2>
              <p className="muted">Ask a grown-up to add some songs, or make a wish.</p>
              <button className="btn-candy" onClick={() => setWishOpen(true)}>
                <Icon name="star" /> Make a wish
              </button>
            </>
          )}
        </div>
      ) : (
        <motion.div className="grid" initial="hide" animate="show" variants={{ show: { transition: { staggerChildren: 0.035 } } }}>
          {shown.map((song, i) => (
            <SongCard
              key={song.uri}
              song={song}
              tilt={TILTS[i % TILTS.length]}
              fav={favSet.has(song.uri)}
              playing={playingUri === song.uri || playingUri === song.linked_from?.uri}
              isPlaying={isPlaying}
              onPlay={() => void play(shown, i)}
            />
          ))}
        </motion.div>
      )}

      <AnimatePresence>{p.track && <MiniPlayer onOpen={onOpenPlayer} />}</AnimatePresence>
      <WishSheet open={wishOpen} onClose={() => setWishOpen(false)} />
    </main>
  )
}

const SongCard = memo(function SongCard({
  song,
  tilt,
  fav,
  playing,
  isPlaying,
  onPlay,
}: {
  song: Song
  tilt: number
  fav: boolean
  playing: boolean
  isPlaying: boolean
  onPlay: () => void
}) {
  const isNew = Date.now() - new Date(song.addedAt).getTime() < NEW_MS
  return (
    <motion.div
      className={`song ${playing ? 'is-current' : ''}`}
      style={{ ['--tilt' as string]: `${tilt}deg` }}
      variants={{ hide: { opacity: 0, y: 24, scale: 0.9 }, show: { opacity: 1, y: 0, scale: 1 } }}
      transition={{ type: 'spring', stiffness: 380, damping: 26 }}
    >
      <button className="song-hit" onClick={onPlay} aria-label={`Play ${song.name} by ${artistNames(song)}`}>
        <span className="song-art">
          <img src={art(song)} alt="" loading="lazy" draggable={false} />
          {playing && (
            <span className="song-playing">
              <Equalizer playing={isPlaying} />
            </span>
          )}
        </span>
        <span className="song-title">{song.name}</span>
        <span className="song-artist">{artistNames(song)}</span>
      </button>
      {isNew && <span className="badge-new">NEW!</span>}
      <motion.button
        className={`heart ${fav ? 'is-on' : ''}`}
        aria-label={fav ? 'Remove from favorites' : 'Add to favorites'}
        aria-pressed={fav}
        whileTap={{ scale: 1.4 }}
        onClick={() => {
          buzz()
          toggleFavorite(song.uri)
        }}
      >
        <Icon name={fav ? 'heart-fill' : 'heart'} size={20} />
      </motion.button>
    </motion.div>
  )
})

function MiniPlayer({ onOpen }: { onOpen: () => void }) {
  const p = usePlayer()
  useTick(!p.paused, 500)
  if (!p.track) return null
  const pct = p.duration ? (livePosition(p) / p.duration) * 100 : 0
  return (
    <motion.div
      className="mini"
      initial={{ y: 120, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 120, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 400, damping: 32 }}
    >
      <button className="mini-main" onClick={onOpen} aria-label="Open player">
        <img className={`mini-art ${!p.paused ? 'is-spinning' : ''}`} src={art(p.track, 'sm')} alt="" />
        <span className="mini-text">
          <span className="mini-title">{p.track.name}</span>
          <span className="mini-artist">{artistNames(p.track)}</span>
        </span>
      </button>
      <button className="mini-btn mini-play" aria-label={p.paused ? 'Play' : 'Pause'} onClick={() => void togglePlay()}>
        <Icon name={p.paused ? 'play' : 'pause'} size={28} />
      </button>
      <button className="mini-btn" aria-label="Next song" onClick={() => void skip(1)}>
        <Icon name="next" size={24} />
      </button>
      <span className="mini-progress" style={{ width: `${pct}%` }} />
    </motion.div>
  )
}

function WishSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [text, setText] = useState('')
  return (
    <Sheet open={open} onClose={onClose} title="Wish for a song">
      <form
        className="wish-form"
        onSubmit={(e) => {
          e.preventDefault()
          if (!text.trim()) return
          updateSettings((s) => ({ wishes: [{ id: crypto.randomUUID(), text: text.trim(), at: Date.now() }, ...s.wishes] }))
          setText('')
          onClose()
          toast("Wish sent! A grown-up will see it.", '🌟')
        }}
      >
        <p className="muted">What song do you wish was in your music box?</p>
        <input className="field" value={text} onChange={(e) => setText(e.target.value)} placeholder="Song name or singer" maxLength={80} />
        <button className="btn-candy btn-lg" disabled={!text.trim()}>
          <Icon name="star" /> Send my wish
        </button>
      </form>
    </Sheet>
  )
}
