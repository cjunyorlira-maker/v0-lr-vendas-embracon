// Confete leve em canvas puro — dispara uma rajada e limpa sozinho.
export function dispararConfete(duracaoMs = 2200) {
  if (typeof window === 'undefined') return
  const canvas = document.createElement('canvas')
  canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:9999'
  canvas.width = window.innerWidth
  canvas.height = window.innerHeight
  document.body.appendChild(canvas)
  const ctx = canvas.getContext('2d')
  if (!ctx) { canvas.remove(); return }

  const cores = ['#d4af37', '#ffe082', '#c9a227', '#ffffff', '#f5d76e']
  const N = Math.min(180, Math.floor(window.innerWidth / 8))
  type P = { x: number; y: number; vx: number; vy: number; rot: number; vr: number; s: number; cor: string }
  const parts: P[] = []
  for (let i = 0; i < N; i++) {
    parts.push({
      x: Math.random() * canvas.width,
      y: -20 - Math.random() * canvas.height * 0.3,
      vx: (Math.random() - 0.5) * 3,
      vy: 2 + Math.random() * 4,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      s: 5 + Math.random() * 7,
      cor: cores[Math.floor(Math.random() * cores.length)],
    })
  }

  const inicio = performance.now()
  function frame(t: number) {
    const decorrido = t - inicio
    ctx!.clearRect(0, 0, canvas.width, canvas.height)
    const fade = decorrido > duracaoMs - 500 ? Math.max(0, (duracaoMs - decorrido) / 500) : 1
    for (const p of parts) {
      p.x += p.vx; p.y += p.vy; p.vy += 0.05; p.rot += p.vr
      ctx!.save()
      ctx!.globalAlpha = fade
      ctx!.translate(p.x, p.y)
      ctx!.rotate(p.rot)
      ctx!.fillStyle = p.cor
      ctx!.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * 0.5)
      ctx!.restore()
    }
    if (decorrido < duracaoMs) {
      requestAnimationFrame(frame)
    } else {
      canvas.remove()
    }
  }
  requestAnimationFrame(frame)
}
