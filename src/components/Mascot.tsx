import type { ReactNode } from 'react'
import { useSeason, type Hat } from '../lib/season'
import type { Accessory } from '../lib/store'

export type Mood = 'happy' | 'singing' | 'sleepy' | 'wow'

type Props = {
  size?: number
  mood?: Mood
  accessory?: Accessory
  bop?: boolean // dance to the music
  notes?: boolean // float music notes
  className?: string
  /** Wear today's holiday hat (off for the accessory picker, so kids see what they're choosing). */
  seasonal?: boolean
}

const INK = '#3A2648'
const PAD = 16
const PAD_TOP = 26

/** "Bop", the little music buddy. Colors follow the active theme. */
export function Mascot({ size = 96, mood = 'happy', accessory = 'headphones', bop, notes, className = '', seasonal = true }: Props) {
  const season = useSeason()
  const hat = seasonal ? season?.hat : undefined
  // A holiday hat takes the place of a bow, crown or kitty ears (headphones stay on).
  if (hat && accessory !== 'headphones') accessory = 'none' as Accessory
  return (
    <span
      className={`mascot ${bop ? 'is-bopping' : 'is-idle'} ${className}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {notes && (
        <span className="mascot-notes">
          <i>♪</i>
          <i>♫</i>
          <i>♪</i>
        </span>
      )}
      {/* The drawing gets room around it (hats, ears, z's) so nothing is clipped on iPhone, where
          overflow outside an <svg> isn't reliably painted. Bop himself stays the same size and place. */}
      <svg
        viewBox={`${-PAD} ${-PAD_TOP} ${120 + 2 * PAD} ${120 + PAD_TOP + PAD}`}
        width={(size * (120 + 2 * PAD)) / 120}
        height={(size * (120 + PAD_TOP + PAD)) / 120}
        style={{ position: 'absolute', left: (-size * PAD) / 120, top: (-size * PAD_TOP) / 120 }}
      >
        <ellipse className="mascot-shadow" cx="60" cy="113" rx="30" ry="5" fill={INK} fillOpacity=".13" />
        <g className="mascot-body">
          {accessory === 'ears' && (
            <g>
              <path d="M32 44 L27 13 L54 30 Z" fill="var(--accent)" stroke={INK} strokeWidth="3" strokeLinejoin="round" />
              <path d="M88 44 L93 13 L66 30 Z" fill="var(--accent)" stroke={INK} strokeWidth="3" strokeLinejoin="round" />
              <path d="M35 36 L33 22 L45 30 Z" fill="#FF9EC2" />
              <path d="M85 36 L87 22 L75 30 Z" fill="#FF9EC2" />
            </g>
          )}
          <path
            d="M60 22c25 0 42 19 42 46 0 25-17 40-42 40S18 93 18 68c0-27 17-46 42-46z"
            fill="var(--accent)"
            stroke={INK}
            strokeWidth="3"
          />
          <ellipse cx="60" cy="90" rx="22" ry="12" fill="#fff" opacity=".22" />
          <ellipse cx="41" cy="40" rx="9" ry="5" fill="#fff" opacity=".5" transform="rotate(-32 41 40)" />

          {/* eyes */}
          {mood === 'sleepy' ? (
            <g stroke={INK} strokeWidth="3.4" strokeLinecap="round" fill="none">
              <path d="M40 63q6 5 12 0" />
              <path d="M68 63q6 5 12 0" />
            </g>
          ) : (
            <g className="mascot-eyes">
              <ellipse cx="46" cy="61" rx={mood === 'wow' ? 7 : 5.5} ry={mood === 'wow' ? 8.5 : 7} fill={INK} />
              <ellipse cx="74" cy="61" rx={mood === 'wow' ? 7 : 5.5} ry={mood === 'wow' ? 8.5 : 7} fill={INK} />
              <circle cx="48.4" cy="57.6" r="2.2" fill="#fff" />
              <circle cx="76.4" cy="57.6" r="2.2" fill="#fff" />
            </g>
          )}

          {/* cheeks */}
          <ellipse cx="36" cy="75" rx="6.5" ry="4" fill="#F0367A" opacity=".42" />
          <ellipse cx="84" cy="75" rx="6.5" ry="4" fill="#F0367A" opacity=".42" />

          {/* mouth */}
          {mood === 'singing' || mood === 'wow' ? (
            <g className={mood === 'singing' ? 'mascot-mouth-sing' : ''}>
              <ellipse cx="60" cy="78" rx="6" ry="7" fill={INK} />
              <ellipse cx="60" cy="82" rx="3.6" ry="2.6" fill="#FF7FA8" />
            </g>
          ) : mood === 'sleepy' ? (
            <path d="M55 79q5 3 10 0" stroke={INK} strokeWidth="3" strokeLinecap="round" fill="none" />
          ) : (
            <path d="M52 74q8 8 16 0" stroke={INK} strokeWidth="3.4" strokeLinecap="round" fill="none" />
          )}

          {accessory === 'headphones' && (
            <g>
              <path d="M22 64C20 34 39 17 60 17s40 17 38 47" stroke={INK} strokeWidth="6" fill="none" strokeLinecap="round" />
              <rect x="11" y="54" width="17" height="28" rx="8.5" fill="#fff" stroke={INK} strokeWidth="3" />
              <rect x="92" y="54" width="17" height="28" rx="8.5" fill="#fff" stroke={INK} strokeWidth="3" />
              <rect x="15" y="59" width="9" height="18" rx="4.5" fill="var(--accent-deep)" />
              <rect x="96" y="59" width="9" height="18" rx="4.5" fill="var(--accent-deep)" />
            </g>
          )}
          {accessory === 'bow' && (
            <g stroke={INK} strokeWidth="2.6" strokeLinejoin="round">
              <path d="M84 26 L70 15 Q65 13 65 19 L66 31 Q67 36 72 33 Z" fill="#FF5C9A" />
              <path d="M84 26 L98 15 Q103 13 103 19 L102 31 Q101 36 96 33 Z" fill="#FF5C9A" />
              <circle cx="84" cy="26" r="5" fill="#FF8FB8" />
            </g>
          )}
          {accessory === 'crown' && (
            <g stroke={INK} strokeWidth="2.8" strokeLinejoin="round">
              <path d="M40 30 L43 9 L52 20 L60 5 L68 20 L77 9 L80 30 Z" fill="#FFC93C" />
              <circle cx="60" cy="22" r="3" fill="#FF5C9A" strokeWidth="2" />
              <circle cx="47" cy="25" r="2.3" fill="#7DE3C3" strokeWidth="1.8" />
              <circle cx="73" cy="25" r="2.3" fill="#8CC8FF" strokeWidth="1.8" />
            </g>
          )}
          {hat && HATS[hat]}
        </g>
        {mood === 'sleepy' && (
          <g className="mascot-z" fill={INK} fontFamily="Fredoka, sans-serif" fontWeight="600">
            <text x="92" y="30" fontSize="16">z</text>
            <text x="102" y="16" fontSize="12">z</text>
          </g>
        )}
      </svg>
    </span>
  )
}

const heart = (x: number, y: number, r: number, fill: string) => (
  <path
    d={`M${x} ${y + r}C${x - 2 * r} ${y - r * 0.6} ${x - r} ${y - 2.2 * r} ${x} ${y - r}C${x + r} ${y - 2.2 * r} ${x + 2 * r} ${y - r * 0.6} ${x} ${y + r}Z`}
    fill={fill}
    stroke={INK}
    strokeWidth="2.4"
    strokeLinejoin="round"
  />
)

const daisy = (x: number, y: number, petal: string) => (
  <g key={`${x}`}>
    {[0, 72, 144, 216, 288].map((a) => (
      <circle key={a} cx={x + 4.6 * Math.cos((a * Math.PI) / 180)} cy={y + 4.6 * Math.sin((a * Math.PI) / 180)} r="3.6" fill={petal} stroke={INK} strokeWidth="1.6" />
    ))}
    <circle cx={x} cy={y} r="3" fill="#FFC93C" stroke={INK} strokeWidth="1.6" />
  </g>
)

/** Holiday hats, drawn on Bop's 120×120 canvas (the top of the head is around y = 22). */
const HATS: Record<Hat, ReactNode> = {
  santa: (
    <g stroke={INK} strokeWidth="2.8" strokeLinejoin="round">
      <path d="M33 27C34 10 52 1 70 3C86 5 97 16 101 31C95 25 89 21 84 21L87 27Z" fill="#E8344E" />
      <circle cx="101" cy="33" r="6.5" fill="#fff" />
      <rect x="29" y="22" width="62" height="12" rx="6" fill="#fff" />
    </g>
  ),
  party: (
    <g stroke={INK} strokeWidth="2.6" strokeLinejoin="round">
      <path d="M45 27L62 -6L77 27Z" fill="#FFC93C" />
      <path d="M52 13L69 13M48 21L74 21" stroke="#FF5C9A" strokeWidth="4" strokeLinecap="round" />
      <path d="M45 27L62 -6L77 27Z" fill="none" />
      <circle cx="62" cy="-7" r="5" fill="#7DE3C3" />
    </g>
  ),
  beanie: (
    <g stroke={INK} strokeWidth="2.8" strokeLinejoin="round">
      <path d="M29 30C29 4 91 4 91 30Z" fill="#5AA9FF" />
      <path d="M44 12L46 27M60 8L60 27M76 12L74 27" stroke="#3E86D6" strokeWidth="3" fill="none" />
      <rect x="26" y="23" width="68" height="12" rx="6" fill="#fff" />
      <circle cx="60" cy="5" r="7" fill="#fff" />
    </g>
  ),
  hearts: (
    <g>
      <path d="M46 26C44 16 40 12 36 8M74 26C76 16 80 12 84 8" stroke={INK} strokeWidth="2.6" fill="none" strokeLinecap="round" />
      {heart(35, 5, 6.5, '#FF4F8B')}
      {heart(85, 5, 6.5, '#FF4F8B')}
    </g>
  ),
  shamrock: (
    <g stroke={INK} strokeWidth="2.8" strokeLinejoin="round" transform="rotate(-8 60 18)">
      <ellipse cx="60" cy="27" rx="27" ry="6" fill="#2FA35A" />
      <path d="M45 27L47 3L73 3L75 27Z" fill="#2FA35A" />
      <rect x="45.6" y="17" width="29" height="6" fill="#1D6B3B" />
      <rect x="55" y="15.5" width="10" height="9" rx="1.5" fill="#FFC93C" />
    </g>
  ),
  bunny: (
    <g stroke={INK} strokeWidth="2.8">
      <ellipse cx="45" cy="8" rx="8" ry="20" fill="#fff" transform="rotate(-14 45 8)" />
      <ellipse cx="75" cy="8" rx="8" ry="20" fill="#fff" transform="rotate(14 75 8)" />
      <ellipse cx="45" cy="9" rx="3.5" ry="13" fill="#FFB3CF" stroke="none" transform="rotate(-14 45 9)" />
      <ellipse cx="75" cy="9" rx="3.5" ry="13" fill="#FFB3CF" stroke="none" transform="rotate(14 75 9)" />
    </g>
  ),
  flower: <g>{[daisy(40, 29, '#fff'), daisy(60, 22, '#FFB3CF'), daisy(80, 29, '#fff')]}</g>,
  sunglasses: (
    <g stroke={INK} strokeWidth="2.6" strokeLinejoin="round">
      <path d="M53 59Q60 55 67 59" fill="none" />
      <rect x="33" y="52" width="22" height="16" rx="7" fill="#2B2140" />
      <rect x="65" y="52" width="22" height="16" rx="7" fill="#2B2140" />
      <path d="M38 56L43 56M70 56L75 56" stroke="#fff" strokeOpacity=".7" strokeWidth="2.4" strokeLinecap="round" />
    </g>
  ),
  leaf: (
    <g stroke={INK} strokeWidth="2.6" strokeLinejoin="round">
      <path d="M58 25C52 12 62 1 80 3C82 18 72 28 58 25Z" fill="#F08A24" />
      <path d="M58 25C64 16 70 10 76 7" fill="none" strokeWidth="2" />
    </g>
  ),
  witch: (
    <g stroke={INK} strokeWidth="2.8" strokeLinejoin="round">
      <ellipse cx="60" cy="27" rx="35" ry="6.5" fill="#6A4BB0" />
      <path d="M41 26C49 15 55 3 70 -4C67 6 72 15 79 26Z" fill="#6A4BB0" />
      <path d="M44 21L77 21" stroke="#FFB020" strokeWidth="5" />
    </g>
  ),
  pilgrim: (
    <g stroke={INK} strokeWidth="2.8" strokeLinejoin="round">
      <ellipse cx="60" cy="27" rx="29" ry="6" fill="#4B3D55" />
      <path d="M44 27L47 2L73 2L76 27Z" fill="#4B3D55" />
      <rect x="45.5" y="16" width="29" height="6" fill="#2E2436" />
      <rect x="55" y="14.5" width="10" height="9" rx="1" fill="none" stroke="#FFC93C" strokeWidth="2.6" />
    </g>
  ),
}
