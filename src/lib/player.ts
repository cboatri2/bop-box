import { useSyncExternalStore } from 'react'
import * as sp from './spotify'
import type { Song, Track } from './spotify'
import { toast } from './toast'
import { DEMO } from './demo-flag'

// ── Spotify Web Playback SDK (minimal typings) ──────────────────────────────

type SdkTrack = {
  id: string | null
  uri: string
  name: string
  duration_ms: number
  artists: { name: string }[]
  album: { name: string; images: sp.Image[] }
  linked_from?: { uri: string | null; id: string | null }
}

type SdkState = {
  paused: boolean
  position: number
  duration: number
  track_window: { current_track: SdkTrack | null }
}

type SdkPlayer = {
  connect(): Promise<boolean>
  disconnect(): void
  addListener(ev: string, cb: (arg: any) => void): void
  togglePlay(): Promise<void>
  pause(): Promise<void>
  resume(): Promise<void>
  nextTrack(): Promise<void>
  previousTrack(): Promise<void>
  seek(ms: number): Promise<void>
  setVolume(v: number): Promise<void>
  activateElement(): Promise<void>
}

declare global {
  interface Window {
    onSpotifyWebPlaybackSDKReady?: () => void
    Spotify?: { Player: new (opts: object) => SdkPlayer }
  }
}

// ── state ───────────────────────────────────────────────────────────────────

export type NowTrack = Pick<Track, 'uri' | 'name' | 'artists' | 'album' | 'duration_ms'> & { id: string }

export type PlayerState = {
  sdk: 'loading' | 'ready' | 'unsupported' | 'premium-needed'
  sdkDeviceId: string | null
  deviceId: string | null // where music plays
  deviceName: string
  track: NowTrack | null
  paused: boolean
  position: number
  duration: number
  stamp: number // when position was measured
  volume: number // 0–1, the kid's slider (before the grown-up cap)
  sleepEndsAt: number | null
  sleepy: boolean // shows the "goodnight" screen after the sleep timer
}

let state: PlayerState = {
  sdk: 'loading',
  sdkDeviceId: null,
  deviceId: null,
  deviceName: 'This device',
  track: null,
  paused: true,
  position: 0,
  duration: 0,
  stamp: Date.now(),
  volume: 0.8,
  sleepEndsAt: null,
  sleepy: false,
}

const listeners = new Set<() => void>()
function set(patch: Partial<PlayerState>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

export const getPlayer = () => state
export function usePlayer() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state,
  )
}

/** Live position in ms, interpolated between updates. */
export function livePosition(s: PlayerState) {
  if (s.paused) return s.position
  return Math.min(s.duration, s.position + (Date.now() - s.stamp))
}

// ── the guard: only approved songs may ever play ───────────────────────────

let approved = new Set<string>()
let maxVolume = 0.7
let ownsRemote = false // true after Bop Box itself started music on a speaker

export function setApproved(songs: Song[]) {
  approved = new Set(songs.flatMap((s) => [s.uri, s.id && `spotify:track:${s.id}`, s.linked_from?.uri].filter(Boolean) as string[]))
}

function isApproved(t: { uri: string; id?: string | null; linked_from?: { uri?: string | null } }) {
  return (
    approved.has(t.uri) ||
    (!!t.id && approved.has(`spotify:track:${t.id}`)) ||
    (!!t.linked_from?.uri && approved.has(t.linked_from.uri))
  )
}

let lastBlock = 0
async function block() {
  try {
    if (state.deviceId === state.sdkDeviceId) await sdk?.pause()
    else if (state.deviceId) await sp.pausePlayback(state.deviceId)
  } catch {
    /* ignore */
  }
  if (Date.now() - lastBlock > 4000) toast("That song isn't on your list yet!", '🙈')
  lastBlock = Date.now()
}

// ── SDK bootstrap ───────────────────────────────────────────────────────────

let sdk: SdkPlayer | null = null
let started = false

export function initPlayer(cap: number) {
  maxVolume = cap / 100
  if (DEMO) return set({ sdk: 'ready', sdkDeviceId: 'demo', deviceId: 'demo' })
  if (started) return
  started = true

  const timeout = setTimeout(() => {
    if (state.sdk === 'loading') set({ sdk: 'unsupported' })
  }, 12000)

  window.onSpotifyWebPlaybackSDKReady = () => createSdk(timeout)

  const script = document.createElement('script')
  script.src = 'https://sdk.scdn.co/spotify-player.js'
  script.async = true
  script.onerror = () => set({ sdk: 'unsupported' })
  document.body.appendChild(script)

  // Speakers (Spotify Connect) don't push events, so poll while visible.
  setInterval(() => {
    if (document.hidden || !state.deviceId || state.deviceId === state.sdkDeviceId) return
    void pollRemote()
  }, 3000)

  // Sleep timer
  setInterval(tickSleep, 500)
}

