'use client'

import { useState } from 'react'
import { Eye, EyeOff, Crown, Lock, User } from 'lucide-react'
import AnimatedBackground from '@/components/ui/AnimatedBackground'

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ user: '', password: '' })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setTimeout(() => setLoading(false), 1800)
  }

  return (
    <div
      className="relative flex min-h-screen items-center justify-center px-4 font-sans"
      style={{ background: 'var(--bg)' }}
    >
      <AnimatedBackground />

      {/* Card principal */}
      <div
        className="relative z-10 w-full max-w-sm rounded-2xl overflow-hidden"
        style={{
          background: 'rgba(0,0,0,0.12)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
          border: '1px solid var(--border)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.03)',
        }}
      >
        {/* Linha decorativa dourada no topo */}
        <div
          className="h-px w-full"
          style={{
            background:
              'linear-gradient(90deg, transparent 0%, #d4af37 30%, #c9a227 70%, transparent 100%)',
          }}
        />

        <div className="px-8 pb-8 pt-7">
          {/* Logo */}
          <div className="mb-8 flex flex-col items-center gap-3">
            <div
              className="flex h-14 w-14 items-center justify-center rounded-2xl"
              style={{
                background: 'rgba(212,175,55,0.1)',
                border: '1px solid rgba(212,175,55,0.2)',
                boxShadow: '0 0 24px rgba(212,175,55,0.12)',
              }}
            >
              <Crown size={24} style={{ color: 'var(--accent)' }} />
            </div>
            <div className="text-center">
              <p
                className="text-xl font-bold tracking-wide"
                style={{ color: 'var(--accent)' }}
              >
                LR Multimarcas
              </p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--muted-color)' }}>
                Sistema de Vendas Embracon
              </p>
            </div>
          </div>

          {/* Formulário */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {/* Campo usuário */}
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="login-user"
                className="text-xs font-medium"
                style={{ color: 'var(--muted-color)' }}
              >
                Usuário
              </label>
              <div className="relative">
                <span
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
                  style={{ color: 'var(--faint)' }}
                >
                  <User size={14} />
                </span>
                <input
                  id="login-user"
                  type="text"
                  autoComplete="username"
                  placeholder="seu.usuario"
                  value={form.user}
                  onChange={(e) => setForm({ ...form, user: e.target.value })}
                  className="w-full rounded-lg py-2.5 pl-9 pr-4 text-sm font-medium outline-none transition-all duration-150"
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid var(--border2)',
                    color: 'var(--text)',
                    fontFamily: 'var(--font-jetbrains-mono)',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(212,175,55,0.5)'
                    e.currentTarget.style.background = 'rgba(212,175,55,0.04)'
                    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(212,175,55,0.08)'
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border2)'
                    e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
                    e.currentTarget.style.boxShadow = 'none'
                  }}
                />
              </div>
            </div>

            {/* Campo senha */}
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="login-password"
                className="text-xs font-medium"
                style={{ color: 'var(--muted-color)' }}
              >
                Senha
              </label>
              <div className="relative">
                <span
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
                  style={{ color: 'var(--faint)' }}
                >
                  <Lock size={14} />
                </span>
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="w-full rounded-lg py-2.5 pl-9 pr-10 text-sm font-medium outline-none transition-all duration-150"
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid var(--border2)',
                    color: 'var(--text)',
                    fontFamily: 'var(--font-jetbrains-mono)',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(212,175,55,0.5)'
                    e.currentTarget.style.background = 'rgba(212,175,55,0.04)'
                    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(212,175,55,0.08)'
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border2)'
                    e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
                    e.currentTarget.style.boxShadow = 'none'
                  }}
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors duration-150"
                  style={{ color: 'var(--faint)' }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--accent)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--faint)' }}
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                >
                  {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            {/* Botão entrar — gradiente dourado */}
            <button
              type="submit"
              disabled={loading}
              className="group relative mt-2 flex w-full items-center justify-center gap-2 overflow-hidden rounded-lg py-2.5 text-sm font-bold transition-all duration-200 disabled:opacity-70"
              style={{
                background: 'linear-gradient(135deg, #d4af37 0%, #c9a227 50%, #b8941f 100%)',
                color: '#0a0a0a',
                boxShadow: '0 4px 16px rgba(212,175,55,0.3)',
              }}
              onMouseEnter={(e) => {
                if (!loading) {
                  e.currentTarget.style.transform = 'translateY(-1px)'
                  e.currentTarget.style.boxShadow = '0 6px 24px rgba(212,175,55,0.45)'
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)'
                e.currentTarget.style.boxShadow = '0 4px 16px rgba(212,175,55,0.3)'
              }}
            >
              {/* Shine */}
              <span className="pointer-events-none absolute inset-0 -translate-x-full skew-x-12 bg-white/25 transition-transform duration-500 group-hover:translate-x-full" />
              {loading ? (
                <svg
                  className="h-4 w-4 animate-spin"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                </svg>
              ) : (
                'Entrar no sistema'
              )}
            </button>
          </form>

          {/* Rodapé */}
          <p
            className="mt-6 text-center text-[11px]"
            style={{ color: 'var(--faint)' }}
          >
            Acesso restrito a colaboradores LR Multimarcas
          </p>
        </div>
      </div>
    </div>
  )
}
