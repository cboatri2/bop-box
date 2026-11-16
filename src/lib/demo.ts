import type { Library } from './library'
import { isGrownupConnected, type PlaylistInfo, type Song } from './spotify'

const PAL = [
  ['#FF8FB8', '#FF5C9A'], ['#8CC8FF', '#4A7DFF'], ['#7DE3C3', '#25B08A'], ['#FFD15C', '#FF9A3C'],
  ['#B9A2FF', '#7B5CFF'], ['#FFA98A', '#FF6B5C'], ['#9BE7FF', '#3FB6E0'], ['#FFC6E8', '#C77DFF'],
]
const GLYPHS = ['🌈', '🦄', '🐠', '🚀', '🌻', '🐉', '🍓', '🌙', '🎈', '🐼', '🦋', '⛄', '🍭', '🐸', '🌊', '🎪']

function cover(i: number) {
  const [a, b] = PAL[i % PAL.length]
  const g = GLYPHS[i % GLYPHS.length]
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="300" height="300" fill="url(#g)"/><circle cx="240" cy="60" r="70" fill="#fff" opacity=".18"/><text x="150" y="190" font-size="130" text-anchor="middle">${g}</text></svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

const TITLES = [
  ['Rainbow Roller Skates', 'The Puddle Jumpers'], ['Unicorn Disco', 'Glitter Squad'], ['Under the Sea Shuffle', 'Bubble Band'],
  ['Rocket to the Moon', 'Captain Comet'], ['Sunflower Song', 'Garden Party'], ['Dragon Dance', 'The Fire Flies'],
  ['Strawberry Jam Session', 'Berry Good Band'], ['Sleepy Moon Lullaby', 'Nightlight'], ['Balloon Bounce', 'Up Up & Away'],
  ['Panda Pancakes', 'Breakfast Club Kids'], ['Butterfly Wings', 'Meadow Melody'], ['Snowman Shimmy', 'Frosty Feet'],
  ['Lollipop Lane', 'Sugar Rush'], ['Froggy Hop', 'Lily Pad Crew'], ['Ocean Waves', 'Surf Pups'], ['Circus Parade', 'Big Top Band'],
]

const day = 24 * 3600 * 1000
const MANY = typeof location !== 'undefined' && new URLSearchParams(location.search).has('many')
const ALL_TITLES = MANY ? Array.from({ length: 260 }, (_, i) => [`${TITLES[i % TITLES.length][0]} ${Math.floor(i / TITLES.length) + 1}`, TITLES[i % TITLES.length][1]]) : TITLES
export const demoSongs: Song[] = ALL_TITLES.map(([name, artist], i) => ({
  id: `demo${i}`,
  uri: `spotify:track:demo${i}`,
  name,
  explicit: false,
  duration_ms: 150000 + i * 7000,
  artists: [{ name: artist }],
  album: { name: `${name} (Single)`, images: [{ url: cover(i), width: 300, height: 300 }] },
  addedAt: new Date(Date.now() - i * day * 1.5).toISOString(),
}))

const pl = (id: string, name: string, n: number, img: number, owner = 'demo'): PlaylistInfo => ({
  id, name, description: '', images: [{ url: cover(img) }], owner: { id: owner }, collaborative: false, total: n,
})

export function demoLibrary(approved: string[], firstKid = true): Library {
  const playlists = [
    pl('car', 'Car Songs 🚗', 6, 3), pl('disney', 'Movie Night', 5, 1), pl('bed', 'Bedtime', 4, 7),
    pl('mine', 'Dad’s Workout Mix', 40, 5), pl('other', 'Today’s Top Hits', 50, 2, 'spotify'),
  ]
  const grownupLists = [pl('mom1', 'Kids Jams', 7, 8, 'mom'), pl('mom2', 'Road Trip 🚙', 5, 13, 'mom'), pl('mom3', 'Lullabies', 4, 7, 'mom')]
  const grownup = isGrownupConnected() ? { me: { id: 'mom', display_name: 'Mom' }, playlists: grownupLists } : null
  const shelfSongs: Record<string, Song[]> = {
    car: demoSongs.slice(4, 10), disney: demoSongs.slice(9, 14), bed: demoSongs.slice(11, 16),
    mom1: demoSongs.slice(0, 7), mom2: demoSongs.slice(6, 11), mom3: demoSongs.slice(12, 16),
  }
  const all = [...playlists, ...(grownup?.playlists ?? [])]
  return {
    picked: { id: 'picked', name: 'Picked for you', images: [], songs: MANY ? demoSongs : demoSongs.slice(0, 5) },
    shelves: all.filter((p) => approved.includes(p.id)).map((p) => ({ id: p.id, name: p.name, images: p.images, songs: shelfSongs[p.id] ?? [] })),
    mixes: !firstKid ? [] : [
      { id: 'mix1', name: 'Dance Party', emoji: '💃', color: 'grape', songs: [demoSongs[1], demoSongs[5], demoSongs[12], demoSongs[3]] },
      { id: 'mix2', name: 'Sleepy Songs', emoji: '🌙', color: 'ocean', songs: [demoSongs[7], demoSongs[14]] },
    ],
    playlists,
    boxes: [],
    grownup,
  }
}
