"use client"

import { useEffect, useRef } from "react"

export function AnimatedBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    let animationFrameId: number
    let time = 0

    const GOLD = { r: 212, g: 175, b: 55 }
    const BLUE = { r: 25, g: 50, b: 100 }

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }

    interface Particle {
      x: number
      y: number
      size: number
      baseOpacity: number
      speed: number
      color: typeof GOLD | typeof BLUE
      pulse: number
      pulseSpeed: number
    }

    const particles: Particle[] = []
    const particleCount = 120

    const createParticles = () => {
      particles.length = 0
      for (let i = 0; i < particleCount; i++) {
        particles.push({
          x: Math.random() * window.innerWidth,
          y: Math.random() * window.innerHeight,
          size: Math.random() * 25 + 10,
          baseOpacity: Math.random() * 0.4 + 0.2,
          speed: Math.random() * 0.8 + 0.3,
          color: Math.random() > 0.4 ? GOLD : BLUE,
          pulse: Math.random() * Math.PI * 2,
          pulseSpeed: Math.random() * 0.02 + 0.01
        })
      }
    }

    interface Orb {
      x: number
      y: number
      radius: number
      vx: number
      vy: number
      color: typeof GOLD | typeof BLUE
    }

    const orbs: Orb[] = []
    const orbCount = 5

    const createOrbs = () => {
      orbs.length = 0
      for (let i = 0; i < orbCount; i++) {
        orbs.push({
          x: Math.random() * window.innerWidth,
          y: Math.random() * window.innerHeight,
          radius: 300 + Math.random() * 400,
          vx: (Math.random() - 0.5) * 0.2,
          vy: (Math.random() - 0.5) * 0.2,
          color: i % 2 === 0 ? GOLD : BLUE
        })
      }
    }

    const animate = () => {
      if (!ctx || !canvas) return
      
      time += 0.008

      ctx.fillStyle = "#080808"
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      for (const orb of orbs) {
        orb.x += orb.vx
        orb.y += orb.vy

        if (orb.x < -orb.radius) orb.x = canvas.width + orb.radius
        if (orb.x > canvas.width + orb.radius) orb.x = -orb.radius
        if (orb.y < -orb.radius) orb.y = canvas.height + orb.radius
        if (orb.y > canvas.height + orb.radius) orb.y = -orb.radius

        const wobbleX = Math.sin(time + orb.radius * 0.01) * 30
        const wobbleY = Math.cos(time * 0.7 + orb.radius * 0.01) * 20

        const gradient = ctx.createRadialGradient(
          orb.x + wobbleX, orb.y + wobbleY, 0,
          orb.x + wobbleX, orb.y + wobbleY, orb.radius
        )
        
        gradient.addColorStop(0, `rgba(${orb.color.r}, ${orb.color.g}, ${orb.color.b}, 0.12)`)
        gradient.addColorStop(0.4, `rgba(${orb.color.r}, ${orb.color.g}, ${orb.color.b}, 0.05)`)
        gradient.addColorStop(1, `rgba(${orb.color.r}, ${orb.color.g}, ${orb.color.b}, 0)`)

        ctx.fillStyle = gradient
        ctx.fillRect(0, 0, canvas.width, canvas.height)
      }

      for (const p of particles) {
        p.y -= p.speed
        p.x += Math.sin(time * 1.5 + p.y * 0.005) * 0.5
        p.pulse += p.pulseSpeed

        if (p.y < -p.size * 2) {
          p.y = canvas.height + p.size * 2
          p.x = Math.random() * canvas.width
        }

        const pulseMultiplier = Math.sin(p.pulse) * 0.4 + 0.6
        const currentOpacity = p.baseOpacity * pulseMultiplier

        const particleGradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size)
        particleGradient.addColorStop(0, `rgba(${p.color.r}, ${p.color.g}, ${p.color.b}, ${currentOpacity})`)
        particleGradient.addColorStop(0.4, `rgba(${p.color.r}, ${p.color.g}, ${p.color.b}, ${currentOpacity * 0.5})`)
        particleGradient.addColorStop(1, `rgba(${p.color.r}, ${p.color.g}, ${p.color.b}, 0)`)

        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
        ctx.fillStyle = particleGradient
        ctx.fill()
      }

      const footerGlow = ctx.createLinearGradient(0, canvas.height - 300, 0, canvas.height)
      footerGlow.addColorStop(0, "rgba(8, 8, 8, 0)")
      footerGlow.addColorStop(0.5, `rgba(${GOLD.r}, ${GOLD.g}, ${GOLD.b}, 0.04)`)
      footerGlow.addColorStop(1, `rgba(${BLUE.r}, ${BLUE.g}, ${BLUE.b}, 0.06)`)
      
      ctx.fillStyle = footerGlow
      ctx.fillRect(0, canvas.height - 300, canvas.width, 300)

      animationFrameId = requestAnimationFrame(animate)
    }

    resize()
    createParticles()
    createOrbs()
    animate()

    window.addEventListener("resize", () => {
      resize()
      createParticles()
      createOrbs()
    })

    return () => {
      cancelAnimationFrame(animationFrameId)
      window.removeEventListener("resize", resize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none"
      style={{ background: "#080808", zIndex: 0 }}
    />
  )
}
