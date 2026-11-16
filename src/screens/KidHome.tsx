import { AnimatePresence, motion } from 'motion/react'
import { memo, useEffect, useMemo, useState } from 'react'
import type { MixOps } from '../App'
import { Mascot } from '../components/Mascot'
import { Burst, buzz, Equalizer, Icon, Sheet, useTick } from '../components/ui'
import { livePosition, playSongs, skip, togglePlay, usePlayer } from '../lib/player'
import type { Mix, Shelf } from '../lib/library'
import { art, artistNames, type Song } from '../lib/spotify'
import { toggleFavorite, updateSettings, useSettings } from '../lib/store'
import { toast } from '../lib/toast'
import { AddSongsSheet, MixSheet, ReorderList, themeColor } from './Mixes'

const TILTS = [-2.4, 1.8, -1.2, 2.6, -2, 1.2, -2.8, 2.2]
const NEW_MS = 4 * 24 * 3600 * 1000

function greeting() {
  const h = new Date().getHours()
  if (h < 5 || h >= 20) return 'Cozy night'
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

type Sel = { kind: 'all' } | { kind: 'favs' } | { kind: 'shelf'; id: string } | { kind: 'mix'; id: string }

type Props = {
  songs: Song[]
  shelves: Shelf[]
  mixes: Mix[]
  mixOps: MixOps
  loading: boolean
  onOpenPlayer: () => void
  onGrownUps: () => void
  onSwitchKid?: () => void
}

export function KidHome({ songs, shelves, mixes, mixOps, loading, onOpenPlayer, onGrownUps, onSwitchKid }: Props) {
  const s = useSettings()
  const p = usePlayer()
  const [sel, setSel] = useState<Sel>({ kind: 'all' })
  const [burst, setBurst] = useState(0)
  const [wishOpen, setWishOpen] = useState(false)
  const [mixSheet, setMixSheet] = useState<null | 'new' | 'edit'>(null)
  const [adding, setAdding] = useState(false)
  const [moving, setMoving] = useState(false)

  const favSet = useMemo(() => new Set(s.favorites), [s.favorites])
  const shelf = sel.kind === 'shelf' ? shelves.find((x) => x.id === sel.id) : undefined
  const mix = sel.kind === 'mix' ? mixes.find((x) => x.id === sel.id) ?? null : null

  // If the selected shelf/mix disappears (un-approved, deleted), fall back to All.
  useEffect(() => {
    if ((sel.kind === 'shelf' && !shelf) || (sel.kind === 'mix' && !mix)) setSel({ kind: 'all' })
  }, [sel, shelf, mix])
  useEffect(() => setMoving(false), [sel])

  const shown = useMemo(() => {
    if (sel.kind === 'favs') return songs.filter((x) => favSet.has(x.uri))
    if (shelf) return shelf.songs
    if (mix) return mix.songs
    return songs
  }, [sel.kind, songs, favSet, shelf, mix])

  const title =
    sel.kind === 'favs' ? 'My favorites' : shelf ? shelfName(shelf) : mix ? mix.name : 'All my songs'
  const titleIcon = sel.kind === 'favs' ? '💖' : mix ? mix.emoji : shelf ? '🎵' : '🎶'

  const playingUri = p.track?.uri
  const isPlaying = !p.paused && !!p.track

  const play = async (list: Song[], i: number) => {
    buzz()
    const ok = await playSongs(list, i)
    if (ok) onOpenPlayer()
  }

  const surprise = () => {
    const pool = shown.length ? shown : songs
    if (!pool.length) return
    setBurst((b) => b + 1)
    void play([...pool].sort(() => Math.random() - 0.5), 0)
  }

  const pick = (next: Sel) => {
    buzz()
    setSel(next)
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
          {onSwitchKid && (
            <button className="icon-btn" aria-label="Switch who's listening" onClick={onSwitchKid}>
              <Icon name="users" />
            </button>
          )}
          <button className="icon-btn" aria-label="Wish for a song" onClick={() => setWishOpen(true)}>
            <Icon name="star" />
          </button>
          <button className="icon-btn icon-btn-quiet" aria-label="Grown-ups" onClick={onGrownUps}>
            <Icon name="lock" size={20} />
          </button>
        </div>
      </header>

      <section className="rail-section" aria-label="Music shelves">
        <h2 className="rail-label">Music shelves</h2>
        <div className="rail">
          <Tile label="All songs" count={songs.length} on={sel.kind === 'all'} onClick={() => pick({ kind: 'all' })} glyph="🎶" bg="var(--accent)" />
          <Tile label="Favorites" count={songs.filter((x) => favSet.has(x.uri)).length} on={sel.kind === 'favs'} onClick={() => pick({ kind: 'favs' })} glyph="💖" bg="#FF7FAE" />
          {shelves.map((sh) => (
            <Tile
              key={sh.id}
              label={shelfName(sh)}
              count={sh.songs.length}
              on={sel.kind === 'shelf' && sel.id === sh.id}
              onClick={() => pick({ kind: 'shelf', id: sh.id })}
              image={sh.images[0]?.url || (sh.songs[0] ? art(sh.songs[0], 'sm') : '')}
            />
          ))}
        </div>
      </section>

      <section className="rail-section" aria-label="My mixes">
        <h2 className="rail-label">My mixes</h2>
        <div className="rail">
          {mixes.map((m) => (
            <Tile
              key={m.id}
              label={m.name}
              count={m.songs.length}
              on={sel.kind === 'mix' && sel.id === m.id}
              onClick={() => pick({ kind: 'mix', id: m.id })}
              glyph={m.emoji}
              bg={themeColor(m.color)}
            />
          ))}
          <button className="tile tile-new" onClick={() => setMixSheet('new')} disabled={!songs.length}>
            <span className="tile-art">
              <Icon name="plus" size={40} />
            </span>
            <span className="tile-label">Make a mix</span>
          </button>
        </div>
      </section>

      <div className="view-head">
        <AnimatePresence mode="popLayout">
          <motion.h2
            key={title}
            className="view-title"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ type: 'spring', stiffness: 500, damping: 34 }}
          >
            <span className="view-emoji">{titleIcon}</span> {title}
          </motion.h2>
        </AnimatePresence>
        <div className="view-actions">
          <span className="burst-anchor">
            <button className="btn-candy surprise" onClick={surprise} disabled={!shown.length}>
              <Icon name="dice" size={24} /> Surprise me!
            </button>
            <Burst fire={burst} />
          </span>
          {mix && (
            <>
              <button className="btn-soft" onClick={() => setAdding(true)}>
                <Icon name="plus" size={20} /> Add songs
              </button>
              {mix.songs.length > 1 && (
                <button className={`btn-soft ${moving ? 'is-on' : ''}`} onClick={() => setMoving((m) => !m)}>
                  <Icon name={moving ? 'check' : 'move'} size={20} /> {moving ? 'Done' : 'Move'}
                </button>
              )}
              <button className="icon-btn" aria-label="Change this mix" onClick={() => setMixSheet('edit')}>
                <Icon name="pencil" size={20} />
              </button>
            </>
          )}
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
      ) : mix && moving ? (
        <ReorderList mix={mix} onReorder={(list) => void mixOps.reorder(mix.id, list)} onRemove={(uri) => void mixOps.removeSong(mix.id, uri)} />
      ) : shown.length === 0 ? (
        <div className="empty">
          <Mascot size={130} mood="wow" accessory={s.accessory} />
          {mix ? (
            <>
              <h2 className="h2">Your mix is empty!</h2>
              <p className="muted">Pick some songs to put in it.</p>
              <button className="btn-candy" onClick={() => setAdding(true)}>
                <Icon name="plus" /> Add songs
              </button>
            </>
          ) : sel.kind === 'favs' ? (
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
        <motion.div key={JSON.stringify(sel)} className="grid" initial="hide" animate="show" variants={{ show: { transition: { staggerChildren: 0.03 } } }}>
          {shown.map((song, i) => (
            <SongCard
              key={song.uri}
              song={song}
              tilt={TILTS[i % TILTS.length]}
              fav={favSet.has(song.uri)}
              playing={!!playingUri && (playingUri === song.uri || playingUri === song.linked_from?.uri)}
              isPlaying={isPlaying}
              onPlay={() => void play(shown, i)}
            />
          ))}
        </motion.div>
      )}

      <AnimatePresence>{p.track && <MiniPlayer onOpen={onOpenPlayer} />}</AnimatePresence>
      <WishSheet open={wishOpen} onClose={() => setWishOpen(false)} />
      <MixSheet
        open={mixSheet !== null}
        mix={mixSheet === 'edit' ? mix : null}
        onClose={() => setMixSheet(null)}
        onSave={async (name, emoji, color) => {
          if (mixSheet === 'edit' && mix) {
            setMixSheet(null)
            await mixOps.edit(mix.id, name, emoji, color)
            return
          }
          setMixSheet(null)
          const made = await mixOps.create(name, emoji, color)
          if (made) {
            setBurst((b) => b + 1)
            setSel({ kind: 'mix', id: made.id })
            toast(`Ta-da! “${name}” is ready`, emoji)
            setTimeout(() => setAdding(true), 350)
          }
        }}
        onDelete={
          mix
            ? () => {
                setMixSheet(null)
                setSel({ kind: 'all' })
                void mixOps.remove(mix.id)
              }
            : undefined
        }
      />
      <AddSongsSheet
        open={adding}
        onClose={() => setAdding(false)}
        mix={mix}
        songs={songs}
        shelves={shelves}
        onToggle={(song, inMix) => void (inMix ? mixOps.removeSong(mix!.id, song.uri) : mixOps.addSong(mix!.id, song))}
      />
    </main>
  )
}

const shelfName = (sh: Shelf) => (sh.name === 'Picked for you' ? 'Picked for you ✨' : sh.name)

function Tile({
  label,
  count,
  on,
  onClick,
  glyph,
  bg,
  image,
}: {
  label: string
  count: number
  on: boolean
  onClick: () => void
  glyph?: string
  bg?: string
  image?: string
}) {
  return (
    <motion.button className={`tile ${on ? 'is-on' : ''}`} onClick={onClick} whileTap={{ scale: 0.92 }} aria-pressed={on}>
      <span className="tile-art" style={bg ? { ['--tile' as string]: bg } : undefined}>
        {image ? <img src={image} alt="" draggable={false} /> : <span className="tile-glyph">{glyph}</span>}
        <span className="tile-count">{count}</span>
      </span>
      <span className="tile-label">{label}</span>
    </motion.button>
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
