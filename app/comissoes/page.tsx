'use client'

import { useState, useEffect, useRef } from 'react'
import Sidebar from '@/components/Sidebar'
import Header from '@/components/Header'
import { DollarSign, Loader2, AlertTriangle, Settings, Check, TrendingUp, Lock, Upload, FileText } from 'lucide-react'

interface VendaComissao {
  id: string; cliente: string; vendedor: string; plano: string; credito: number
  comissao_lr: number; percentual_vendedor: number; comissao_vendedor: number
  percentual_supervisor: number; comissao_supervisor: number
  comissao_recebida_rs: number; comissao_recebida_percent: number
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
  const [salvandoConfig, setSalvandoConfig] = useState(false)
  const CATEGORIAS = [
    { key: 'imovel_1', label: 'Imóvel 1%', planos: 'EI1, SUE' },
    { key: 'imovel_2', label: 'Imóvel 2%', planos: 'PSE, SEP' },
    { key: 'auto_1', label: 'Auto 1%', planos: 'ETA' },
    { key: 'auto_2', label: 'Auto 2%', planos: 'PE2' },
    { key: 'pesados_2', label: 'Pesados 2%', planos: 'SP' },
  ]
  const [catConfig, setCatConfig] = useState<Record<string, { vend: string; sup: string }>>({})
  const [importando, setImportando] = useState(false)
  const [resultImport, setResultImport] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    const res = await fetch('/api/comissoes')
    if (res.status === 403) { setSemAcesso(true); setLoading(false); return }
    const data = await res.json()
    if (data.vendas) setVendas(data.vendas)
    if (data.config_categorias) {
      const map: Record<string, { vend: string; sup: string }> = {}
      for (const c of data.config_categorias) {
        map[c.categoria] = { vend: String(c.percentual_vendedor || ''), sup: String(c.percentual_supervisor || '') }
      }
      setCatConfig(map)
    }
    setLoading(false)
  }

  function toggle(id: string) {
    const nova = new Set(selecionadas); nova.has(id) ? nova.delete(id) : nova.add(id); setSelecionadas(nova)
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
    setSelecionadas(new Set()); setPctVend(''); setPctSup(''); await loadData(); setAplicando(false)
  }

  async function salvarConfig() {
    setSalvandoConfig(true)
    const categorias = CATEGORIAS.map(c => ({
      categoria: c.key,
      percentual_vendedor: parseFloat(catConfig[c.key]?.vend || '0') || 0,
      percentual_supervisor: parseFloat(catConfig[c.key]?.sup || '0') || 0,
    }))
    await fetch('/api/comissoes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acao: 'salvar_config_categoria', categorias }) })
    await loadData(); setSalvandoConfig(false)
  }

  async function importarMapa(file: File) {
    setImportando(true); setResultImport(null)
    try {
      const fd = new FormData(); fd.append('file', file)
      const res = await fetch('/api/comissoes/importar-mapa', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) { setResultImport('Erro: ' + (data.error || 'falhou')); setImportando(false); return }
      const naoEnc = data.contratos_nao_encontrados?.length || 0
      setResultImport(`Mapa importado! ${data.total_contratos} contratos, ${fmtMoeda(data.total_comissao)} em comissão.${naoEnc > 0 ? ` ${naoEnc} contrato(s) não encontrado(s) nas vendas.` : ''}`)
      await loadData()
    } catch { setResultImport('Erro de conexão') }
    setImportando(false)
  }

  const totalLR = vendas.reduce((s, v) => s + v.comissao_lr, 0)
  const totalRecebido = vendas.reduce((s, v) => s + (v.comissao_recebida_rs || 0), 0)
  const totalFalta = totalLR - totalRecebido
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
          {/* Resumo: LR total, Recebido, A receber, Risco */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <div className="rounded-xl p-4" style={{ background: 'rgba(0,0,0,0.12)', border: '1px solid var(--border)' }}>
              <div className="flex items-center gap-2 mb-1"><TrendingUp size={14} style={{ color: 'var(--accent)' }} /><p className="text-xs" style={{ color: 'var(--muted-color)' }}>Comissão Rep. (total)</p></div>
              <p className="text-xl font-bold" style={{ color: 'var(--text)' }}>{fmtMoeda(totalLR)}</p>
            </div>
            <div className="rounded-xl p-4" style={{ background: 'linear-gradient(135deg, rgba(34,197,94,0.12) 0%, rgba(34,197,94,0.04) 100%)', border: '1px solid rgba(34,197,94,0.25)' }}>
              <p className="text-xs mb-1" style={{ color: 'var(--muted-color)' }}>Já recebido</p>
              <p className="text-xl font-bold" style={{ color: '#22c55e' }}>{fmtMoeda(totalRecebido)}</p>
            </div>
            <div className="rounded-xl p-4" style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)' }}>
              <p className="text-xs mb-1" style={{ color: 'var(--muted-color)' }}>A receber</p>
              <p className="text-xl font-bold" style={{ color: '#f59e0b' }}>{fmtMoeda(totalFalta)}</p>
            </div>
            <div className="rounded-xl p-4" style={{ background: emRisco > 0 ? 'rgba(239,68,68,0.08)' : 'rgba(0,0,0,0.12)', border: `1px solid ${emRisco > 0 ? 'rgba(239,68,68,0.3)' : 'var(--border)'}` }}>
              <div className="flex items-center gap-2 mb-1"><AlertTriangle size={14} style={{ color: emRisco > 0 ? '#ef4444' : 'var(--muted-color)' }} /><p className="text-xs" style={{ color: 'var(--muted-color)' }}>Em risco de estorno</p></div>
              <p className="text-xl font-bold" style={{ color: emRisco > 0 ? '#ef4444' : 'var(--text)' }}>{emRisco}</p>
            </div>
          </div>

          {/* Importar mapa */}
          <input ref={fileRef} type="file" accept="application/pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) importarMapa(f) }} />
          <div className="flex items-center gap-3 mb-5 flex-wrap">
            <button onClick={() => fileRef.current?.click()} disabled={importando} className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50 transition-transform hover:scale-105 active:scale-95" style={{ background: 'rgba(59,130,246,0.15)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.3)' }}>
              {importando ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}{importando ? 'Importando...' : 'Importar mapa de comissão (PDF)'}
            </button>
            {resultImport && <span className="text-xs" style={{ color: resultImport.startsWith('Erro') ? '#ef4444' : '#22c55e' }}>{resultImport}</span>}
          </div>

          {/* Abas */}
          <div className="flex gap-2 mb-5">
            <button onClick={() => setAba('vendas')} className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium" style={{ background: aba === 'vendas' ? 'rgba(212,175,55,0.15)' : 'rgba(255,255,255,0.03)', border: `1px solid ${aba === 'vendas' ? 'var(--accent)' : 'var(--border)'}`, color: aba === 'vendas' ? 'var(--accent)' : 'var(--muted-color)' }}><DollarSign size={14} />Vendas</button>
            <button onClick={() => setAba('config')} className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium" style={{ background: aba === 'config' ? 'rgba(212,175,55,0.15)' : 'rgba(255,255,255,0.03)', border: `1px solid ${aba === 'config' ? 'var(--accent)' : 'var(--border)'}`, color: aba === 'config' ? 'var(--accent)' : 'var(--muted-color)' }}><Settings size={14} />Configurar padrão</button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12"><Loader2 size={20} className="animate-spin" style={{ color: 'var(--accent)' }} /></div>
          ) : aba === 'config' ? (
            <div className="rounded-xl p-5 max-w-2xl" style={{ background: 'rgba(0,0,0,0.12)', border: '1px solid var(--border)' }}>
              <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--text)' }}>Comissão padrão por categoria</h3>
              <p className="text-xs mb-4" style={{ color: 'var(--muted-color)' }}>% sobre o crédito. Aplicado automaticamente conforme o plano da venda.</p>
              <div className="space-y-3">
                {CATEGORIAS.map(c => (
                  <div key={c.key} className="flex items-center gap-3 flex-wrap rounded-lg p-3" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)' }}>
                    <div className="flex-1 min-w-[140px]">
                      <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>{c.label}</p>
                      <p className="text-[10px]" style={{ color: 'var(--muted-color)' }}>{c.planos}</p>
                    </div>
                    <div>
                      <label className="block text-[10px] mb-1" style={{ color: 'var(--muted-color)' }}>% Vendedor</label>
                      <input value={catConfig[c.key]?.vend || ''} onChange={(e) => setCatConfig(prev => ({ ...prev, [c.key]: { ...prev[c.key], vend: e.target.value } }))} placeholder="0,5" className="rounded-lg px-2 py-1.5 text-sm outline-none w-24" style={inputStyle} />
                    </div>
                    <div>
                      <label className="block text-[10px] mb-1" style={{ color: 'var(--muted-color)' }}>% Supervisor</label>
                      <input value={catConfig[c.key]?.sup || ''} onChange={(e) => setCatConfig(prev => ({ ...prev, [c.key]: { ...prev[c.key], sup: e.target.value } }))} placeholder="0,2" className="rounded-lg px-2 py-1.5 text-sm outline-none w-24" style={inputStyle} />
                    </div>
                  </div>
                ))}
                <button onClick={salvarConfig} disabled={salvandoConfig} className="w-full flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold disabled:opacity-50 transition-transform hover:scale-105 active:scale-95" style={{ background: 'linear-gradient(135deg, #d4af37 0%, #c9a227 50%, #b8941f 100%)', color: '#0a0a0a' }}>{salvandoConfig ? <Loader2 size={14} className="animate-spin" /> : <><Check size={14} />Salvar comissões por categoria</>}</button>
              </div>
            </div>
          ) : (
            <>
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
                          <th className="p-3 text-right text-xs" style={{ color: 'var(--accent)' }}>Com. Rep.</th>
                          <th className="p-3 text-right text-xs" style={{ color: '#22c55e' }}>Recebido</th>
                          <th className="p-3 text-right text-xs" style={{ color: '#f59e0b' }}>Falta</th>
                          <th className="p-3 text-right text-xs" style={{ color: 'var(--muted-color)' }}>Vend.</th>
                          <th className="p-3 text-right text-xs" style={{ color: 'var(--muted-color)' }}>Superv.</th>
                          <th className="p-3 text-center text-xs" style={{ color: 'var(--muted-color)' }}>Estorno</th>
                        </tr>
                      </thead>
                      <tbody>
                        {vendas.map(v => {
                          const faltaRs = v.comissao_lr - (v.comissao_recebida_rs || 0)
                          const recPct = v.comissao_recebida_percent || 0
                          return (
                            <tr key={v.id} style={{ borderBottom: '1px solid var(--border)', background: selecionadas.has(v.id) ? 'rgba(212,175,55,0.05)' : 'transparent' }}>
                              <td className="p-3"><input type="checkbox" checked={selecionadas.has(v.id)} onChange={() => toggle(v.id)} className="accent-yellow-500" /></td>
                              <td className="p-3" style={{ color: 'var(--text)' }}>{v.cliente}<br /><span className="text-[10px]" style={{ color: 'var(--muted-color)' }}>{v.vendedor}</span></td>
                              <td className="p-3"><span className="font-mono text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(212,175,55,0.12)', color: 'var(--accent)' }}>{v.plano}</span></td>
                              <td className="p-3 text-right" style={{ color: 'var(--text2)' }}>{fmtMoeda(v.credito)}</td>
                              <td className="p-3 text-right font-semibold" style={{ color: 'var(--accent)' }}>{fmtMoeda(v.comissao_lr)}</td>
                              <td className="p-3 text-right" style={{ color: '#22c55e' }}>{fmtMoeda(v.comissao_recebida_rs || 0)}<br /><span className="text-[10px]">{recPct.toFixed(1)}%</span></td>
                              <td className="p-3 text-right" style={{ color: faltaRs > 1 ? '#f59e0b' : '#22c55e' }}>{faltaRs > 1 ? fmtMoeda(faltaRs) : `${'\u2713'} 100%`}</td>
                              <td className="p-3 text-right" style={{ color: 'var(--text2)' }}>{v.percentual_vendedor}%<br /><span className="text-[10px]">{fmtMoeda(v.comissao_vendedor)}</span></td>
                              <td className="p-3 text-right" style={{ color: 'var(--text2)' }}>{v.percentual_supervisor}%<br /><span className="text-[10px]">{fmtMoeda(v.comissao_supervisor)}</span></td>
                              <td className="p-3 text-center">
                                {v.em_risco ? (
                                  <div className="flex flex-col items-center gap-0.5">
                                    <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}>{'\u25cf'} {fmtMoeda(v.valor_estorno)}</span>
                                    <span className="text-[9px]" style={{ color: '#f59e0b' }}>pagar +{v.faltam} p/ não estornar</span>
                                  </div>
                                ) : (
                                  <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e' }}>{'\u2713'} seguro</span>
                                )}
                              </td>
                            </tr>
                          )
                        })}
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
