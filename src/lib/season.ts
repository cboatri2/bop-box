import { useEffect, useState } from 'react'
import { useSettings } from './store'

// Holiday and season decorations, picked from the date on this device.
// Holidays win over seasons; each comes with its own colors, falling bits, a hat for Bop, and a hello.

export type SeasonId =
  | 'christmas'
  | 'newyear'
  | 'winter'
  | 'valentines'
  | 'stpatricks'
  | 'easter'
  | 'spring'
  | 'july4'
  | 'summer'
  | 'fall'
  | 'halloween'
  | 'thanksgiving'

export type Hat = 'santa' | 'party' | 'beanie' | 'hearts' | 'shamrock' | 'bunny' | 'flower' | 'sunglasses' | 'leaf' | 'witch' | 'pilgrim'

export type Season = {
  id: SeasonId
  label: string
  /** Falling (or rising) bits. 'snow' and 'bubbles' are drawn as dots, everything else is emoji. */
  bits: string[]
  rise?: boolean
  hat: Hat
  /** Line under the hello, all season long. */
  sub: string
  /** Replaces "Good morning" on the day itself. */
  dayHello?: string
  isDay?: (d: Date) => boolean
}

const md = (d: Date) => (d.getMonth() + 1) * 100 + d.getDate() // e.g. Dec 25 → 1225
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString()
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)

/** Western Easter Sunday (anonymous Gregorian algorithm). */
export function easterSunday(y: number) {
  const a = y % 19
  const b = Math.floor(y / 100)
  const c = y % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(y, month - 1, day)
}

/** US Thanksgiving: the fourth Thursday of November. */
export function thanksgiving(y: number) {
  const first = new Date(y, 10, 1)
  return new Date(y, 10, 1 + ((4 - first.getDay() + 7) % 7) + 21)
}

export const SEASONS: Record<SeasonId, Season> = {
  christmas: {
    id: 'christmas',
    label: 'Christmas',
    bits: ['snow'],
    hat: 'santa',
    sub: 'Ready for some merry music? 🎄',
    dayHello: 'Merry Christmas',
    isDay: (d) => md(d) === 1225,
  },
  newyear: {
    id: 'newyear',
    label: "New Year's",
    bits: ['🎉', '✨', '🎊', '⭐'],
    hat: 'party',
    sub: 'Dance into the new year! 🎉',
    dayHello: 'Happy New Year',
    isDay: (d) => md(d) === 101,
  },
  winter: { id: 'winter', label: 'Winter', bits: ['snow'], hat: 'beanie', sub: 'Cozy songs for a snowy day? ❄️' },
  valentines: {
    id: 'valentines',
    label: "Valentine's Day",
    bits: ['💖', '💕', '💗', '❤️'],
    hat: 'hearts',
    sub: 'Songs you love, all in one place 💕',
    dayHello: "Happy Valentine's Day",
    isDay: (d) => md(d) === 214,
  },
  stpatricks: {
    id: 'stpatricks',
    label: "St. Patrick's Day",
    bits: ['☘️', '🍀', '☘️', '🌈'],
    hat: 'shamrock',
    sub: 'Feeling lucky? Pick a song! ☘️',
    dayHello: "Happy St. Patrick's Day",
    isDay: (d) => md(d) === 317,
  },
  easter: {
    id: 'easter',
    label: 'Easter',
    bits: ['🌷', '🐣', '🌼', '🥚'],
    hat: 'bunny',
    sub: 'Hop to a happy song! 🐣',
    dayHello: 'Happy Easter',
    isDay: (d) => sameDay(d, easterSunday(d.getFullYear())),
  },
  spring: { id: 'spring', label: 'Spring', bits: ['🌸', '🌼', '🦋', '🌸'], hat: 'flower', sub: 'Fresh songs for a sunny spring day 🌸' },
  july4: {
    id: 'july4',
    label: 'Fourth of July',
    bits: ['⭐', '🎆', '✨', '🇺🇸'],
    hat: 'party',
    sub: 'Turn it up for the Fourth! 🎆',
    dayHello: 'Happy Fourth of July',
    isDay: (d) => md(d) === 704,
  },
  summer: { id: 'summer', label: 'Summer', bits: ['bubbles'], rise: true, hat: 'sunglasses', sub: 'Summer songs, turned up! ☀️' },
  fall: { id: 'fall', label: 'Fall', bits: ['🍂', '🍁', '🍂', '🍃'], hat: 'leaf', sub: 'Cozy songs for crunchy leaves 🍂' },
  halloween: {
    id: 'halloween',
    label: 'Halloween',
    bits: ['🎃', '🍂', '🦇', '🍬'],
    hat: 'witch',
    sub: 'Spooky-fun songs, anyone? 🎃',
    dayHello: 'Happy Halloween',
    isDay: (d) => md(d) === 1031,
  },
  thanksgiving: {
    id: 'thanksgiving',
    label: 'Thanksgiving',
    bits: ['🍂', '🍁', '🥧', '🍂'],
    hat: 'pilgrim',
    sub: 'So thankful for good music 🧡',
    dayHello: 'Happy Thanksgiving',
    isDay: (d) => sameDay(d, thanksgiving(d.getFullYear())),
  },
}

/** Which holiday or season it is on a given day. */
export function seasonOn(d: Date): Season {
  const n = md(d)
  const y = d.getFullYear()
  const tg = thanksgiving(y)
  const easter = easterSunday(y)
  const day = new Date(y, d.getMonth(), d.getDate())

  // Holidays first.
  if (day >= addDays(tg, -1) && day <= addDays(tg, 3)) return SEASONS.thanksgiving // Wed – Sun
  if (n === 1231 || n === 101) return SEASONS.newyear
  if (n >= 1115 || n <= 106) return SEASONS.christmas // mid-November through Epiphany
  if (n >= 207 && n <= 214) return SEASONS.valentines
  if (n >= 314 && n <= 317) return SEASONS.stpatricks
  if (day >= easter && day <= addDays(easter, 7)) return SEASONS.easter // Easter Sunday through the octave
  if (n >= 629 && n <= 705) return SEASONS.july4
  if (n >= 1015 && n <= 1031) return SEASONS.halloween

  // Then the seasons.
  if (n < 320) return SEASONS.winter
  if (n < 621) return SEASONS.spring
  if (n < 922) return SEASONS.summer
  return SEASONS.fall
}

/** For previewing: ?season=halloween (any id above). */
function previewSeason(): Season | null {
  try {
    const id = new URLSearchParams(location.search).get('season') as SeasonId | null
    return id && SEASONS[id] ? SEASONS[id] : null
  } catch {
    return null
  }
}

/** Today's season, or null when a grown-up has switched holiday themes off. */
export function useSeason(): Season | null {
  const s = useSettings()
  const [today, setToday] = useState(() => new Date().toDateString())
  useEffect(() => {
    const t = setInterval(() => setToday(new Date().toDateString()), 10 * 60 * 1000)
    return () => clearInterval(t)
  }, [])
  const preview = previewSeason()
  if (preview) return preview
  if (s.seasonal === false) return null
  return seasonOn(new Date(today))
}
