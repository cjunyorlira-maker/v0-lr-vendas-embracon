'use client'

import { useState, useEffect } from 'react'
import Sidebar from '@/components/Sidebar'
import Header from '@/components/Header'
import { DollarSign, Loader2, AlertTriangle, Settings, Check, TrendingUp, Lock } from 'lucide-react'

interface VendaComissao {
  id: string; cliente: string; vendedor: string; plano: string; credito: number
  comissao_lr: number; percentual_vendedor: number; comissao_vendedor: number
  percentual_supervisor: number; comissao_supervisor: number
  em_risco: boolean; valor_estorno: number; faltam: number; pgto_seguranca: number
}

const fmtMoeda = (v: number) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

export default function ComissoesPage() {
  const [vendas, setVendas] = useState<VendaComissao[]>([])
  const [loading, setLoading] = useState(true)
  const [semAcesso, setSemAcesso] = useState(false)
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set())
  const [aba, setAba] = useState<'vendas' | 'config'>('vendas')
  const [pctVend, setPctVend] = useState('')
  const [pctSup, setPctSup] = useState('')
  const [aplicando, setAplicando] = useState(false)
  // config padrão
  const [padraoVend, setPadraoVend] = useState('')
  const [padraoSup, setPadraoSup] = useState('')
  const [salvandoConfig, setSalvandoConfig] = useState(false)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    const res = await fetch('/api/comissoes')
    if (res.status === 403) { setSemAcesso(true); setLoading(false); return }
    const data = await res.json()
    if (data.vendas) setVendas(data.vendas)
    if (data.config) { setPadraoVend(String(data.config.percentual_vendedor_padrao || '')); setPadraoSup(String(data.config.percentual_supervisor_padrao || '')) }
    setLoading(false)
  }

  function toggle(id: string) {
    const nova = new Set(selecionadas)
    nova.has(id) ? nova.delete(id) : nova.add(id)
    setSelecionadas(nova)
  }
  function toggleTodas() {
    if (selecionadas.size === vendas.length) setSelecionadas(new Set())
    else setSelecionadas(new Set(vendas.map(v => v.id)))
  }

  async function aplicar() {
    if (selecionadas.size === 0) { alert('Selecione ao menos uma venda'); return }
    if (!pctVend && !pctSup) { alert('Informe ao menos um percentual'); return }
    setAplicando(true)
    await fetch('/api/comissoes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acao: 'aplicar', venda_ids: Array.from(selecionadas), percentual_vendedor: pctVend || undefined, percentual_supervisor: pctSup || undefined }) })
    setSelecionadas(new Set()); setPctVend(''); setPctSup('')
    await loadData()
    setAplicando(false)
  }

  async function salvarConfig() {
    setSalvandoConfig(true)
    await fetch('/api/comissoes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acao: 'salvar_config', percentual_vendedor_padrao: parseFloat(padraoVend) || 0, percentual_supervisor_padrao: parseFloat(padraoSup) || 0 }) })
    await loadData()
    setSalvandoConfig(false)
  }

  const totalLR = vendas.reduce((s, v) => s + v.comissao_lr, 0)
  const totalVend = vendas.reduce((s, v) => s + v.comissao_vendedor, 0)
  const emRisco = vendas.filter(v => v.em_risco).length
  const inputStyle = { background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', color: 'var(--text)' }

  if (semAcesso) {
    return (
      <div className="relative min-h-screen font-sans">
        <Sidebar />
        <div className="relative lg:ml-60" style={{ zIndex: 1 }}>
          <Header title="Comissões" />
          <main className="mx-auto max-w-3xl px-6 py-8 flex flex-col items-center justify-center" style={{ minHeight: '60vh' }}>
            <Lock size={32} style={{ color: 'var(--muted-color)' }} />
            <p className="text-sm mt-3" style={{ color: 'var(--muted-color)' }}>Apenas representante e administração têm acesso às comissões.</p>
          </main>
        </div>
      </div>
    )
  }

  return (
    <div className="relative min-h-screen font-sans">
      <Sidebar />
      <div className="relative lg:ml-60" style={{ zIndex: 1 }}>
        <Header title="Comissões" />
        <main className="mx-auto max-w-[1400px] px-6 py-8 lg:px-8">
          {/* Resumo */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
            <div className="rounded-xl p-4" style={{ background: 'linear-gradient(135deg, rgba(34,197,94,0.12) 0%, rgba(34,197,94,0.04) 100%)', border: '1px solid rgba(34,197,94,0.25)' }}>
              <div className="flex items-center gap-2 mb-1"><TrendingUp size={14} style={{ color: '#22c55e' }} /><p className="text-xs" style={{ color: 'var(--muted-color)' }}>Comissão LR (total)</p></div>
              <p className="text-xl font-bold" style={{ color: '#22c55e' }}>{fmtMoeda(totalLR)}</p>
            </div>
            <div className="rounded-xl p-4" style={{ background: 'rgba(0,0,0,0.12)', border: '1px solid var(--border)' }}>
              <p className="text-xs mb-1" style={{ color: 'var(--muted-color)' }}>Comissão vendedores</p>
              <p className="text-xl font-bold" style={{ color: 'var(--text)' }}>{fmtMoeda(totalVend)}</p>
            </div>
            <div className="rounded-xl p-4" style={{ background: emRisco > 0 ? 'rgba(239,68,68,0.08)' : 'rgba(0,0,0,0.12)', border: `1px solid ${emRisco > 0 ? 'rgba(239,68,68,0.3)' : 'var(--border)'}` }}>
              <div className="flex items-center gap-2 mb-1"><AlertTriangle size={14} style={{ color: emRisco > 0 ? '#ef4444' : 'var(--muted-color)' }} /><p className="text-xs" style={{ color: 'var(--muted-color)' }}>Vendas em risco de estorno</p></div>
              <p className="text-xl font-bold" style={{ color: emRisco > 0 ? '#ef4444' : 'var(--text)' }}>{emRisco}</p>
            </div>
          </div>

          {/* Abas */}
          <div className="flex gap-2 mb-5">
            <button onClick={() => setAba('vendas')} className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium" style={{ background: aba === 'vendas' ? 'rgba(212,175,55,0.15)' : 'rgba(255,255,255,0.03)', border: `1px solid ${aba === 'vendas' ? 'var(--accent)' : 'var(--border)'}`, color: aba === 'vendas' ? 'var(--accent)' : 'var(--muted-color)' }}><DollarSign size={14} />Vendas</button>
            <button onClick={() => setAba('config')} className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium" style={{ background: aba === 'config' ? 'rgba(212,175,55,0.15)' : 'rgba(255,255,255,0.03)', border: `1px solid ${aba === 'config' ? 'var(--accent)' : 'var(--border)'}`, color: aba === 'config' ? 'var(--accent)' : 'var(--muted-color)' }}><Settings size={14} />Configurar padrão</button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12"><Loader2 size={20} className="animate-spin" style={{ color: 'var(--accent)' }} /></div>
          ) : aba === 'config' ? (
            <div className="rounded-xl p-5 max-w-md" style={{ background: 'rgba(0,0,0,0.12)', border: '1px solid var(--border)' }}>
              <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--text)' }}>Percentuais padrão</h3>
              <p className="text-xs mb-4" style={{ color: 'var(--muted-color)' }}>Aplicados automaticamente nas vendas que não têm % definida.</p>
              <div className="space-y-3">
                <div><label className="block text-xs mb-1" style={{ color: 'var(--muted-color)' }}>% padrão do vendedor</label><input value={padraoVend} onChange={(e) => setPadraoVend(e.target.value)} placeholder="0,5" className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle} /></div>
                <div><label className="block text-xs mb-1" style={{ color: 'var(--muted-color)' }}>% padrão do supervisor</label><input value={padraoSup} onChange={(e) => setPadraoSup(e.target.value)} placeholder="0,2" className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle} /></div>
                <button onClick={salvarConfig} disabled={salvandoConfig} className="w-full flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold disabled:opacity-50 transition-transform hover:scale-105 active:scale-95" style={{ background: 'linear-gradient(135deg, #d4af37 0%, #c9a227 50%, #b8941f 100%)', color: '#0a0a0a' }}>{salvandoConfig ? <Loader2 size={14} className="animate-spin" /> : <><Check size={14} />Salvar padrão</>}</button>
              </div>
            </div>
          ) : (
            <>
              {/* Barra de aplicar em lote */}
              {selecionadas.size > 0 && (
                <div className="rounded-xl p-4 mb-4 flex items-end gap-3 flex-wrap" style={{ background: 'rgba(212,175,55,0.08)', border: '1px solid rgba(212,175,55,0.25)' }}>
                  <span className="text-sm font-medium self-center" style={{ color: 'var(--accent)' }}>{selecionadas.size} selecionada{selecionadas.size !== 1 ? 's' : ''}</span>
                  <div><label className="block text-[10px] mb-1" style={{ color: 'var(--muted-color)' }}>% Vendedor</label><input value={pctVend} onChange={(e) => setPctVend(e.target.value)} placeholder="0,5" className="rounded-lg px-2 py-1.5 text-xs outline-none w-20" style={inputStyle} /></div>
                  <div><label className="block text-[10px] mb-1" style={{ color: 'var(--muted-color)' }}>% Supervisor</label><input value={pctSup} onChange={(e) => setPctSup(e.target.value)} placeholder="0,2" className="rounded-lg px-2 py-1.5 text-xs outline-none w-20" style={inputStyle} /></div>
                  <button onClick={aplicar} disabled={aplicando} className="rounded-lg px-4 py-1.5 text-xs font-semibold disabled:opacity-50" style={{ background: 'var(--accent)', color: '#0a0a0a' }}>{aplicando ? 'Aplicando...' : 'Aplicar nas selecionadas'}</button>
                </div>
              )}

              {vendas.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 gap-2"><DollarSign size={32} style={{ color: 'var(--muted-color)' }} /><p className="text-sm" style={{ color: 'var(--muted-color)' }}>Nenhuma venda</p></div>
              ) : (
                <div className="rounded-xl overflow-hidden" style={{ background: 'rgba(0,0,0,0.12)', border: '1px solid var(--border)' }}>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border)' }}>
                          <th className="p-3 text-left"><input type="checkbox" checked={selecionadas.size === vendas.length && vendas.length > 0} onChange={toggleTodas} className="accent-yellow-500" /></th>
                          <th className="p-3 text-left text-xs" style={{ color: 'var(--muted-color)' }}>Cliente</th>
                          <th className="p-3 text-left text-xs" style={{ color: 'var(--muted-color)' }}>Plano</th>
                          <th className="p-3 text-right text-xs" style={{ color: 'var(--muted-color)' }}>Crédito</th>
                          <th className="p-3 text-right text-xs" style={{ color: '#22c55e' }}>Com. LR</th>
                          <th className="p-3 text-right text-xs" style={{ color: 'var(--muted-color)' }}>Vend. %</th>
                          <th className="p-3 text-right text-xs" style={{ color: 'var(--muted-color)' }}>Com. Vend.</th>
                          <th className="p-3 text-center text-xs" style={{ color: 'var(--muted-color)' }}>Estorno</th>
                        </tr>
                      </thead>
                      <tbody>
                        {vendas.map(v => (
                          <tr key={v.id} style={{ borderBottom: '1px solid var(--border)', background: selecionadas.has(v.id) ? 'rgba(212,175,55,0.05)' : 'transparent' }}>
                            <td className="p-3"><input type="checkbox" checked={selecionadas.has(v.id)} onChange={() => toggle(v.id)} className="accent-yellow-500" /></td>
                            <td className="p-3" style={{ color: 'var(--text)' }}>{v.cliente}<br /><span className="text-[10px]" style={{ color: 'var(--muted-color)' }}>{v.vendedor}</span></td>
                            <td className="p-3"><span className="font-mono text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(212,175,55,0.12)', color: 'var(--accent)' }}>{v.plano}</span></td>
                            <td className="p-3 text-right" style={{ color: 'var(--text2)' }}>{fmtMoeda(v.credito)}</td>
                            <td className="p-3 text-right font-semibold" style={{ color: '#22c55e' }}>{fmtMoeda(v.comissao_lr)}</td>
                            <td className="p-3 text-right" style={{ color: 'var(--text2)' }}>{v.percentual_vendedor}%</td>
                            <td className="p-3 text-right" style={{ color: 'var(--text)' }}>{fmtMoeda(v.comissao_vendedor)}</td>
                            <td className="p-3 text-center">
                              {v.em_risco ? <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444' }} title={`Faltam ${v.faltam} pgtos`}>{'\u25cf'} risco</span> : <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e' }}>{'\u2713'} seguro</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  )
}
