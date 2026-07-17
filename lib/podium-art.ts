// lib/podium-art.ts
// Arte do pódio para compartilhamento — layout em grid fixo, sem sobreposições.
// Uso: const blob = await gerarArtePodio({ titulo, subtitulo, periodo, itens, escopo })

export interface PodioItem {
  posicao: number
  nome: string
  equipe?: string
  empresa?: string
  valor: number
  qtd: number
  foto?: string | null
}
export interface PodioOpcoes {
  titulo: string        // ex: "PRODUÇÃO JULHO" ou "MELHORES DA SEMANA"
  subtitulo: string     // ex: "RANKING · VENDEDORES"
  periodo: string       // ex: "29/06 a 31/07"
  itens: PodioItem[]    // ordenado por posição (1..5)
  escopo: 'geral' | 'empresa'
  nomeEmpresa?: string  // usado no rodapé quando escopo = 'empresa'
}

const W = 1080, H = 1350, SCALE = 2
const OURO = '#d4af37', PRATA = '#c0c0c0', BRONZE = '#cd7f32'
const CORES = ['', OURO, PRATA, BRONZE]

const fmtBR = (v: number) => 'R$ ' + Math.round(v).toLocaleString('pt-BR')
const fmtK = (v: number) => v >= 1000000 ? `R$ ${(v / 1000000).toFixed(v % 1000000 === 0 ? 0 : 1).replace('.', ',')}M` : `R$ ${Math.round(v / 1000)}k`

// desenha texto centralizado reduzindo a fonte até caber em maxW (nunca estoura)
function textoAjustado(ctx: CanvasRenderingContext2D, texto: string, x: number, y: number, maxW: number, fontePx: number, peso: string, cor: string) {
  let px = fontePx
  ctx.fillStyle = cor
  do {
    ctx.font = `${peso} ${px}px Inter, Arial, sans-serif`
    if (ctx.measureText(texto).width <= maxW) break
    px -= 2
  } while (px > 14)
  // se mesmo no mínimo não coube, trunca com reticências
  let t = texto
  while (ctx.measureText(t).width > maxW && t.length > 4) t = t.slice(0, -2).trimEnd() + '…'
  ctx.fillText(t, x, y)
}

function circuloFoto(ctx: CanvasRenderingContext2D, img: HTMLImageElement | null, nome: string, cx: number, cy: number, raio: number, corAnel: string, glow: boolean) {
  if (glow) {
    const g = ctx.createRadialGradient(cx, cy, raio * 0.4, cx, cy, raio * 1.7)
    g.addColorStop(0, 'rgba(212,175,55,0.28)'); g.addColorStop(1, 'rgba(212,175,55,0)')
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, raio * 1.7, 0, Math.PI * 2); ctx.fill()
  }
  // anel
  ctx.beginPath(); ctx.arc(cx, cy, raio + 7, 0, Math.PI * 2)
  ctx.fillStyle = corAnel; ctx.fill()
  // foto ou iniciais
  ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, raio, 0, Math.PI * 2); ctx.clip()
  if (img) {
    const s = Math.max((raio * 2) / img.width, (raio * 2) / img.height)
    ctx.drawImage(img, cx - (img.width * s) / 2, cy - (img.height * s) / 2, img.width * s, img.height * s)
  } else {
    ctx.fillStyle = '#26262b'; ctx.fillRect(cx - raio, cy - raio, raio * 2, raio * 2)
    const ini = nome.split(' ').filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase()
    ctx.fillStyle = corAnel; ctx.font = `900 ${raio * 0.8}px Inter, Arial, sans-serif`
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(ini, cx, cy + raio * 0.05)
    ctx.textBaseline = 'alphabetic'
  }
  ctx.restore()
}

function pill(ctx: CanvasRenderingContext2D, texto: string, cx: number, cy: number, fontePx: number, corTexto: string, corBorda: string) {
  ctx.font = `900 ${fontePx}px Inter, Arial, sans-serif`
  const w = ctx.measureText(texto).width + 44, h = fontePx + 26
  ctx.beginPath(); (ctx as any).roundRect(cx - w / 2, cy - h / 2, w, h, h / 2)
  ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fill()
  ctx.strokeStyle = corBorda; ctx.lineWidth = 2; ctx.stroke()
  ctx.fillStyle = corTexto; ctx.textAlign = 'center'
  ctx.fillText(texto, cx, cy + fontePx * 0.36)
}

async function carregarImg(url?: string | null): Promise<HTMLImageElement | null> {
  if (!url) return null
  return new Promise((res) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => res(img)
    img.onerror = () => res(null)
    img.src = url
  })
}

