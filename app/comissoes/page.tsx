'use client'

import { useState, useEffect, useRef } from 'react'
import Sidebar from '@/components/Sidebar'
import Header from '@/components/Header'
import { DollarSign, Loader2, AlertTriangle, Settings, Check, TrendingUp, Lock, Upload, FileText } from 'lucide-react'

interface VendaComissao {
  id: string; cliente: string; vendedor: string; plano: string; adesao: number | null; bem: string; credito: number
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
  const [dataDe, setDataDe] = useState('')
  const [dataAte, setDataAte] = useState('')
  const [filtros, setFiltros] = useState<{ empresas: any[]; equipes: any[]; vendedores: any[] }>({ empresas: [], equipes: [], vendedores: [] })
  const [meuRole, setMeuRole] = useState('')
  const [diaProducao, setDiaProducao] = useState(21)
  const [salvandoProducao, setSalvandoProducao] = useState(false)
  const [fEmpresa, setFEmpresa] = useState('')
  const [fEquipe, setFEquipe] = useState('')
  const [fVendedor, setFVendedor] = useState('')
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
    try { const rp = await fetch('/api/config-producao'); const dp = await rp.json(); if (dp.dia_inicio) setDiaProducao(dp.dia_inicio) } catch {}
    const res = await fetch('/api/comissoes')
    if (res.status === 403) { setSemAcesso(true); setLoading(false); return }
    const data = await res.json()
    if (data.vendas) setVendas(data.vendas)
    if (data.filtros) setFiltros(data.filtros)
    if (data.meu_role) setMeuRole(data.meu_role)
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

