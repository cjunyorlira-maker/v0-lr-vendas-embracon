'use client'

import { useState, useEffect, useRef } from 'react'
import Sidebar from '@/components/Sidebar'
import Header from '@/components/Header'
import { Loader2, Laptop, Plane, Trophy, Tv, Clock } from 'lucide-react'
import { dispararConfete } from '@/lib/confetti'

const fmt = (v: number) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

const CORES = ['#d4af37', '#3b82f6', '#22c55e', '#a855f7', '#ec4899', '#f97316', '#06b6d4']
function corDoNome(n: string) { let h = 0; for (let i = 0; i < n.length; i++) h = n.charCodeAt(i) + ((h << 5) - h); return CORES[Math.abs(h) % CORES.length] }
function iniciais(n: string) { const p = n.trim().split(/\s+/); return ((p[0]?.[0] || '') + (p[1]?.[0] || '')).toUpperCase() || '?' }

function Avatar({ nome, foto, size, shimmer, borderColor }: { nome: string; foto?: string; size: number; shimmer?: boolean; borderColor?: string }) {
  const inner = foto
    ? <img src={foto || "/placeholder.svg"} alt={nome} width={size} height={size} className="rounded-full shrink-0" style={{ width: size, height: size, objectFit: 'cover', border: borderColor ? `3px solid ${borderColor}` : undefined }} />
    : <div className="rounded-full shrink-0 flex items-center justify-center font-bold" style={{ width: size, height: size, background: `${corDoNome(nome)}22`, color: corDoNome(nome), fontSize: size * 0.36, border: borderColor ? `3px solid ${borderColor}` : undefined }}>{iniciais(nome)}</div>
  if (shimmer) return <div className="rounded-full p-1 shimmer-gold shrink-0">{inner}</div>
  return inner
}

interface Campanha {
  periodo: { inicio: string; fim: string }
  countdown: { dias: number; fim: string }
  empresas: { id: string; nome: string; top_viagem_n: number }[]
  macbook: { empresa_id: string; empresa_nome: string; lider: any; ranking: any[]; dist_mac: number }[]
  viagem: { equipes: any[]; comitivas: any[] }
  provocacoes: string[]
  meu_role: string
}

