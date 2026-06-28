'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import Sidebar from '@/components/Sidebar'
import Header from '@/components/Header'
import { Users, Loader2, ChevronDown, ChevronUp, Search, SlidersHorizontal, Home, Car, Truck, FileText, Target, Check, CalendarClock, Pencil, Trash2 } from 'lucide-react'

interface Cota {
  venda_id: string; cliente_id: string; nome: string; cpf: string; telefone: string
  grupo: string; cota: string; numero_proposta: string | null; numero_contrato: string | null; credito: number; bem: string; adesao: number | null; plano: string; com_seguro?: boolean
  data_assembleia: string | null; data_venda: string | null
  vendedor: string | null; equipe_nome: string | null; vendedor_id: string; equipe_id: string; empresa_id: string
  status_boleto: string; qtd_parcelas: number; proxima_cobranca: string | null; status_cliente: string
  status_lance: string | null; checado: boolean; pdf_proposta_url: string | null; observacoes?: string | null
}
interface ClienteAgr { cliente_id: string; nome: string; cpf: string; telefone: string; cotas: Cota[] }

const fmtMoeda = (v: number) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const fmtData = (s: string | null) => s ? new Date(s + (s.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('pt-BR') : '-'

const bemIcon: Record<string, any> = { 'Imóvel': Home, 'Veículo': Car, 'Pesados': Truck }
const STATUS_BOLETO: Record<string, { label: string; cor: string }> = {
  pendente: { label: 'Boleto pendente', cor: '#eab308' },
  solicitado: { label: 'Boleto solicitado', cor: '#f97316' },
  aguardando_pagamento: { label: 'Aguardando pgto', cor: '#3b82f6' },
  aguardando_baixa: { label: 'Aguardando baixa', cor: '#a855f7' },
  efetivado: { label: 'Efetivado', cor: '#22c55e' },
}
const STATUS_LANCE: Record<string, { label: string; cor: string }> = {
  pendente: { label: 'Lance pendente', cor: '#eab308' },
  solicitado: { label: 'Lance solicitado', cor: '#f97316' },
  contemplado: { label: 'Contemplado', cor: '#22c55e' },
}

export default function ClientesPage() {
  const [clientes, setClientes] = useState<ClienteAgr[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [expandido, setExpandido] = useState<string | null>(null)
  const [abaCliente, setAbaCliente] = useState<'ativos' | 'cancelados'>('ativos')
  const [meuRole, setMeuRole] = useState('')
  const [mostraFiltros, setMostraFiltros] = useState(true)
  const [fBem, setFBem] = useState('')
  const [fAdesao, setFAdesao] = useState('')
  const [fSeguro, setFSeguro] = useState('')
  const [fLance, setFLance] = useState('')
  const [filtrosOpc, setFiltrosOpc] = useState<{ empresas: any[]; equipes: any[]; vendedores: any[] }>({ empresas: [], equipes: [], vendedores: [] })
  const [fEmpresa, setFEmpresa] = useState('')
  const [fEquipe, setFEquipe] = useState('')
  const [fVendedor, setFVendedor] = useState('')
  const [fStatusBoleto, setFStatusBoleto] = useState('')
  const [prodInicio, setProdInicio] = useState('')
  const [prodFim, setProdFim] = useState('')
  const [dataDe, setDataDe] = useState('')
  const [dataAte, setDataAte] = useState('')
  const [baixando, setBaixando] = useState<string | null>(null)
  const [editarModal, setEditarModal] = useState<Cota | null>(null)
  const [edEmpresa, setEdEmpresa] = useState('')
  const [edParcelas, setEdParcelas] = useState('')
  const [edVendedor, setEdVendedor] = useState('')
  const [edEquipe, setEdEquipe] = useState('')
  const [salvandoEditar, setSalvandoEditar] = useState(false)
  const [lanceModal, setLanceModal] = useState<Cota | null>(null)
  const [tipoLance, setTipoLance] = useState<'fixo25' | 'fixo50' | 'valor' | 'livre'>('fixo25')
  const [valorLance, setValorLance] = useState('')
  const [obsLance, setObsLance] = useState('')
  const [recorrente, setRecorrente] = useState(false)
  const [clienteOfertou, setClienteOfertou] = useState(false)
  const [salvandoLance, setSalvandoLance] = useState(false)

  useEffect(() => { load() }, [])
  async function load() {
    setLoading(true)
    const res = await fetch('/api/clientes-lista')
    const data = await res.json()
    if (data.clientes) setClientes(data.clientes)
    if (data.meu_role) setMeuRole(data.meu_role)
    if (data.filtros) setFiltrosOpc(data.filtros)
    try { const rp = await fetch('/api/config-producao'); const dp = await rp.json(); if (dp.data_inicio) setProdInicio(dp.data_inicio); if (dp.data_fim) setProdFim(dp.data_fim) } catch {}
    setLoading(false)
  }

  async function deletarCota(c: Cota) {
    if (!confirm(`ATENÇÃO: isso vai APAGAR a cota ${c.grupo}/${c.cota} de ${c.nome} e TODO o rastro (boleto, lances, comissão). Esta ação NÃO pode ser desfeita. Confirmar?`)) return
    if (!confirm('Tem certeza mesmo? Essa exclusão é permanente.')) return
    try {
      const res = await fetch('/api/clientes-lista/deletar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ venda_id: c.venda_id }) })
      const data = await res.json()
      if (!res.ok) { alert(data.error || 'Erro ao deletar'); return }
      await load()
    } catch { alert('Erro de conexão') }
  }

  async function baixarProposta(cota: Cota) {
    if (!cota.pdf_proposta_url) { alert('Sem proposta anexada'); return }
    setBaixando(cota.venda_id)
    const supabase = createClient()
    const { data } = await supabase.storage.from('propostas-pdf').createSignedUrl(cota.pdf_proposta_url, 60)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
    setBaixando(null)
  }

  function formatarMoedaInput(v: string): string {
    const num = v.replace(/\D/g, '')
    if (!num) return ''
    const n = parseInt(num) / 100
    return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  async function criarLance() {
    if (!lanceModal) return
    setSalvandoLance(true)
    const payload: any = { acao: 'criar', cliente_id: lanceModal.cliente_id, venda_id: lanceModal.venda_id, tipo: tipoLance, observacao: obsLance, recorrente, cliente_ofertou: clienteOfertou }
    if (tipoLance !== 'fixo25') {
      const limpo = tipoLance === 'valor' ? valorLance.replace(/\./g, '').replace(',', '.') : valorLance.replace(',', '.')
      payload.valor_percentual = parseFloat(limpo) || 0
    }
    const res = await fetch('/api/lances/acao', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    setSalvandoLance(false)
    if (res.ok) { setLanceModal(null); setValorLance(''); setObsLance(''); setRecorrente(false); setClienteOfertou(false); setTipoLance('fixo25'); load() }
    else alert('Erro ao criar lance')
  }

  async function salvarEdicao() {
    if (!editarModal) return
    setSalvandoEditar(true)
    await fetch('/api/clientes-lista/editar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ venda_id: editarModal.venda_id, vendedor_id: edVendedor || null, equipe_id: edEquipe || null, empresa_id: edEmpresa || null, qtd_parcelas: edParcelas !== '' ? edParcelas : undefined }) })
    setSalvandoEditar(false)
    setEditarModal(null); load()
  }

  async function toggleChecado(cota: Cota) {
    const supabase = createClient()
    await supabase.from('vendas').update({ checado: !cota.checado }).eq('id', cota.venda_id)
    load()
  }

  // aplica filtros
  // separa cotas canceladas das ativas e reagrupa
  const clientesPorAba = clientes.map(cl => {
    const cotasAba = cl.cotas.filter(c => abaCliente === 'cancelados' ? c.status_cliente === 'cancelado' : c.status_cliente !== 'cancelado')
    return { ...cl, cotas: cotasAba }
  }).filter(cl => cl.cotas.length > 0)
  const filtrados = clientesPorAba.filter(cl => {
    // busca
    if (busca) {
      const b = busca.toLowerCase()
      const bate = cl.nome.toLowerCase().includes(b) || cl.cpf.includes(b) || cl.cotas.some(c => String(c.grupo).includes(b))
      if (!bate) return false
    }
    // filtros nas cotas: o cliente passa se ALGUMA cota bate
    return cl.cotas.some(c => {
      if (fBem && c.bem !== fBem) return false
      if (fAdesao && String(c.adesao) !== fAdesao) return false
      if (fSeguro === 'com' && !c.com_seguro) return false
      if (fSeguro === 'sem' && c.com_seguro) return false
      if (fLance && c.status_lance !== fLance) return false
      if (fStatusBoleto && c.status_boleto !== fStatusBoleto) return false
      if (fEmpresa && c.empresa_id !== fEmpresa) return false
      if (fEquipe && c.equipe_id !== fEquipe) return false
      if (fVendedor && c.vendedor_id !== fVendedor) return false
      if (dataDe || dataAte) {
        const dv = c.data_venda
        if (dv) { if (dataDe && dv < dataDe) return false; if (dataAte && dv > dataAte) return false }
      }
      return true
    })
  })

  function aplicarProducao() { if (prodInicio) setDataDe(prodInicio); if (prodFim) setDataAte(prodFim) }
  function aplicarSemana() {
    const hoje = new Date(); const dia = hoje.getDay()
    const dom = new Date(hoje); dom.setDate(hoje.getDate() - dia)
    const sab = new Date(dom); sab.setDate(dom.getDate() + 6)
    const iso = (d: Date) => d.toISOString().slice(0, 10)
    setDataDe(iso(dom)); setDataAte(iso(sab))
  }

  const inputStyle = { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--text)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)' }

  return (
    <div className="relative min-h-screen font-sans">
      <Sidebar />
      <div className="relative lg:ml-60" style={{ zIndex: 1 }}>
        <Header title="Clientes" />
        <main className="mx-auto max-w-[1100px] px-6 py-8 lg:px-8">
          <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: 'rgba(212,175,55,0.15)', border: '1px solid rgba(212,175,55,0.25)' }}><Users size={18} style={{ color: 'var(--accent)' }} /></div>
              <div><h2 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>Clientes</h2><p className="text-xs" style={{ color: 'var(--muted-color)' }}>{filtrados.length} cliente(s)</p></div>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search size={15} style={{ color: 'var(--muted-color)', position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
                <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar nome, CPF, grupo..." className="rounded-lg pl-8 pr-3 py-2 text-sm outline-none w-64" style={inputStyle} />
              </div>
              <button onClick={() => setMostraFiltros(!mostraFiltros)} className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium" style={{ background: mostraFiltros ? 'rgba(212,175,55,0.15)' : 'rgba(255,255,255,0.03)', border: `1px solid ${mostraFiltros ? 'var(--accent)' : 'var(--border)'}`, color: mostraFiltros ? 'var(--accent)' : 'var(--muted-color)' }}><SlidersHorizontal size={14} />Filtros</button>
            </div>
          </div>

          {mostraFiltros && (
            <div className="flex gap-2 mb-4 flex-wrap rounded-xl p-3" style={{ background: 'rgba(17,18,22,0.92)', boxShadow: '0 8px 24px rgba(0,0,0,0.45)', border: '1px solid var(--border)' }}>
              <select value={fBem} onChange={(e) => setFBem(e.target.value)} className="rounded-lg px-2 py-1.5 text-xs outline-none" style={inputStyle}>
                <option value="" style={{ background: '#131313' }}>Todos os bens</option>
                <option value="Imóvel" style={{ background: '#131313' }}>Imóvel</option>
                <option value="Veículo" style={{ background: '#131313' }}>Ve����culo</option>
                <option value="Pesados" style={{ background: '#131313' }}>Pesados</option>
              </select>
              <select value={fAdesao} onChange={(e) => setFAdesao(e.target.value)} className="rounded-lg px-2 py-1.5 text-xs outline-none" style={inputStyle}>
                <option value="" style={{ background: '#131313' }}>Toda adesão</option>
                <option value="1" style={{ background: '#131313' }}>1%</option>
                <option value="2" style={{ background: '#131313' }}>2%</option>
              </select>
              <select value={fSeguro} onChange={(e) => setFSeguro(e.target.value)} className="rounded-lg px-2 py-1.5 text-xs outline-none" style={inputStyle}>
                <option value="" style={{ background: '#131313' }}>Seguro (todos)</option>
                <option value="com" style={{ background: '#131313' }}>Com seguro</option>
                <option value="sem" style={{ background: '#131313' }}>Sem seguro</option>
              </select>
              <select value={fLance} onChange={(e) => setFLance(e.target.value)} className="rounded-lg px-2 py-1.5 text-xs outline-none" style={inputStyle}>
                <option value="" style={{ background: '#131313' }}>Todos os lances</option>
                <option value="pendente" style={{ background: '#131313' }}>Lance pendente</option>
                <option value="solicitado" style={{ background: '#131313' }}>Lance solicitado</option>
                <option value="contemplado" style={{ background: '#131313' }}>Contemplado</option>
              </select>
              <select value={fStatusBoleto} onChange={(e) => setFStatusBoleto(e.target.value)} className="rounded-lg px-2 py-1.5 text-xs outline-none" style={inputStyle}>
                <option value="" style={{ background: '#131313' }}>Todo status boleto</option>
                <option value="pendente" style={{ background: '#131313' }}>Boleto pendente</option>
                <option value="solicitado" style={{ background: '#131313' }}>Boleto solicitado</option>
                <option value="aguardando_pagamento" style={{ background: '#131313' }}>Aguardando pgto</option>
                <option value="aguardando_baixa" style={{ background: '#131313' }}>Aguardando baixa</option>
                <option value="efetivado" style={{ background: '#131313' }}>Efetivado</option>
              </select>
              {filtrosOpc.empresas.length > 0 && (
                <select value={fEmpresa} onChange={(e) => { setFEmpresa(e.target.value); setFEquipe(''); setFVendedor('') }} className="rounded-lg px-2 py-1.5 text-xs outline-none" style={inputStyle}>
                  <option value="" style={{ background: '#131313' }}>Todas empresas</option>
                  {filtrosOpc.empresas.map(e => <option key={e.id} value={e.id} style={{ background: '#131313' }}>{e.nome}</option>)}
                </select>
              )}
              {['master','representante','adm'].includes(meuRole) && (
                <select value={fEquipe} onChange={(e) => { setFEquipe(e.target.value); setFVendedor('') }} className="rounded-lg px-2 py-1.5 text-xs outline-none" style={inputStyle}>
                  <option value="" style={{ background: '#131313' }}>Todas equipes</option>
                  {filtrosOpc.equipes.filter(eq => !fEmpresa || eq.empresa_id === fEmpresa).map(eq => <option key={eq.id} value={eq.id} style={{ background: '#131313' }}>{eq.nome}</option>)}
                </select>
              )}
              {['master','representante','adm','supervisor'].includes(meuRole) && (
                <select value={fVendedor} onChange={(e) => setFVendedor(e.target.value)} className="rounded-lg px-2 py-1.5 text-xs outline-none" style={inputStyle}>
                  <option value="" style={{ background: '#131313' }}>Todos vendedores</option>
                  {filtrosOpc.vendedores.filter(vd => (!fEmpresa || vd.empresa_id === fEmpresa) && (!fEquipe || vd.equipe_id === fEquipe)).map(vd => <option key={vd.id} value={vd.id} style={{ background: '#131313' }}>{vd.nome}</option>)}
                </select>
              )}
              <button onClick={aplicarSemana} className="rounded-lg px-3 py-1.5 text-xs" style={{ background: 'rgba(59,130,246,0.12)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.3)' }}>Semana</button>
              <button onClick={aplicarProducao} className="rounded-lg px-3 py-1.5 text-xs" style={{ background: 'rgba(212,175,55,0.12)', color: 'var(--accent)', border: '1px solid rgba(212,175,55,0.3)' }}>Produção</button>
              <input type="date" value={dataDe} onChange={(e) => setDataDe(e.target.value)} className="rounded-lg px-2 py-1.5 text-xs outline-none" style={inputStyle} />
              <input type="date" value={dataAte} onChange={(e) => setDataAte(e.target.value)} className="rounded-lg px-2 py-1.5 text-xs outline-none" style={inputStyle} />
              {(fBem || fAdesao || fSeguro || fLance || fStatusBoleto || fEmpresa || fEquipe || fVendedor || dataDe || dataAte) && <button onClick={() => { setFBem(''); setFAdesao(''); setFSeguro(''); setFLance(''); setFStatusBoleto(''); setFEmpresa(''); setFEquipe(''); setFVendedor(''); setDataDe(''); setDataAte('') }} className="rounded-lg px-3 py-1.5 text-xs" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--muted-color)', border: '1px solid var(--border)' }}>Limpar</button>}
            </div>
          )}

          <div className="flex gap-2 mb-4">
            <button onClick={() => setAbaCliente('ativos')} className="rounded-lg px-3 py-1.5 text-xs font-medium" style={{ background: abaCliente === 'ativos' ? 'rgba(212,175,55,0.15)' : 'rgba(255,255,255,0.03)', border: `1px solid ${abaCliente === 'ativos' ? 'var(--accent)' : 'var(--border)'}`, color: abaCliente === 'ativos' ? 'var(--accent)' : 'var(--muted-color)' }}>Ativos</button>
            <button onClick={() => setAbaCliente('cancelados')} className="rounded-lg px-3 py-1.5 text-xs font-medium" style={{ background: abaCliente === 'cancelados' ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.03)', border: `1px solid ${abaCliente === 'cancelados' ? '#ef4444' : 'var(--border)'}`, color: abaCliente === 'cancelados' ? '#ef4444' : 'var(--muted-color)' }}>Cancelados</button>
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-12"><Loader2 size={20} className="animate-spin" style={{ color: 'var(--accent)' }} /></div>
          ) : (
            <div className="space-y-3">
              {filtrados.map(cl => {
                const aberto = expandido === cl.cliente_id
                // resumo de alertas das cotas
                const temLancePendente = cl.cotas.some(c => c.status_lance === 'pendente')
                const algumNaoChecado = cl.cotas.some(c => !c.checado)
                return (
                  <div key={cl.cliente_id} className="card-glass overflow-hidden">
                    <div className="p-4 cursor-pointer" onClick={() => setExpandido(aberto ? null : cl.cliente_id)}>
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-3 flex-wrap">
                          {(() => {
                            const temAtraso = cl.cotas.some(c => c.status_cliente === 'atraso')
                            const temCancelado = cl.cotas.some(c => c.status_cliente === 'cancelado')
                            const st = temCancelado ? { cor: '#ef4444', bg: 'rgba(239,68,68,0.15)', label: 'Cancelado' } : temAtraso ? { cor: '#f59e0b', bg: 'rgba(245,158,11,0.15)', label: 'Em atraso' } : { cor: '#22c55e', bg: 'rgba(34,197,94,0.15)', label: 'Em dia' }
                            return <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: st.bg, color: st.cor }}>{st.label}</span>
                          })()}
                          <span className="text-base font-semibold" style={{ color: 'var(--text)' }}>{cl.nome}</span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'rgba(212,175,55,0.12)', color: 'var(--accent)' }}>{cl.cotas.length} cota(s)</span>
                          {cl.cotas.map((c, i) => (
                            <span key={'gc'+i} className="text-xs" style={{ color: 'var(--muted-color)' }}>
                              Prop. {c.numero_proposta || c.numero_contrato || '-'} · Grupo {c.grupo}/{c.cota}
                              {c.observacoes && <span className="flex items-center gap-1 italic mt-0.5" style={{ color: '#eab308' }}><FileText size={11} /> {c.observacoes}</span>}
                            </span>
                          ))}
                        </div>
                        <div className="flex items-center gap-2">
                          {cl.cotas.length === 1 && !cl.cotas[0].status_lance && (
                            <button onClick={(e) => { e.stopPropagation(); setLanceModal(cl.cotas[0]) }} className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-[10px] font-medium" style={{ background: 'rgba(168,85,247,0.15)', color: '#a855f7', border: '1px solid rgba(168,85,247,0.3)' }}><Target size={11} />Criar lance</button>
                          )}
                          {aberto ? <ChevronUp size={16} style={{ color: 'var(--muted-color)' }} /> : <ChevronDown size={16} style={{ color: 'var(--muted-color)' }} />}
                        </div>
                      </div>
                      {/* Alertas resumo (antes de expandir) */}
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        {cl.cotas.map((c, i) => {
                          const Icon = bemIcon[c.bem] || Home
                          return (
                            <span key={i} className="flex items-center gap-1">
                              <span className="text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1" style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--text2)' }}><Icon size={10} />{c.bem} {c.adesao}%</span>
                              {c.com_seguro && <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'rgba(34,197,94,0.12)', color: '#22c55e' }}>com seguro</span>}
                            </span>
                          )
                        })}
                        {temLancePendente && <span className="text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1" style={{ background: 'rgba(234,179,8,0.15)', color: '#eab308' }}><Target size={10} />Lance pendente</span>}
                        {cl.cotas.some(c => c.status_lance === 'solicitado') && <span className="text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1" style={{ background: 'rgba(249,115,22,0.15)', color: '#f97316' }}><Target size={10} />Lance solicitado</span>}
                        {cl.cotas.map((c, i) => { const sb = STATUS_BOLETO[c.status_boleto]; return sb ? <span key={'b'+i} className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: `${sb.cor}20`, color: sb.cor }}>{sb.label}</span> : null })}
                        {!algumNaoChecado && <span className="text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1" style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e' }}><Check size={10} />Checado</span>}
                      </div>
                      {(cl.cotas[0]?.vendedor || cl.cotas[0]?.equipe_nome) && (
                        <div className="flex items-center gap-3 mt-1.5 text-[11px]" style={{ color: 'var(--muted-color)' }}>
                          {cl.cotas[0]?.vendedor && <span>Vendedor: <span style={{ color: 'var(--text2)' }}>{cl.cotas[0].vendedor}</span></span>}
                          {cl.cotas[0]?.equipe_nome && <span>Equipe: <span style={{ color: 'var(--text2)' }}>{cl.cotas[0].equipe_nome}</span></span>}
                        </div>
                      )}
                    </div>

                    {aberto && (
                      <div className="px-4 pb-4 space-y-2" style={{ borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
                        {cl.cotas.map(c => {
                          const sb = STATUS_BOLETO[c.status_boleto]
                          const sl = c.status_lance ? STATUS_LANCE[c.status_lance] : null
                          return (
                            <div key={c.venda_id} className="rounded-lg p-3" style={{ background: 'rgba(22,23,28,0.9)', border: '1px solid var(--border)' }}>
                              <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-mono text-xs font-bold px-2 py-0.5 rounded" style={{ background: 'rgba(212,175,55,0.12)', color: 'var(--accent)' }}>{c.plano}</span>
                                  <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{fmtMoeda(c.credito)}</span>
                                  <span className="text-xs" style={{ color: 'var(--muted-color)' }}>Adesão {c.adesao}%</span>
                                  {sl && <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: `${sl.cor}20`, color: sl.cor }}>{sl.label}</span>}
                                </div>
                                <div className="flex items-center gap-2">
                                  {['master','representante','adm'].includes(meuRole) && <button onClick={() => deletarCota(c)} className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px]" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }}><Trash2 size={11} />Deletar</button>}
                                  {['master','representante','adm','supervisor'].includes(meuRole) && <button onClick={() => { setEditarModal(c); setEdVendedor(c.vendedor_id || ''); setEdEquipe(c.equipe_id || ''); setEdEmpresa(c.empresa_id || ''); setEdParcelas(String(c.qtd_parcelas ?? '')) }} className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px]" style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--text2)', border: '1px solid var(--border)' }}><Pencil size={11} />Editar</button>}
                                  <button onClick={() => toggleChecado(c)} className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px]" style={{ background: c.checado ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.04)', color: c.checado ? '#22c55e' : 'var(--muted-color)', border: `1px solid ${c.checado ? 'rgba(34,197,94,0.3)' : 'var(--border)'}` }}><Check size={11} />{c.checado ? 'Checado' : 'Marcar checado'}</button>
                                  <button onClick={() => baixarProposta(c)} disabled={baixando === c.venda_id} className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px]" style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--text2)', border: '1px solid var(--border)' }}>{baixando === c.venda_id ? <Loader2 size={11} className="animate-spin" /> : <FileText size={11} />}Proposta</button>
                                  {!c.status_lance && <button onClick={() => setLanceModal(c)} className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px]" style={{ background: 'rgba(168,85,247,0.15)', color: '#a855f7', border: '1px solid rgba(168,85,247,0.3)' }}><Target size={11} />Criar lance</button>}
                                </div>
                              </div>
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                                <div><span style={{ color: 'var(--muted-color)' }}>Grupo/Cota:</span> <span style={{ color: 'var(--text2)' }}>{c.grupo}/{c.cota}</span></div>
                                <div><span style={{ color: 'var(--muted-color)' }}>Parcelas antec.:</span> <span style={{ color: 'var(--text2)' }}>{c.qtd_parcelas}</span></div>
                                <div className="flex items-center gap-1"><CalendarClock size={11} style={{ color: 'var(--muted-color)' }} /><span style={{ color: 'var(--muted-color)' }}>Assembleia:</span> <span style={{ color: 'var(--text2)' }}>{fmtData(c.data_assembleia)}</span></div>
                                <div><span style={{ color: 'var(--muted-color)' }}>Próx. cobrança:</span> <span style={{ color: 'var(--text2)' }}>{fmtData(c.proxima_cobranca)}</span></div>
                                {c.vendedor && <div className="col-span-2"><span style={{ color: 'var(--muted-color)' }}>Vendedor:</span> <span style={{ color: 'var(--text2)' }}>{c.vendedor}</span></div>}
                                {sb && <div><span style={{ color: 'var(--muted-color)' }}>Boleto:</span> <span style={{ color: sb.cor }}>{sb.label}</span></div>}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </main>
      </div>

      {editarModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }} onClick={() => setEditarModal(null)} />
          <div className="relative w-full max-w-md rounded-xl p-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <h3 className="text-base font-semibold mb-1" style={{ color: 'var(--text)' }}>Editar atribuição</h3>
            <p className="text-xs mb-4" style={{ color: 'var(--muted-color)' }}>{editarModal.nome} · Grupo {editarModal.grupo}/{editarModal.cota}</p>
            <div className="space-y-3">
              {filtrosOpc.empresas.length > 0 && (
                <div>
                  <label className="block text-xs mb-1" style={{ color: 'var(--muted-color)' }}>Empresa</label>
                  <select value={edEmpresa} onChange={(e) => { setEdEmpresa(e.target.value); setEdEquipe(''); setEdVendedor('') }} className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle}>
                    {filtrosOpc.empresas.map(e => <option key={e.id} value={e.id} style={{ background: '#131313' }}>{e.nome}</option>)}
                  </select>
                  <p className="text-[10px] mt-1" style={{ color: 'var(--muted-color)' }}>Mudar a empresa zera o vendedor/equipe — escolha os novos abaixo.</p>
                </div>
              )}
              {['master','representante','adm'].includes(meuRole) && (
                <div>
                  <label className="block text-xs mb-1" style={{ color: 'var(--muted-color)' }}>Equipe</label>
                  <select value={edEquipe} onChange={(e) => setEdEquipe(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle}>
                    <option value="" style={{ background: '#131313' }}>Sem equipe</option>
                    {filtrosOpc.equipes.filter(eq => !edEmpresa || eq.empresa_id === edEmpresa).map(eq => <option key={eq.id} value={eq.id} style={{ background: '#131313' }}>{eq.nome}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-xs mb-1" style={{ color: 'var(--muted-color)' }}>Vendedor</label>
                <select value={edVendedor} onChange={(e) => setEdVendedor(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle}>
                  <option value="" style={{ background: '#131313' }}>Sem vendedor</option>
                  {filtrosOpc.vendedores.filter(vd => (!edEmpresa || vd.empresa_id === edEmpresa) && (vd.role === 'representante' || !edEquipe || vd.equipe_id === edEquipe)).map(vd => <option key={vd.id} value={vd.id} style={{ background: '#131313' }}>{vd.nome}{vd.role === 'representante' ? ' (Representante)' : ''}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: 'var(--muted-color)' }}>Parcelas antecipadas</label>
                <input type="number" min="0" value={edParcelas} onChange={(e) => setEdParcelas(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle} />
                <p className="text-[10px] mt-1" style={{ color: '#f59e0b' }}>Recalcula o valor do boleto e a próxima cobrança automaticamente.</p>
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={() => setEditarModal(null)} className="flex-1 rounded-lg py-2.5 text-sm" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', color: 'var(--text2)' }}>Cancelar</button>
                <button onClick={salvarEdicao} disabled={salvandoEditar} className="flex-1 flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold disabled:opacity-50" style={{ background: 'linear-gradient(135deg, #d4af37 0%, #c9a227 50%, #b8941f 100%)', color: '#0a0a0a' }}>{salvandoEditar ? <Loader2 size={14} className="animate-spin" /> : 'Salvar'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {lanceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }} onClick={() => setLanceModal(null)} />
          <div className="relative w-full max-w-md rounded-xl p-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <h3 className="text-base font-semibold mb-1" style={{ color: 'var(--text)' }}>Criar lance</h3>
            <p className="text-xs mb-4" style={{ color: 'var(--muted-color)' }}>{lanceModal.nome} · Grupo {lanceModal.grupo}/{lanceModal.cota}</p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs mb-1" style={{ color: 'var(--muted-color)' }}>Tipo de lance</label>
                <div className="grid grid-cols-3 gap-2">
                  {([['fixo25','Fixo 25%'],['fixo50','Fixo 50%'],['valor','Valor R$'],['livre','Livre %']] as const).map(([k, lbl]) => (
                    <button key={k} onClick={() => setTipoLance(k)} className="rounded-lg py-2 text-xs font-medium" style={{ background: tipoLance === k ? 'rgba(212,175,55,0.15)' : 'rgba(255,255,255,0.03)', border: `1px solid ${tipoLance === k ? 'var(--accent)' : 'var(--border)'}`, color: tipoLance === k ? 'var(--accent)' : 'var(--muted-color)' }}>{lbl}</button>
                  ))}
                </div>
              </div>
              {tipoLance !== 'fixo25' && (
                <div>
                  <label className="block text-xs mb-1" style={{ color: 'var(--muted-color)' }}>{tipoLance === 'valor' ? 'Valor (R$)' : 'Percentual (%)'}</label>
                  <input value={valorLance} onChange={(e) => setValorLance(tipoLance === 'valor' ? formatarMoedaInput(e.target.value) : e.target.value)} placeholder={tipoLance === 'valor' ? '50.000,00' : '30'} className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle} />
                </div>
              )}
              <div>
                <label className="block text-xs mb-1" style={{ color: 'var(--muted-color)' }}>Observação (opcional)</label>
                <input value={obsLance} onChange={(e) => setObsLance(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle} />
              </div>
              {(tipoLance === 'fixo50' || (tipoLance === 'livre' && parseFloat(valorLance.replace(',', '.')) > 25)) && (
                <div className="flex items-start gap-2 rounded-lg p-2.5" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
                  <span className="text-[11px]" style={{ color: '#f59e0b' }}>{'\u26A0\uFE0F O lance embutido cobre no máximo 25%. O valor que passar de 25% é recurso próprio do cliente caso ele seja contemplado.'}</span>
                </div>
              )}
              <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: 'var(--text2)' }}>
                <input type="checkbox" checked={recorrente} onChange={(e) => setRecorrente(e.target.checked)} className="accent-yellow-500" />
                Lance recorrente (renova todo mês até contemplar)
              </label>
              <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: 'var(--text2)' }}>
                <input type="checkbox" checked={clienteOfertou} onChange={(e) => setClienteOfertou(e.target.checked)} className="accent-yellow-500" />
                O próprio cliente já ofertou (vai direto para ofertado, sem comprovante)
              </label>
              <div className="flex gap-2 pt-1">
                <button onClick={() => setLanceModal(null)} className="flex-1 rounded-lg py-2.5 text-sm" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', color: 'var(--text2)' }}>Cancelar</button>
                <button onClick={criarLance} disabled={salvandoLance} className="flex-1 flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold disabled:opacity-50" style={{ background: 'linear-gradient(135deg, #d4af37 0%, #c9a227 50%, #b8941f 100%)', color: '#0a0a0a' }}>{salvandoLance ? <Loader2 size={14} className="animate-spin" /> : 'Criar lance'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
