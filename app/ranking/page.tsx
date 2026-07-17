'use client'

import { useState, useEffect, useRef } from 'react'
import Sidebar from '@/components/Sidebar'
import Header from '@/components/Header'
import { Trophy, Loader2, Users, Building2, User, Shield, Gem, Zap, CalendarRange, Tv, ChevronUp, ChevronDown, Minus, Home, Globe, Flame } from 'lucide-react'
import { dispararConfete } from '@/lib/confetti'

interface RankItem { posicao: number; nome: string; foto?: string; valor: number; qtd: number; ticket_medio: number; maior_venda: number; equipe_nome?: string | null; empresa_nome?: string | null; empresa_id?: string | null; logo?: string | null }

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
  const liderAnterior = useRef<string | null>(null)

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

  // auto-refresh de 60s no modo telão OU no Ranking Geral (tempo real)
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

  async function loadData() {
    setLoading(true)
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
    // no Ranking Geral + modo representações, mostra o logo da empresa no lugar da foto
    const usaLogo = escopo === 'geral' && modo === 'representante' && !!item.logo
    return (
      <div className="flex-1 flex flex-col items-center rounded-2xl px-4 text-center anim-fade-up" style={{
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
        <div className="mt-3 flex items-center gap-1.5">
          <p className="font-semibold leading-tight text-pretty" style={{ color: 'var(--text)', fontSize: primeiro ? 16 : 14 }}>{item.nome}</p>
          <Variacao delta={variacao[item.nome] ?? null} />
        </div>
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
          {escopo === 'geral' && ranking.length >= 2 && (
            <div className="rounded-xl px-4 py-2.5 mb-5 flex items-center gap-2 anim-fade-up" style={{ background: 'linear-gradient(90deg, rgba(212,175,55,0.12), rgba(0,0,0,0.12))', border: '1px solid rgba(212,175,55,0.25)' }}>
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

          {destaques && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
              <div className="rounded-xl p-4 flex items-center gap-3 anim-fade-up" style={{ animationDelay: '0.36s', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)' }}>
                <Shield size={20} style={{ color: '#22c55e' }} />
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--muted-color)' }}>Equipe do período</p>
                  <p className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{destaques.top_equipe?.nome || '—'}</p>
                  <p className="text-xs font-mono" style={{ color: '#22c55e' }}>{destaques.top_equipe ? fmtMoeda(destaques.top_equipe.valor) : '—'}</p>
                </div>
              </div>
              <div className="rounded-xl p-4 flex items-center gap-3 anim-fade-up" style={{ animationDelay: '0.44s', background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.25)' }}>
                <Building2 size={20} style={{ color: '#3b82f6' }} />
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--muted-color)' }}>Representação líder</p>
                  <p className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{destaques.top_empresa?.nome || '—'}</p>
                  <p className="text-xs font-mono" style={{ color: '#3b82f6' }}>{destaques.top_empresa ? fmtMoeda(destaques.top_empresa.valor) : '—'}</p>
                </div>
              </div>
              <div className="rounded-xl p-4 flex items-center gap-3 anim-fade-up" style={{ animationDelay: '0.52s', background: 'rgba(212,175,55,0.08)', border: '1px solid rgba(212,175,55,0.25)' }}>
                <Gem size={20} style={{ color: 'var(--accent)' }} />
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--muted-color)' }}>Maior ticket médio</p>
                  <p className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{destaques.maior_ticket?.nome || '—'}</p>
                  <p className="text-xs font-mono" style={{ color: 'var(--accent)' }}>{destaques.maior_ticket ? `${fmtMoeda(destaques.maior_ticket.ticket)} · ${destaques.maior_ticket.qtd} vd` : 'mín. 2 vendas'}</p>
                </div>
              </div>
            </div>
          )}

          {resto.length > 0 && (
            <div className="rounded-xl overflow-hidden" style={{ background: 'rgba(0,0,0,0.12)', border: '1px solid var(--border)' }}>
              {resto.map((r) => {
                const pct = Math.max(4, Math.round((r.valor / maxValor) * 100))
                // no Ranking Geral + representações, cada empresa ganha uma cor distinta na barra
                const coresEmp = escopo === 'geral' && modo === 'representante'
                const barra = coresEmp
                  ? `linear-gradient(90deg, ${corDaEmpresa(r.empresa_id)}88, ${corDaEmpresa(r.empresa_id)})`
                  : 'linear-gradient(90deg, rgba(212,175,55,0.5), var(--accent))'
                const usaLogo = escopo === 'geral' && modo === 'representante' && !!r.logo
                return (
                  <div key={r.posicao} className="flex items-center gap-3 px-4 py-2.5" style={{ borderBottom: '1px solid var(--border)' }}>
                    <span className="text-xs font-bold font-mono w-7 shrink-0" style={{ color: 'var(--muted-color)' }}>{r.posicao}º</span>
                    {usaLogo
                      ? <div className="rounded-full shrink-0 flex items-center justify-center bg-white/95" style={{ width: 32, height: 32 }}><img src={r.logo || "/placeholder.svg"} alt={r.empresa_nome || r.nome} className="object-contain" style={{ width: 22, height: 22 }} /></div>
                      : <Avatar nome={r.nome} foto={r.foto} size={32} />}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-medium truncate" style={{ color: 'var(--text2)' }}>{r.nome}</p>
                        <Variacao delta={variacao[r.nome] ?? null} />
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

  const toggleEscopo = (
    <div className="flex items-center gap-2 mb-4">
      <button onClick={() => setEscopo('operacao')} className="flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition-all" style={{ background: escopo === 'operacao' ? 'var(--accent)' : 'rgba(255,255,255,0.03)', border: `1px solid ${escopo === 'operacao' ? 'var(--accent)' : 'var(--border)'}`, color: escopo === 'operacao' ? '#0a0a0a' : 'var(--muted-color)' }}><Home size={15} />Minha operação</button>
      <button onClick={() => setEscopo('geral')} className="flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition-all" style={{ background: escopo === 'geral' ? 'var(--accent)' : 'rgba(255,255,255,0.03)', border: `1px solid ${escopo === 'geral' ? 'var(--accent)' : 'var(--border)'}`, color: escopo === 'geral' ? '#0a0a0a' : 'var(--muted-color)' }}><Globe size={15} />Ranking Geral</button>
    </div>
  )

  const filtros = (
    <div className="flex items-center gap-2 flex-wrap mb-6">
      {producoes.length > 0 && (
        <select value={periodo ? '' : producaoId} onChange={(e) => { setPeriodo(''); setProducaoId(e.target.value) }} className="rounded-full px-4 py-2 text-xs font-medium outline-none cursor-pointer" style={{ background: !periodo ? 'rgba(212,175,55,0.12)' : 'rgba(255,255,255,0.03)', border: `1px solid ${!periodo ? 'rgba(212,175,55,0.3)' : 'var(--border)'}`, color: !periodo ? 'var(--accent)' : 'var(--muted-color)' }}>
          {producoes.map(p => <option key={p.id} value={p.id} style={{ background: '#131313', color: '#fff' }}>{p.nome}</option>)}
        </select>
      )}
      <button onClick={() => setPeriodo(periodo === 'semana' ? '' : 'semana')} className="flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-medium transition-all" style={{ background: periodo === 'semana' ? 'var(--accent)' : 'rgba(255,255,255,0.03)', border: `1px solid ${periodo === 'semana' ? 'var(--accent)' : 'var(--border)'}`, color: periodo === 'semana' ? '#0a0a0a' : 'var(--muted-color)' }}><Zap size={13} />Melhores da Semana</button>
      <button onClick={() => setPeriodo(periodo === 'ano' ? '' : 'ano')} className="flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-medium transition-all" style={{ background: periodo === 'ano' ? 'var(--accent)' : 'rgba(255,255,255,0.03)', border: `1px solid ${periodo === 'ano' ? 'var(--accent)' : 'var(--border)'}`, color: periodo === 'ano' ? '#0a0a0a' : 'var(--muted-color)' }}><CalendarRange size={13} />Acumulado do Ano</button>
      {abas.length > 1 && (
        <div className="flex items-center gap-1 rounded-full p-1" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)' }}>
          {abas.map(a => {
            const Icon = a.icon; const ativo = modo === a.k
            return <button key={a.k} onClick={() => setModo(a.k as any)} className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all" style={{ background: ativo ? 'var(--accent)' : 'transparent', color: ativo ? '#0a0a0a' : 'var(--muted-color)' }}><Icon size={13} />{a.l}</button>
          })}
        </div>
      )}
      {empresas.length > 0 && escopo !== 'geral' && (
        <select value={fEmpresa} onChange={(e) => setFEmpresa(e.target.value)} className="rounded-full px-4 py-2 text-xs outline-none cursor-pointer" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', color: 'var(--text2)' }}>
          <option value="" style={{ background: '#131313' }}>Todas as empresas</option>
          {empresas.map(e => <option key={e.id} value={e.id} style={{ background: '#131313' }}>{e.nome}</option>)}
        </select>
      )}
      <button onClick={toggleTelao} className="flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-medium transition-all ml-auto" style={{ background: telao ? 'var(--accent)' : 'rgba(255,255,255,0.03)', border: `1px solid ${telao ? 'var(--accent)' : 'var(--border)'}`, color: telao ? '#0a0a0a' : 'var(--muted-color)' }}><Tv size={13} />Apresentar</button>
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
          {toggleEscopo}
          {filtros}
          {conteudo}
        </main>
      </div>
    </div>
  )
}
