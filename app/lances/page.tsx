'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import Sidebar from '@/components/Sidebar'
import Header from '@/components/Header'
import { Target, Loader2, Upload, Download, Check, Paperclip, Trophy, X, Clock } from 'lucide-react'

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
  clientes?: { nome: string }
  usuarios?: { nome: string }
  lances_config?: { tipo: string; valor_percentual: number; observacao: string; recorrente: boolean }
}

function descTipo(c?: { tipo: string; valor_percentual: number }): string {
  if (!c) return ''
  if (c.tipo === 'fixo25') return 'Fixo 25%'
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
  const [pdfAnexo, setPdfAnexo] = useState<{ base64: string; nome: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const res = await fetch('/api/lances')
    const data = await res.json()
    if (data.lances) { setLances(data.lances); setMesRef(data.mes_referencia); setRole(data.meu_role) }
    setLoading(false)
  }

  const podeOfertar = ['master', 'representante', 'adm'].includes(role)

  // pisca se pendente (sempre, até ofertar)
  const pendentes = lances.filter(l => l.status === 'pendente')
  const solicitados = lances.filter(l => l.status === 'solicitado')
  const ofertados = lances.filter(l => l.status === 'ofertado')

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

  async function solicitarLance(lance: Lance) {
    setProcessando(lance.id)
    await fetch('/api/lances/acao', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acao: 'solicitar', lance_id: lance.id }) })
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
          {lance.data_assembleia && <span className="flex items-center gap-1"><Clock size={11} />Assemb: {fmtData(lance.data_assembleia)}</span>}
          {lance.lances_config?.recorrente && <span style={{ color: '#a855f7' }}>{'\u267b'} recorrente</span>}
        </div>
        {lance.lances_config?.observacao && <p className="text-xs mb-3 italic" style={{ color: 'var(--muted-color)' }}>{'"'}{lance.lances_config.observacao}{'"'}</p>}

        {lance.status === 'pendente' && (
          <button onClick={() => solicitarLance(lance)} disabled={processando === lance.id} className="w-full flex items-center justify-center gap-2 rounded-lg py-2 text-xs font-semibold transition-transform hover:scale-105 active:scale-95" style={{ background: 'rgba(234,179,8,0.15)', color: '#eab308', border: '1px solid #eab308' }}>
            <Target size={13} />Definir lance pra ofertar
          </button>
        )}
        {lance.status === 'solicitado' && podeOfertar && (
          <button onClick={() => { setOfertarModal(lance); setPdfAnexo(null) }} className="w-full flex items-center justify-center gap-2 rounded-lg py-2 text-xs font-semibold transition-transform hover:scale-105 active:scale-95" style={{ background: 'rgba(249,115,22,0.15)', color: '#f97316', border: '1px solid #f97316' }}>
            <Upload size={13} />Ofertar lance
          </button>
        )}

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
          )}
        </main>
      </div>

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
