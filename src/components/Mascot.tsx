import type { Accessory } from '../lib/store'

export type Mood = 'happy' | 'singing' | 'sleepy' | 'wow'

type Props = {
  size?: number
  mood?: Mood
  accessory?: Accessory
  bop?: boolean // dance to the music
  notes?: boolean // float music notes
  className?: string
}

const INK = '#3A2648'

/** "Bop", the little music buddy. Colors follow the active theme. */
export function Mascot({ size = 96, mood = 'happy', accessory = 'headphones', bop, notes, className = '' }: Props) {
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
      <svg viewBox="0 0 120 120" width={size} height={size}>
        <ellipse className="mascot-shadow" cx="60" cy="113" rx="30" ry="5" fill={INK} opacity=".12" />
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
          <ellipse cx="36" cy="75" rx="6.5" ry="4" fill="#FF7FA8" opacity=".55" />
          <ellipse cx="84" cy="75" rx="6.5" ry="4" fill="#FF7FA8" opacity=".55" />

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