  function aplicarProducaoAtual() {
    const hoje = new Date()
    const dia = hoje.getDate()
    let inicio: Date, fim: Date
    if (dia >= diaProducao) {
      // produção começou neste mês
      inicio = new Date(hoje.getFullYear(), hoje.getMonth(), diaProducao)
      fim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, diaProducao - 1)
    } else {
      // produção começou no mês passado
      inicio = new Date(hoje.getFullYear(), hoje.getMonth() - 1, diaProducao)
      fim = new Date(hoje.getFullYear(), hoje.getMonth(), diaProducao - 1)
    }
    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
    setDataDe(iso(inicio)); setDataAte(iso(fim))
  }

  async function salvarDiaProducao(novoDia: number) {
    setSalvandoProducao(true)
    await fetch('/api/config-producao', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dia_inicio: novoDia }) })
    setDiaProducao(novoDia); setSalvandoProducao(false)
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

  const vendasFiltradas = vendas.filter(v => {
    const va = v as any
    if (fEmpresa && va.empresa_id !== fEmpresa) return false
    if (fEquipe && va.equipe_id !== fEquipe) return false
    if (fVendedor && va.vendedor_id !== fVendedor) return false
    if (dataDe || dataAte) {
      const d = va.data_venda ? new Date(va.data_venda) : (va.criado_em ? new Date(va.criado_em) : null)
      if (d) {
        if (dataDe && d < new Date(dataDe + 'T00:00:00')) return false
        if (dataAte && d > new Date(dataAte + 'T23:59:59')) return false
      }
    }
    return true
  })
  const totalLR = vendasFiltradas.reduce((s, v) => s + v.comissao_lr, 0)
  const totalRecebido = vendasFiltradas.reduce((s, v) => s + (v.comissao_recebida_rs || 0), 0)
  const totalFalta = totalLR - totalRecebido
  const emRisco = vendasFiltradas.filter(v => v.em_risco).length
  const totalVendedores = vendasFiltradas.reduce((s, v) => s + (v.comissao_vendedor || 0), 0)
  const totalSupervisores = vendasFiltradas.reduce((s, v) => s + (v.comissao_supervisor || 0), 0)
  // Master: 0,25% sobre toda a produção (crédito) do filtro atual
  const producaoTotal = vendasFiltradas.reduce((s, v) => s + (v.credito || 0), 0)
  const comissaoMaster = producaoTotal * 0.0025
  const liquidoRep = totalLR - totalVendedores - totalSupervisores
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

          {/* Cards de comissão de equipe */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
            <div className="rounded-xl p-4" style={{ background: 'rgba(0,0,0,0.12)', border: '1px solid var(--border)' }}>
              <p className="text-xs mb-1" style={{ color: 'var(--muted-color)' }}>Comissão Vendedores</p>
              <p className="text-xl font-bold" style={{ color: '#3b82f6' }}>{fmtMoeda(totalVendedores)}</p>
            </div>
            <div className="rounded-xl p-4" style={{ background: 'rgba(0,0,0,0.12)', border: '1px solid var(--border)' }}>
              <p className="text-xs mb-1" style={{ color: 'var(--muted-color)' }}>Comissão Supervisores</p>
              <p className="text-xl font-bold" style={{ color: '#a855f7' }}>{fmtMoeda(totalSupervisores)}</p>
            </div>
            {meuRole === 'master' && (
              <div className="rounded-xl p-4" style={{ background: 'linear-gradient(135deg, rgba(212,175,55,0.15) 0%, rgba(212,175,55,0.04) 100%)', border: '1px solid rgba(212,175,55,0.3)' }}>
                <p className="text-xs mb-1" style={{ color: 'var(--muted-color)' }}>Comissão Master (0,25%)</p>
                <p className="text-xl font-bold" style={{ color: 'var(--accent)' }}>{fmtMoeda(comissaoMaster)}</p>
                <p className="text-[10px] mt-0.5" style={{ color: 'var(--muted-color)' }}>sobre {fmtMoeda(producaoTotal)} de produção</p>
              </div>
            )}
            <div className="rounded-xl p-4" style={{ background: 'linear-gradient(135deg, rgba(34,197,94,0.12) 0%, rgba(34,197,94,0.04) 100%)', border: '1px solid rgba(34,197,94,0.25)' }}>
              <p className="text-xs mb-1" style={{ color: 'var(--muted-color)' }}>Líquido Representante</p>
              <p className="text-xl font-bold" style={{ color: '#22c55e' }}>{fmtMoeda(liquidoRep)}</p>
              <p className="text-[10px] mt-0.5" style={{ color: 'var(--muted-color)' }}>após vendedor e supervisor</p>
            </div>
            <div className="rounded-xl p-4" style={{ background: 'rgba(0,0,0,0.12)', border: '1px solid var(--border)' }}>
              <p className="text-xs mb-1" style={{ color: 'var(--muted-color)' }}>Total em Vendas</p>
              <p className="text-xl font-bold" style={{ color: 'var(--text)' }}>{fmtMoeda(producaoTotal)}</p>
              <p className="text-[10px] mt-0.5" style={{ color: 'var(--muted-color)' }}>{vendasFiltradas.length} venda(s)</p>
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

          {/* Filtro por data */}
          <div className="flex items-end gap-2 mb-4 flex-wrap">
            <div>
              <label className="block text-[10px] mb-1" style={{ color: 'var(--muted-color)' }}>De</label>
              <input type="date" value={dataDe} onChange={(e) => setDataDe(e.target.value)} className="rounded-lg px-2 py-1.5 text-xs outline-none" style={inputStyle} />
            </div>
            <div>
              <label className="block text-[10px] mb-1" style={{ color: 'var(--muted-color)' }}>Até</label>
              <input type="date" value={dataAte} onChange={(e) => setDataAte(e.target.value)} className="rounded-lg px-2 py-1.5 text-xs outline-none" style={inputStyle} />
            </div>
            {meuRole === 'master' && (
              <div>
                <label className="block text-[10px] mb-1" style={{ color: 'var(--muted-color)' }}>Empresa</label>
                <select value={fEmpresa} onChange={(e) => { setFEmpresa(e.target.value); setFEquipe(''); setFVendedor('') }} className="rounded-lg px-2 py-1.5 text-xs outline-none" style={inputStyle}>
                  <option value="" style={{ background: '#131313' }}>Todas</option>
                  {filtros.empresas.map(e => <option key={e.id} value={e.id} style={{ background: '#131313' }}>{e.nome}</option>)}
                </select>
              </div>
            )}
            {['master', 'representante', 'adm'].includes(meuRole) && (
              <div>
                <label className="block text-[10px] mb-1" style={{ color: 'var(--muted-color)' }}>Supervisor (equipe)</label>
                <select value={fEquipe} onChange={(e) => { setFEquipe(e.target.value); setFVendedor('') }} className="rounded-lg px-2 py-1.5 text-xs outline-none" style={inputStyle}>
                  <option value="" style={{ background: '#131313' }}>Todas</option>
                  {filtros.equipes.filter(eq => !fEmpresa || eq.empresa_id === fEmpresa).map(eq => <option key={eq.id} value={eq.id} style={{ background: '#131313' }}>{eq.nome}</option>)}
                </select>
              </div>
            )}
            {['master', 'representante', 'adm', 'supervisor'].includes(meuRole) && (
              <div>
                <label className="block text-[10px] mb-1" style={{ color: 'var(--muted-color)' }}>Vendedor</label>
                <select value={fVendedor} onChange={(e) => setFVendedor(e.target.value)} className="rounded-lg px-2 py-1.5 text-xs outline-none" style={inputStyle}>
                  <option value="" style={{ background: '#131313' }}>Todos</option>
                  {filtros.vendedores.filter(vd => (!fEmpresa || vd.empresa_id === fEmpresa) && (!fEquipe || vd.equipe_id === fEquipe)).map(vd => <option key={vd.id} value={vd.id} style={{ background: '#131313' }}>{vd.nome}</option>)}
                </select>
              </div>
            )}
            <button onClick={() => {
              const hoje = new Date()
              const dia = hoje.getDay() // 0 = domingo
              const domingo = new Date(hoje); domingo.setDate(hoje.getDate() - dia)
              const sabado = new Date(domingo); sabado.setDate(domingo.getDate() + 6)
              const iso = (d: Date) => d.toISOString().slice(0, 10)
              setDataDe(iso(domingo)); setDataAte(iso(sabado))
            }} className="rounded-lg px-3 py-1.5 text-xs self-end" style={{ background: 'rgba(59,130,246,0.12)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.3)' }}>Semana</button>
            <button onClick={aplicarProducaoAtual} className="rounded-lg px-3 py-1.5 text-xs self-end" style={{ background: 'rgba(212,175,55,0.12)', color: 'var(--accent)', border: '1px solid rgba(212,175,55,0.3)' }}>Produção atual</button>
            {(dataDe || dataAte || fEmpresa || fEquipe || fVendedor) && <button onClick={() => { setDataDe(''); setDataAte(''); setFEmpresa(''); setFEquipe(''); setFVendedor('') }} className="rounded-lg px-3 py-1.5 text-xs self-end" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--muted-color)', border: '1px solid var(--border)' }}>Limpar</button>}
          </div>

          {/* Abas */}
          <div className="flex gap-2 mb-5">
            <button onClick={() => setAba('vendas')} className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium" style={{ background: aba === 'vendas' ? 'rgba(212,175,55,0.15)' : 'rgba(255,255,255,0.03)', border: `1px solid ${aba === 'vendas' ? 'var(--accent)' : 'var(--border)'}`, color: aba === 'vendas' ? 'var(--accent)' : 'var(--muted-color)' }}><DollarSign size={14} />Vendas</button>
            <button onClick={() => setAba('config')} className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium" style={{ background: aba === 'config' ? 'rgba(212,175,55,0.15)' : 'rgba(255,255,255,0.03)', border: `1px solid ${aba === 'config' ? 'var(--accent)' : 'var(--border)'}`, color: aba === 'config' ? 'var(--accent)' : 'var(--muted-color)' }}><Settings size={14} />Configurar padrão</button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12"><Loader2 size={20} className="animate-spin" style={{ color: 'var(--accent)' }} /></div>
          ) : aba === 'config' ? (
            <>
            {meuRole === 'master' && (
              <div className="rounded-xl p-5 max-w-2xl mb-4" style={{ background: 'rgba(0,0,0,0.12)', border: '1px solid var(--border)' }}>
                <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--text)' }}>Período de produção</h3>
                <p className="text-xs mb-3" style={{ color: 'var(--muted-color)' }}>Dia em que começa o ciclo de produção (vai desse dia até o dia anterior do mês seguinte).</p>
                <div className="flex items-end gap-3 flex-wrap">
                  <div>
                    <label className="block text-xs mb-1" style={{ color: 'var(--muted-color)' }}>Dia de início</label>
                    <input type="number" min="1" max="28" value={diaProducao} onChange={(e) => setDiaProducao(parseInt(e.target.value) || 21)} className="rounded-lg px-3 py-2 text-sm outline-none w-24" style={inputStyle} />
                  </div>
                  <button onClick={() => salvarDiaProducao(diaProducao)} disabled={salvandoProducao} className="rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ background: 'var(--accent)', color: '#0a0a0a' }}>{salvandoProducao ? 'Salvando...' : 'Salvar'}</button>
                  <span className="text-xs self-center" style={{ color: 'var(--muted-color)' }}>Ex: dia {diaProducao} → ciclo {diaProducao} a {diaProducao - 1} do mês seguinte</span>
                </div>
              </div>
            )}
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
            </>
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
                          <th className="p-3 text-left text-xs" style={{ color: 'var(--muted-color)' }}>Adesão</th>
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
                        {vendasFiltradas.map(v => {
                          const faltaRs = v.comissao_lr - (v.comissao_recebida_rs || 0)
                          const recPct = v.comissao_recebida_percent || 0
                          return (
                            <tr key={v.id} style={{ borderBottom: '1px solid var(--border)', background: selecionadas.has(v.id) ? 'rgba(212,175,55,0.05)' : 'transparent' }}>
                              <td className="p-3"><input type="checkbox" checked={selecionadas.has(v.id)} onChange={() => toggle(v.id)} className="accent-yellow-500" /></td>
                              <td className="p-3" style={{ color: 'var(--text)' }}>{v.cliente}<br /><span className="text-[10px]" style={{ color: 'var(--muted-color)' }}>{v.vendedor}</span></td>
                              <td className="p-3"><span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(212,175,55,0.12)', color: 'var(--accent)' }}>{v.adesao != null ? `${v.adesao}%` : '-'}</span><br/><span className="text-[10px]" style={{ color: 'var(--muted-color)' }}>{v.bem}</span></td>
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
