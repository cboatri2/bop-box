import { useSyncExternalStore } from 'react'
import * as sp from './spotify'
import type { Song, Track } from './spotify'
import { toast } from './toast'
import { DEMO } from './demo-flag'
import { logEvent } from './log'

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
    if (state.sdk === 'loading') {
      logEvent(`In-page player: no answer after 12s (Spotify SDK ${window.Spotify ? 'loaded' : 'not loaded'})`)
      set({ sdk: 'unsupported' })
    }
  }, 12000)

  window.onSpotifyWebPlaybackSDKReady = () => {
    logEvent('In-page player: Spotify player script ready')
    createSdk(timeout)
  }
  void checkProtectedAudio()

  const script = document.createElement('script')
  script.src = 'https://sdk.scdn.co/spotify-player.js'
  script.async = true
  script.onerror = () => {
    logEvent("In-page player: Spotify's player script didn't load")
    set({ sdk: 'unsupported' })
  }
  document.body.appendChild(script)

  // Speakers (Spotify Connect) don't push events, so poll while visible.
  setInterval(() => {
    if (document.hidden || !state.deviceId || state.deviceId === state.sdkDeviceId) return
    void pollRemote()
  }, 3000)

  // Sleep timer
  setInterval(tickSleep, 500)

  // iPhone/iPad: the first taps unlock audio so the in-page player can start.
  const onTap = () => {
    if (state.sdk === 'ready') return document.removeEventListener('touchend', onTap, true)
    wakeInPagePlayer()
  }
  document.addEventListener('touchend', onTap, true)
}

function createSdk(timeout?: ReturnType<typeof setTimeout>) {
    if (!window.Spotify) return
    sdk = new window.Spotify.Player({
      name: 'Bop Box',
      getOAuthToken: (cb: (t: string) => void) => {
        if (state.sdk !== 'ready') logEvent('In-page player: Spotify asked for the sign-in')
        sp.getAccessToken().then(
          (t) => {
            if (state.sdk !== 'ready') logEvent('In-page player: sign-in handed over')
            cb(t)
          },
          (e) => logEvent(`In-page player: couldn't hand over the sign-in (${e instanceof Error ? e.message : e})`),
        )
      },
      volume: state.volume * maxVolume,
    })
    sdk.addListener('ready', ({ device_id }: { device_id: string }) => {
      if (timeout) clearTimeout(timeout)
      if (state.sdk !== 'ready') logEvent('In-page player: ready')
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
    sdk.addListener('initialization_error', ({ message }: { message?: string }) => {
      logEvent(`In-page player: initialization error (${message ?? 'no details'})`)
      if (timeout) clearTimeout(timeout)
      set({ sdk: 'unsupported' })
    })
    sdk.addListener('authentication_error', ({ message }: { message?: string }) => {
      logEvent(`In-page player: sign-in error (${message ?? 'no details'})`)
      if (timeout) clearTimeout(timeout)
      set({ sdk: 'unsupported' })
    })
    sdk.addListener('account_error', ({ message }: { message?: string }) => {
      logEvent(`In-page player: account error (${message ?? 'no details'})`)
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
      logEvent(`In-page player: connect answered ${ok ? 'yes' : 'no'}`)
      if (!ok) {
        logEvent('In-page player: Spotify refused to connect')
        set({ sdk: 'unsupported' })
      }
    })
  }

/** Spotify's player needs the browser's protected-audio support (EME). Record what this device offers. */
async function checkProtectedAudio() {
  const w = window as unknown as Record<string, unknown>
  const has = ['MediaKeys', 'WebKitMediaKeys', 'MediaSource', 'ManagedMediaSource'].filter((k) => k in w)
  logEvent(`In-page player: browser has ${has.join(', ') || 'no media features'}`)
  if (!navigator.requestMediaKeySystemAccess) return logEvent('In-page player: no protected-audio support')
  const cfg = [{ initDataTypes: ['cenc', 'sinf', 'skd'], audioCapabilities: [{ contentType: 'audio/mp4; codecs="mp4a.40.2"' }, { contentType: 'audio/mp4; codecs="flac"' }] }]
  for (const ks of ['com.apple.fps', 'com.apple.fps.1_0', 'com.widevine.alpha']) {
    const answer = await Promise.race([
      navigator.requestMediaKeySystemAccess(ks, cfg).then(() => 'yes', (e) => `no (${e?.name ?? e})`),
      new Promise<string>((r) => setTimeout(() => r('no answer in 5s'), 5000)),
    ])
    logEvent(`In-page player: protected audio ${ks}: ${answer}`)
  }
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

let lastWake = 0
let wakeTries = 0
/**
 * Safari on iPhone/iPad won't let the in-page player start until someone taps. Call this from a tap:
 * it unlocks audio and asks Spotify to connect again if the player hasn't come up yet.
 */
export function wakeInPagePlayer(why = 'tap') {
  if (DEMO || !sdk || state.sdk === 'ready' || state.sdk === 'premium-needed') return
  unlockAudio()
  if (Date.now() - lastWake < 4000) return
  lastWake = Date.now()
  wakeTries++
  if (state.sdk === 'unsupported') set({ sdk: 'loading' })
  if (wakeTries % 2 === 0) {
    // Connecting again didn't help last time: build a fresh player inside this tap.
    logEvent(`In-page player: starting a fresh player after a ${why}`)
    try {
      sdk.disconnect()
    } catch {
      /* ignore */
    }
    createSdk()
    unlockAudio()
    const fresh = sdk
    setTimeout(() => {
      if (sdk === fresh && state.sdk === 'loading') set({ sdk: 'unsupported' })
    }, 8000)
    return
  }
  logEvent(`In-page player: trying again after a ${why}`)
  const player = sdk
  player.connect().then((ok) => {
    logEvent(`In-page player: connect after ${why} answered ${ok ? 'yes' : 'no'}`)
    setTimeout(() => {
      if (sdk === player && state.sdk === 'loading') set({ sdk: 'unsupported' })
    }, 8000)
  })
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
        : state.sdk === 'loading'
          ? 'The music is still waking up. Try again in a few seconds!'
          : onAppleMobile()
            ? 'Tap “Wake up music” first!'
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

/** iPhone or iPad (iPads report themselves as Macs, so check for touch too). */
export function onAppleMobile() {
  return /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}
export const appleDeviceName = () => (/iPhone/.test(navigator.userAgent) ? 'iPhone' : 'iPad')
