// Geração da arte do pódio em canvas nativo (sem libs) para compartilhar no WhatsApp.
// Renderiza em escala 2x (2160×2700) e exporta um PNG nítido no formato feed/status (1080×1350).

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
}

const OURO = '#d4af37'
const PRATA = '#c0c0c0'
const BRONZE = '#cd7f32'
const BG = '#131313'
const TXT = '#f5f2ea'
const MUTED = '#8a8070'

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

// desenha uma foto/logo/iniciais dentro de um círculo com anel colorido
function desenharAvatar(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | null,
  cx: number, cy: number, r: number,
  cor: string, nome: string,
  logoEmFundoBranco = false,
) {
  ctx.save()
  // brilho sutil do anel
  ctx.shadowColor = cor + '88'
  ctx.shadowBlur = 30
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fillStyle = logoEmFundoBranco ? '#ffffff' : BG
  ctx.fill()
  ctx.restore()

  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.clip()
  if (img) {
    if (logoEmFundoBranco) {
      // logo: fundo branco + contain
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2)
      const escala = Math.min((r * 1.4) / img.width, (r * 1.4) / img.height)
      const w = img.width * escala, h = img.height * escala
      ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h)
    } else {
      // foto: cover
      const escala = Math.max((r * 2) / img.width, (r * 2) / img.height)
      const w = img.width * escala, h = img.height * escala
      ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h)
    }
  } else {
    // iniciais
    const c = corDoNome(nome)
    ctx.fillStyle = c + '33'
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2)
    ctx.fillStyle = c
    ctx.font = `700 ${Math.round(r * 0.7)}px 'Plus Jakarta Sans', sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(iniciais(nome), cx, cy + 2)
  }
  ctx.restore()

  // anel colorido
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.lineWidth = 8
  ctx.strokeStyle = cor
  ctx.stroke()
}

// disco com o número da posição no canto inferior direito da foto
function desenharMedalha(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, pos: number, cor: string) {
  const mx = cx + r * 0.72, my = cy + r * 0.72, mr = r * 0.32
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.5)'
  ctx.shadowBlur = 12
  ctx.beginPath()
  ctx.arc(mx, my, mr, 0, Math.PI * 2)
  ctx.fillStyle = cor
  ctx.fill()
  ctx.restore()
  ctx.beginPath()
  ctx.arc(mx, my, mr, 0, Math.PI * 2)
  ctx.lineWidth = 4
  ctx.strokeStyle = '#0a0a0a'
  ctx.stroke()
  ctx.fillStyle = '#0a0a0a'
  ctx.font = `800 ${Math.round(mr * 1.1)}px 'Plus Jakarta Sans', sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(String(pos), mx, my + 1)
}

