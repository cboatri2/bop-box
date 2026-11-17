import { motion, Reorder, useDragControls } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { buzz, Icon, Sheet } from '../components/ui'
import type { Mix, Shelf } from '../lib/library'
import { art, artistNames, type Song } from '../lib/spotify'
import type { ThemeName } from '../lib/store'
import { THEMES } from './Setup'

// Lorelei's picks first (she asked for these!), then the originals.
export const MIX_EMOJI = [
  '🎧', '😁', '🎶', '😊', '😍', '😎', '👾', '🎄', '🎁',
  '🦄', '🌈', '💃', '🌙', '⭐', '🐶', '🐱', '🦕', '🍦', '🎉', '🧚', '🚀', '🌸', '🎸', '🐠',
]
const NAME_IDEAS = ['Dance Party', 'Car Songs', 'Sleepy Songs', 'Happy Songs', 'Sing Along', 'My Faves']

export const themeColor = (t: ThemeName) => THEMES.find((x) => x.id === t)?.color ?? '#FF6FA8'

// ── Make / edit a mix ───────────────────────────────────────────────────────

export function MixSheet({
  open,
  onClose,
  mix,
  onSave,
  onDelete,
}: {
  open: boolean
  onClose: () => void
  mix?: Mix | null
  onSave: (name: string, emoji: string, color: ThemeName) => void
  onDelete?: () => void
}) {
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState(MIX_EMOJI[0])
  const [color, setColor] = useState<ThemeName>('grape')
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(mix?.name ?? '')
    setEmoji(mix?.emoji ?? MIX_EMOJI[Math.floor(Math.random() * MIX_EMOJI.length)])
    setColor(mix?.color ?? THEMES[Math.floor(Math.random() * THEMES.length)].id)
    setConfirmDelete(false)
  }, [open, mix])

  return (
    <Sheet open={open} onClose={onClose} title={mix ? 'Change my mix' : 'Make a mix!'}>
      <div className="mix-preview" style={{ ['--mix' as string]: themeColor(color) }}>
        <motion.span key={emoji} initial={{ scale: 0.4, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 500, damping: 14 }}>
          {emoji}
        </motion.span>
      </div>
      <form
        className="mix-form"
        onSubmit={(e) => {
          e.preventDefault()
          if (!name.trim()) return
          onSave(name.trim(), emoji, color)
        }}
      >
        <input className="field mix-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name your mix" maxLength={30} aria-label="Mix name" />
        {!mix && (
          <div className="idea-chips">
            {NAME_IDEAS.map((n) => (
              <button type="button" key={n} className="idea" onClick={() => setName(n)}>
                {n}
              </button>
            ))}
          </div>
        )}
        <div className="emoji-grid" role="radiogroup" aria-label="Sticker">
          {MIX_EMOJI.map((em) => (
            <button type="button" key={em} role="radio" aria-checked={em === emoji} className={`emoji-opt ${em === emoji ? 'is-on' : ''}`} onClick={() => { buzz(); setEmoji(em) }}>
              {em}
            </button>
          ))}
        </div>
        <div className="swatches" role="radiogroup" aria-label="Color">
          {THEMES.map((t) => (
            <button
              type="button"
              key={t.id}
              role="radio"
              aria-checked={color === t.id}
              aria-label={t.label}
              className={`swatch ${color === t.id ? 'is-on' : ''}`}
              style={{ background: t.color }}
              onClick={() => setColor(t.id)}
            >
              {color === t.id && <Icon name="check" size={22} />}
            </button>
          ))}
        </div>
        <button className="btn-candy btn-lg" disabled={!name.trim()}>
          {mix ? 'Save' : <><Icon name="plus" /> Make my mix</>}
        </button>
      </form>
      {mix && onDelete && (
        confirmDelete ? (
          <div className="forgot">
            <p className="muted small">Delete “{mix.name}”? The songs stay in your music box.</p>
            <button className="btn-danger" onClick={onDelete}>Yes, delete it</button>{' '}
            <button className="btn-ghost" onClick={() => setConfirmDelete(false)}>Keep it</button>
          </div>
        ) : (
          <button className="link-btn" onClick={() => setConfirmDelete(true)}>
            Delete this mix
          </button>
        )
      )}
    </Sheet>
  )
}

// ── Pick songs for a mix (only approved songs are ever offered) ─────────────