function createSdk(timeout?: ReturnType<typeof setTimeout>) {
    if (!window.Spotify) return
    sdk = new window.Spotify.Player({
      name: 'Bop Box',
      getOAuthToken: (cb: (t: string) => void) => {
        sp.getAccessToken().then(cb, () => {})
      },
      volume: state.volume * maxVolume,
    })
    sdk.addListener('ready', ({ device_id }: { device_id: string }) => {
      if (timeout) clearTimeout(timeout)
      set({
        sdk: 'ready',
        sdkDeviceId: device_id,
        // Keep a speaker the kid already picked; otherwise play right here.
        ...(state.deviceId ? {} : { deviceId: device_id, deviceName: 'This device' }),
      })
    })
    sdk.addListener('not_ready', () => {
      // device went offline; it'll reconnect itself
    })
    sdk.addListener('initialization_error', () => {
      if (timeout) clearTimeout(timeout)
      set({ sdk: 'unsupported' })
    })
    sdk.addListener('authentication_error', () => {
      if (timeout) clearTimeout(timeout)
      set({ sdk: 'unsupported' })
    })
    sdk.addListener('account_error', () => {
      if (timeout) clearTimeout(timeout)
      set({ sdk: 'premium-needed' })
    })
    sdk.addListener('autoplay_failed', () => {
      toast('Tap play to start the music!', '👆')
    })
    sdk.addListener('player_state_changed', (s: SdkState | null) => {
      if (state.deviceId !== state.sdkDeviceId) return
      if (!s) {
        set({ paused: true })
        return
      }
      const t = s.track_window.current_track
      if (t && !isApproved(t) && !s.paused) void block()
      set({
        track: t ? { ...t, id: t.id ?? t.uri.split(':').pop()!, duration_ms: t.duration_ms } : null,
        paused: s.paused,
        position: s.position,
        duration: s.duration,
        stamp: Date.now(),
      })
    })
    sdk.connect().then((ok) => {
      if (!ok) set({ sdk: 'unsupported' })
    })
  }

/** A different kid (maybe a different Spotify account) is listening now: reconnect the in-page player. */
export function restartPlayer() {
  if (DEMO || !started) return
  ownsRemote = false
  try {
    sdk?.disconnect()
  } catch {
    /* ignore */
  }
  sdk = null
  set({ sdk: 'loading', sdkDeviceId: null, deviceId: null, deviceName: 'This device', track: null, paused: true })
  if (window.Spotify) createSdk()
}

async function pollRemote() {
  try {
    const p = await sp.getPlayback()
    if (!p || !p.device || p.device.id !== state.deviceId) {
      if (!state.paused) set({ paused: true, stamp: Date.now(), position: livePosition(state) })
      return
    }
    if (p.item && ownsRemote && p.is_playing && !isApproved(p.item)) void block()
    set({
      track: p.item ?? state.track,
      paused: !p.is_playing,
      position: p.progress_ms ?? 0,
      duration: p.item?.duration_ms ?? state.duration,
      stamp: Date.now(),
    })
  } catch {
    /* transient */
  }
}

// ── controls ────────────────────────────────────────────────────────────────

/** Must be called synchronously inside a tap handler (iOS/Safari audio unlock). */
export function unlockAudio() {
  void sdk?.activateElement?.().catch(() => {})
}

export async function playSongs(songs: Song[], index: number) {
  unlockAudio()
  if (DEMO) {
    const s = songs[index]
    set({ track: { ...s }, paused: false, position: 0, duration: s.duration_ms, stamp: Date.now(), sleepy: false })
    return true
  }
  const dev = state.deviceId
  if (!dev) {
    toast(
      state.sdk === 'premium-needed'
        ? 'This Spotify account needs Premium to play music.'
        : 'Pick a speaker to play on first!',
      '🔈',
    )
    return false
  }
  // Send a window around the chosen song so huge lists still work.
  const start = Math.max(0, index - 50)
  const slice = songs.slice(start, start + 150)
  const uris = slice.map((s) => s.uri)
  const offset = index - start
  const s = songs[index]
  set({
    track: { ...s },
    paused: false,
    position: 0,
    duration: s.duration_ms,
    stamp: Date.now(),
    sleepy: false,
  })
  try {
    await sp.playUris(dev, uris, offset)
  } catch (e) {
    if (e instanceof sp.SpotifyError && e.status === 404) {
      // Device asleep — wake it, then retry once.
      try {
        await sp.transferTo(dev)
        await new Promise((r) => setTimeout(r, 600))
        await sp.playUris(dev, uris, offset)
      } catch {
        set({ paused: true })
        toast("Couldn't reach that speaker. Try another one!", '😕')
        return false
      }
    } else {
      set({ paused: true })
      toast(
        e instanceof sp.SpotifyError && e.reason === 'PREMIUM_REQUIRED'
          ? 'Spotify Premium is needed to play music.'
          : 'Oops! The music hiccuped. Try again?',
        '😕',
      )
      return false
    }
  }
  ownsRemote = dev !== state.sdkDeviceId
  // Loop the approved list so Spotify never wanders off into "autoplay".
  sp.setRepeat(dev, 'context').catch(() => {})
  applyVolume()
  return true
}

