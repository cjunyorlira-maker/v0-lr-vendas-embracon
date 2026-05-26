'use client'

import { useEffect, useRef } from 'react'

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  alpha: number
  alphaDir: number
  color: string
}

interface Orb {
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  color: string
  alpha: number
}

export default function AnimatedBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animFrameId: number

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    // Paleta de partículas: dourado e azul suave
    const particleColors = [
      'rgba(212,175,55,A)',   // dourado
      'rgba(212,175,55,A)',
      'rgba(212,175,55,A)',
      'rgba(59,130,246,A)',   // azul
      'rgba(201,162,39,A)',   // dourado escuro
    ]

    const makeParticle = (): Particle => {
      const colorTemplate = particleColors[Math.floor(Math.random() * particleColors.length)]
      const alpha = 0.15 + Math.random() * 0.45
      return {
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        radius: 0.8 + Math.random() * 1.6,
        alpha,
        alphaDir: (Math.random() > 0.5 ? 1 : -1) * 0.003,
        color: colorTemplate.replace('A', String(alpha)),
      }
    }

    // 5 orbs grandes com movimento lento
    const orbs: Orb[] = [
      {
        x: window.innerWidth * 0.1,
        y: window.innerHeight * 0.15,
        vx: 0.12,
        vy: 0.08,
        radius: 320,
        color: '#d4af37',
        alpha: 0.045,
      },
      {
        x: window.innerWidth * 0.85,
        y: window.innerHeight * 0.8,
        vx: -0.1,
        vy: -0.07,
        radius: 380,
        color: '#d4af37',
        alpha: 0.03,
      },
      {
        x: window.innerWidth * 0.5,
        y: window.innerHeight * 0.5,
        vx: 0.06,
        vy: -0.09,
        radius: 280,
        color: '#3b82f6',
        alpha: 0.025,
      },
      {
        x: window.innerWidth * 0.2,
        y: window.innerHeight * 0.75,
        vx: -0.08,
        vy: 0.06,
        radius: 240,
        color: '#c9a227',
        alpha: 0.035,
      },
      {
        x: window.innerWidth * 0.75,
        y: window.innerHeight * 0.25,
        vx: 0.09,
        vy: 0.07,
        radius: 300,
        color: '#d4af37',
        alpha: 0.02,
      },
    ]

    const particles: Particle[] = Array.from({ length: 120 }, makeParticle)

    const drawOrb = (orb: Orb) => {
      const grad = ctx.createRadialGradient(orb.x, orb.y, 0, orb.x, orb.y, orb.radius)
      const hex = orb.color
      grad.addColorStop(0, hex + Math.round(orb.alpha * 255).toString(16).padStart(2, '0'))
      grad.addColorStop(1, 'transparent')
      ctx.beginPath()
      ctx.arc(orb.x, orb.y, orb.radius, 0, Math.PI * 2)
      ctx.fillStyle = grad
      ctx.fill()
    }

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      // Desenha orbs
      for (const orb of orbs) {
        drawOrb(orb)
        orb.x += orb.vx
        orb.y += orb.vy
        if (orb.x < -orb.radius || orb.x > canvas.width + orb.radius) orb.vx *= -1
        if (orb.y < -orb.radius || orb.y > canvas.height + orb.radius) orb.vy *= -1
      }

      // Desenha partículas
      for (const p of particles) {
        p.alpha += p.alphaDir
        if (p.alpha <= 0.05 || p.alpha >= 0.65) p.alphaDir *= -1

        const color = p.color.replace(/,[^,]+\)$/, `,${p.alpha})`)
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2)
        ctx.fillStyle = color
        ctx.fill()

        p.x += p.vx
        p.y += p.vy
        if (p.x < 0) p.x = canvas.width
        if (p.x > canvas.width) p.x = 0
        if (p.y < 0) p.y = canvas.height
        if (p.y > canvas.height) p.y = 0
      }

      animFrameId = requestAnimationFrame(animate)
    }

    animate()

    return () => {
      cancelAnimationFrame(animFrameId)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0"
      style={{ zIndex: 0 }}
    />
  )
}
