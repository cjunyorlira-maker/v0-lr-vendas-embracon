'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Sidebar from '@/components/Sidebar'
import Header from '@/components/Header'
import AnimatedNumber from '@/components/dashboard/AnimatedNumber'
import CampeoesCard from '@/components/dashboard/CampeoesCard'
import NovoAvisoModal from '@/components/dashboard/NovoAvisoModal'
import {
  Target, Gem, CalendarClock, Megaphone, Plus, Pin, ArrowRight,
  Wallet, Trash2, Eye, EyeOff,
} from 'lucide-react'

interface Campeao { nome: string; foto?: string | null; equipe?: string | null; empresa?: string | null; logo?: string | null; valor: number }
interface Campeoes { vendedores: Campeao[]; equipes: Campeao[]; representacoes: Campeao[] }
interface CampeoesDuplo { geral: Campeoes | null; minha_empresa: Campeoes | null }
interface Aviso { id: string; titulo: string; mensagem: string; tipo: string; fixado: boolean; criado_em: string }

interface DashData {
  meu_role: string
  pode_publicar_avisos: boolean
  meta: { valor: number; vendido_master: number; dias_restantes: number; ritmo_necessario: number; pct: number; producao_nome: string | null; cotas_master: number; acumulado_ano_valor?: number; acumulado_ano_cotas?: number } | null
  minha_operacao: { empresa_nome: string; vendido: number; cotas: number; ticket: number; pct_da_master: number } | null
  minha_fatia_master: { empresa_nome: string; vendido: number; cotas: number; pct_da_producao: number } | null
  campeoes_mes: CampeoesDuplo
  melhores_semana: CampeoesDuplo
  minha_empresa_nome: string | null
  lances_alerta: { pendentes: number; pendentes_proxima_assembleia: number; data_assembleia_proxima: string | null; ofertados_aguardando: number }
  lances_minha_empresa: { pendentes: number; pendentes_proxima_assembleia: number; data_assembleia_proxima: string | null; ofertados_aguardando: number } | null
  vencimentos: { data: string; cliente: string; grupo: string; cota: string; valor: number }[]
  proxima_sexta?: { valor: number; data: string; fatia_empresa?: number; empresa_nome?: string }
  avisos: Aviso[]
}