export async function togglePlay() {
  unlockAudio()
  if (DEMO) return set({ paused: !state.paused, position: livePosition(state), stamp: Date.now() })
  const dev = state.deviceId
  if (!dev || !state.track) return
  const wasPaused = state.paused
  set({ paused: !wasPaused, position: livePosition(state), stamp: Date.now() })
  try {
    if (dev === state.sdkDeviceId && sdk) await (wasPaused ? sdk.resume() : sdk.pause())
    else await (wasPaused ? sp.resumePlayback(dev) : sp.pausePlayback(dev))
  } catch {
    set({ paused: wasPaused })
  }
}

export async function skip(dir: 1 | -1) {
  unlockAudio()
  const dev = state.deviceId
  if (!dev) return
  try {
    if (dev === state.sdkDeviceId && sdk) await (dir === 1 ? sdk.nextTrack() : sdk.previousTrack())
    else {
      await (dir === 1 ? sp.nextTrack(dev) : sp.prevTrack(dev))
      setTimeout(pollRemote, 500)
    }
  } catch {
    /* ignore */
  }
}

export async function seek(ms: number) {
  const dev = state.deviceId
  if (!dev) return
  set({ position: ms, stamp: Date.now() })
  try {
    if (dev === state.sdkDeviceId && sdk) await sdk.seek(ms)
    else await sp.seekTo(dev, ms)
  } catch {
    /* ignore */
  }
}

let volTimer: ReturnType<typeof setTimeout> | undefined
let fade = 1 // sleep-timer fade multiplier

function applyVolume() {
  const v = state.volume * maxVolume * fade
  const dev = state.deviceId
  if (!dev) return
  if (dev === state.sdkDeviceId && sdk) void sdk.setVolume(v).catch(() => {})
  else {
    clearTimeout(volTimer)
    volTimer = setTimeout(() => sp.setRemoteVolume(dev, v * 100).catch(() => {}), 250)
  }
}

export function setVolume(v: number) {
  set({ volume: Math.max(0, Math.min(1, v)) })
  applyVolume()
}

export function setMaxVolume(cap: number) {
  maxVolume = cap / 100
  applyVolume()
}

// ── speakers ────────────────────────────────────────────────────────────────

export async function listDevices() {
  const devices = await sp.getDevices().catch(() => [])
  return devices.filter((d) => d.id && !d.is_restricted && d.id !== state.sdkDeviceId)
}

export async function chooseDevice(id: string, name: string) {
  const wasPlaying = !state.paused && state.track
  const from = state.deviceId
  set({ deviceId: id, deviceName: id === state.sdkDeviceId ? 'This device' : name })
  if (from && from !== id) {
    try {
      await sp.transferTo(id)
      if (wasPlaying) await sp.resumePlayback(id)
      ownsRemote = id !== state.sdkDeviceId
      applyVolume()
    } catch {
      toast("Couldn't switch speakers.", '😕')
    }
  }
}

// ── sleep timer ─────────────────────────────────────────────────────────────

const FADE_MS = 20000

export function setSleepTimer(minutes: number | null) {
  fade = 1
  set({ sleepEndsAt: minutes ? Date.now() + minutes * 60000 : null, sleepy: false })
  applyVolume()
}

function tickSleep() {
  const end = state.sleepEndsAt
  if (!end) return
  const left = end - Date.now()
  if (left <= 0) {
    set({ sleepEndsAt: null, sleepy: true })
    const dev = state.deviceId
    const done = () => {
      fade = 1
      applyVolume()
    }
    if (dev === state.sdkDeviceId && sdk) void sdk.pause().finally(() => setTimeout(done, 400))
    else if (dev) void sp.pausePlayback(dev).catch(() => {}).finally(() => setTimeout(done, 400))
    set({ paused: true, position: livePosition(state), stamp: Date.now() })
    return
  }
  if (left < FADE_MS && !state.paused) {
    const f = Math.max(0.02, left / FADE_MS)
    if (Math.abs(f - fade) > 0.04) {
      fade = f
      applyVolume()
    }
  }
}

export function wakeUp() {
  set({ sleepy: false })
}
