'use client'

import { useState } from 'react'
import { X, Copy, Check, Eye, EyeOff } from 'lucide-react'

interface Equipe {
  id: string
  nome: string
}

interface Props {
  open: boolean
  onClose: () => void
  empresaId: string | null
  equipes: Equipe[]
  currentUserRole: string | null
  onSuccess: (usuario: any) => void
}

const rolesDisponiveis = [
  { value: 'vendedor', label: 'Vendedor' },
  { value: 'supervisor', label: 'Supervisor' },
  { value: 'adm', label: 'Administrador' },
  { value: 'representante', label: 'Representante' },
]

export default function AdicionarUsuarioModal({
  open,
  onClose,
  empresaId,
  equipes,
  currentUserRole,
  onSuccess,
}: Props) {
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('vendedor')
  const [equipeId, setEquipeId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [senhaGerada, setSenhaGerada] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [showSenha, setShowSenha] = useState(false)

  // Filtra roles disponíveis baseado no role do usuário atual
  const rolesPermitidos = rolesDisponiveis.filter(r => {
    if (currentUserRole === 'master') return true
    if (currentUserRole === 'representante') return ['vendedor', 'supervisor', 'adm'].includes(r.value)
    if (currentUserRole === 'adm') return ['vendedor', 'supervisor'].includes(r.value)
    if (currentUserRole === 'supervisor') return r.value === 'vendedor'
    return false
  })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/usuarios/criar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome,
          email,
          role,
          empresa_id: empresaId,
          equipe_id: equipeId || null,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Erro ao criar usuário')
        setLoading(false)
        return
      }

      // Mostra a senha gerada
      setSenhaGerada(data.senha_temporaria)
      onSuccess({ ...data.usuario, senha_temporaria: true, senha_temporaria_gerada: data.senha_temporaria })

    } catch (err) {
      setError('Erro de conexão')
    }

    setLoading(false)
  }

  function handleClose() {
    setNome('')
    setEmail('')
    setRole('vendedor')
    setEquipeId('')
    setError('')
    setSenhaGerada(null)
    setCopied(false)
    onClose()
  }

  async function copySenha() {
    if (!senhaGerada) return
    await navigator.clipboard.writeText(senhaGerada)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Overlay */}
      <div
        className="absolute inset-0"
        style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
        onClick={handleClose}
      />

      {/* Modal */}
      <div
        className="relative w-full max-w-md rounded-xl p-6"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>
            {senhaGerada ? 'Usuário Criado!' : 'Adicionar Usuário'}
          </h3>
          <button
            onClick={handleClose}
            className="p-1 rounded-lg transition-colors"
            style={{ color: 'var(--muted-color)' }}
          >
            <X size={18} />
          </button>
        </div>

        {senhaGerada ? (
          // Tela de sucesso com senha
          <div className="space-y-4">
            <p className="text-sm" style={{ color: 'var(--text2)' }}>
              Anote a senha temporária abaixo. O usuário deverá alterá-la no primeiro acesso.
            </p>

            <div
              className="flex items-center justify-between rounded-lg p-4"
              style={{ background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.25)' }}
            >
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium" style={{ color: 'var(--muted-color)' }}>Senha:</span>
                <span
                  className="font-mono text-lg font-bold"
                  style={{ color: 'var(--accent)' }}
                >
                  {showSenha ? senhaGerada : '••••••••'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowSenha(!showSenha)}
                  className="p-2 rounded-lg transition-colors"
                  style={{ color: 'var(--muted-color)' }}
                >
                  {showSenha ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
                <button
                  onClick={copySenha}
                  className="p-2 rounded-lg transition-colors"
                  style={{ color: copied ? '#22c55e' : 'var(--muted-color)' }}
                >
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                </button>
              </div>
            </div>

            <div
              className="rounded-lg p-3 text-xs"
              style={{ background: 'rgba(245,158,11,0.1)', color: '#f59e0b' }}
            >
              Atenção: Esta senha não poderá ser visualizada novamente. Copie-a agora.
            </div>

            <button
              onClick={handleClose}
              className="w-full rounded-lg py-2.5 text-sm font-semibold transition-all"
              style={{
                background: 'linear-gradient(135deg, #d4af37 0%, #c9a227 50%, #b8941f 100%)',
                color: '#0a0a0a',
              }}
            >
              Fechar
            </button>
          </div>
        ) : (
          // Formulário
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div
                className="rounded-lg p-3 text-sm"
                style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}
              >
                {error}
              </div>
            )}

            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--muted-color)' }}>
                Nome completo
              </label>
              <input
                type="text"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                required
                className="w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-all"
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid var(--border)',
                  color: 'var(--text)',
                }}
                placeholder="Nome do usuário"
              />
            </div>

            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--muted-color)' }}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-all"
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid var(--border)',
                  color: 'var(--text)',
                }}
                placeholder="email@exemplo.com"
              />
            </div>

            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--muted-color)' }}>
                Cargo
              </label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-all"
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid var(--border)',
                  color: 'var(--text)',
                }}
              >
                {rolesPermitidos.map((r) => (
                  <option key={r.value} value={r.value} style={{ background: '#131313' }}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>

            {equipes.length > 0 && (
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--muted-color)' }}>
                  Equipe (opcional)
                </label>
                <select
                  value={equipeId}
                  onChange={(e) => setEquipeId(e.target.value)}
                  className="w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-all"
                  style={{
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid var(--border)',
                    color: 'var(--text)',
                  }}
                >
                  <option value="" style={{ background: '#131313' }}>Sem equipe</option>
                  {equipes.map((eq) => (
                    <option key={eq.id} value={eq.id} style={{ background: '#131313' }}>
                      {eq.nome}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg py-2.5 text-sm font-semibold transition-all disabled:opacity-50"
              style={{
                background: 'linear-gradient(135deg, #d4af37 0%, #c9a227 50%, #b8941f 100%)',
                color: '#0a0a0a',
              }}
            >
              {loading ? 'Criando...' : 'Criar Usuário'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
