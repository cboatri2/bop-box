import { BlobPreconditionFailedError, del, get, put } from '@vercel/blob'
import { createHash } from 'node:crypto'

// Helpers shared by Bop Box's server routes. (Files starting with "_" aren't routes themselves.)

const ORIGINS = new Set(['https://bop-box.vercel.app', 'https://cboatri2.github.io', 'http://127.0.0.1:5173'])

export function cors(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') ?? ''
  return ORIGINS.has(origin)
    ? {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET, PUT, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        'Access-Control-Max-Age': '86400',
        Vary: 'Origin',
      }
    : { Vary: 'Origin' }
}

export const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...cors(req) },
  })

export const preflight = (req: Request) => new Response(null, { status: 204, headers: cors(req) })

export const hash = (s: string) => createHash('sha256').update(s).digest('hex')

// Spotify user id per access token, remembered briefly so each call doesn't ask Spotify again.
const who = new Map<string, { id: string; name: string | null; until: number }>()

/** Who a Spotify access token belongs to (asks Spotify), or null if it isn't valid. */
export async function spotifyUserOf(token: string | null | undefined): Promise<{ id: string; name: string | null } | null> {
  if (!token) return null
  const key = hash(token)
  const hit = who.get(key)
  if (hit && hit.until > Date.now()) return hit
  const res = await fetch('https://api.spotify.com/v1/me', { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) return null
  const me = (await res.json()) as { id?: string; display_name?: string | null }
  if (!me.id) return null
  if (who.size > 500) who.clear()
  const out = { id: me.id, name: me.display_name ?? null, until: Date.now() + 10 * 60 * 1000 }
  who.set(key, out)
  return out
}

export const bearer = (req: Request) => req.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1] ?? null

// ── private JSON documents in Vercel Blob ───────────────────────────────────

export async function readDoc<T>(path: string): Promise<{ data: T; etag: string } | null> {
  const res = await get(path, { access: 'private', useCache: false })
  if (!res || res.statusCode !== 200) return null
  return { data: (await new Response(res.stream).json()) as T, etag: res.blob.etag }
}

/** Write a document. With `etag`, only if nobody changed it since it was read (returns false if they did). */
export async function writeDoc(path: string, data: unknown, etag?: string | null): Promise<boolean> {
  try {
    await put(path, JSON.stringify(data), {
      access: 'private',
      contentType: 'application/json',
      addRandomSuffix: false,
      allowOverwrite: etag !== null,
      ...(etag ? { ifMatch: etag } : {}),
      cacheControlMaxAge: 60,
    })
    return true
  } catch (e) {
    if (e instanceof BlobPreconditionFailedError || String(e).includes('already exists')) return false
    throw e
  }
}

export async function deleteDoc(path: string) {
  try {
    await del(path)
  } catch {
    /* already gone */
  }
}
