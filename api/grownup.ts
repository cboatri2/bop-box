import { bearer, deleteDoc, hash, json, preflight, readDoc, spotifyUserOf, writeDoc } from './_shared.js'

// The family's grown-up connection, kept on the server so every kid's device can show the
// grown-up's playlists without the grown-up signing in on each one.
//
// • A grown-up connects once from any device. Their sign-in only allows READING their playlists
//   (Spotify scopes playlist-read-private + playlist-read-collaborative). It's stored here, privately,
//   and never handed back to any device.
// • The Spotify accounts signed in on that device (the shared one and each kid's own) are linked to
//   the grown-up. Any device signed in to a linked account can then read the grown-up's playlists.
// • A device that has a linked account and an unlinked one can link the other: that's how a kid
//   added later joins the family.

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID ?? process.env.VITE_SPOTIFY_CLIENT_ID ?? ''

type Grownup = { id: string; name: string | null; refresh: string; access?: string; until?: number; at: number }
type Link = { grownup: string; at: number }

const grownupPath = (id: string) => `grownups/${hash(`bopbox:${id}`)}.json`
const linkPath = (accountId: string) => `links/${hash(`bopbox:${accountId}`)}.json`

// ── the grown-up's Spotify sign-in ──────────────────────────────────────────

async function renew(g: Grownup, etag: string | undefined): Promise<Grownup> {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: g.refresh, client_id: CLIENT_ID }),
  })
  if (!res.ok) {
    // Another request may have renewed it a moment ago: use that one.
    const latest = await readDoc<Grownup>(grownupPath(g.id))
    if (latest && latest.data.refresh !== g.refresh && (latest.data.until ?? 0) > Date.now()) return latest.data
    const why = await res.text().catch(() => '')
    console.error(`grown-up renewal failed: ${res.status} ${why.slice(0, 300)}`)
    throw new Error(`renewal failed (${res.status})`)
  }
  const j = (await res.json()) as { access_token: string; refresh_token?: string; expires_in: number }
  const next: Grownup = {
    ...g,
    access: j.access_token,
    refresh: j.refresh_token ?? g.refresh,
    until: Date.now() + (j.expires_in - 120) * 1000,
  }
  await writeDoc(grownupPath(g.id), next, etag)
  return next
}

async function grownupToken(gid: string, force = false): Promise<{ g: Grownup; token: string } | null> {
  const found = await readDoc<Grownup>(grownupPath(gid))
  if (!found) return null
  let g = found.data
  if (force || !g.access || (g.until ?? 0) < Date.now()) g = await renew(g, found.etag)
  return { g, token: g.access! }
}

const cache = new Map<string, { data: unknown; until: number }>()

/** Call Spotify as the grown-up (renewing their sign-in when needed). */
async function asGrownup<T>(gid: string, url: string): Promise<T> {
  const hit = cache.get(gid + url)
  if (hit && hit.until > Date.now()) return hit.data as T
  let auth = await grownupToken(gid)
  if (!auth) throw new Error('not connected')
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${auth.token}` } })
    if (!res.ok) console.error(`grown-up read attempt ${attempt + 1}: ${res.status} ${res.headers.get('www-authenticate') ?? ''} ${(await res.clone().text().catch(() => '')).slice(0, 200)}`)
    if (res.status === 401) {
      auth = (await grownupToken(gid, true))!
      continue
    }
    if (res.status === 429 || res.status >= 500) {
      const wait = Math.min(Number(res.headers.get('Retry-After')) * 1000 || 1500, 5000)
      await new Promise((r) => setTimeout(r, wait))
      continue
    }
    if (!res.ok) {
      const why = await res.text().catch(() => '')
      console.error(`grown-up read failed: ${res.status} ${url.replace(/\?.*/, '')} ${why.slice(0, 300)}`)
      throw new Error(`Spotify said ${res.status}${why ? `: ${why.slice(0, 200)}` : ''}`)
    }
    const data = (await res.json()) as T
    if (cache.size > 300) cache.clear()
    cache.set(gid + url, { data, until: Date.now() + 45_000 })
    return data
  }
  throw new Error('Spotify is busy')
}

// ── who belongs to which family ─────────────────────────────────────────────

async function linkedGrownup(accountId: string): Promise<Grownup | null> {
  const link = await readDoc<Link>(linkPath(accountId))
  if (!link) return null
  return (await readDoc<Grownup>(grownupPath(link.data.grownup)))?.data ?? null
}

async function linkAll(accountIds: string[], gid: string) {
  await Promise.all(accountIds.map((id) => writeDoc(linkPath(id), { grownup: gid, at: Date.now() } satisfies Link)))
}

async function verifyAll(tokens: unknown): Promise<string[]> {
  if (!Array.isArray(tokens)) return []
  const users = await Promise.all(tokens.slice(0, 8).map((t) => (typeof t === 'string' ? spotifyUserOf(t) : null)))
  return [...new Set(users.filter((u) => u !== null).map((u) => u!.id))]
}

/** The grown-up linked to the account making this request. */
async function callerFamily(req: Request) {
  const me = await spotifyUserOf(bearer(req))
  if (!me) return { me: null, g: null }
  return { me, g: await linkedGrownup(me.id) }
}

// ── Spotify data, trimmed to what Bop Box uses ──────────────────────────────

type RawPlaylist = {
  id: string
  name: string
  description: string | null
  images: { url: string }[] | null
  owner: { id: string; display_name?: string | null }
  collaborative: boolean
  items?: { total: number }
  tracks?: { total: number }
}

async function playlistsOf(g: Grownup) {
  const out = []
  let next: string | null = 'https://api.spotify.com/v1/me/playlists?limit=50'
  while (next) {
    const page: { items: (RawPlaylist | null)[]; next: string | null } = await asGrownup(g.id, next)
    for (const p of page.items) {
      if (!p || (p.owner.id !== g.id && !p.collaborative)) continue
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

type RawTrack = {
  id: string | null
  uri: string
  name: string
  explicit: boolean
  duration_ms: number
  artists: { name: string }[]
  album: { name: string; images: { url: string; width?: number | null; height?: number | null }[] }
}

async function songsOf(g: Grownup, playlistId: string) {
  const songs = []
  let next: string | null = `https://api.spotify.com/v1/playlists/${encodeURIComponent(playlistId)}/items?limit=50`
  while (next) {
    const page: { items: { added_at: string; item?: RawTrack | null; track?: RawTrack | null }[]; next: string | null } =
      await asGrownup(g.id, next)
    for (const e of page.items) {
      const t = e.item ?? e.track
      if (!t || !t.id || !t.uri?.startsWith('spotify:track:')) continue
      songs.push({
        id: t.id,
        uri: t.uri,
        name: t.name,
        explicit: t.explicit,
        duration_ms: t.duration_ms,
        artists: t.artists.map((a) => ({ name: a.name })),
        album: { name: t.album.name, images: t.album.images },
        addedAt: e.added_at,
      })
    }
    next = page.next
  }
  return songs
}

