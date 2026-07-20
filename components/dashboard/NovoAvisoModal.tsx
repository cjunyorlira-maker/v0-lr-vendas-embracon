'use client'

import { useState } from 'react'
import { X, Pin, Send } from 'lucide-react'

interface Props {
  onClose: () => void
  onCriado: () => void
}

export default function NovoAvisoModal({ onClose, onCriado }: Props) {
  const [titulo, setTitulo] = useState('')
  const [mensagem, setMensagem] = useState('')
  const [fixado, setFixado] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function salvar() {
    if (!titulo.trim() || !mensagem.trim()) { setErro('Preencha título e mensagem'); return }
    setSalvando(true); setErro(null)
    try {
      const r = await fetch('/api/avisos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao: 'criar', titulo, mensagem, fixado, tipo: 'geral' }),
      })
      const d = await r.json()
      if (!r.ok) { setErro(d.error || 'Erro ao publicar'); setSalvando(false); return }
      onCriado()
    } catch {
      setErro('Erro de conexão'); setSalvando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl p-6 card-dark" style={{ background: 'var(--surface)' }} onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-base font-bold" style={{ color: 'var(--text)' }}>Novo aviso</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 transition-colors" style={{ color: 'var(--muted-color)' }} aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-col gap-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium" style={{ color: 'var(--muted-color)' }}>Título</label>
            <input
              value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={120}
              className="w-full rounded-lg px-3 py-2.5 text-sm input-glass"
              style={{ color: 'var(--text)' }} placeholder="Ex.: Reunião geral na sexta"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium" style={{ color: 'var(--muted-color)' }}>Mensagem</label>
            <textarea
              value={mensagem} onChange={(e) => setMensagem(e.target.value)} rows={4} maxLength={600}
              className="w-full resize-none rounded-lg px-3 py-2.5 text-sm input-glass"
              style={{ color: 'var(--text)' }} placeholder="Escreva o comunicado..."
            />
          </div>
          <button
            onClick={() => setFixado((f) => !f)}
            className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm transition-colors"
            style={{
              background: fixado ? 'rgba(212,175,55,0.1)' : 'rgba(255,255,255,0.02)',
              border: `1px solid ${fixado ? 'rgba(212,175,55,0.35)' : 'var(--border)'}`,
              color: fixado ? 'var(--accent)' : 'var(--muted-color)',
            }}
          >
            <Pin size={15} />
            <span className="font-medium">Fixar no topo do quadro</span>
            <span className="ml-auto text-xs">{fixado ? 'Sim' : 'Não'}</span>
          </button>

          {erro && <p className="text-xs" style={{ color: '#ef4444' }}>{erro}</p>}

          <button
            onClick={salvar} disabled={salvando}
            className="mt-1 flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-transform hover:scale-[1.02] active:scale-95 disabled:opacity-60"
            style={{ background: 'linear-gradient(135deg, #d4af37 0%, #c9a227 50%, #b8941f 100%)', color: '#0a0a0a' }}
          >
            <Send size={15} />
            {salvando ? 'Publicando...' : 'Publicar aviso'}
          </button>
        </div>
      </div>
    </div>
  )
}
