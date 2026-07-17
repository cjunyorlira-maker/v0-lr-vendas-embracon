'use client'

import { useState, useEffect, useRef, useMemo, memo } from 'react'
import Sidebar from '@/components/Sidebar'
import Header from '@/components/Header'
import { Trophy, Loader2, Users, Building2, User, Shield, Zap, CalendarRange, Tv, ChevronUp, ChevronDown, Minus, Home, Globe, Flame, Crown, Swords } from 'lucide-react'
import { dispararConfete } from '@/lib/confetti'

interface RankItem { posicao: number; nome: string; foto?: string; valor: number; qtd: number; ticket_medio: number; maior_venda: number; equipe_nome?: string | null; empresa_nome?: string | null; empresa_id?: string | null; logo?: string | null; vendedor_id?: string | null; rei_semana?: boolean; streak_semanas?: number }

interface ReiSemana {
  geral: { vendedor_id: string; nome: string; foto?: string; valor: number } | null
  por_empresa: Record<string, { vendedor_id: string; nome: string; foto?: string; valor: number }>
  datas: { ini: string; fim: string }
}
interface RecordeIndividual { vendedor: string; foto?: string; equipe?: string; empresa?: string; producao: string; valor: number }
interface Fixos {
  periodo_label: string // "do Mês" | "da Semana" | "do Ano"
  melhor_equipe: { nome: string; empresa?: string; valor: number } | null
  melhor_vendedor: { nome: string; foto?: string; equipe?: string; empresa?: string; valor: number } | null
  recordista: RecordeIndividual | null
}

// paleta fixa (12 cores discretas) para diferenciar empresas no Ranking Geral
const CORES_EMPRESA = ['#d4af37', '#3b82f6', '#22c55e', '#ec4899', '#f97316', '#06b6d4', '#a855f7', '#ef4444', '#14b8a6', '#eab308', '#8b5cf6', '#64748b']
function corDaEmpresa(id?: string | null) {
  if (!id) return CORES_EMPRESA[0]
  let h = 0
  for (let i = 0; i < id.length; i++) h = id.charCodeAt(i) + ((h << 5) - h)
  return CORES_EMPRESA[Math.abs(h) % CORES_EMPRESA.length]
}
interface Producao { id: string; nome: string; data_inicio: string; data_fim: string }
interface Destaques {
  top_equipe: { nome: string; valor: number; qtd: number } | null
  top_empresa: { nome: string; valor: number; qtd: number } | null
  maior_ticket: { nome: string; foto?: string; ticket: number; qtd: number } | null
  maior_venda_unica: { valor: number; vendedor: string; empresa: string } | null
}

const fmtMoeda = (v: number) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const fmtDia = (s?: string) => { if (!s) return ''; const [a, m, d] = s.slice(0, 10).split('-'); return `${d}/${m}` }

const CORES_INICIAIS = ['#d4af37', '#3b82f6', '#22c55e', '#a855f7', '#ec4899', '#f97316', '#06b6d4']
function corDoNome(nome: string) {
  let h = 0
  for (let i = 0; i < nome.length; i++) h = nome.charCodeAt(i) + ((h << 5) - h)
  return CORES_INICIAIS[Math.abs(h) % CORES_INICIAIS.length]
}
function iniciais(nome: string) {
  const p = nome.trim().split(/\s+/)
  return ((p[0]?.[0] || '') + (p[1]?.[0] || '')).toUpperCase() || '?'
}

function Avatar({ nome, foto, size, borderColor }: { nome: string; foto?: string; size: number; borderColor?: string }) {
  const borda = borderColor ? { border: `3px solid ${borderColor}`, boxShadow: `0 0 16px ${borderColor}55` } : {}
  if (foto) {
    return <img src={foto || "/placeholder.svg"} alt={nome} width={size} height={size} className="rounded-full shrink-0" style={{ width: size, height: size, objectFit: 'cover', ...borda }} />
  }
  const cor = corDoNome(nome)
  return (
    <div className="rounded-full shrink-0 flex items-center justify-center font-bold" style={{ width: size, height: size, background: `${cor}22`, color: cor, fontSize: size * 0.36, ...borda }}>
      {iniciais(nome)}
    </div>
  )
}

