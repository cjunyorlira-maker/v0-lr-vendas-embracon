'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import Sidebar from '@/components/Sidebar'
import Header from '@/components/Header'
import { Calculator, TrendingUp, AlertTriangle, CreditCard, Loader2 } from 'lucide-react'

interface Plano { id: string; sigla: string; nome_completo: string; bem: string; comissao_total: number; estorno_percent: number; estorno_ate_pgto: number }
interface FaixaCredito { credito: number; primeira_parcela: number; demais_parcela: number; total_nao_estornar: number }

const fmtMoeda = (v: number) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default function SimuladorPage() {
  const [planos, setPlanos] = useState<Plano[]>([])
  const [loading, setLoading] = useState(true)
  const [planoSigla, setPlanoSigla] = useState('')
  const [faixas, setFaixas] = useState<FaixaCredito[]>([])
  const [creditoSel, setCreditoSel] = useState('')
  const [qtdAntecipar, setQtdAntecipar] = useState('2')

  useEffect(() => {
    const supabase = createClient()
    supabase.from('planos').select('id, sigla, nome_completo, bem, comissao_total, estorno_percent, estorno_ate_pgto').eq('ativo', true).not('comissao_total', 'is', null).order('bem').then(({ data }) => {
      if (data) setPlanos(data as Plano[]); setLoading(false)
    })
  }, [])

  // quando muda o plano, busca as faixas de crédito dele
  useEffect(() => {
    if (!planoSigla) { setFaixas([]); return }
    const supabase = createClient()
    supabase.from('tabelas_credito').select('credito, primeira_parcela, demais_parcela, total_nao_estornar').eq('sigla', planoSigla).order('credito', { ascending: false }).then(({ data }) => {
      if (data) setFaixas(data as FaixaCredito[])
      setCreditoSel('')
    })
  }, [planoSigla])

  const plano = planos.find(p => p.sigla === planoSigla)
  const faixa = faixas.find(f => String(f.credito) === creditoSel)
  const qtd = parseInt(qtdAntecipar) || 0

  const creditoN = faixa?.credito || 0
  const comissao = plano && faixa ? creditoN * (plano.comissao_total / 100) : 0
  const estorno = plano && faixa ? creditoN * (plano.estorno_percent / 100) : 0
  const pgtoSeguranca = plano?.estorno_ate_pgto || 8
  const p1 = faixa?.primeira_parcela || 0
  const pd = faixa?.demais_parcela || 0
  const totalCliente = p1 + pd * qtd
  const pgtosCobertos = 1 + qtd
  const emRisco = pgtosCobertos < pgtoSeguranca
  const faltam = Math.max(0, pgtoSeguranca - pgtosCobertos)

  const inputStyle = { background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', color: 'var(--text)' }

  return (
    <div className="relative min-h-screen font-sans">
      <Sidebar />
      <div className="relative lg:ml-60" style={{ zIndex: 1 }}>
        <Header title="Simulador" />
        <main className="mx-auto max-w-3xl px-6 py-8 lg:px-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: 'rgba(212,175,55,0.15)', border: '1px solid rgba(212,175,55,0.25)' }}><Calculator size={18} style={{ color: 'var(--accent)' }} /></div>
            <div>
              <h2 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>Simulador de Comissão</h2>
              <p className="text-xs" style={{ color: 'var(--muted-color)' }}>Valores puxados das tabelas (Mais por Menos 50%)</p>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12"><Loader2 size={20} className="animate-spin" style={{ color: 'var(--accent)' }} /></div>
          ) : (
            <div className="space-y-5">
              <div className="rounded-xl p-5" style={{ background: 'rgba(0,0,0,0.12)', backdropFilter: 'blur(4px)', border: '1px solid var(--border)' }}>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs mb-1" style={{ color: 'var(--muted-color)' }}>Plano</label>
                    <select value={planoSigla} onChange={(e) => setPlanoSigla(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle}>
                      <option value="" style={{ background: '#131313' }}>Selecione</option>
                      {planos.map(p => <option key={p.id} value={p.sigla} style={{ background: '#131313' }}>{p.sigla} — {p.bem}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs mb-1" style={{ color: 'var(--muted-color)' }}>Valor do crédito</label>
                    <select value={creditoSel} onChange={(e) => setCreditoSel(e.target.value)} disabled={!faixas.length} className="w-full rounded-lg px-3 py-2 text-sm outline-none disabled:opacity-50" style={inputStyle}>
                      <option value="" style={{ background: '#131313' }}>Selecione</option>
                      {faixas.map(f => <option key={f.credito} value={String(f.credito)} style={{ background: '#131313' }}>{fmtMoeda(f.credito)}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs mb-1" style={{ color: 'var(--muted-color)' }}>Parcelas a antecipar</label>
                    <input type="number" min="0" value={qtdAntecipar} onChange={(e) => setQtdAntecipar(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle} />
                  </div>
                </div>
              </div>

              {plano && faixa && (
                <>
                  <div className="rounded-xl p-5" style={{ background: 'linear-gradient(135deg, rgba(34,197,94,0.12) 0%, rgba(34,197,94,0.04) 100%)', border: '1px solid rgba(34,197,94,0.25)' }}>
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl" style={{ background: 'rgba(34,197,94,0.2)' }}><TrendingUp size={20} style={{ color: '#22c55e' }} /></div>
                      <div><p className="text-xs" style={{ color: 'var(--muted-color)' }}>Comissão da LR ({plano.comissao_total}% recebido de uma vez)</p><p className="text-2xl font-bold" style={{ color: '#22c55e' }}>{fmtMoeda(comissao)}</p></div>
                    </div>
                  </div>

                  <div className="rounded-xl p-5" style={{ background: emRisco ? 'rgba(239,68,68,0.08)' : 'rgba(34,197,94,0.06)', border: `1px solid ${emRisco ? 'rgba(239,68,68,0.3)' : 'rgba(34,197,94,0.2)'}` }}>
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl" style={{ background: emRisco ? 'rgba(239,68,68,0.2)' : 'rgba(34,197,94,0.15)' }}><AlertTriangle size={20} style={{ color: emRisco ? '#ef4444' : '#22c55e' }} /></div>
                      <div className="flex-1">
                        <p className="text-xs" style={{ color: 'var(--muted-color)' }}>Risco de estorno ({plano.estorno_percent}% se sair antes do {pgtoSeguranca}º pgto)</p>
                        <p className="text-2xl font-bold" style={{ color: emRisco ? '#ef4444' : '#22c55e' }}>{emRisco ? fmtMoeda(estorno) : 'Sem risco'}</p>
                        <p className="text-xs mt-1" style={{ color: emRisco ? '#ef4444' : '#22c55e' }}>{emRisco ? `Antecipando 1ª + ${qtd} = ${pgtosCobertos} pgtos. Faltam ${faltam} pra zerar o risco.` : `${pgtosCobertos} pgtos cobre o ${pgtoSeguranca}º. Sem risco.`}</p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl p-5" style={{ background: 'rgba(0,0,0,0.12)', border: '1px solid var(--border)' }}>
                    <div className="flex items-center gap-3 mb-3"><CreditCard size={18} style={{ color: '#3b82f6' }} /><h3 className="text-sm font-semibold" style={{ color: '#3b82f6' }}>Quanto o cliente paga</h3></div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div><p className="text-xs" style={{ color: 'var(--muted-color)' }}>1ª parcela</p><p className="font-semibold" style={{ color: 'var(--text)' }}>{fmtMoeda(p1)}</p></div>
                      <div><p className="text-xs" style={{ color: 'var(--muted-color)' }}>Demais (cada)</p><p className="font-semibold" style={{ color: 'var(--text)' }}>{fmtMoeda(pd)}</p></div>
                      <div><p className="text-xs" style={{ color: 'var(--muted-color)' }}>+ {qtd} antecipadas (boleto único)</p><p className="font-semibold" style={{ color: 'var(--text)' }}>{fmtMoeda(pd * qtd)}</p></div>
                      <div><p className="text-xs" style={{ color: 'var(--muted-color)' }}>Total p/ não estornar</p><p className="font-semibold" style={{ color: '#f59e0b' }}>{fmtMoeda(faixa.total_nao_estornar)}</p></div>
                      <div className="col-span-2 pt-2" style={{ borderTop: '1px solid var(--border)' }}><p className="text-xs" style={{ color: 'var(--muted-color)' }}>Total que o cliente desembolsa (1ª + {qtd})</p><p className="text-xl font-bold" style={{ color: 'var(--accent)' }}>{fmtMoeda(totalCliente)}</p></div>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