const fmtMoeda = (v: number) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const fmtMoedaFull = (v: number) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const fmtData = (d: string) => d ? new Date(d + (d.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '—'
const fmtDataLonga = (iso: string) => {
  if (!iso) return '—'
  const d = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso)
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function Skeleton({ h = 160 }: { h?: number }) {
  return <div className="skeleton w-full" style={{ height: h }} />
}

export default function DashboardPage() {
  const [data, setData] = useState<DashData | null>(null)
  const [loading, setLoading] = useState(true)
  const [mostrarSexta, setMostrarSexta] = useState(false) // valor da Próxima Sexta começa OCULTO (reuniões/projeção)
  const [modalAviso, setModalAviso] = useState(false)
  // toggle Master / Minha representação — compartilhado pelos dois cards Top 3, persiste na sessão
  const [modoCampeoes, setModoCampeoes] = useState<'geral' | 'minha_empresa'>('geral')
  useEffect(() => {
    const salvo = sessionStorage.getItem('dash_modo_campeoes')
    if (salvo === 'geral' || salvo === 'minha_empresa') setModoCampeoes(salvo)
  }, [])
  const trocarModoCampeoes = (m: 'geral' | 'minha_empresa') => {
    setModoCampeoes(m)
    sessionStorage.setItem('dash_modo_campeoes', m)
  }

  const carregar = () => {
    fetch('/api/dashboard').then((r) => r.json()).then((d) => {
      if (d?.modo_restrito === true) { window.location.replace('/clientes'); return }
      if (!d.error) setData(d); setLoading(false)
    }).catch(() => setLoading(false))
  }
  useEffect(() => { carregar() }, [])

  const isMaster = data?.meu_role === 'master'
  const lancesUrgente = (data?.lances_alerta?.data_assembleia_proxima && data.lances_alerta.pendentes_proxima_assembleia > 0)

  async function desativarAviso(id: string) {
    await fetch('/api/avisos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acao: 'desativar', id }) })
    carregar()
  }

  return (
    <div className="relative min-h-screen font-sans">
      <Sidebar />
      <div className="relative lg:ml-60" style={{ zIndex: 1 }}>
        <Header title="Dashboard" />
        <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">

          {loading ? (
            <div className="flex flex-col gap-5">
              <Skeleton h={150} />
              <div className="grid gap-5 lg:grid-cols-2"><Skeleton /><Skeleton /></div>
              <div className="grid gap-5 lg:grid-cols-2"><Skeleton /><Skeleton /></div>
            </div>
          ) : !data ? (
            <p className="py-20 text-center text-sm" style={{ color: 'var(--muted-color)' }}>Não foi possível carregar o painel.</p>
          ) : (
            <div className="flex flex-col gap-5">

              {/* ═══ LINHA 1: TERMÔMETRO DA META ═══ */}
              {data.meta && (
              <section
                className="rounded-2xl p-6 anim-fade-up"
                style={{ background: 'linear-gradient(135deg, rgba(212,175,55,0.10) 0%, rgba(212,175,55,0.03) 100%)', border: '1px solid rgba(212,175,55,0.22)' }}
              >
                <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl" style={{ background: 'rgba(212,175,55,0.18)' }}>
                      <Target size={22} style={{ color: 'var(--accent)' }} />
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--accent)' }}>Meta da produção · Master LR</p>
                      <p className="text-sm" style={{ color: 'var(--muted-color)' }}>{data.meta.producao_nome || 'Produção corrente'}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>faltam {data.meta.dias_restantes} dias</p>
                    <p className="text-xs" style={{ color: 'var(--muted-color)' }}>ritmo p/ bater: <span className="font-mono font-semibold" style={{ color: 'var(--accent)' }}>{fmtMoeda(data.meta.ritmo_necessario)}/dia</span></p>
                  </div>
                </div>

                {/* barra de progresso grande */}
                <div className="relative h-6 w-full overflow-hidden rounded-full" style={{ background: 'rgba(0,0,0,0.35)', border: '1px solid var(--border)' }}>
                  {/* marcos 25/50/75 */}
                  {[25, 50, 75].map((m) => (
                    <div key={m} className="absolute top-0 h-full" style={{ left: `${m}%`, width: 1, background: 'rgba(255,255,255,0.12)' }} />
                  ))}
                  <div
                    className="anim-bar-grow relative h-full rounded-full"
                    style={{
                      width: `${Math.max(2, data.meta.pct)}%`,
                      background: 'linear-gradient(90deg, #b8941f 0%, #d4af37 60%, #f3d97a 100%)',
                      boxShadow: '0 0 16px rgba(212,175,55,0.55)',
                    }}
                  >
                    {/* brilho na ponta */}
                    <span className="absolute right-0 top-0 h-full w-6 rounded-full shimmer-gold" style={{ opacity: 0.8 }} />
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-lg font-bold" style={{ color: 'var(--text)' }}>
                    <AnimatedNumber value={data.meta.vendido_master} format={fmtMoedaFull} className="font-mono" style={{ color: 'var(--accent)' }} />
                    <span className="text-sm font-normal" style={{ color: 'var(--muted-color)' }}> de {fmtMoedaFull(data.meta.valor)} · <span className="font-mono font-semibold" style={{ color: 'var(--text)' }}>{data.meta.cotas_master}</span> cotas</span>
                  </p>
                  <p className="text-2xl font-bold font-mono" style={{ color: 'var(--accent)' }}>
                    <AnimatedNumber value={data.meta.pct} format={(n) => `${n.toFixed(1)}%`} />
                  </p>
                </div>
                {data.meta.acumulado_ano_valor !== undefined && (
                  <p className="mt-1 text-xs" style={{ color: 'var(--muted-color)' }}>
                    Acumulado {new Date().getFullYear()} (Master):{' '}
                    <span className="font-mono font-semibold" style={{ color: 'var(--accent)' }}>{fmtMoeda(data.meta.acumulado_ano_valor)}</span>
                    {' · '}<span className="font-mono font-semibold" style={{ color: 'var(--text)' }}>{data.meta.acumulado_ano_cotas}</span> cotas
                  </p>
                )}

                {/* faixa de destaque: a operação do usuário, colada ao termômetro (parte do bloco da meta) */}
                {(isMaster ? data.minha_fatia_master : data.minha_operacao) && (() => {
                  const op = isMaster ? data.minha_fatia_master! : data.minha_operacao!
                  const pct = isMaster ? data.minha_fatia_master!.pct_da_producao : data.minha_operacao!.pct_da_master
                  return (
                    <div
                      className="-mx-6 -mb-6 mt-5 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-b-2xl px-6 py-4"
                      style={{ background: 'rgba(212,175,55,0.07)', borderTop: '1px solid rgba(212,175,55,0.18)' }}
                    >
                      <span className="shrink-0 leading-none" style={{ fontSize: 16 }} role="img" aria-label="Operação">🏢</span>
                      <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--accent)' }}>Sua operação</span>
                      <span className="truncate text-sm font-semibold" style={{ color: 'var(--text)' }}>{op.empresa_nome}</span>
                      <span className="ml-auto text-xs" style={{ color: 'var(--muted-color)' }}>
                        <span className="font-mono font-bold" style={{ color: 'var(--accent)' }}>{fmtMoeda(op.vendido)}</span>
                        {' · '}{op.cotas} cotas
                        {' · '}<span className="font-semibold" style={{ color: 'var(--accent)' }}>{pct.toFixed(1)}%</span> da produção Master
                      </span>
                    </div>
                  )
                })()}
              </section>
              )}

              {/* ═══ CARD EXTRA: PRÓXIMA SEXTA (só master/representante) ═══ */}
              {data.proxima_sexta !== undefined && (
                <section
                  className="flex flex-wrap items-center justify-between gap-4 rounded-2xl p-5 anim-fade-up"
                  style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.22)' }}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl" style={{ background: 'rgba(34,197,94,0.15)' }}>
                      <Wallet size={22} style={{ color: '#22c55e' }} />
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#22c55e' }}>Próxima sexta</p>
                      <p className="text-sm" style={{ color: 'var(--muted-color)' }}>
                        {data.proxima_sexta.data ? `Pagamento previsto para ${fmtDataLonga(data.proxima_sexta.data)}` : 'Nenhum borderô na fila'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="font-mono text-2xl font-bold" style={{ color: '#22c55e' }}>
                        {mostrarSexta
                          ? <AnimatedNumber value={data.proxima_sexta.valor} format={fmtMoedaFull} />
                          : <span className="tracking-widest">R$ ••••••</span>}
                      </p>
                      {data.proxima_sexta.fatia_empresa !== undefined && (
                        <p className="mt-0.5 text-xs" style={{ color: 'var(--muted-color)' }}>
                          sua operação ({data.proxima_sexta.empresa_nome}):{' '}
                          <span className="font-mono font-semibold" style={{ color: '#22c55e' }}>
                            {mostrarSexta ? fmtMoeda(data.proxima_sexta.fatia_empresa) : '••••'}
                          </span>
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => setMostrarSexta((v) => !v)}
                      className="flex h-9 w-9 items-center justify-center rounded-lg transition-colors hover:bg-white/5"
                      style={{ border: '1px solid rgba(34,197,94,0.25)', color: '#22c55e' }}
                      title={mostrarSexta ? 'Ocultar valor' : 'Mostrar valor'}
                    >
                      {mostrarSexta ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </section>
              )}

              {/* ═══ LINHA 2: TOP 3 DO MÊS (largura total, 3 colunas) ═══ */}
              <CampeoesCard titulo="🏆 Top 3 do Mês" subtitulo="Produção corrente" geral={data.campeoes_mes.geral} minhaEmpresa={data.campeoes_mes.minha_empresa} empresaNome={data.minha_empresa_nome} modo={modoCampeoes} onModoChange={trocarModoCampeoes} />

              {/* ═══ LINHA 3: TOP 3 DA SEMANA (largura total, 3 colunas) ═══ */}
              <CampeoesCard titulo="⚡ Top 3 da Semana" subtitulo="Domingo a sábado" badge="dom–sáb" geral={data.melhores_semana.geral} minhaEmpresa={data.melhores_semana.minha_empresa} empresaNome={data.minha_empresa_nome} modo={modoCampeoes} onModoChange={trocarModoCampeoes} vazioLabel="Nenhuma venda no período ainda" />

              {/* ═══ LINHA 4: SEUS LANCES · PRÓXIMOS VENCIMENTOS ═══ */}
              <div className="grid gap-5 lg:grid-cols-2">
                {/* Seus lances / 💎 Lances (master) */}
                <section className="card-dark flex flex-col p-5 anim-fade-up">
                  <div className="mb-4 flex items-center gap-2">
                    <Gem size={16} style={{ color: 'var(--accent)' }} />
                    <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{isMaster ? 'Lances' : 'Seus lances'}</h3>
                  </div>

                  <div className="flex flex-1 flex-col gap-3">
                    {isMaster && (
                      <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--muted-color)' }}>Operação (todas)</p>
                    )}
                    <div
                      className={`rounded-xl p-4 ${lancesUrgente ? 'pulse-vermelho' : ''}`}
                      style={{
                        background: lancesUrgente ? 'rgba(239,68,68,0.08)' : 'rgba(255,255,255,0.02)',
                        border: `1px solid ${lancesUrgente ? 'rgba(239,68,68,0.35)' : 'var(--border)'}`,
                      }}
                    >
                      <p className="font-mono text-3xl font-bold" style={{ color: lancesUrgente ? '#ef4444' : 'var(--text)' }}>
                        <AnimatedNumber value={data.lances_alerta.pendentes} />
                      </p>
                      <p className="text-sm" style={{ color: 'var(--muted-color)' }}>
                        pendente{data.lances_alerta.pendentes !== 1 ? 's' : ''}
                        {data.lances_alerta.data_assembleia_proxima && (
                          <> · próx. assembleia <span className="font-semibold" style={{ color: lancesUrgente ? '#ef4444' : 'var(--accent)' }}>{fmtData(data.lances_alerta.data_assembleia_proxima)}</span></>
                        )}
                      </p>
                      {data.lances_alerta.pendentes_proxima_assembleia > 0 && (
                        <p className="mt-1 text-xs font-semibold" style={{ color: '#ef4444' }}>
                          {data.lances_alerta.pendentes_proxima_assembleia} com assembleia nos próximos 7 dias
                        </p>
                      )}
                    </div>

                    <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)' }}>
                      <p className="font-mono text-2xl font-bold" style={{ color: 'var(--text)' }}><AnimatedNumber value={data.lances_alerta.ofertados_aguardando} /></p>
                      <p className="text-sm" style={{ color: 'var(--muted-color)' }}>ofertado{data.lances_alerta.ofertados_aguardando !== 1 ? 's' : ''} aguardando</p>
                    </div>

                    {/* Master: fatia da própria empresa (mesmo dourado sutil da faixa "Sua Operação") */}
                    {isMaster && data.lances_minha_empresa && (() => {
                      const me = data.lances_minha_empresa!
                      const meUrgente = !!(me.data_assembleia_proxima && me.pendentes_proxima_assembleia > 0)
                      return (
                        <div
                          className={`rounded-xl p-4 ${meUrgente ? 'pulse-vermelho' : ''}`}
                          style={{
                            background: 'rgba(212,175,55,0.07)',
                            border: `1px solid ${meUrgente ? 'rgba(239,68,68,0.35)' : 'rgba(212,175,55,0.18)'}`,
                          }}
                        >
                          <div className="mb-2 flex items-center gap-2">
                            <span className="shrink-0 leading-none" style={{ fontSize: 14 }} role="img" aria-label="Empresa">🏢</span>
                            <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--accent)' }}>
                              {data.minha_fatia_master?.empresa_nome || 'Sua empresa'}
                            </span>
                          </div>
                          <p className="text-sm" style={{ color: 'var(--muted-color)' }}>
                            <span className="font-mono text-lg font-bold" style={{ color: meUrgente ? '#ef4444' : 'var(--text)' }}>{me.pendentes}</span> pendente{me.pendentes !== 1 ? 's' : ''}
                            {' · '}
                            <span className="font-mono text-lg font-bold" style={{ color: 'var(--text)' }}>{me.ofertados_aguardando}</span> ofertado{me.ofertados_aguardando !== 1 ? 's' : ''}
                          </p>
                          {me.pendentes_proxima_assembleia > 0 && (
                            <p className="mt-1 text-xs font-semibold" style={{ color: '#ef4444' }}>
                              {me.pendentes_proxima_assembleia} com assembleia nos próximos 7 dias
                              {me.data_assembleia_proxima && <> · próx. {fmtData(me.data_assembleia_proxima)}</>}
                            </p>
                          )}
                        </div>
                      )
                    })()}
                  </div>

                  <Link href="/lances" className="mt-4 flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-sm font-semibold transition-colors" style={{ background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.3)', color: 'var(--accent)' }}>
                    Ver lances <ArrowRight size={15} />
                  </Link>
                </section>

                {/* Próximos vencimentos */}
                <section className="card-dark p-5 anim-fade-up">
                  <div className="mb-4 flex items-center gap-2">
                    <CalendarClock size={16} style={{ color: 'var(--accent)' }} />
                    <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Próximos vencimentos</h3>
                    <span className="ml-auto text-[11px]" style={{ color: 'var(--muted-color)' }}>15 dias</span>
                  </div>
                  {data.vencimentos.length === 0 ? (
                    <p className="py-6 text-center text-sm" style={{ color: 'var(--muted-color)' }}>Nenhum vencimento nos próximos 15 dias</p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {data.vencimentos.map((v, i) => (
                        <div key={i} className="flex items-center justify-between rounded-lg p-3" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)' }}>
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-11 items-center justify-center rounded-lg" style={{ background: 'rgba(212,175,55,0.1)' }}>
                              <span className="font-mono text-xs font-bold" style={{ color: 'var(--accent)' }}>{fmtData(v.data)}</span>
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium" style={{ color: 'var(--text)' }}>{v.cliente}</p>
                              {(v.grupo || v.cota) && <p className="text-xs" style={{ color: 'var(--muted-color)' }}>Grupo/Cota: {v.grupo}/{v.cota}</p>}
                            </div>
                          </div>
                          <span className="font-mono text-sm font-semibold" style={{ color: 'var(--accent)' }}>{fmtMoeda(v.valor)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>

              {/* ═══ LINHA 5: QUADRO DE AVISOS (largura total) ═══ */}
              {/* Quadro de avisos */}
              <section className="card-dark p-5 anim-fade-up">
                  <div className="mb-4 flex items-center gap-2">
                    <Megaphone size={16} style={{ color: 'var(--accent)' }} />
                    <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Quadro de avisos</h3>
                    {data.pode_publicar_avisos && (
                      <button
                        onClick={() => setModalAviso(true)}
                        className="ml-auto flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-transform hover:scale-105 active:scale-95"
                        style={{ background: 'rgba(212,175,55,0.12)', border: '1px solid rgba(212,175,55,0.3)', color: 'var(--accent)' }}
                      >
                        <Plus size={13} /> Novo aviso
                      </button>
                    )}
                  </div>
                  {data.avisos.length === 0 ? (
                    <p className="py-6 text-center text-sm" style={{ color: 'var(--muted-color)' }}>Nenhum aviso no momento</p>
                  ) : (
                    <div className="flex flex-col gap-2.5">
                      {data.avisos.map((a) => (
                        <div
                          key={a.id}
                          className="group rounded-xl p-3.5"
                          style={{
                            background: a.fixado ? 'rgba(212,175,55,0.06)' : 'rgba(255,255,255,0.02)',
                            border: `1px solid ${a.fixado ? 'rgba(212,175,55,0.22)' : 'var(--border)'}`,
                          }}
                        >
                          <div className="flex items-start gap-2">
                            {a.fixado && <Pin size={13} className="mt-0.5 shrink-0" style={{ color: 'var(--accent)' }} />}
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{a.titulo}</p>
                              <p className="mt-0.5 text-xs leading-relaxed" style={{ color: 'var(--muted-color)' }}>{a.mensagem}</p>
                            </div>
                            {data.pode_publicar_avisos && (
                              <button
                                onClick={() => desativarAviso(a.id)}
                                className="shrink-0 rounded-md p-1 opacity-0 transition-opacity group-hover:opacity-100"
                                style={{ color: 'var(--muted-color)' }}
                                aria-label="Desativar aviso"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

            </div>
          )}
        </main>
      </div>

      {modalAviso && <NovoAvisoModal onClose={() => setModalAviso(false)} onCriado={() => { setModalAviso(false); carregar() }} />}
    </div>
  )
}
