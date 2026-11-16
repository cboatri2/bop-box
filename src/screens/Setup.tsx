import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useState } from 'react'
import { Mascot } from '../components/Mascot'
import { PinPad } from '../components/PinPad'
import { Icon } from '../components/ui'
import type { KidBox } from '../lib/library'
import { hashPin, updateSettings, useSettings, type Accessory, type ThemeName } from '../lib/store'

export const THEMES: { id: ThemeName; label: string; color: string }[] = [
  { id: 'bubblegum', label: 'Bubblegum', color: '#FF6FA8' },
  { id: 'grape', label: 'Grape', color: '#9B7BFF' },
  { id: 'ocean', label: 'Ocean', color: '#4AA8FF' },
  { id: 'mint', label: 'Mint', color: '#2FC79C' },
  { id: 'sunshine', label: 'Sunshine', color: '#FFB020' },
]

export const ACCESSORIES: { id: Accessory; label: string }[] = [
  { id: 'headphones', label: 'Headphones' },
  { id: 'bow', label: 'Bow' },
  { id: 'crown', label: 'Crown' },
  { id: 'ears', label: 'Kitty ears' },
]

export function BuddyPicker() {
  const s = useSettings()
  return (
    <div className="buddy-picker">
      <div className="swatches" role="radiogroup" aria-label="Color">
        {THEMES.map((t) => (
          <button
            key={t.id}
            role="radio"
            aria-checked={s.theme === t.id}
            aria-label={t.label}
            className={`swatch ${s.theme === t.id ? 'is-on' : ''}`}
            style={{ background: t.color }}
            onClick={() => updateSettings({ theme: t.id })}
          >
            {s.theme === t.id && <Icon name="check" size={22} />}
          </button>
        ))}
      </div>
      <div className="accessories" role="radiogroup" aria-label="Accessory">
        {ACCESSORIES.map((a) => (
          <button
            key={a.id}
            role="radio"
            aria-checked={s.accessory === a.id}
            className={`accessory ${s.accessory === a.id ? 'is-on' : ''}`}
            onClick={() => updateSettings({ accessory: a.id })}
          >
            <Mascot size={64} accessory={a.id} />
            <span>{a.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

type SetupProps = {
  onDone: () => void
  /** 'add' = another kid on an already set-up device: no PIN step, can be cancelled. */
  mode?: 'first' | 'add'
  /** Kids' music boxes already in Spotify that aren't on this device yet. */
  existing?: KidBox[]
  onCancel?: () => void
}

export function Setup({ onDone, mode = 'first', existing = [], onCancel }: SetupProps) {
  const s = useSettings()
  const [step, setStep] = useState(0)
  const [name, setName] = useState(mode === 'add' ? '' : s.kidName)
  const [firstPin, setFirstPin] = useState<string | null>(null)

  const onPin = useCallback(
    async (pin: string) => {
      if (!firstPin) {
        setFirstPin(pin)
        return true
      }
      if (pin !== firstPin) {
        setFirstPin(null)
        return false
      }
      updateSettings({ pinHash: await hashPin(pin), setupDone: true })
      onDone()
      return true
    },
    [firstPin, onDone],
  )

  const steps = [
    <div key="name" className="setup-step">
      <Mascot size={132} mood="wow" accessory={s.accessory} />
      <h1 className="h1">{mode === 'add' ? 'Who else is listening?' : "Who's listening?"}</h1>
      <p className="muted">This little music box will be all theirs.</p>
      {existing.length > 0 && (
        <div className="existing">
          <p className="muted small">Already have a music box in your Spotify:</p>
          <div className="idea-chips">
            {existing.map((b) => (
              <button
                key={b.id}
                type="button"
                className="idea"
                onClick={() => {
                  setName(b.kidName)
                  updateSettings({ kidName: b.kidName, playlistId: b.id })
                  setStep(1)
                }}
              >
                {b.kidName}
              </button>
            ))}
          </div>
        </div>
      )}
      <form
        className="name-form"
        onSubmit={(e) => {
          e.preventDefault()
          if (!name.trim()) return
          updateSettings({ kidName: name.trim() })
          setStep(1)
        }}
      >
        <input
          className="name-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Their name"
          autoFocus
          maxLength={24}
          aria-label="Child's name"
        />
        <button className="btn-candy btn-lg" disabled={!name.trim()}>
          Next
        </button>
      </form>
    </div>,

    <div key="buddy" className="setup-step">
      <Mascot size={148} accessory={s.accessory} bop notes mood="singing" />
      <h1 className="h1">Pick a music buddy</h1>
      <p className="muted">Choose together! You can change this any time.</p>
      <BuddyPicker />
      <button className="btn-candy btn-lg" onClick={() => (mode === 'add' ? onDone() : setStep(2))}>
        Love it!
      </button>
    </div>,

    <div key="pin" className="setup-step">
      <PinPad
        key={firstPin ? 'confirm' : 'first'}
        title={firstPin ? 'Type it once more' : 'Make a grown-up PIN'}
        subtitle={firstPin ? 'Just to be sure.' : 'Four numbers that unlock the grown-up corner, where songs get added.'}
        onComplete={onPin}
      />
    </div>,
  ]

  if (mode === 'add') steps.pop()

  return (
    <main className="center-screen">
      <div className="card setup-card">
        {mode === 'add' && step === 0 && onCancel && (
          <button className="icon-btn setup-back" aria-label="Cancel" onClick={onCancel}>
            <Icon name="x" />
          </button>
        )}
        <div className="step-dots" aria-hidden="true">
          {steps.map((_, i) => (
            <span key={i} className={i === step ? 'is-on' : i < step ? 'is-done' : ''} />
          ))}
        </div>
        {step > 0 && (
          <button className="icon-btn setup-back" aria-label="Back" onClick={() => { setStep(step - 1); setFirstPin(null) }}>
            <Icon name="back" />
          </button>
        )}
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
          >
            {steps[step]}
          </motion.div>
        </AnimatePresence>
      </div>
    </main>
  )
}
