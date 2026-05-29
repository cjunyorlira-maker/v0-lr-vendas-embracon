'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import Header from '@/components/Header'
import { Clock, Send, DollarSign, Upload, CheckCircle2, TrendingUp, Plus, FileText, Calendar, ArrowRight } from 'lucide-react'

interface DashData {
  pendentes: number
  solicitados: number
  aguardando_pagamento: number
  aguardando_baixa: number
  efetivados: number
  vendido_mes: number
  vendas_mes_qtd: number
  proximas_cobrancas: { data: string; nome: string; grupo: string; cota: string; valor: number }[]
}

const fmtMoeda = (v: number) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const fmtData = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })

export default function DashboardPage() {
  const router = useRouter()
  const [data, setData] = useState<DashData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/dashboard').then(r => r.json()).then(d => { if (!d.error) setData(d); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  const cards = [
    { label: 'Pendentes', value: data?.pendentes ?? 0, icon: Clock, cor: '#eab308', link: '/boletos' },
    { label: 'Solicitados', value: data?.solicitados ?? 0, icon: Send, cor: '#f97316', link: '/boletos' },
    { label: 'Aguardando Pagto', value: data?.aguardando_pagamento ?? 0, icon: DollarSign, cor: '#3b82f6', link: '/boletos' },
    { label: 'Aguardando Baixa', value: data?.aguardando_baixa ?? 0, icon: Upload, cor: '#a855f7', link: '/boletos' },
    { label: 'Efetivados', value: data?.efetivados ?? 0, icon: CheckCircle2, cor: '#22c55e', link: '/boletos' },
  ]

  return (
    <div className="relative min-h-screen font-sans">
      <Sidebar />
      <div className="relative lg:ml-60" style={{ zIndex: 1 }}>
        <Header title="Dashboard" />
        <main className="mx-auto max-w-[1400px] px-6 py-8 lg:px-8">

          {/* Destaque: vendido no mês */}
          <div className="rounded-xl p-6 mb-6 flex items-center justify-between flex-wrap gap-4" style={{ background: 'linear-gradient(135deg, rgba(212,175,55,0.12) 0%, rgba(212,175,55,0.04) 100%)', border: '1px solid rgba(212,175,55,0.25)' }}>
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl" style={{ background: 'rgba(212,175,55,0.2)' }}>
                <TrendingUp size={22} style={{ color: 'var(--accent)' }} />
              </div>
              <div>
                <p className="text-xs" style={{ color: 'var(--muted-color)' }}>Vendido este mês</p>
                <p className="text-2xl font-bold" style={{ color: 'var(--text)' }}>{loading ? '...' : fmtMoeda(data?.vendido_mes || 0)}</p>
                <p className="text-xs" style={{ color: 'var(--muted-color)' }}>{data?.vendas_mes_qtd || 0} venda{(data?.vendas_mes_qtd || 0) !== 1 ? 's' : ''} no mês</p>
              </div>
            </div>
            <button onClick={() => router.push('/nova-venda')} className="flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold transition-transform hover:scale-105 active:scale-95" style={{ background: 'linear-gradient(135deg, #d4af37 0%, #c9a227 50%, #b8941f 100%)', color: '#0a0a0a' }}>
              <Plus size={16} />Nova Venda
            </button>
          </div>

          {/* Cards de status */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
            {cards.map((c) => {
              const Icon = c.icon
              return (
                <button key={c.label} onClick={() => router.push(c.link)} className="rounded-xl p-4 text-left transition-transform hover:scale-[1.03] active:scale-95" style={{ background: 'rgba(0,0,0,0.12)', backdropFilter: 'blur(4px)', border: '1px solid var(--border)' }}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: `${c.cor}20` }}><Icon size={15} style={{ color: c.cor }} /></div>
                  </div>
                  <p className="text-2xl font-bold" style={{ color: 'var(--text)' }}>{loading ? '–' : c.value}</p>
                  <p className="text-xs" style={{ color: 'var(--muted-color)' }}>{c.label}</p>
                </button>
              )
            })}
          </div>

          {/* Próximas cobranças */}
          <div className="rounded-xl p-5" style={{ background: 'rgba(0,0,0,0.12)', backdropFilter: 'blur(4px)', border: '1px solid var(--border)' }}>
            <div className="flex items-center gap-2 mb-4">
              <Calendar size={16} style={{ color: '#3b82f6' }} />
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Próximas cobranças (30 dias)</h3>
            </div>
            {loading ? (
              <p className="text-sm py-4 text-center" style={{ color: 'var(--muted-color)' }}>Carregando...</p>
            ) : (data?.proximas_cobrancas?.length || 0) === 0 ? (
              <p className="text-sm py-4 text-center" style={{ color: 'var(--muted-color)' }}>Nenhuma cobrança nos próximos 30 dias</p>
            ) : (
              <div className="space-y-2">
                {data!.proximas_cobrancas.map((c, i) => (
                  <div key={i} className="flex items-center justify-between rounded-lg p-3" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)' }}>
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-12 flex-col items-center justify-center rounded-lg" style={{ background: 'rgba(59,130,246,0.12)' }}>
                        <span className="text-xs font-bold" style={{ color: '#3b82f6' }}>{fmtData(c.data)}</span>
                      </div>
                      <div>
                        <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>{c.nome}</p>
                        <p className="text-xs" style={{ color: 'var(--muted-color)' }}>Grupo/Cota: {c.grupo}/{c.cota}</p>
                      </div>
                    </div>
                    <span className="text-sm font-semibold" style={{ color: 'var(--accent)' }}>{fmtMoeda(c.valor)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

        </main>
      </div>
    </div>
  )
}
