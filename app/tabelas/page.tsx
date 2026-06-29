'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import Sidebar from '@/components/Sidebar'
import Header from '@/components/Header'
import { BookOpen, Loader2, Home, Car, Truck, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react'

interface Plano { id: string; sigla: string; nome_completo: string; bem: string; adesao_percent: number; estorno_ate_pgto: number | null; parcelas_nao_estornar: number | null; seguro_pct?: number | null; tx_adm_topo: number | null; cheia_incremento_pct: number | null; prazo_meses?: number | null; reduzida_25_pct?: number | null }
interface Faixa { credito: number; primeira_parcela: number; demais_parcela: number; mais_7: number; total_nao_estornar: number; taxa_antecip: number }

const fmtMoeda = (v: number | null) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const fmtMoeda2 = (v: number | null) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const bemIcon: Record<string, any> = { 'Imóvel': Home, 'Veículo': Car, 'Pesados': Truck }
const bemCor: Record<string, string> = { 'Imóvel': '#3b82f6', 'Veículo': '#22c55e', 'Pesados': '#f97316' }

export default function TabelasPage() {
  const [planos, setPlanos] = useState<Plano[]>([])
  const [loading, setLoading] = useState(true)
  const [expandido, setExpandido] = useState<string | null>(null)
  const [faixasPorSigla, setFaixasPorSigla] = useState<Record<string, Faixa[]>>({})
  const [comSeguro, setComSeguro] = useState(false)
  const [verCheia, setVerCheia] = useState(false)
  const [verReducao25, setVerReducao25] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.from('planos').select('id, sigla, nome_completo, bem, adesao_percent, estorno_ate_pgto, parcelas_nao_estornar, seguro_pct, tx_adm_topo, cheia_incremento_pct, prazo_meses, reduzida_25_pct').eq('ativo', true).order('bem').then(async ({ data, error }) => {
      if (error) console.error('Erro ao buscar planos:', error)
      if (data) {
        setPlanos(data as Plano[])
        // carrega as faixas de todos os planos pra mostrar o badge de crédito antes de abrir
        const siglas = (data as Plano[]).map(p => p.sigla)
        if (siglas.length > 0) {
          const { data: todasFaixas } = await supabase.from('tabelas_credito').select('sigla, credito, primeira_parcela, demais_parcela, mais_7, total_nao_estornar, taxa_antecip').in('sigla', siglas).order('credito', { ascending: false })
          if (todasFaixas) {
            const porSigla: Record<string, Faixa[]> = {}
            for (const f of todasFaixas as any[]) { (porSigla[f.sigla] ||= []).push(f) }
            setFaixasPorSigla(porSigla)
          }
        }
      }
      setLoading(false)
    })
  }, [])

  async function abrir(p: Plano) {
    if (expandido === p.id) { setExpandido(null); return }
    setExpandido(p.id)
    if (!faixasPorSigla[p.sigla]) {
      const supabase = createClient()
      const { data } = await supabase.from('tabelas_credito').select('credito, primeira_parcela, demais_parcela, mais_7, total_nao_estornar, taxa_antecip').eq('sigla', p.sigla).order('credito', { ascending: false })
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
                          <div key={p.id} className="rounded-xl overflow-hidden" style={{ background: 'rgba(17,18,22,0.92)', boxShadow: '0 8px 24px rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)', border: '1px solid var(--border)' }}>
                            <div className="flex items-center justify-between p-4 cursor-pointer" onClick={() => abrir(p)}>
                              <div className="flex items-center gap-3 flex-wrap">
                                <span className="font-mono text-xs font-bold px-2 py-1 rounded" style={{ background: `${cor}20`, color: cor }}>{p.sigla}</span>
                                <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>{p.nome_completo}</span>
                                <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(212,175,55,0.12)', color: 'var(--accent)' }}>Adesão {p.adesao_percent}%</span>
                                {p.tx_adm_topo && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--muted-color)' }}>Taxa adm. {p.tx_adm_topo}%</span>}
                                <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--muted-color)' }}>{p.prazo_meses || 240} meses</span>
                                {(faixasPorSigla[p.sigla]?.length > 0) && (
                                  <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: 'rgba(34,197,94,0.12)', color: '#22c55e' }}>
                                    💰 {fmtMoeda(Math.min(...faixasPorSigla[p.sigla].map(f => f.credito)))} a {fmtMoeda(Math.max(...faixasPorSigla[p.sigla].map(f => f.credito)))}
                                  </span>
                                )}
                              </div>
                              {aberto ? <ChevronUp size={16} style={{ color: 'var(--muted-color)' }} /> : <ChevronDown size={16} style={{ color: 'var(--muted-color)' }} />}
                            </div>
                            {aberto && (
                              <div className="px-4 pb-4" style={{ borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
                                {faixas.length === 0 ? (
                                  <div className="flex items-center justify-center py-4"><Loader2 size={16} className="animate-spin" style={{ color: 'var(--accent)' }} /></div>
                                ) : (
                                  <div className="overflow-x-auto">
                                    {p.seguro_pct > 0 && (
                                      <div className="flex items-center gap-2 mb-2">
                                        <button onClick={() => setComSeguro(false)} className="rounded-md px-3 py-1 text-[11px] font-semibold transition-colors" style={{ background: !comSeguro ? 'rgba(212,175,55,0.2)' : 'rgba(255,255,255,0.03)', border: `1px solid ${!comSeguro ? 'var(--accent)' : 'var(--border)'}`, color: !comSeguro ? 'var(--accent)' : 'var(--muted-color)' }}>SEM SEGURO</button>
                                        <button onClick={() => setComSeguro(true)} className="rounded-md px-3 py-1 text-[11px] font-semibold transition-colors" style={{ background: comSeguro ? 'rgba(212,175,55,0.2)' : 'rgba(255,255,255,0.03)', border: `1px solid ${comSeguro ? 'var(--accent)' : 'var(--border)'}`, color: comSeguro ? 'var(--accent)' : 'var(--muted-color)' }}>COM SEGURO</button>
                                        {(p.reduzida_25_pct || 0) > 0 && (
                                          <button onClick={() => { setVerReducao25(v => !v); setVerCheia(false) }} className="rounded-md px-3 py-1 text-[11px] font-semibold transition-colors" style={{ background: verReducao25 ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.03)', border: `1px solid ${verReducao25 ? '#3b82f6' : 'var(--border)'}`, color: verReducao25 ? '#3b82f6' : 'var(--muted-color)' }}>{verReducao25 ? 'REDUÇÃO 25%' : 'VER 25%'}</button>
                                        )}
                                        {(p.cheia_incremento_pct || 0) > 0 && (
                                          <button onClick={() => { setVerCheia(v => !v); setVerReducao25(false) }} className="rounded-md px-3 py-1 text-[11px] font-semibold transition-colors" style={{ background: verCheia ? 'rgba(212,175,55,0.2)' : 'rgba(255,255,255,0.03)', border: `1px solid ${verCheia ? 'var(--accent)' : 'var(--border)'}`, color: verCheia ? 'var(--accent)' : 'var(--muted-color)' }}>{verCheia ? 'PARCELA CHEIA' : 'VER CHEIA'}</button>
                                        )}
                                      </div>
                                    )}
                                    {!(p.seguro_pct > 0) && ((p.cheia_incremento_pct || 0) > 0 || (p.reduzida_25_pct || 0) > 0) && (
                                      <div className="flex items-center gap-2 mb-2">
                                        {(p.reduzida_25_pct || 0) > 0 && (
                                          <button onClick={() => { setVerReducao25(v => !v); setVerCheia(false) }} className="rounded-md px-3 py-1 text-[11px] font-semibold transition-colors" style={{ background: verReducao25 ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.03)', border: `1px solid ${verReducao25 ? '#3b82f6' : 'var(--border)'}`, color: verReducao25 ? '#3b82f6' : 'var(--muted-color)' }}>{verReducao25 ? 'REDUÇÃO 25%' : 'VER 25%'}</button>
                                        )}
                                        {(p.cheia_incremento_pct || 0) > 0 && (
                                          <button onClick={() => { setVerCheia(v => !v); setVerReducao25(false) }} className="rounded-md px-3 py-1 text-[11px] font-semibold transition-colors" style={{ background: verCheia ? 'rgba(212,175,55,0.2)' : 'rgba(255,255,255,0.03)', border: `1px solid ${verCheia ? 'var(--accent)' : 'var(--border)'}`, color: verCheia ? 'var(--accent)' : 'var(--muted-color)' }}>{verCheia ? 'PARCELA CHEIA' : 'VER CHEIA'}</button>
                                        )}
                                      </div>
                                    )}
                                    <p className="text-[10px] mb-2" style={{ color: 'var(--muted-color)' }}>
                                      ⓘ A &quot;soma das demais&quot; e o &quot;total&quot; são sempre calculados sobre a parcela com redução de 50%. Os botões 25% e Cheia mudam só a parcela individual (1ª e demais).
                                    </p>
                                    <table className="w-full text-xs">
                                      <thead>
                                        <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                          <th className="p-2 text-left" style={{ color: 'var(--muted-color)' }}>Crédito</th>
                                          <th className="p-2 text-right" style={{ color: 'var(--muted-color)' }}>{(p.sigla === 'TP' || p.sigla === 'TEP') ? '1ª a 12ª parcela' : '1ª parcela'}</th>
                                          <th className="p-2 text-right" style={{ color: 'var(--muted-color)' }}>Demais (cada)</th>
                                          {(p.sigla === 'TP' || p.sigla === 'TEP') ? null : p.sigla === 'SP' ? (
                                            <>
                                              <th className="p-2 text-right" style={{ color: '#22c55e' }}>Garantir comissão<br/><span className="text-[9px]" style={{ color: 'var(--muted-color)' }}>(1ª + 3 = 4x)</span></th>
                                              <th className="p-2 text-right" style={{ color: '#f59e0b' }}>Não estornar<br/><span className="text-[9px]" style={{ color: 'var(--muted-color)' }}>(1ª + 5 = 6x)</span></th>
                                            </>
                                          ) : (
                                            <>
                                              <th className="p-2 text-right" style={{ color: 'var(--muted-color)' }}>Soma das demais<br/><span className="text-[9px]" style={{ color: 'var(--muted-color)' }}>(antecipação)</span></th>
                                              <th className="p-2 text-right" style={{ color: '#f59e0b' }}>Total p/ não estornar<br/><span className="text-[9px]" style={{ color: 'var(--muted-color)' }}>(1ª + {(p.parcelas_nao_estornar || 8) - 1} = {p.parcelas_nao_estornar || 8}x)</span></th>
                                            </>
                                          )}
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {faixas.map(f => {
                                          const seg = comSeguro ? Math.round(f.credito * (p.seguro_pct || 0) * 100) / 100 : 0
                                          // parcela individual: 50% (padrão), 25% ou cheia
                                          let pdBase = f.demais_parcela
                                          let p1Base = f.primeira_parcela
                                          if (verReducao25 && (p.reduzida_25_pct || 0) > 0) {
                                            pdBase = Math.round(f.credito * (p.reduzida_25_pct || 0) * 100) / 100
                                            p1Base = pdBase + Math.round(f.credito * (p.adesao_percent || 0) / 100 * 100) / 100
                                          } else if (verCheia && (p.cheia_incremento_pct || 0) > 0) {
                                            const inc = Math.round(f.credito * (p.cheia_incremento_pct || 0) * 100) / 100
                                            pdBase = f.demais_parcela + inc
                                            p1Base = f.primeira_parcela + inc
                                          }
                                          const p1 = p1Base + seg
                                          const pd = pdBase + seg
                                          const naoEstornarParc = p.parcelas_nao_estornar || 8
                                          // soma das demais e total: SEMPRE na 50% (não muda com 25%/cheia)
                                          const totalNaoEst = f.total_nao_estornar + seg * naoEstornarParc
                                          const mais7Seg = f.mais_7 + seg * 7
                                          return (
                                          <tr key={f.credito} style={{ borderBottom: '1px solid var(--border)' }}>
                                            <td className="p-2 font-medium" style={{ color: 'var(--text)' }}>{fmtMoeda(f.credito)}</td>
                                            <td className="p-2 text-right" style={{ color: 'var(--text2)' }}>{fmtMoeda2(p1)}</td>
                                            <td className="p-2 text-right" style={{ color: 'var(--text2)' }}>{fmtMoeda2(pd)}</td>
                                            {(p.sigla === 'TP' || p.sigla === 'TEP') ? null : p.sigla === 'SP' ? (
                                              <>
                                                <td className="p-2 text-right" style={{ color: '#22c55e' }}>{fmtMoeda2(totalNaoEst)}</td>
                                                <td className="p-2 text-right" style={{ color: '#f59e0b' }}>{fmtMoeda2(p1 + pd * 5)}</td>
                                              </>
                                            ) : (
                                              <>
                                                <td className="p-2 text-right" style={{ color: 'var(--text2)' }}>{fmtMoeda2(mais7Seg)}</td>
                                                <td className="p-2 text-right" style={{ color: '#f59e0b' }}>{fmtMoeda2(totalNaoEst)}</td>
                                              </>
                                            )}
                                          </tr>
                                          )
                                        })}
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
