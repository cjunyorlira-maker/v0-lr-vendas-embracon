'use client'

import { useState, useEffect } from 'react'
import Sidebar from '@/components/Sidebar'
import Header from '@/components/Header'
import { CalendarCheck, ChevronDown, ChevronUp, Users, Dices, Target, Gavel, Sparkles, Loader2, Share2 } from 'lucide-react'
import PassarResultado from '@/components/PassarResultado'

interface HistMes {
  mes_referencia: string; mes_label: string; numero_assembleia: number | null
  sorteio_qt: number; lance_livre_qt: number; lance_livre_maior: number | null; lance_livre_menor: number | null
  lance_fixo_50_qt: number; lance_fixo_25_qt: number; total_contemplados: number
}
interface Grupo {
  grupo: string; bem: string; faixa_credito: string | null; proxima_assembleia: string | null
  proxima_num_assembleia: number | null; total_clientes: number
  clientes_por_empresa: { empresa: string; clientes: number }[]
  tem_historico: boolean; historico: HistMes[]
  empresa_ids: string[]; equipe_ids: string[]; vendedor_ids: string[]
}

const CATEGORIAS = [
  { key: 'Imóvel', label: 'Imóvel' },
  { key: 'Veículo', label: 'Auto' },
  { key: 'Pesados', label: 'Pesados' },
]

const fmtPct = (v: number | null) => v == null || v === 0 ? '-' : (v * 100).toFixed(2).replace('.', ',') + '%'
const fmtData = (d: string | null) => {
  if (!d) return '-'
  if (d === 'INAUGURAR') return 'Inaugurar'
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : d
}

