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

const DIAS_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
// cabeçalho compacto do grupo de assembleia: "Assembleia 21/07 · ter · faltam 5 dias"
function labelAssembleia(dataStr: string | null): string {
  if (!dataStr) return 'Sem data de assembleia'
  const d = new Date(dataStr + 'T00:00:00')
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
  const diff = Math.round((d.getTime() - hoje.getTime()) / 86400000)
  let quando = ''
  if (diff === 0) quando = 'é HOJE'
  else if (diff > 0) quando = `faltam ${diff} dia${diff === 1 ? '' : 's'}`
  else quando = `foi há ${Math.abs(diff)} dia${Math.abs(diff) === 1 ? '' : 's'}`
  return `Assembleia ${dd}/${mm} · ${DIAS_SEMANA[d.getDay()]} · ${quando}`
}
// agrupa por data_assembleia (mais próxima → distante, null por último) e ordena cards por nome
function agruparPorAssembleia(lista: Lance[]) {
  const grupos: Record<string, Lance[]> = {}
  lista.forEach(l => {
    const k = l.data_assembleia || '__sem__'
    ;(grupos[k] ||= []).push(l)
  })
  const chaves = Object.keys(grupos).sort((a, b) => {
    if (a === '__sem__') return 1
    if (b === '__sem__') return -1
    return a.localeCompare(b)
  })
  chaves.forEach(k => grupos[k].sort((x, y) => (x.clientes?.nome || '').localeCompare(y.clientes?.nome || '')))
  return chaves.map(k => ({ chave: k, data: k === '__sem__' ? null : k, lances: grupos[k] }))
}

