'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Image from 'next/image'
import { Eye, EyeOff, Lock, AlertCircle } from 'lucide-react'

export default function TrocarSenhaPage() {
  const router = useRouter()
  const [novaSenha, setNovaSenha] = useState('')
  const [confirmarSenha, setConfirmarSenha] = useState('')
  const [showNovaSenha, setShowNovaSenha] = useState(false)
  const [showConfirmarSenha, setShowConfirmarSenha] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Validações de senha
  const temMinimo8 = novaSenha.length >= 8
  const temMaiuscula = /[A-Z]/.test(novaSenha)
  const temMinuscula = /[a-z]/.test(novaSenha)
  const temNumero = /[0-9]/.test(novaSenha)
  const temEspecial = /[!@#$%^&*(),.?":{}|<>]/.test(novaSenha)
  const senhasIguais = novaSenha === confirmarSenha && novaSenha.length > 0

  const senhaValida = temMinimo8 && temMaiuscula && temMinuscula && temNumero && temEspecial && senhasIguais

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!senhaValida) return

    setLoading(true)
    setError('')

    try {
      const supabase = createClient()

      // Atualiza a senha no auth
      const { error: authError } = await supabase.auth.updateUser({
        password: novaSenha
      })

      if (authError) {
        setError(authError.message)
        setLoading(false)
        return
      }

      // Atualiza senha_temporaria = false na tabela usuarios
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        await supabase
          .from('usuarios')
          .update({ senha_temporaria: false })
          .eq('auth_user_id', user.id)
      }

      // Redireciona para o dashboard
      router.push('/')
      router.refresh()

    } catch (err) {
      setError('Erro ao atualizar senha')
    }

    setLoading(false)
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center px-4">
      <div
        className="relative z-10 w-full max-w-md rounded-2xl p-8"
        style={{
          background: 'rgba(0,0,0,0.4)',
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        {/* Logo */}
        <div className="flex justify-center mb-6">
          <Image
            src="/images/logo-lr.png"
            alt="LR Multimarcas"
            width={180}
            height={60}
            className="h-[50px] w-auto object-contain"
            priority
          />
        </div>

        {/* Header */}
        <div className="text-center mb-6">
          <div
            className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl"
            style={{ background: 'rgba(212,175,55,0.15)', border: '1px solid rgba(212,175,55,0.25)' }}
          >
            <Lock size={20} style={{ color: 'var(--accent)' }} />
          </div>
          <h1 className="text-xl font-semibold" style={{ color: 'var(--text)' }}>
            Crie sua nova senha
          </h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--muted-color)' }}>
            Por segurança, você precisa definir uma senha pessoal
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div
              className="flex items-center gap-2 rounded-lg p-3 text-sm"
              style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}
            >
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          {/* Nova senha */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--muted-color)' }}>
              Nova senha
            </label>
            <div className="relative">
              <input
                type={showNovaSenha ? 'text' : 'password'}
                value={novaSenha}
                onChange={(e) => setNovaSenha(e.target.value)}
                required
                className="w-full rounded-lg px-3 py-2.5 pr-10 text-sm outline-none transition-all"
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid var(--border)',
                  color: 'var(--text)',
                }}
                placeholder="Digite sua nova senha"
              />
              <button
                type="button"
                onClick={() => setShowNovaSenha(!showNovaSenha)}
                className="absolute right-3 top-1/2 -translate-y-1/2"
                style={{ color: 'var(--muted-color)' }}
              >
                {showNovaSenha ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* Requisitos de senha */}
          <div className="space-y-1.5 rounded-lg p-3" style={{ background: 'rgba(255,255,255,0.02)' }}>
            <p className="text-xs font-medium mb-2" style={{ color: 'var(--muted-color)' }}>
              A senha deve conter:
            </p>
            <Requisito ok={temMinimo8}>Mínimo 8 caracteres</Requisito>
            <Requisito ok={temMaiuscula}>Uma letra maiúscula</Requisito>
            <Requisito ok={temMinuscula}>Uma letra minúscula</Requisito>
            <Requisito ok={temNumero}>Um número</Requisito>
            <Requisito ok={temEspecial}>Um caractere especial (!@#$%...)</Requisito>
          </div>

          {/* Confirmar senha */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--muted-color)' }}>
              Confirmar senha
            </label>
            <div className="relative">
              <input
                type={showConfirmarSenha ? 'text' : 'password'}
                value={confirmarSenha}
                onChange={(e) => setConfirmarSenha(e.target.value)}
                required
                className="w-full rounded-lg px-3 py-2.5 pr-10 text-sm outline-none transition-all"
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: confirmarSenha && !senhasIguais ? '1px solid #ef4444' : '1px solid var(--border)',
                  color: 'var(--text)',
                }}
                placeholder="Digite novamente"
              />
              <button
                type="button"
                onClick={() => setShowConfirmarSenha(!showConfirmarSenha)}
                className="absolute right-3 top-1/2 -translate-y-1/2"
                style={{ color: 'var(--muted-color)' }}
              >
                {showConfirmarSenha ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {confirmarSenha && !senhasIguais && (
              <p className="mt-1 text-xs" style={{ color: '#ef4444' }}>
                As senhas não conferem
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading || !senhaValida}
            className="w-full rounded-lg py-3 text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: senhaValida
                ? 'linear-gradient(135deg, #d4af37 0%, #c9a227 50%, #b8941f 100%)'
                : 'rgba(255,255,255,0.1)',
              color: senhaValida ? '#0a0a0a' : 'var(--muted-color)',
            }}
          >
            {loading ? 'Salvando...' : 'Salvar nova senha'}
          </button>
        </form>
      </div>
    </div>
  )
}

function Requisito({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-xs" style={{ color: ok ? '#22c55e' : 'var(--muted-color)' }}>
      <span
        className="flex h-4 w-4 items-center justify-center rounded-full text-[10px]"
        style={{
          background: ok ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.05)',
          border: ok ? '1px solid rgba(34,197,94,0.4)' : '1px solid rgba(255,255,255,0.1)',
        }}
      >
        {ok ? '✓' : ''}
      </span>
      {children}
    </div>
  )
}
