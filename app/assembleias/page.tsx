'use client'

import { useState, useEffect } from 'react'
import Sidebar from '@/components/Sidebar'
import Header from '@/components/Header'
import { CalendarCheck, ChevronDown, ChevronUp, Users, Dices, Target, Gavel, Sparkles, Loader2, Share2, Upload, CheckCircle2, PartyPopper, BarChart3, AlertTriangle, FileText, Download } from 'lucide-react'
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
    { key: 'Imóvel', label: '🏠 Imóvel' },
    { key: 'Veículo', label: '🚗 Auto' },
    { key: 'Pesados', label: '🚛 Pesados' },
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
  const [subindo, setSubindo] = useState(false)
  const [resultadoUpload, setResultadoUpload] = useState<any>(null)
  const [pendentes, setPendentes] = useState<{ grupo: string; bem: string; data_assembleia: string; mes: string }[]>([])
  const [visao, setVisao] = useState<'atual' | 'historico' | 'extrato'>('historico')
  const [meuRole, setMeuRole] = useState<string>('')
  const [extratos, setExtratos] = useState<{ grupo: string; bem: string; arquivo_nome: string; atualizado_em: string }[]>([])
  const [subindoExtrato, setSubindoExtrato] = useState<string | null>(null)
  const [ordenacao, setOrdenacao] = useState<'proxima' | 'contemplam'>('proxima')

  const carregarPendentes = () => {
    fetch('/api/assembleias/pendentes').then(r => r.json()).then(d => { if (d.pendentes) setPendentes(d.pendentes) }).catch(() => {})
  }
  useEffect(() => { carregarPendentes() }, [])
  const carregarExtratos = () => {
    fetch('/api/assembleias/extrato').then(r => r.json()).then(d => { if (d.extratos) setExtratos(d.extratos) }).catch(() => {})
  }
  useEffect(() => { carregarExtratos() }, [])
  useEffect(() => {
    fetch('/api/assembleias').then(r => r.json()).then(d => {
      if (d.grupos) setGrupos(d.grupos)
      if (d.filtros) setFiltros(d.filtros)
      if (d.meu_role) setMeuRole(d.meu_role)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const recarregar = () => {
    fetch('/api/assembleias').then(r => r.json()).then(d => { if (d.grupos) setGrupos(d.grupos) })
  }

  const subirResultado = async (file: File) => {
    setSubindo(true)
    setResultadoUpload(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const r = await fetch('/api/assembleias/upload', { method: 'POST', body: fd })
      const d = await r.json()
      if (d.error) { alert('Erro: ' + d.error) }
      else { setResultadoUpload(d); recarregar(); carregarPendentes() }
    } catch (e) { alert('Erro ao subir o arquivo.') }
    setSubindo(false)
  }

  // mês corrente no formato YYYY-MM
  const mesCorrente = new Date().toISOString().slice(0, 7)
  // média de contemplados dos últimos meses do grupo
  const mediaContemplados = (g: Grupo) => {
    if (!g.historico || g.historico.length === 0) return 0
    const soma = g.historico.reduce((s, h) => s + (h.total_contemplados || 0), 0)
    return Math.round(soma / g.historico.length)
  }

  const podeSubirExtrato = ['adm', 'master', 'representante'].includes(meuRole)

  const subirExtrato = async (file: File) => {
    setSubindoExtrato('subindo')
    try {
      const fd = new FormData()
      fd.append('file', file)
      const r = await fetch('/api/assembleias/extrato', { method: 'POST', body: fd })
      const d = await r.json()
      if (d.error) alert('Erro: ' + d.error)
      else { alert(`Extrato do grupo ${d.grupo} salvo!`); carregarExtratos() }
    } catch (e) { alert('Erro ao subir o extrato.') }
    setSubindoExtrato(null)
  }

  const baixarExtrato = async (grupo: string) => {
    try {
      const r = await fetch(`/api/assembleias/extrato/download?grupo=${grupo}`)
      const d = await r.json()
      if (d.error) { alert('Erro: ' + d.error); return }
      if (d.url) window.open(d.url, '_blank')
    } catch (e) { alert('Erro ao baixar.') }
  }

  const gruposDaCat = grupos.filter(g =>
    g.bem === catAtiva &&
    (!buscaGrupo || g.grupo.includes(buscaGrupo.trim())) &&
    (!fEmpresa || g.empresa_ids.includes(fEmpresa)) &&
    (!fEquipe || g.equipe_ids.includes(fEquipe)) &&
    (!fVendedor || g.vendedor_ids.includes(fVendedor)) &&
    // na visão "mês atual", só grupos que têm registro do mês corrente
    (visao === 'historico' || g.historico?.some(h => h.mes_referencia === mesCorrente))
  ).sort((a, b) => {
    if (ordenacao === 'contemplam') {
      // ordena pela média de contemplados (maior primeiro)
      return mediaContemplados(b) - mediaContemplados(a)
    }
    // ordena por próxima assembleia (novos por último)
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
          <div className="flex items-center justify-between mb-6 gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: 'rgba(212,175,55,0.15)', border: '1px solid rgba(212,175,55,0.25)' }}><CalendarCheck size={18} style={{ color: 'var(--accent)' }} /></div>
              <div>
                <h2 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>Resultados de Assembleia</h2>
                <p className="text-xs" style={{ color: 'var(--muted-color)' }}>Histórico de contemplações por grupo</p>
              </div>
            </div>
            <label className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold cursor-pointer transition-transform hover:scale-105" style={{ background: 'linear-gradient(135deg, #d4af37 0%, #c9a227 50%, #b8941f 100%)', color: '#0a0a0a' }}>
              {subindo ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              {subindo ? 'Processando...' : 'Subir Resultado'}
              <input type="file" accept="application/pdf" className="hidden" disabled={subindo} onChange={(e) => { const f = e.target.files?.[0]; if (f) subirResultado(f); e.target.value = '' }} />
            </label>
          </div>

          {/* alerta: grupos pendentes de subir resultado */}
          {pendentes.length > 0 && (
            <div className="mb-6 rounded-xl p-4" style={{ background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.35)' }}>
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle size={16} style={{ color: '#eab308' }} />
                <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Subir resultados — assembleias já realizadas</span>
              </div>
              <p className="text-xs mb-2" style={{ color: 'var(--muted-color)' }}>
                {pendentes.length} grupo{pendentes.length !== 1 ? 's' : ''} com assembleia realizada e resultado ainda não cadastrado:
              </p>
              <div className="flex flex-wrap gap-2">
                {pendentes.map(p => (
                  <span key={p.grupo} className="text-xs px-2 py-1 rounded-md font-medium" style={{ background: 'rgba(234,179,8,0.15)', color: '#eab308', border: '1px solid rgba(234,179,8,0.3)' }}>
                    Grupo {p.grupo} · {new Date(p.data_assembleia + 'T00:00:00').toLocaleDateString('pt-BR')}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* feedback do upload */}
          {resultadoUpload && (
            <div className="mb-6 rounded-xl p-4" style={{ background: resultadoUpload.cotas_nossas?.length > 0 ? 'rgba(34,197,94,0.1)' : 'rgba(212,175,55,0.08)', border: `1px solid ${resultadoUpload.cotas_nossas?.length > 0 ? 'rgba(34,197,94,0.3)' : 'var(--border)'}` }}>
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 size={16} style={{ color: '#22c55e' }} />
                <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Grupo {resultadoUpload.grupo} · {resultadoUpload.mes_label} processado!</span>
              </div>
              <p className="text-xs mb-2" style={{ color: 'var(--muted-color)' }}>
                Total: {resultadoUpload.resumo?.total} · Sorteio: {resultadoUpload.resumo?.sorteio} · Fixo 50%: {resultadoUpload.resumo?.fixo50} · Fixo 25%: {resultadoUpload.resumo?.fixo25} · Livre: {resultadoUpload.resumo?.livre}
              </p>
              {resultadoUpload.cotas_nossas?.length > 0 ? (
                <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: '#22c55e' }}>
                  <PartyPopper size={16} /> {resultadoUpload.cotas_nossas.length} cota(s) NOSSA(S) contemplada(s)! ({resultadoUpload.cotas_nossas.map((c: any) => `${c.cota} ${c.modalidade}`).join(', ')})
                </div>
              ) : (
                <p className="text-xs" style={{ color: 'var(--muted-color)' }}>Nenhuma cota nossa contemplada neste grupo desta vez.</p>
              )}
              <button onClick={() => setResultadoUpload(null)} className="text-[10px] mt-2 underline" style={{ color: 'var(--muted-color)' }}>Fechar</button>
            </div>
          )}

          {/* abas mês atual / histórico */}
          <div className="flex gap-2 mb-4">
            <button onClick={() => { setVisao('atual'); setAberto(null) }} className="rounded-lg px-4 py-2 text-sm font-medium transition-colors" style={{ background: visao === 'atual' ? 'rgba(212,175,55,0.15)' : 'rgba(255,255,255,0.03)', border: `1px solid ${visao === 'atual' ? 'var(--accent)' : 'var(--border)'}`, color: visao === 'atual' ? 'var(--accent)' : 'var(--muted-color)' }}>Mês Atual</button>
            <button onClick={() => { setVisao('historico'); setAberto(null) }} className="rounded-lg px-4 py-2 text-sm font-medium transition-colors" style={{ background: visao === 'historico' ? 'rgba(212,175,55,0.15)' : 'rgba(255,255,255,0.03)', border: `1px solid ${visao === 'historico' ? 'var(--accent)' : 'var(--border)'}`, color: visao === 'historico' ? 'var(--accent)' : 'var(--muted-color)' }}>Histórico</button>
            <button onClick={() => { setVisao('extrato'); setAberto(null) }} className="rounded-lg px-4 py-2 text-sm font-medium transition-colors" style={{ background: visao === 'extrato' ? 'rgba(212,175,55,0.15)' : 'rgba(255,255,255,0.03)', border: `1px solid ${visao === 'extrato' ? 'var(--accent)' : 'var(--border)'}`, color: visao === 'extrato' ? 'var(--accent)' : 'var(--muted-color)' }}>Extrato do Grupo</button>
          </div>

          {/* abas de categoria */}
          <div className="flex gap-2 mb-6">
            {CATEGORIAS.map(c => {
              const qtd = grupos.filter(g => g.bem === c.key).length
              return (
                <button key={c.key} onClick={() => { setCatAtiva(c.key); setAberto(null) }} className="rounded-lg px-4 py-2 text-sm font-medium transition-colors" style={{ background: catAtiva === c.key ? 'linear-gradient(135deg, #d4af37, #b8941f)' : 'rgba(255,255,255,0.06)', border: `1px solid ${catAtiva === c.key ? '#d4af37' : 'rgba(255,255,255,0.1)'}`, color: catAtiva === c.key ? '#131313' : 'var(--text)', fontWeight: catAtiva === c.key ? 700 : 500, boxShadow: catAtiva === c.key ? '0 4px 14px rgba(212,175,55,0.3)' : 'none' }}>
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
              <select value={ordenacao} onChange={(e) => setOrdenacao(e.target.value as 'proxima' | 'contemplam')} className="rounded-lg px-3 py-2 text-sm outline-none flex-1 min-w-[140px]" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                <option value="proxima" style={{ background: '#131313' }}>Ordenar: Próxima assembleia</option>
                <option value="contemplam" style={{ background: '#131313' }}>Ordenar: Mais contemplam</option>
              </select>
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
              {visao === 'extrato' && (
                <div className="mb-4">
                  {podeSubirExtrato && (
                    <div className="mb-4 rounded-xl p-4" style={{ background: 'rgba(212,175,55,0.08)', border: '1px solid var(--border)' }}>
                      <label className="flex items-center gap-2 cursor-pointer text-sm font-semibold" style={{ color: 'var(--accent)' }}>
                        {subindoExtrato ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                        {subindoExtrato ? 'Processando...' : 'Subir / Atualizar Extrato (PDF)'}
                        <input type="file" accept="application/pdf" className="hidden" disabled={!!subindoExtrato} onChange={(e) => { const f = e.target.files?.[0]; if (f) subirExtrato(f); e.target.value = '' }} />
                      </label>
                      <p className="text-xs mt-1" style={{ color: 'var(--muted-color)' }}>O grupo é identificado automaticamente pelo PDF. Substitui o extrato anterior.</p>
                    </div>
                  )}
                  <div className="flex flex-col gap-2">
                    {extratos
                      .filter(e => e.bem === catAtiva && (!buscaGrupo || e.grupo.includes(buscaGrupo.trim())))
                      .map(e => (
                        <div key={e.grupo} className="flex items-center justify-between rounded-xl p-3" style={{ background: 'rgba(0,0,0,0.12)', border: '1px solid var(--border)' }}>
                          <div className="flex items-center gap-2">
                            <FileText size={15} style={{ color: 'var(--accent)' }} />
                            <div>
                              <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>Grupo {e.grupo}</span>
                              <span className="text-[10px] block" style={{ color: 'var(--muted-color)' }}>Atualizado em {new Date(e.atualizado_em).toLocaleDateString('pt-BR')}</span>
                            </div>
                          </div>
                          <button onClick={() => baixarExtrato(e.grupo)} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg font-medium" style={{ background: 'rgba(212,175,55,0.15)', color: 'var(--accent)', border: '1px solid rgba(212,175,55,0.3)' }}>
                            <Download size={13} /> Baixar
                          </button>
                        </div>
                      ))}
                    {extratos.filter(e => e.bem === catAtiva && (!buscaGrupo || e.grupo.includes(buscaGrupo.trim()))).length === 0 && (
                      <p className="text-sm text-center py-6" style={{ color: 'var(--muted-color)' }}>Nenhum extrato nesta categoria ainda.</p>
                    )}
                  </div>
                </div>
              )}

              {visao !== 'extrato' && gruposDaCat.map(g => (
                <div key={g.grupo} className="rounded-xl overflow-hidden" style={inputStyle}>
                  {/* cabeçalho do grupo */}
                  <button onClick={() => setAberto(aberto === g.grupo ? null : g.grupo)} className="w-full flex items-center justify-between p-4 text-left">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-base font-semibold" style={{ color: 'var(--text)' }}>Grupo {g.grupo}</span>
                        {!g.tem_historico && <span className="text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1" style={{ background: 'rgba(59,130,246,0.15)', color: '#3b82f6' }}><Sparkles size={10} />Sem assembleia ainda</span>}
                        {g.proxima_num_assembleia && <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'rgba(212,175,55,0.12)', color: 'var(--accent)' }}>Próxima: {g.proxima_num_assembleia}ª assembleia</span>}
                      </div>
                      <div className="flex items-center gap-3 text-xs flex-wrap" style={{ color: 'var(--muted-color)' }}>
                        <span className="flex items-center gap-1"><Users size={12} /> {g.total_clientes} cliente(s)</span>
                        <span>Próx: {fmtData(g.proxima_assembleia)}</span>
                        {g.faixa_credito && <span>R$ {g.faixa_credito}</span>}
                        {mediaContemplados(g) > 0 && <span className="flex items-center gap-1" style={{ color: '#22c55e' }}><BarChart3 size={12} /> Média: {mediaContemplados(g)} contemplados/mês</span>}
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
