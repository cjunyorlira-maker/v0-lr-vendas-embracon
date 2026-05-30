'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import Sidebar from '@/components/Sidebar'
import Header from '@/components/Header'
import { BookOpen, Loader2, Home, Car, Truck, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react'

interface Plano {
  id: string
  sigla: string
  nome_completo: string
  bem: string
  adesao_percent: number
  faixa_min: number | null
  faixa_max: number | null
  comissao_total: number | null
  comissao_parcelas: number[] | null
  estorno_percent: number | null
  estorno_ate_pgto: number | null
  prazo_meses: string | null
}

const bemIcon: Record<string, any> = { 'Imóvel': Home, 'Veículo': Car, 'Pesados': Truck }
const bemCor: Record<string, string> = { 'Imóvel': '#3b82f6', 'Veículo': '#22c55e', 'Pesados': '#f97316' }
const fmtMoeda = (v: number | null) => v ? v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }) : '-'

export default function TabelasPage() {
  const [planos, setPlanos] = useState<Plano[]>([])
  const [loading, setLoading] = useState(true)
  const [expandido, setExpandido] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.from('planos').select('*').eq('ativo', true).order('bem').then(({ data }) => {
      if (data) setPlanos(data as Plano[])
      setLoading(false)
    })
  }, [])

  // agrupa por bem
  const grupos = planos.reduce((acc, p) => {
    const b = p.bem || 'Outros'
    if (!acc[b]) acc[b] = []
    acc[b].push(p)
    return acc
  }, {} as Record<string, Plano[]>)

  return (
    <div className="relative min-h-screen font-sans">
      <Sidebar />
      <div className="relative lg:ml-60" style={{ zIndex: 1 }}>
        <Header title="Tabelas" />
        <main className="mx-auto max-w-[1100px] px-6 py-8 lg:px-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: 'rgba(212,175,55,0.15)', border: '1px solid rgba(212,175,55,0.25)' }}><BookOpen size={18} style={{ color: 'var(--accent)' }} /></div>
            <div>
              <h2 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>Biblioteca de Tabelas</h2>
              <p className="text-xs" style={{ color: 'var(--muted-color)' }}>Regras dos planos que vendemos</p>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12"><Loader2 size={20} className="animate-spin" style={{ color: 'var(--accent)' }} /></div>
          ) : (
            <div className="space-y-6">
              {Object.entries(grupos).map(([bem, lista]) => {
                const Icon = bemIcon[bem] || Home
                const cor = bemCor[bem] || 'var(--accent)'
                return (
                  <div key={bem}>
                    <div className="flex items-center gap-2 mb-3">
                      <Icon size={16} style={{ color: cor }} />
                      <h3 className="text-sm font-semibold" style={{ color: cor }}>{bem}</h3>
                      <span className="text-xs" style={{ color: 'var(--muted-color)' }}>({lista.length})</span>
                    </div>
                    <div className="space-y-2">
                      {lista.map(p => {
                        const aberto = expandido === p.id
                        return (
                          <div key={p.id} className="rounded-xl overflow-hidden" style={{ background: 'rgba(0,0,0,0.12)', backdropFilter: 'blur(4px)', border: '1px solid var(--border)' }}>
                            <div className="flex items-center justify-between p-4 cursor-pointer" onClick={() => setExpandido(aberto ? null : p.id)}>
                              <div className="flex items-center gap-3 flex-wrap">
                                <span className="font-mono text-xs font-bold px-2 py-1 rounded" style={{ background: `${cor}20`, color: cor }}>{p.sigla}</span>
                                <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>{p.nome_completo}</span>
                                <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(212,175,55,0.12)', color: 'var(--accent)' }}>Adesão {p.adesao_percent}%</span>
                              </div>
                              {aberto ? <ChevronUp size={16} style={{ color: 'var(--muted-color)' }} /> : <ChevronDown size={16} style={{ color: 'var(--muted-color)' }} />}
                            </div>
                            {aberto && (
                              <div className="px-4 pb-4 grid grid-cols-2 md:grid-cols-3 gap-3 text-xs" style={{ borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
                                {(p.faixa_min || p.faixa_max) && <Campo label="Faixa de crédito" valor={`${fmtMoeda(p.faixa_min)} a ${fmtMoeda(p.faixa_max)}`} />}
                                {p.prazo_meses && <Campo label="Prazo" valor={`${p.prazo_meses} meses`} />}
                                <Campo label="Taxa antecipada" valor={`${p.adesao_percent}%`} />
                                {p.comissao_total && <Campo label="Comissão" valor={`${p.comissao_total}% em ${p.comissao_parcelas?.length || 0}x`} cor="#22c55e" />}
                                {p.estorno_ate_pgto && <Campo label="Estorno" valor={`${p.estorno_percent}% até ${p.estorno_ate_pgto}º pgto`} cor="#ef4444" />}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}

              {/* Alerta geral */}
              <div className="flex items-start gap-2 rounded-lg p-3" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
                <AlertTriangle size={16} style={{ color: '#f59e0b', marginTop: 1 }} />
                <p className="text-xs" style={{ color: '#f59e0b' }}>Atenção: se a venda for gerada em menos meses no sistema da Embracon, o valor das parcelas pode sofrer alteração. Confira sempre a proposta final.</p>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

function Campo({ label, valor, cor }: { label: string; valor: string; cor?: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide mb-0.5" style={{ color: 'var(--muted-color)' }}>{label}</p>
      <p className="text-sm font-medium" style={{ color: cor || 'var(--text2)' }}>{valor}</p>
    </div>
  )
}
