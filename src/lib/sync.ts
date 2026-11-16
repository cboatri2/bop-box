import { DEMO } from './demo-flag'
import { logEvent } from './log'
import { getAccessToken, type Acct } from './spotify'
import {
  applyFromSync,
  getSettings,
  importKids,
  newKid,
  pinStamp,
  stampsOf,
  subscribe,
  type Kid,
} from './store'
import { SYNCED_KID_FIELDS, type KidDoc, type SyncDoc, type SyncedKidField } from './syncDoc'

// Keeps each kid's settings, the grown-up PIN and deleted mixes in sync between the family's devices.
// Each kid's settings live with the Spotify account their music box is in, so a device sees a kid's
// settings only once it's signed in to that account. See api/sync.ts for the server side.

const URL_ =
  DEMO || (import.meta.env.DEV && !import.meta.env.VITE_SYNC_URL)
    ? null // local development never touches the family's real settings unless asked to
    : (import.meta.env.VITE_SYNC_URL as string | undefined) ??
      (location.hostname.endsWith('github.io') ? 'https://bop-box.vercel.app/api/sync' : '/api/sync')

export const syncAvailable = () => URL_ !== null

let lastSynced = 0
let applying = false // true while applying another device's changes (so they aren't sent straight back)
export const lastSyncedAt = () => lastSynced

