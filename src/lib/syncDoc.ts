// The settings Bop Box keeps in sync between a family's devices.
// Pure data + merge rules, shared by the app and the /api/sync server route.
//
// One document per Spotify account. It holds the kids whose music box lives in that account
// (keyed by the box playlist's id), the grown-up PIN, and mixes deleted from that account.
// Every value carries the time it was last changed, and merging keeps the newest one per field,
// so two devices editing different things at the same time never undo each other.

export type Stamped<T> = { v: T; at: number }

export const SYNCED_KID_FIELDS = [
  'kidName',
  'theme',
  'accessory',
  'hideExplicit',
  'maxVolume',
  'approvedPlaylists',
  'favorites',
  'wishes',
] as const
export type SyncedKidField = (typeof SYNCED_KID_FIELDS)[number]

export type KidDoc = Partial<Record<SyncedKidField, Stamped<unknown>>>

export type SyncDoc = {
  v: 1
  kids: Record<string, KidDoc>
  pin?: Stamped<string>
  deletedMixes?: string[]
}

export const emptyDoc = (): SyncDoc => ({ v: 1, kids: {} })

const newer = <T>(a: Stamped<T> | undefined, b: Stamped<T> | undefined) => (!a ? b : !b ? a : b.at > a.at ? b : a)

export function mergeKid(a: KidDoc = {}, b: KidDoc = {}): KidDoc {
  const out: KidDoc = {}
  for (const f of SYNCED_KID_FIELDS) {
    const m = newer(a[f], b[f])
    if (m) out[f] = m
  }
  return out
}

export function mergeDocs(a: SyncDoc, b: SyncDoc): SyncDoc {
  const kids: Record<string, KidDoc> = {}
  for (const id of new Set([...Object.keys(a.kids), ...Object.keys(b.kids)])) kids[id] = mergeKid(a.kids[id], b.kids[id])
  const pin = newer(a.pin, b.pin)
  const deletedMixes = [...new Set([...(a.deletedMixes ?? []), ...(b.deletedMixes ?? [])])].slice(-300)
  return { v: 1, kids, ...(pin ? { pin } : {}), ...(deletedMixes.length ? { deletedMixes } : {}) }
}

const isStamped = (x: unknown): x is Stamped<unknown> =>
  !!x && typeof x === 'object' && 'v' in x && typeof (x as Stamped<unknown>).at === 'number'

/** Keep only well-formed parts of an incoming document (the server never trusts its input). */
export function cleanDoc(x: unknown): SyncDoc | null {
  if (!x || typeof x !== 'object') return null
  const d = x as Partial<SyncDoc>
  const doc = emptyDoc()
  if (d.kids && typeof d.kids === 'object') {
    for (const [id, kid] of Object.entries(d.kids).slice(0, 20)) {
      if (!/^[A-Za-z0-9]{10,40}$/.test(id) || !kid || typeof kid !== 'object') continue
      const k: KidDoc = {}
      for (const f of SYNCED_KID_FIELDS) if (isStamped((kid as KidDoc)[f])) k[f] = (kid as KidDoc)[f]
      doc.kids[id] = k
    }
  }
  if (isStamped(d.pin) && typeof d.pin.v === 'string' && d.pin.v.length <= 128) doc.pin = d.pin as Stamped<string>
  if (Array.isArray(d.deletedMixes)) doc.deletedMixes = d.deletedMixes.filter((m) => typeof m === 'string' && m.length < 64).slice(-300)
  return doc
}
