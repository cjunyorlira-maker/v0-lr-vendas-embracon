'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import Sidebar from '@/components/Sidebar'
import Header from '@/components/Header'
import { Calculator, CreditCard, Loader2, AlertTriangle } from 'lucide-react'

interface Plano { id: string; sigla: string; nome_completo: string; bem: string; adesao_percent: number }
interface FaixaCredito { credito: number; primeira_parcela: number; demais_parcela: number; total_nao_estornar: number }

const fmtMoeda = (v: number) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// categorias agrupadas
const CATEGORIAS: Record<string, { label: string; siglas: string[] }> = {
  imovel_1: { label: 'Imóvel 1%', siglas: ['EI1', 'SUE'] },
  imovel_2: { label: 'Imóvel 2%', siglas: ['PSE', 'SEP'] },
  auto_1: { label: 'Auto 1%', siglas: ['ETA'] },
  auto_2: { label: 'Auto 2%', siglas: ['PE2'] },
  pesados_2: { label: 'Pesados 2%', siglas: ['SP'] },
}

export default function SimuladorPage() {
  const [planos, setPlanos] = useState<Plano[]>([])
  const [loading, setLoading] = useState(true)
  const [categoria, setCategoria] = useState('')
  const [planoSigla, setPlanoSigla] = useState('')
  const [faixas, setFaixas] = useState<FaixaCredito[]>([])
  const [creditoSel, setCreditoSel] = useState('')
  const [qtdAntecipar, setQtdAntecipar] = useState('2')

  useEffect(() => {
    const supabase = createClient()
    supabase.from('planos').select('id, sigla, nome_completo, bem, adesao_percent').eq('ativo', true).order('bem').then(({ data }) => {
      if (data) setPlanos(data as Plano[]); setLoading(false)
    })
  }, [])

  // planos da categoria escolhida
  const planosDaCategoria = categoria ? planos.filter(p => CATEGORIAS[categoria]?.siglas.includes(p.sigla)) : []

  useEffect(() => {
    if (!planoSigla) { setFaixas([]); return }
    const supabase = createClient()
    supabase.from('tabelas_credito').select('credito, primeira_parcela, demais_parcela, total_nao_estornar').eq('sigla', planoSigla).order('credito', { ascending: false }).then(({ data }) => {
      if (data) setFaixas(data as FaixaCredito[]); setCreditoSel('')
    })
  }, [planoSigla])

  const faixa = faixas.find(f => String(f.credito) === creditoSel)
  const qtd = parseInt(qtdAntecipar) || 0
  const p1 = faixa?.primeira_parcela || 0
  const pd = faixa?.demais_parcela || 0
  const totalCliente = p1 + pd * qtd

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
              <h2 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>Simulador de Venda</h2>
              <p className="text-xs" style={{ color: 'var(--muted-color)' }}>Simule quanto o cliente paga</p>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12"><Loader2 size={20} className="animate-spin" style={{ color: 'var(--accent)' }} /></div>
          ) : (
            <div className="space-y-5">
              <div className="rounded-xl p-5" style={{ background: 'rgba(0,0,0,0.12)', backdropFilter: 'blur(4px)', border: '1px solid var(--border)' }}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs mb-1" style={{ color: 'var(--muted-color)' }}>Tipo de tabela</label>
                    <select value={categoria} onChange={(e) => { setCategoria(e.target.value); setPlanoSigla(''); setFaixas([]) }} className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle}>
                      <option value="" style={{ background: '#131313' }}>Selecione</option>
                      {Object.entries(CATEGORIAS).map(([k, v]) => <option key={k} value={k} style={{ background: '#131313' }}>{v.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs mb-1" style={{ color: 'var(--muted-color)' }}>Plano</label>
                    <select value={planoSigla} onChange={(e) => setPlanoSigla(e.target.value)} disabled={!planosDaCategoria.length} className="w-full rounded-lg px-3 py-2 text-sm outline-none disabled:opacity-50" style={inputStyle}>
                      <option value="" style={{ background: '#131313' }}>Selecione</option>
                      {planosDaCategoria.map(p => <option key={p.id} value={p.sigla} style={{ background: '#131313' }}>{p.sigla} — {p.nome_completo}</option>)}
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

              {faixa && (
                <div className="rounded-xl p-5" style={{ background: 'rgba(0,0,0,0.12)', border: '1px solid var(--border)' }}>
                  <div className="flex items-center gap-3 mb-4"><CreditCard size={18} style={{ color: '#3b82f6' }} /><h3 className="text-sm font-semibold" style={{ color: '#3b82f6' }}>Quanto o cliente paga</h3></div>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div><p className="text-xs" style={{ color: 'var(--muted-color)' }}>1ª parcela</p><p className="text-lg font-semibold" style={{ color: 'var(--text)' }}>{fmtMoeda(p1)}</p></div>
                    <div><p className="text-xs" style={{ color: 'var(--muted-color)' }}>Demais (cada)</p><p className="text-lg font-semibold" style={{ color: 'var(--text)' }}>{fmtMoeda(pd)}</p></div>
                    <div><p className="text-xs" style={{ color: 'var(--muted-color)' }}>+ {qtd} antecipadas</p><p className="text-lg font-semibold" style={{ color: 'var(--text)' }}>{fmtMoeda(pd * qtd)}</p></div>
                    <div><p className="text-xs" style={{ color: 'var(--muted-color)' }}>Total p/ não estornar</p><p className="text-lg font-semibold" style={{ color: '#f59e0b' }}>{fmtMoeda(faixa.total_nao_estornar)}</p></div>
                  </div>
                  <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
                    <p className="text-xs" style={{ color: 'var(--muted-color)' }}>Total que o cliente desembolsa (1ª + {qtd})</p>
                    <p className="text-2xl font-bold" style={{ color: 'var(--accent)' }}>{fmtMoeda(totalCliente)}</p>
                  </div>
                </div>
              )}

              <div className="flex items-start gap-2 rounded-lg p-3" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
                <AlertTriangle size={15} style={{ color: '#f59e0b', marginTop: 1 }} />
                <p className="text-xs" style={{ color: '#f59e0b' }}>Se a venda for gerada em menos meses no sistema da Embracon, o valor das parcelas pode mudar. Confira a proposta final.</p>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
