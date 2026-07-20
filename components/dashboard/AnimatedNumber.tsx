'use client'

import { useEffect, useRef, useState } from 'react'

interface Props {
  value: number
  duration?: number
  format?: (n: number) => string
  className?: string
  style?: React.CSSProperties
}

// Conta de 0 até `value` na primeira renderização (e quando o valor muda).
export default function AnimatedNumber({ value, duration = 1100, format, className, style }: Props) {
  const [display, setDisplay] = useState(0)
  const rafRef = useRef<number | null>(null)
  const fromRef = useRef(0)

  useEffect(() => {
    const prefersReduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (prefersReduced) { setDisplay(value); return }
    const from = fromRef.current
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3) // easeOutCubic
      setDisplay(from + (value - from) * eased)
      if (t < 1) rafRef.current = requestAnimationFrame(tick)
      else fromRef.current = value
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [value, duration])

  return (
    <span className={className} style={style}>
      {format ? format(display) : Math.round(display).toLocaleString('pt-BR')}
    </span>
  )
}
