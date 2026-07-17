// Geração da arte do pódio em canvas nativo (sem libs) para compartilhar no WhatsApp.
// Renderiza em escala 2x (2160×2700) e exporta um PNG nítido no formato feed/status (1080×1350).
// Direção de arte premium dark/dourado com pódio olímpico em degraus.

export interface PodioItem {
  posicao: number
  nome: string
  foto?: string
  valor: number
  qtd: number
  ticket_medio: number
  equipe_nome?: string | null
  empresa_nome?: string | null
  logo?: string | null
}

export interface PodioOpts {
  periodoTitulo: string          // ex.: "MELHORES DA SEMANA" ou nome da produção
  modoLabel: string              // "Vendedores" | "Equipes" | "Representações"
  datas?: { inicio: string; fim: string } | null
  usaLogo?: boolean              // Ranking Geral + Representações → usa logo da empresa
  rodapeEsq: string              // texto do rodapé à esquerda (sem "· EMBRACON")
}

const OURO = '#d4af37'
const PRATA = '#c0c0c0'
const BRONZE = '#cd7f32'
const BG = '#0b0b0d'
const TXT = '#f5f2ea'
const MUTED = '#8a8070'
const FONT = "'Plus Jakarta Sans', 'Inter', 'Arial', sans-serif"
const MONO = "'JetBrains Mono', 'Arial', monospace"

const fmtMoeda = (v: number) =>
  (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const fmtDia = (s?: string) => {
  if (!s) return ''
  const [, m, d] = s.slice(0, 10).split('-')
  return `${d}/${m}`
}
const primeiroNome = (n: string) => n.trim().split(/\s+/).slice(0, 2).join(' ')
function iniciais(nome: string) {
  const p = nome.trim().split(/\s+/)
  return ((p[0]?.[0] || '') + (p[1]?.[0] || '')).toUpperCase() || '?'
}
const CORES_INICIAIS = ['#d4af37', '#3b82f6', '#22c55e', '#a855f7', '#ec4899', '#f97316', '#06b6d4']
function corDoNome(nome: string) {
  let h = 0
  for (let i = 0; i < nome.length; i++) h = nome.charCodeAt(i) + ((h << 5) - h)
  return CORES_INICIAIS[Math.abs(h) % CORES_INICIAIS.length]
}

function carregarImagem(url?: string | null): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (!url) return resolve(null)
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null) // CORS/404 → cai para iniciais sem quebrar
    img.src = url
  })
}

function trunc(ctx: CanvasRenderingContext2D, texto: string, maxW: number) {
  if (ctx.measureText(texto).width <= maxW) return texto
  let t = texto
  while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1)
  return t + '…'
}

// reduz a fonte até o texto caber em maxW; devolve o tamanho aplicado
function fitFont(ctx: CanvasRenderingContext2D, texto: string, maxW: number, weight: number, px: number, family = FONT, min = 16) {
  let s = px
  ctx.font = `${weight} ${s}px ${family}`
  while (s > min && ctx.measureText(texto).width > maxW) {
    s -= 2
    ctx.font = `${weight} ${s}px ${family}`
  }
  return s
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}

