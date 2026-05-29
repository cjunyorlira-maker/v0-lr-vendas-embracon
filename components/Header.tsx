'use client'

import { Plus, Download, Crown } from 'lucide-react'
import Link from 'next/link'
import SinoNotificacoes from '@/components/SinoNotificacoes'

interface HeaderProps {
  title?: string
}

export default function Header({ title = 'Dashboard' }: HeaderProps) {
  return (
    <header
      className="sticky top-0 flex items-center justify-between gap-4 px-6 py-4"
      style={{
        background: 'rgba(10,10,10,0.75)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderBottom: '1px solid var(--border)',
        zIndex: 30,
      }}
    >
      {/* Lado esquerdo: ícone + título */}
      <div className="flex items-center gap-2 min-w-0">
        <Crown size={15} style={{ color: 'var(--accent)', flexShrink: 0 }} />
        <h1
          className="text-base font-bold tracking-tight truncate"
          style={{ color: 'var(--text)' }}
        >
          {title}
        </h1>
      </div>

      {/* Lado direito: ações */}
      <div className="flex shrink-0 items-center gap-2">
        {/* Sino de notificações */}
        <SinoNotificacoes />

        {/* Botão exportar */}
        <button
          className="flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-all duration-150"
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid var(--border)',
            color: 'var(--muted-color)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--text)'
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'
            e.currentTarget.style.background = 'rgba(255,255,255,0.08)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--muted-color)'
            e.currentTarget.style.borderColor = 'var(--border)'
            e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
          }}
        >
          <Download size={13} />
          <span className="hidden sm:inline">Exportar</span>
        </button>

        {/* Botão Nova Venda — Link para /nova-venda */}
        <Link
          href="/nova-venda"
          className="group relative flex h-8 items-center gap-1.5 overflow-hidden rounded-lg px-4 text-xs font-semibold transition-all duration-200"
          style={{
            background: 'linear-gradient(135deg, #d4af37 0%, #c9a227 50%, #b8941f 100%)',
            color: '#0a0a0a',
            boxShadow: '0 2px 12px rgba(212,175,55,0.25)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-1px) scale(1.02)'
            e.currentTarget.style.boxShadow = '0 4px 20px rgba(212,175,55,0.4)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0) scale(1)'
            e.currentTarget.style.boxShadow = '0 2px 12px rgba(212,175,55,0.25)'
          }}
        >
          <span className="pointer-events-none absolute inset-0 -translate-x-full skew-x-12 bg-white/20 transition-transform duration-500 group-hover:translate-x-full" />
          <Plus size={13} strokeWidth={2.5} />
          <span>Nova Venda</span>
        </Link>
      </div>
    </header>
  )
}
