'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import Sidebar from '@/components/Sidebar'
import Header from '@/components/Header'
import { BookOpen, Loader2, Home, Car, Truck, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react'

interface Plano { id: string; sigla: string; nome_completo: string; bem: string; adesao_percent: number; prazo_meses: string | null }
interface Faixa { credito: number; primeira_parcela: number; demais_parcela: number; total_nao_estornar: number; taxa_antecip: number }

const fmtMoeda = (v: number | null) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const fmtMoeda2 = (v: number | null) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const bemIcon: Record<string, any> = { 'Imóvel': Home, 'Veículo': Car, 'Pesados': Truck }
const bemCor: Record<string, string> = { 'Imóvel': '#3b82f6', 'Veículo': '#22c55e', 'Pesados': '#f97316' }

export default function TabelasPage() {
  const [planos, setPlanos] = useState<Plano[]>([])
  const [loading, setLoading] = useState(true)
  const [expandido, setExpandido] = useState<string | null>(null)
  const [faixasPorSigla, setFaixasPorSigla] = useState<Record<string, Faixa[]>>({})

  useEffect(() => {
    const supabase = createClient()
    supabase.from('planos').select('id, sigla, nome_completo, bem, adesao_percent, prazo_meses').eq('ativo', true).order('bem').then(({ data }) => {
      if (data) setPlanos(data as Plano[]); setLoading(false)
    })
  }, [])

  async function abrir(p: Plano) {
    if (expandido === p.id) { setExpandido(null); return }
    setExpandido(p.id)
    if (!faixasPorSigla[p.sigla]) {
      const supabase = createClient()
      const { data } = await supabase.from('tabelas_credito').select('credito, primeira_parcela, demais_parcela, total_nao_estornar, taxa_antecip').eq('sigla', p.sigla).order('credito', { ascending: false })
      if (data) setFaixasPorSigla(prev => ({ ...prev, [p.sigla]: data as Faixa[] }))
    }
  }

  const grupos = planos.reduce((acc, p) => { const b = p.bem || 'Outros'; if (!acc[b]) acc[b] = []; acc[b].push(p); return acc }, {} as Record<string, Plano[]>)

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
              <p className="text-xs" style={{ color: 'var(--muted-color)' }}>Tabelas de crédito para consulta</p>
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
                    <div className="flex items-center gap-2 mb-3"><Icon size={16} style={{ color: cor }} /><h3 className="text-sm font-semibold" style={{ color: cor }}>{bem}</h3></div>
                    <div className="space-y-2">
                      {lista.map(p => {
                        const aberto = expandido === p.id
                        const faixas = faixasPorSigla[p.sigla] || []
                        return (
                          <div key={p.id} className="rounded-xl overflow-hidden" style={{ background: 'rgba(0,0,0,0.12)', backdropFilter: 'blur(4px)', border: '1px solid var(--border)' }}>
                            <div className="flex items-center justify-between p-4 cursor-pointer" onClick={() => abrir(p)}>
                              <div className="flex items-center gap-3 flex-wrap">
                                <span className="font-mono text-xs font-bold px-2 py-1 rounded" style={{ background: `${cor}20`, color: cor }}>{p.sigla}</span>
                                <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>{p.nome_completo}</span>
                                <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(212,175,55,0.12)', color: 'var(--accent)' }}>Adesão {p.adesao_percent}%</span>
                                {p.prazo_meses && <span className="text-xs" style={{ color: 'var(--muted-color)' }}>{p.prazo_meses} meses</span>}
                              </div>
                              {aberto ? <ChevronUp size={16} style={{ color: 'var(--muted-color)' }} /> : <ChevronDown size={16} style={{ color: 'var(--muted-color)' }} />}
                            </div>
                            {aberto && (
                              <div className="px-4 pb-4" style={{ borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
                                {faixas.length === 0 ? (
                                  <div className="flex items-center justify-center py-4"><Loader2 size={16} className="animate-spin" style={{ color: 'var(--accent)' }} /></div>
                                ) : (
                                  <div className="overflow-x-auto">
                                    <table className="w-full text-xs">
                                      <thead>
                                        <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                          <th className="p-2 text-left" style={{ color: 'var(--muted-color)' }}>Crédito</th>
                                          <th className="p-2 text-right" style={{ color: 'var(--muted-color)' }}>1ª parcela</th>
                                          <th className="p-2 text-right" style={{ color: 'var(--muted-color)' }}>Demais</th>
                                          <th className="p-2 text-right" style={{ color: 'var(--muted-color)' }}>Total p/ não estornar</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {faixas.map(f => (
                                          <tr key={f.credito} style={{ borderBottom: '1px solid var(--border)' }}>
                                            <td className="p-2 font-medium" style={{ color: 'var(--text)' }}>{fmtMoeda(f.credito)}</td>
                                            <td className="p-2 text-right" style={{ color: 'var(--text2)' }}>{fmtMoeda2(f.primeira_parcela)}</td>
                                            <td className="p-2 text-right" style={{ color: 'var(--text2)' }}>{fmtMoeda2(f.demais_parcela)}</td>
                                            <td className="p-2 text-right" style={{ color: '#f59e0b' }}>{fmtMoeda2(f.total_nao_estornar)}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}

              <div className="flex items-start gap-2 rounded-lg p-3" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
                <AlertTriangle size={16} style={{ color: '#f59e0b', marginTop: 1 }} />
                <p className="text-xs" style={{ color: '#f59e0b' }}>Se a venda for gerada em menos meses no sistema da Embracon, o valor das parcelas pode mudar. Confira sempre a proposta final.</p>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
