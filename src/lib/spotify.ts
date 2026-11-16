// Spotify Web API client — Authorization Code + PKCE, no server needed.
// Written against the Development Mode rules in effect since Feb 2026:
//   • playlist contents live at /playlists/{id}/items (not /tracks)
//   • search returns at most 10 results per page
//   • the app owner must have Premium

import { DEMO } from './demo-flag'

export const CLIENT_ID: string = import.meta.env.VITE_SPOTIFY_CLIENT_ID ?? ''
export const REDIRECT_URI = window.location.origin + import.meta.env.BASE_URL

const SCOPES = [
  'streaming',
  'user-read-email',
  'user-read-private',
  'user-read-playback-state',
  'user-modify-playback-state',
  'playlist-read-private',
  'playlist-read-collaborative',
  'playlist-modify-private',
  'playlist-modify-public',
  'user-library-modify', // needed to delete a kid's mix
].join(' ')

const TOKEN_KEY = 'bopbox.token'
const VERIFIER_KEY = 'bopbox.pkce'
const API = 'https://api.spotify.com/v1'

type Token = { access: string; refresh: string; expires: number }

// ── token storage ───────────────────────────────────────────────────────────

function readToken(): Token | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY)
    return raw ? (JSON.parse(raw) as Token) : null
  } catch {
    return null
  }
}

function writeToken(t: Token | null) {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, JSON.stringify(t))
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* storage unavailable */
  }
}

export const isLoggedIn = () => readToken() !== null

export function logout() {
  writeToken(null)
}

// ── PKCE login ──────────────────────────────────────────────────────────────

function base64url(bytes: Uint8Array) {
  let s = ''
  bytes.forEach((b) => (s += String.fromCharCode(b)))
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export async function beginLogin() {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(48)))
  const challenge = base64url(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))),
  )
  const state = base64url(crypto.getRandomValues(new Uint8Array(12)))
  localStorage.setItem(VERIFIER_KEY, JSON.stringify({ verifier, state }))
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    scope: SCOPES,
    redirect_uri: REDIRECT_URI,
    code_challenge_method: 'S256',
    code_challenge: challenge,
    state,
  })
  window.location.assign(`https://accounts.spotify.com/authorize?${params}`)
}

/** If the URL carries ?code=… from Spotify, trade it for tokens. Returns an error message, or null. */
export async function completeLoginFromUrl(): Promise<string | null> {
  const url = new URL(window.location.href)
  const code = url.searchParams.get('code')
  const err = url.searchParams.get('error')
  if (!code && !err) return null

  // Clean the address bar no matter what happens next.
  window.history.replaceState({}, '', REDIRECT_URI)

  if (err) return err === 'access_denied' ? 'Spotify sign-in was cancelled.' : `Spotify said: ${err}`
  const saved = JSON.parse(localStorage.getItem(VERIFIER_KEY) ?? 'null') as {
    verifier: string
    state: string
  } | null
  localStorage.removeItem(VERIFIER_KEY)
  if (!saved || saved.state !== url.searchParams.get('state')) {
    return 'That sign-in link expired. Please try again.'
  }

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: code!,
      redirect_uri: REDIRECT_URI,
      client_id: CLIENT_ID,
      code_verifier: saved.verifier,
    }),
  })
  if (!res.ok) return 'Spotify sign-in failed. Please try again.'
  const j = await res.json()
  writeToken({
    access: j.access_token,
    refresh: j.refresh_token,
    expires: Date.now() + (j.expires_in - 60) * 1000,
  })
  return null
}

let refreshing: Promise<string> | null = null

async function refresh(): Promise<string> {
  const t = readToken()
  if (!t) throw new AuthError()
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: t.refresh,
      client_id: CLIENT_ID,
    }),
  })
  if (!res.ok) {
    if (res.status === 400 || res.status === 401) {
      writeToken(null)
      throw new AuthError()
    }
    throw new Error('Could not reach Spotify')
  }
  const j = await res.json()
  writeToken({
    access: j.access_token,
    refresh: j.refresh_token ?? t.refresh,
    expires: Date.now() + (j.expires_in - 60) * 1000,
  })
  return j.access_token
}

export async function getAccessToken(force = false): Promise<string> {
  const t = readToken()
  if (!t) throw new AuthError()
  if (!force && Date.now() < t.expires) return t.access
  refreshing ??= refresh().finally(() => (refreshing = null))
  return refreshing
}

// ── fetch wrapper ───────────────────────────────────────────────────────────

export class AuthError extends Error {
  constructor() {
    super('Signed out of Spotify')
  }
}

export class SpotifyError extends Error {
  status: number
  reason?: string
  constructor(status: number, message: string, reason?: string) {
    super(message)
    this.status = status
    this.reason = reason
  }
}