export default function AssembleiasPage() {
  const [grupos, setGrupos] = useState<Grupo[]>([])
  const [loading, setLoading] = useState(true)
  const [catAtiva, setCatAtiva] = useState('Imóvel')
  const [aberto, setAberto] = useState<string | null>(null)
  const [buscaGrupo, setBuscaGrupo] = useState('')
  const [modalResultado, setModalResultado] = useState<{ grupo: string; bem: string; mes: HistMes } | null>(null)
  const [filtros, setFiltros] = useState<{ empresas: any[]; equipes: any[]; vendedores: any[] }>({ empresas: [], equipes: [], vendedores: [] })
  const [fEmpresa, setFEmpresa] = useState('')
  const [fEquipe, setFEquipe] = useState('')
  const [fVendedor, setFVendedor] = useState('')

  useEffect(() => {
    fetch('/api/assembleias').then(r => r.json()).then(d => {
      if (d.grupos) setGrupos(d.grupos)
      if (d.filtros) setFiltros(d.filtros)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const gruposDaCat = grupos.filter(g =>
    g.bem === catAtiva &&
    (!buscaGrupo || g.grupo.includes(buscaGrupo.trim())) &&
    (!fEmpresa || g.empresa_ids.includes(fEmpresa)) &&
    (!fEquipe || g.equipe_ids.includes(fEquipe)) &&
    (!fVendedor || g.vendedor_ids.includes(fVendedor))
  ).sort((a, b) => {
    // grupos com assembleia mais próxima primeiro; novos por último
    if (a.proxima_assembleia === 'INAUGURAR') return 1
    if (b.proxima_assembleia === 'INAUGURAR') return -1
    return (a.proxima_assembleia || '').localeCompare(b.proxima_assembleia || '')
  })

  const inputStyle = { background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)' }

  return (
    <div className="relative min-h-screen font-sans">
      <Sidebar />
      <div className="relative lg:ml-60" style={{ zIndex: 1 }}>
        <Header title="Assembleias" />
        <main className="mx-auto max-w-4xl px-6 py-8 lg:px-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: 'rgba(212,175,55,0.15)', border: '1px solid rgba(212,175,55,0.25)' }}><CalendarCheck size={18} style={{ color: 'var(--accent)' }} /></div>
            <div>
              <h2 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>Resultados de Assembleia</h2>
              <p className="text-xs" style={{ color: 'var(--muted-color)' }}>Histórico de contemplações por grupo</p>
            </div>
          </div>

          {/* abas de categoria */}
          <div className="flex gap-2 mb-6">
            {CATEGORIAS.map(c => {
              const qtd = grupos.filter(g => g.bem === c.key).length
              return (
                <button key={c.key} onClick={() => { setCatAtiva(c.key); setAberto(null) }} className="rounded-lg px-4 py-2 text-sm font-medium transition-colors" style={{ background: catAtiva === c.key ? 'rgba(212,175,55,0.15)' : 'rgba(255,255,255,0.03)', border: `1px solid ${catAtiva === c.key ? 'var(--accent)' : 'var(--border)'}`, color: catAtiva === c.key ? 'var(--accent)' : 'var(--muted-color)' }}>
                  {c.label} <span className="text-xs opacity-70">({qtd})</span>
                </button>
              )
            })}
          </div>

          {/* busca e filtros */}
          <div className="mb-6 flex flex-col gap-2">
            <input
              type="text"
              value={buscaGrupo}
              onChange={(e) => setBuscaGrupo(e.target.value)}
              placeholder="Buscar por número do grupo..."
              className="w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', color: 'var(--text)' }}
            />
            <div className="flex flex-wrap gap-2">
              {filtros.empresas.length > 0 && (
                <select value={fEmpresa} onChange={(e) => { setFEmpresa(e.target.value); setFEquipe(''); setFVendedor('') }} className="rounded-lg px-3 py-2 text-sm outline-none flex-1 min-w-[140px]" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                  <option value="" style={{ background: '#131313' }}>Todas as empresas</option>
                  {filtros.empresas.map(e => <option key={e.id} value={e.id} style={{ background: '#131313' }}>{e.nome}</option>)}
                </select>
              )}
              {filtros.equipes.length > 0 && (
                <select value={fEquipe} onChange={(e) => { setFEquipe(e.target.value); setFVendedor('') }} className="rounded-lg px-3 py-2 text-sm outline-none flex-1 min-w-[140px]" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                  <option value="" style={{ background: '#131313' }}>Todas as equipes</option>
                  {filtros.equipes.filter(eq => !fEmpresa || eq.empresa_id === fEmpresa).map(eq => <option key={eq.id} value={eq.id} style={{ background: '#131313' }}>{eq.nome}</option>)}
                </select>
              )}
              {filtros.vendedores.length > 0 && (
                <select value={fVendedor} onChange={(e) => setFVendedor(e.target.value)} className="rounded-lg px-3 py-2 text-sm outline-none flex-1 min-w-[140px]" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                  <option value="" style={{ background: '#131313' }}>Todos os vendedores</option>
                  {filtros.vendedores.filter(v => (!fEmpresa || v.empresa_id === fEmpresa) && (!fEquipe || v.equipe_id === fEquipe)).map(v => <option key={v.id} value={v.id} style={{ background: '#131313' }}>{v.nome}</option>)}
                </select>
              )}
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16"><Loader2 size={24} className="animate-spin" style={{ color: 'var(--accent)' }} /></div>
          ) : gruposDaCat.length === 0 ? (
            <p className="text-sm text-center py-16" style={{ color: 'var(--muted-color)' }}>Nenhum grupo nesta categoria.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {gruposDaCat.map(g => (
                <div key={g.grupo} className="rounded-xl overflow-hidden" style={inputStyle}>
                  {/* cabeçalho do grupo */}
                  <button onClick={() => setAberto(aberto === g.grupo ? null : g.grupo)} className="w-full flex items-center justify-between p-4 text-left">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-base font-semibold" style={{ color: 'var(--text)' }}>Grupo {g.grupo}</span>
                        {!g.tem_historico && <span className="text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1" style={{ background: 'rgba(59,130,246,0.15)', color: '#3b82f6' }}><Sparkles size={10} />Sem assembleia ainda</span>}
                        {g.proxima_num_assembleia && <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'rgba(212,175,55,0.12)', color: 'var(--accent)' }}>Próxima: {g.proxima_num_assembleia}ª assembleia</span>}
                      </div>
                      <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--muted-color)' }}>
                        <span className="flex items-center gap-1"><Users size={12} /> {g.total_clientes} cliente(s)</span>
                        <span>Próx: {fmtData(g.proxima_assembleia)}</span>
                        {g.faixa_credito && <span>R$ {g.faixa_credito}</span>}
                      </div>
                      {/* clientes por empresa */}
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {g.clientes_por_empresa.map(e => (
                          <span key={e.empresa} className="text-[10px] px-2 py-0.5 rounded-md" style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--text2)' }}>{e.empresa}: {e.clientes}</span>
                        ))}
                      </div>
                    </div>
                    {g.tem_historico && (aberto === g.grupo ? <ChevronUp size={18} style={{ color: 'var(--muted-color)' }} /> : <ChevronDown size={18} style={{ color: 'var(--muted-color)' }} />)}
                  </button>

                  {/* histórico expandido */}
                  {aberto === g.grupo && g.tem_historico && (
                    <div className="px-4 pb-4 flex flex-col gap-3" style={{ borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
                      {g.historico.map(h => (
                        <div key={h.mes_referencia} className="rounded-lg p-3" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)' }}>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>{h.mes_label} {h.numero_assembleia ? `· ${h.numero_assembleia}ª assembleia` : ''}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold" style={{ color: 'var(--accent)' }}>{h.total_contemplados} contemplados</span>
                              <button onClick={() => setModalResultado({ grupo: g.grupo, bem: g.bem, mes: h })} className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-md" style={{ background: 'rgba(212,175,55,0.15)', color: 'var(--accent)', border: '1px solid rgba(212,175,55,0.3)' }} title="Passar resultado ao cliente">
                                <Share2 size={11} /> Passar resultado
                              </button>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div className="flex items-center gap-1.5" style={{ color: 'var(--text2)' }}><Dices size={13} style={{ color: '#22c55e' }} /> Sorteio: <b>{h.sorteio_qt}</b></div>
                            <div className="flex items-center gap-1.5" style={{ color: 'var(--text2)' }}><Gavel size={13} style={{ color: '#3b82f6' }} /> Lance Livre: <b>{h.lance_livre_qt}</b></div>
                            <div className="flex items-center gap-1.5" style={{ color: 'var(--text2)' }}><Target size={13} style={{ color: '#f59e0b' }} /> Fixo 50%: <b>{h.lance_fixo_50_qt}</b></div>
                            <div className="flex items-center gap-1.5" style={{ color: 'var(--text2)' }}><Target size={13} style={{ color: '#a855f7' }} /> Fixo 25%: <b>{h.lance_fixo_25_qt}</b></div>
                          </div>
                          {h.lance_livre_qt > 0 && (
                            <div className="mt-2 text-[11px] flex items-center gap-3" style={{ color: 'var(--muted-color)' }}>
                              <span>Lance livre — maior: <b style={{ color: 'var(--text2)' }}>{fmtPct(h.lance_livre_maior)}</b></span>
                              <span>menor: <b style={{ color: 'var(--text2)' }}>{fmtPct(h.lance_livre_menor)}</b></span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
      </main>
      </div>
      {modalResultado && <PassarResultado grupo={modalResultado.grupo} bem={modalResultado.bem} mes={modalResultado.mes} onClose={() => setModalResultado(null)} />}
      </div>
  )
  }