export async function gerarPodioBlob(itens: PodioItem[], opts: PodioOpts): Promise<Blob> {
  const W = 1080, H = 1350, S = 2
  const canvas = document.createElement('canvas')
  canvas.width = W * S
  canvas.height = H * S
  const ctx = canvas.getContext('2d')!
  ctx.scale(S, S)

  // fundo
  ctx.fillStyle = BG
  ctx.fillRect(0, 0, W, H)
  // leve vinheta dourada no topo
  const vg = ctx.createRadialGradient(W / 2, 120, 40, W / 2, 120, 700)
  vg.addColorStop(0, 'rgba(212,175,55,0.10)')
  vg.addColorStop(1, 'rgba(212,175,55,0)')
  ctx.fillStyle = vg
  ctx.fillRect(0, 0, W, 500)

  // barra dourada no topo
  const gb = ctx.createLinearGradient(0, 0, W, 0)
  gb.addColorStop(0, '#8a6d1f')
  gb.addColorStop(0.5, OURO)
  gb.addColorStop(1, '#8a6d1f')
  ctx.fillStyle = gb
  ctx.fillRect(0, 0, W, 14)

  // ── cabeçalho ──
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = OURO
  ctx.font = `800 54px 'Plus Jakarta Sans', sans-serif`
  ctx.fillText(trunc(ctx, opts.periodoTitulo.toUpperCase(), W - 120), W / 2, 100)

  ctx.fillStyle = TXT
  ctx.font = `700 30px 'Plus Jakarta Sans', sans-serif`
  ctx.fillText(`RANKING · ${opts.modoLabel.toUpperCase()}`, W / 2, 146)

  if (opts.datas?.inicio && opts.datas?.fim) {
    ctx.fillStyle = MUTED
    ctx.font = `500 24px 'Plus Jakarta Sans', sans-serif`
    ctx.fillText(`${fmtDia(opts.datas.inicio)} a ${fmtDia(opts.datas.fim)}`, W / 2, 184)
  }

  // ── pódio (2 | 1 | 3) ──
  const top3 = itens.slice(0, 3)
  const primeiro = top3[0]
  const segundo = top3[1]
  const terceiro = top3[2]

  const desenharColuna = (
    item: PodioItem | undefined, cx: number, cy: number, r: number, cor: string, destaque: boolean,
    img: HTMLImageElement | null,
  ) => {
    if (!item) return
    desenharAvatar(ctx, img, cx, cy, r, cor, item.nome, !!opts.usaLogo)
    desenharMedalha(ctx, cx, cy, r, item.posicao, cor)

    let y = cy + r + (destaque ? 58 : 50)
    const colW = destaque ? 360 : 300
    // nome
    ctx.fillStyle = TXT
    ctx.font = `800 ${destaque ? 38 : 30}px 'Plus Jakarta Sans', sans-serif`
    ctx.textAlign = 'center'
    ctx.fillText(trunc(ctx, primeiroNome(item.nome), colW), cx, y)
    y += destaque ? 34 : 30
    // equipe · empresa
    const sub = [item.equipe_nome, item.empresa_nome].filter(Boolean).join(' · ')
    if (sub) {
      ctx.fillStyle = MUTED
      ctx.font = `500 20px 'Plus Jakarta Sans', sans-serif`
      ctx.fillText(trunc(ctx, sub, colW), cx, y)
    }
    y += destaque ? 52 : 46
    // valor
    ctx.fillStyle = cor
    ctx.font = `800 ${destaque ? 42 : 30}px 'JetBrains Mono', monospace`
    ctx.fillText(fmtMoeda(item.valor), cx, y)
    y += 30
    // cotas · ticket
    ctx.fillStyle = MUTED
    ctx.font = `500 20px 'Plus Jakarta Sans', sans-serif`
    ctx.fillText(`${item.qtd} cota${item.qtd !== 1 ? 's' : ''} · ticket ${fmtMoeda(item.ticket_medio)}`, cx, y)
  }

  const [imgP, imgS, imgT] = await Promise.all([
    carregarImagem(opts.usaLogo ? primeiro?.logo : primeiro?.foto),
    carregarImagem(opts.usaLogo ? segundo?.logo : segundo?.foto),
    carregarImagem(opts.usaLogo ? terceiro?.logo : terceiro?.foto),
  ])

  // 2º (esquerda) e 3º (direita) menores/mais baixos; 1º (centro) maior/mais alto
  desenharColuna(segundo, 205, 400, 104, PRATA, false, imgS)
  desenharColuna(terceiro, 875, 400, 104, BRONZE, false, imgT)
  desenharColuna(primeiro, 540, 350, 140, OURO, true, imgP)

  // ── linhas 4º e 5º ──
  const resto = itens.slice(3, 5)
  let ry = 1000
  const rowH = 96, rowGap = 16, rowX = 90, rowW = W - 180
  for (const item of resto) {
    ctx.fillStyle = 'rgba(255,255,255,0.04)'
    ;(ctx as any).beginPath()
    ;(ctx as any).roundRect(rowX, ry, rowW, rowH, 18)
    ctx.fill()
    ctx.strokeStyle = 'rgba(212,175,55,0.18)'
    ctx.lineWidth = 1.5
    ctx.stroke()

    // posição
    ctx.fillStyle = MUTED
    ctx.font = `800 30px 'JetBrains Mono', monospace`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(`${item.posicao}º`, rowX + 56, ry + rowH / 2)

    // nome + sub
    ctx.textAlign = 'left'
    ctx.fillStyle = TXT
    ctx.font = `700 30px 'Plus Jakarta Sans', sans-serif`
    ctx.fillText(trunc(ctx, primeiroNome(item.nome), 520), rowX + 120, ry + rowH / 2 - 12)
    const sub = [item.equipe_nome, item.empresa_nome].filter(Boolean).join(' · ')
    if (sub) {
      ctx.fillStyle = MUTED
      ctx.font = `500 20px 'Plus Jakarta Sans', sans-serif`
      ctx.fillText(trunc(ctx, sub, 520), rowX + 120, ry + rowH / 2 + 20)
    }

    // valor à direita
    ctx.textAlign = 'right'
    ctx.fillStyle = OURO
    ctx.font = `800 32px 'JetBrains Mono', monospace`
    ctx.fillText(fmtMoeda(item.valor), rowX + rowW - 28, ry + rowH / 2)

    ry += rowH + rowGap
  }

  // ── rodapé ──
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = OURO
  ctx.font = `800 26px 'Plus Jakarta Sans', sans-serif`
  ctx.fillText('GRUPO LR - SJC · EMBRACON', W / 2, H - 54)
  ctx.fillStyle = MUTED
  ctx.font = `500 20px 'Plus Jakarta Sans', sans-serif`
  const agora = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  ctx.fillText(`Gerado em ${agora}`, W / 2, H - 26)

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
