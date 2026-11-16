import { useSyncExternalStore } from 'react'
import { DEMO } from './demo-flag'

// Tiny persisted store. Everything here lives only on this device;
// nothing personal is ever written into the code or the repo.
//
// A device can hold several kid profiles. `useSettings()` / `getSettings()` return the device-wide
// settings merged with the *active* kid's fields, and `updateSettings()` routes each key to the
// right place, so most of the app never has to think about which kid is active.

export type ThemeName = 'bubblegum' | 'ocean' | 'mint' | 'grape' | 'sunshine'
export type Accessory = 'headphones' | 'bow' | 'crown' | 'ears'
export type Wish = { id: string; text: string; at: number }

export type Kid = {
  id: string
  kidName: string
  theme: ThemeName
  accessory: Accessory
  hideExplicit: boolean
  maxVolume: number // 0–100, caps the volume slider
  playlistId?: string // this kid's "Picked for you" playlist in Spotify
  ownAccount?: boolean // signs in with their own Spotify account instead of the device's
  approvedPlaylists: string[] // grown-up playlists this kid may play
  favorites: string[] // track uris
  wishes: Wish[]
}

type Device = {
  pinHash: string
  nightColors: boolean // cozy dark colors in the evening
  seasonal: boolean // holiday and season decorations
  setupDone: boolean
  kids: Kid[]
  activeKidId: string | null
  mixMeta: Record<string, { emoji: string; color: ThemeName; kid?: string }> // fallback if Spotify hides descriptions
  deletedMixes: string[] // playlist ids deleted here, so they never come back even if Spotify is slow to forget
}

export type Settings = Device & Omit<Kid, 'id'> & { kidId: string | null }

const KID_KEYS = new Set<keyof Kid>([
  'kidName', 'theme', 'accessory', 'hideExplicit', 'maxVolume', 'playlistId', 'ownAccount', 'approvedPlaylists', 'favorites', 'wishes',
])

const KEY = DEMO ? 'bopbox.settings.demo' : 'bopbox.settings'

export const newKid = (): Kid => ({
  id: crypto.randomUUID(),
  kidName: '',
  theme: 'bubblegum',
  accessory: 'headphones',
  hideExplicit: true,
  maxVolume: 70,
  approvedPlaylists: [],
  favorites: [],
  wishes: [],
})

const deviceDefaults: Device = {
  pinHash: '',
  nightColors: true,
  seasonal: true,
  setupDone: false,
  kids: [],
  activeKidId: null,
  mixMeta: {},
  deletedMixes: [],
}

function load(): Device {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return deviceDefaults
    const j = JSON.parse(raw)
    if (Array.isArray(j.kids)) return { ...deviceDefaults, ...j }
    // Migrate the original single-kid shape.
    const kid: Kid = { ...newKid(), ...pick(j, [...KID_KEYS] as string[]) }
    const has = !!(j.kidName || j.setupDone)
    return {
      ...deviceDefaults,
      pinHash: j.pinHash ?? '',
      nightColors: j.nightColors ?? true,
      setupDone: !!j.setupDone,
      mixMeta: j.mixMeta ?? {},
      kids: has ? [kid] : [],
      activeKidId: has ? kid.id : null,
    }
  } catch {
    return deviceDefaults
  }
}

function pick(o: Record<string, unknown>, keys: string[]) {
  return Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]))
}

let device = load()
let merged = merge(device)
const listeners = new Set<() => void>()

function merge(d: Device): Settings {
  const kid = d.kids.find((k) => k.id === d.activeKidId)
  const { id, ...fields } = kid ?? newKid()
  return { ...d, ...fields, kidId: kid ? id : null }
}

function commit(next: Device) {
  device = next
  merged = merge(device)
  try {
    localStorage.setItem(KEY, JSON.stringify(device))
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l())
}

export function getSettings() {
  return merged
}

/** Updates device settings and/or the active kid. Kid fields with no active kid start a new kid. */
export function updateSettings(patch: Partial<Settings> | ((s: Settings) => Partial<Settings>)) {
  const p = typeof patch === 'function' ? patch(merged) : patch
  const kidPatch: Partial<Kid> = {}
  const devPatch: Partial<Device> = {}
  for (const [k, v] of Object.entries(p)) {
    if (KID_KEYS.has(k as keyof Kid)) (kidPatch as Record<string, unknown>)[k] = v
    else if (k !== 'kidId') (devPatch as Record<string, unknown>)[k] = v
  }
  let next = { ...device, ...devPatch }
  if (Object.keys(kidPatch).length) {
    let kids = next.kids
    let active = next.activeKidId
    if (!kids.some((k) => k.id === active)) {
      const k = newKid()
      kids = [...kids, k]
      active = k.id
    }
    kids = kids.map((k) => (k.id === active ? { ...k, ...kidPatch } : k))
    next = { ...next, kids, activeKidId: active }
  }
  commit(next)
}

export function setActiveKid(id: string | null) {
  commit({ ...device, activeKidId: id })
}

export function removeKid(id: string) {
  const kids = device.kids.filter((k) => k.id !== id)
  commit({ ...device, kids, activeKidId: device.activeKidId === id ? kids[0]?.id ?? null : device.activeKidId })
}

export function useSettings() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => merged,
  )
}

export async function hashPin(pin: string) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`bopbox:${pin}`))
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, '0')).join('')
}

export function toggleFavorite(uri: string) {
  updateSettings((s) => ({
    favorites: s.favorites.includes(uri) ? s.favorites.filter((f) => f !== uri) : [uri, ...s.favorites],
  }))
}

export function isNightTime(d = new Date()) {
  const h = d.getHours() + d.getMinutes() / 60
  return h >= 19.5 || h < 6.5
}
