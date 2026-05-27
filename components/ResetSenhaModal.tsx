'use client'

import { useState } from 'react'
import { X, KeyRound, Copy, Check, Eye, EyeOff } from 'lucide-react'

interface Props {
  open: boolean
  onClose: () => void
  usuario: { id: string; nome: string; email: string } | null
  onSuccess: () => void
}

export default function ResetSenhaModal({ open, onClose, usuario, onSuccess }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [resultado, setResultado] = useState<{ email: string; nome: string; senha: string } | null>(null)
  const [copiedSenha, setCopiedSenha] = useState(false)
  const [copiedEmail, setCopiedEmail] = useState(false)
  const [showSenha, setShowSenha] = useState(true)

  async function confirmarReset() {
    if (!usuario) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/usuarios/${usuario.id}/reset-senha`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Erro ao resetar senha')
        setLoading(false)
        return
      }
      setResultado({ email: data.email, nome: data.nome, senha: data.senha_temporaria })
      onSuccess()
    } catch {
      setError('Erro de conexão')
    }
    setLoading(false)
  }

  function handleClose() {
    setError('')
    setResultado(null)
    setCopiedSenha(false)
    setCopiedEmail(false)
    setShowSenha(true)
    onClose()
  }

  async function copyValue(value: string, tipo: 'senha' | 'email') {
    try {
      await navigator.clipboard.writeText(value)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = value
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.focus()
      ta.select()
      try { document.execCommand('copy') } catch {}
      document.body.removeChild(ta)
    }
    if (tipo === 'senha') {
      setCopiedSenha(true)
      setTimeout(() => setCopiedSenha(false), 2000)
    } else {
      setCopiedEmail(true)
      setTimeout(() => setCopiedEmail(false), 2000)
    }
  }

  if (!open || !usuario) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }} onClick={handleClose} />
      <div className="relative w-full max-w-md rounded-xl p-6" style={{ background: 'var(--surface)', border: '1px solid rgba(59,130,246,0.3)' }}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg" style={{ background: 'rgba(59,130,246,0.15)' }}>
              <KeyRound size={20} style={{ color: '#3b82f6' }} />
            </div>
            <h3 className="text-base font-semibold" style={{ color: 'var(--text)' }}>
              {resultado ? 'Senha resetada' : 'Resetar senha'}
            </h3>
          </div>
          <button onClick={handleClose} className="p-1 rounded-lg" style={{ color: 'var(--muted-color)' }}>
            <X size={18} />
          </button>
        </div>

        {!resultado ? (
          <>
            <p className="text-sm mb-4" style={{ color: 'var(--muted-color)' }}>
              Resetar senha de <strong style={{ color: 'var(--text)' }}>{usuario.nome}</strong>? Uma nova senha temporária será gerada e ele(a) será obrigado(a) a trocar no próximo login.
            </p>

            {error && (
              <div className="rounded-lg p-3 text-sm mb-4" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
                {error}
              </div>
            )}

            <div className="flex gap-2 justify-end">
              <button onClick={handleClose} className="rounded-lg px-4 py-2 text-sm" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', color: 'var(--text2)' }}>
                Cancelar
              </button>
              <button onClick={confirmarReset} disabled={loading} className="rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ background: '#3b82f6', color: '#fff' }}>
                {loading ? '...' : 'Resetar senha'}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm mb-4" style={{ color: 'var(--text2)' }}>
              Passe esses dados pro <strong>{resultado.nome}</strong>. <strong>Não serão mostrados de novo.</strong>
            </p>

            <div className="mb-3">
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--muted-color)' }}>Email</label>
              <div className="flex items-center justify-between rounded-lg p-3" style={{ background: 'rgba(212,175,55,0.08)', border: '1px solid rgba(212,175,55,0.2)' }}>
                <span className="font-mono text-sm" style={{ color: 'var(--text)' }}>{resultado.email}</span>
                <button onClick={() => copyValue(resultado.email, 'email')} className="p-1.5 rounded" style={{ color: copiedEmail ? '#22c55e' : 'var(--accent)' }} title="Copiar email">
                  {copiedEmail ? <Check size={16} /> : <Copy size={16} />}
                </button>
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--muted-color)' }}>Nova senha temporária</label>
              <div className="flex items-center justify-between rounded-lg p-3" style={{ background: 'rgba(212,175,55,0.08)', border: '1px solid rgba(212,175,55,0.2)' }}>
                <span className="font-mono text-base font-bold tracking-wider" style={{ color: 'var(--accent)' }}>
                  {showSenha ? resultado.senha : '••••••••••••'}
                </span>
                <div className="flex items-center gap-1">
                  <button onClick={() => setShowSenha(!showSenha)} className="p-1.5 rounded" style={{ color: 'var(--muted-color)' }}>
                    {showSenha ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                  <button onClick={() => copyValue(resultado.senha, 'senha')} className="p-1.5 rounded" style={{ color: copiedSenha ? '#22c55e' : 'var(--accent)' }} title="Copiar senha">
                    {copiedSenha ? <Check size={16} /> : <Copy size={16} />}
                  </button>
                </div>
              </div>
            </div>

            <div className="rounded-lg p-3 text-xs mb-4" style={{ background: 'rgba(245,158,11,0.1)', color: '#f59e0b' }}>
              Anote ou copie agora. No próximo login o usuário será forçado a trocar essa senha.
            </div>

            <button onClick={handleClose} className="w-full rounded-lg py-2.5 text-sm font-semibold" style={{ background: 'linear-gradient(135deg, #d4af37 0%, #c9a227 50%, #b8941f 100%)', color: '#0a0a0a' }}>
              Fechar
            </button>
          </>
        )}
      </div>
    </div>
  )
}