// ↑N verde / ↓N vermelho / — para variação de posição
function Variacao({ delta }: { delta: number | null }) {
  if (delta === null) return null
  if (delta === 0) return <span className="inline-flex items-center text-[11px]" style={{ color: 'var(--muted-color)' }}><Minus size={12} /></span>
  const subiu = delta > 0
  return (
    <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold" style={{ color: subiu ? '#22c55e' : '#ef4444' }}>
      {subiu ? <ChevronUp size={13} /> : <ChevronDown size={13} />}{Math.abs(delta)}
    </span>
  )
}

// coroa do Rei da Semana (permanece a semana inteira)
function Coroa({ datas }: { datas?: { ini: string; fim: string } }) {
  const t = datas ? `Rei da Semana — melhor de ${fmtDia(datas.ini)} a ${fmtDia(datas.fim)}` : 'Rei da Semana'
  return <span title={t} className="inline-flex shrink-0" aria-label={t}><Crown size={15} style={{ color: '#d4af37', fill: '#d4af37' }} /></span>
}

// badge de streak (>= 3 semanas) — texto por extenso
function StreakBadge({ n }: { n: number }) {
  if (n < 3) return null
  return (
    <span title={`${n} semanas consecutivas com venda`} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold shrink-0 whitespace-nowrap" style={{ background: 'rgba(249,115,22,0.15)', color: '#f97316', border: '1px solid rgba(249,115,22,0.35)' }}>
      <Flame size={11} />{n} semanas seguidas vendendo
    </span>
  )
}

// ticker da disputa: componente isolado e memoizado — a rotação a cada 6s NÃO re-renderiza o pódio
const Ticker = memo(function Ticker({ frases }: { frases: string[] }) {
  const [idx, setIdx] = useState(0)
  const [fade, setFade] = useState(true)
  useEffect(() => {
    setIdx(0)
    if (frases.length <= 1) return
    const id = setInterval(() => {
      setFade(false)
      setTimeout(() => { setIdx(i => (i + 1) % frases.length); setFade(true) }, 400)
    }, 6000)
    return () => clearInterval(id)
  }, [frases])
  if (frases.length === 0) return null
  return (
    <div className="rounded-full px-4 py-2 mb-4 flex items-center gap-2 overflow-hidden" style={{ background: 'linear-gradient(90deg, rgba(212,175,55,0.14), rgba(0,0,0,0.15))', border: '1px solid rgba(212,175,55,0.25)' }}>
      <Swords size={14} style={{ color: 'var(--accent)' }} className="shrink-0" />
      <p className="text-xs sm:text-sm font-medium truncate transition-opacity duration-300 text-pretty" style={{ color: 'var(--text2)', opacity: fade ? 1 : 0 }}>
        {frases[idx] || frases[0]}
      </p>
    </div>
  )
})

// card de destaque compacto (foto/escudo à esquerda, borda esquerda grossa + brilho no hover)
function CardDestaque({ cor, icon: Icon, foto, avatarNome, label, nome, valor, sub, animCls }: { cor: string; icon?: any; foto?: string; avatarNome?: string; label: string; nome: string; valor: string; sub?: string | null; animCls: string }) {
  return (
    <div className={`card-glow relative rounded-xl px-3 py-2.5 flex items-center gap-3 ${animCls}`} style={{ minHeight: 72, background: `${cor}14`, border: `1px solid ${cor}40`, borderLeft: `3px solid ${cor}`, ['--glow' as any]: `${cor}44` }}>
      {avatarNome !== undefined
        ? <Avatar nome={avatarNome} foto={foto} size={44} borderColor={cor} />
        : <div className="flex items-center justify-center rounded-lg shrink-0" style={{ width: 44, height: 44, background: `${cor}1f`, border: `1px solid ${cor}55` }}>{Icon && <Icon size={22} style={{ color: cor }} />}</div>}
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-wide truncate" style={{ color: 'var(--muted-color)' }}>{label}</p>
        <p className="font-bold leading-tight truncate" style={{ color: 'var(--text)', fontSize: 16 }}>{nome}</p>
        <p className="font-bold font-mono leading-tight" style={{ color: cor, fontSize: 18 }}>{valor}</p>
        {sub && <p className="text-[10px] truncate" style={{ color: 'var(--muted-color)' }}>{sub}</p>}
      </div>
    </div>
  )
}

