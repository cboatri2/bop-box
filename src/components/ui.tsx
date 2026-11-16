import { AnimatePresence, motion, useIsPresent, type HTMLMotionProps } from 'motion/react'
import { useEffect, useState, type ReactNode } from 'react'
import { useToasts } from '../lib/toast'

// ── Icons (rounded, chunky, hand-tuned for small hands) ─────────────────────

type IconName =
  | 'play' | 'pause' | 'next' | 'prev' | 'heart' | 'heart-fill' | 'lock' | 'moon' | 'speaker'
  | 'star' | 'plus' | 'check' | 'trash' | 'search' | 'down' | 'x' | 'dice' | 'back' | 'music' | 'link' | 'grip' | 'pencil' | 'move' | 'users'

export function Icon({ name, size = 24 }: { name: IconName; size?: number }) {
  const p = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2.4,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  }
  switch (name) {
    case 'play':
      return <svg {...p}><path d="M8 5.6v12.8c0 .9 1 1.4 1.7.9l9.4-6.4c.6-.4.6-1.4 0-1.8L9.7 4.7C9 4.2 8 4.7 8 5.6z" fill="currentColor" /></svg>
    case 'pause':
      return <svg {...p}><rect x="6" y="5" width="4.2" height="14" rx="1.6" fill="currentColor" /><rect x="13.8" y="5" width="4.2" height="14" rx="1.6" fill="currentColor" /></svg>
    case 'next':
      return <svg {...p}><path d="M5 6.3v11.4c0 .8.9 1.3 1.6.8l8-5.7c.6-.4.6-1.2 0-1.6l-8-5.7C5.9 5 5 5.5 5 6.3z" fill="currentColor" /><path d="M19 5.5v13" strokeWidth="3" /></svg>
    case 'prev':
      return <svg {...p}><path d="M19 6.3v11.4c0 .8-.9 1.3-1.6.8l-8-5.7c-.6-.4-.6-1.2 0-1.6l8-5.7c.7-.5 1.6 0 1.6.8z" fill="currentColor" /><path d="M5 5.5v13" strokeWidth="3" /></svg>
    case 'heart':
      return <svg {...p}><path d="M12 20s-7.5-4.4-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.6-7.5 10-7.5 10z" /></svg>
    case 'heart-fill':
      return <svg {...p}><path d="M12 20s-7.5-4.4-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.6-7.5 10-7.5 10z" fill="currentColor" /></svg>
    case 'lock':
      return <svg {...p}><rect x="5" y="10.5" width="14" height="10" rx="3" /><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" /></svg>
    case 'moon':
      return <svg {...p}><path d="M19.5 14.5A7.5 7.5 0 0 1 9.5 4.5a7.5 7.5 0 1 0 10 10z" /></svg>
    case 'speaker':
      return <svg {...p}><rect x="6" y="3" width="12" height="18" rx="3" /><circle cx="12" cy="14" r="3" /><circle cx="12" cy="7.5" r=".6" fill="currentColor" /></svg>
    case 'star':
      return <svg {...p}><path d="M12 3.8l2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.6-4.8 2.6.9-5.4-3.9-3.8 5.4-.8z" fill="currentColor" /></svg>
    case 'plus':
      return <svg {...p}><path d="M12 5v14M5 12h14" strokeWidth="3" /></svg>
    case 'check':
      return <svg {...p}><path d="M5 12.5l4.5 4.5L19 7.5" strokeWidth="3" /></svg>
    case 'trash':
      return <svg {...p}><path d="M5 7h14M10 4h4M7 7l.8 11.2A2 2 0 0 0 9.8 20h4.4a2 2 0 0 0 2-1.8L17 7" /></svg>
    case 'search':
      return <svg {...p}><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4 4" /></svg>
    case 'down':
      return <svg {...p}><path d="M6 9.5l6 6 6-6" strokeWidth="3" /></svg>
    case 'x':
      return <svg {...p}><path d="M6.5 6.5l11 11M17.5 6.5l-11 11" strokeWidth="2.8" /></svg>
    case 'dice':
      return <svg {...p}><rect x="4" y="4" width="16" height="16" rx="4.5" /><circle cx="9" cy="9" r="1.3" fill="currentColor" stroke="none" /><circle cx="15" cy="15" r="1.3" fill="currentColor" stroke="none" /><circle cx="15" cy="9" r="1.3" fill="currentColor" stroke="none" /><circle cx="9" cy="15" r="1.3" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" /></svg>
    case 'back':
      return <svg {...p}><path d="M14.5 6l-6 6 6 6" strokeWidth="3" /></svg>
    case 'music':
      return <svg {...p}><path d="M9 18V6l10-2v12" /><circle cx="6.5" cy="18" r="2.5" fill="currentColor" /><circle cx="16.5" cy="16" r="2.5" fill="currentColor" /></svg>
    case 'users':
      return <svg {...p}><circle cx="9" cy="8.5" r="3.2" /><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5" /><circle cx="16.5" cy="9.5" r="2.6" /><path d="M15.5 14.2c2.4-.3 4.4 1.2 5 4.3" /></svg>
    case 'grip':
      return <svg {...p}><circle cx="9" cy="6" r="1.6" fill="currentColor" stroke="none" /><circle cx="15" cy="6" r="1.6" fill="currentColor" stroke="none" /><circle cx="9" cy="12" r="1.6" fill="currentColor" stroke="none" /><circle cx="15" cy="12" r="1.6" fill="currentColor" stroke="none" /><circle cx="9" cy="18" r="1.6" fill="currentColor" stroke="none" /><circle cx="15" cy="18" r="1.6" fill="currentColor" stroke="none" /></svg>
    case 'pencil':
      return <svg {...p}><path d="M4.5 19.5l1-4.2L15.8 5a2.1 2.1 0 0 1 3 3L8.5 18.4z" /><path d="M13.5 7.3l3 3" /></svg>
    case 'move':
      return <svg {...p}><path d="M8 9l4-4 4 4M8 15l4 4 4-4M12 5v14" /></svg>
    case 'link':
      return <svg {...p}><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></svg>
  }
}

