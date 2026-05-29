'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import Sidebar from '@/components/Sidebar'
import Header from '@/components/Header'
import { Users, Search, FileText, Phone, Mail, Calendar, ChevronDown, ChevronUp, Target, Loader2, X } from 'lucide-react'

interface Cliente {
  id: string
  nome: string
  cpf_cnpj: string | null
  telefone: string | null
  email: string | null
  criado_em: string
  vendas?: Venda[]
}

interface Venda {
  id: string
  numero_proposta: string | null
  grupo: string | null
  cota: string | null
  valor_credito: number
  adesao_percent: number | null
  data_assembleia_entrada: string | null
  pdf_proposta_url: string | null
  pdf_proposta_nome: string | null
  planos?: { sigla: string; nome_completo: string } | null
}

function fmtMoeda(v: number | null): string {
  if (v === null) return '-'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function fmtData(d: string | null): string {
  if (!d) return '-'
  return new Date(d + (d.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('pt-BR')
}

export default function ClientesPage() {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [expandido, setExpandido] = useState<string | null>(null)
  const [baixando, setBaixando] = useState<string | null>(null)
  const [lanceModal, setLanceModal] = useState<{ clienteId: string; vendaId: string; nome: string } | null>(null)
  const [tipoLance, setTipoLance] = useState<'fixo25' | 'valor' | 'livre'>('fixo25')
  const [valorLance, setValorLance] = useState('')
  const [obsLance, setObsLance] = useState('')
  const [recorrente, setRecorrente] = useState(false)
  const [salvandoLance, setSalvandoLance] = useState(false)

  async function criarLance() {
    if (!lanceModal) return
    setSalvandoLance(true)
    try {
      const valor = tipoLance === 'fixo25' ? 25 : parseFloat(valorLance.replace(/\./g, '').replace(',', '.')) || 0
      const res = await fetch('/api/lances/acao', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao: 'criar', cliente_id: lanceModal.clienteId, venda_id: lanceModal.vendaId, tipo: tipoLance, valor_percentual: valor, observacao: obsLance || null, recorrente }),
      })
      const data = await res.json()
      if (!res.ok) { alert(data.error || 'Erro'); setSalvandoLance(false); return }
      setLanceModal(null); setTipoLance('fixo25'); setValorLance(''); setObsLance(''); setRecorrente(false)
      alert('Lance criado! Acompanhe na tela de Lances.')
    } catch { alert('Erro de conexão') }
    setSalvandoLance(false)
  }

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: vendas } = await supabase
      .from('vendas')
      .select('id, cliente_id, numero_proposta, grupo, cota, valor_credito, adesao_percent, data_assembleia_entrada, pdf_proposta_url, pdf_proposta_nome, planos(sigla, nome_completo), clientes(id, nome, cpf_cnpj, telefone, email, criado_em)')
      .order('criado_em', { ascending: false })

    // Agrupa vendas por cliente
    const mapa = new Map<string, Cliente>()
    for (const v of (vendas || []) as any[]) {
      const c = v.clientes
      if (!c) continue
      if (!mapa.has(c.id)) {
        mapa.set(c.id, { ...c, vendas: [] })
      }
      mapa.get(c.id)!.vendas!.push({
        id: v.id,
        numero_proposta: v.numero_proposta,
        grupo: v.grupo,
        cota: v.cota,
        valor_credito: v.valor_credito,
        adesao_percent: v.adesao_percent,
        data_assembleia_entrada: v.data_assembleia_entrada,
        pdf_proposta_url: v.pdf_proposta_url,
        pdf_proposta_nome: v.pdf_proposta_nome,
        planos: v.planos,
      })
    }
    setClientes(Array.from(mapa.values()))
    setLoading(false)
  }

  async function baixarPdf(venda: Venda) {
    if (!venda.pdf_proposta_url) return
    setBaixando(venda.id)
    try {
      const supabase = createClient()
      const { data } = await supabase.storage.from('propostas-pdf').createSignedUrl(venda.pdf_proposta_url, 60)
      if (data?.signedUrl) window.open(data.signedUrl, '_blank')
    } catch (e) {
      alert('Erro ao baixar PDF')
    }
    setBaixando(null)
  }

  const clientesFiltrados = clientes.filter(c =>
    c.nome.toLowerCase().includes(busca.toLowerCase()) ||
    (c.cpf_cnpj || '').includes(busca) ||
    (c.vendas || []).some(v => (v.grupo || '').includes(busca))
  )

  return (
    <div className="relative min-h-screen font-sans">
      <Sidebar />
      <div className="relative lg:ml-60" style={{ zIndex: 1 }}>
        <Header title="Clientes" />
        <main className="mx-auto max-w-[1400px] px-6 py-8 lg:px-8">
          <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: 'rgba(212,175,55,0.15)', border: '1px solid rgba(212,175,55,0.25)' }}>
                <Users size={18} style={{ color: 'var(--accent)' }} />
              </div>
              <div>
                <h2 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>Clientes</h2>
                <p className="text-xs" style={{ color: 'var(--muted-color)' }}>{clientes.length} cliente{clientes.length !== 1 ? 's' : ''}</p>
              </div>
            </div>
            <div className="relative">
              <Search size={16} style={{ color: 'var(--muted-color)', position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
              <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar nome, CPF, grupo..." className="rounded-lg pl-9 pr-3 py-2 text-sm outline-none w-64" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', color: 'var(--text)' }} />
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12"><p className="text-sm" style={{ color: 'var(--muted-color)' }}>Carregando...</p></div>
          ) : clientesFiltrados.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2"><Users size={32} style={{ color: 'var(--muted-color)' }} /><p className="text-sm" style={{ color: 'var(--muted-color)' }}>Nenhum cliente encontrado</p></div>
          ) : (
            <div className="space-y-3">
              {clientesFiltrados.map((c) => {
                const aberto = expandido === c.id
                return (
                  <div key={c.id} className="rounded-xl overflow-hidden" style={{ background: 'rgba(0,0,0,0.12)', backdropFilter: 'blur(4px)', border: '1px solid var(--border)' }}>
                    <div className="flex items-center justify-between p-4 cursor-pointer" onClick={() => setExpandido(aberto ? null : c.id)}>
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="font-medium text-sm" style={{ color: 'var(--text)' }}>{c.nome}</span>
                        {c.cpf_cnpj && <span className="text-xs" style={{ color: 'var(--muted-color)' }}>{c.cpf_cnpj}</span>}
                        <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(212,175,55,0.12)', color: 'var(--accent)' }}>{c.vendas?.length || 0} venda{(c.vendas?.length || 0) !== 1 ? 's' : ''}</span>
                      </div>
                      {aberto ? <ChevronUp size={16} style={{ color: 'var(--muted-color)' }} /> : <ChevronDown size={16} style={{ color: 'var(--muted-color)' }} />}
                    </div>
                    {aberto && (
                      <div className="px-4 pb-4 space-y-3">
                        <div className="flex flex-wrap gap-4 text-xs pb-3" style={{ color: 'var(--muted-color)', borderBottom: '1px solid var(--border)' }}>
                          {c.telefone && <span className="flex items-center gap-1"><Phone size={12} />{c.telefone}</span>}
                          {c.email && <span className="flex items-center gap-1"><Mail size={12} />{c.email}</span>}
                        </div>
                        {c.vendas?.map((v) => (
                          <div key={v.id} className="rounded-lg p-3" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)' }}>
                            <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                              <div className="flex items-center gap-2 flex-wrap">
                                {v.planos && <span className="font-mono text-xs font-bold px-2 py-0.5 rounded" style={{ background: 'rgba(212,175,55,0.15)', color: 'var(--accent)' }}>{v.planos.sigla}</span>}
                                <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>{fmtMoeda(v.valor_credito)}</span>
                                {v.adesao_percent && <span className="text-xs" style={{ color: 'var(--muted-color)' }}>Adesão {v.adesao_percent}%</span>}
                              </div>
                              <div className="flex items-center gap-2">
                                <button onClick={() => setLanceModal({ clienteId: c.id, vendaId: v.id, nome: c.nome })} className="flex items-center gap-1 text-xs rounded px-2 py-1 transition-transform hover:scale-105 active:scale-95" style={{ color: '#a855f7', background: 'rgba(168,85,247,0.1)' }}>
                                  <Target size={12} />Lance
                                </button>
                                {v.pdf_proposta_url && (
                                  <button onClick={() => baixarPdf(v)} disabled={baixando === v.id} className="flex items-center gap-1 text-xs rounded px-2 py-1 disabled:opacity-50" style={{ color: 'var(--accent)', background: 'rgba(212,175,55,0.08)' }}>
                                    <FileText size={12} />{baixando === v.id ? 'Abrindo...' : 'Baixar proposta'}
                                  </button>
                                )}
                              </div>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs" style={{ color: 'var(--muted-color)' }}>
                              {v.grupo && <span>Grupo/Cota: <strong style={{ color: 'var(--text2)' }}>{v.grupo}/{v.cota}</strong></span>}
                              {v.numero_proposta && <span>Proposta: <strong style={{ color: 'var(--text2)' }}>{v.numero_proposta}</strong></span>}
                              {v.data_assembleia_entrada && <span className="flex items-center gap-1"><Calendar size={11} />Assembleia: <strong style={{ color: 'var(--text2)' }}>{fmtData(v.data_assembleia_entrada)}</strong></span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </main>
      </div>

      {lanceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }} onClick={() => setLanceModal(null)} />
          <div className="relative w-full max-w-md rounded-xl p-6" style={{ background: 'var(--surface, #131313)', border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold" style={{ color: 'var(--text)' }}>Novo lance · {lanceModal.nome}</h3>
              <button onClick={() => setLanceModal(null)}><X size={18} style={{ color: 'var(--muted-color)' }} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs mb-2" style={{ color: 'var(--muted-color)' }}>Tipo de lance</label>
                <div className="grid grid-cols-3 gap-2">
                  {[{ k: 'fixo25', l: 'Fixo 25%' }, { k: 'valor', l: 'Valor R$' }, { k: 'livre', l: 'Livre %' }].map(t => (
                    <button key={t.k} onClick={() => setTipoLance(t.k as any)} className="rounded-lg py-2 text-xs font-medium transition-all" style={{ background: tipoLance === t.k ? 'rgba(212,175,55,0.15)' : 'rgba(255,255,255,0.03)', border: `1px solid ${tipoLance === t.k ? 'var(--accent)' : 'var(--border)'}`, color: tipoLance === t.k ? 'var(--accent)' : 'var(--muted-color)' }}>{t.l}</button>
                  ))}
                </div>
              </div>
              {tipoLance === 'valor' && (
                <div><label className="block text-xs mb-1" style={{ color: 'var(--muted-color)' }}>Valor do lance (R$)</label><input value={valorLance} onChange={(e) => setValorLance(e.target.value)} placeholder="10.000,00" className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', color: 'var(--text)' }} /></div>
              )}
              {tipoLance === 'livre' && (
                <div><label className="block text-xs mb-1" style={{ color: 'var(--muted-color)' }}>Percentual (%)</label><input value={valorLance} onChange={(e) => setValorLance(e.target.value)} placeholder="30" className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', color: 'var(--text)' }} /></div>
              )}
              <div><label className="block text-xs mb-1" style={{ color: 'var(--muted-color)' }}>Observação</label><textarea value={obsLance} onChange={(e) => setObsLance(e.target.value)} rows={2} placeholder="Ex: só embutido / parte do bolso R$ 5.000" className="w-full rounded-lg px-3 py-2 text-sm outline-none resize-none" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', color: 'var(--text)' }} /></div>
              <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--text2)' }}>
                <input type="checkbox" checked={recorrente} onChange={(e) => setRecorrente(e.target.checked)} className="accent-purple-500" />
                Lance recorrente (repete todo mês até contemplar)
              </label>
              <button onClick={criarLance} disabled={salvandoLance} className="w-full flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold disabled:opacity-50 transition-transform hover:scale-105 active:scale-95" style={{ background: 'linear-gradient(135deg, #d4af37 0%, #c9a227 50%, #b8941f 100%)', color: '#0a0a0a' }}>
                {salvandoLance ? <Loader2 size={16} className="animate-spin" /> : <><Target size={16} />Criar lance</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