export async function gerarArtePodio(op: PodioOpcoes): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = W * SCALE; canvas.height = H * SCALE
  const ctx = canvas.getContext('2d')!
  ctx.scale(SCALE, SCALE)
  ctx.textAlign = 'center'

  const top3 = op.itens.filter(i => i.posicao <= 3)
  const resto = op.itens.filter(i => i.posicao > 3).slice(0, 2)
  const fotos = new Map<number, HTMLImageElement | null>()
  await Promise.all(op.itens.map(async i => fotos.set(i.posicao, await carregarImg(i.foto))))

  // ═══ FUNDO ═══
  const bg = ctx.createRadialGradient(W / 2, H * 0.35, 80, W / 2, H / 2, H * 0.85)
  bg.addColorStop(0, '#1d1d20'); bg.addColorStop(1, '#0a0a0c')
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H)
  // feixes diagonais sutis
  ctx.save(); ctx.translate(W / 2, 0); ctx.rotate(0.5)
  ctx.fillStyle = 'rgba(212,175,55,0.035)'; ctx.fillRect(-700, -200, 180, 2200); ctx.fillRect(280, -200, 120, 2200)
  ctx.restore()
  // partículas
  for (let i = 0; i < 42; i++) {
    ctx.fillStyle = `rgba(212,175,55,${0.06 + Math.random() * 0.22})`
    ctx.beginPath(); ctx.arc(Math.random() * W, Math.random() * H, 1 + Math.random() * 2, 0, Math.PI * 2); ctx.fill()
  }
  // barras topo/base
  const barra = ctx.createLinearGradient(0, 0, W, 0)
  barra.addColorStop(0, 'rgba(212,175,55,0)'); barra.addColorStop(0.5, OURO); barra.addColorStop(1, 'rgba(212,175,55,0)')
  ctx.fillStyle = barra; ctx.fillRect(0, 0, W, 3); ctx.fillRect(0, H - 3, W, 3)

  // ═══ CABEÇALHO (y: 60–210) ═══
  ctx.fillStyle = OURO; ctx.font = '600 21px Inter, Arial, sans-serif'
  ctx.fillText('R A N K I N G   O F I C I A L', W / 2, 74)
  ctx.shadowColor = 'rgba(212,175,55,0.4)'; ctx.shadowBlur = 22
  textoAjustado(ctx, op.titulo.toUpperCase(), W / 2, 140, W - 120, 64, '900', '#ffffff')
  ctx.shadowBlur = 0
  ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.font = '500 24px Inter, Arial, sans-serif'
  ctx.fillText(`${op.subtitulo}  ·  ${op.periodo}`, W / 2, 180)
  // ornamento
  ctx.strokeStyle = 'rgba(212,175,55,0.5)'; ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(W / 2 - 140, 206); ctx.lineTo(W / 2 - 14, 206); ctx.moveTo(W / 2 + 14, 206); ctx.lineTo(W / 2 + 140, 206); ctx.stroke()
  ctx.save(); ctx.translate(W / 2, 206); ctx.rotate(Math.PI / 4)
  ctx.fillStyle = OURO; ctx.fillRect(-5, -5, 10, 10); ctx.restore()

  // ═══ PÓDIO (plataformas: base y=760) ═══
  const BASE = 760
  const slots = [
    { pos: 2, cx: 200, plat: 130, foto: 96 },
    { pos: 1, cx: 540, plat: 175, foto: 120 },
    { pos: 3, cx: 880, plat: 100, foto: 96 },
  ]
  for (const s of slots) {
    const item = top3.find(i => i.posicao === s.pos)
    if (!item) continue
    const cor = CORES[s.pos]
    const platW = 280, platX = s.cx - platW / 2, platY = BASE - s.plat
    // plataforma: frente
    const gFrente = ctx.createLinearGradient(0, platY, 0, BASE)
    gFrente.addColorStop(0, cor); gFrente.addColorStop(1, '#141416')
    ctx.fillStyle = gFrente; ctx.globalAlpha = 0.9
    ctx.fillRect(platX, platY, platW, s.plat)
    ctx.globalAlpha = 1
    // topo iluminado (perspectiva)
    ctx.beginPath()
    ctx.moveTo(platX, platY); ctx.lineTo(platX + 18, platY - 14); ctx.lineTo(platX + platW - 18, platY - 14); ctx.lineTo(platX + platW, platY)
    ctx.closePath(); ctx.fillStyle = 'rgba(255,255,255,0.28)'; ctx.fill()
    // número da posição na frente
    ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.font = `900 ${Math.min(84, s.plat - 26)}px Inter, Arial, sans-serif`
    ctx.fillText(String(s.pos), s.cx, BASE - (s.plat - Math.min(84, s.plat - 26)) / 2 - 12)

    // foto acima da plataforma
    const fotoCy = platY - 14 - s.foto - 12
    circuloFoto(ctx, fotos.get(s.pos) || null, item.nome, s.cx, fotoCy + s.foto, s.foto, cor, s.pos === 1)
    // coroa no 1º
    if (s.pos === 1) {
      const cy = fotoCy - 18, cw = 62
      ctx.fillStyle = OURO
      ctx.beginPath()
      ctx.moveTo(s.cx - cw / 2, cy + 26); ctx.lineTo(s.cx - cw / 2, cy + 6); ctx.lineTo(s.cx - cw / 4, cy + 18)
      ctx.lineTo(s.cx, cy); ctx.lineTo(s.cx + cw / 4, cy + 18); ctx.lineTo(s.cx + cw / 2, cy + 6); ctx.lineTo(s.cx + cw / 2, cy + 26)
      ctx.closePath(); ctx.fill()
    }
    // textos ABAIXO da base do pódio, por coluna (y fixos → sem colisão)
    const tx = s.cx, larg = 300
    textoAjustado(ctx, item.nome, tx, BASE + 44, larg, s.pos === 1 ? 34 : 28, '900', '#ffffff')
    const sub = [item.equipe, item.empresa].filter(Boolean).join(' · ')
    textoAjustado(ctx, sub, tx, BASE + 74, larg, 19, '500', 'rgba(212,175,55,0.78)')
    pill(ctx, fmtBR(item.valor), tx, BASE + 116, s.pos === 1 ? 30 : 25, cor, cor)
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = '500 18px Inter, Arial, sans-serif'
    ctx.fillText(`${item.qtd} cota${item.qtd === 1 ? '' : 's'} · ticket ${fmtK(item.valor / Math.max(1, item.qtd))}`, tx, BASE + 152)
  }

  // ═══ FAIXA DA BRIGA (y=960) ═══
  const p1 = top3.find(i => i.posicao === 1), p2 = top3.find(i => i.posicao === 2)
  if (p1 && p2) {
    const dif = p1.valor - p2.valor
    pill(ctx, `🔥 ${p2.nome.split(' ')[0]} está a ${fmtK(dif)} da liderança`, W / 2, 964, 23, '#ffffff', 'rgba(212,175,55,0.55)')
  }

  // ═══ 4º e 5º (y: 1020–1180) ═══
  resto.forEach((item, idx) => {
    const y = 1024 + idx * 84
    ctx.beginPath(); (ctx as any).roundRect(110, y, W - 220, 70, 14)
    ctx.fillStyle = 'rgba(255,255,255,0.045)'; ctx.fill()
    ctx.strokeStyle = 'rgba(212,175,55,0.22)'; ctx.lineWidth = 1; ctx.stroke()
    ctx.textAlign = 'left'
    ctx.fillStyle = 'rgba(212,175,55,0.9)'; ctx.font = '900 26px Inter, Arial, sans-serif'
    ctx.fillText(`${item.posicao}º`, 140, y + 44)
    ctx.fillStyle = '#ffffff'; ctx.font = '700 24px Inter, Arial, sans-serif'
    let nm = item.nome
    while (ctx.measureText(nm).width > 420 && nm.length > 4) nm = nm.slice(0, -2).trimEnd() + '…'
    ctx.fillText(nm, 200, y + 32)
    ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.font = '500 17px Inter, Arial, sans-serif'
    let sb = [item.equipe, item.empresa].filter(Boolean).join(' · ')
    while (ctx.measureText(sb).width > 420 && sb.length > 4) sb = sb.slice(0, -2).trimEnd() + '…'
    ctx.fillText(sb, 200, y + 56)
    ctx.textAlign = 'right'
    ctx.fillStyle = OURO; ctx.font = '900 27px Inter, Arial, sans-serif'
    ctx.fillText(fmtBR(item.valor), W - 140, y + 44)
    ctx.textAlign = 'center'
  })

  // ═══ RODAPÉ (y=1300) — condicionado ao escopo ═══
  ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(0, 1262, W, 1)
  const marca = op.escopo === 'geral'
    ? 'RANKING GERAL DA OPERAÇÃO · EMBRACON'
    : `${(op.nomeEmpresa || '').toUpperCase()} · EMBRACON`
  ctx.fillStyle = OURO; ctx.font = '700 20px Inter, Arial, sans-serif'
  ctx.fillText(marca, W / 2, 1300)
  ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.font = '500 15px Inter, Arial, sans-serif'
  ctx.fillText(`gerado em ${new Date().toLocaleDateString('pt-BR')}`, W / 2, 1326)

  return new Promise<Blob>((res) => canvas.toBlob(b => res(b!), 'image/png'))
}
