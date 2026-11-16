import * as sp from './spotify'
import type { Image, Me, PlaylistInfo, Song } from './spotify'
import { getSettings, updateSettings, type ThemeName } from './store'
import { logEvent } from './log'
import { toast } from './toast'
import { familyAvailable, familyGrownup, shareGrownupWithFamily } from './family'

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
  /** Read-only grown-up connection, if any: held on this device, or shared by the family via the server. */
  grownup: { me: Me; playlists: PlaylistInfo[]; via: 'device' | 'family' } | null
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

/** Thrown when the active kid changed while their library was loading; the result is simply dropped. */
export class StaleLoad extends Error {}

export async function loadLibrary(me: Me): Promise<Library> {
  const st = getSettings()
  const [playlists, grownup] = await Promise.all([sp.listMyPlaylists(), loadGrownup()])
  if (getSettings().kidId !== st.kidId) throw new StaleLoad()
  // Only ever make a new box when we're sure which account we're looking at, so a quick
  // switch between kids can't leave duplicate boxes behind.
  const { id: pickedId, created } = await sp.ensurePlaylist(me, playlists, st.playlistId, st.kidName, async () => {
    const fresh = await sp.getMe()
    if (getSettings().kidId !== st.kidId || fresh.id !== me.id) throw new StaleLoad()
  })
  if (getSettings().kidId !== st.kidId) throw new StaleLoad()
  if (pickedId !== st.playlistId) updateSettings({ playlistId: pickedId })
  // A new (or still empty) box in a kid's own account: bring their songs over from the shared account.
  if (created || playlists.find((p) => p.id === pickedId)?.total === 0) await bringSongsAlong(me, pickedId, st.kidName)

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

  // A few playlists at a time, so a big library doesn't trip Spotify's rate limit.
  const pickedSongs = await sp.getPlaylistSongs(pickedId, 'main', playlists.find((p) => p.id === pickedId)?.snapshot)
  const shelfSongs = await inBatches(shelfInfos, ({ p, acct }) =>
    sp.getPlaylistSongs(p.id, acct, p.snapshot).catch((e) => {
      logEvent(`Couldn't read the "${p.name}" shelf (${why(e)})`)
      return [] as Song[]
    }),
  )
  const mixSongs = await inBatches(mixInfos, ({ p }) => sp.getPlaylistSongs(p.id, 'main', p.snapshot).catch(() => [] as Song[]))

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

/**
 * A kid who just moved to their own Spotify account starts with an empty box there. If this device's
 * shared account has their old box, copy its songs over so nothing has to be picked again.
 */
async function bringSongsAlong(me: Me, newId: string, kidName: string) {
  if (!sp.deviceSignedIn()) return
  try {
    const dev = await sp.getMe('device')
    if (dev.id === me.id) return
    const old = (await sp.listMyPlaylists('device'))
      .filter((p) => p.owner.id === dev.id && p.name === sp.boxName(kidName))
      .sort((a, b) => b.total - a.total)[0]
    if (!old?.total) return
    const uris = (await sp.getPlaylistSongs(old.id, 'device')).map((x) => x.uri)
    for (let i = 0; i < uris.length; i += 100) await sp.addToPlaylist(newId, uris.slice(i, i + 100), false)
    logEvent(`Copied ${uris.length} songs into ${kidName}'s own account`)
    // Rename the old box so it's never mistaken for theirs again (it keeps its Bop Box tag, so it stays hidden).
    await sp.updatePlaylistDetails(old.id, { name: `${kidName}'s old Bop Box ✨` }, 'device').catch(() => {})
    if (uris.length) toast(`Brought ${kidName}'s ${uris.length} songs over to their own account.`, '🎁')
  } catch (e) {
    logEvent(`Couldn't copy ${kidName}'s songs from the shared account (${why(e)})`)
  }
}

/** The connected grown-up's own playlists (only ones Spotify lets us read: theirs or collaborative). */
async function loadGrownup(): Promise<Library['grownup']> {
  // A connection made on this device before the family connection existed: share it (kept here if that fails).
  if (sp.isGrownupConnected() && familyAvailable()) await shareGrownupWithFamily()
  if (!sp.isGrownupConnected()) {
    const fam = await familyGrownup()
    return fam && { me: { id: fam.me.id, display_name: fam.me.display_name }, playlists: fam.playlists, via: 'family' }
  }
  try {
    const [me, all] = await Promise.all([sp.getMe('grownup'), sp.listMyPlaylists('grownup')])
    return { me, playlists: all.filter((p) => p.owner.id === me.id || p.collaborative), via: 'device' }
  } catch (e) {
    logEvent(`Couldn't read the grown-up's playlists (${why(e)})`)
    if (e instanceof sp.AuthError) sp.disconnectGrownup()
    else if (e instanceof sp.SpotifyError && e.status === 403) {
      // In Spotify's developer mode, only accounts listed under User Management may use the app.
      sp.disconnectGrownup()
      toast("Spotify won't let that account into Bop Box yet. It needs adding to the app's allowed users first.", '🔒')
    }
    return null
  }
}

const why = (e: unknown) =>
  e instanceof sp.SpotifyError ? `Spotify said ${e.status}: ${e.message}` : e instanceof Error ? e.message : 'unknown'

async function inBatches<T, R>(items: T[], fn: (x: T) => Promise<R>, size = 3): Promise<R[]> {
  const out: R[] = []
  for (let i = 0; i < items.length; i += size) out.push(...(await Promise.all(items.slice(i, i + size).map(fn))))
  return out
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

// ── a saved copy of each kid's library, so Bop Box opens instantly and works while Spotify is busy ──

const libKey = (kidId: string) => `bopbox.lib.${kidId}`

export function saveLibrary(kidId: string, lib: Library) {
  const slimShelf = (sh: Shelf) => ({ ...sh, songs: sh.songs.map(sp.slim) })
  try {
    localStorage.setItem(
      libKey(kidId),
      JSON.stringify({ ...lib, picked: slimShelf(lib.picked), shelves: lib.shelves.map(slimShelf), mixes: lib.mixes.map((m) => ({ ...m, songs: m.songs.map(sp.slim) })) }),
    )
  } catch {
    /* storage full: just won't open instantly next time */
  }
}

export function savedLibrary(kidId: string | null): Library | null {
  if (!kidId) return null
  try {
    return JSON.parse(localStorage.getItem(libKey(kidId)) ?? 'null')
  } catch {
    return null
  }
}
