import { BlobPreconditionFailedError, get, put } from '@vercel/blob'
import { createHash } from 'node:crypto'
import { cleanDoc, emptyDoc, mergeDocs, type SyncDoc } from '../src/lib/syncDoc.js'

// Family settings sync for Bop Box.
//
// The caller proves who they are with their Spotify access token: we ask Spotify "who is this?"
// and only ever read or write that account's own document. Nothing else is stored: no tokens,
// no emails, just kids' Bop Box settings. Documents live in a private Vercel Blob store.

const ORIGINS = new Set(['https://bop-box.vercel.app', 'https://cboatri2.github.io', 'http://127.0.0.1:5173'])
const MAX_BYTES = 64 * 1024

function cors(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') ?? ''
  return ORIGINS.has(origin)
    ? {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        'Access-Control-Max-Age': '86400',
        Vary: 'Origin',
      }
    : { Vary: 'Origin' }
}

const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...cors(req) },
  })

// Spotify user id per access token, remembered briefly so each sync doesn't ask Spotify again.
const who = new Map<string, { id: string; until: number }>()

async function spotifyUser(req: Request): Promise<string | null> {
  const token = req.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1]
  if (!token) return null
  const key = createHash('sha256').update(token).digest('hex')
  const hit = who.get(key)
  if (hit && hit.until > Date.now()) return hit.id
  const res = await fetch('https://api.spotify.com/v1/me', { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) return null
  const me = (await res.json()) as { id?: string }
  if (!me.id) return null
  if (who.size > 500) who.clear()
  who.set(key, { id: me.id, until: Date.now() + 10 * 60 * 1000 })
  return me.id
}

const pathFor = (userId: string) => `accounts/${createHash('sha256').update(`bopbox:${userId}`).digest('hex')}.json`

async function read(path: string): Promise<{ doc: SyncDoc; etag: string } | null> {
  const res = await get(path, { access: 'private', useCache: false })
  if (!res || res.statusCode !== 200) return null
  const doc = cleanDoc(await new Response(res.stream).json()) ?? emptyDoc()
  return { doc, etag: res.blob.etag }
}

export function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: cors(req) })
}

export async function GET(req: Request) {
  const user = await spotifyUser(req)
  if (!user) return json(req, { error: 'not signed in' }, 401)
  const found = await read(pathFor(user))
  return json(req, found?.doc ?? emptyDoc())
}

export async function PUT(req: Request) {
  const user = await spotifyUser(req)
  if (!user) return json(req, { error: 'not signed in' }, 401)
  const text = await req.text()
  if (text.length > MAX_BYTES) return json(req, { error: 'too big' }, 413)
  let incoming: SyncDoc | null = null
  try {
    incoming = cleanDoc(JSON.parse(text))
  } catch {
    /* fall through */
  }
  if (!incoming) return json(req, { error: 'bad document' }, 400)

  const path = pathFor(user)
  // Read, merge, write only if nobody else wrote in between; otherwise try again.
  for (let attempt = 0; attempt < 4; attempt++) {
    const current = await read(path)
    const merged = mergeDocs(current?.doc ?? emptyDoc(), incoming)
    try {
      await put(path, JSON.stringify(merged), {
        access: 'private',
        contentType: 'application/json',
        addRandomSuffix: false,
        allowOverwrite: !!current,
        ...(current ? { ifMatch: current.etag } : {}),
        cacheControlMaxAge: 60,
      })
      return json(req, merged)
    } catch (e) {
      const raced = e instanceof BlobPreconditionFailedError || (!current && String(e).includes('already exists'))
      if (!raced) throw e
    }
  }
  return json(req, { error: 'busy, try again' }, 409)
}