// ── routes ──────────────────────────────────────────────────────────────────

export const OPTIONS = preflight

/** ?op=status | playlists | songs&id=…   (Authorization: any linked account's Spotify token) */
export async function GET(req: Request) {
  const op = new URL(req.url).searchParams.get('op')
  const { me, g } = await callerFamily(req)
  if (!me) return json(req, { error: 'not signed in' }, 401)
  if (!g) return json(req, { connected: false })
  try {
    if (op === 'status') return json(req, { connected: true, grownup: { id: g.id, name: g.name } })
    if (op === 'playlists') return json(req, { grownup: { id: g.id, display_name: g.name }, playlists: await playlistsOf(g) })
    if (op === 'songs') {
      const id = new URL(req.url).searchParams.get('id') ?? ''
      if (!/^[A-Za-z0-9]{10,40}$/.test(id)) return json(req, { error: 'bad id' }, 400)
      return json(req, { songs: await songsOf(g, id) })
    }
  } catch (e) {
    console.error(`grown-up ${op} failed: ${e instanceof Error ? e.message : e}`)
    return json(req, { error: e instanceof Error ? e.message : 'failed' }, 502)
  }
  return json(req, { error: 'unknown op' }, 400)
}

/**
 * ?op=connect    Authorization: the grown-up's token. Body: { refresh, accounts: [tokens on this device] }
 * ?op=link       Body: { accounts: [tokens on this device] }; links them if any is already linked
 * ?op=disconnect Authorization: a linked account's (or the grown-up's) token
 */
export async function POST(req: Request) {
  const op = new URL(req.url).searchParams.get('op')
  const body = (await req.json().catch(() => ({}))) as { refresh?: unknown; accounts?: unknown }

  if (op === 'connect') {
    const grown = await spotifyUserOf(bearer(req))
    if (!grown || typeof body.refresh !== 'string' || body.refresh.length > 1000) return json(req, { error: 'not signed in' }, 401)
    // Prove the renewal code is real (and belongs to this grown-up) before keeping it.
    let g: Grownup = { id: grown.id, name: grown.name, refresh: body.refresh, at: Date.now() }
    try {
      g = await renew(g, (await readDoc<Grownup>(grownupPath(grown.id)))?.etag)
    } catch {
      return json(req, { error: 'sign-in could not be renewed' }, 400)
    }
    if ((await spotifyUserOf(g.access))?.id !== grown.id) return json(req, { error: 'mismatch' }, 400)
    const accounts = await verifyAll(body.accounts)
    await linkAll(accounts, grown.id)
    return json(req, { connected: true, grownup: { id: g.id, name: g.name }, linked: accounts.length })
  }

  if (op === 'link') {
    const accounts = await verifyAll(body.accounts)
    for (const id of accounts) {
      const g = await linkedGrownup(id)
      if (!g) continue
      const others = accounts.filter((a) => a !== id)
      await linkAll(others, g.id)
      return json(req, { connected: true, grownup: { id: g.id, name: g.name }, linked: others.length })
    }
    return json(req, { connected: false })
  }

  if (op === 'disconnect') {
    const me = await spotifyUserOf(bearer(req))
    if (!me) return json(req, { error: 'not signed in' }, 401)
    const g = (await linkedGrownup(me.id)) ?? (await readDoc<Grownup>(grownupPath(me.id)))?.data ?? null
    if (g) await deleteDoc(grownupPath(g.id)) // links now point nowhere, so nobody can read the playlists
    return json(req, { connected: false })
  }

  return json(req, { error: 'unknown op' }, 400)
}
