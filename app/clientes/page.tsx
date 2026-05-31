'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import Sidebar from '@/components/Sidebar'
import Header from '@/components/Header'
import { Users, Loader2, ChevronDown, ChevronUp, Search, SlidersHorizontal, Home, Car, Truck, FileText, Target, Check, CalendarClock } from 'lucide-react'

interface Cota {
  venda_id: string; cliente_id: string; nome: string; cpf: string; telefone: string
  grupo: string; cota: string; credito: number; bem: string; adesao: number | null; plano: string
  data_assembleia: string | null; data_venda: string | null
  vendedor: string | null; vendedor_id: string; equipe_id: string; empresa_id: string
  status_boleto: string; qtd_parcelas: number; proxima_cobranca: string | null
  status_lance: string | null; checado: boolean; pdf_proposta_url: string | null
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
  const [meuRole, setMeuRole] = useState('')
  const [mostraFiltros, setMostraFiltros] = useState(false)
  const [fBem, setFBem] = useState('')
  const [fAdesao, setFAdesao] = useState('')
  const [fLance, setFLance] = useState('')
  const [baixando, setBaixando] = useState<string | null>(null)

  useEffect(() => { load() }, [])
  async function load() {
    setLoading(true)
    const res = await fetch('/api/clientes-lista')
    const data = await res.json()
    if (data.clientes) setClientes(data.clientes)
    if (data.meu_role) setMeuRole(data.meu_role)
    setLoading(false)
  }

  async function baixarProposta(cota: Cota) {
    if (!cota.pdf_proposta_url) { alert('Sem proposta anexada'); return }
    setBaixando(cota.venda_id)
    const supabase = createClient()
    const { data } = await supabase.storage.from('propostas-pdf').createSignedUrl(cota.pdf_proposta_url, 60)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
    setBaixando(null)
  }

  async function toggleChecado(cota: Cota) {
    const supabase = createClient()
    await supabase.from('vendas').update({ checado: !cota.checado }).eq('id', cota.venda_id)
    load()
  }

  // aplica filtros
  const filtrados = clientes.filter(cl => {
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
      if (fLance && c.status_lance !== fLance) return false
      return true
    })
  })

  const inputStyle = { background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', color: 'var(--text)' }

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
            <div className="flex gap-2 mb-4 flex-wrap rounded-xl p-3" style={{ background: 'rgba(0,0,0,0.12)', border: '1px solid var(--border)' }}>
              <select value={fBem} onChange={(e) => setFBem(e.target.value)} className="rounded-lg px-2 py-1.5 text-xs outline-none" style={inputStyle}>
                <option value="" style={{ background: '#131313' }}>Todos os bens</option>
                <option value="Imóvel" style={{ background: '#131313' }}>Imóvel</option>
                <option value="Veículo" style={{ background: '#131313' }}>Veículo</option>
                <option value="Pesados" style={{ background: '#131313' }}>Pesados</option>
              </select>
              <select value={fAdesao} onChange={(e) => setFAdesao(e.target.value)} className="rounded-lg px-2 py-1.5 text-xs outline-none" style={inputStyle}>
                <option value="" style={{ background: '#131313' }}>Toda adesão</option>
                <option value="1" style={{ background: '#131313' }}>1%</option>
                <option value="2" style={{ background: '#131313' }}>2%</option>
              </select>
              <select value={fLance} onChange={(e) => setFLance(e.target.value)} className="rounded-lg px-2 py-1.5 text-xs outline-none" style={inputStyle}>
                <option value="" style={{ background: '#131313' }}>Todos os lances</option>
                <option value="pendente" style={{ background: '#131313' }}>Lance pendente</option>
                <option value="solicitado" style={{ background: '#131313' }}>Lance solicitado</option>
                <option value="contemplado" style={{ background: '#131313' }}>Contemplado</option>
              </select>
              {(fBem || fAdesao || fLance) && <button onClick={() => { setFBem(''); setFAdesao(''); setFLance('') }} className="rounded-lg px-3 py-1.5 text-xs" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--muted-color)', border: '1px solid var(--border)' }}>Limpar</button>}
            </div>
          )}

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
                  <div key={cl.cliente_id} className="rounded-xl overflow-hidden" style={{ background: 'rgba(0,0,0,0.12)', backdropFilter: 'blur(4px)', border: '1px solid var(--border)' }}>
                    <div className="p-4 cursor-pointer" onClick={() => setExpandido(aberto ? null : cl.cliente_id)}>
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="text-base font-semibold" style={{ color: 'var(--text)' }}>{cl.nome}</span>
                          <span className="text-xs" style={{ color: 'var(--muted-color)' }}>{cl.cpf}</span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'rgba(212,175,55,0.12)', color: 'var(--accent)' }}>{cl.cotas.length} cota(s)</span>
                        </div>
                        {aberto ? <ChevronUp size={16} style={{ color: 'var(--muted-color)' }} /> : <ChevronDown size={16} style={{ color: 'var(--muted-color)' }} />}
                      </div>
                      {/* Alertas resumo (antes de expandir) */}
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        {cl.cotas.map((c, i) => {
                          const Icon = bemIcon[c.bem] || Home
                          return <span key={i} className="text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1" style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--text2)' }}><Icon size={10} />{c.bem} {c.adesao}%</span>
                        })}
                        {temLancePendente && <span className="text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1" style={{ background: 'rgba(234,179,8,0.15)', color: '#eab308' }}><Target size={10} />Lance pendente</span>}
                        {cl.cotas.some(c => c.status_lance === 'solicitado') && <span className="text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1" style={{ background: 'rgba(249,115,22,0.15)', color: '#f97316' }}><Target size={10} />Lance solicitado</span>}
                        {cl.cotas.map((c, i) => { const sb = STATUS_BOLETO[c.status_boleto]; return sb ? <span key={'b'+i} className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: `${sb.cor}20`, color: sb.cor }}>{sb.label}</span> : null })}
                        {!algumNaoChecado && <span className="text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1" style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e' }}><Check size={10} />Checado</span>}
                      </div>
                    </div>

                    {aberto && (
                      <div className="px-4 pb-4 space-y-2" style={{ borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
                        {cl.cotas.map(c => {
                          const sb = STATUS_BOLETO[c.status_boleto]
                          const sl = c.status_lance ? STATUS_LANCE[c.status_lance] : null
                          return (
                            <div key={c.venda_id} className="rounded-lg p-3" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)' }}>
                              <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-mono text-xs font-bold px-2 py-0.5 rounded" style={{ background: 'rgba(212,175,55,0.12)', color: 'var(--accent)' }}>{c.plano}</span>
                                  <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{fmtMoeda(c.credito)}</span>
                                  <span className="text-xs" style={{ color: 'var(--muted-color)' }}>Adesão {c.adesao}%</span>
                                  {sl && <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: `${sl.cor}20`, color: sl.cor }}>{sl.label}</span>}
                                </div>
                                <div className="flex items-center gap-2">
                                  <button onClick={() => toggleChecado(c)} className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px]" style={{ background: c.checado ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.04)', color: c.checado ? '#22c55e' : 'var(--muted-color)', border: `1px solid ${c.checado ? 'rgba(34,197,94,0.3)' : 'var(--border)'}` }}><Check size={11} />{c.checado ? 'Checado' : 'Marcar checado'}</button>
                                  <button onClick={() => baixarProposta(c)} disabled={baixando === c.venda_id} className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px]" style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--text2)', border: '1px solid var(--border)' }}>{baixando === c.venda_id ? <Loader2 size={11} className="animate-spin" /> : <FileText size={11} />}Proposta</button>
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
    </div>
  )
}
