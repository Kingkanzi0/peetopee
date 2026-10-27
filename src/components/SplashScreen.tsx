/**
 * SplashScreen — 3-second animated intro shown once on first load.
 * Uses framer-motion for smooth entrance/exit.
 */
import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { PeetopeeLogoSVG } from './PeetopeeLogoSVG'

interface Props {
  onDone: () => void
}

export function SplashScreen({ onDone }: Props) {
  const [phase, setPhase] = useState<'in' | 'hold' | 'out'>('in')

  useEffect(() => {
    // in: 600ms, hold: 1800ms, out: 600ms = ~3s total
    const t1 = setTimeout(() => setPhase('hold'), 600)
    const t2 = setTimeout(() => setPhase('out'), 2400)
    const t3 = setTimeout(() => onDone(), 3000)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
  }, [onDone])

  return (
    <AnimatePresence>
      {phase !== 'out' ? (
        <motion.div
          key="splash"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center"
          style={{ background: 'linear-gradient(160deg, #0a1628 0%, #122d45 60%, #1a1040 100%)' }}
        >
          {/* Animated background circles */}
          <motion.div
            className="absolute size-96 rounded-full opacity-10"
            style={{ background: 'radial-gradient(circle, #0052ff 0%, transparent 70%)', top: '10%', left: '-20%' }}
            animate={{ scale: [1, 1.15, 1], opacity: [0.1, 0.18, 0.1] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          />
          <motion.div
            className="absolute size-80 rounded-full opacity-10"
            style={{ background: 'radial-gradient(circle, #7c3aed 0%, transparent 70%)', bottom: '10%', right: '-15%' }}
            animate={{ scale: [1, 1.2, 1], opacity: [0.1, 0.2, 0.1] }}
            transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
          />

          {/* Logo */}
          <motion.div
            initial={{ scale: 0.7, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.34, 1.56, 0.64, 1] }}
            className="flex flex-col items-center gap-5"
          >
            <PeetopeeLogoSVG size="xl" variant="stacked" on="dark" />

            <motion.p
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.5 }}
              className="text-sm font-medium tracking-widest uppercase"
              style={{ color: 'rgba(255,255,255,0.45)', letterSpacing: '0.18em' }}
            >
              Your USDC. Local Money. Anywhere.
            </motion.p>
          </motion.div>

          {/* Loading bar */}
          <motion.div
            className="absolute bottom-16 left-1/2 -translate-x-1/2 h-0.5 rounded-full overflow-hidden"
            style={{ width: 120, background: 'rgba(255,255,255,0.1)' }}
          >
            <motion.div
              className="h-full rounded-full"
              style={{ background: 'linear-gradient(90deg, #0052ff, #7c3aed)' }}
              initial={{ width: '0%' }}
              animate={{ width: '100%' }}
              transition={{ duration: 2.4, ease: 'linear' }}
            />
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
