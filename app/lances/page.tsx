'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import Sidebar from '@/components/Sidebar'
import Header from '@/components/Header'
import { Target, Loader2, Upload, Download, Check, Paperclip, Trophy, X, Clock, Search } from 'lucide-react'

interface Lance {
  id: string
  lance_config_id: string
  status: string
  mes_referencia: string
  data_assembleia: string | null
  comprovante_url: string | null
  comprovante_nome: string | null
  comprovante_baixado: boolean
  contemplado: boolean
  grupo?: string | null
  cota?: string | null
  numero_proposta?: string | null
  empresa_id?: string | null
  equipe_id?: string | null
  vendedor_id?: string | null
  clientes?: { nome: string }
  usuarios?: { nome: string }
  equipes?: { nome: string }
  lances_config?: { tipo: string; valor_percentual: number; observacao: string; recorrente: boolean }
}

function descTipo(c?: { tipo: string; valor_percentual: number }): string {
  if (!c) return ''
  if (c.tipo === 'fixo25') return 'Fixo 25%'
  if (c.tipo === 'fixo50') return 'Fixo 50%'
  if (c.tipo === 'valor') return `R$ ${(c.valor_percentual || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
  if (c.tipo === 'livre') return `Livre ${c.valor_percentual || 0}%`
  return ''
}
const fmtData = (d: string | null) => d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : '-'

export default function LancesPage() {
  const [lances, setLances] = useState<Lance[]>([])
  const [loading, setLoading] = useState(true)
  const [role, setRole] = useState('')
  const [mesRef, setMesRef] = useState('')
  const [processando, setProcessando] = useState<string | null>(null)
  const [ofertarModal, setOfertarModal] = useState<Lance | null>(null)
  const [definirModal, setDefinirModal] = useState<Lance | null>(null)
  const [defTipo, setDefTipo] = useState<'fixo25' | 'fixo50' | 'valor' | 'livre'>('fixo25')
  const [defValor, setDefValor] = useState('')
  const [defObs, setDefObs] = useState('')
  const [defRecorrente, setDefRecorrente] = useState(false)
  const [editarLanceModal, setEditarLanceModal] = useState<any>(null)
  const [pdfAnexo, setPdfAnexo] = useState<{ base64: string; nome: string } | null>(null)
  const [fGrupo, setFGrupo] = useState('')
  const [busca, setBusca] = useState('')
  const [filtrosOpc, setFiltrosOpc] = useState<{ empresas: any[]; equipes: any[]; vendedores: any[] }>({ empresas: [], equipes: [], vendedores: [] })
  const [fEmpresa, setFEmpresa] = useState('')
  const [fEquipe, setFEquipe] = useState('')
  const [fVendedor, setFVendedor] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const res = await fetch('/api/lances')
    const data = await res.json()
    if (data.lances) { setLances(data.lances); setMesRef(data.mes_referencia); setRole(data.meu_role) }
    if (data.filtros) setFiltrosOpc(data.filtros)
    setLoading(false)
  }

  const podeOfertar = ['master', 'representante', 'adm'].includes(role)

  // grupos disponíveis (ordenados por quantidade de clientes)
  const gruposContagem: Record<string, number> = {}
  lances.forEach(l => { if (l.grupo) gruposContagem[l.grupo] = (gruposContagem[l.grupo] || 0) + 1 })
  const gruposOrdenados = Object.entries(gruposContagem).sort((a, b) => b[1] - a[1])

  const lancesFiltrados = lances.filter(l => {
    if (fEmpresa && l.empresa_id !== fEmpresa) return false
    if (fEquipe && l.equipe_id !== fEquipe) return false
    if (fVendedor && l.vendedor_id !== fVendedor) return false
    if (fGrupo && String(l.grupo) !== fGrupo) return false
    if (busca) {
      const b = busca.toLowerCase()
      const bate = (l.clientes?.nome || '').toLowerCase().includes(b) || String(l.grupo || '').includes(b) || String(l.numero_proposta || '').includes(b)
      if (!bate) return false
    }
    return true
  })

  const pendentes = lancesFiltrados.filter(l => l.status === 'pendente')
  const solicitados = lancesFiltrados.filter(l => l.status === 'solicitado')
  const ofertados = lancesFiltrados.filter(l => l.status === 'ofertado')

  function handlePdf(file: File) {
    if (file.type !== 'application/pdf' && !file.type.startsWith('image/')) { alert('Anexe PDF ou imagem'); return }
    const reader = new FileReader()
    reader.onload = (e) => setPdfAnexo({ base64: e.target?.result as string, nome: file.name })
    reader.readAsDataURL(file)
  }

  async function ofertar(lance: Lance) {
    if (!pdfAnexo) { alert('Anexe o comprovante'); return }
    setProcessando(lance.id)
    try {
      const supabase = createClient()
      const matches = pdfAnexo.base64.match(/^data:(.+);base64,(.+)$/)
      if (!matches) { alert('Arquivo inválido'); setProcessando(null); return }
      const buffer = Uint8Array.from(atob(matches[2]), c => c.charCodeAt(0))
      const ext = pdfAnexo.nome.split('.').pop() || 'pdf'
      const fileName = `${lance.id}-${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from('comprovantes-lance').upload(fileName, buffer, { contentType: matches[1] })
      if (upErr) { alert('Erro ao subir: ' + upErr.message); setProcessando(null); return }
      const res = await fetch('/api/lances/acao', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acao: 'ofertar', lance_id: lance.id, comprovante_url: fileName, comprovante_nome: pdfAnexo.nome }) })
      if (!res.ok) { const d = await res.json(); alert(d.error || 'Erro'); setProcessando(null); return }
      setOfertarModal(null); setPdfAnexo(null)
      await loadData()
    } catch { alert('Erro ao ofertar') }
    setProcessando(null)
  }

  async function baixarComprovante(lance: Lance) {
    if (!lance.comprovante_url) return
    try {
      const supabase = createClient()
      const { data } = await supabase.storage.from('comprovantes-lance').createSignedUrl(lance.comprovante_url, 60)
      if (data?.signedUrl) {
        window.open(data.signedUrl, '_blank')
        await fetch('/api/lances/acao', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acao: 'baixou_comprovante', lance_id: lance.id }) })
        await loadData()
      }
    } catch { alert('Erro ao baixar') }
  }

  function formatarMoedaInput(v: string): string {
    const num = v.replace(/\D/g, '')
    if (!num) return ''
    const n = parseInt(num) / 100
    return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  async function confirmarDefinir() {
    if (!definirModal) return
    setProcessando(definirModal.id)
    // se o lance já está solicitado ou ofertado, é uma EDIÇÃO; se pendente, é solicitar
    const ehEdicao = definirModal.status === 'solicitado' || definirModal.status === 'ofertado'
    const payload: any = { acao: ehEdicao ? 'editar' : 'solicitar', lance_id: definirModal.id, tipo: defTipo, observacao: defObs, recorrente: defRecorrente }
    if (defTipo !== 'fixo25') {
      const limpo = defTipo === 'valor' ? defValor.replace(/\./g, '').replace(',', '.') : defValor.replace(',', '.')
      payload.valor_percentual = parseFloat(limpo) || 0
    }
    await fetch('/api/lances/acao', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    setDefinirModal(null)
    await loadData()
    setProcessando(null)
  }

  async function marcarContemplado(lance: Lance) {
    setProcessando(lance.id)
    await fetch('/api/lances/acao', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acao: 'contemplado', lance_id: lance.id, config_id: lance.lance_config_id }) })
    await loadData()
    setProcessando(null)
  }

  function CardLance({ lance, piscar }: { lance: Lance; piscar: boolean }) {
    return (
      <div className="rounded-xl p-4" style={{ background: lance.contemplado ? 'rgba(34,197,94,0.08)' : 'rgba(0,0,0,0.12)', backdropFilter: 'blur(4px)', border: lance.contemplado ? '1px solid rgba(34,197,94,0.4)' : '1px solid var(--border)', animation: piscar ? 'piscaLance 1.5s ease-in-out infinite' : 'none' }}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>{lance.clientes?.nome}</span>
          {lance.contemplado && <span className="flex items-center gap-1 text-xs font-bold" style={{ color: '#22c55e' }}><Trophy size={12} />Contemplado</span>}
        </div>
        <div className="flex flex-wrap gap-2 text-xs mb-3" style={{ color: 'var(--muted-color)' }}>
          <span className="px-2 py-0.5 rounded" style={{ background: 'rgba(212,175,55,0.12)', color: 'var(--accent)' }}>{descTipo(lance.lances_config)}</span>
          {lance.grupo && <span className="flex items-center gap-1">Grupo {lance.grupo}/{lance.cota}</span>}
          {lance.usuarios?.nome && <span className="flex items-center gap-1">Vend: {lance.usuarios.nome}</span>}
          {lance.equipes?.nome && <span className="flex items-center gap-1">Equipe: {lance.equipes.nome}</span>}
          {lance.data_assembleia && <span className="flex items-center gap-1"><Clock size={11} />Assemb: {fmtData(lance.data_assembleia)}</span>}
          {lance.lances_config?.recorrente && <span style={{ color: '#a855f7' }}>{'\u267b'} recorrente</span>}
        </div>
        {lance.lances_config?.observacao && <p className="text-xs mb-3 italic" style={{ color: 'var(--muted-color)' }}>{'"'}{lance.lances_config.observacao}{'"'}</p>}

        {lance.status === 'pendente' && (
          <button onClick={() => { setDefinirModal(lance); setDefTipo((lance.lances_config?.tipo as 'fixo25' | 'valor' | 'livre') || 'fixo25'); setDefValor(lance.lances_config?.valor_percentual ? (lance.lances_config?.tipo === 'valor' ? Number(lance.lances_config.valor_percentual).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : String(lance.lances_config.valor_percentual)) : ''); setDefObs(lance.lances_config?.observacao || ''); setDefRecorrente(lance.lances_config?.recorrente || false) }} disabled={processando === lance.id} className="w-full flex items-center justify-center gap-2 rounded-lg py-2 text-xs font-semibold transition-transform hover:scale-105 active:scale-95" style={{ background: 'rgba(234,179,8,0.15)', color: '#eab308', border: '1px solid #eab308' }}>
            <Target size={13} />Definir lance pra ofertar
          </button>
        )}
        {lance.status === 'solicitado' && podeOfertar && (
          <button onClick={() => { setOfertarModal(lance); setPdfAnexo(null) }} className="w-full flex items-center justify-center gap-2 rounded-lg py-2 text-xs font-semibold transition-transform hover:scale-105 active:scale-95" style={{ background: 'rgba(249,115,22,0.15)', color: '#f97316', border: '1px solid #f97316' }}>
            <Upload size={13} />Ofertar lance
          </button>
        )}
        {lance.status === 'solicitado' && (
          <button onClick={() => { setDefinirModal(lance); setDefTipo((lance.lances_config?.tipo as 'fixo25' | 'fixo50' | 'valor' | 'livre') || 'fixo25'); setDefValor(lance.lances_config?.valor_percentual ? (lance.lances_config?.tipo === 'valor' ? Number(lance.lances_config.valor_percentual).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : String(lance.lances_config.valor_percentual)) : ''); setDefObs(lance.lances_config?.observacao || ''); setDefRecorrente(lance.lances_config?.recorrente || false) }} className="w-full flex items-center justify-center gap-2 rounded-lg py-1.5 text-[11px] mt-1" style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--muted-color)', border: '1px solid var(--border)' }}>
            Editar lance
          </button>
        )}
        {lance.status === 'ofertado' && (() => {
          const hoje = new Date().toISOString().slice(0,10)
          const podeTrocar = !lance.data_assembleia || lance.data_assembleia >= hoje
          return podeTrocar ? (
            <button onClick={() => { if (confirm('Trocar este lance? Ele já foi ofertado — a ADM precisa trocar também no sistema da Embracon. O lance voltará para Solicitado.')) { setDefinirModal(lance); setDefTipo((lance.lances_config?.tipo as 'fixo25' | 'fixo50' | 'valor' | 'livre') || 'fixo25'); setDefValor(lance.lances_config?.valor_percentual ? (lance.lances_config?.tipo === 'valor' ? Number(lance.lances_config.valor_percentual).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : String(lance.lances_config.valor_percentual)) : ''); setDefObs(lance.lances_config?.observacao || ''); setDefRecorrente(lance.lances_config?.recorrente || false) } }} className="w-full flex items-center justify-center gap-2 rounded-lg py-1.5 text-[11px] mt-1" style={{ background: 'rgba(245,158,11,0.1)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)' }}>
              Trocar lance
            </button>
          ) : null
        })()}

        {lance.status === 'ofertado' && (
          <div className="space-y-2">
            {lance.comprovante_url && (
              <button onClick={() => baixarComprovante(lance)} className="w-full flex items-center justify-center gap-2 rounded-lg py-2 text-xs font-medium" style={{ background: 'rgba(59,130,246,0.12)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.3)' }}>
                <Download size={13} />Baixar comprovante {lance.comprovante_baixado && <Check size={12} />}
              </button>
            )}
            {lance.comprovante_baixado && <p className="text-[10px] text-center" style={{ color: '#22c55e' }}>{'\u2713'} comprovante baixado</p>}
            {!lance.contemplado && (
              <label className="flex items-center gap-2 text-xs cursor-pointer rounded-lg py-2 px-3" style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)', color: 'var(--text2)' }}>
                <input type="checkbox" onChange={() => marcarContemplado(lance)} disabled={processando === lance.id} className="accent-green-500" />
                Marcar como contemplado
              </label>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="relative min-h-screen font-sans">
      <style>{`@keyframes piscaLance { 0%,100% { box-shadow: 0 0 0 0 rgba(239,68,68,0); border-color: var(--border); } 50% { box-shadow: 0 0 12px 2px rgba(239,68,68,0.4); border-color: #ef4444; } }`}</style>
      <Sidebar />
      <div className="relative lg:ml-60" style={{ zIndex: 1 }}>
        <Header title="Lances" />
        <main className="mx-auto max-w-[1400px] px-6 py-8 lg:px-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: 'rgba(212,175,55,0.15)', border: '1px solid rgba(212,175,55,0.25)' }}><Target size={18} style={{ color: 'var(--accent)' }} /></div>
            <div>
              <h2 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>Lances do mês</h2>
              <p className="text-xs" style={{ color: 'var(--muted-color)' }}>{mesRef} · {pendentes.length} pendente{pendentes.length !== 1 ? 's' : ''} · {ofertados.length} ofertado{ofertados.length !== 1 ? 's' : ''}</p>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12"><Loader2 size={20} className="animate-spin" style={{ color: 'var(--accent)' }} /></div>
          ) : (
            <>
            <div className="flex items-center gap-2 mb-5 flex-wrap">
              <div className="relative">
                <Search size={15} style={{ color: 'var(--muted-color)', position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
                <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar cliente, grupo, proposta..." className="rounded-lg pl-8 pr-3 py-2 text-sm outline-none w-64" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', color: 'var(--text)' }} />
              </div>
              {role === 'master' && (
                <select value={fEmpresa} onChange={(e) => { setFEmpresa(e.target.value); setFEquipe(''); setFVendedor('') }} className="rounded-lg px-3 py-2 text-sm outline-none" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                  <option value="" style={{ background: '#131313' }}>Todas empresas</option>
                  {filtrosOpc.empresas.map(e => <option key={e.id} value={e.id} style={{ background: '#131313' }}>{e.nome}</option>)}
                </select>
              )}
              {['master', 'representante', 'adm'].includes(role) && (
                <select value={fEquipe} onChange={(e) => { setFEquipe(e.target.value); setFVendedor('') }} className="rounded-lg px-3 py-2 text-sm outline-none" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                  <option value="" style={{ background: '#131313' }}>Todos supervisores</option>
                  {filtrosOpc.equipes.filter(eq => !fEmpresa || eq.empresa_id === fEmpresa).map(eq => <option key={eq.id} value={eq.id} style={{ background: '#131313' }}>{eq.nome}</option>)}
                </select>
              )}
              {['master', 'representante', 'adm', 'supervisor'].includes(role) && (
                <select value={fVendedor} onChange={(e) => setFVendedor(e.target.value)} className="rounded-lg px-3 py-2 text-sm outline-none" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                  <option value="" style={{ background: '#131313' }}>Todos vendedores</option>
                  {filtrosOpc.vendedores.filter(vd => (!fEmpresa || vd.empresa_id === fEmpresa) && (!fEquipe || vd.equipe_id === fEquipe)).map(vd => <option key={vd.id} value={vd.id} style={{ background: '#131313' }}>{vd.nome}</option>)}
                </select>
              )}
              <select value={fGrupo} onChange={(e) => setFGrupo(e.target.value)} className="rounded-lg px-3 py-2 text-sm outline-none" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                <option value="" style={{ background: '#131313' }}>Todos os grupos</option>
                {gruposOrdenados.map(([g, qt]) => <option key={g} value={g} style={{ background: '#131313' }}>Grupo {g} ({qt})</option>)}
              </select>
              {(fGrupo || busca || fEmpresa || fEquipe || fVendedor) && <button onClick={() => { setFGrupo(''); setBusca(''); setFEmpresa(''); setFEquipe(''); setFVendedor('') }} className="rounded-lg px-3 py-1.5 text-xs" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--muted-color)', border: '1px solid var(--border)' }}>Limpar</button>}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {/* Coluna Pendente */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: '#eab308' }} />
                  <h3 className="text-sm font-semibold" style={{ color: '#eab308' }}>Pendentes ({pendentes.length})</h3>
                </div>
                <div className="space-y-3">
                  {pendentes.length === 0 ? <p className="text-xs py-8 text-center" style={{ color: 'var(--muted-color)' }}>Nenhum lance pendente</p> : pendentes.map(l => <CardLance key={l.id} lance={l} piscar={true} />)}
                </div>
              </div>
              {/* Coluna Solicitado */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: '#f97316' }} />
                  <h3 className="text-sm font-semibold" style={{ color: '#f97316' }}>Solicitados ({solicitados.length})</h3>
                </div>
                <div className="space-y-3">
                  {solicitados.length === 0 ? <p className="text-xs py-8 text-center" style={{ color: 'var(--muted-color)' }}>Nenhum lance solicitado</p> : solicitados.map(l => <CardLance key={l.id} lance={l} piscar={true} />)}
                </div>
              </div>
              {/* Coluna Ofertado */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: '#f97316' }} />
                  <h3 className="text-sm font-semibold" style={{ color: '#f97316' }}>Ofertados ({ofertados.length})</h3>
                </div>
                <div className="space-y-3">
                  {ofertados.length === 0 ? <p className="text-xs py-8 text-center" style={{ color: 'var(--muted-color)' }}>Nenhum lance ofertado</p> : ofertados.map(l => <CardLance key={l.id} lance={l} piscar={false} />)}
                </div>
              </div>
            </div>
            </>
          )}
        </main>
      </div>

      {/* Modal definir lance */}
      {definirModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }} onClick={() => setDefinirModal(null)} />
          <div className="relative w-full max-w-md rounded-xl p-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <h3 className="text-base font-semibold mb-1" style={{ color: 'var(--text)' }}>Definir lance</h3>
            <p className="text-xs mb-4" style={{ color: 'var(--muted-color)' }}>{definirModal.clientes?.nome} · escolha o lance que quer ofertar este mês.</p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs mb-1" style={{ color: 'var(--muted-color)' }}>Tipo de lance</label>
                <div className="grid grid-cols-2 gap-2">
                  {([['fixo25','Fixo 25%'],['fixo50','Fixo 50%'],['valor','Valor R$'],['livre','Livre %']] as const).map(([k, lbl]) => (
                    <button key={k} onClick={() => setDefTipo(k)} className="rounded-lg py-2 text-xs font-medium" style={{ background: defTipo === k ? 'rgba(212,175,55,0.15)' : 'rgba(255,255,255,0.03)', border: `1px solid ${defTipo === k ? 'var(--accent)' : 'var(--border)'}`, color: defTipo === k ? 'var(--accent)' : 'var(--muted-color)' }}>{lbl}</button>
                  ))}
                </div>
              </div>
              {defTipo !== 'fixo25' && (
                <div>
                  <label className="block text-xs mb-1" style={{ color: 'var(--muted-color)' }}>{defTipo === 'valor' ? 'Valor (R$)' : 'Percentual (%)'}</label>
                  <input value={defValor} onChange={(e) => setDefValor(defTipo === 'valor' ? formatarMoedaInput(e.target.value) : e.target.value)} placeholder={defTipo === 'valor' ? '50.000,00' : '30'} className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', color: 'var(--text)' }} />
                </div>
              )}
              <div>
                <label className="block text-xs mb-1" style={{ color: 'var(--muted-color)' }}>Observação (opcional)</label>
                <input value={defObs} onChange={(e) => setDefObs(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', color: 'var(--text)' }} />
              </div>
              <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: 'var(--text2)' }}>
                <input type="checkbox" checked={defRecorrente} onChange={(e) => setDefRecorrente(e.target.checked)} className="accent-yellow-500" />
                Repetir lance todo mês (recorrente)
              </label>
              <div className="flex gap-2">
                <button onClick={() => setDefinirModal(null)} className="flex-1 rounded-lg py-2.5 text-sm" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', color: 'var(--text2)' }}>Cancelar</button>
                <button onClick={() => confirmarDefinir()} disabled={processando === definirModal.id} className="flex-1 flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold disabled:opacity-50" style={{ background: 'linear-gradient(135deg, #d4af37 0%, #c9a227 50%, #b8941f 100%)', color: '#0a0a0a' }}>{processando === definirModal.id ? <Loader2 size={14} className="animate-spin" /> : 'Solicitar lance'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal ofertar */}
      {ofertarModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }} onClick={() => { setOfertarModal(null); setPdfAnexo(null) }} />
          <div className="relative w-full max-w-md rounded-xl p-6" style={{ background: 'var(--surface, #131313)', border: '1px solid var(--border)' }}>
            <h3 className="text-base font-semibold mb-1" style={{ color: 'var(--text)' }}>Ofertar lance</h3>
            <p className="text-xs mb-4" style={{ color: 'var(--muted-color)' }}>{ofertarModal.clientes?.nome} · {descTipo(ofertarModal.lances_config)}. Anexe o comprovante do lance ofertado.</p>
            <input ref={fileRef} type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePdf(f) }} />
            <div onClick={() => fileRef.current?.click()} className="flex flex-col items-center justify-center gap-2 py-6 rounded-lg cursor-pointer mb-4" style={{ border: '2px dashed var(--border)', background: 'rgba(255,255,255,0.02)' }}>
              {pdfAnexo ? <><Paperclip size={20} style={{ color: '#22c55e' }} /><span className="text-xs" style={{ color: '#22c55e' }}>{pdfAnexo.nome}</span></> : <><Upload size={20} style={{ color: 'var(--accent)' }} /><span className="text-xs" style={{ color: 'var(--muted-color)' }}>Clique para anexar comprovante (PDF ou imagem)</span></>}
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setOfertarModal(null); setPdfAnexo(null) }} className="flex-1 rounded-lg py-2.5 text-sm" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', color: 'var(--text2)' }}>Cancelar</button>
              <button onClick={() => ofertar(ofertarModal)} disabled={processando === ofertarModal.id || !pdfAnexo} className="flex-1 flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold disabled:opacity-50" style={{ background: 'linear-gradient(135deg, #d4af37 0%, #c9a227 50%, #b8941f 100%)', color: '#0a0a0a' }}>{processando === ofertarModal.id ? <Loader2 size={14} className="animate-spin" /> : 'Ofertar'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
