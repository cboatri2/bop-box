import { motion, useAnimationControls } from 'motion/react'
import { useEffect, useState } from 'react'
import { buzz, Icon } from './ui'

type Props = {
  title: string
  subtitle?: string
  /** Return false to shake and clear. */
  onComplete: (pin: string) => Promise<boolean> | boolean
}

export function PinPad({ title, subtitle, onComplete }: Props) {
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const controls = useAnimationControls()

  useEffect(() => {
    if (pin.length !== 4 || busy) return
    setBusy(true)
    Promise.resolve(onComplete(pin)).then((ok) => {
      if (!ok) {
        buzz(60)
        void controls.start({ x: [0, -14, 12, -8, 6, 0], transition: { duration: 0.42 } })
      }
      setTimeout(
        () => {
          setPin('')
          setBusy(false)
        },
        ok ? 0 : 320,
      )
    })
  }, [pin, busy, onComplete, controls])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) setPin((p) => (p.length < 4 ? p + e.key : p))
      if (e.key === 'Backspace') setPin((p) => p.slice(0, -1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const press = (d: string) => {
    buzz()
    setPin((p) => (p.length < 4 ? p + d : p))
  }

  return (
    <div className="pinpad">
      <h2 className="h2">{title}</h2>
      {subtitle && <p className="muted">{subtitle}</p>}
      <motion.div className="pin-dots" animate={controls} aria-label={`${pin.length} of 4 digits entered`}>
        {[0, 1, 2, 3].map((i) => (
          <motion.span
            key={i}
            className={`pin-dot ${i < pin.length ? 'is-on' : ''}`}
            animate={i < pin.length ? { scale: [1, 1.35, 1] } : { scale: 1 }}
            transition={{ duration: 0.22 }}
          />
        ))}
      </motion.div>
      <div className="pin-grid">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button key={d} className="pin-key" onClick={() => press(d)}>
            {d}
          </button>
        ))}
        <span />
        <button className="pin-key" onClick={() => press('0')}>
          0
        </button>
        <button className="pin-key pin-key-ghost" aria-label="Delete" onClick={() => setPin((p) => p.slice(0, -1))}>
          <Icon name="back" size={26} />
        </button>
      </div>
    </div>
  )
}