export function AddSongsSheet({
  open,
  onClose,
  mix,
  songs,
  shelves,
  onToggle,
}: {
  open: boolean
  onClose: () => void
  mix: Mix | null
  songs: Song[]
  shelves: Shelf[]
  onToggle: (song: Song, inMix: boolean) => void
}) {
  const [shelf, setShelf] = useState<string>('all')
  const [q, setQ] = useState('')
  useEffect(() => {
    if (open) {
      setShelf('all')
      setQ('')
    }
  }, [open])

  const inMix = useMemo(() => new Set(mix?.songs.map((s) => s.uri)), [mix])
  const list = useMemo(() => {
    const base = shelf === 'all' ? songs : shelves.find((s) => s.id === shelf)?.songs ?? []
    const needle = q.trim().toLowerCase()
    return needle ? base.filter((s) => `${s.name} ${artistNames(s)}`.toLowerCase().includes(needle)) : base
  }, [songs, shelves, shelf, q])

  if (!mix) return null
  return (
    <Sheet open={open} onClose={onClose} title={`Add songs to ${mix.emoji} ${mix.name}`} className="sheet-tall">
      <label className="search search-sm">
        <Icon name="search" size={20} />
        <input className="search-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a song" aria-label="Find a song" />
      </label>
      {shelves.length > 1 && (
        <div className="idea-chips left">
          <button className={`idea ${shelf === 'all' ? 'is-on' : ''}`} onClick={() => setShelf('all')}>All</button>
          {shelves.map((s) => (
            <button key={s.id} className={`idea ${shelf === s.id ? 'is-on' : ''}`} onClick={() => setShelf(s.id)}>
              {s.name}
            </button>
          ))}
        </div>
      )}
      <ul className="pick-list">
        {list.map((s) => {
          const on = inMix.has(s.uri)
          return (
            <li key={s.uri}>
              <button
                className={`pick ${on ? 'is-on' : ''}`}
                onClick={() => {
                  buzz()
                  onToggle(s, on)
                }}
                aria-pressed={on}
              >
                <img src={art(s, 'sm')} alt="" loading="lazy" />
                <span className="pick-text">
                  <b>{s.name}</b>
                  <span>{artistNames(s)}</span>
                </span>
                <motion.span className="pick-toggle" key={String(on)} initial={{ scale: 0.5 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 600, damping: 15 }}>
                  <Icon name={on ? 'check' : 'plus'} size={22} />
                </motion.span>
              </button>
            </li>
          )
        })}
        {list.length === 0 && <p className="muted center">No songs found.</p>}
      </ul>
      <button className="btn-candy btn-lg done-btn" onClick={onClose}>
        Done
      </button>
    </Sheet>
  )
}

// ── Drag to reorder / take songs out ────────────────────────────────────────

export function ReorderList({
  mix,
  onReorder,
  onRemove,
}: {
  mix: Mix
  onReorder: (songs: Song[]) => void
  onRemove: (uri: string) => void
}) {
  const [items, setItems] = useState(mix.songs)
  useEffect(() => setItems(mix.songs), [mix.songs])
  return (
    <Reorder.Group axis="y" values={items} onReorder={setItems} className="reorder" as="ul">
      {items.map((s) => (
        <ReorderRow key={s.uri} song={s} onDrop={() => onReorder(items)} onRemove={() => onRemove(s.uri)} />
      ))}
    </Reorder.Group>
  )
}

function ReorderRow({ song, onDrop, onRemove }: { song: Song; onDrop: () => void; onRemove: () => void }) {
  const controls = useDragControls()
  return (
    <Reorder.Item
      value={song}
      as="li"
      className="reorder-row"
      dragListener={false}
      dragControls={controls}
      onDragEnd={onDrop}
      whileDrag={{ scale: 1.04, boxShadow: '0 18px 30px -10px rgba(58,38,72,.35)' }}
    >
      <span className="grip" onPointerDown={(e) => controls.start(e)} aria-label="Drag to move">
        <Icon name="grip" size={24} />
      </span>
      <img src={art(song, 'sm')} alt="" />
      <span className="pick-text">
        <b>{song.name}</b>
        <span>{artistNames(song)}</span>
      </span>
      <button className="icon-btn take-out" aria-label={`Take ${song.name} out of this mix`} onClick={() => { buzz(); onRemove() }}>
        <Icon name="trash" size={20} />
      </button>
    </Reorder.Item>
  )
}
