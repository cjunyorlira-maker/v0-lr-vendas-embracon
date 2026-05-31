'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import Sidebar from '@/components/Sidebar'
import Header from '@/components/Header'
import { FileText, Copy, Check, ArrowRight, Loader2, Clock, Send, DollarSign, Upload, CheckCircle2, Paperclip } from 'lucide-react'

interface Boleto {
  id: string
  qtd_parcelas: number
  valor_boleto: number
  status: string
  boleto_pdf_url: string | null
  clientes?: { nome: string }
  vendas?: { numero_proposta: string; numero_contrato: string; grupo: string; cota: string; valor_credito: number }
  empresas?: { nome: string }
  usuarios?: { nome: string }
}

const STATUS = [
  { key: 'pendente', label: 'Pendentes', cor: '#eab308', icon: Clock, proxLabel: 'Solicitar' },
  { key: 'solicitado', label: 'Solicitados', cor: '#f97316', icon: Send, proxLabel: 'Anexar boleto' },
  { key: 'aguardando_pagamento', label: 'Aguardando pagamento', cor: '#3b82f6', icon: DollarSign, proxLabel: 'Pagou' },
  { key: 'aguardando_baixa', label: 'Aguardando baixa', cor: '#a855f7', icon: Upload, proxLabel: 'Efetivar' },
  { key: 'efetivado', label: 'Efetivados', cor: '#22c55e', icon: CheckCircle2, proxLabel: null },
]

