import { cleanDoc, emptyDoc, mergeDocs, type SyncDoc } from '../src/lib/syncDoc.js'
import { bearer, hash, json, preflight, readDoc, spotifyUserOf, writeDoc } from './_shared.js'

// Family settings sync for Bop Box.
//
// The caller proves who they are with their Spotify access token: we ask Spotify "who is this?"
// and only ever read or write that account's own document. Nothing else is stored: no tokens,
// no emails, just kids' Bop Box settings. Documents live in a private Vercel Blob store.

const MAX_BYTES = 64 * 1024
const pathFor = (userId: string) => `accounts/${hash(`bopbox:${userId}`)}.json`

async function read(path: string) {
  const found = await readDoc<unknown>(path)
  return found ? { doc: cleanDoc(found.data) ?? emptyDoc(), etag: found.etag } : null
}

export const OPTIONS = preflight

export async function GET(req: Request) {
  const user = await spotifyUserOf(bearer(req))
  if (!user) return json(req, { error: 'not signed in' }, 401)
  const found = await read(pathFor(user.id))
  return json(req, found?.doc ?? emptyDoc())
}

export async function PUT(req: Request) {
  const user = await spotifyUserOf(bearer(req))
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

  const path = pathFor(user.id)
  // Read, merge, write only if nobody else wrote in between; otherwise try again.
  for (let attempt = 0; attempt < 4; attempt++) {
    const current = await read(path)
    const merged = mergeDocs(current?.doc ?? emptyDoc(), incoming)
    if (await writeDoc(path, merged, current?.etag ?? null)) return json(req, merged)
  }
  return json(req, { error: 'busy, try again' }, 409)
}
