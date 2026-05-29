'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import Sidebar from '@/components/Sidebar'
import Header from '@/components/Header'
import { FileText, Copy, Check, ArrowRight, Loader2, Clock, Send, DollarSign, Upload, CheckCircle2 } from 'lucide-react'

interface Boleto {
  id: string
  qtd_parcelas: number
  valor_boleto: number
  status: string
  data_proxima_cobranca: string | null
  clientes?: { nome: string }
  vendas?: { numero_proposta: string; numero_contrato: string; grupo: string; cota: string; valor_credito: number }
}

const STATUS = [
  { key: 'pendente', label: 'Pendentes', cor: '#eab308', icon: Clock, proxLabel: 'Solicitar' },
  { key: 'solicitado', label: 'Solicitados', cor: '#f97316', icon: Send, proxLabel: 'Cliente pagou' },
  { key: 'pago_aguardando_baixa', label: 'Aguardando baixa', cor: '#3b82f6', icon: DollarSign, proxLabel: 'Enviar p/ baixa' },
  { key: 'enviado_para_baixa', label: 'Enviados', cor: '#a855f7', icon: Upload, proxLabel: 'Marcar efetivado' },
  { key: 'efetivado', label: 'Efetivados', cor: '#22c55e', icon: CheckCircle2, proxLabel: null },
]

function fmtMoeda(v: number): string {
  return (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function BoletosPage() {
  const [boletos, setBoletos] = useState<Boleto[]>([])
  const [loading, setLoading] = useState(true)
  const [abaAtiva, setAbaAtiva] = useState('pendente')
  const [role, setRole] = useState('')
  const [processando, setProcessando] = useState<string | null>(null)
  const [msgModal, setMsgModal] = useState<{ texto: string; boletoId: string } | null>(null)
  const [copiado, setCopiado] = useState(false)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: cu } = await supabase.from('usuarios').select('role').eq('auth_user_id', user.id).single()
    if (cu) setRole(cu.role)

    const { data } = await supabase
      .from('boletos')
      .select('id, qtd_parcelas, valor_boleto, status, data_proxima_cobranca, clientes(nome), vendas(numero_proposta, numero_contrato, grupo, cota, valor_credito)')
      .order('criado_em', { ascending: false })
    if (data) setBoletos(data as any)
    setLoading(false)
  }

  function gerarMensagem(b: Boleto): string {
    const v = b.vendas
    return `Gostaria de um boleto unico
${b.clientes?.nome || ''}
Grupo/ cota: ${v?.grupo || ''} / ${v?.cota || ''}
Contrato: ${v?.numero_contrato || v?.numero_proposta || ''}
Valor do credito: R$${(v?.valor_credito || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
Quantidade de parcelas: ${b.qtd_parcelas}
Valor do boleto: R$${(b.valor_boleto || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
  }

  async function avancarStatus(b: Boleto) {
    // se está pendente, primeiro mostra a mensagem pra copiar
    if (b.status === 'pendente') {
      setMsgModal({ texto: gerarMensagem(b), boletoId: b.id })
      return
    }
    await confirmarAvanco(b.id)
  }

  async function confirmarAvanco(boletoId: string) {
    setProcessando(boletoId)
    try {
      const res = await fetch(`/api/boletos/${boletoId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao: 'avancar' }),
      })
      const data = await res.json()
      if (!res.ok) { alert(data.error || 'Erro'); setProcessando(null); return }
      setMsgModal(null)
      await loadData()
    } catch { alert('Erro de conexão') }
    setProcessando(null)
  }

  async function copiarMsg(texto: string) {
    try { await navigator.clipboard.writeText(texto) }
    catch {
      const ta = document.createElement('textarea'); ta.value = texto; ta.style.position = 'fixed'; ta.style.opacity = '0'
      document.body.appendChild(ta); ta.focus(); ta.select(); try { document.execCommand('copy') } catch {}; document.body.removeChild(ta)
    }
    setCopiado(true); setTimeout(() => setCopiado(false), 2000)
  }

  const podeOperar = ['master', 'representante', 'adm'].includes(role)
  const podePagar = ['master', 'representante', 'adm', 'supervisor', 'vendedor'].includes(role)
  const filtrados = boletos.filter(b => b.status === abaAtiva)
  const contar = (key: string) => boletos.filter(b => b.status === key).length

  const statusAtual = STATUS.find(s => s.key === abaAtiva)

  // quem pode avançar o status atual?
  function podeAvancar(status: string): boolean {
    if (status === 'solicitado') return podePagar // marcar "pago" pode vendedor tb
    return podeOperar
  }

  return (
    <div className="relative min-h-screen font-sans">
      <Sidebar />
      <div className="relative lg:ml-60" style={{ zIndex: 1 }}>
        <Header title="Boletos" />
        <main className="mx-auto max-w-[1400px] px-6 py-8 lg:px-8">

          {/* Abas */}
          <div className="flex gap-2 mb-6 flex-wrap">
            {STATUS.map(s => {
              const Icon = s.icon
              const ativo = abaAtiva === s.key
              const qt = contar(s.key)
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
                    </div>
                  </div>
                  {statusAtual?.proxLabel && podeAvancar(b.status) && (
                    <button onClick={() => avancarStatus(b)} disabled={processando === b.id} className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-50 transition-transform hover:scale-105 active:scale-95" style={{ background: `${statusAtual.cor}20`, color: statusAtual.cor, border: `1px solid ${statusAtual.cor}` }}>
                      {processando === b.id ? <Loader2 size={12} className="animate-spin" /> : <>{statusAtual.proxLabel}<ArrowRight size={12} /></>}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </main>
      </div>

      {/* Modal da mensagem de solicitação */}
      {msgModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }} onClick={() => setMsgModal(null)} />
          <div className="relative w-full max-w-md rounded-xl p-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <h3 className="text-base font-semibold mb-1" style={{ color: 'var(--text)' }}>Solicitar boleto</h3>
            <p className="text-xs mb-4" style={{ color: 'var(--muted-color)' }}>Copie a mensagem e mande no grupo da Embracon. Depois confirme abaixo.</p>
            <div className="rounded-lg p-3 mb-4 whitespace-pre-wrap text-sm font-mono" style={{ background: 'rgba(212,175,55,0.08)', border: '1px solid rgba(212,175,55,0.2)', color: 'var(--text2)' }}>{msgModal.texto}</div>
            <div className="flex gap-2">
              <button onClick={() => copiarMsg(msgModal.texto)} className="flex-1 flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold" style={{ background: copiado ? 'rgba(34,197,94,0.15)' : 'rgba(212,175,55,0.12)', color: copiado ? '#22c55e' : 'var(--accent)' }}>{copiado ? <><Check size={16} />Copiado!</> : <><Copy size={16} />Copiar mensagem</>}</button>
            </div>
            <div className="flex gap-2 mt-3">
              <button onClick={() => setMsgModal(null)} className="flex-1 rounded-lg py-2.5 text-sm" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', color: 'var(--text2)' }}>Cancelar</button>
              <button onClick={() => confirmarAvanco(msgModal.boletoId)} disabled={processando === msgModal.boletoId} className="flex-1 flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold disabled:opacity-50" style={{ background: 'linear-gradient(135deg, #d4af37 0%, #c9a227 50%, #b8941f 100%)', color: '#0a0a0a' }}>{processando === msgModal.boletoId ? <Loader2 size={14} className="animate-spin" /> : 'Marcar como solicitado'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