// ── Equalizer bars ──────────────────────────────────────────────────────────

export function Equalizer({ playing, className = '' }: { playing: boolean; className?: string }) {
  return (
    <span className={`eq ${playing ? 'is-on' : ''} ${className}`} aria-hidden="true">
      <i /><i /><i /><i />
    </span>
  )
}

// ── Confetti burst ──────────────────────────────────────────────────────────

const BURST_COLORS = ['#FF6FA8', '#FFC93C', '#7DE3C3', '#8CC8FF', '#B9A2FF', '#FF8A5C']
const BURST_GLYPHS = ['★', '♪', '●', '♫', '✦', '●']

export function Burst({ fire }: { fire: number }) {
  const [bits, setBits] = useState<{ id: number; x: number; y: number; r: number; c: string; g: string; s: number }[]>([])
  useEffect(() => {
    if (!fire) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const next = Array.from({ length: 18 }, (_, i) => {
      const a = (Math.PI * 2 * i) / 18 + Math.random() * 0.4
      const d = 70 + Math.random() * 90
      return {
        id: fire * 100 + i,
        x: Math.cos(a) * d,
        y: Math.sin(a) * d - 30,
        r: (Math.random() - 0.5) * 540,
        c: BURST_COLORS[i % BURST_COLORS.length],
        g: BURST_GLYPHS[i % BURST_GLYPHS.length],
        s: 14 + Math.random() * 12,
      }
    })
    setBits(next)
    const t = setTimeout(() => setBits([]), 1100)
    return () => clearTimeout(t)
  }, [fire])
  return (
    <span className="burst" aria-hidden="true">
      {bits.map((b) => (
        <motion.i
          key={b.id}
          initial={{ x: 0, y: 0, scale: 0.4, opacity: 1, rotate: 0 }}
          animate={{ x: b.x, y: b.y, scale: 1, opacity: 0, rotate: b.r }}
          transition={{ duration: 0.95, ease: [0.16, 0.8, 0.3, 1] }}
          style={{ color: b.c, fontSize: b.s }}
        >
          {b.g}
        </motion.i>
      ))}
    </span>
  )
}

// ── Toasts ──────────────────────────────────────────────────────────────────

export function Toasts() {
  const toasts = useToasts()
  return (
    <div className="toasts" role="status" aria-live="polite">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            className="toast"
            layout
            initial={{ y: -30, opacity: 0, scale: 0.9 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: -20, opacity: 0, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          >
            {t.emoji && <span className="toast-emoji">{t.emoji}</span>}
            {t.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}

// ── Dreamy background ───────────────────────────────────────────────────────

export function Backdrop() {
  return (
    <div className="backdrop" aria-hidden="true">
      <span className="blob b1" />
      <span className="blob b2" />
      <span className="blob b3" />
      <span className="blob b4" />
      <span className="stars">
        {Array.from({ length: 14 }, (_, i) => (
          <i key={i} style={{ left: `${(i * 37) % 100}%`, top: `${(i * 53) % 100}%`, animationDelay: `${(i % 7) * 0.6}s` }} />
        ))}
      </span>
    </div>
  )
}

// ── Bottom sheet ────────────────────────────────────────────────────────────

type SheetProps = {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  className?: string
}

export function Sheet(props: SheetProps) {
  const { open, onClose } = props
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  return <AnimatePresence>{open && <SheetPanel key="sheet" {...props} />}</AnimatePresence>
}

function SheetPanel({ onClose, title, children, className = '' }: SheetProps) {
  // While closing, never block taps, even if the closing animation stalls (iPhone Low Power Mode).
  const isPresent = useIsPresent()
  return (
    <motion.div
      className="sheet-wrap"
      style={{ pointerEvents: isPresent ? 'auto' : 'none' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.15 } }}
      onClick={onClose}
    >
      <motion.div
        className={`sheet ${className}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%', transition: { duration: 0.18, ease: 'easeIn' } }}
        transition={{ type: 'spring', stiffness: 420, damping: 38 }}
        onClick={(e) => e.stopPropagation()}
      >
        <span className="sheet-grip" />
        <h2 className="sheet-title">{title}</h2>
        {children}
      </motion.div>
    </motion.div>
  )
}

/** A full-screen motion layer for AnimatePresence that stops catching taps as soon as it starts closing. */
export function SafeLayer(props: HTMLMotionProps<'div'>) {
  const isPresent = useIsPresent()
  return <motion.div {...props} style={{ ...props.style, pointerEvents: isPresent ? 'auto' : 'none' }} />
}

/** Style for full-screen layers inside AnimatePresence: stop catching taps the moment they start closing. */
export function useExitSafe() {
  const isPresent = useIsPresent()
  return { pointerEvents: isPresent ? ('auto' as const) : ('none' as const) }
}

export function buzz(ms = 8) {
  try {
    navigator.vibrate?.(ms)
  } catch {
    /* not supported */
  }
}

/** Re-render on an interval while `active` (for progress bars). */
export function useTick(active: boolean, ms = 250) {
  const [, setN] = useState(0)
  useEffect(() => {
    if (!active) return
    const t = setInterval(() => setN((n) => n + 1), ms)
    return () => clearInterval(t)
  }, [active, ms])
}
