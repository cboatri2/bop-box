import * as sp from './spotify'
import type { Image, Me, PlaylistInfo, Song } from './spotify'
import { getSettings, updateSettings, type ThemeName } from './store'

// The kid's music library:
//   • "Picked for you": the Bop Box playlist songs get added to one at a time
//   • shelves: grown-up playlists that are switched on in the grown-up corner
//   • mixes: playlists the kid makes, which may only ever play approved songs

export type Shelf = { id: string; name: string; images: Image[]; songs: Song[] }
export type Mix = { id: string; name: string; emoji: string; color: ThemeName; songs: Song[] }

export type Library = {
  picked: Shelf
  shelves: Shelf[]
  mixes: Mix[]
  playlists: PlaylistInfo[] // everything in the account, for the grown-up picker
}

const MIX_RE = /\[bopbox-mix:(\w+):([^\]]+)\]/
const COLORS: ThemeName[] = ['bubblegum', 'ocean', 'mint', 'grape', 'sunshine']

export const isBopBoxPlaylist = (p: PlaylistInfo, pickedId?: string) =>
  p.id === pickedId || !!p.description?.includes('[bopbox') || !!getSettings().mixMeta[p.id]

function mixMeta(p: PlaylistInfo): { emoji: string; color: ThemeName } | null {
  const m = p.description?.match(MIX_RE)
  if (m) return { color: (COLORS.includes(m[1] as ThemeName) ? m[1] : 'bubblegum') as ThemeName, emoji: m[2] }
  return getSettings().mixMeta[p.id] ?? null
}

export function mixName(rawName: string, emoji: string) {
  return rawName.startsWith(emoji) ? rawName.slice(emoji.length).trim() : rawName
}

const byNewest = (a: Song, b: Song) => b.addedAt.localeCompare(a.addedAt)

export async function loadLibrary(me: Me): Promise<Library> {
  const st = getSettings()
  const playlists = await sp.listMyPlaylists()
  const pickedId = await sp.ensurePlaylist(me, playlists, st.playlistId, st.kidName)
  if (pickedId !== st.playlistId) updateSettings({ playlistId: pickedId })

  const approved = new Set(st.approvedPlaylists)
  const shelfInfos = playlists.filter((p) => approved.has(p.id) && p.id !== pickedId)
  const mixInfos = playlists
    .filter((p) => p.owner.id === me.id && p.id !== pickedId)
    .map((p) => ({ p, meta: mixMeta(p) }))
    .filter((x): x is { p: PlaylistInfo; meta: { emoji: string; color: ThemeName } } => !!x.meta)

  const [pickedSongs, shelfSongs, mixSongs] = await Promise.all([
    sp.getPlaylistSongs(pickedId),
    Promise.all(shelfInfos.map((p) => sp.getPlaylistSongs(p.id).catch(() => [] as Song[]))),
    Promise.all(mixInfos.map(({ p }) => sp.getPlaylistSongs(p.id).catch(() => [] as Song[]))),
  ])

  return {
    picked: { id: pickedId, name: 'Picked for you', images: [], songs: pickedSongs.sort(byNewest) },
    shelves: shelfInfos.map((p, i) => ({ id: p.id, name: p.name, images: p.images, songs: shelfSongs[i] })),
    mixes: mixInfos.map(({ p, meta }, i) => ({
      id: p.id,
      name: mixName(p.name, meta.emoji),
      emoji: meta.emoji,
      color: meta.color,
      songs: mixSongs[i], // playlist order — the kid's own order
    })),
    playlists,
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