export default function CampanhaPage() {
  const [data, setData] = useState<Campanha | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState(false)
  const [telao, setTelao] = useState(false)
  const [provIdx, setProvIdx] = useState(0)
  const [provFade, setProvFade] = useState(true)
  const [agora, setAgora] = useState(() => Date.now())
  const jaConfetou = useRef(false)

  useEffect(() => { load() }, [])

  // relógio para o countdown (DD dias · HH horas)
  useEffect(() => { const id = setInterval(() => setAgora(Date.now()), 60000); return () => clearInterval(id) }, [])

  // rotação das provocações a cada 6s com fade
  useEffect(() => {
    if (!data?.provocacoes?.length) return
    const id = setInterval(() => {
      setProvFade(false)
      setTimeout(() => { setProvIdx(i => (i + 1) % data.provocacoes.length); setProvFade(true) }, 400)
    }, 6000)
    return () => clearInterval(id)
  }, [data?.provocacoes])

  // auto-refresh de 60s no telão
  useEffect(() => {
    if (!telao) return
    const id = setInterval(() => load(), 60000)
    return () => clearInterval(id)
  }, [telao])

  useEffect(() => {
    const onFs = () => { if (!document.fullscreenElement) setTelao(false) }
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [])

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/campanha')
      if (!res.ok) { setErro(true); setLoading(false); return }
      const d = await res.json()
      setData(d)
      if (!jaConfetou.current) { jaConfetou.current = true; setTimeout(() => dispararConfete(2600), 400) }
    } catch { setErro(true) }
    setLoading(false)
  }

  async function toggleTelao() {
    if (!telao) { try { await document.documentElement.requestFullscreen() } catch {}; setTelao(true) }
    else { try { if (document.fullscreenElement) await document.exitFullscreen() } catch {}; setTelao(false) }
  }

  // countdown DD/HH
  const fimMs = data ? new Date(data.countdown.fim).getTime() : 0
  const restanteMs = Math.max(0, fimMs - agora)
  const dias = Math.floor(restanteMs / 86400000)
  const horas = Math.floor((restanteMs % 86400000) / 3600000)

  const conteudo = data && (
    <>
      {/* HERO */}
      <div className="rounded-3xl p-6 sm:p-8 mb-8 text-center anim-fade-up" style={{ background: 'radial-gradient(circle at 50% 0%, rgba(212,175,55,0.15), rgba(0,0,0,0.2) 70%)', border: '1px solid rgba(212,175,55,0.3)' }}>
        <div className="flex items-center justify-center gap-3 mb-2 text-4xl sm:text-5xl">
          <Laptop size={44} style={{ color: 'var(--accent)' }} />
          <Plane size={44} style={{ color: 'var(--accent)' }} />
        </div>
        <h1 className="text-2xl sm:text-4xl font-bold tracking-tight text-balance" style={{ color: 'var(--text)' }}>CAMPANHA MAC & VIAGEM</h1>
        <p className="text-xs sm:text-sm mt-1 mb-5" style={{ color: 'var(--muted-color)' }}>22/05 → 31/07 · Marques · LR · GLR</p>
        <div className="flex items-center justify-center gap-3">
          <div className="anim-pulse-soft rounded-2xl px-5 py-3 min-w-[92px]" style={{ background: 'rgba(212,175,55,0.12)', border: '1px solid rgba(212,175,55,0.35)' }}>
            <p className="text-3xl sm:text-4xl font-bold font-mono" style={{ color: 'var(--accent)' }}>{String(dias).padStart(2, '0')}</p>
            <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--muted-color)' }}>dias</p>
          </div>
          <div className="anim-pulse-soft rounded-2xl px-5 py-3 min-w-[92px]" style={{ background: 'rgba(212,175,55,0.12)', border: '1px solid rgba(212,175,55,0.35)' }}>
            <p className="text-3xl sm:text-4xl font-bold font-mono" style={{ color: 'var(--accent)' }}>{String(horas).padStart(2, '0')}</p>
            <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--muted-color)' }}>horas</p>
          </div>
        </div>
        {/* PROVOCAÇÕES */}
        {data.provocacoes.length > 0 && (
          <div className="mt-6 flex items-center justify-center gap-2 min-h-[24px]">
            <Clock size={14} style={{ color: 'var(--accent)' }} />
            <p className="text-sm font-medium transition-opacity duration-400 text-pretty" style={{ color: 'var(--text2)', opacity: provFade ? 1 : 0 }}>{data.provocacoes[provIdx]}</p>
          </div>
        )}
      </div>

      {/* SEÇÃO MACBOOK */}
      <div className="flex items-center gap-2 mb-4">
        <Laptop size={20} style={{ color: 'var(--accent)' }} />
        <h2 className="text-lg font-bold" style={{ color: 'var(--text)' }}>Disputa do MacBook</h2>
        <span className="text-xs" style={{ color: 'var(--muted-color)' }}>· top vendedor de cada empresa</span>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
        {data.macbook.map((mb, i) => (
          <div key={mb.empresa_id} className="rounded-2xl p-4 anim-fade-up" style={{ animationDelay: `${i * 0.1}s`, background: 'rgba(0,0,0,0.18)', border: '1px solid var(--border)' }}>
            <p className="text-xs font-semibold uppercase tracking-wide mb-3 text-center" style={{ color: 'var(--muted-color)' }}>{mb.empresa_nome}</p>
            {mb.lider ? (
              <>
                <div className="flex flex-col items-center text-center rounded-xl p-4 mb-3" style={{ background: 'linear-gradient(180deg, rgba(212,175,55,0.14), rgba(0,0,0,0.1))', border: '1px solid rgba(212,175,55,0.4)' }}>
                  <Avatar nome={mb.lider.nome} foto={mb.lider.foto} size={80} shimmer />
                  <p className="text-[10px] font-bold uppercase tracking-wider mt-2" style={{ color: 'var(--accent)' }}>Ganhando o Mac 💻</p>
                  <p className="text-sm font-semibold mt-0.5" style={{ color: 'var(--text)' }}>{mb.lider.nome}</p>
                  <p className="text-lg font-bold font-mono" style={{ color: 'var(--accent)' }}>{fmt(mb.lider.valor)}</p>
                </div>
                <div className="flex flex-col gap-1.5">
                  {mb.ranking.slice(1).map((r: any) => (
                    <div key={r.posicao} className="flex items-center gap-2.5 rounded-lg px-2.5 py-2" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)' }}>
                      <span className="text-xs font-bold font-mono w-5 shrink-0" style={{ color: 'var(--muted-color)' }}>{r.posicao}º</span>
                      <Avatar nome={r.nome} foto={r.foto} size={28} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate" style={{ color: 'var(--text2)' }}>{r.nome}</p>
                        <p className="text-[10px]" style={{ color: '#ef4444' }}>faltam {fmt(r.dist_lider)}</p>
                      </div>
                      <p className="text-xs font-mono shrink-0" style={{ color: 'var(--muted-color)' }}>{fmt(r.valor)}</p>
                    </div>
                  ))}
                  {mb.ranking.length <= 1 && <p className="text-xs text-center py-2" style={{ color: 'var(--muted-color)' }}>Sem perseguidores ainda</p>}
                </div>
              </>
            ) : (
              <p className="text-sm text-center py-6" style={{ color: 'var(--muted-color)' }}>Nenhuma venda ainda</p>
            )}
          </div>
        ))}
      </div>

      {/* SEÇÃO VIAGEM */}
      <div className="flex items-center gap-2 mb-4">
        <Plane size={20} style={{ color: 'var(--accent)' }} />
        <h2 className="text-lg font-bold" style={{ color: 'var(--text)' }}>Disputa da Viagem</h2>
        <span className="text-xs" style={{ color: 'var(--muted-color)' }}>· equipes das 3 empresas</span>
      </div>

      {/* pódio das equipes */}
      {data.viagem.equipes.length > 0 && (
        <div className="flex items-end justify-center gap-3 mb-6">
          {[data.viagem.equipes[1], data.viagem.equipes[0], data.viagem.equipes[2]].map((eq, visualIdx) => {
            if (!eq) return <div key={visualIdx} className="flex-1" />
            const rank = eq.posicao - 1
            const cor = rank === 0 ? '#d4af37' : rank === 1 ? '#C0C0C0' : '#CD7F32'
            const primeiro = rank === 0
            return (
              <div key={eq.id} className="flex-1 flex flex-col items-center rounded-2xl px-3 text-center anim-fade-up" style={{ animationDelay: `${visualIdx * 0.1}s`, paddingTop: primeiro ? 16 : 24, paddingBottom: primeiro ? 22 : 16, marginTop: primeiro ? 0 : 16, background: `linear-gradient(180deg, ${cor}14, rgba(0,0,0,0.12))`, border: `1px solid ${cor}${primeiro ? '66' : '40'}` }}>
                <span className="text-2xl mb-1">{['🥇', '🥈', '🥉'][rank]}</span>
                <p className="text-sm font-semibold text-pretty" style={{ color: 'var(--text)' }}>{eq.nome}</p>
                <p className="text-[10px]" style={{ color: 'var(--muted-color)' }}>{eq.empresa_nome}</p>
                <p className="font-bold font-mono mt-1" style={{ color: cor, fontSize: primeiro ? 20 : 16 }}>{fmt(eq.valor)}</p>
              </div>
            )
          })}
        </div>
      )}

      {/* QUEM EMBARCA HOJE */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        {data.viagem.comitivas.map((c: any, i: number) => (
          <div key={c.empresa_id} className="rounded-2xl p-4 anim-fade-up" style={{ animationDelay: `${i * 0.1}s`, background: 'rgba(0,0,0,0.18)', border: '1px solid rgba(34,197,94,0.25)' }}>
            <p className="text-[10px] font-bold uppercase tracking-wider mb-0.5" style={{ color: '#22c55e' }}>Quem embarca hoje ✈️</p>
            <p className="text-xs mb-3" style={{ color: 'var(--muted-color)' }}>{c.empresa_nome}{c.equipe_nome ? ` · ${c.equipe_nome}` : ''}</p>
            {c.membros.length > 0 ? (
              <div className="flex flex-wrap gap-3">
                {c.membros.map((m: any, idx: number) => (
                  <div key={idx} className="flex flex-col items-center text-center" style={{ width: 72 }}>
                    <Avatar nome={m.nome} foto={m.foto} size={48} borderColor={m.papel === 'supervisor' ? '#22c55e' : '#d4af37'} />
                    <p className="text-[11px] font-medium mt-1 leading-tight truncate w-full" style={{ color: 'var(--text2)' }}>{m.nome.split(' ')[0]}</p>
                    {m.papel === 'supervisor' ? (
                      <p className="text-[9px] leading-tight" style={{ color: '#22c55e' }}>supervisão{m.equipe_nome ? ` · equipe ${m.equipe_nome}` : ''}</p>
                    ) : (
                      <p className="text-[9px] leading-tight" style={{ color: 'var(--muted-color)' }}>
                        <span className="font-bold" style={{ color: '#d4af37' }}>{m.posicao}º</span> · {fmt(m.valor)}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : <p className="text-xs py-3" style={{ color: 'var(--muted-color)' }}>Nenhuma venda ainda</p>}
          </div>
        ))}
      </div>
    </>
  )

  if (telao) {
    return (
      <div className="min-h-screen font-sans" style={{ background: '#080808', zoom: 1.25 as any }}>
        <div className="mx-auto max-w-[1100px] px-8 py-8">
          <div className="flex items-center justify-end mb-2">
            <button onClick={toggleTelao} className="flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-medium" style={{ background: 'var(--accent)', color: '#0a0a0a' }}><Tv size={13} />Sair</button>
          </div>
          {loading ? <div className="flex items-center justify-center py-20"><Loader2 size={22} className="animate-spin" style={{ color: 'var(--accent)' }} /></div> : conteudo}
        </div>
      </div>
    )
  }

  return (
    <div className="relative min-h-screen font-sans">
      <Sidebar />
      <div className="relative lg:ml-60" style={{ zIndex: 1 }}>
        <Header title="Campanha" />
        <main className="mx-auto max-w-[1100px] px-6 py-8 lg:px-8">
          {loading ? (
            <div className="flex items-center justify-center py-20"><Loader2 size={22} className="animate-spin" style={{ color: 'var(--accent)' }} /></div>
          ) : erro ? (
            <div className="flex flex-col items-center justify-center py-20 gap-2">
              <Trophy size={32} style={{ color: 'var(--muted-color)' }} />
              <p className="text-sm" style={{ color: 'var(--muted-color)' }}>Campanha não disponível para o seu perfil.</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-end mb-4">
                <button onClick={toggleTelao} className="flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-medium transition-all" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', color: 'var(--muted-color)' }}><Tv size={13} />Apresentar</button>
              </div>
              {conteudo}
            </>
          )}
        </main>
      </div>
    </div>
  )
}
