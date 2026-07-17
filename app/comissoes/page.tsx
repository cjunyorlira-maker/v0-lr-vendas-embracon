'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import Sidebar from '@/components/Sidebar'
import Header from '@/components/Header'
import { DollarSign, Loader2, AlertTriangle, Settings, Check, TrendingUp, Lock, Upload, FileText, Calculator, ChevronRight, Download, ChevronUp, ChevronDown, Shield, Clock, Search, BarChart3, CalendarDays } from 'lucide-react'

interface VendaComissao {
  id: string; cliente: string; vendedor: string; plano: string; adesao: number | null; bem: string; credito: number
  comissao_lr: number; comissao_lr_total: number; parcelas_pagas: number; total_parcelas_comissao: number; percentual_vendedor: number; comissao_vendedor: number
  percentual_supervisor: number; comissao_supervisor: number
  comissao_recebida_rs: number; comissao_a_receber_rs?: number; comissao_mapeada_rs?: number; comissao_recebida_percent: number
  em_risco: boolean; valor_estorno: number; faltam: number; pgto_seguranca: number
}

const fmtMoeda = (v: number) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

// Contador animado (count-up 600ms) — anima só na primeira montagem; depois atualiza direto
function ValorContado({ valor, className, style }: { valor: number; className?: string; style?: React.CSSProperties }) {
  const [display, setDisplay] = useState(0)
  const animar = useRef(true)
  useEffect(() => {
    if (!animar.current) { setDisplay(valor); return }
    animar.current = false
    let raf = 0
    const inicio = performance.now(), de = 0, ate = valor, dur = 600
    const tick = (t: number) => {
      const p = Math.min(1, (t - inicio) / dur)
      const eased = 1 - Math.pow(1 - p, 3)
      setDisplay(de + (ate - de) * eased)
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valor])
  return <span className={`tabular-nums ${className || ''}`} style={style}>{fmtMoeda(display)}</span>
}

// KPI compacto da faixa de resumo fixo (altura ~76px) com borda viva opcional
function KpiResumo({ label, valor, cor, icon: Icon, dur, delay, bordaViva }: { label: string; valor: number; cor?: string; icon?: any; dur?: string; delay?: string; bordaViva?: boolean }) {
  const corReal = cor || 'var(--accent)'
  const inner = (
    <div className="rounded-[calc(0.9rem-1.5px)] px-4 py-2.5 flex items-center gap-3 h-full" style={{ minHeight: 76, background: 'rgba(17,18,22,0.94)' }}>
      {Icon && <div className="flex items-center justify-center rounded-lg shrink-0" style={{ width: 36, height: 36, background: `${cor || '#d4af37'}1f`, border: `1px solid ${cor || '#d4af37'}44` }}><Icon size={17} style={{ color: corReal }} /></div>}
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-wide truncate" style={{ color: 'var(--muted-color)' }}>{label}</p>
        <ValorContado valor={valor} className="font-bold leading-tight" style={{ color: corReal, fontSize: 20 }} />
      </div>
    </div>
  )
  if (bordaViva && cor) {
    return <div className="card-borda-viva" style={{ borderRadius: '0.9rem', ['--cor-card' as any]: cor, ['--dur' as any]: dur || '5s', ['--delay' as any]: delay || '0s' }}>{inner}</div>
  }
  return <div className="rounded-[0.9rem]" style={{ border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 8px 24px rgba(0,0,0,0.45)' }}>{inner}</div>
}

// Skeleton de blocos pulsando
function SkeletonComissoes() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton" style={{ height: 96 }} />)}
      </div>
      <div className="skeleton" style={{ height: 40, width: 320 }} />
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton" style={{ height: 52 }} />)}
      </div>
    </div>
  )
}

export default function ComissoesPage() {
  const [vendas, setVendas] = useState<VendaComissao[]>([])
  const [loading, setLoading] = useState(true)
  const [semAcesso, setSemAcesso] = useState(false)
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set())
  const [rankModo, setRankModo] = useState<'pessoa' | 'equipe' | 'empresa'>('pessoa')
  const [aba, setAba] = useState<'vendas' | 'config' | 'mapa' | 'calculo' | 'ranking' | 'seguro' | 'master'>('vendas')
  const [buscaVendas, setBuscaVendas] = useState('')
  const [farolAberto, setFarolAberto] = useState(false)
  const [masterData, setMasterData] = useState<{ cards: any; vendas: any[]; recebimentos: any[] } | null>(null)
  const [loadingMaster, setLoadingMaster] = useState(false)
  const [mFiltroEmpresa, setMFiltroEmpresa] = useState('')
  const [mBusca, setMBusca] = useState('')
  const [mModalAberto, setMModalAberto] = useState(false)
  const [mData, setMData] = useState('')
  const [mValor, setMValor] = useState('')
  const [mObs, setMObs] = useState('')
  const [mSalvando, setMSalvando] = useState(false)
  const [proximaSextaPag, setProximaSextaPag] = useState<string | null>(null)
  const [filaPagamentos, setFilaPagamentos] = useState<{ data: string; total: number }[]>([])
  const [vendasSeguro, setVendasSeguro] = useState<any[]>([])
  const [loadingSeguro, setLoadingSeguro] = useState(false)
  const [mapas, setMapas] = useState<any[]>([])
  const [mapaSel, setMapaSel] = useState<string | null>(null)
  const [mapaDetalhe, setMapaDetalhe] = useState<any>(null)
  const [logoEmpresa, setLogoEmpresa] = useState<string | null>(null)
  const [empresaNome, setEmpresaNome] = useState('')
  const [carregandoMapa, setCarregandoMapa] = useState(false)
  const [planosCalc, setPlanosCalc] = useState<any[]>([])
  const [planoSelCalc, setPlanoSelCalc] = useState<string>('')
  const [creditoCalc, setCreditoCalc] = useState('')
  const [parcelasAntecip, setParcelasAntecip] = useState(0)
  const [planoExpCalc, setPlanoExpCalc] = useState<string | null>(null)
  const [dataDe, setDataDe] = useState('')
  const [dataAte, setDataAte] = useState('')
  const [filtros, setFiltros] = useState<{ empresas: any[]; equipes: any[]; vendedores: any[] }>({ empresas: [], equipes: [], vendedores: [] })
  const [meuRole, setMeuRole] = useState('')
  const [prodInicio, setProdInicio] = useState('')
  const [prodFim, setProdFim] = useState('')
  const [salvandoProducao, setSalvandoProducao] = useState(false)
  const [fEmpresa, setFEmpresa] = useState('')
  const [fEquipe, setFEquipe] = useState('')
  const [fVendedor, setFVendedor] = useState('')
  const [pctVend, setPctVend] = useState('')
  const [pctSup, setPctSup] = useState('')
  const [pctSupProprio, setPctSupProprio] = useState('')
  const [aplicando, setAplicando] = useState(false)
  const [salvandoConfig, setSalvandoConfig] = useState(false)
  const CATEGORIAS = [
    { key: 'imovel_1', label: 'Imóvel 1%', planos: 'EI1, SUE' },
    { key: 'imovel_2', label: 'Imóvel 2%', planos: 'PSE, SEP' },
    { key: 'imovel_parcelinha', label: 'Imóvel Parcelinha', planos: 'TP, TEP' },
    { key: 'auto_1', label: 'Auto 1%', planos: 'ETA' },
    { key: 'auto_2', label: 'Auto 2%', planos: 'PE2' },
    { key: 'pesados_2', label: 'Pesados 2%', planos: 'SP' },
  ]
  const [catConfig, setCatConfig] = useState<Record<string, { vend: string; sup: string; supProprio: string }>>({})
  const [importando, setImportando] = useState(false)
  const [resultImport, setResultImport] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const abasValidas = ['vendas', 'config', 'mapa', 'calculo', 'ranking', 'seguro', 'master']
  function mudarAba(nova: typeof aba) {
    setAba(nova)
    try {
      const url = new URL(window.location.href)
      url.searchParams.set('aba', nova)
      window.history.replaceState(null, '', url.toString())
    } catch {}
  }

  useEffect(() => { loadData() }, [])
  useEffect(() => {
    try {
      const p = new URLSearchParams(window.location.search).get('aba')
      if (p && abasValidas.includes(p)) setAba(p as typeof aba)
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => { if (aba === 'mapa') carregarMapas() }, [aba])
  useEffect(() => { if (aba === 'calculo' && planosCalc.length === 0) {
    fetch('/api/planos').then(r => r.json()).then(d => { if (d.planos) setPlanosCalc(d.planos.filter((p: any) => p.ativo)) })
  } }, [aba])
  useEffect(() => {
    if (aba === 'seguro') {
      setLoadingSeguro(true)
      fetch('/api/comissoes/seguro').then(r => r.json()).then(d => { setVendasSeguro(d.vendas || []); setLoadingSeguro(false) }).catch(() => setLoadingSeguro(false))
    }
  }, [aba])
  useEffect(() => { if (aba === 'master' && meuRole === 'master') carregarMaster() }, [aba, meuRole])

  async function carregarMaster() {
    setLoadingMaster(true)
    try {
      const res = await fetch('/api/comissoes/master')
      if (!res.ok) { setMasterData(null); setLoadingMaster(false); return }
      const data = await res.json()
      setMasterData(data)
    } catch { setMasterData(null) }
    setLoadingMaster(false)
  }

  async function lancarRecebimentoMaster() {
    if (!mData || !mValor) { alert('Informe data e valor'); return }
    setMSalvando(true)
    await fetch('/api/comissoes/master', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acao: 'lancar', data_pagamento: mData, valor: Number(mValor.replace(',', '.')), observacao: mObs || undefined }) })
    setMData(''); setMValor(''); setMObs(''); setMModalAberto(false); setMSalvando(false)
    await carregarMaster()
  }

  async function excluirRecebimentoMaster(id: string) {
    if (!confirm('Excluir este recebimento?')) return
    await fetch('/api/comissoes/master', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acao: 'excluir', id }) })
    await carregarMaster()
  }

  async function loadData(silent = false) {
    if (!silent) setLoading(true)
    try { const rp = await fetch('/api/config-producao'); const dp = await rp.json(); if (dp.data_inicio) setProdInicio(dp.data_inicio); if (dp.data_fim) setProdFim(dp.data_fim) } catch {}
    const res = await fetch('/api/comissoes')
    if (res.status === 403) { setSemAcesso(true); setLoading(false); return }
    const data = await res.json()
    if (data.vendas) setVendas(data.vendas)
    if (typeof data.proxima_sexta_pagamento !== 'undefined') setProximaSextaPag(data.proxima_sexta_pagamento)
    if (data.fila_pagamentos) setFilaPagamentos(data.fila_pagamentos)
    if (data.filtros) setFiltros(data.filtros)
    if (data.meu_role) setMeuRole(data.meu_role)
    if (data.config_categorias) {
      const map: Record<string, { vend: string; sup: string; supProprio: string }> = {}
      for (const c of data.config_categorias) {
        map[c.categoria] = { vend: String(c.percentual_vendedor || ''), sup: String(c.percentual_supervisor || ''), supProprio: String(c.percentual_supervisor_proprio || '') }
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
    if (prodInicio) setDataDe(prodInicio)
    if (prodFim) setDataAte(prodFim)
  }

  async function salvarProducao() {
    if (!prodInicio || !prodFim) { alert('Informe início e fim'); return }
    setSalvandoProducao(true)
    await fetch('/api/config-producao', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data_inicio: prodInicio, data_fim: prodFim }) })
    setSalvandoProducao(false)
  }

  async function aplicar() {
    if (selecionadas.size === 0) { alert('Selecione ao menos uma venda'); return }
    if (!pctVend && !pctSup && !pctSupProprio) { alert('Informe ao menos um percentual'); return }
    setAplicando(true)
    await fetch('/api/comissoes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acao: 'aplicar', venda_ids: Array.from(selecionadas), percentual_vendedor: pctVend || undefined, percentual_supervisor: pctSup || undefined, percentual_supervisor_proprio: pctSupProprio || undefined }) })
    setSelecionadas(new Set()); setPctVend(''); setPctSup(''); setPctSupProprio(''); await loadData(true); setAplicando(false)
  }

  async function salvarConfig() {
    setSalvandoConfig(true)
    const categorias = CATEGORIAS.map(c => ({
      categoria: c.key,
      percentual_vendedor: parseFloat((catConfig[c.key]?.vend || '0').replace(',', '.')) || 0,
      percentual_supervisor: parseFloat((catConfig[c.key]?.sup || '0').replace(',', '.')) || 0,
      percentual_supervisor_proprio: parseFloat((catConfig[c.key]?.supProprio || '0').replace(',', '.')) || 0,
    }))
    await fetch('/api/comissoes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acao: 'salvar_config_categoria', categorias, empresa_id: fEmpresa || undefined }) })
    await loadData(true); setSalvandoConfig(false)
  }

  async function baixarMapaPdf() {
    if (!mapaDetalhe) return
    const { default: jsPDF } = await import('jspdf')
    const autoTable = (await import('jspdf-autotable')).default
    const doc = new jsPDF()
    const pageW = doc.internal.pageSize.getWidth()
    let y = 15

    // logo (se houver)
    if (logoEmpresa) {
      try {
        const img = await fetch(logoEmpresa).then(r => r.blob()).then(b => new Promise<string>((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result as string); fr.readAsDataURL(b) }))
        doc.addImage(img, 'PNG', 14, y, 40, 16, undefined, 'FAST')
      } catch {}
    }
    // título
    doc.setFontSize(14); doc.setTextColor(40)
    doc.text('Mapa de Comissão', pageW - 14, y + 6, { align: 'right' })
    doc.setFontSize(9); doc.setTextColor(120)
    const mapaInfo = mapas.find(m => m.id === mapaSel)
    if (mapaInfo?.data_encerramento) doc.text(`Encerramento: ${new Date(mapaInfo.data_encerramento + 'T00:00:00').toLocaleDateString('pt-BR')}`, pageW - 14, y + 12, { align: 'right' })
    if (empresaNome) doc.text(empresaNome, pageW - 14, y + 17, { align: 'right' })
    y += 26

    // uma linha por cliente
    const body: any[] = mapaClientesFiltrados.map((cl: any) => ([
      cl.cliente,
      String(cl.contrato),
      `${cl.percentualTotal}%`,
      cl.parcelas.join(', '),
      `R$ ${Number(cl.total).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
    ]))

    autoTable(doc, {
      startY: y,
      head: [['Cliente', 'Contrato', '% Total', 'Parcelas', 'Valor']],
      body,
      theme: 'striped',
      headStyles: { fillColor: [201, 162, 39], textColor: 20 },
      styles: { fontSize: 8 },
      columnStyles: { 4: { halign: 'right' } },
    })

    const finalY = (doc as any).lastAutoTable.finalY || y
    doc.setFontSize(12); doc.setTextColor(40)
    doc.text('VALOR TOTAL:', 14, finalY + 10)
    doc.setTextColor(201, 162, 39)
    doc.text(`R$ ${Number(mapaTotalFiltrado).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, pageW - 14, finalY + 10, { align: 'right' })

    doc.save(`mapa-comissao-${mapaInfo?.data_encerramento || 'atual'}.pdf`)
  }

  async function carregarMapas() {
    const res = await fetch('/api/comissoes/mapas')
    const data = await res.json()
    if (data.mapas) setMapas(data.mapas)
    if (data.logo_url) setLogoEmpresa(data.logo_url)
    if (data.empresa_nome) setEmpresaNome(data.empresa_nome)
  }
  async function abrirMapa(mapaId: string) {
    setCarregandoMapa(true); setMapaSel(mapaId)
    const res = await fetch(`/api/comissoes/mapas?mapa_id=${mapaId}`)
    const data = await res.json()
    if (data.detalhe) setMapaDetalhe(data.detalhe)
    if (data.logo_url) setLogoEmpresa(data.logo_url)
    if (data.empresa_nome) setEmpresaNome(data.empresa_nome)
    setCarregandoMapa(false)
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
      await loadData(true)
      if (aba === 'mapa') await carregarMapas()
    } catch { setResultImport('Erro de conexão') }
    setImportando(false)
  }

  const toggleSeguroRecebido = async (vendaId: string, atual: boolean) => {
    setVendasSeguro(prev => prev.map(v => v.id === vendaId ? { ...v, comissao_seguro_recebida: !atual } : v))
    await fetch('/api/comissoes/seguro', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ venda_id: vendaId, recebida: !atual }) })
  }

  const [ordenarPor, setOrdenarPor] = useState<string>('recebido')
  const [ordemAsc, setOrdemAsc] = useState(false)
  function clicarOrdenar(coluna: string) {
    if (ordenarPor === coluna) { setOrdemAsc(!ordemAsc) }
    else { setOrdenarPor(coluna); setOrdemAsc(false) }
  }
  function valorColuna(v: any, col: string): number | string {
    switch (col) {
      case 'cliente': return (v.cliente || '').toLowerCase()
      case 'adesao': return v.adesao || 0
      case 'credito': return v.credito || 0
      case 'garantida': return v.comissao_lr || 0
      case 'recebido': return v.comissao_recebida_rs || 0
      case 'falta': return (v.comissao_lr || 0) - (v.comissao_recebida_rs || 0)
      case 'vendedor': return v.comissao_vendedor || 0
      case 'supervisor': return v.comissao_supervisor || 0
      default: return 0
    }
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
  // Busca rápida (cliente ou contrato/proposta) — filtra SÓ a tabela, sem mexer nos KPIs/fila
  const vendasVisiveis = useMemo(() => {
    const q = buscaVendas.trim().toLowerCase()
    if (!q) return vendasFiltradas
    return vendasFiltradas.filter((v: any) =>
      (v.cliente || '').toLowerCase().includes(q) ||
      String(v.numero_contrato || '').toLowerCase().includes(q) ||
      String(v.numero_proposta || '').toLowerCase().includes(q)
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendasFiltradas, buscaVendas])
  const totalLR = vendasFiltradas.reduce((s, v) => s + v.comissao_lr, 0)
  const totalRecebido = vendasFiltradas.reduce((s, v) => s + (v.comissao_recebida_rs || 0), 0)
  const totalFalta = totalLR - totalRecebido
  const totalProximoPagamento = vendasFiltradas.reduce((s, v) => s + (v.comissao_a_receber_rs || 0), 0)
  const fmtDataPag = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const diasAtePag = (iso: string) => Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000))
  const proximaDataPag = filaPagamentos.length > 0 ? filaPagamentos[0].data : null
  const temFiltro = !!(fEmpresa || fEquipe || fVendedor || dataDe || dataAte)
  const filaExibida = useMemo(() => {
    if (!temFiltro) return filaPagamentos
    const porData: Record<string, number> = {}
    vendasFiltradas.forEach((v: any) => {
      Object.entries(v.a_receber_por_data || {}).forEach(([data, val]) => {
        porData[data] = (porData[data] || 0) + (val as number)
      })
    })
    return Object.entries(porData).map(([data, total]) => ({ data, total })).sort((a, b) => a.data.localeCompare(b.data))
  }, [temFiltro, filaPagamentos, vendasFiltradas])
  // (b) prévia: efetivadas cuja comissão garantida ainda supera o que já veio nos borderôs
  const previaProximoBordero = useMemo(() => {
    const lista = vendasFiltradas.filter((v: any) =>
      v.boleto_status === 'efetivado' && ((v.comissao_lr || 0) - (v.comissao_mapeada_rs || 0)) > 1
    )
    return {
      total: lista.reduce((s: number, v: any) => s + ((v.comissao_lr || 0) - (v.comissao_mapeada_rs || 0)), 0),
      qtd: lista.length,
    }
  }, [vendasFiltradas])
  const emRisco = vendasFiltradas.filter(v => v.em_risco).length
  // Farol de estornos: vendas em risco ordenadas das mais próximas de estornar (menos parcelas faltando)
  const listaEmRisco = [...vendasFiltradas]
    .filter(v => v.em_risco)
    .sort((a, b) => (a.faltam - b.faltam) || (b.valor_estorno - a.valor_estorno))
  const totalVendedores = vendasFiltradas.reduce((s, v: any) => s + (v.venda_propria_supervisor ? 0 : (v.comissao_vendedor || 0)), 0)
  const totalSupervisores = vendasFiltradas.reduce((s, v) => s + (v.comissao_supervisor || 0), 0)
  const totalSupervisorPropria = vendasFiltradas.reduce((s, v: any) => s + (v.comissao_supervisor_propria || 0), 0)
  // Master: 0,25% sobre toda a produção (crédito) do filtro atual
  const producaoTotal = vendasFiltradas.reduce((s, v) => s + (v.credito || 0), 0)
  const liquidoRep = totalLR - totalVendedores - totalSupervisores - totalSupervisorPropria
  // Recebido por semana (últimas 8): agrupa os mapas pela sexta de pagamento (Embracon paga sexta da semana seguinte ao encerramento)
  const recebidoPorSemana = useMemo(() => {
    const sextaPag = (dataEnc: string) => {
      const d = new Date(dataEnc + 'T00:00:00')
      const dow = d.getDay() === 0 ? 7 : d.getDay()
      const proxSeg = new Date(d); proxSeg.setDate(d.getDate() + (8 - dow))
      const sexta = new Date(proxSeg); sexta.setDate(proxSeg.getDate() + 4)
      return sexta
    }
    const porSemana = new Map<string, number>()
    for (const m of mapas as any[]) {
      if (!m.data_encerramento) continue
      const s = sextaPag(m.data_encerramento)
      const chave = s.toISOString().slice(0, 10)
      porSemana.set(chave, (porSemana.get(chave) || 0) + (m.total_comissao || 0))
    }
    return Array.from(porSemana.entries())
      .map(([data, total]) => ({ data, total }))
      .sort((a, b) => a.data.localeCompare(b.data))
      .slice(-8)
  }, [mapas])
  const maxSemana = Math.max(1, ...recebidoPorSemana.map(s => s.total))
  // helpers de papel
  const ehGestao = ['master', 'representante'].includes(meuRole)
  const ehAdm = meuRole === 'adm'
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

  const mapaClientesFiltrados = mapaDetalhe?.clientes ? mapaDetalhe.clientes.filter((cl: any) => !fEmpresa || cl.empresa_id === fEmpresa) : []
  const mapaTotalFiltrado = mapaClientesFiltrados.reduce((s: number, c: any) => s + (c.total || 0), 0)
  const mapaNaoCasadas = mapaClientesFiltrados.filter((c: any) => c.casada === false)
  const mapaNaoCasadasTotal = mapaNaoCasadas.reduce((s: number, c: any) => s + (c.total || 0), 0)
  const mapaEstornosTotal = mapaClientesFiltrados.reduce((s: number, c: any) => s + ((c.total || 0) < 0 ? c.total : 0), 0)

  // Prévia Próxima Semana: vendas com boleto efetivado até a quinta desta semana,
  // contando o que ainda falta receber (comissão total do plano − já recebido no mapa)
  const previaProximaSemana = (() => {
    const hoje = new Date()
    const diaSemana = hoje.getDay()
    const diasAteQuinta = (4 - diaSemana + 7) % 7
    const quinta = new Date(hoje); quinta.setDate(hoje.getDate() + diasAteQuinta); quinta.setHours(23, 59, 59, 999)
    const limite = (diaSemana > 4 || diaSemana === 0) ? new Date(quinta.getTime() + 7 * 86400000) : quinta
    return vendasFiltradas.reduce((soma: number, v: any) => {
      if (v.boleto_status !== 'efetivado' || !v.boleto_data_efetivado) return soma
      if (new Date(v.boleto_data_efetivado) > limite) return soma
      const falta = (v.comissao_lr_total || 0) - (v.comissao_mapeada_rs ?? v.comissao_recebida_rs ?? 0)
      return soma + (falta > 0 ? falta : 0)
    }, 0)
  })()

  // Ranking de Faturamento: agrupa a comissão GERADA usando vendasFiltradas (o que já está na tela)
  const nomeEmpresa = (id: string) => filtros.empresas.find((e: any) => e.id === id)?.nome || 'Sem empresa'
  const nomeEquipe = (id: string) => filtros.equipes.find((e: any) => e.id === id)?.nome || 'Sem equipe'
  const rankingFaturamento = (() => {
    const mapa = new Map<string, { nome: string; valor: number; qtd: number }>()
    for (const v of vendasFiltradas as any[]) {
      let chave = '', nome = '', ganho = 0
      if (rankModo === 'pessoa') {
        chave = v.vendedor_id || 'sem'; nome = v.vendedor || 'Sem vendedor'
        ganho = v.comissao_vendedor || 0
      } else if (rankModo === 'equipe') {
        chave = v.equipe_id || 'sem'; nome = nomeEquipe(v.equipe_id)
        ganho = (v.comissao_vendedor || 0) + (v.comissao_supervisor || 0)
      } else {
        chave = v.empresa_id || 'sem'; nome = nomeEmpresa(v.empresa_id)
        ganho = v.comissao_lr || 0
      }
      if (!mapa.has(chave)) mapa.set(chave, { nome, valor: 0, qtd: 0 })
      const it = mapa.get(chave)!; it.valor += ganho; it.qtd += 1
    }
    return Array.from(mapa.values()).sort((a, b) => b.valor - a.valor)
  })()

  return (
    <div className="relative min-h-screen font-sans">
      <Sidebar />
      <div className="relative lg:ml-60" style={{ zIndex: 1 }}>
        <Header title="Comissões" />
        <main className="mx-auto max-w-[1400px] px-6 py-8 lg:px-8">
          {/* RESUMO FIXO — sempre visível acima das abas (faixa compacta ~76px) */}
          {ehGestao && !loading && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <KpiResumo label="Comissão Rep. (total)" valor={totalLR} cor="#d4af37" icon={TrendingUp} bordaViva dur="5.2s" delay="0s" />
            <KpiResumo label="Já recebido" valor={totalRecebido} cor="#22c55e" icon={Check} bordaViva dur="4.6s" delay="-1.3s" />
            <KpiResumo label="A receber" valor={totalFalta} cor="#3b82f6" icon={Clock} bordaViva dur="5s" delay="-2.6s" />
            <KpiResumo label="Total em Vendas" valor={producaoTotal} icon={DollarSign} />
          </div>
          )}

          {/* Importar mapa */}
          <input ref={fileRef} type="file" accept="application/pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) importarMapa(f) }} />
          {ehGestao && (
          <div className="flex items-center gap-3 mb-5 flex-wrap">
            <button onClick={() => fileRef.current?.click()} disabled={importando} className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50 transition-transform hover:scale-105 active:scale-95" style={{ background: 'rgba(59,130,246,0.15)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.3)' }}>
              {importando ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}{importando ? 'Importando...' : 'Importar mapa de comissão (PDF)'}
            </button>
            {resultImport && <span className="text-xs" style={{ color: resultImport.startsWith('Erro') ? '#ef4444' : '#22c55e' }}>{resultImport}</span>}
          </div>
          )}

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
            {filtros.empresas.length > 0 && (
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
                <label className="block text-[10px] mb-1" style={{ color: 'var(--muted-color)' }}>Equipe</label>
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
          <div className="flex gap-2 mb-5 flex-wrap">
            <button onClick={() => mudarAba('vendas')} className={`tab-btn ${aba === 'vendas' ? 'ativo' : ''}`}><DollarSign size={14} />Vendas</button>
            {ehGestao && (<>
            <button onClick={() => mudarAba('mapa')} className={`tab-btn ${aba === 'mapa' ? 'ativo' : ''}`}><FileText size={14} />Mapa de Comissão</button>
            <button onClick={() => mudarAba('calculo')} className={`tab-btn ${aba === 'calculo' ? 'ativo' : ''}`}><Calculator size={14} />Cálculo de Comissão</button>
            <button onClick={() => mudarAba('config')} className={`tab-btn ${aba === 'config' ? 'ativo' : ''}`}><Settings size={14} />Configurar padrão</button>
            <button onClick={() => mudarAba('ranking')} className={`tab-btn ${aba === 'ranking' ? 'ativo' : ''}`}><TrendingUp size={14} />Ranking de Faturamento</button>
            <button onClick={() => mudarAba('seguro')} className={`tab-btn ${aba === 'seguro' ? 'ativo' : ''}`}><Shield size={14} />Seguro</button>
            </>)}
            {meuRole === 'master' && (
              <button onClick={() => mudarAba('master')} className={`tab-btn ${aba === 'master' ? 'ativo' : ''}`}><Lock size={14} />Master</button>
            )}
          </div>

          {loading ? (
            <SkeletonComissoes />
          ) : (
          <div key={aba} className="tab-fade">
          {aba === 'mapa' ? (
            <div>
              {!mapaSel ? (
                <div className="space-y-2">
                  {/* (e) MINIGRÁFICO: recebido por semana (últimas 8 sextas de pagamento) */}
                  {recebidoPorSemana.length > 0 && (
                    <div className="rounded-2xl p-5 mb-4" style={{ background: 'rgba(17,18,22,0.92)', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 8px 24px rgba(0,0,0,0.45)' }}>
                      <div className="flex items-center gap-2 mb-4"><BarChart3 size={15} style={{ color: 'var(--accent)' }} /><p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted-color)' }}>Recebido por semana</p></div>
                      <div className="flex items-end justify-between gap-2" style={{ height: 120 }}>
                        {recebidoPorSemana.map((s, i) => {
                          const pct = Math.max(6, (s.total / maxSemana) * 100)
                          const ultimo = i === recebidoPorSemana.length - 1
                          return (
                            <div key={s.data} className="flex-1 flex flex-col items-center justify-end gap-1.5 h-full">
                              <span className="text-[9px] tabular-nums whitespace-nowrap" style={{ color: ultimo ? 'var(--accent)' : 'var(--muted-color)' }}>{fmtMoeda(s.total)}</span>
                              <div className="w-full rounded-t-md anim-bar-grow" style={{ height: `${pct}%`, background: ultimo ? 'linear-gradient(180deg, #d4af37, #b8941f)' : 'rgba(212,175,55,0.35)', animationDelay: `${i * 60}ms` }} />
                              <span className="text-[9px] tabular-nums" style={{ color: 'var(--muted-color)' }}>{new Date(s.data + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                  <p className="text-sm mb-3" style={{ color: 'var(--muted-color)' }}>Mapas de comissão importados. Clique para ver e baixar.</p>
                  {mapas.length === 0 ? <p className="text-xs py-8 text-center" style={{ color: 'var(--muted-color)' }}>Nenhum mapa importado ainda. Importe no botão acima.</p> : mapas.map(m => (
                    <div key={m.id} onClick={() => abrirMapa(m.id)} className="flex items-center justify-between rounded-xl p-4 cursor-pointer" style={{ background: 'rgba(0,0,0,0.12)', border: '1px solid var(--border)' }}>
                      <div>
                        <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Mapa de {m.data_encerramento ? new Date(m.data_encerramento + 'T00:00:00').toLocaleDateString('pt-BR') : '-'}</p>
                        <p className="text-xs" style={{ color: 'var(--muted-color)' }}>{m.total_contratos} contratos · {fmtMoeda(m.total_comissao)}</p>
                      </div>
                      <ChevronRight size={16} style={{ color: 'var(--muted-color)' }} />
                    </div>
                  ))}
                </div>
              ) : carregandoMapa ? (
                <div className="flex justify-center py-12"><Loader2 size={20} className="animate-spin" style={{ color: 'var(--accent)' }} /></div>
              ) : (
                <div>
                  <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                    <button onClick={() => { setMapaSel(null); setMapaDetalhe(null) }} className="text-xs" style={{ color: 'var(--accent)' }}>← Voltar aos mapas</button>
                    <button onClick={baixarMapaPdf} className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold" style={{ background: 'var(--accent)', color: '#0a0a0a' }}><Download size={14} />Baixar PDF</button>
                  </div>
                  <div id="mapa-conteudo" className="rounded-xl p-5" style={{ background: 'rgba(0,0,0,0.12)', border: '1px solid var(--border)' }}>
                    <table className="w-full text-xs">
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border)' }}>
                          <th className="p-2 text-left" style={{ color: 'var(--muted-color)' }}>Cliente</th>
                          <th className="p-2 text-left" style={{ color: 'var(--muted-color)' }}>Contrato</th>
                          <th className="p-2 text-center" style={{ color: 'var(--muted-color)' }}>% Total</th>
                          <th className="p-2 text-left" style={{ color: 'var(--muted-color)' }}>Parcelas</th>
                          <th className="p-2 text-right" style={{ color: 'var(--muted-color)' }}>Valor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...mapaClientesFiltrados].sort((a, b) => (a.casada === b.casada ? 0 : a.casada ? 1 : -1)).map((cl: any, i: number) => (
                          <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', ...(cl.casada === false ? { background: 'rgba(245,158,11,0.08)', borderLeft: '1px solid rgba(245,158,11,0.4)', borderRight: '1px solid rgba(245,158,11,0.4)' } : {}) }}>
                            <td className="p-2 font-medium" style={{ color: cl.casada === false ? '#f59e0b' : 'var(--text)' }}>
                              <span className="inline-flex items-center gap-2">
                                {cl.casada === false ? `⚠️ Sem venda no sistema · Grupo ${cl.grupo || '-'} · Cota ${cl.cota || '-'} · Contrato ${cl.contrato}` : cl.cliente}
                                {cl.estorno && <span style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444', borderRadius: 999, padding: '2px 8px', fontSize: 10, fontWeight: 700 }}>ESTORNO</span>}
                              </span>
                            </td>
                            <td className="p-2" style={{ color: cl.casada === false ? '#f59e0b' : 'var(--muted-color)' }}>{cl.contrato}</td>
                            <td className="p-2 text-center" style={{ color: 'var(--text2)' }}>{cl.percentualTotal}%</td>
                            <td className="p-2" style={{ color: 'var(--muted-color)' }}>{cl.parcelas.join(', ')}</td>
                            <td className="p-2 text-right font-semibold" style={{ color: cl.total < 0 ? '#ef4444' : '#22c55e', fontWeight: cl.total < 0 ? 700 : 600 }}>{fmtMoeda(cl.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {(mapaNaoCasadas.length > 0 || mapaEstornosTotal < 0) && (
                      <div className="flex flex-col gap-1 pt-3 mt-2 text-xs" style={{ borderTop: '1px solid var(--border)' }}>
                        {mapaNaoCasadas.length > 0 && (
                          <div className="flex justify-between"><span style={{ color: '#f59e0b' }}>Não casadas: {mapaNaoCasadas.length} contrato(s)</span><span style={{ color: '#f59e0b' }}>{fmtMoeda(mapaNaoCasadasTotal)}</span></div>
                        )}
                        {mapaEstornosTotal < 0 && (
                          <div className="flex justify-between"><span style={{ color: '#ef4444' }}>Estornos</span><span style={{ color: '#ef4444', fontWeight: 700 }}>{fmtMoeda(mapaEstornosTotal)}</span></div>
                        )}
                      </div>
                    )}
                    <div className="flex justify-between pt-3 mt-2 text-base font-bold" style={{ borderTop: '1px solid var(--border)' }}>
                      <span style={{ color: 'var(--text)' }}>Total líquido do mapa</span>
                      <span style={{ color: 'var(--accent)' }}>{fmtMoeda(mapaTotalFiltrado)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : aba === 'calculo' ? (
            <div className="space-y-3">
              <p className="text-sm mb-2" style={{ color: 'var(--muted-color)' }}>Comiss��o do representante por plano. Clique para expandir e simular antecipação.</p>
              {planosCalc.length === 0 ? (
                <div className="flex justify-center py-12"><Loader2 size={20} className="animate-spin" style={{ color: 'var(--accent)' }} /></div>
              ) : planosCalc.map(p => {
                const aberto = planoExpCalc === p.id
                const parcelas: number[] = Array.isArray(p.comissao_parcelas) ? p.comissao_parcelas : []
                const totalPct = p.comissao_total || parcelas.reduce((s: number, x: number) => s + x, 0)
                return (
                  <div key={p.id} className="rounded-xl overflow-hidden" style={{ background: 'rgba(0,0,0,0.12)', backdropFilter: 'blur(4px)', border: '1px solid var(--border)' }}>
                    <div className="flex items-center justify-between p-4 cursor-pointer" onClick={() => { setPlanoExpCalc(aberto ? null : p.id); setParcelasAntecip(0) }}>
                      <div className="flex items-center gap-3 flex-wrap">
                        {(() => {
                          const cor = p.bem === 'Imóvel' ? '#3b82f6' : p.bem === 'Pesados' ? '#f97316' : '#22c55e'
                          return <span className="text-xs font-bold px-2.5 py-1 rounded-lg" style={{ background: `${cor}20`, color: cor, border: `1px solid ${cor}40` }}>{p.bem} {p.adesao_percent}%</span>
                        })()}
                        <span className="font-mono text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--muted-color)' }}>{p.sigla}</span>
                        <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>{p.nome_completo}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(212,175,55,0.12)', color: 'var(--accent)' }}>Comissão {totalPct}%</span>
                      </div>
                      {aberto ? <ChevronUp size={16} style={{ color: 'var(--muted-color)' }} /> : <ChevronDown size={16} style={{ color: 'var(--muted-color)' }} />}
                    </div>
                    {aberto && (
                      <div className="px-4 pb-4" style={{ borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs mb-4">
                          <div><p className="text-[10px] uppercase tracking-wide mb-0.5" style={{ color: 'var(--muted-color)' }}>Comissão total</p><p className="text-sm font-medium" style={{ color: '#22c55e' }}>{totalPct}% em {parcelas.length}x</p></div>
                          <div><p className="text-[10px] uppercase tracking-wide mb-0.5" style={{ color: 'var(--muted-color)' }}>Parcelas</p><p className="text-sm font-medium" style={{ color: 'var(--text2)' }}>{parcelas.map((x: number) => x + '%').join(' / ')}</p></div>
                          {p.estorno_ate_pgto && <div><p className="text-[10px] uppercase tracking-wide mb-0.5" style={{ color: 'var(--muted-color)' }}>Estorno</p><p className="text-sm font-medium" style={{ color: '#ef4444' }}>{p.estorno_percent}% até {p.estorno_ate_pgto}º pgto</p></div>}
                        </div>
                        <div className="rounded-lg p-3" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)' }}>
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="text-xs" style={{ color: 'var(--muted-color)' }}>Crédito:</span>
                            <input value={creditoCalc} onChange={(e) => { const num = e.target.value.replace(/\D/g, ''); setCreditoCalc(num ? (parseInt(num) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '') }} placeholder="200.000,00" className="rounded-lg px-2 py-1 text-xs outline-none w-32" style={inputStyle} />
                            <span className="text-[10px]" style={{ color: 'var(--muted-color)' }}>Faixa: {fmtMoeda(p.faixa_credito_min)} a {fmtMoeda(p.faixa_credito_max)}</span>
                          </div>
                          {(() => {
                            const c = parseFloat(creditoCalc.replace(/\./g, '').replace(',', '.')) || 0
                            if (c > 0 && (c < p.faixa_credito_min || c > p.faixa_credito_max)) {
                              return <p className="text-[10px] mb-2" style={{ color: '#f59e0b' }}>Fora da faixa deste plano ({fmtMoeda(p.faixa_credito_min)} a {fmtMoeda(p.faixa_credito_max)})</p>
                            }
                            return null
                          })()}
                          <label className="block text-xs mb-2" style={{ color: 'var(--muted-color)' }}>Antecipou quantas parcelas?</label>
                          <div className="flex items-center gap-2 flex-wrap mb-3">
                            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].slice(0, parcelas.length + 1).map(n => (
                              <button key={n} onClick={() => setParcelasAntecip(n)} className="rounded-lg px-3 py-1.5 text-xs font-medium" style={{ background: parcelasAntecip === n ? 'rgba(212,175,55,0.2)' : 'rgba(255,255,255,0.03)', border: `1px solid ${parcelasAntecip === n ? 'var(--accent)' : 'var(--border)'}`, color: parcelasAntecip === n ? 'var(--accent)' : 'var(--muted-color)' }}>{n === 0 ? 'Tudo' : n}</button>
                            ))}
                          </div>
                          {(() => {
                            const credito = parseFloat(creditoCalc.replace(/\./g, '').replace(',', '.')) || 0
                            const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                            // a comissão total (4%, 4,5%) é a verdade. As parcelas dão o peso de cada recebimento.
                            const somaParcelas = parcelas.reduce((s: number, x: number) => s + x, 0) || 1
                            const qtd = parcelasAntecip > 0 ? Math.min(parcelasAntecip, parcelas.length) : parcelas.length
                            const pesoRecebido = parcelas.slice(0, qtd).reduce((s: number, x: number) => s + x, 0)
                            // normaliza: a fração do total proporcional ao peso das parcelas antecipadas
                            const pctReceb = (pesoRecebido / somaParcelas) * totalPct
                            const valReceb = credito * pctReceb / 100
                            return (
                              <div className="flex items-center justify-between">
                                <span className="text-xs" style={{ color: 'var(--text2)' }}>{parcelasAntecip > 0 ? `Recebe ${pctReceb.toFixed(2)}% (parcelas 1 a ${qtd})` : `Recebe tudo: ${totalPct}%`}</span>
                                <span className="text-base font-bold" style={{ color: '#22c55e' }}>{fmt(valReceb)}</span>
                              </div>
                            )
                          })()}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ) : aba === 'ranking' ? (
            <div>
              <div className="flex gap-2 mb-4 flex-wrap">
                <button onClick={() => setRankModo('pessoa')} className="rounded-lg px-3 py-1.5 text-xs font-medium" style={{ background: rankModo === 'pessoa' ? 'rgba(212,175,55,0.15)' : 'rgba(255,255,255,0.03)', border: `1px solid ${rankModo === 'pessoa' ? 'var(--accent)' : 'var(--border)'}`, color: rankModo === 'pessoa' ? 'var(--accent)' : 'var(--muted-color)' }}>Por Pessoa</button>
                <button onClick={() => setRankModo('equipe')} className="rounded-lg px-3 py-1.5 text-xs font-medium" style={{ background: rankModo === 'equipe' ? 'rgba(212,175,55,0.15)' : 'rgba(255,255,255,0.03)', border: `1px solid ${rankModo === 'equipe' ? 'var(--accent)' : 'var(--border)'}`, color: rankModo === 'equipe' ? 'var(--accent)' : 'var(--muted-color)' }}>Por Equipe</button>
                {meuRole === 'master' && <button onClick={() => setRankModo('empresa')} className="rounded-lg px-3 py-1.5 text-xs font-medium" style={{ background: rankModo === 'empresa' ? 'rgba(212,175,55,0.15)' : 'rgba(255,255,255,0.03)', border: `1px solid ${rankModo === 'empresa' ? 'var(--accent)' : 'var(--border)'}`, color: rankModo === 'empresa' ? 'var(--accent)' : 'var(--muted-color)' }}>Por Empresa</button>}
              </div>
              <div className="space-y-2">
                {rankingFaturamento.map((r, i) => (
                  <div key={i} className="flex items-center justify-between rounded-xl p-3" style={{ background: 'rgba(0,0,0,0.12)', backdropFilter: 'blur(4px)', border: '1px solid var(--border)' }}>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-bold w-7 text-center" style={{ color: i === 0 ? '#f59e0b' : i === 1 ? '#a3a3a3' : i === 2 ? '#cd7f32' : 'var(--muted-color)' }}>{i + 1}º</span>
                      <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>{r.nome}</span>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold" style={{ color: '#22c55e' }}>{fmtMoeda(r.valor)}</p>
                      <p className="text-[10px]" style={{ color: 'var(--muted-color)' }}>{r.qtd} venda(s)</p>
                    </div>
                  </div>
                ))}
                {rankingFaturamento.length === 0 && <p className="text-sm text-center py-8" style={{ color: 'var(--muted-color)' }}>Nenhuma venda no período.</p>}
              </div>
            </div>
          ) : aba === 'seguro' ? (
            <div className="rounded-xl p-4" style={{ background: 'rgba(0,0,0,0.12)', border: '1px solid var(--border)' }}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Comissão de Seguro (0,30%)</h3>
                <div className="text-xs" style={{ color: 'var(--muted-color)' }}>
                  Recebido: {fmtMoeda(vendasSeguro.filter(v => v.comissao_seguro_recebida).reduce((s, v) => s + (v.valor_credito * 0.003), 0))} / Total: {fmtMoeda(vendasSeguro.reduce((s, v) => s + (v.valor_credito * 0.003), 0))}
                </div>
              </div>
              {loadingSeguro ? <p className="text-sm" style={{ color: 'var(--muted-color)' }}>Carregando...</p> : vendasSeguro.length === 0 ? <p className="text-sm" style={{ color: 'var(--muted-color)' }}>Nenhuma venda com seguro.</p> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr style={{ borderBottom: '1px solid var(--border)' }}>
                      <th className="p-2 text-left" style={{ color: 'var(--muted-color)' }}>Cliente</th>
                      <th className="p-2 text-left" style={{ color: 'var(--muted-color)' }}>Grupo/Cota</th>
                      <th className="p-2 text-right" style={{ color: 'var(--muted-color)' }}>Crédito</th>
                      <th className="p-2 text-right" style={{ color: 'var(--muted-color)' }}>Comissão (0,30%)</th>
                      <th className="p-2 text-center" style={{ color: 'var(--muted-color)' }}>Recebido</th>
                    </tr></thead>
                    <tbody>
                      {vendasSeguro.map(v => (
                        <tr key={v.id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td className="p-2" style={{ color: 'var(--text)' }}>{v.cliente_nome || '-'}</td>
                          <td className="p-2" style={{ color: 'var(--text2)' }}>{v.grupo}/{v.cota}</td>
                          <td className="p-2 text-right" style={{ color: 'var(--text2)' }}>{fmtMoeda(v.valor_credito)}</td>
                          <td className="p-2 text-right font-semibold" style={{ color: 'var(--accent)' }}>{fmtMoeda(v.valor_credito * 0.003)}</td>
                          <td className="p-2 text-center">
                            <button onClick={() => toggleSeguroRecebido(v.id, v.comissao_seguro_recebida)} className="rounded-md px-3 py-1 text-xs font-medium transition-colors" style={{ background: v.comissao_seguro_recebida ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.05)', border: `1px solid ${v.comissao_seguro_recebida ? '#22c55e' : 'var(--border)'}`, color: v.comissao_seguro_recebida ? '#22c55e' : 'var(--muted-color)' }}>{v.comissao_seguro_recebida ? `${'\u2713'} Recebido` : 'Pendente'}</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : aba === 'master' ? (
            meuRole !== 'master' ? null : loadingMaster ? (
              <div className="flex items-center justify-center py-12"><Loader2 size={20} className="animate-spin" style={{ color: 'var(--accent)' }} /></div>
            ) : !masterData ? (
              <p className="text-sm" style={{ color: 'var(--muted-color)' }}>Não foi possível carregar os dados.</p>
            ) : (() => {
              const empresasMaster = Array.from(new Map((masterData.vendas || []).map((v: any) => [v.empresa_id, v.empresa])).entries()).filter(([id]) => id)
              const b = mBusca.trim().toLowerCase()
              const vendasMaster = (masterData.vendas || [])
                .filter((v: any) => !mFiltroEmpresa || v.empresa_id === mFiltroEmpresa)
                .filter((v: any) => !b || (v.cliente || '').toLowerCase().includes(b) || String(v.contrato || '').toLowerCase().includes(b))
                .sort((x: any, y: any) => (y.valor_pendente || 0) - (x.valor_pendente || 0))
              return (
                <div>
                  {/* 4 cards */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    <div className="rounded-2xl p-5" style={{ background: 'rgba(17,18,22,0.92)', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 8px 24px rgba(0,0,0,0.45)' }}>
                      <p className="text-xs mb-1.5" style={{ color: 'var(--muted-color)' }}>Devido (borderôs × 0,25%÷8)</p>
                      <p className="text-2xl font-bold" style={{ color: 'var(--text)' }}>{fmtMoeda(masterData.cards?.devido_total || 0)}</p>
                    </div>
                    <div className="rounded-2xl p-5" style={{ background: 'linear-gradient(135deg, rgba(34,197,94,0.14), rgba(17,18,22,0.94))', border: '1px solid rgba(34,197,94,0.3)', boxShadow: '0 8px 24px rgba(0,0,0,0.45)' }}>
                      <p className="text-xs mb-1.5" style={{ color: 'var(--muted-color)' }}>Recebido</p>
                      <p className="text-2xl font-bold" style={{ color: '#22c55e' }}>{fmtMoeda(masterData.cards?.recebido_total || 0)}</p>
                    </div>
                    <div className="rounded-2xl p-5" style={{ background: 'linear-gradient(135deg, rgba(212,175,55,0.16), rgba(17,18,22,0.94))', border: '1px solid rgba(212,175,55,0.35)', boxShadow: '0 8px 24px rgba(0,0,0,0.45)' }}>
                      <p className="text-xs mb-1.5" style={{ color: 'var(--muted-color)' }}>A RECEBER</p>
                      <p className="text-2xl font-bold" style={{ color: 'var(--accent)' }}>{fmtMoeda(masterData.cards?.a_receber || 0)}</p>
                    </div>
                    <div className="rounded-2xl p-5" style={{ background: 'linear-gradient(135deg, rgba(59,130,246,0.14), rgba(17,18,22,0.94))', border: '1px solid rgba(59,130,246,0.3)', boxShadow: '0 8px 24px rgba(0,0,0,0.45)' }}>
                      <p className="text-xs mb-1.5" style={{ color: 'var(--muted-color)' }}>A vencer (garantido)</p>
                      <p className="text-2xl font-bold" style={{ color: '#3b82f6' }}>{fmtMoeda(masterData.cards?.a_vencer_garantido || 0)}</p>
                      <p className="text-[10px] mt-1" style={{ color: 'var(--muted-color)' }}>parcelas pagas pelo cliente aguardando borderô</p>
                    </div>
                  </div>

                  {/* Lançar recebimento + filtros */}
                  <div className="flex items-end gap-2 mb-4 flex-wrap">
                    <button onClick={() => { setMData(new Date().toISOString().slice(0, 10)); setMModalAberto(true) }} className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-transform hover:scale-105 active:scale-95" style={{ background: 'rgba(212,175,55,0.15)', color: 'var(--accent)', border: '1px solid rgba(212,175,55,0.35)' }}>+ Lançar recebimento</button>
                    <div className="flex-1" />
                    <select value={mFiltroEmpresa} onChange={(e) => setMFiltroEmpresa(e.target.value)} className="rounded-lg px-2 py-2 text-xs outline-none" style={inputStyle}>
                      <option value="">Todas as empresas</option>
                      {empresasMaster.map(([id, nome]) => <option key={id as string} value={id as string}>{nome as string}</option>)}
                    </select>
                    <input value={mBusca} onChange={(e) => setMBusca(e.target.value)} placeholder="Buscar cliente ou contrato..." className="rounded-lg px-3 py-2 text-xs outline-none" style={{ ...inputStyle, minWidth: 200 }} />
                  </div>

                  {/* Lista de recebimentos lançados */}
                  {(masterData.recebimentos || []).length > 0 && (
                    <div className="rounded-xl p-4 mb-5" style={{ background: 'rgba(0,0,0,0.12)', border: '1px solid var(--border)' }}>
                      <h3 className="text-xs font-semibold mb-2" style={{ color: 'var(--muted-color)' }}>Recebimentos lançados</h3>
                      <div className="flex flex-col gap-1.5">
                        {(masterData.recebimentos || []).map((r: any) => (
                          <div key={r.id} className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 flex-wrap" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)' }}>
                            <div className="flex items-center gap-2 text-xs flex-wrap min-w-0">
                              <span className="font-medium" style={{ color: 'var(--text)' }}>{new Date(r.data_pagamento + 'T00:00:00').toLocaleDateString('pt-BR')}</span>
                              <span className="font-semibold" style={{ color: '#22c55e' }}>{fmtMoeda(r.valor)}</span>
                              {r.observacao && <span style={{ color: 'var(--muted-color)' }}>· {r.observacao}</span>}
                            </div>
                            <button onClick={() => excluirRecebimentoMaster(r.id)} className="text-xs px-2 py-1 rounded shrink-0" style={{ background: 'rgba(239,68,68,0.12)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }}>Excluir</button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Lista por venda */}
                  {vendasMaster.length === 0 ? (
                    <p className="text-sm" style={{ color: 'var(--muted-color)' }}>Nenhuma venda encontrada.</p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {vendasMaster.map((v: any) => {
                        const status = v.parcelas_pendentes === 0 ? 'ok' : v.parcelas_recebidas > 0 ? 'parcial' : 'pendente'
                        const badge = status === 'ok'
                          ? { txt: '\u2713 quitado', cor: '#22c55e', bg: 'rgba(34,197,94,0.12)', bd: 'rgba(34,197,94,0.4)' }
                          : status === 'parcial'
                          ? { txt: '\u{1F7E1} parcial', cor: '#eab308', bg: 'rgba(234,179,8,0.12)', bd: 'rgba(234,179,8,0.4)' }
                          : { txt: '\u{1F534} tudo pendente', cor: '#ef4444', bg: 'rgba(239,68,68,0.12)', bd: 'rgba(239,68,68,0.4)' }
                        return (
                          <div key={v.contrato} className="rounded-xl px-4 py-3" style={{ background: 'rgba(0,0,0,0.12)', border: '1px solid var(--border)' }}>
                            <div className="flex items-center justify-between gap-3 flex-wrap mb-1">
                              <div className="flex items-center gap-2 text-sm flex-wrap min-w-0">
                                <span className="font-semibold" style={{ color: 'var(--text)' }}>{v.cliente}</span>
                                <span style={{ color: 'var(--muted-color)' }}>· {v.empresa}</span>
                                <span style={{ color: 'var(--muted-color)' }}>· {v.contrato}</span>
                              </div>
                              <span className="text-[11px] px-2 py-0.5 rounded shrink-0" style={{ background: badge.bg, color: badge.cor, border: `1px solid ${badge.bd}` }}>{badge.txt}</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-[11px] flex-wrap" style={{ color: 'var(--muted-color)' }}>
                              <span>cliente pagou <b style={{ color: 'var(--text2)' }}>{v.parcelas_garantidas}</b></span>
                              <span>· veio no borderô <b style={{ color: 'var(--text2)' }}>{v.parcelas_vindas}</b></span>
                              <span>· recebido <b style={{ color: '#22c55e' }}>{v.parcelas_recebidas}</b></span>
                              <span>· A RECEBER <b style={{ color: 'var(--accent)' }}>{v.parcelas_pendentes}</b> ({fmtMoeda(v.valor_pendente)})</span>
                              <span>· a vencer <b style={{ color: '#3b82f6' }}>{fmtMoeda(v.valor_a_vencer)}</b></span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* Mini-modal lançar recebimento */}
                  {mModalAberto && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                      <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }} onClick={() => setMModalAberto(false)} />
                      <div className="relative w-full max-w-sm rounded-xl p-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                        <h3 className="text-base font-semibold mb-4" style={{ color: 'var(--text)' }}>Lançar recebimento</h3>
                        <div className="flex flex-col gap-3">
                          <div>
                            <label className="block text-[10px] mb-1" style={{ color: 'var(--muted-color)' }}>Data do pagamento</label>
                            <input type="date" value={mData} onChange={(e) => setMData(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle} />
                          </div>
                          <div>
                            <label className="block text-[10px] mb-1" style={{ color: 'var(--muted-color)' }}>Valor (R$)</label>
                            <input value={mValor} onChange={(e) => setMValor(e.target.value)} inputMode="decimal" placeholder="0,00" className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle} />
                          </div>
                          <div>
                            <label className="block text-[10px] mb-1" style={{ color: 'var(--muted-color)' }}>Observação (opcional)</label>
                            <input value={mObs} onChange={(e) => setMObs(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle} />
                          </div>
                          <div className="flex gap-2 justify-end mt-1">
                            <button onClick={() => setMModalAberto(false)} className="rounded-lg px-4 py-2 text-xs font-medium" style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--muted-color)', border: '1px solid var(--border)' }}>Cancelar</button>
                            <button onClick={lancarRecebimentoMaster} disabled={mSalvando} className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold disabled:opacity-50" style={{ background: 'var(--accent)', color: '#0a0a0a' }}>{mSalvando ? <Loader2 size={13} className="animate-spin" /> : 'Lançar'}</button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })()
          ) : aba === 'config' ? (
            <>
            {meuRole === 'master' && (
              <div className="rounded-xl p-5 max-w-2xl mb-4" style={{ background: 'rgba(0,0,0,0.12)', border: '1px solid var(--border)' }}>
                <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--text)' }}>Período de produção</h3>
                <p className="text-xs mb-3" style={{ color: 'var(--muted-color)' }}>Define o período de produção atual. Vale para Comissões, Ranking e relatórios.</p>
                <div className="flex items-end gap-3 flex-wrap">
                  <div>
                    <label className="block text-xs mb-1" style={{ color: 'var(--muted-color)' }}>Data início</label>
                    <input type="date" value={prodInicio} onChange={(e) => setProdInicio(e.target.value)} className="rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle} />
                  </div>
                  <div>
                    <label className="block text-xs mb-1" style={{ color: 'var(--muted-color)' }}>Data fim</label>
                    <input type="date" value={prodFim} onChange={(e) => setProdFim(e.target.value)} className="rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle} />
                  </div>
                  <button onClick={salvarProducao} disabled={salvandoProducao} className="rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ background: 'var(--accent)', color: '#0a0a0a' }}>{salvandoProducao ? 'Salvando...' : 'Salvar'}</button>
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
                    <div>
                      <label className="block text-[10px] mb-1" style={{ color: '#a855f7' }}>% Superv. venda própria</label>
                      <input value={catConfig[c.key]?.supProprio || ''} onChange={(e) => setCatConfig(prev => ({ ...prev, [c.key]: { ...prev[c.key], supProprio: e.target.value } }))} placeholder="0,8" className="rounded-lg px-2 py-1.5 text-sm outline-none w-24" style={{ ...inputStyle, borderColor: 'rgba(168,85,247,0.3)' }} />
                    </div>
                  </div>
                ))}
                <button onClick={salvarConfig} disabled={salvandoConfig} className="w-full flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold disabled:opacity-50 transition-transform hover:scale-105 active:scale-95" style={{ background: 'linear-gradient(135deg, #d4af37 0%, #c9a227 50%, #b8941f 100%)', color: '#0a0a0a' }}>{salvandoConfig ? <Loader2 size={14} className="animate-spin" /> : <><Check size={14} />Salvar comissões por categoria</>}</button>
              </div>
            </div>
            </>
          ) : (
            <>
              {/* Próximo Pagamento + PRÉVIA do próximo borderô + (a) TIMELINE DE SEXTAS */}
              {ehGestao && (filaExibida.length > 0 || previaProximoBordero.qtd > 0) && (
                <div className="rounded-2xl p-5 mb-4" style={{ background: 'linear-gradient(135deg, rgba(59,130,246,0.14), rgba(17,18,22,0.94))', border: '1px solid rgba(59,130,246,0.3)', boxShadow: '0 8px 24px rgba(0,0,0,0.45)' }}>
                  <div className="flex items-center gap-2 mb-1.5"><Clock size={14} style={{ color: '#3b82f6' }} /><p className="text-xs" style={{ color: 'var(--muted-color)' }}>Próximo Pagamento</p></div>
                  {filaExibida.length > 0 ? (
                    <>
                      <p className="text-2xl font-bold tabular-nums" style={{ color: '#3b82f6' }}>{fmtMoeda(filaExibida[0].total)}</p>
                      <p className="text-[10px] mt-1" style={{ color: 'var(--muted-color)' }}>Embracon paga {fmtDataPag(filaExibida[0].data)} (sexta) · faltam {diasAtePag(filaExibida[0].data)} dia(s)</p>
                      {temFiltro && <p className="text-[9px]" style={{ color: '#60a5fa' }}>somente vendas do filtro atual</p>}
                    </>
                  ) : (
                    <p className="text-sm" style={{ color: 'var(--muted-color)' }}>Nenhum borderô aguardando pagamento</p>
                  )}
                  {/* (a) TIMELINE DE SEXTAS — próximas sextas com valor previsto e barra proporcional */}
                  {filaExibida.length > 0 && (
                    <div className="mt-3 pt-3" style={{ borderTop: '1px solid rgba(59,130,246,0.2)' }}>
                      <div className="flex items-center gap-1.5 mb-2"><CalendarDays size={12} style={{ color: '#60a5fa' }} /><p className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--muted-color)' }}>Próximas sextas de pagamento</p></div>
                      <div className="flex flex-col gap-2">
                        {(() => { const maxFila = Math.max(1, ...filaExibida.map(x => x.total)); return filaExibida.map((f, i) => {
                          const pct = Math.max(4, (f.total / maxFila) * 100)
                          return (
                            <div key={i} className="flex items-center gap-3">
                              <span className="text-[10px] tabular-nums shrink-0" style={{ color: 'var(--muted-color)', width: 78 }}>{fmtDataPag(f.data)}</span>
                              <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
                                <div className="h-full anim-bar-grow" style={{ width: `${pct}%`, background: i === 0 ? 'var(--accent)' : 'rgba(212,175,55,0.5)' }} />
                              </div>
                              <span className="text-[11px] font-semibold tabular-nums shrink-0" style={{ color: i === 0 ? 'var(--accent)' : '#c9a227', width: 84, textAlign: 'right' }}>{fmtMoeda(f.total)}</span>
                            </div>
                          )
                        }) })()}
                      </div>
                    </div>
                  )}
                  {/* PRÉVIA do próximo borderô */}
                  <div className="mt-2 pt-2" style={{ borderTop: '1px solid rgba(59,130,246,0.2)' }}>
                    <div className="flex items-center justify-between">
                      <p className="text-[10px]" style={{ color: 'var(--muted-color)' }}>Prévia do próximo borderô ({previaProximoBordero.qtd} venda{previaProximoBordero.qtd === 1 ? '' : 's'} efetivada{previaProximoBordero.qtd === 1 ? '' : 's'} aguardando)</p>
                      <p className="text-sm font-bold tabular-nums" style={{ color: '#60a5fa' }}>{fmtMoeda(previaProximoBordero.total)}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Prévia Próxima Semana */}
              {ehGestao && previaProximaSemana > 0 && (
                <div className="rounded-2xl p-5 mb-4" style={{ background: 'linear-gradient(135deg, rgba(34,197,94,0.1), rgba(17,18,22,0.94))', border: '1px solid rgba(34,197,94,0.25)', boxShadow: '0 8px 24px rgba(0,0,0,0.45)' }}>
                  <div className="flex items-center gap-2 mb-1.5"><TrendingUp size={14} style={{ color: '#22c55e' }} /><p className="text-xs" style={{ color: 'var(--muted-color)' }}>Prévia Próxima Semana</p></div>
                  <p className="text-2xl font-bold tabular-nums" style={{ color: '#22c55e' }}>{fmtMoeda(previaProximaSemana)}</p>
                  <p className="text-[10px] mt-1" style={{ color: 'var(--muted-color)' }}>Vendas efetivadas até quinta que ainda não foram 100% recebidas</p>
                </div>
              )}

              {/* (b) FAROL DE ESTORNOS — card clicável que abre a lista de vendas em risco */}
              {ehGestao && (
                <div className="mb-4">
                  <button onClick={() => setFarolAberto(v => !v)} disabled={emRisco === 0} className="w-full text-left rounded-2xl p-5 flex items-center justify-between gap-3 disabled:cursor-default transition-transform enabled:hover:scale-[1.005]" style={{ background: emRisco > 0 ? 'linear-gradient(135deg, rgba(239,68,68,0.14), rgba(17,18,22,0.94))' : 'rgba(17,18,22,0.92)', border: `1px solid ${emRisco > 0 ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.08)'}`, boxShadow: '0 8px 24px rgba(0,0,0,0.45)' }}>
                    <div>
                      <div className="flex items-center gap-2 mb-1.5"><AlertTriangle size={14} style={{ color: emRisco > 0 ? '#ef4444' : 'var(--muted-color)' }} /><p className="text-xs" style={{ color: 'var(--muted-color)' }}>Em risco de estorno</p></div>
                      <p className="text-2xl font-bold tabular-nums" style={{ color: emRisco > 0 ? '#ef4444' : 'var(--text)' }}>{emRisco}</p>
                    </div>
                    {emRisco > 0 && (
                      <div className="flex items-center gap-2 text-xs" style={{ color: '#ef4444' }}>
                        <span>{farolAberto ? 'ocultar' : 'ver detalhes'}</span>
                        {farolAberto ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </div>
                    )}
                  </button>
                  {farolAberto && emRisco > 0 && (
                    <div className="mt-2 rounded-2xl p-4 flex flex-col gap-2" style={{ background: 'rgba(0,0,0,0.18)', border: '1px solid rgba(239,68,68,0.25)' }}>
                      <p className="text-[10px] uppercase tracking-wide mb-1" style={{ color: 'var(--muted-color)' }}>Vendas mais próximas de estornar primeiro</p>
                      {listaEmRisco.map(v => {
                        const urgente = v.faltam === 1
                        return (
                          <div key={v.id} className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 flex-wrap" style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${urgente ? 'rgba(239,68,68,0.45)' : 'var(--border)'}` }}>
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{v.cliente}</p>
                              <p className="text-[11px]" style={{ color: 'var(--muted-color)' }}>{v.bem} · plano {v.plano} · reversão até {v.pgto_seguranca}ª parcela</p>
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                              <div className="text-right">
                                <p className="text-[11px] tabular-nums" style={{ color: 'var(--text2)' }}>{v.parcelas_pagas}/{v.pgto_seguranca} pagas</p>
                                <p className="text-[10px] tabular-nums" style={{ color: '#f59e0b' }}>estorno {fmtMoeda(v.valor_estorno)}</p>
                              </div>
                              <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full shrink-0 ${urgente ? 'pulse-vermelho' : ''}`} style={{ background: 'rgba(239,68,68,0.16)', color: '#ef4444' }}>
                                {urgente ? 'falta 1!' : `faltam ${v.faltam}`}
                              </span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Cards de comissão de equipe */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
                {(ehGestao || ehAdm) && (
                <div className="rounded-2xl p-5" style={{ background: 'linear-gradient(135deg, rgba(59,130,246,0.12), rgba(17,18,22,0.94))', border: '1px solid rgba(59,130,246,0.28)', boxShadow: '0 8px 24px rgba(0,0,0,0.45)' }}>
                  <p className="text-xs mb-1.5" style={{ color: 'var(--muted-color)' }}>Comissão Vendedores</p>
                  <p className="text-2xl font-bold tabular-nums" style={{ color: '#3b82f6' }}>{fmtMoeda(totalVendedores)}</p>
                </div>
                )}
                {(ehGestao || ehAdm) && (
                <div className="rounded-2xl p-5" style={{ background: 'linear-gradient(135deg, rgba(168,85,247,0.12), rgba(17,18,22,0.94))', border: '1px solid rgba(168,85,247,0.28)', boxShadow: '0 8px 24px rgba(0,0,0,0.45)' }}>
                  <p className="text-xs mb-1.5" style={{ color: 'var(--muted-color)' }}>Comissão Supervisores</p>
                  <p className="text-2xl font-bold tabular-nums" style={{ color: '#a855f7' }}>{fmtMoeda(totalSupervisores)}</p>
                </div>
                )}
                {(ehGestao || ehAdm) && totalSupervisorPropria > 0 && (
                <div className="rounded-2xl p-5" style={{ background: 'linear-gradient(135deg, rgba(236,72,153,0.12), rgba(17,18,22,0.94))', border: '1px solid rgba(236,72,153,0.28)', boxShadow: '0 8px 24px rgba(0,0,0,0.45)' }}>
                  <p className="text-xs mb-1.5" style={{ color: 'var(--muted-color)' }}>Superv. Venda Própria</p>
                  <p className="text-2xl font-bold tabular-nums" style={{ color: '#ec4899' }}>{fmtMoeda(totalSupervisorPropria)}</p>
                  <p className="text-[10px] mt-1" style={{ color: 'var(--muted-color)' }}>vendas do próprio supervisor</p>
                </div>
                )}
                {ehGestao && (<div className="rounded-2xl p-5" style={{ background: 'linear-gradient(135deg, rgba(34,197,94,0.12), rgba(17,18,22,0.94))', border: '1px solid rgba(34,197,94,0.28)', boxShadow: '0 8px 24px rgba(0,0,0,0.45)' }}>
                  <p className="text-xs mb-1.5" style={{ color: 'var(--muted-color)' }}>Líquido Representante</p>
                  <p className="text-2xl font-bold tabular-nums" style={{ color: '#22c55e' }}>{fmtMoeda(liquidoRep)}</p>
                  <p className="text-[10px] mt-1" style={{ color: 'var(--muted-color)' }}>após vendedor e supervisor</p>
                </div>)}
              </div>

              {selecionadas.size > 0 && (
                <div className="rounded-xl p-4 mb-4 flex items-end gap-3 flex-wrap" style={{ background: 'rgba(212,175,55,0.08)', border: '1px solid rgba(212,175,55,0.25)' }}>
                  <span className="text-sm font-medium self-center" style={{ color: 'var(--accent)' }}>{selecionadas.size} selecionada{selecionadas.size !== 1 ? 's' : ''}</span>
                  <div><label className="block text-[10px] mb-1" style={{ color: 'var(--muted-color)' }}>% Vendedor</label><input value={pctVend} onChange={(e) => setPctVend(e.target.value)} placeholder="0,5" className="rounded-lg px-2 py-1.5 text-xs outline-none w-20" style={inputStyle} /></div>
                  <div><label className="block text-[10px] mb-1" style={{ color: 'var(--muted-color)' }}>% Supervisor</label><input value={pctSup} onChange={(e) => setPctSup(e.target.value)} placeholder="0,2" className="rounded-lg px-2 py-1.5 text-xs outline-none w-20" style={inputStyle} /></div>
                  <div><label className="block text-[10px] mb-1" style={{ color: '#ec4899' }}>% Superv. própria</label><input value={pctSupProprio} onChange={(e) => setPctSupProprio(e.target.value)} placeholder="1,0" className="rounded-lg px-2 py-1.5 text-xs outline-none w-20" style={inputStyle} /></div>
                  <button onClick={aplicar} disabled={aplicando} className="rounded-lg px-4 py-1.5 text-xs font-semibold disabled:opacity-50" style={{ background: 'var(--accent)', color: '#0a0a0a' }}>{aplicando ? 'Aplicando...' : 'Aplicar nas selecionadas'}</button>
                </div>
              )}

              {/* (d) Busca rápida: filtra a tabela na hora por cliente ou contrato/proposta */}
              {vendas.length > 0 && (
                <div className="mb-3 flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', maxWidth: 380 }}>
                  <Search size={15} style={{ color: 'var(--muted-color)' }} />
                  <input
                    value={buscaVendas}
                    onChange={(e) => setBuscaVendas(e.target.value)}
                    placeholder="Buscar por cliente ou contrato..."
                    className="flex-1 bg-transparent text-sm outline-none"
                    style={{ color: 'var(--text)' }}
                  />
                  {buscaVendas && <button onClick={() => setBuscaVendas('')} className="text-[11px] shrink-0" style={{ color: 'var(--muted-color)' }}>limpar</button>}
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
                          <th onClick={() => clicarOrdenar('cliente')} className="p-3 text-left text-xs cursor-pointer select-none" style={{ color: 'var(--muted-color)' }}>Cliente{ordenarPor === 'cliente' ? (ordemAsc ? ' ↑' : ' ↓') : ''}</th>
                          <th onClick={() => clicarOrdenar('adesao')} className="p-3 text-left text-xs cursor-pointer select-none" style={{ color: 'var(--muted-color)' }}>Adesão{ordenarPor === 'adesao' ? (ordemAsc ? ' ↑' : ' ↓') : ''}</th>
                          <th onClick={() => clicarOrdenar('credito')} className="p-3 text-right text-xs cursor-pointer select-none" style={{ color: 'var(--muted-color)' }}>Crédito{ordenarPor === 'credito' ? (ordemAsc ? ' ↑' : ' ↓') : ''}</th>
                          {ehGestao && <th onClick={() => clicarOrdenar('garantida')} className="p-3 text-right text-xs cursor-pointer select-none" style={{ color: 'var(--accent)' }}>Com. Garantida{ordenarPor === 'garantida' ? (ordemAsc ? ' ↑' : ' ↓') : ''}</th>}
                          {ehGestao && <th onClick={() => clicarOrdenar('recebido')} className="p-3 text-right text-xs cursor-pointer select-none" style={{ color: '#22c55e' }}>Recebido{ordenarPor === 'recebido' ? (ordemAsc ? ' ↑' : ' ↓') : ''}</th>}
                          {ehGestao && <th onClick={() => clicarOrdenar('falta')} className="p-3 text-right text-xs cursor-pointer select-none" style={{ color: '#f59e0b' }}>Falta{ordenarPor === 'falta' ? (ordemAsc ? ' ��' : ' ↓') : ''}</th>}
                          <th onClick={() => clicarOrdenar('vendedor')} className="p-3 text-right text-xs cursor-pointer select-none" style={{ color: 'var(--muted-color)' }}>Vend.{ordenarPor === 'vendedor' ? (ordemAsc ? ' ↑' : ' ↓') : ''}</th>
                          <th onClick={() => clicarOrdenar('supervisor')} className="p-3 text-right text-xs cursor-pointer select-none" style={{ color: 'var(--muted-color)' }}>Superv.{ordenarPor === 'supervisor' ? (ordemAsc ? ' ↑' : ' ↓') : ''}</th>
                          {ehGestao && <th className="p-3 text-center text-xs" style={{ color: 'var(--muted-color)' }}>Estorno</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {[...vendasVisiveis].sort((a, b) => {
                          const va = valorColuna(a, ordenarPor), vb = valorColuna(b, ordenarPor)
                          let cmp = 0
                          if (typeof va === 'string' && typeof vb === 'string') cmp = va.localeCompare(vb)
                          else cmp = (va as number) - (vb as number)
                          return ordemAsc ? cmp : -cmp
                        }).map(v => {
                          const faltaRs = v.comissao_lr - (v.comissao_recebida_rs || 0)
                          const recPct = v.comissao_recebida_percent || 0
                          return (
                            <tr key={v.id} style={{ borderBottom: '1px solid var(--border)', background: selecionadas.has(v.id) ? 'rgba(212,175,55,0.05)' : 'transparent' }}>
                              <td className="p-3"><input type="checkbox" checked={selecionadas.has(v.id)} onChange={() => toggle(v.id)} className="accent-yellow-500" /></td>
                              <td className="p-3" style={{ color: 'var(--text)' }}>{v.cliente}<br /><span className="text-[10px]" style={{ color: 'var(--muted-color)' }}>{v.vendedor}</span></td>
                              <td className="p-3"><span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(212,175,55,0.12)', color: 'var(--accent)' }}>{v.adesao != null ? `${v.adesao}%` : '-'}</span><br/><span className="text-[10px]" style={{ color: 'var(--muted-color)' }}>{v.bem}</span></td>
                              <td className="p-3 text-right" style={{ color: 'var(--text2)' }}>{fmtMoeda(v.credito)}</td>
                              {ehGestao && <td className="p-3 text-right font-semibold" style={{ color: 'var(--accent)' }}>{fmtMoeda(v.comissao_lr)}<br /><span className="text-[10px]" style={{ color: 'var(--muted-color)' }}>de {fmtMoeda(v.comissao_lr_total)} · {v.parcelas_pagas}/{v.total_parcelas_comissao} pg</span></td>}
                              {ehGestao && <td className="p-3 text-right" style={{ color: '#22c55e' }}>{fmtMoeda(v.comissao_recebida_rs || 0)}<br /><span className="text-[10px]">{recPct.toFixed(1)}%</span></td>}
                              {ehGestao && <td className="p-3 text-right" style={{ color: faltaRs > 1 ? '#f59e0b' : '#22c55e' }}>{faltaRs > 1 ? fmtMoeda(faltaRs) : `${'\u2713'} 100%`}</td>}
                              <td className="p-3 text-right" style={{ color: 'var(--text2)' }}>{v.percentual_vendedor}%<br /><span className="text-[10px]">{fmtMoeda(v.comissao_vendedor)}</span>{(v as any).venda_propria_supervisor && <><br /><span className="text-[9px]" style={{ color: '#ec4899' }}>superv. própria</span></>}</td>
                              <td className="p-3 text-right" style={{ color: 'var(--text2)' }}>{v.percentual_supervisor}%<br /><span className="text-[10px]">{fmtMoeda(v.comissao_supervisor)}</span></td>
                              {ehGestao && <td className="p-3 text-center">
                                {v.em_risco ? (
                                  <div className="flex flex-col items-center gap-0.5">
                                    <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}>{'\u25cf'} {fmtMoeda(v.valor_estorno)}</span>
                                    <span className="text-[9px]" style={{ color: '#f59e0b' }}>pagar +{v.faltam} p/ não estornar</span>
                                  </div>
                                ) : (
                                  <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e' }}>{'\u2713'} seguro</span>
                                )}
                              </td>}
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  {vendasVisiveis.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-10 gap-1.5">
                      <Search size={22} style={{ color: 'var(--muted-color)' }} />
                      <p className="text-sm" style={{ color: 'var(--muted-color)' }}>Nenhuma venda para &quot;{buscaVendas}&quot;</p>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
          </div>
          )}
        </main>
      </div>
    </div>
  )
}
