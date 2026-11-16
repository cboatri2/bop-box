import * as sp from './spotify'
import type { Image, Me, PlaylistInfo, Song } from './spotify'
import { getSettings, updateSettings, type ThemeName } from './store'

// One kid's music library:
//   • "Picked for you": the kid's own Bop Box playlist that songs get added to one at a time
//   • shelves: grown-up playlists switched on for this kid in the grown-up corner
//   • mixes: playlists this kid made, which may only ever play approved songs

export type Shelf = { id: string; name: string; images: Image[]; songs: Song[] }
export type Mix = { id: string; name: string; emoji: string; color: ThemeName; songs: Song[] }
export type KidBox = { id: string; kidName: string }

export type Library = {
  picked: Shelf
  shelves: Shelf[]
  mixes: Mix[]
  playlists: PlaylistInfo[] // everything in the account, for the grown-up picker
  boxes: KidBox[] // every kid's Bop Box in this account (to link kids on another device)
  grownup: { me: Me; playlists: PlaylistInfo[] } | null // read-only grown-up connection, if any
}

const MIX_RE = /\[bopbox-mix:(\w+):([^\]:]+)(?::(\w+))?\]/
const BOX_RE = /^(.+)'s Bop Box ✨$/
const COLORS: ThemeName[] = ['bubblegum', 'ocean', 'mint', 'grape', 'sunshine']

type Meta = { emoji: string; color: ThemeName; kid?: string }

function mixMeta(p: PlaylistInfo): Meta | null {
  const m = p.description?.match(MIX_RE)
  if (m) return { color: (COLORS.includes(m[1] as ThemeName) ? m[1] : 'bubblegum') as ThemeName, emoji: m[2], kid: m[3] }
  return getSettings().mixMeta[p.id] ?? null
}

/** Hide Bop Box's own playlists (kids' boxes and mixes) from the grown-up's approval list. */
export function isBopBoxPlaylist(p: PlaylistInfo, pickedId?: string) {
  const s = getSettings()
  return (
    p.id === pickedId ||
    s.deletedMixes.includes(p.id) ||
    p.name === 'Deleted Bop Box mix' ||
    !!p.description?.includes('[bopbox') ||
    BOX_RE.test(p.name) ||
    !!s.mixMeta[p.id] ||
    s.kids.some((k) => k.kidName && p.name.endsWith(` · ${k.kidName}`))
  )
}

export function mixName(rawName: string, emoji: string, kidName: string) {
  let n = rawName.startsWith(emoji) ? rawName.slice(emoji.length).trim() : rawName
  if (kidName && n.endsWith(` · ${kidName}`)) n = n.slice(0, -` · ${kidName}`.length)
  return n
}

const byNewest = (a: Song, b: Song) => b.addedAt.localeCompare(a.addedAt)

export async function loadLibrary(me: Me): Promise<Library> {
  const st = getSettings()
  const [playlists, grownup] = await Promise.all([sp.listMyPlaylists(), loadGrownup()])
  const pickedId = await sp.ensurePlaylist(me, playlists, st.playlistId, st.kidName)
  if (pickedId !== st.playlistId) updateSettings({ playlistId: pickedId })

  // Approved playlists can come from this account or the connected grown-up's account.
  const approved = new Set(st.approvedPlaylists)
  const seen = new Set<string>()
  const shelfInfos: { p: PlaylistInfo; acct: sp.Acct }[] = []
  for (const [list, acct] of [[playlists, 'main'], [grownup?.playlists ?? [], 'grownup']] as const) {
    for (const p of list) {
      if (approved.has(p.id) && p.id !== pickedId && !seen.has(p.id)) {
        seen.add(p.id)
        shelfInfos.push({ p, acct })
      }
    }
  }

  // A mix belongs to this kid if it's tagged with their box, or named "… · Name".
  // Older untagged mixes go to the first kid on the device.
  const isFirstKid = st.kids[0]?.id === st.kidId
  const mixInfos = playlists
    .filter((p) => p.owner.id === me.id && p.id !== pickedId && !st.deletedMixes.includes(p.id))
    .map((p) => ({ p, meta: mixMeta(p) }))
    .filter((x): x is { p: PlaylistInfo; meta: Meta } => {
      if (!x.meta) return false
      if (x.meta.kid) return x.meta.kid === pickedId
      if (st.kidName && x.p.name.endsWith(` · ${st.kidName}`)) return true
      return isFirstKid && !st.kids.some((k) => k.kidName && x.p.name.endsWith(` · ${k.kidName}`))
    })

  const [pickedSongs, shelfSongs, mixSongs] = await Promise.all([
    sp.getPlaylistSongs(pickedId),
    Promise.all(shelfInfos.map(({ p, acct }) => sp.getPlaylistSongs(p.id, acct).catch(() => [] as Song[]))),
    Promise.all(mixInfos.map(({ p }) => sp.getPlaylistSongs(p.id).catch(() => [] as Song[]))),
  ])

  return {
    picked: { id: pickedId, name: 'Picked for you', images: [], songs: pickedSongs.sort(byNewest) },
    shelves: shelfInfos.map(({ p }, i) => ({ id: p.id, name: p.name, images: p.images, songs: shelfSongs[i] })),
    mixes: mixInfos.map(({ p, meta }, i) => ({
      id: p.id,
      name: mixName(p.name, meta.emoji, st.kidName),
      emoji: meta.emoji,
      color: meta.color,
      songs: mixSongs[i], // playlist order: the kid's own order
    })),
    playlists,
    grownup,
    boxes: playlists
      .filter((p) => p.owner.id === me.id && BOX_RE.test(p.name))
      .map((p) => ({ id: p.id, kidName: p.name.match(BOX_RE)![1] })),
  }
}

/** The connected grown-up's own playlists (only ones Spotify lets us read: theirs or collaborative). */
async function loadGrownup(): Promise<Library['grownup']> {
  if (!sp.isGrownupConnected()) return null
  try {
    const [me, all] = await Promise.all([sp.getMe('grownup'), sp.listMyPlaylists('grownup')])
    return { me, playlists: all.filter((p) => p.owner.id === me.id || p.collaborative) }
  } catch (e) {
    if (e instanceof sp.AuthError) sp.disconnectGrownup()
    return null
  }
}

/** Everything the kid is allowed to hear: picked + approved shelves, minus explicit songs if hidden. */
export function allowedSongs(lib: Library | null, hideExplicit: boolean): Song[] {
  if (!lib) return []
  const seen = new Map<string, Song>()
  for (const s of [lib.picked, ...lib.shelves].flatMap((x) => x.songs)) {
    if (hideExplicit && s.explicit) continue
    const prev = seen.get(s.uri)
    if (!prev || prev.addedAt < s.addedAt) seen.set(s.uri, s)
  }
  return [...seen.values()].sort(byNewest)
}

export const keepAllowed = (songs: Song[], allowed: Set<string>) => songs.filter((s) => allowed.has(s.uri))
