import { motion } from 'motion/react'
import { Mascot } from '../components/Mascot'
import { beginLogin, CLIENT_ID, REDIRECT_URI } from '../lib/spotify'

export function Logo({ size = 'lg' }: { size?: 'lg' | 'sm' }) {
  return (
    <span className={`logo logo-${size}`} aria-label="Bop Box">
      {'Bop Box'.split('').map((ch, i) => (
        <span key={i} className="logo-ch" style={{ ['--i' as string]: i }} aria-hidden="true">
          {ch === ' ' ? ' ' : ch}
        </span>
      ))}
    </span>
  )
}

const resettingPin = () => {
  try {
    return !!localStorage.getItem('bopbox.pinReset')
  } catch {
    return false
  }
}

export function Welcome() {
  if (!CLIENT_ID) {
    return (
      <main className="center-screen">
        <div className="card setup-card">
          <Mascot size={120} mood="wow" />
          <h1 className="h1">Almost there!</h1>
          <p className="muted">
            Bop Box needs a Spotify Client ID. Add <code>VITE_SPOTIFY_CLIENT_ID</code> to <code>.env.local</code> and
            register this redirect URI in the Spotify dashboard:
          </p>
          <code className="code-block">{REDIRECT_URI}</code>
        </div>
      </main>
    )
  }

  return (
    <main className="center-screen welcome">
      <motion.div
        initial={{ scale: 0.6, opacity: 0, y: 30 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 16 }}
      >
        <Mascot size={176} bop notes mood="singing" />
      </motion.div>
      <h1>
        <Logo />
      </h1>
      <motion.p
        className="welcome-sub"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
      >
        A little music box, filled with songs your grown-ups picked just for you.
      </motion.p>
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }}>
        <button className="btn-candy btn-xl" onClick={() => void beginLogin()}>
          Connect Spotify
        </button>
      </motion.div>
      <p className="fineprint">
        {resettingPin()
          ? "Resetting the grown-up PIN: sign in with this device's Spotify account, then pick a new PIN. The kids and their music are safe."
          : 'For grown-ups: sign in with the Spotify Premium account your kiddo will listen on.'}
      </p>
    </main>
  )
}
