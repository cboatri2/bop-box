import { bearer, deleteDoc, hash, json, preflight, readDoc, spotifyUserOf, writeDoc } from './_shared.js'

// The family's grown-up connection, kept on the server so every kid's device can show the
// grown-up's playlists without the grown-up signing in on each one.
//
// • A grown-up connects once from any device. Their sign-in only allows READING their playlists
//   (Spotify scopes playlist-read-private + playlist-read-collaborative). The long-lived renewal code
//   stays here, privately, and is never handed out.
// • Linked devices get a short-lived (1 hour) read-only pass and read the playlists from Spotify
//   themselves. (Spotify throttles playlist reads coming from shared cloud servers, so the server
//   only keeps the connection fresh; it doesn't read playlists itself.)
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

// ── routes ──────────────────────────────────────────────────────────────────

export const OPTIONS = preflight

/** ?op=status | token   (Authorization: any linked account's Spotify token) */
export async function GET(req: Request) {
  const op = new URL(req.url).searchParams.get('op')
  const { me, g } = await callerFamily(req)
  if (!me) return json(req, { error: 'not signed in' }, 401)
  if (!g) return json(req, { connected: false })
  const grownup = { id: g.id, display_name: g.name }
  if (op === 'status') return json(req, { connected: true, grownup })
  if (op === 'token') {
    try {
      const auth = await grownupToken(g.id, new URL(req.url).searchParams.get('fresh') === '1')
      if (!auth) return json(req, { connected: false })
      return json(req, { connected: true, grownup, access: auth.token, until: auth.g.until })
    } catch (e) {
      console.error(`grown-up token failed: ${e instanceof Error ? e.message : e}`)
      return json(req, { error: 'the grown-up needs to connect again' }, 410)
    }
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
