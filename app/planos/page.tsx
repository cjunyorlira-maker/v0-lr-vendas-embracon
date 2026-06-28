'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import Sidebar from '@/components/Sidebar'
import Header from '@/components/Header'
import { Settings, Check, X, Car, Home, Truck, Briefcase, Package } from 'lucide-react'

interface Plano {
  id: string
  sigla: string
  nome_completo: string
  bem: string
  adesao_percent: number
  duracao_meses: number
  faixa_credito_min: number | null
  faixa_credito_max: number | null
  grupos_embracon: string | null
  indice_reajuste: string | null
  ativo: boolean
}

const bemIcons: Record<string, React.ReactNode> = {
  'Veículo': <Car size={16} />,
  'Imóvel': <Home size={16} />,
  'Pesados': <Truck size={16} />,
  'Serviços': <Briefcase size={16} />,
  'Outros': <Package size={16} />,
}

const bemColors: Record<string, string> = {
  'Veículo': '#3b82f6',
  'Imóvel': '#22c55e',
  'Pesados': '#f59e0b',
  'Serviços': '#a855f7',
  'Outros': '#64748b',
}

function fmtMoeda(v: number | null): string {
  if (v === null) return '-'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}

export default function PlanosPage() {
  const [planos, setPlanos] = useState<Plano[]>([])
  const [loading, setLoading] = useState(true)
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [filtroAtivos, setFiltroAtivos] = useState(true)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: cu } = await supabase
      .from('usuarios')
      .select('role')
      .eq('auth_user_id', user.id)
      .single()
    if (cu) setCurrentUserRole(cu.role)

    const { data } = await supabase
      .from('planos')
      .select('*')
      .order('bem')
      .order('adesao_percent')

    if (data) setPlanos(data as Plano[])
    setLoading(false)
  }

  async function toggleAtivo(plano: Plano) {
    setTogglingId(plano.id)
    const supabase = createClient()
    const { error } = await supabase
      .from('planos')
      .update({ ativo: !plano.ativo, atualizado_em: new Date().toISOString() })
      .eq('id', plano.id)
    if (error) {
      alert('Erro: ' + error.message)
    } else {
      await loadData()
    }
    setTogglingId(null)
  }

  const podeGerenciar = ['master', 'representante', 'adm'].includes(currentUserRole || '')

  const planosFiltrados = filtroAtivos ? planos.filter(p => p.ativo) : planos

  // Agrupa por bem
  const grupos = planosFiltrados.reduce((acc, p) => {
    if (!acc[p.bem]) acc[p.bem] = []
    acc[p.bem].push(p)
    return acc
  }, {} as Record<string, Plano[]>)

  const totalAtivos = planos.filter(p => p.ativo).length

  return (
    <div className="relative min-h-screen font-sans">
      <Sidebar />
      <div className="relative lg:ml-60" style={{ zIndex: 1 }}>
        <Header title="Planos" />
        <main className="mx-auto max-w-[1400px] px-6 py-8 lg:px-8">
          <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: 'rgba(212,175,55,0.15)', border: '1px solid rgba(212,175,55,0.25)' }}>
                <Settings size={18} style={{ color: 'var(--accent)' }} />
              </div>
              <div>
                <h2 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>Catálogo de Planos</h2>
                <p className="text-xs" style={{ color: 'var(--muted-color)' }}>{totalAtivos} plano{totalAtivos !== 1 ? 's' : ''} ativo{totalAtivos !== 1 ? 's' : ''} · {planos.length} total</p>
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer text-xs" style={{ color: 'var(--muted-color)' }}>
              <input type="checkbox" checked={!filtroAtivos} onChange={(e) => setFiltroAtivos(!e.target.checked)} className="accent-yellow-600" />
              Mostrar inativos
            </label>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12"><p className="text-sm" style={{ color: 'var(--muted-color)' }}>Carregando...</p></div>
          ) : Object.keys(grupos).length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2"><Settings size={32} style={{ color: 'var(--muted-color)' }} /><p className="text-sm" style={{ color: 'var(--muted-color)' }}>Nenhum plano</p></div>
          ) : (
            <div className="space-y-6">
              {Object.entries(grupos).map(([bem, lista]) => (
                <div key={bem}>
                  <div className="flex items-center gap-2 mb-3">
                    <span style={{ color: bemColors[bem] || '#64748b' }}>{bemIcons[bem] || <Package size={16} />}</span>
                    <h3 className="text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--text2)' }}>{bem}</h3>
                    <span className="text-xs" style={{ color: 'var(--muted-color)' }}>({lista.length})</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {lista.map((p) => (
                      <div key={p.id} className="rounded-xl p-4" style={{ background: 'rgba(17,18,22,0.92)', boxShadow: '0 8px 24px rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)', border: '1px solid var(--border)', opacity: p.ativo ? 1 : 0.55 }}>
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-sm px-2 py-0.5 rounded" style={{ background: `${bemColors[p.bem]}20`, color: bemColors[p.bem] }}>{p.sigla}</span>
                            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: p.adesao_percent === 1 ? 'rgba(34,197,94,0.15)' : 'rgba(245,158,11,0.15)', color: p.adesao_percent === 1 ? '#22c55e' : '#f59e0b' }}>Adesão {p.adesao_percent}%</span>
                          </div>
                          {podeGerenciar && (
                            <button
                              onClick={() => toggleAtivo(p)}
                              disabled={togglingId === p.id}
                              className="flex items-center gap-1 rounded px-2 py-1 text-xs disabled:opacity-50"
                              style={{ color: p.ativo ? '#ef4444' : '#22c55e', background: p.ativo ? 'rgba(239,68,68,0.08)' : 'rgba(34,197,94,0.08)' }}
                            >
                              {togglingId === p.id ? '...' : (p.ativo ? <><X size={12} />Desativar</> : <><Check size={12} />Ativar</>)}
                            </button>
                          )}
                        </div>
                        <p className="text-sm font-medium mb-2" style={{ color: 'var(--text)' }}>{p.nome_completo}</p>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs" style={{ color: 'var(--muted-color)' }}>
                          <span>Duração: <strong style={{ color: 'var(--text2)' }}>{p.duracao_meses}m</strong></span>
                          <span>Reajuste: <strong style={{ color: 'var(--text2)' }}>{p.indice_reajuste || '-'}</strong></span>
                          <span className="col-span-2">Crédito: <strong style={{ color: 'var(--text2)' }}>{fmtMoeda(p.faixa_credito_min)} a {fmtMoeda(p.faixa_credito_max)}</strong></span>
                          {p.grupos_embracon && <span className="col-span-2">Grupos: <strong style={{ color: 'var(--text2)' }}>{p.grupos_embracon}</strong></span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