const fmtMoeda = (v: number) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default function BoletosPage() {
  const [boletos, setBoletos] = useState<Boleto[]>([])
  const [loading, setLoading] = useState(true)
  const [abaAtiva, setAbaAtiva] = useState('pendente')
  const [role, setRole] = useState('')
  const [processando, setProcessando] = useState<string | null>(null)
  const [msgModal, setMsgModal] = useState<{ texto: string; boletoId: string } | null>(null)
  const [anexoModal, setAnexoModal] = useState<{ boleto: Boleto } | null>(null)
  const [copiado, setCopiado] = useState(false)
  const [pdfAnexo, setPdfAnexo] = useState<{ base64: string; nome: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: cu } = await supabase.from('usuarios').select('role').eq('auth_user_id', user.id).single()
    if (cu) setRole(cu.role)
    const { data } = await supabase
      .from('boletos')
      .select('id, qtd_parcelas, valor_boleto, status, boleto_pdf_url, data_solicitacao, data_anexo_boleto, data_pagamento, pago_via_ted, clientes(nome), vendas(numero_proposta, numero_contrato, grupo, cota, valor_credito), empresas(nome), usuarios:vendedor_id(nome)')
      .order('criado_em', { ascending: false })
    if (data) setBoletos(data as any)
    setLoading(false)
  }

  function gerarMsgSolicitacao(b: Boleto): string {
    const v = b.vendas
    return `Gostaria de um boleto unico
${b.clientes?.nome || ''}
Grupo/ cota: ${v?.grupo || ''} / ${v?.cota || ''}
Contrato: ${v?.numero_contrato || v?.numero_proposta || ''}
Valor do credito: R$${(v?.valor_credito || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
Quantidade de parcelas: ${b.qtd_parcelas}
Valor do boleto: R$${(b.valor_boleto || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
  }

  function gerarMsgBoletoDisponivel(b: Boleto): string {
    const v = b.vendas
    return `Boleto disponível!
Cliente: ${b.clientes?.nome || ''}
Grupo/Cota: ${v?.grupo || ''}/${v?.cota || ''}
Empresa: ${b.empresas?.nome || ''}
Vendedor: ${b.usuarios?.nome || ''}
Valor: ${fmtMoeda(b.valor_boleto)}
O boleto está em anexo.`
  }

  async function avancarStatus(b: Boleto) {
    if (b.status === 'pendente') { setMsgModal({ texto: gerarMsgSolicitacao(b), boletoId: b.id }); return }
    if (b.status === 'solicitado') { setAnexoModal({ boleto: b }); setPdfAnexo(null); return }
    await confirmarAvanco(b.id, {})
  }

  async function confirmarAvanco(boletoId: string, extra: any) {
    setProcessando(boletoId)
    try {
      const res = await fetch(`/api/boletos/${boletoId}/status`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(extra),
      })
      const data = await res.json()
      if (!res.ok) { alert(data.error || 'Erro'); setProcessando(null); return }
      setMsgModal(null); setAnexoModal(null); setPdfAnexo(null)
      await loadData()
    } catch { alert('Erro de conexão') }
    setProcessando(null)
  }

  // Upload do PDF do boleto e avança status
  async function anexarEAvancar(b: Boleto) {
    if (!pdfAnexo) { alert('Anexe o PDF do boleto'); return }
    setProcessando(b.id)
    try {
      const supabase = createClient()
      const matches = pdfAnexo.base64.match(/^data:(.+);base64,(.+)$/)
      if (!matches) { alert('PDF inválido'); setProcessando(null); return }
      const buffer = Uint8Array.from(atob(matches[2]), c => c.charCodeAt(0))
      const fileName = `${b.id}-${Date.now()}-${pdfAnexo.nome.replace(/[^a-zA-Z0-9.\-]/g, '_')}`
      const { error: upErr } = await supabase.storage.from('boletos-pdf').upload(fileName, buffer, { contentType: 'application/pdf' })
      if (upErr) { alert('Erro ao subir boleto: ' + upErr.message); setProcessando(null); return }
      await confirmarAvanco(b.id, { boleto_pdf_url: fileName, boleto_pdf_nome: pdfAnexo.nome })
    } catch (e) { alert('Erro ao anexar'); setProcessando(null) }
  }

  function handlePdfFile(file: File) {
    if (file.type !== 'application/pdf') { alert('O arquivo deve ser PDF'); return }
    const reader = new FileReader()
    reader.onload = (e) => setPdfAnexo({ base64: e.target?.result as string, nome: file.name })
    reader.readAsDataURL(file)
  }

  async function copiar(texto: string) {
    try { await navigator.clipboard.writeText(texto) } catch {
      const ta = document.createElement('textarea'); ta.value = texto; ta.style.position = 'fixed'; ta.style.opacity = '0'
      document.body.appendChild(ta); ta.focus(); ta.select(); try { document.execCommand('copy') } catch {}; document.body.removeChild(ta)
    }
    setCopiado(true); setTimeout(() => setCopiado(false), 2000)
  }

  const podeOperar = ['master', 'representante', 'adm'].includes(role)
  const podePagar = ['master', 'representante', 'adm', 'supervisor', 'vendedor'].includes(role)
  function diasDesde(dataStr: string | null): number | null {
    if (!dataStr) return null
    const d = new Date(dataStr); const hoje = new Date()
    return Math.floor((hoje.getTime() - d.getTime()) / (1000 * 60 * 60 * 24))
  }
  async function pagouViaTed(boletoId: string) {
    if (!confirm('Confirmar pagamento via TED? O boleto vai direto para Aguardando Baixa.')) return
    const res = await fetch(`/api/boletos/${boletoId}/status`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acao: 'pagou_ted' }) })
    if (res.ok) location.reload(); else alert('Erro ao marcar TED')
  }

  const filtrados = boletos.filter(b => b.status === abaAtiva)
  const contar = (k: string) => boletos.filter(b => b.status === k).length
  const statusAtual = STATUS.find(s => s.key === abaAtiva)
  const podeAvancar = (status: string) => status === 'aguardando_pagamento' ? podePagar : podeOperar

  return (
    <div className="relative min-h-screen font-sans">
      <Sidebar />
      <div className="relative lg:ml-60" style={{ zIndex: 1 }}>
        <Header title="Boletos" />
        <main className="mx-auto max-w-[1400px] px-6 py-8 lg:px-8">
          <div className="flex gap-2 mb-6 flex-wrap">
            {STATUS.map(s => {
              const Icon = s.icon; const ativo = abaAtiva === s.key; const qt = contar(s.key)
              return (
                <button key={s.key} onClick={() => setAbaAtiva(s.key)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-all" style={{ background: ativo ? `${s.cor}20` : 'rgba(255,255,255,0.03)', border: `1px solid ${ativo ? s.cor : 'var(--border)'}`, color: ativo ? s.cor : 'var(--muted-color)' }}>
                  <Icon size={14} />{s.label}<span className="rounded-full px-1.5 py-0.5 text-[10px] font-bold" style={{ background: ativo ? s.cor : 'rgba(255,255,255,0.08)', color: ativo ? '#0a0a0a' : 'var(--muted-color)' }}>{qt}</span>
                </button>
              )
            })}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12"><Loader2 size={20} className="animate-spin" style={{ color: 'var(--accent)' }} /></div>
          ) : filtrados.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2"><FileText size={32} style={{ color: 'var(--muted-color)' }} /><p className="text-sm" style={{ color: 'var(--muted-color)' }}>Nenhum boleto em "{statusAtual?.label}"</p></div>
          ) : (
            <div className="space-y-3">
              {filtrados.map(b => (
                <div key={b.id} className="rounded-xl p-4 flex items-center justify-between flex-wrap gap-3" style={{ background: 'rgba(0,0,0,0.12)', backdropFilter: 'blur(4px)', border: '1px solid var(--border)' }}>
                  <div className="flex-1 min-w-[200px]">
                    <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>{b.clientes?.nome}</p>
                    <div className="flex gap-3 mt-1 text-xs flex-wrap" style={{ color: 'var(--muted-color)' }}>
                      <span>Grupo/Cota: {b.vendas?.grupo}/{b.vendas?.cota}</span>
                      <span>{b.qtd_parcelas} parc.</span>
                      <span className="font-semibold" style={{ color: statusAtual?.cor }}>{fmtMoeda(b.valor_boleto)}</span>
                      {b.boleto_pdf_url && <span className="flex items-center gap-1" style={{ color: '#22c55e' }}><Paperclip size={11} />boleto anexado</span>}
                      {b.status === 'solicitado' && diasDesde(b.data_solicitacao) !== null && <span style={{ color: (diasDesde(b.data_solicitacao) || 0) >= 3 ? '#ef4444' : '#f59e0b' }}>solicitado há {diasDesde(b.data_solicitacao)} dia(s)</span>}
                      {b.status === 'aguardando_baixa' && diasDesde(b.data_pagamento) !== null && <span style={{ color: (diasDesde(b.data_pagamento) || 0) >= 1 ? '#a855f7' : 'var(--muted-color)' }}>aguardando baixa há {diasDesde(b.data_pagamento)} dia(s){(diasDesde(b.data_pagamento) || 0) >= 1 ? ' — verificar' : ''}</span>}
                      {b.pago_via_ted && <span style={{ color: '#a855f7' }}>via TED</span>}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {['pendente', 'solicitado', 'aguardando_pagamento'].includes(b.status) && podeOperar && (
                      <button onClick={() => pagouViaTed(b.id)} className="rounded-lg px-3 py-2 text-xs font-medium" style={{ background: 'rgba(168,85,247,0.15)', color: '#a855f7', border: '1px solid rgba(168,85,247,0.3)' }}>Pagou via TED</button>
                    )}
                    {statusAtual?.proxLabel && podeAvancar(b.status) && (
                      <button onClick={() => avancarStatus(b)} disabled={processando === b.id} className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-50 transition-transform hover:scale-105 active:scale-95" style={{ background: `${statusAtual.cor}20`, color: statusAtual.cor, border: `1px solid ${statusAtual.cor}` }}>
                        {processando === b.id ? <Loader2 size={12} className="animate-spin" /> : <>{statusAtual.proxLabel}<ArrowRight size={12} /></>}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>

      {/* Modal solicitar (copiar mensagem) */}
      {msgModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }} onClick={() => setMsgModal(null)} />
          <div className="relative w-full max-w-md rounded-xl p-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <h3 className="text-base font-semibold mb-1" style={{ color: 'var(--text)' }}>Solicitar boleto</h3>
            <p className="text-xs mb-4" style={{ color: 'var(--muted-color)' }}>Copie e mande no grupo da Embracon. Depois confirme.</p>
            <div className="rounded-lg p-3 mb-4 whitespace-pre-wrap text-sm font-mono" style={{ background: 'rgba(212,175,55,0.08)', border: '1px solid rgba(212,175,55,0.2)', color: 'var(--text2)' }}>{msgModal.texto}</div>
            <button onClick={() => copiar(msgModal.texto)} className="w-full flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold mb-3" style={{ background: copiado ? 'rgba(34,197,94,0.15)' : 'rgba(212,175,55,0.12)', color: copiado ? '#22c55e' : 'var(--accent)' }}>{copiado ? <><Check size={16} />Copiado!</> : <><Copy size={16} />Copiar mensagem</>}</button>
            <div className="flex gap-2">
              <button onClick={() => setMsgModal(null)} className="flex-1 rounded-lg py-2.5 text-sm" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', color: 'var(--text2)' }}>Cancelar</button>
              <button onClick={() => confirmarAvanco(msgModal.boletoId, {})} disabled={processando === msgModal.boletoId} className="flex-1 flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold disabled:opacity-50" style={{ background: 'linear-gradient(135deg, #d4af37 0%, #c9a227 50%, #b8941f 100%)', color: '#0a0a0a' }}>{processando === msgModal.boletoId ? <Loader2 size={14} className="animate-spin" /> : 'Marcar solicitado'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal anexar boleto */}
      {anexoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }} onClick={() => { setAnexoModal(null); setPdfAnexo(null) }} />
          <div className="relative w-full max-w-md rounded-xl p-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <h3 className="text-base font-semibold mb-1" style={{ color: 'var(--text)' }}>Anexar boleto</h3>
            <p className="text-xs mb-4" style={{ color: 'var(--muted-color)' }}>Anexe o PDF do boleto que a Embracon mandou. Ao confirmar, vai pra "Aguardando pagamento".</p>
            <input ref={fileRef} type="file" accept="application/pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePdfFile(f) }} />
            <div onClick={() => fileRef.current?.click()} className="flex flex-col items-center justify-center gap-2 py-6 rounded-lg cursor-pointer mb-4" style={{ border: '2px dashed var(--border)', background: 'rgba(255,255,255,0.02)' }}>
              {pdfAnexo ? (<><Paperclip size={20} style={{ color: '#22c55e' }} /><span className="text-xs" style={{ color: '#22c55e' }}>{pdfAnexo.nome}</span><span className="text-[10px]" style={{ color: 'var(--muted-color)' }}>clique para trocar</span></>) : (<><Upload size={20} style={{ color: 'var(--accent)' }} /><span className="text-xs" style={{ color: 'var(--muted-color)' }}>Clique para selecionar o PDF do boleto</span></>)}
            </div>
            <div className="rounded-lg p-3 mb-4 text-xs" style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)', color: '#3b82f6' }}>Em breve: envio automático via WhatsApp (Evolution). Por enquanto, anexe e mande manual.</div>
            <div className="flex gap-2">
              <button onClick={() => { setAnexoModal(null); setPdfAnexo(null) }} className="flex-1 rounded-lg py-2.5 text-sm" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', color: 'var(--text2)' }}>Cancelar</button>
              <button onClick={() => anexarEAvancar(anexoModal.boleto)} disabled={processando === anexoModal.boleto.id || !pdfAnexo} className="flex-1 flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold disabled:opacity-50" style={{ background: 'linear-gradient(135deg, #d4af37 0%, #c9a227 50%, #b8941f 100%)', color: '#0a0a0a' }}>{processando === anexoModal.boleto.id ? <Loader2 size={14} className="animate-spin" /> : 'Anexar e avançar'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
