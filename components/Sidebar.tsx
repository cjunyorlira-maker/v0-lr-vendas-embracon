'use client'

import { useState } from 'react'
import {
  Home,
  Upload,
  Users,
  FileText,
  Target,
  Trophy,
  UserCircle,
  Users2,
  CheckCircle,
  DollarSign,
  Settings,
  LogOut,
  Crown,
  Menu,
  X,
} from 'lucide-react'

interface NavItem {
  icon: React.ReactNode
  label: string
  active?: boolean
}

const mainNav: NavItem[] = [
  { icon: <Home size={16} />, label: 'Dashboard', active: true },
  { icon: <Upload size={16} />, label: 'Nova Venda' },
  { icon: <Users size={16} />, label: 'Clientes' },
  { icon: <FileText size={16} />, label: 'Boletos' },
  { icon: <Target size={16} />, label: 'Lances' },
  { icon: <Trophy size={16} />, label: 'Ranking' },
]

const adminNav: NavItem[] = [
  { icon: <UserCircle size={16} />, label: 'Vendedores' },
  { icon: <Users2 size={16} />, label: 'Equipes' },
  { icon: <CheckCircle size={16} />, label: 'Aprovações' },
  { icon: <DollarSign size={16} />, label: 'Comissões' },
  { icon: <Settings size={16} />, label: 'Planos' },
]

function NavLink({ item }: { item: NavItem }) {
  return (
    <a
      href="#"
      className="group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-all duration-150 cursor-pointer"
      style={
        item.active
          ? {
              background: 'var(--accent-bg)',
              color: 'var(--accent)',
              borderLeft: '2px solid var(--accent)',
              paddingLeft: '10px',
            }
          : {
              color: 'var(--muted-color)',
              borderLeft: '2px solid transparent',
            }
      }
      onMouseEnter={(e) => {
        if (!item.active) {
          e.currentTarget.style.background = 'var(--accent-bg)'
          e.currentTarget.style.color = 'var(--text2)'
        }
      }}
      onMouseLeave={(e) => {
        if (!item.active) {
          e.currentTarget.style.background = 'transparent'
          e.currentTarget.style.color = 'var(--muted-color)'
        }
      }}
    >
      <span className="shrink-0">{item.icon}</span>
      <span>{item.label}</span>
    </a>
  )
}

function SidebarContent() {
  return (
    <div className="flex h-full flex-col" style={{ background: 'var(--surface)' }}>
      {/* Logo */}
      <div className="px-5 py-6" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="flex items-center gap-2">
          <Crown size={18} style={{ color: 'var(--accent)' }} />
          <span
            className="text-sm font-bold tracking-wide uppercase"
            style={{ color: 'var(--accent)' }}
          >
            LR Multimarcas
          </span>
        </div>
        <p className="mt-1 text-xs" style={{ color: 'var(--muted-color)' }}>
          Vendas Embracon
        </p>
      </div>

      {/* Navegação principal */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <div className="flex flex-col gap-1">
          {mainNav.map((item) => (
            <NavLink key={item.label} item={item} />
          ))}
        </div>

        {/* Separador Administração */}
        <div className="my-4 px-3">
          <p
            className="text-xs font-semibold uppercase tracking-widest"
            style={{ color: 'var(--faint)' }}
          >
            Administração
          </p>
        </div>

        <div className="flex flex-col gap-1">
          {adminNav.map((item) => (
            <NavLink key={item.label} item={item} />
          ))}
        </div>
      </nav>

      {/* Rodapé */}
      <div
        className="px-4 py-4"
        style={{ borderTop: '1px solid var(--border)' }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Avatar */}
            <div
              className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold shrink-0"
              style={{
                background: 'var(--accent-bg2)',
                color: 'var(--accent)',
                border: '1px solid var(--accent-bg2)',
              }}
            >
              U
            </div>
            <span className="text-sm font-medium" style={{ color: 'var(--text2)' }}>
              Usuário
            </span>
          </div>
          <button
            className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs transition-colors duration-150 cursor-pointer"
            style={{ color: 'var(--muted-color)' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--red)'
              e.currentTarget.style.background = 'rgba(239,68,68,0.08)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--muted-color)'
              e.currentTarget.style.background = 'transparent'
            }}
          >
            <LogOut size={14} />
            <span>Sair</span>
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Sidebar() {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <>
      {/* Sidebar desktop */}
      <aside
        className="fixed left-0 top-0 hidden h-screen w-60 lg:block"
        style={{ borderRight: '1px solid var(--border)', zIndex: 40 }}
      >
        <SidebarContent />
      </aside>

      {/* Botão hamburguer mobile */}
      <button
        className="fixed left-4 top-4 z-50 flex h-9 w-9 items-center justify-center rounded-lg lg:hidden"
        style={{
          background: 'var(--surface2)',
          border: '1px solid var(--border2)',
          color: 'var(--text)',
        }}
        onClick={() => setMobileOpen(true)}
        aria-label="Abrir menu"
      >
        <Menu size={18} />
      </button>

      {/* Overlay mobile */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar mobile */}
      <aside
        className="fixed left-0 top-0 z-50 h-screen w-60 transition-transform duration-300 lg:hidden"
        style={{
          borderRight: '1px solid var(--border)',
          transform: mobileOpen ? 'translateX(0)' : 'translateX(-100%)',
        }}
      >
        <button
          className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-md"
          style={{ color: 'var(--muted-color)' }}
          onClick={() => setMobileOpen(false)}
          aria-label="Fechar menu"
        >
          <X size={16} />
        </button>
        <SidebarContent />
      </aside>
    </>
  )
}