async function api<T = unknown>(path: string, init: RequestInit = {}, retried = false): Promise<T> {
  if (DEMO) return (init.method === 'POST' && path === '/me/playlists' ? { id: `demo-${Date.now()}` } : undefined) as T
  const token = await getAccessToken(retried)
  const res = await fetch(path.startsWith('http') ? path : API + path, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  })
  if (res.status === 401 && !retried) return api<T>(path, init, true)
  const text = await res.text()
  const body = text ? safeJson(text) : undefined
  if (!res.ok) {
    const e = (body as { error?: { message?: string; reason?: string } } | undefined)?.error
    throw new SpotifyError(res.status, e?.message ?? res.statusText, e?.reason)
  }
  return body as T
}

function safeJson(text: string) {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

// ── types ───────────────────────────────────────────────────────────────────

export type Image = { url: string; width?: number | null; height?: number | null }

export type Track = {
  id: string
  uri: string
  name: string
  explicit: boolean
  duration_ms: number
  artists: { name: string }[]
  album: { name: string; images: Image[] }
  linked_from?: { uri: string }
}

export type Song = Track & { addedAt: string }

export type Me = { id: string; display_name: string | null; product?: string; email?: string }

export type Device = {
  id: string | null
  name: string
  type: string
  is_active: boolean
  is_restricted: boolean
  volume_percent: number | null
}

export type PlaybackState = {
  device?: Device
  is_playing: boolean
  progress_ms: number | null
  item: Track | null
}

// ── endpoints ───────────────────────────────────────────────────────────────

export const getMe = () => api<Me>('/me')

export const MARKER = '[bopbox]'
export const MIX_MARKER = '[bopbox-mix'

export type PlaylistInfo = {
  id: string
  name: string
  description: string | null
  images: Image[]
  owner: { id: string; display_name?: string | null }
  collaborative: boolean
  total: number
}

type RawPlaylist = Omit<PlaylistInfo, 'total'> & { items?: { total: number }; tracks?: { total: number } }

/** Every playlist in the signed-in account's library. */
export async function listMyPlaylists(): Promise<PlaylistInfo[]> {
  const out: PlaylistInfo[] = []
  let next: string | null = '/me/playlists?limit=50'
  while (next) {
    const page: { items: (RawPlaylist | null)[]; next: string | null } = await api(next)
    for (const p of page.items) {
      if (!p) continue
      out.push({
        id: p.id,
        name: p.name,
        description: p.description ?? null,
        images: p.images ?? [],
        owner: p.owner,
        collaborative: !!p.collaborative,
        total: p.items?.total ?? p.tracks?.total ?? 0,
      })
    }
    next = page.next
  }
  return out
}

export const boxName = (kidName: string) => `${kidName || 'My'}'s Bop Box ✨`

/** Find a kid's "Picked for you" playlist, or create it. */
export async function ensurePlaylist(me: Me, all: PlaylistInfo[], knownId: string | undefined, kidName: string) {
  const mine = all.filter((p) => p.owner.id === me.id)
  const hit = (knownId && mine.find((p) => p.id === knownId)) || mine.find((p) => p.name === boxName(kidName))
  if (hit) return hit.id
  const created = await api<{ id: string }>('/me/playlists', {
    method: 'POST',
    body: JSON.stringify({
      name: boxName(kidName),
      public: false,
      description: `Songs a grown-up picked for ${kidName || 'a kid'} in Bop Box. ${MARKER}`,
    }),
  })
  return created.id
}

export const mixDescription = (kidName: string, color: string, emoji: string, kidKey?: string) =>
  `A mix ${kidName || 'a kid'} made in Bop Box. ${MIX_MARKER}:${color}:${emoji}${kidKey ? `:${kidKey}` : ''}]`

/** Mix playlists are named "💃 Dance Party · Max" so grown-ups can tell whose is whose in Spotify. */
export const mixPlaylistName = (emoji: string, name: string, kidName: string) =>
  `${emoji} ${name}${kidName ? ` · ${kidName}` : ''}`

export async function createPlaylist(name: string, description: string) {
  return api<{ id: string; name: string }>('/me/playlists', {
    method: 'POST',
    body: JSON.stringify({ name, description, public: false }),
  })
}

export const updatePlaylistDetails = (id: string, details: { name?: string; description?: string }) =>
  api(`/playlists/${id}`, { method: 'PUT', body: JSON.stringify(details) })

export const replacePlaylistItems = (id: string, uris: string[]) =>
  api(`/playlists/${id}/items`, { method: 'PUT', body: JSON.stringify({ uris: uris.slice(0, 100) }) })

/** Spotify "deletes" a playlist by removing it from the owner's library. */
export const deletePlaylist = (id: string) =>
  api(`/me/library?uris=${encodeURIComponent(`spotify:playlist:${id}`)}`, { method: 'DELETE' })

type PlaylistEntry = { added_at: string; item?: Track | null; track?: Track | null }

export async function getPlaylistSongs(id: string): Promise<Song[]> {
  const songs: Song[] = []
  let next: string | null = `/playlists/${id}/items?limit=50`
  while (next) {
    const page: { items: PlaylistEntry[]; next: string | null } = await api(next)
    for (const e of page.items) {
      const t = e.item ?? e.track
      // Skip podcasts, local files and unplayable rows.
      if (t && t.uri?.startsWith('spotify:track:') && t.id) songs.push({ ...t, addedAt: e.added_at })
    }
    next = page.next
  }
  return songs
}

export const renamePlaylist = (id: string, kidName: string) =>
  api(`/playlists/${id}`, { method: 'PUT', body: JSON.stringify({ name: boxName(kidName) }) })

export const addToPlaylist = (id: string, uris: string[], atTop = true) =>
  api(`/playlists/${id}/items`, { method: 'POST', body: JSON.stringify(atTop ? { uris, position: 0 } : { uris }) })

export const removeFromPlaylist = (id: string, uris: string[]) =>
  api(`/playlists/${id}/items`, {
    method: 'DELETE',
    body: JSON.stringify({ items: uris.map((uri) => ({ uri })) }),
  })

export async function searchTracks(q: string, offset = 0) {
  const params = new URLSearchParams({ q, type: 'track', limit: '10', offset: String(offset) })
  const r = await api<{ tracks: { items: Track[]; total: number; next: string | null } }>(`/search?${params}`)
  return r.tracks
}

export const getTrack = (id: string) => api<Track>(`/tracks/${id}`)

export async function getAlbumTracks(id: string): Promise<{ name: string; tracks: Track[] }> {
  const a = await api<{
    name: string
    images: Image[]
    tracks: { items: Omit<Track, 'album'>[] }
  }>(`/albums/${id}`)
  return {
    name: a.name,
    tracks: a.tracks.items.map((t) => ({ ...t, album: { name: a.name, images: a.images } })),
  }
}

// Player
export const getDevices = () => api<{ devices: Device[] }>('/me/player/devices').then((r) => r.devices)

export const getPlayback = () => api<PlaybackState | undefined>('/me/player')

export const playUris = (deviceId: string, uris: string[], offset = 0) =>
  api(`/me/player/play?device_id=${encodeURIComponent(deviceId)}`, {
    method: 'PUT',
    body: JSON.stringify({ uris, offset: { position: offset } }),
  })

export const pausePlayback = (deviceId: string) =>
  api(`/me/player/pause?device_id=${encodeURIComponent(deviceId)}`, { method: 'PUT' })

export const resumePlayback = (deviceId: string) =>
  api(`/me/player/play?device_id=${encodeURIComponent(deviceId)}`, { method: 'PUT' })

export const nextTrack = (deviceId: string) =>
  api(`/me/player/next?device_id=${encodeURIComponent(deviceId)}`, { method: 'POST' })

export const prevTrack = (deviceId: string) =>
  api(`/me/player/previous?device_id=${encodeURIComponent(deviceId)}`, { method: 'POST' })

export const seekTo = (deviceId: string, ms: number) =>
  api(`/me/player/seek?position_ms=${Math.round(ms)}&device_id=${encodeURIComponent(deviceId)}`, { method: 'PUT' })

export const setRemoteVolume = (deviceId: string, pct: number) =>
  api(`/me/player/volume?volume_percent=${Math.round(pct)}&device_id=${encodeURIComponent(deviceId)}`, {
    method: 'PUT',
  })

export const setRepeat = (deviceId: string, state: 'off' | 'context' | 'track') =>
  api(`/me/player/repeat?state=${state}&device_id=${encodeURIComponent(deviceId)}`, { method: 'PUT' })

export const transferTo = (deviceId: string) =>
  api('/me/player', { method: 'PUT', body: JSON.stringify({ device_ids: [deviceId], play: false }) })

// ── helpers ─────────────────────────────────────────────────────────────────

export function art(t: { album: { images: Image[] } }, size: 'sm' | 'lg' = 'lg') {
  const imgs = [...(t.album.images ?? [])].sort((a, b) => (a.width ?? 0) - (b.width ?? 0))
  if (!imgs.length) return ''
  if (size === 'sm') return (imgs.find((i) => (i.width ?? 0) >= 100) ?? imgs[imgs.length - 1]).url
  return (imgs.find((i) => (i.width ?? 0) >= 300) ?? imgs[imgs.length - 1]).url
}

export const artistNames = (t: { artists: { name: string }[] }) => t.artists.map((a) => a.name).join(', ')

/** Pull a track/album id out of a pasted open.spotify.com link or spotify: URI. */
export function parseSpotifyLink(s: string): { kind: 'track' | 'album' | 'playlist'; id: string } | null {
  const m =
    s.match(/open\.spotify\.com\/(?:intl-[a-z-]+\/)?(track|album|playlist)\/([A-Za-z0-9]{22})/) ??
    s.match(/spotify:(track|album|playlist):([A-Za-z0-9]{22})/)
  return m ? { kind: m[1] as 'track' | 'album' | 'playlist', id: m[2] } : null
}
