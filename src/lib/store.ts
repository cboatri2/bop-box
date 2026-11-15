import { useSyncExternalStore } from 'react'

// Tiny persisted store. Everything here lives only in this browser —
// nothing personal is ever written into the code or the repo.

export type ThemeName = 'bubblegum' | 'ocean' | 'mint' | 'grape' | 'sunshine'
export type Accessory = 'headphones' | 'bow' | 'crown' | 'ears'

export type Settings = {
  kidName: string
  theme: ThemeName
  accessory: Accessory
  pinHash: string
  hideExplicit: boolean
  maxVolume: number // 0–100, caps the kid's volume slider
  nightColors: boolean // cozy dark colors in the evening
  playlistId?: string
  setupDone: boolean
  favorites: string[] // track uris
  wishes: { id: string; text: string; at: number }[]
}

const KEY = 'bopbox.settings'

const defaults: Settings = {
  kidName: '',
  theme: 'bubblegum',
  accessory: 'headphones',
  pinHash: '',
  hideExplicit: true,
  maxVolume: 70,
  nightColors: true,
  setupDone: false,
  favorites: [],
  wishes: [],
}

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? { ...defaults, ...JSON.parse(raw) } : defaults
  } catch {
    return defaults
  }
}

let state = load()
const listeners = new Set<() => void>()

export function getSettings() {
  return state
}

export function updateSettings(patch: Partial<Settings> | ((s: Settings) => Partial<Settings>)) {
  const p = typeof patch === 'function' ? patch(state) : patch
  state = { ...state, ...p }
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l())
}

export function resetSettings() {
  state = defaults
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l())
}

export function useSettings() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state,
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