async function call(method: 'GET' | 'PUT', acct: Acct, body?: SyncDoc, retried = false): Promise<SyncDoc> {
  const token = await getAccessToken(retried, acct)
  const res = await fetch(URL_!, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (res.status === 401 && !retried) return call(method, acct, body, true)
  if (!res.ok) throw new Error(`sync ${method} ${res.status}`)
  return res.json()
}

/** This device's view of the active kid, as a sync document. */
function localDoc(kid: Kid): SyncDoc {
  const s = getSettings()
  const stamps = stampsOf(kid)
  const k: KidDoc = {}
  for (const f of SYNCED_KID_FIELDS) if (stamps[f]) k[f] = { v: kid[f], at: stamps[f]! }
  const pinAt = pinStamp(s)
  return {
    v: 1,
    kids: { [kid.playlistId!]: k },
    ...(s.pinHash && pinAt ? { pin: { v: s.pinHash, at: pinAt } } : {}),
    deletedMixes: s.deletedMixes.slice(-300),
  }
}

/** Takes anything newer from `remote`. Returns the fields that changed here. */
function takeNewer(kid: Kid, remote: SyncDoc): Set<SyncedKidField | 'pin'> {
  const s = getSettings()
  const mine = stampsOf(kid)
  const r = remote.kids[kid.playlistId!] ?? {}
  const fields: Partial<Kid> = {}
  const stamps: Partial<Record<SyncedKidField, number>> = {}
  const changed = new Set<SyncedKidField | 'pin'>()
  for (const f of SYNCED_KID_FIELDS) {
    const rv = r[f]
    if (rv && rv.at > (mine[f] ?? 0)) {
      ;(fields as Record<string, unknown>)[f] = rv.v
      stamps[f] = rv.at
      if (JSON.stringify(rv.v) !== JSON.stringify(kid[f])) changed.add(f)
    }
  }
  const pin = remote.pin && remote.pin.at > pinStamp(s) ? remote.pin : undefined
  if (pin && pin.v !== s.pinHash) changed.add('pin')
  const newDeleted = (remote.deletedMixes ?? []).filter((id) => !s.deletedMixes.includes(id))
  if (Object.keys(stamps).length || pin || newDeleted.length) {
    applying = true
    try {
      applyFromSync(kid.id, fields, stamps, { pin, deletedMixes: newDeleted })
    } finally {
      applying = false
    }
  }
  return changed
}

/** True when this device has something the server doesn't. */
function hasNews(kid: Kid, remote: SyncDoc) {
  const s = getSettings()
  const mine = stampsOf(kid)
  const r = remote.kids[kid.playlistId!] ?? {}
  if (SYNCED_KID_FIELDS.some((f) => (mine[f] ?? 0) > (r[f]?.at ?? 0))) return true
  if (pinStamp(s) > (remote.pin?.at ?? 0)) return true
  const theirs = new Set(remote.deletedMixes ?? [])
  return s.deletedMixes.some((id) => !theirs.has(id))
}

let running: Promise<Set<string>> | null = null

/**
 * Sync the active kid with their account's document: take what's newer there, send what's newer here.
 * Resolves with the fields that changed on this device.
 */
export function syncActiveKid(): Promise<Set<string>> {
  if (!URL_) return Promise.resolve(new Set())
  running ??= (async () => {
    const kidId = getSettings().kidId
    const kidNow = () => getSettings().kids.find((k) => k.id === kidId)
    let kid = kidNow()
    if (!kid?.playlistId) return new Set<string>()
    const stillHere = () => getSettings().kidId === kidId && kidNow()?.playlistId === kid!.playlistId
    try {
      let remote = await call('GET', 'main')
      if (!stillHere()) return new Set<string>()
      const changed = takeNewer(kid, remote)
      kid = kidNow()!
      if (hasNews(kid, remote)) {
        remote = await call('PUT', 'main', localDoc(kid))
        if (stillHere()) for (const f of takeNewer(kidNow()!, remote)) changed.add(f)
      }
      lastSynced = Date.now()
      if (changed.size) logEvent(`Got ${kid.kidName}'s newer settings from another device (${[...changed].join(', ')})`)
      return changed as Set<string>
    } catch (e) {
      logEvent(`Couldn't sync settings (${e instanceof Error ? e.message : 'unknown'})`)
      return new Set<string>()
    }
  })().finally(() => (running = null))
  return running
}

// ── automatic syncing ───────────────────────────────────────────────────────

/**
 * Send changes made on this device shortly after they happen. (Checking for other devices' changes
 * happens with every library refresh: see syncActiveKid.) `onChanged` hears about anything new.
 */
export function startAutoSync(onChanged: (fields: Set<string>) => void) {
  if (!URL_) return () => {}
  let timer = 0
  const run = () => void syncActiveKid().then((c) => c.size && onChanged(c))
  const sig = () => {
    const s = getSettings()
    const k = s.kids.find((x) => x.id === s.kidId)
    return JSON.stringify([s.kidId, k?.playlistId, k && stampsOf(k), pinStamp(s), s.deletedMixes.length])
  }
  let last = sig()
  const unsub = subscribe(() => {
    const now = sig()
    if (now === last) return
    last = now
    if (applying) return
    clearTimeout(timer)
    timer = window.setTimeout(run, 1500)
  })
  return () => {
    unsub()
    clearTimeout(timer)
  }
}

// ── a brand-new device ──────────────────────────────────────────────────────

/**
 * On a device that hasn't been set up yet, look for kids already set up in the signed-in account.
 * Returns how many were brought in (0 = nothing found, so set up from scratch).
 */
export async function importExistingSetup(): Promise<number> {
  if (!URL_) return 0
  try {
    const doc = await call('GET', 'device')
    const entries = Object.entries(doc.kids).filter(([, k]) => k.kidName?.v)
    if (!entries.length || !doc.pin?.v) return 0
    const kids: Kid[] = entries.map(([boxId, k]) => {
      const kid: Kid = { ...newKid(), playlistId: boxId, stamps: {} }
      for (const f of SYNCED_KID_FIELDS) {
        const st = k[f]
        if (!st) continue
        ;(kid as Record<string, unknown>)[f] = st.v
        kid.stamps![f] = st.at
      }
      return kid
    })
    importKids(kids, doc.pin, doc.deletedMixes ?? [])
    lastSynced = Date.now()
    logEvent(`Brought in ${kids.map((k) => k.kidName).join(' and ')} from another device`)
    return kids.length
  } catch (e) {
    logEvent(`Couldn't look for an existing setup (${e instanceof Error ? e.message : 'unknown'})`)
    return 0
  }
}
