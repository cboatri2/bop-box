import { motion } from 'motion/react'
import { Mascot } from '../components/Mascot'
import { buzz, Icon } from '../components/ui'
import type { Kid } from '../lib/store'
import { Logo } from './Welcome'

/** Netflix-style "who's listening?" picker for devices shared by several kids. */
export function WhoIsListening({ kids, onPick, onGrownUps }: { kids: Kid[]; onPick: (id: string) => void; onGrownUps: () => void }) {
  return (
    <main className="center-screen who">
      <Logo />
      <h1 className="h1">Who's listening?</h1>
      <div className="who-grid">
        {kids.map((k, i) => (
          <motion.button
            key={k.id}
            data-theme={k.theme}
            className="who-card"
            initial={{ opacity: 0, y: 30, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: 'spring', stiffness: 380, damping: 20, delay: 0.08 * i }}
            whileHover={{ y: -6, rotate: i % 2 ? 2 : -2 }}
            whileTap={{ scale: 0.92 }}
            onClick={() => {
              buzz()
              onPick(k.id)
            }}
          >
            <span className="who-avatar">
              <Mascot size={110} accessory={k.accessory} />
            </span>
            <span className="who-name">{k.kidName}</span>
          </motion.button>
        ))}
      </div>
      <button className="link-btn who-grownups" onClick={onGrownUps}>
        <Icon name="lock" size={14} /> Grown-ups
      </button>
    </main>
  )
}
