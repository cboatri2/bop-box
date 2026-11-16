import { bearer, hash, json, preflight } from './_shared.js'

// How long Spotify wants Bop Box to wait before asking for playlists again.
// Browsers can't read Spotify's Retry-After header (it isn't shared with web pages), but the
// server can. One small request with the caller's own Spotify sign-in; answers are reused briefly.

const seen = new Map<string, { until: number; answer: { limited: boolean; retryAfter: number; at: number } }>()

export const OPTIONS = preflight

export async function GET(req: Request) {
  const token = bearer(req)
  if (!token) return json(req, { error: 'not signed in' }, 401)
  const key = hash(token)
  const hit = seen.get(key)
  if (hit && hit.until > Date.now()) return json(req, hit.answer)
  const res = await fetch('https://api.spotify.com/v1/me/playlists?limit=1', { headers: { Authorization: `Bearer ${token}` } })
  if (res.status === 401) return json(req, { error: 'not signed in' }, 401)
  const answer = { limited: res.status === 429, retryAfter: Number(res.headers.get('retry-after')) || 0, at: Date.now() }
  if (seen.size > 200) seen.clear()
  seen.set(key, { until: Date.now() + 2 * 60 * 1000, answer })
  return json(req, answer)
}
