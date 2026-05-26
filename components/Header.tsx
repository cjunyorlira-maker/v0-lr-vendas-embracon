'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight, Plus, Download, Bell } from 'lucide-react'
import { Crown } from 'lucide-react'

function getWeekLabel(offset: number): string {
  const now = new Date()
  const start = new Date(now)
  start.setDate(now.getDate() - now.getDay() + 1 + offset * 7) // segunda-feira
  const end = new Date(start)
  end.setDate(start.getDate() + 6)

  const fmt = (d: Date) =>
    d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })

  if (offset === 0) return `Esta semana · ${fmt(start)} – ${fmt(end)}`
  if (offset === -1) return `Semana passada · ${fmt(start)} – ${fmt(end)}`
  if (offset === 1) return `Próxima semana · ${fmt(start)} – ${fmt(end)}`
  return `${fmt(start)} – ${fmt(end)}`
}

interface HeaderProps {
  title?: string
  subtitle?: string
}

export default function Header({ title = 'Dashboard', subtitle }: HeaderProps) {
  const [weekOffset, setWeekOffset] = useState(0)

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
      {/* Lado esquerdo: título + navegação de semanas */}
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex items-center gap-2">
          <Crown size={15} style={{ color: 'var(--accent)', flexShrink: 0 }} />
          <h1
            className="text-base font-bold tracking-tight truncate"
            style={{ color: 'var(--text)' }}
          >
            {title}
          </h1>
        </div>

        {/* Navegação de semanas */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setWeekOffset((w) => w - 1)}
            className="flex h-5 w-5 items-center justify-center rounded transition-colors duration-150"
            style={{ color: 'var(--muted-color)' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--accent)'
              e.currentTarget.style.background = 'var(--accent-bg)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--muted-color)'
              e.currentTarget.style.background = 'transparent'
            }}
            aria-label="Semana anterior"
          >
            <ChevronLeft size={12} />
          </button>

          <span
            className="text-xs font-medium font-mono select-none"
            style={{
              color: weekOffset === 0 ? 'var(--accent)' : 'var(--muted-color)',
              fontFamily: 'var(--font-jetbrains-mono)',
            }}
          >
            {getWeekLabel(weekOffset)}
          </span>

          <button
            onClick={() => setWeekOffset((w) => w + 1)}
            className="flex h-5 w-5 items-center justify-center rounded transition-colors duration-150"
            style={{ color: 'var(--muted-color)' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--accent)'
              e.currentTarget.style.background = 'var(--accent-bg)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--muted-color)'
              e.currentTarget.style.background = 'transparent'
            }}
            aria-label="Próxima semana"
          >
            <ChevronRight size={12} />
          </button>

          {weekOffset !== 0 && (
            <button
              onClick={() => setWeekOffset(0)}
              className="ml-1 rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors duration-150"
              style={{
                background: 'var(--accent-bg)',
                color: 'var(--accent)',
                border: '1px solid var(--accent-bg2)',
              }}
            >
              Hoje
            </button>
          )}
        </div>
      </div>

      {/* Lado direito: ações */}
      <div className="flex shrink-0 items-center gap-2">
        {/* Botão notificações */}
        <button
          className="relative flex h-8 w-8 items-center justify-center rounded-lg transition-all duration-150"
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid var(--border)',
            color: 'var(--muted-color)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--accent)'
            e.currentTarget.style.borderColor = 'var(--accent-bg2)'
            e.currentTarget.style.background = 'var(--accent-bg)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--muted-color)'
            e.currentTarget.style.borderColor = 'var(--border)'
            e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
          }}
          aria-label="Notificações"
        >
          <Bell size={14} />
          {/* Badge */}
          <span
            className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full"
            style={{ background: 'var(--accent)' }}
          />
        </button>

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
            e.currentTarget.style.borderColor = 'var(--border2)'
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

        {/* Botão Nova Venda — gradiente dourado com shine */}
        <button
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
          {/* Efeito shine */}
          <span
            className="pointer-events-none absolute inset-0 -translate-x-full skew-x-12 bg-white/20 transition-transform duration-500 group-hover:translate-x-full"
          />
          <Plus size={13} strokeWidth={2.5} />
          <span>Nova Venda</span>
        </button>
      </div>
    </header>
  )
}