export default function LancesPage() {
  const [lances, setLances] = useState<Lance[]>([])
  const [contemplados, setContemplados] = useState<any[]>([])
  const [visao, setVisao] = useState<'andamento' | 'contemplados'>('andamento')
  const [loading, setLoading] = useState(true)
  const [role, setRole] = useState('')
  const [mesRef, setMesRef] = useState('')
  const [processando, setProcessando] = useState<string | null>(null)
  const [historicoModal, setHistoricoModal] = useState<any>(null)
  const [historicoLista, setHistoricoLista] = useState<any[]>([])
  const [carregandoHist, setCarregandoHist] = useState(false)
  const [ofertarModal, setOfertarModal] = useState<Lance | null>(null)
  const [definirModal, setDefinirModal] = useState<Lance | null>(null)
  const [defTipo, setDefTipo] = useState<'fixo25' | 'fixo50' | 'valor' | 'livre'>('fixo25')
  const [defValor, setDefValor] = useState('')
  const [defObs, setDefObs] = useState('')
  const [defRecorrente, setDefRecorrente] = useState(false)
  const [editarLanceModal, setEditarLanceModal] = useState<any>(null)
  const [pdfAnexo, setPdfAnexo] = useState<{ base64: string; nome: string } | null>(null)
  const [justificativa, setJustificativa] = useState('')
  const [fGrupo, setFGrupo] = useState('')
  const [busca, setBusca] = useState('')
  const [confirmarContemplado, setConfirmarContemplado] = useState<Lance | null>(null)
  const [mobileCol, setMobileCol] = useState<'pendente' | 'solicitado' | 'ofertado'>('pendente')
  const [filtroMes, setFiltroMes] = useState<'atual' | 'todos'>('atual')
  const [filtrosOpc, setFiltrosOpc] = useState<{ empresas: any[]; equipes: any[]; vendedores: any[] }>({ empresas: [], equipes: [], vendedores: [] })
  const [fEmpresa, setFEmpresa] = useState('')
  const [fEquipe, setFEquipe] = useState('')
  const [fVendedor, setFVendedor] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => { loadData() }, [])

  async function abrirHistorico(lance: any) {
    setHistoricoModal(lance)
    setCarregandoHist(true)
    setHistoricoLista([])
    try {
      const res = await fetch(`/api/lances/historico?config_id=${lance.lance_config_id}`)
      const data = await res.json()
      if (data.ofertas) setHistoricoLista(data.ofertas)
    } catch {}
    setCarregandoHist(false)
  }

  async function loadData() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const res = await fetch('/api/lances')
    const data = await res.json()
    if (data.lances) { setLances(data.lances); setMesRef(data.mes_referencia); setRole(data.meu_role) }
    if (data.contemplados) setContemplados(data.contemplados)
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
    if (filtroMes === 'atual') {
      const mesCorrente = new Date().toISOString().slice(0, 7)
      // mostra os do mês corrente (pela assembleia ou pelo mês de referência)
      const mesDoLance = l.data_assembleia ? l.data_assembleia.slice(0, 7) : (l.mes_referencia || '')
      if (mesDoLance !== mesCorrente) return false
    }
    if (busca) {
      const b = busca.toLowerCase()
      const bate = (l.clientes?.nome || '').toLowerCase().includes(b) || String(l.grupo || '').toLowerCase().includes(b) || String(l.cota || '').toLowerCase().includes(b) || String(l.numero_proposta || '').includes(b)
      if (!bate) return false
    }
    return true
  })

  const pendentes = lancesFiltrados.filter(l => l.status === 'pendente')
  const solicitados = lancesFiltrados.filter(l => l.status === 'solicitado')
  const ofertados = lancesFiltrados.filter(l => l.status === 'ofertado')
  // estatísticas pro resumo
  const totalContemplados = lancesFiltrados.filter(l => l.contemplado).length
  const hojeStr = new Date().toISOString().slice(0, 10)
  const em7dias = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
  const assembleiaEstaSemana = lancesFiltrados.filter(l => l.data_assembleia && l.data_assembleia >= hojeStr && l.data_assembleia <= em7dias && !l.contemplado).length
  // lances pendentes cuja assembleia já passou = não ofertados a tempo
  const perdidos = lancesFiltrados.filter(l => l.status === 'pendente' && l.data_assembleia && l.data_assembleia < hojeStr && !l.contemplado).length
  const mostrarPerdidos = ['master', 'adm'].includes(role)

  function handlePdf(file: File) {
    if (file.type !== 'application/pdf' && !file.type.startsWith('image/')) { alert('Anexe PDF ou imagem'); return }
    const reader = new FileReader()
    reader.onload = (e) => setPdfAnexo({ base64: e.target?.result as string, nome: file.name })
    reader.readAsDataURL(file)
  }

  async function ofertar(lance: Lance) {
    if (!pdfAnexo && !justificativa.trim()) { alert('Anexe o comprovante ou escreva uma justificativa para ofertar sem ele.'); return }
    setProcessando(lance.id)
    try {
      const supabase = createClient()
      let fileName: string | null = null
      let nomeArquivo: string | null = null
      // comprovante é OPCIONAL: só sobe se foi anexado
      if (pdfAnexo) {
        const matches = pdfAnexo.base64.match(/^data:(.+);base64,(.+)$/)
        if (!matches) { alert('Arquivo inválido'); setProcessando(null); return }
        const buffer = Uint8Array.from(atob(matches[2]), c => c.charCodeAt(0))
        const ext = pdfAnexo.nome.split('.').pop() || 'pdf'
        fileName = `${lance.id}-${Date.now()}.${ext}`
        nomeArquivo = pdfAnexo.nome
        const { error: upErr } = await supabase.storage.from('comprovantes-lance').upload(fileName, buffer, { contentType: matches[1] })
        if (upErr) { alert('Erro ao subir: ' + upErr.message); setProcessando(null); return }
      }
      const res = await fetch('/api/lances/acao', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acao: 'ofertar', lance_id: lance.id, comprovante_url: fileName, comprovante_nome: nomeArquivo, justificativa: !fileName ? justificativa.trim() : null }) })
      if (!res.ok) { const d = await res.json(); alert(d.error || 'Erro'); setProcessando(null); return }
      setOfertarModal(null); setPdfAnexo(null); setJustificativa('')
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

  async function baixarComprovanteHistorico(of: any) {
    if (!of.comprovante_url) return
    try {
      const supabase = createClient()
      const { data } = await supabase.storage.from('comprovantes-lance').createSignedUrl(of.comprovante_url, 60)
      if (data?.signedUrl) window.open(data.signedUrl, '_blank')
    } catch (e) { alert('Erro ao baixar o comprovante.') }
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
    setConfirmarContemplado(null)
    await loadData()
    setProcessando(null)
  }

  function CardLance({ lance }: { lance: Lance }) {
    const hojeStr = new Date().toISOString().slice(0, 10)
    const em7diasStr = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
    const estaSemana = !!lance.data_assembleia && !lance.contemplado && lance.data_assembleia >= hojeStr && lance.data_assembleia <= em7diasStr
    // não ofertado a tempo: pendente com assembleia já passada
    const naoOfertado = lance.status === 'pendente' && !lance.contemplado && !!lance.data_assembleia && lance.data_assembleia < hojeStr
    // pisca apenas quando pendente E a assembleia é dentro de 7 dias
    const piscar = lance.status === 'pendente' && estaSemana
    const bg = lance.contemplado ? 'rgba(34,197,94,0.08)' : naoOfertado ? 'rgba(239,68,68,0.04)' : estaSemana ? 'rgba(239,68,68,0.06)' : 'rgba(0,0,0,0.12)'
    const bd = lance.contemplado ? '1px solid rgba(34,197,94,0.4)' : naoOfertado ? '1px solid rgba(239,68,68,0.35)' : estaSemana ? '1px solid rgba(239,68,68,0.4)' : '1px solid var(--border)'
    return (
      <div className="rounded-xl p-4" style={{ background: bg, backdropFilter: 'blur(4px)', border: bd, opacity: naoOfertado ? 0.75 : 1, animation: piscar ? 'piscaLance 1.5s ease-in-out infinite' : 'none' }}>
        {naoOfertado && (
          <div className="flex items-center gap-1 mb-2 text-[11px] font-semibold px-2 py-1 rounded" style={{ background: 'rgba(239,68,68,0.12)', color: '#ef4444', width: 'fit-content' }}>
            {'\u26a0\ufe0f'} Não ofertado a tempo
          </div>
        )}
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>{lance.clientes?.nome}</span>
          <div className="flex items-center gap-2">
            {lance.contemplado && <span className="flex items-center gap-1 text-xs font-bold" style={{ color: '#22c55e' }}><Trophy size={12} />Contemplado</span>}
            <button onClick={() => abrirHistorico(lance)} title="Histórico de ofertas" className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--muted-color)', border: '1px solid var(--border)' }}><Clock size={11} />Histórico</button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 text-xs mb-3" style={{ color: 'var(--muted-color)' }}>
          <span className="px-2 py-0.5 rounded" style={{ background: 'rgba(212,175,55,0.12)', color: 'var(--accent)' }}>{descTipo(lance.lances_config)}</span>
          {lance.grupo && <span className="flex items-center gap-1">Grupo {lance.grupo}/{lance.cota}</span>}
          {lance.usuarios?.nome && <span className="flex items-center gap-1">Vend: {lance.usuarios.nome}</span>}
          {lance.equipes?.nome && <span className="flex items-center gap-1">Equipe: {lance.equipes.nome}</span>}
          {lance.data_assembleia && <span className="flex items-center gap-1"><Clock size={11} />Assemb: {fmtData(lance.data_assembleia)}</span>}
          {estaSemana && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded font-semibold" style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}><Clock size={11} />Esta semana</span>
          )}
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
                <input type="checkbox" checked={false} onChange={() => setConfirmarContemplado(lance)} disabled={processando === lance.id} className="accent-green-500" />
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
              <p className="text-xs" style={{ color: 'var(--muted-color)' }}>{mesRef}</p>
            </div>
          </div>

          {/* resumo */}
          {!loading && (
            <div className={`grid grid-cols-2 gap-3 mb-6 ${mostrarPerdidos ? 'md:grid-cols-5' : 'md:grid-cols-4'}`}>
              <div className="rounded-xl p-4" style={{ background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.25)' }}>
                <p className="text-xs mb-1" style={{ color: 'var(--muted-color)' }}>Pendentes</p>
                <p className="text-2xl font-bold" style={{ color: '#eab308' }}>{pendentes.length}</p>
              </div>
              <div className="rounded-xl p-4" style={{ background: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.25)' }}>
                <p className="text-xs mb-1" style={{ color: 'var(--muted-color)' }}>Ofertados</p>
                <p className="text-2xl font-bold" style={{ color: '#f97316' }}>{ofertados.length}</p>
              </div>
              <div className="rounded-xl p-4" style={{ background: assembleiaEstaSemana > 0 ? 'rgba(239,68,68,0.1)' : 'rgba(0,0,0,0.12)', border: `1px solid ${assembleiaEstaSemana > 0 ? 'rgba(239,68,68,0.3)' : 'var(--border)'}` }}>
                <p className="text-xs mb-1" style={{ color: 'var(--muted-color)' }}>Assembleia esta semana</p>
                <p className="text-2xl font-bold" style={{ color: assembleiaEstaSemana > 0 ? '#ef4444' : 'var(--text)' }}>{assembleiaEstaSemana}</p>
              </div>
              <div className="rounded-xl p-4" style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)' }}>
                <p className="text-xs mb-1" style={{ color: 'var(--muted-color)' }}>Contemplados</p>
                <p className="text-2xl font-bold" style={{ color: '#22c55e' }}>{totalContemplados}</p>
              </div>
              {mostrarPerdidos && (
                <div className="rounded-xl p-4" style={{ background: perdidos > 0 ? 'rgba(239,68,68,0.1)' : 'rgba(0,0,0,0.12)', border: `1px solid ${perdidos > 0 ? 'rgba(239,68,68,0.35)' : 'var(--border)'}` }}>
                  <p className="text-xs mb-1" style={{ color: 'var(--muted-color)' }}>Perdidos</p>
                  <p className="text-2xl font-bold" style={{ color: perdidos > 0 ? '#ef4444' : 'var(--text)' }}>{perdidos}</p>
                </div>
              )}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-12"><Loader2 size={20} className="animate-spin" style={{ color: 'var(--accent)' }} /></div>
          ) : (
            <>
            {/* Seletor de visão */}
            <div className="flex gap-2 mb-5">
              <button onClick={() => setVisao('andamento')} className="rounded-full px-4 py-2 text-xs font-semibold transition-colors" style={{ background: visao === 'andamento' ? 'var(--accent)' : 'rgba(255,255,255,0.04)', color: visao === 'andamento' ? '#0a0a0a' : 'var(--muted-color)', border: `1px solid ${visao === 'andamento' ? 'var(--accent)' : 'var(--border)'}` }}>
                Em andamento
              </button>
              <button onClick={() => setVisao('contemplados')} className="flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold transition-colors" style={{ background: visao === 'contemplados' ? 'rgba(34,197,94,0.18)' : 'rgba(255,255,255,0.04)', color: visao === 'contemplados' ? '#22c55e' : 'var(--muted-color)', border: `1px solid ${visao === 'contemplados' ? 'rgba(34,197,94,0.5)' : 'var(--border)'}` }}>
                <Trophy size={13} /> Contemplados ({contemplados.length})
              </button>
            </div>

            {visao === 'contemplados' ? (
              contemplados.length === 0 ? (
                <p className="text-sm text-center py-16" style={{ color: 'var(--muted-color)' }}>Nenhum contemplado ainda.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {contemplados.map((c: any) => (
                    <div key={c.id} className="rounded-xl p-4" style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.4)' }}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{c.clientes?.nome || 'Cliente'}</span>
                        <span className="flex items-center gap-1 text-xs font-bold" style={{ color: '#22c55e' }}><Trophy size={12} />Contemplado</span>
                      </div>
                      <div className="flex flex-wrap gap-2 text-xs" style={{ color: 'var(--muted-color)' }}>
                        <span className="px-2 py-0.5 rounded" style={{ background: 'rgba(212,175,55,0.12)', color: 'var(--accent)' }}>{descTipo(c.lances_config)}</span>
                        {c.grupo && <span>Grupo {c.grupo}/{c.cota}</span>}
                        {c.data_assembleia && <span className="flex items-center gap-1"><Clock size={11} />{fmtData(c.data_assembleia)}</span>}
                        {c.usuarios?.nome && <span>Vend: {c.usuarios.nome}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : (
            <>
            <div className="flex items-center gap-2 mb-5 flex-wrap">
              <div className="flex gap-1 rounded-lg p-0.5" style={{ background: 'rgba(22,23,28,0.9)', border: '1px solid var(--border)' }}>
                <button onClick={() => setFiltroMes('atual')} className="rounded-md px-3 py-1.5 text-xs font-medium transition-colors" style={{ background: filtroMes === 'atual' ? 'var(--accent)' : 'transparent', color: filtroMes === 'atual' ? '#0a0a0a' : 'var(--muted-color)' }}>Mês Atual</button>
                <button onClick={() => setFiltroMes('todos')} className="rounded-md px-3 py-1.5 text-xs font-medium transition-colors" style={{ background: filtroMes === 'todos' ? 'var(--accent)' : 'transparent', color: filtroMes === 'todos' ? '#0a0a0a' : 'var(--muted-color)' }}>Todos</button>
              </div>
              <div className="relative">
                <Search size={15} style={{ color: 'var(--muted-color)', position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
                <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar cliente, grupo ou cota..." className="rounded-lg pl-8 pr-3 py-2 text-sm outline-none w-64" style={{ background: 'rgba(22,23,28,0.9)', border: '1px solid var(--border)', color: 'var(--text)' }} />
              </div>
              {filtrosOpc.empresas.length > 0 && (
                <select value={fEmpresa} onChange={(e) => { setFEmpresa(e.target.value); setFEquipe(''); setFVendedor('') }} className="rounded-lg px-3 py-2 text-sm outline-none" style={{ background: 'rgba(22,23,28,0.9)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                  <option value="" style={{ background: '#131313' }}>Todas empresas</option>
                  {filtrosOpc.empresas.map(e => <option key={e.id} value={e.id} style={{ background: '#131313' }}>{e.nome}</option>)}
                </select>
              )}
              {['master', 'representante', 'adm'].includes(role) && (
                <select value={fEquipe} onChange={(e) => { setFEquipe(e.target.value); setFVendedor('') }} className="rounded-lg px-3 py-2 text-sm outline-none" style={{ background: 'rgba(22,23,28,0.9)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                  <option value="" style={{ background: '#131313' }}>Todas equipes</option>
                  {filtrosOpc.equipes.filter(eq => !fEmpresa || eq.empresa_id === fEmpresa).map(eq => <option key={eq.id} value={eq.id} style={{ background: '#131313' }}>{eq.nome}</option>)}
                </select>
              )}
              {['master', 'representante', 'adm', 'supervisor'].includes(role) && (
                <select value={fVendedor} onChange={(e) => setFVendedor(e.target.value)} className="rounded-lg px-3 py-2 text-sm outline-none" style={{ background: 'rgba(22,23,28,0.9)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                  <option value="" style={{ background: '#131313' }}>Todos vendedores</option>
                  {filtrosOpc.vendedores.filter(vd => (!fEmpresa || vd.empresa_id === fEmpresa) && (!fEquipe || vd.equipe_id === fEquipe)).map(vd => <option key={vd.id} value={vd.id} style={{ background: '#131313' }}>{vd.nome}</option>)}
                </select>
              )}
              <select value={fGrupo} onChange={(e) => setFGrupo(e.target.value)} className="rounded-lg px-3 py-2 text-sm outline-none" style={{ background: 'rgba(22,23,28,0.9)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                <option value="" style={{ background: '#131313' }}>Todos os grupos</option>
                {gruposOrdenados.map(([g, qt]) => <option key={g} value={g} style={{ background: '#131313' }}>Grupo {g} ({qt})</option>)}
              </select>
              {(fGrupo || busca || fEmpresa || fEquipe || fVendedor) && <button onClick={() => { setFGrupo(''); setBusca(''); setFEmpresa(''); setFEquipe(''); setFVendedor('') }} className="rounded-lg px-3 py-1.5 text-xs" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--muted-color)', border: '1px solid var(--border)' }}>Limpar</button>}
            </div>

            {/* Switcher de colunas (mobile) */}
            <div className="flex md:hidden gap-2 mb-4">
              <button onClick={() => setMobileCol('pendente')} className="flex-1 rounded-full px-3 py-2 text-xs font-semibold transition-colors" style={{ background: mobileCol === 'pendente' ? 'rgba(234,179,8,0.18)' : 'rgba(255,255,255,0.04)', color: mobileCol === 'pendente' ? '#eab308' : 'var(--muted-color)', border: `1px solid ${mobileCol === 'pendente' ? 'rgba(234,179,8,0.5)' : 'var(--border)'}` }}>
                {'\u{1F7E1}'} Pendentes ({pendentes.length})
              </button>
              <button onClick={() => setMobileCol('solicitado')} className="flex-1 rounded-full px-3 py-2 text-xs font-semibold transition-colors" style={{ background: mobileCol === 'solicitado' ? 'rgba(249,115,22,0.18)' : 'rgba(255,255,255,0.04)', color: mobileCol === 'solicitado' ? '#f97316' : 'var(--muted-color)', border: `1px solid ${mobileCol === 'solicitado' ? 'rgba(249,115,22,0.5)' : 'var(--border)'}` }}>
                {'\u{1F7E0}'} Solicitados ({solicitados.length})
              </button>
              <button onClick={() => setMobileCol('ofertado')} className="flex-1 rounded-full px-3 py-2 text-xs font-semibold transition-colors" style={{ background: mobileCol === 'ofertado' ? 'rgba(249,115,22,0.18)' : 'rgba(255,255,255,0.04)', color: mobileCol === 'ofertado' ? '#f97316' : 'var(--muted-color)', border: `1px solid ${mobileCol === 'ofertado' ? 'rgba(249,115,22,0.5)' : 'var(--border)'}` }}>
                {'\u{1F7E0}'} Ofertados ({ofertados.length})
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {/* Coluna Pendente */}
              <div className={`${mobileCol === 'pendente' ? 'block' : 'hidden'} md:block`}>
                <div className="flex items-center gap-2 mb-3">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: '#eab308' }} />
                  <h3 className="text-sm font-semibold" style={{ color: '#eab308' }}>Pendentes ({pendentes.length})</h3>
                </div>
                <div className="space-y-5">
                  {pendentes.length === 0 ? <p className="text-xs py-8 text-center" style={{ color: 'var(--muted-color)' }}>Nenhum lance pendente</p> : agruparPorAssembleia(pendentes).map(g => (
                    <div key={g.chave} className="space-y-3">
                      <div className="flex items-center justify-between pb-1" style={{ borderBottom: '1px solid var(--border)' }}>
                        <span className="text-[11px] font-medium" style={{ color: 'var(--muted-color)' }}>{'\u{1F5D3}\uFE0F'} {labelAssembleia(g.data)}</span>
                        <span className="text-[11px]" style={{ color: 'var(--muted-color)' }}>({g.lances.length})</span>
                      </div>
                      {g.lances.map(l => <CardLance key={l.id} lance={l} />)}
                    </div>
                  ))}
                </div>
              </div>
              {/* Coluna Solicitado */}
              <div className={`${mobileCol === 'solicitado' ? 'block' : 'hidden'} md:block`}>
                <div className="flex items-center gap-2 mb-3">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: '#f97316' }} />
                  <h3 className="text-sm font-semibold" style={{ color: '#f97316' }}>Solicitados ({solicitados.length})</h3>
                </div>
                <div className="space-y-5">
                  {solicitados.length === 0 ? <p className="text-xs py-8 text-center" style={{ color: 'var(--muted-color)' }}>Nenhum lance solicitado</p> : agruparPorAssembleia(solicitados).map(g => (
                    <div key={g.chave} className="space-y-3">
                      <div className="flex items-center justify-between pb-1" style={{ borderBottom: '1px solid var(--border)' }}>
                        <span className="text-[11px] font-medium" style={{ color: 'var(--muted-color)' }}>{'\u{1F5D3}\uFE0F'} {labelAssembleia(g.data)}</span>
                        <span className="text-[11px]" style={{ color: 'var(--muted-color)' }}>({g.lances.length})</span>
                      </div>
                      {g.lances.map(l => <CardLance key={l.id} lance={l} />)}
                    </div>
                  ))}
                </div>
              </div>
              {/* Coluna Ofertado */}
              <div className={`${mobileCol === 'ofertado' ? 'block' : 'hidden'} md:block`}>
                <div className="flex items-center gap-2 mb-3">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: '#f97316' }} />
                  <h3 className="text-sm font-semibold" style={{ color: '#f97316' }}>Ofertados ({ofertados.length})</h3>
                </div>
                <div className="space-y-5">
                  {ofertados.length === 0 ? <p className="text-xs py-8 text-center" style={{ color: 'var(--muted-color)' }}>Nenhum lance ofertado</p> : agruparPorAssembleia(ofertados).map(g => (
                    <div key={g.chave} className="space-y-3">
                      <div className="flex items-center justify-between pb-1" style={{ borderBottom: '1px solid var(--border)' }}>
                        <span className="text-[11px] font-medium" style={{ color: 'var(--muted-color)' }}>{'\u{1F5D3}\uFE0F'} {labelAssembleia(g.data)}</span>
                        <span className="text-[11px]" style={{ color: 'var(--muted-color)' }}>({g.lances.length})</span>
                      </div>
                      {g.lances.map(l => <CardLance key={l.id} lance={l} />)}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            </>
            )}
            </>
          )}
        </main>
      </div>

      {/* Modal confirmar contemplação manual */}
      {confirmarContemplado && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }} onClick={() => setConfirmarContemplado(null)} />
          <div className="relative w-full max-w-md rounded-xl p-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <h3 className="text-base font-semibold mb-2 flex items-center gap-2" style={{ color: 'var(--text)' }}><Trophy size={16} style={{ color: '#22c55e' }} />Confirmar contemplação</h3>
            <p className="text-sm mb-5" style={{ color: 'var(--muted-color)' }}>
              Confirma que <span style={{ color: 'var(--text)', fontWeight: 600 }}>{confirmarContemplado.clientes?.nome}</span> foi contemplado na assembleia de {fmtData(confirmarContemplado.data_assembleia)}? Isso encerra o lance (o recorrente para de gerar novos meses).
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmarContemplado(null)} className="rounded-lg px-4 py-2 text-xs font-medium" style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--muted-color)', border: '1px solid var(--border)' }}>Cancelar</button>
              <button onClick={() => marcarContemplado(confirmarContemplado)} disabled={processando === confirmarContemplado.id} className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold" style={{ background: '#22c55e', color: '#0a0a0a' }}>
                {processando === confirmarContemplado.id ? <Loader2 size={13} className="animate-spin" /> : <Trophy size={13} />} Confirmar contemplação
              </button>
            </div>
          </div>
        </div>
      )}

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
                  <input value={defValor} onChange={(e) => setDefValor(defTipo === 'valor' ? formatarMoedaInput(e.target.value) : e.target.value)} placeholder={defTipo === 'valor' ? '50.000,00' : '30'} className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={{ background: 'rgba(22,23,28,0.9)', border: '1px solid var(--border)', color: 'var(--text)' }} />
                </div>
              )}
              <div>
                <label className="block text-xs mb-1" style={{ color: 'var(--muted-color)' }}>Observação (opcional)</label>
                <input value={defObs} onChange={(e) => setDefObs(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={{ background: 'rgba(22,23,28,0.9)', border: '1px solid var(--border)', color: 'var(--text)' }} />
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

      {historicoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }} onClick={() => setHistoricoModal(null)} />
          <div className="relative w-full max-w-md rounded-xl p-6 max-h-[80vh] overflow-y-auto" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <h3 className="text-base font-semibold mb-1" style={{ color: 'var(--text)' }}>Histórico de ofertas</h3>
            <p className="text-xs mb-4" style={{ color: 'var(--muted-color)' }}>{historicoModal.clientes?.nome} · Grupo {historicoModal.grupo}/{historicoModal.cota}</p>
            {carregandoHist ? (
              <div className="flex justify-center py-8"><Loader2 size={18} className="animate-spin" style={{ color: 'var(--accent)' }} /></div>
            ) : historicoLista.length === 0 ? (
              <p className="text-xs text-center py-8" style={{ color: 'var(--muted-color)' }}>Nenhuma oferta registrada ainda.</p>
            ) : (
              <div className="space-y-2">
                {historicoLista.map((of: any, i: number) => {
                  const stLabel = of.contemplado ? 'Contemplado' : of.ciclo_encerrado ? 'Participou (não contemplado)' : of.status === 'ofertado' ? 'Ofertado' : of.status === 'solicitado' ? 'Solicitado' : 'Pendente'
                  const stCor = of.contemplado ? '#22c55e' : of.ciclo_encerrado ? 'var(--muted-color)' : of.status === 'ofertado' ? '#f59e0b' : 'var(--accent)'
                  return (
                    <div key={i} className="rounded-lg p-3" style={{ background: 'rgba(22,23,28,0.9)', border: '1px solid var(--border)' }}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium" style={{ color: stCor }}>{stLabel}</span>
                        {of.data_assembleia && <span className="text-[10px]" style={{ color: 'var(--muted-color)' }}>Assemb: {fmtData(of.data_assembleia)}</span>}
                      </div>
                      {of.comprovante_nome && (
                  <div className="flex items-center justify-between gap-2 mt-1">
                    <p className="text-[10px] truncate" style={{ color: 'var(--muted-color)' }}>{of.comprovante_nome}</p>
                    <button onClick={() => baixarComprovanteHistorico(of)} className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg font-medium shrink-0" style={{ background: 'rgba(59,130,246,0.12)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.3)' }}>
                      <Download size={11} /> Baixar
                    </button>
                  </div>
                )}
                      {of.justificativa_sem_comprovante && <p className="text-[10px] italic" style={{ color: '#f59e0b' }}>Sem comprovante: {of.justificativa_sem_comprovante}</p>}
                    </div>
                  )
                })}
              </div>
            )}
            <button onClick={() => setHistoricoModal(null)} className="w-full mt-4 rounded-lg py-2.5 text-sm" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', color: 'var(--text2)' }}>Fechar</button>
          </div>
        </div>
      )}

      {/* Modal ofertar */}
      {ofertarModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }} onClick={() => { setOfertarModal(null); setPdfAnexo(null); setJustificativa('') }} />
          <div className="relative w-full max-w-md rounded-xl p-6" style={{ background: 'var(--surface, #131313)', border: '1px solid var(--border)' }}>
            <h3 className="text-base font-semibold mb-1" style={{ color: 'var(--text)' }}>Ofertar lance</h3>
            <p className="text-xs mb-4" style={{ color: 'var(--muted-color)' }}>{ofertarModal.clientes?.nome} · {descTipo(ofertarModal.lances_config)}. Anexe o comprovante do lance ofertado.</p>
            <input ref={fileRef} type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePdf(f) }} />
            <div onClick={() => fileRef.current?.click()} className="flex flex-col items-center justify-center gap-2 py-6 rounded-lg cursor-pointer mb-3" style={{ border: '2px dashed var(--border)', background: 'rgba(22,23,28,0.9)' }}>
              {pdfAnexo ? <><Paperclip size={20} style={{ color: '#22c55e' }} /><span className="text-xs" style={{ color: '#22c55e' }}>{pdfAnexo.nome}</span></> : <><Upload size={20} style={{ color: 'var(--accent)' }} /><span className="text-xs" style={{ color: 'var(--muted-color)' }}>Clique para anexar comprovante (PDF ou imagem)</span></>}
            </div>
            {!pdfAnexo && (
              <div className="mb-4">
                <label className="block text-xs mb-1" style={{ color: '#f59e0b' }}>Sem comprovante? Justifique:</label>
                <textarea value={justificativa} onChange={(e) => setJustificativa(e.target.value)} rows={2} placeholder="Ex: ofertado no sistema mas o comprovante ainda não foi gerado pela Embracon" className="w-full rounded-lg px-3 py-2 text-xs outline-none" style={{ background: 'rgba(22,23,28,0.9)', border: '1px solid rgba(245,158,11,0.3)', color: 'var(--text)' }} />
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={() => { setOfertarModal(null); setPdfAnexo(null); setJustificativa('') }} className="flex-1 rounded-lg py-2.5 text-sm" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', color: 'var(--text2)' }}>Cancelar</button>
              <button onClick={() => ofertar(ofertarModal)} disabled={processando === ofertarModal.id || (!pdfAnexo && !justificativa.trim())} className="flex-1 flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold disabled:opacity-50" style={{ background: 'linear-gradient(135deg, #d4af37 0%, #c9a227 50%, #b8941f 100%)', color: '#0a0a0a' }}>{processando === ofertarModal.id ? <Loader2 size={14} className="animate-spin" /> : (pdfAnexo ? 'Ofertar com comprovante' : 'Marcar como ofertado')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