// ═══ FUNDO: gradiente radial + vinheta + feixes + partículas + linhas ═══
function desenharFundo(ctx: CanvasRenderingContext2D, W: number, H: number) {
  // 1. gradiente radial central
  const rg = ctx.createRadialGradient(W / 2, H * 0.38, 60, W / 2, H * 0.5, H * 0.75)
  rg.addColorStop(0, '#1c1c1f')
  rg.addColorStop(1, '#0b0b0d')
  ctx.fillStyle = rg
  ctx.fillRect(0, 0, W, H)

  // 3. dois feixes de luz diagonais dourados (bem sutis)
  ctx.save()
  ctx.fillStyle = 'rgba(212,175,55,0.04)'
  ctx.translate(W / 2, H * 0.42)
  ctx.rotate((30 * Math.PI) / 180)
  ctx.fillRect(-W * 0.9, -70, W * 1.8, 140)
  ctx.rotate((-60 * Math.PI) / 180)
  ctx.fillRect(-W * 0.9, -60, W * 1.8, 120)
  ctx.restore()

  // 4. ~40 partículas douradas
  for (let i = 0; i < 40; i++) {
    const x = Math.random() * W
    const y = Math.random() * H
    const r = 1 + Math.random() * 2
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(212,175,55,${(0.08 + Math.random() * 0.22).toFixed(3)})`
    ctx.fill()
  }

  // 2. vinheta escura nas bordas (radial invertido)
  const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.72)
  vg.addColorStop(0, 'rgba(0,0,0,0)')
  vg.addColorStop(1, 'rgba(0,0,0,0.55)')
  ctx.fillStyle = vg
  ctx.fillRect(0, 0, W, H)

  // 5. linhas douradas no topo e na base
  const gl = ctx.createLinearGradient(0, 0, W, 0)
  gl.addColorStop(0, 'rgba(212,175,55,0)')
  gl.addColorStop(0.5, OURO)
  gl.addColorStop(1, 'rgba(212,175,55,0)')
  ctx.fillStyle = gl
  ctx.fillRect(0, 0, W, 3)
  ctx.fillRect(0, H - 3, W, 3)
}

// ornamento: linha horizontal com losango dourado no centro
function ornamento(ctx: CanvasRenderingContext2D, cx: number, y: number, largura: number) {
  ctx.save()
  ctx.strokeStyle = 'rgba(212,175,55,0.5)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(cx - largura / 2, y)
  ctx.lineTo(cx - 26, y)
  ctx.moveTo(cx + 26, y)
  ctx.lineTo(cx + largura / 2, y)
  ctx.stroke()
  // losango
  ctx.translate(cx, y)
  ctx.rotate(Math.PI / 4)
  ctx.fillStyle = OURO
  ctx.fillRect(-9, -9, 18, 18)
  ctx.restore()
}

// coroa dourada (3 pontas com círculos) desenhada por path
function coroa(ctx: CanvasRenderingContext2D, cx: number, baseY: number, w: number) {
  const h = w * 0.7
  const x = cx - w / 2
  ctx.save()
  ctx.shadowColor = 'rgba(212,175,55,0.6)'
  ctx.shadowBlur = 20
  ctx.beginPath()
  ctx.moveTo(x, baseY)
  ctx.lineTo(x, baseY - h * 0.55)
  ctx.lineTo(x + w * 0.25, baseY - h * 0.15)
  ctx.lineTo(x + w * 0.5, baseY - h)
  ctx.lineTo(x + w * 0.75, baseY - h * 0.15)
  ctx.lineTo(x + w, baseY - h * 0.55)
  ctx.lineTo(x + w, baseY)
  ctx.closePath()
  const g = ctx.createLinearGradient(0, baseY - h, 0, baseY)
  g.addColorStop(0, '#f4d980')
  g.addColorStop(1, '#b8901f')
  ctx.fillStyle = g
  ctx.fill()
  ctx.restore()
  // pedras nos picos
  const picos = [x, x + w * 0.5, x + w]
  const alturas = [baseY - h * 0.55, baseY - h, baseY - h * 0.55]
  for (let i = 0; i < 3; i++) {
    ctx.beginPath()
    ctx.arc(picos[i], alturas[i], 7, 0, Math.PI * 2)
    ctx.fillStyle = '#fff4d0'
    ctx.fill()
  }
}

// plataforma do pódio (2.5D) com número gigante translúcido na frente
function plataforma(ctx: CanvasRenderingContext2D, cx: number, topY: number, w: number, h: number, groundY: number, corTopo: string, corBase: string, numero: number) {
  const x = cx - w / 2
  const altura = groundY - topY
  // frente
  const g = ctx.createLinearGradient(0, topY, 0, groundY)
  g.addColorStop(0, corTopo)
  g.addColorStop(1, corBase)
  roundRectPath(ctx, x, topY, w, altura, 8)
  ctx.fillStyle = g
  ctx.fill()
  // topo iluminado
  ctx.fillStyle = 'rgba(255,255,255,0.22)'
  roundRectPath(ctx, x, topY, w, 10, 6)
  ctx.fill()
  // borda sutil
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'
  ctx.lineWidth = 1.5
  roundRectPath(ctx, x, topY, w, altura, 8)
  ctx.stroke()
  // número gigante (marca d'água)
  ctx.save()
  roundRectPath(ctx, x, topY, w, altura, 8)
  ctx.clip()
  ctx.fillStyle = 'rgba(255,255,255,0.16)'
  ctx.font = `900 120px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(String(numero), cx, topY + altura / 2 + 6)
  ctx.restore()
}

// avatar circular (foto cover / logo em fundo branco / iniciais) com anel e glow
function desenharAvatar(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | null,
  cx: number, cy: number, r: number,
  cor: string, nome: string,
  logoEmFundoBranco: boolean,
  glow: boolean,
) {
  if (glow) {
    const gg = ctx.createRadialGradient(cx, cy, r * 0.4, cx, cy, r * 1.6)
    gg.addColorStop(0, 'rgba(212,175,55,0.28)')
    gg.addColorStop(1, 'rgba(212,175,55,0)')
    ctx.fillStyle = gg
    ctx.beginPath()
    ctx.arc(cx, cy, r * 1.6, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.clip()
  if (img) {
    if (logoEmFundoBranco) {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2)
      const escala = Math.min((r * 1.4) / img.width, (r * 1.4) / img.height)
      const w = img.width * escala, h = img.height * escala
      ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h)
    } else {
      const escala = Math.max((r * 2) / img.width, (r * 2) / img.height)
      const w = img.width * escala, h = img.height * escala
      ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h)
    }
  } else {
    const c = corDoNome(nome)
    const gr = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r)
    gr.addColorStop(0, c + '55')
    gr.addColorStop(1, '#101012')
    ctx.fillStyle = gr
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2)
    ctx.fillStyle = c
    ctx.font = `800 ${Math.round(r * 0.72)}px ${FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(iniciais(nome), cx, cy + 2)
  }
  ctx.restore()

  // anel em gradiente da cor da posição
  const ag = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r)
  ag.addColorStop(0, cor)
  ag.addColorStop(1, cor + '77')
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.lineWidth = 8
  ctx.strokeStyle = ag
  ctx.stroke()
}

export async function gerarPodioBlob(itens: PodioItem[], opts: PodioOpts): Promise<Blob> {
  const W = 1080, H = 1350, S = 2
  const canvas = document.createElement('canvas')
  canvas.width = W * S
  canvas.height = H * S
  const ctx = canvas.getContext('2d')!
  ctx.scale(S, S)

  desenharFundo(ctx, W, H)

  // ═══ CABEÇALHO ═══
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'

  // "RANKING OFICIAL" com letter-spacing manual
  ctx.fillStyle = OURO
  ctx.font = `700 26px ${FONT}`
  const kicker = 'RANKING OFICIAL'
  const ls = 8
  const larguras = kicker.split('').map((c) => ctx.measureText(c).width)
  const totalK = larguras.reduce((a, b) => a + b, 0) + ls * (kicker.length - 1)
  let kx = W / 2 - totalK / 2
  ctx.textAlign = 'left'
  for (let i = 0; i < kicker.length; i++) {
    ctx.fillText(kicker[i], kx, 88)
    kx += larguras[i] + ls
  }
  ctx.textAlign = 'center'

  // título gigante (com auto-shrink e sombra dourada)
  const titulo = opts.periodoTitulo.toUpperCase()
  ctx.save()
  ctx.shadowColor = 'rgba(212,175,55,0.35)'
  ctx.shadowBlur = 24
  const tPx = fitFont(ctx, titulo, W - 120, 900, 88)
  ctx.fillStyle = TXT
  ctx.font = `900 ${tPx}px ${FONT}`
  ctx.fillText(titulo, W / 2, 172)
  ctx.restore()

  // subtítulo
  ctx.fillStyle = MUTED
  ctx.font = `500 30px ${FONT}`
  const datas = opts.datas?.inicio && opts.datas?.fim ? ` · ${fmtDia(opts.datas.inicio)} a ${fmtDia(opts.datas.fim)}` : ''
  ctx.fillText(`${opts.modoLabel}${datas}`, W / 2, 214)

  // ornamento
  ornamento(ctx, W / 2, 250, 360)

  // ═══ PÓDIO ═══
  const top3 = itens.slice(0, 3)
  const [primeiro, segundo, terceiro] = top3
  const groundY = 1010

  const [imgP, imgS, imgT] = await Promise.all([
    carregarImagem(opts.usaLogo ? primeiro?.logo : primeiro?.foto),
    carregarImagem(opts.usaLogo ? segundo?.logo : segundo?.foto),
    carregarImagem(opts.usaLogo ? terceiro?.logo : terceiro?.foto),
  ])

  // config por coluna: [item, img, cx, larguraPlataforma, alturaPlataforma, fotoR, cor, corTopo, corBase, destaque]
  type Col = { item?: PodioItem; img: HTMLImageElement | null; cx: number; pw: number; ph: number; r: number; cor: string; cTopo: string; cBase: string; destaque: boolean }
  const cols: Col[] = [
    { item: segundo, img: imgS, cx: 190, pw: 250, ph: 130, r: 92, cor: PRATA, cTopo: '#d8d8d8', cBase: '#5a5a5a', destaque: false },
    { item: primeiro, img: imgP, cx: 540, pw: 300, ph: 200, r: 124, cor: OURO, cTopo: '#e6c04a', cBase: '#7a5f14', destaque: true },
    { item: terceiro, img: imgT, cx: 890, pw: 250, ph: 100, r: 92, cor: BRONZE, cTopo: '#dc9a55', cBase: '#6b3d12', destaque: false },
  ]

  // desenha plataformas primeiro (ficam atrás das fotos)
  for (const c of cols) {
    if (!c.item) continue
    plataforma(ctx, c.cx, groundY - c.ph, c.pw, c.ph, groundY, c.cTopo, c.cBase, c.item.posicao)
  }

  // depois fotos + textos flutuantes acima
  for (const c of cols) {
    if (!c.item) continue
    const platTop = groundY - c.ph
    const cy = platTop - c.r - 16
    const photoTop = cy - c.r
    desenharAvatar(ctx, c.img, c.cx, cy, c.r, c.cor, c.item.nome, !!opts.usaLogo, c.destaque)

    // bloco de texto ACIMA da foto (fundo escuro → alto contraste)
    const colW = c.destaque ? 300 : 250
    ctx.textAlign = 'center'
    // monta de baixo (encostando na foto) para cima
    let bottom = photoTop - 18

    // cotas · ticket
    ctx.fillStyle = MUTED
    ctx.font = `500 ${c.destaque ? 22 : 20}px ${FONT}`
    ctx.textBaseline = 'alphabetic'
    ctx.fillText(trunc(ctx, `${c.item.qtd} cota${c.item.qtd !== 1 ? 's' : ''} · ticket ${fmtMoeda(c.item.ticket_medio)}`, colW), c.cx, bottom)
    bottom -= c.destaque ? 30 : 26

    // pill do valor
    const valTxt = fmtMoeda(c.item.valor)
    const vPx = c.destaque ? 44 : 32
    ctx.font = `900 ${vPx}px ${MONO}`
    const vW = ctx.measureText(valTxt).width
    const padX = 22, pillH = c.destaque ? 64 : 52
    const pillW = vW + padX * 2
    const pillY = bottom - pillH
    roundRectPath(ctx, c.cx - pillW / 2, pillY, pillW, pillH, pillH / 2)
    ctx.fillStyle = 'rgba(0,0,0,0.4)'
    ctx.fill()
    ctx.strokeStyle = OURO
    ctx.lineWidth = 2
    roundRectPath(ctx, c.cx - pillW / 2, pillY, pillW, pillH, pillH / 2)
    ctx.stroke()
    ctx.fillStyle = OURO
    ctx.textBaseline = 'middle'
    ctx.fillText(valTxt, c.cx, pillY + pillH / 2 + 2)
    ctx.textBaseline = 'alphabetic'
    bottom = pillY - (c.destaque ? 18 : 14)

    // equipe · empresa
    const sub = [c.item.equipe_nome, c.item.empresa_nome].filter(Boolean).join(' · ')
    if (sub && !opts.usaLogo) {
      ctx.fillStyle = 'rgba(212,175,55,0.75)'
      ctx.font = `600 ${c.destaque ? 24 : 20}px ${FONT}`
      ctx.fillText(trunc(ctx, sub, colW), c.cx, bottom)
      bottom -= c.destaque ? 34 : 28
    }

    // nome
    ctx.fillStyle = TXT
    const nPx = fitFont(ctx, primeiroNome(c.item.nome).toUpperCase(), colW, 900, c.destaque ? 46 : 34)
    ctx.font = `900 ${nPx}px ${FONT}`
    ctx.fillText(primeiroNome(c.item.nome).toUpperCase(), c.cx, bottom)
  }

  // coroa do 1º — desenhada POR CIMA de tudo, encaixada no topo da foto (nunca sobre o texto)
  const colPrimeiro = cols.find(c => c.destaque && c.item)
  if (colPrimeiro) {
    const platTop = groundY - colPrimeiro.ph
    const cy = platTop - colPrimeiro.r - 16
    const topoFoto = cy - colPrimeiro.r
    coroa(ctx, colPrimeiro.cx, topoFoto + 30, 92)
  }

  // ═══ A BRIGA ═══
  let by = 1070
  if (primeiro && segundo) {
    const dif = (primeiro.valor || 0) - (segundo.valor || 0)
    const txt = dif > 0
      ? `🔥 ${primeiroNome(segundo.nome)} está a ${fmtMoeda(dif)} da liderança`
      : `🔥 Empate técnico na liderança!`
    ctx.font = `600 30px ${FONT}`
    const tw = ctx.measureText(txt).width
    const pw = Math.min(W - 120, tw + 64)
    const px = W / 2 - pw / 2
    roundRectPath(ctx, px, by - 44, pw, 60, 30)
    ctx.fillStyle = 'rgba(212,175,55,0.10)'
    ctx.fill()
    ctx.strokeStyle = 'rgba(212,175,55,0.45)'
    ctx.lineWidth = 1
    roundRectPath(ctx, px, by - 44, pw, 60, 30)
    ctx.stroke()
    ctx.fillStyle = TXT
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(trunc(ctx, txt, pw - 40), W / 2, by - 12)
    ctx.textBaseline = 'alphabetic'
  }

  // ═══ 4º e 5º (dois cards lado a lado) ═══
  const resto = itens.slice(3, 5)
  if (resto.length > 0) {
    const gap = 24, cardW = (W - 180 - gap) / 2, cardH = 108, cardY = 1130
    resto.forEach((item, i) => {
      const cardX = 90 + i * (cardW + gap)
      roundRectPath(ctx, cardX, cardY, cardW, cardH, 18)
      ctx.fillStyle = 'rgba(255,255,255,0.04)'
      ctx.fill()
      ctx.strokeStyle = 'rgba(212,175,55,0.18)'
      ctx.lineWidth = 1.5
      roundRectPath(ctx, cardX, cardY, cardW, cardH, 18)
      ctx.stroke()

      // posição
      ctx.fillStyle = MUTED
      ctx.font = `800 30px ${MONO}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(`${item.posicao}º`, cardX + 44, cardY + cardH / 2)

      // avatar 72px
      const av = 36
      desenharAvatar(ctx, null, cardX + 44 + 40 + av, cardY + cardH / 2, av, OURO, item.nome, false, false)

      // nome + sub
      const txtX = cardX + 44 + 40 + av * 2 + 18
      const txtMaxW = cardX + cardW - 24 - txtX
      ctx.textAlign = 'left'
      ctx.fillStyle = TXT
      ctx.font = `700 28px ${FONT}`
      ctx.fillText(trunc(ctx, primeiroNome(item.nome), txtMaxW), txtX, cardY + cardH / 2 - 12)
      ctx.fillStyle = OURO
      ctx.font = `800 26px ${MONO}`
      ctx.fillText(fmtMoeda(item.valor), txtX, cardY + cardH / 2 + 22)
    })
    ctx.textBaseline = 'alphabetic'
    ctx.textAlign = 'center'
  }

  // ═══ RODAPÉ ═══
  const footY = H - 40
  ctx.strokeStyle = 'rgba(212,175,55,0.25)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(90, footY - 30)
  ctx.lineTo(W - 90, footY - 30)
  ctx.stroke()

  ctx.textAlign = 'left'
  ctx.fillStyle = OURO
  ctx.font = `800 24px ${FONT}`
  ctx.fillText(`${opts.rodapeEsq.toUpperCase()} · EMBRACON`, 90, footY)

  ctx.textAlign = 'right'
  ctx.fillStyle = MUTED
  ctx.font = `500 20px ${FONT}`
  const agora = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  ctx.fillText(agora, W - 90, footY)

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Falha ao gerar imagem'))), 'image/png', 1)
  })
}

// Compartilha (Web Share com arquivo) ou baixa o PNG. Retorna 'compartilhado' | 'baixado'.
export async function compartilharPodio(itens: PodioItem[], opts: PodioOpts, slug: string): Promise<'compartilhado' | 'baixado'> {
  const blob = await gerarPodioBlob(itens, opts)
  const nome = `podio-${slug}.png`
  const file = new File([blob], nome, { type: 'image/png' })
  const nav = navigator as any

  if (nav.canShare && nav.canShare({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: 'Ranking', text: `${opts.periodoTitulo} · ${opts.modoLabel}` })
      return 'compartilhado'
    } catch (e: any) {
      if (e?.name === 'AbortError') return 'compartilhado' // usuário cancelou; não faz fallback
      // qualquer outra falha → cai para download
    }
  }

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nome
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
  return 'baixado'
}
