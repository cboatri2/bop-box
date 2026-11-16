import { API_BASE } from './api'
import { logEvent } from './log'
import {
  accountTokensOnDevice,
  disconnectGrownup,
  getAccessToken,
  getPlaylistSongs,
  grownupSignIn,
  listMyPlaylists,
  setGrownupPassSource,
  type PlaylistInfo,
  type Song,
} from './spotify'

// The family's grown-up connection, kept on Bop Box's server (see api/grownup.ts): a grown-up
// connects once, and every kid's device can show their playlists. Read-only, always.
// The server hands this device a short read-only pass; the device reads the playlists from Spotify itself.

export const familyAvailable = () => API_BASE !== null
const URL_ = API_BASE && `${API_BASE}/grownup`

export type FamilyGrownup = { me: { id: string; display_name: string | null }; playlists: PlaylistInfo[] }

async function call<T>(method: 'GET' | 'POST', query: string, opts: { token?: string; body?: unknown } = {}): Promise<T> {
  const token = opts.token ?? (await getAccessToken(false, 'main'))
  const res = await fetch(`${URL_}?${query}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(opts.body ? { 'Content-Type': 'application/json' } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })
  if (!res.ok) {
    const why = await res.json().then((j: { error?: string }) => j.error ?? '', () => '')
    throw new Error(`grown-up ${query.split('&')[0]} ${res.status}${why ? `: ${why}` : ''}`)
  }
  return res.json()
}

/**
 * Hand a grown-up's fresh sign-in to the server and link every account signed in on this device.
 * Afterwards the sign-in is forgotten here: the server keeps it, so no device can lose it.
 */
export async function shareGrownupWithFamily(): Promise<string | null> {
  if (!URL_) return null
  const g = await grownupSignIn()
  if (!g) return null
  try {
    const accounts = await accountTokensOnDevice()
    const r = await call<{ grownup: { name: string | null } }>('POST', 'op=connect', {
      token: g.access,
      body: { refresh: g.refresh, accounts },
    })
    disconnectGrownup() // the server has it now
    linked = true
    logEvent(`Connected ${r.grownup.name ?? 'a grown-up'}'s playlists for the whole family`)
    return r.grownup.name
  } catch (e) {
    logEvent(`Couldn't share the grown-up connection (${e instanceof Error ? e.message : 'unknown'}); kept it on this device`)
    return null
  }
}

let linked: boolean | null = null // null = not checked yet this session
export const familyLinked = () => linked === true

type TokenReply = { connected?: boolean; grownup?: { id: string; display_name: string | null }; access?: string; until?: number }

if (URL_) {
  setGrownupPassSource(async (fresh) => {
    const r = await call<TokenReply>('GET', `op=token${fresh ? '&fresh=1' : ''}`)
    return r.access && r.until ? { access: r.access, until: r.until } : null
  })
}

/** The grown-up's playlists via the family connection, or null when this family hasn't connected one. */
export async function familyGrownup(): Promise<FamilyGrownup | null> {
  if (!URL_) return null
  try {
    let r = await call<TokenReply>('GET', 'op=status')
    if (!r.grownup && linked === null) {
      // Maybe another account on this device is already in the family: link this one too, then retry.
      linked = false
      const accounts = await accountTokensOnDevice()
      if (accounts.length > 1) {
        const l = await call<{ connected: boolean }>('POST', 'op=link', { body: { accounts } })
        if (l.connected) r = await call('GET', 'op=status')
      }
    }
    if (!r.grownup) return null
    linked = true
    const me = r.grownup
    const playlists = (await listMyPlaylists('grownup')).filter((p) => p.owner.id === me.id || p.collaborative)
    return { me, playlists }
  } catch (e) {
    logEvent(`Couldn't load the family's grown-up playlists (${e instanceof Error ? e.message : 'unknown'})`)
    return null
  }
}

export const familyGrownupSongs = (playlistId: string): Promise<Song[]> => getPlaylistSongs(playlistId, 'grownup')

export async function disconnectFamilyGrownup() {
  disconnectGrownup()
  if (!URL_) return
  try {
    await call('POST', 'op=disconnect')
    linked = null
    logEvent('Disconnected the grown-up playlists for the whole family')
  } catch (e) {
    logEvent(`Couldn't disconnect the family's grown-up playlists (${e instanceof Error ? e.message : 'unknown'})`)
  }
}