export default function RankingPage() {
  const [ranking, setRanking] = useState<RankItem[]>([])
  const [destaques, setDestaques] = useState<Destaques | null>(null)
  const [producoes, setProducoes] = useState<Producao[]>([])
  const [producaoId, setProducaoId] = useState('')
  const [periodo, setPeriodo] = useState<'' | 'semana' | 'ano'>('')
  const [loading, setLoading] = useState(true)
  const [modo, setModo] = useState<'vendedor' | 'equipe' | 'representante'>('vendedor')
  const [escopo, setEscopo] = useState<'operacao' | 'geral'>('operacao')
  const [role, setRole] = useState('')
  const [fEmpresa, setFEmpresa] = useState('')
  const [empresas, setEmpresas] = useState<any[]>([])
  const [variacao, setVariacao] = useState<Record<string, number>>({})
  const [telao, setTelao] = useState(false)
  const [reiSemana, setReiSemana] = useState<ReiSemana | null>(null)
  const [fixos, setFixos] = useState<Fixos | null>(null)
  const [jaAnimou, setJaAnimou] = useState(false) // anima entrada só na 1ª carga
  const liderAnterior = useRef<string | null>(null)
  const primeiraCarga = useRef(true)
  const animCls = jaAnimou ? '' : 'anim-fade-up'

  // ao voltar para "Minha operação", garante um modo permitido para o role
  useEffect(() => {
    if (escopo === 'operacao') {
      const permitido: Record<string, string[]> = {
        vendedor: ['vendedor'], supervisor: ['vendedor'],
        adm: ['vendedor', 'equipe'], representante: ['vendedor', 'equipe'],
        master: ['vendedor', 'equipe', 'representante'],
      }
      const ok = permitido[role] || ['vendedor']
      if (!ok.includes(modo)) { setModo('vendedor'); return }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [escopo, role])

  useEffect(() => { loadData() }, [modo, fEmpresa, producaoId, periodo, escopo])
  useEffect(() => {
    fetch('/api/usuarios/listar').then(r => r.json()).then(d => { if (d.empresas) setEmpresas(d.empresas) }).catch(() => {})
  }, [])

  // auto-refresh de 60s no modo tel��o OU no Ranking Geral (tempo real)
  useEffect(() => {
    if (!telao && escopo !== 'geral') return
    const id = setInterval(() => loadData(), 60000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [telao, escopo, modo, fEmpresa, producaoId, periodo])

  // sincroniza estado do telão quando o usuário sai do fullscreen (Esc)
  useEffect(() => {
    const onFs = () => { if (!document.fullscreenElement) setTelao(false) }
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [])

  // frases do ticker da disputa (geradas só a partir dos dados disponíveis; embaralhadas a cada carga)
  const frasesTicker = useMemo(() => {
    const f: string[] = []
    // ⚔️ / 🔥 1º x 2º
    if (ranking.length >= 2) {
      const dif = ranking[0].valor - ranking[1].valor
      if (dif > 0) {
        f.push(`⚔️ ${ranking[0].nome} × ${ranking[1].nome}: apenas ${fmtMoeda(dif)} separa os dois`)
        f.push(`🔥 ${ranking[1].nome} está a ${fmtMoeda(dif)} de assumir a liderança!`)
      }
    }
    // 🚀 maior arrancada (subida de posições na produção)
    let maiorSubida: { nome: string; delta: number } | null = null
    for (const r of ranking) {
      const d = variacao[r.nome]
      if (d !== undefined && d > 0 && (!maiorSubida || d > maiorSubida.delta)) maiorSubida = { nome: r.nome, delta: d }
    }
    if (maiorSubida) f.push(`🚀 Maior arrancada: ${maiorSubida.nome} subiu ${maiorSubida.delta} posiç${maiorSubida.delta === 1 ? 'ão' : 'ões'} na produção`)
    // 👑 rei da semana passada
    if (reiSemana?.geral) f.push(`👑 ${reiSemana.geral.nome}: Rei da Semana passada com ${fmtMoeda(reiSemana.geral.valor)}`)
    // 🔥 maior streak
    const comStreak = ranking.filter(r => (r.streak_semanas || 0) >= 3).sort((a, b) => (b.streak_semanas || 0) - (a.streak_semanas || 0))[0]
    if (comStreak) f.push(`🔥 ${comStreak.nome}: ${comStreak.streak_semanas} semanas seguidas vendendo — quem alcança?`)
    // 💎 maior venda da produção
    if (destaques?.maior_venda_unica && destaques.maior_venda_unica.valor > 0) f.push(`💎 Maior venda da produção: ${destaques.maior_venda_unica.vendedor} — ${fmtMoeda(destaques.maior_venda_unica.valor)}`)
    // 📊 total do período + 🎉 marco de 10M
    const total = ranking.reduce((s, r) => s + r.valor, 0)
    if (total > 0) f.push(`📊 A operação já soma ${fmtMoeda(total)} — e não parou`)
    const marco = Math.floor(total / 10_000_000) * 10_000_000
    if (marco >= 10_000_000) f.push(`🎉 Passamos de ${fmtMoeda(marco)}!`)
    // 🎯 dias restantes (só quando uma produção está selecionada)
    if (!periodo && producaoId) {
      const prod = producoes.find(p => p.id === producaoId)
      if (prod?.data_fim) {
        const dias = Math.ceil((new Date(prod.data_fim + 'T23:59:59').getTime() - Date.now()) / 86400000)
        if (dias >= 0 && dias <= 60) f.push(`🎯 Falta${dias === 1 ? '' : 'm'} ${dias} dia${dias === 1 ? '' : 's'} para o fim da produção`)
      }
    }
    // embaralha (Fisher-Yates) para não repetir sempre na mesma ordem
    for (let i = f.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [f[i], f[j]] = [f[j], f[i]] }
    return f
  }, [ranking, variacao, reiSemana, destaques, producoes, producaoId, periodo])

  async function loadData() {
    // spinner só quando ainda não há dados; refreshes trocam os dados em background sem desmontar a tela
    if (ranking.length === 0) setLoading(true)
    const params = (extra: string) => {
      let u = `/api/ranking?modo=${modo}${extra}`
      if (escopo === 'geral') u += `&escopo=geral`
      else if (fEmpresa) u += `&empresa=${fEmpresa}`
      return u
    }
    let url = params('')
    if (periodo) url += `&periodo=${periodo}`
    else if (producaoId) url += `&producao_id=${producaoId}`

    const res = await fetch(url)
    const data = await res.json()
    if (data.ranking) {
      setRanking(data.ranking)
      setDestaques(data.destaques || null)
      setReiSemana(data.rei_semana || null)
      setFixos(data.fixos || null)
      setRole(data.meu_role)
      if (data.producoes) setProducoes(data.producoes)
      if (data.producao_ativa && !producaoId && !periodo) setProducaoId(data.producao_ativa)

      // confete quando o 1º lugar muda em relação à última visualização
      const novoLider = data.ranking[0]?.nome || null
      if (novoLider && liderAnterior.current && novoLider !== liderAnterior.current) {
        dispararConfete()
      }
      liderAnterior.current = novoLider

      // variação vs produção anterior (só quando um período de produção está ativo)
      if (!periodo && data.producao_ativa) {
        const lista: Producao[] = data.producoes || []
        const idx = lista.findIndex(p => p.id === data.producao_ativa)
        const anterior = idx >= 0 ? lista[idx + 1] : null
        if (anterior) {
          try {
            const resAnt = await fetch(params(`&producao_id=${anterior.id}`))
            const dataAnt = await resAnt.json()
            const posAnt: Record<string, number> = {}
            for (const r of (dataAnt.ranking || [])) posAnt[r.nome] = r.posicao
            const v: Record<string, number> = {}
            for (const r of data.ranking) {
              if (posAnt[r.nome] !== undefined) v[r.nome] = posAnt[r.nome] - r.posicao
            }
            setVariacao(v)
          } catch { setVariacao({}) }
        } else setVariacao({})
      } else setVariacao({})

      // após a 1ª carga bem-sucedida, desliga as animações de entrada (não re-piscam nos refreshes)
      if (primeiraCarga.current) {
        primeiraCarga.current = false
        setTimeout(() => setJaAnimou(true), 900)
      }
    }
    setLoading(false)
  }

  async function toggleTelao() {
    if (!telao) {
      try { await document.documentElement.requestFullscreen() } catch {}
      setTelao(true)
    } else {
      try { if (document.fullscreenElement) await document.exitFullscreen() } catch {}
      setTelao(false)
    }
  }

  const abas = [
    { k: 'vendedor', l: 'Vendedores', icon: User, roles: ['master', 'representante', 'adm', 'supervisor', 'vendedor'] },
    { k: 'equipe', l: 'Equipes', icon: Users, roles: ['master', 'representante', 'adm'] },
    { k: 'representante', l: 'Representações', icon: Building2, roles: ['master'] },
  // no Ranking Geral todos veem todas as abas (é a disputa entre empresas)
  ].filter(a => escopo === 'geral' || a.roles.includes(role) || role === '')

  const cores = { ouro: '#d4af37', prata: '#C0C0C0', bronze: '#CD7F32' }
  const medalha = ['\u{1F947}', '\u{1F948}', '\u{1F949}']
  const top3 = ranking.slice(0, 3)
  const resto = ranking.slice(3)
  const maxValor = ranking[0]?.valor || 1

  // linha secundária "equipe · empresa" (empresa em dourado 70% p/ leitura rápida da bandeira)
  function SubLinha({ item, center }: { item: RankItem; center?: boolean }) {
    if (!item.equipe_nome && !item.empresa_nome) return null
    return (
      <p className={`text-[11px] leading-tight truncate ${center ? 'text-center' : ''}`} style={{ color: 'var(--muted-color)' }}>
        {item.equipe_nome && <span>{item.equipe_nome}</span>}
        {item.equipe_nome && item.empresa_nome && <span> · </span>}
        {item.empresa_nome && <span style={{ color: 'rgba(212,175,55,0.7)', fontWeight: 600 }}>{item.empresa_nome}</span>}
      </p>
    )
  }

  function CardPodio({ item, rank }: { item?: RankItem; rank: 0 | 1 | 2 }) {
    if (!item) return <div className="flex-1" />
    const cor = rank === 0 ? cores.ouro : rank === 1 ? cores.prata : cores.bronze
    const primeiro = rank === 0
    const fotoSize = primeiro ? 88 : 72
    const delay = `${rank * 0.12}s`
    // modo representações: mostra o logo da empresa no lugar da foto (independe do escopo)
    const usaLogo = modo === 'representante' && !!item.logo
    return (
      <div className={`flex-1 flex flex-col items-center rounded-2xl px-4 text-center ${animCls}`} style={{
        animationDelay: delay,
        paddingTop: primeiro ? 20 : 28, paddingBottom: primeiro ? 28 : 20,
        marginTop: primeiro ? 0 : 20,
        background: `linear-gradient(180deg, ${cor}14 0%, rgba(0,0,0,0.12) 60%)`,
        border: `1px solid ${cor}${primeiro ? '66' : '40'}`,
        boxShadow: primeiro ? `0 12px 40px ${cor}22` : 'none',
      }}>
        <div className="relative">
          <div className={primeiro ? 'rounded-full p-1 shimmer-gold' : ''}>
            {usaLogo
              ? <div className="rounded-full shrink-0 flex items-center justify-center bg-white/95" style={{ width: fotoSize, height: fotoSize, border: primeiro ? undefined : `3px solid ${cor}`, boxShadow: primeiro ? undefined : `0 0 16px ${cor}55` }}><img src={item.logo || "/placeholder.svg"} alt={item.empresa_nome || item.nome} className="object-contain" style={{ width: fotoSize * 0.7, height: fotoSize * 0.7 }} /></div>
              : <Avatar nome={item.nome} foto={item.foto} size={fotoSize} borderColor={primeiro ? undefined : cor} />}
          </div>
          <span className="absolute -bottom-1 -right-1 text-2xl" aria-hidden>{medalha[rank]}</span>
        </div>
        <div className="mt-3 flex items-center justify-center gap-1.5 flex-wrap">
          {item.rei_semana && <Coroa datas={reiSemana?.datas} />}
          <p className="font-semibold leading-tight text-pretty" style={{ color: 'var(--text)', fontSize: primeiro ? 16 : 14 }}>{item.nome}</p>
          <Variacao delta={variacao[item.nome] ?? null} />
        </div>
        {modo === 'vendedor' && (item.streak_semanas || 0) >= 3 && <div className="mt-1"><StreakBadge n={item.streak_semanas || 0} /></div>}
        {modo === 'vendedor' && <div className="mt-0.5 max-w-full"><SubLinha item={item} center /></div>}
        <p className="text-[11px] mt-0.5 mb-2" style={{ color: 'var(--muted-color)' }}>{fmtMoeda(item.maior_venda)} maior venda</p>
        <p className="font-bold font-mono" style={{ color: cor, fontSize: primeiro ? 24 : 19 }}>{fmtMoeda(item.valor)}</p>
        <p className="text-[11px] mt-1" style={{ color: 'var(--muted-color)' }}>{item.qtd} cota{item.qtd !== 1 ? 's' : ''} · ticket {fmtMoeda(item.ticket_medio)}</p>
      </div>
    )
  }

  const conteudo = (
    <>
      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 size={20} className="animate-spin" style={{ color: 'var(--accent)' }} /></div>
      ) : ranking.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 gap-2"><Trophy size={32} style={{ color: 'var(--muted-color)' }} /><p className="text-sm" style={{ color: 'var(--muted-color)' }}>Nenhuma venda no período</p></div>
      ) : (
        <>
          <Ticker frases={frasesTicker} />
          {escopo === 'geral' && ranking.length >= 2 && (
            <div className={`rounded-xl px-4 py-2.5 mb-5 flex items-center gap-2 ${animCls}`} style={{ background: 'linear-gradient(90deg, rgba(212,175,55,0.12), rgba(0,0,0,0.12))', border: '1px solid rgba(212,175,55,0.25)' }}>
              <Flame size={16} style={{ color: 'var(--accent)' }} className="shrink-0" />
              <p className="text-xs sm:text-sm" style={{ color: 'var(--text2)' }}>
                <span className="shimmer-gold font-bold" style={{ WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>{ranking[0].nome}</span>
                {' '}lidera com <b style={{ color: 'var(--accent)' }}>{fmtMoeda(ranking[0].valor)}</b>
                {' — '}{ranking[1].nome} está a <b style={{ color: '#ef4444' }}>{fmtMoeda(ranking[0].valor - ranking[1].valor)}</b>!
              </p>
            </div>
          )}
          <div className="flex items-start justify-center gap-3 mb-6">
            <CardPodio item={top3[1]} rank={1} />
            <CardPodio item={top3[0]} rank={0} />
            <CardPodio item={top3[2]} rank={2} />
          </div>

          {/* Cards de destaque: Equipe/Vendedor ACOMPANHAM o período (Mês/Semana/Ano); Recordista é histórico fixo */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
            <CardDestaque
              cor="#d4af37" icon={Shield}
              label={`🛡️ Melhor Equipe ${fixos?.periodo_label || 'do Mês'}`}
              nome={fixos?.melhor_equipe?.nome || '—'}
              valor={fixos?.melhor_equipe ? fmtMoeda(fixos.melhor_equipe.valor) : '—'}
              sub={fixos?.melhor_equipe?.empresa || null}
              animCls={animCls}
            />
            <CardDestaque
              cor="#22c55e"
              avatarNome={fixos?.melhor_vendedor?.nome || '—'}
              foto={fixos?.melhor_vendedor?.foto}
              label={`🥇 Melhor Vendedor ${fixos?.periodo_label || 'do Mês'}`}
              nome={fixos?.melhor_vendedor?.nome || '—'}
              valor={fixos?.melhor_vendedor ? fmtMoeda(fixos.melhor_vendedor.valor) : '—'}
              sub={fixos?.melhor_vendedor
                ? ([fixos.melhor_vendedor.equipe, fixos.melhor_vendedor.empresa].filter(Boolean).join(' · ') || null)
                : 'sem vendas no período'}
              animCls={animCls}
            />
            <CardDestaque
              cor="#a855f7"
              avatarNome={fixos?.recordista?.vendedor || '—'}
              foto={fixos?.recordista?.foto}
              label="🏅 Recordista"
              nome={fixos?.recordista?.vendedor || '—'}
              valor={fixos?.recordista ? fmtMoeda(fixos.recordista.valor) : '—'}
              sub={fixos?.recordista
                ? [fixos.recordista.producao, fixos.recordista.empresa].filter(Boolean).join(' · ')
                : 'sem histórico'}
              animCls={animCls}
            />
          </div>

          {resto.length > 0 && (
            <div className="rounded-xl overflow-hidden" style={{ background: 'rgba(0,0,0,0.12)', border: '1px solid var(--border)' }}>
              {resto.map((r) => {
                const pct = Math.max(4, Math.round((r.valor / maxValor) * 100))
                // modo representações: cada empresa ganha uma cor distinta na barra (independe do escopo)
                const coresEmp = modo === 'representante'
                const barra = coresEmp
                  ? `linear-gradient(90deg, ${corDaEmpresa(r.empresa_id)}88, ${corDaEmpresa(r.empresa_id)})`
                  : 'linear-gradient(90deg, rgba(212,175,55,0.5), var(--accent))'
                const usaLogo = modo === 'representante' && !!r.logo
                return (
                  <div key={r.vendedor_id || r.empresa_id || r.nome} className="flex items-center gap-3 px-4 py-2.5 transition-all" style={{ borderBottom: '1px solid var(--border)' }}>
                    <span className="text-xs font-bold font-mono w-7 shrink-0" style={{ color: 'var(--muted-color)' }}>{r.posicao}º</span>
                    {usaLogo
                      ? <div className="rounded-full shrink-0 flex items-center justify-center bg-white/95" style={{ width: 32, height: 32 }}><img src={r.logo || "/placeholder.svg"} alt={r.empresa_nome || r.nome} className="object-contain" style={{ width: 22, height: 22 }} /></div>
                      : <Avatar nome={r.nome} foto={r.foto} size={32} />}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        {r.rei_semana && <Coroa datas={reiSemana?.datas} />}
                        <p className="text-sm font-medium truncate" style={{ color: 'var(--text2)' }}>{r.nome}</p>
                        <Variacao delta={variacao[r.nome] ?? null} />
                        {modo === 'vendedor' && <StreakBadge n={r.streak_semanas || 0} />}
                      </div>
                      {modo === 'vendedor' && <SubLinha item={r} />}
                      <div className="mt-1 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
                        <div className="h-full rounded-full anim-bar-grow" style={{ width: `${pct}%`, background: barra }} />
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold font-mono" style={{ color: 'var(--text)' }}>{fmtMoeda(r.valor)}</p>
                      <p className="text-[10px]" style={{ color: 'var(--muted-color)' }}>{r.qtd} cota{r.qtd !== 1 ? 's' : ''} · {fmtMoeda(r.ticket_medio)}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

        </>
      )}
    </>
  )

  const microLabel = "text-[10px] font-semibold uppercase tracking-wider shrink-0 w-14"
  // pill ativo: fundo dourado 18%, borda dourada e leve glow
  const pill = (ativo: boolean) => ({
    background: ativo ? 'rgba(212,175,55,0.18)' : 'rgba(255,255,255,0.03)',
    border: `1px solid ${ativo ? 'rgba(212,175,55,0.6)' : 'var(--border)'}`,
    color: ativo ? 'var(--accent)' : 'var(--muted-color)',
    boxShadow: ativo ? '0 0 12px rgba(212,175,55,0.25)' : 'none',
  })
  const pillCls = "flex items-center gap-1.5 rounded-full px-5 py-2.5 text-[13px] font-semibold transition-all"

  const filtros = (
    <div className="flex flex-col gap-2.5 mb-6">
      {/* LINHA 1 — PERÍODO (não-toggle) + ações à direita */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className={microLabel} style={{ color: 'var(--muted-color)' }}>Período</span>
        {producoes.length > 0 && (
          <select value={producaoId} onMouseDown={() => setPeriodo('')} onChange={(e) => { setPeriodo(''); setProducaoId(e.target.value) }} className="rounded-full px-5 py-2.5 text-[13px] font-semibold outline-none cursor-pointer" style={pill(!periodo)}>
            {producoes.map(p => <option key={p.id} value={p.id} style={{ background: '#131313', color: '#fff' }}>{`📦 ${p.nome}`}</option>)}
          </select>
        )}
        <button onClick={() => setPeriodo('semana')} className={pillCls} style={pill(periodo === 'semana')}><Zap size={14} />Semana</button>
        <button onClick={() => setPeriodo('ano')} className={pillCls} style={pill(periodo === 'ano')}><CalendarRange size={14} />Melhores do Ano</button>
        <div className="flex items-center gap-2 ml-auto">
          <button onClick={toggleTelao} className={pillCls} style={pill(telao)}><Tv size={14} />Apresentar</button>
        </div>
      </div>

      {/* LINHA 2 — VISÃO (abas) + escopo */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className={microLabel} style={{ color: 'var(--muted-color)' }}>Visão</span>
        {abas.length > 1 && (
          <div className="flex items-center gap-1 rounded-full p-1" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)' }}>
            {abas.map(a => {
              const Icon = a.icon; const ativo = modo === a.k
              return <button key={a.k} onClick={() => setModo(a.k as any)} className="flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-semibold transition-all" style={ativo ? { background: 'rgba(212,175,55,0.18)', color: 'var(--accent)', boxShadow: '0 0 12px rgba(212,175,55,0.25)' } : { background: 'transparent', color: 'var(--muted-color)' }}><Icon size={14} />{a.l}</button>
            })}
          </div>
        )}
        <span className="mx-1 text-xs" style={{ color: 'var(--border)' }}>·</span>
        <button onClick={() => setEscopo('operacao')} className={pillCls} style={pill(escopo === 'operacao')}><Home size={14} />Minha operação</button>
        <button onClick={() => setEscopo('geral')} className={pillCls} style={pill(escopo === 'geral')}><Globe size={14} />Geral</button>
        {empresas.length > 0 && escopo !== 'geral' && (
          <select value={fEmpresa} onChange={(e) => setFEmpresa(e.target.value)} className="rounded-full px-4 py-2 text-[13px] outline-none cursor-pointer" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', color: 'var(--text2)' }}>
            <option value="" style={{ background: '#131313' }}>Todas as empresas</option>
            {empresas.map(e => <option key={e.id} value={e.id} style={{ background: '#131313' }}>{e.nome}</option>)}
          </select>
        )}
      </div>
    </div>
  )

  // Modo telão: ocupa a tela toda (fullscreen), sem sidebar/header, com zoom maior
  if (telao) {
    return (
      <div className="min-h-screen font-sans" style={{ background: '#080808', zoom: 1.25 as any }}>
        <div className="mx-auto max-w-[1100px] px-8 py-8">
          <div className="flex items-center gap-3 mb-5">
            <Trophy size={24} style={{ color: 'var(--accent)' }} />
            <h2 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>Ranking de Produção</h2>
            {escopo === 'geral' && <span className="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold" style={{ background: 'rgba(212,175,55,0.15)', color: 'var(--accent)', border: '1px solid rgba(212,175,55,0.3)' }}><Globe size={13} />Geral</span>}
            <button onClick={toggleTelao} className="ml-auto flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-medium" style={{ background: 'var(--accent)', color: '#0a0a0a' }}><Tv size={13} />Sair</button>
          </div>
          {conteudo}
        </div>
      </div>
    )
  }

  return (
    <div className="relative min-h-screen font-sans">
      <Sidebar />
      <div className="relative lg:ml-60" style={{ zIndex: 1 }}>
        <Header title="Ranking" />
        <main className="mx-auto max-w-[1100px] px-6 py-8 lg:px-8">
          <div className="flex items-center gap-3 mb-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: 'rgba(212,175,55,0.15)', border: '1px solid rgba(212,175,55,0.25)' }}><Trophy size={18} style={{ color: 'var(--accent)' }} /></div>
            <div>
              <h2 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>Ranking de Produção</h2>
              <p className="text-xs" style={{ color: 'var(--muted-color)' }}>Por valor vendido no período</p>
            </div>
          </div>
          {filtros}
          {conteudo}
        </main>
      </div>
    </div>
  )
}
