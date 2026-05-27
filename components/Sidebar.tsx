'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  Home, Upload, Users, FileText, Target, Trophy, Users2,
  DollarSign, Settings, LogOut, Menu, X,
} from 'lucide-react'

interface NavItem {
  icon: React.ReactNode
  label: string
  href: string
  active?: boolean
}

const mainNav: NavItem[] = [
  { icon: <Home size={16} />, label: 'Dashboard', href: '/', active: true },
  { icon: <Upload size={16} />, label: 'Nova Venda', href: '/nova-venda' },
  { icon: <Users size={16} />, label: 'Clientes', href: '/clientes' },
  { icon: <FileText size={16} />, label: 'Boletos', href: '/boletos' },
  { icon: <Target size={16} />, label: 'Lances', href: '/lances' },
  { icon: <Trophy size={16} />, label: 'Ranking', href: '/ranking' },
  { icon: <Users2 size={16} />, label: 'Equipe', href: '/equipe' },
]

const adminNav: NavItem[] = [
  { icon: <DollarSign size={16} />, label: 'Comissões', href: '/comissoes' },
  { icon: <Settings size={16} />, label: 'Planos', href: '/planos' },
]

function NavLink({ item }: { item: NavItem }) {
  return (
    <a
      href={item.href}
      className="group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-all duration-150 cursor-pointer"
      style={item.active ? { background: 'var(--accent-bg)', color: 'var(--accent)', borderLeft: '2px solid var(--accent)', paddingLeft: '10px' } : { color: 'var(--muted-color)', borderLeft: '2px solid transparent' }}
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

interface SidebarContentProps {
  userNome: string | null
  userEmail: string | null
  userRole: string | null
  empresaNome: string | null
  empresaLogo: string | null
  onSignOut: () => void
}

function SidebarContent({ userNome, userEmail, userRole, empresaNome, empresaLogo, onSignOut }: SidebarContentProps) {
  const initials = userNome ? userNome.charAt(0).toUpperCase() : (userEmail ? userEmail.charAt(0).toUpperCase() : 'U')

  let displayName = userNome || 'Usuário'
  if (userRole === 'representante' && empresaNome) {
    displayName = empresaNome
  }

  const roleLabels: Record<string, string> = {
    master: 'Master', representante: 'Representante', adm: 'Administrador', supervisor: 'Supervisor', vendedor: 'Vendedor',
  }
  const roleColors: Record<string, string> = {
    master: '#d4af37', representante: '#22c55e', adm: '#3b82f6', supervisor: '#a855f7', vendedor: '#64748b',
  }

  const showLogoEmpresa = userRole !== 'master' && empresaLogo
  const logoSrc = showLogoEmpresa ? empresaLogo! : '/images/logo-lr.png'

  return (
    <div className="flex h-full flex-col" style={{ background: 'var(--surface)' }}>
      <div className="px-3 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="flex flex-col items-center justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoSrc} alt={empresaNome || 'LR Multimarcas'} className="h-[50px] w-auto object-contain" />
          {userRole && userRole !== 'master' && empresaNome && (
            <span className="mt-2 text-[10px] font-semibold tracking-wider uppercase text-center" style={{ color: 'var(--accent)' }}>
              {empresaNome}
            </span>
          )}
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <div className="flex flex-col gap-1">
          {mainNav.map((item) => (<NavLink key={item.label} item={item} />))}
        </div>
        <div className="my-4 px-3">
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--muted-color)' }}>Administração</p>
        </div>
        <div className="flex flex-col gap-1">
          {adminNav.map((item) => (<NavLink key={item.label} item={item} />))}
        </div>
      </nav>

      <div className="px-4 py-4" style={{ borderTop: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold shrink-0" style={{ background: 'rgba(212,175,55,0.15)', color: 'var(--accent)', border: '1px solid rgba(212,175,55,0.25)' }}>
              {initials}
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-medium truncate" style={{ color: 'var(--text2)' }} title={displayName}>{displayName}</span>
              {userRole && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded mt-0.5 w-fit" style={{ background: `${roleColors[userRole] || '#64748b'}20`, color: roleColors[userRole] || '#64748b' }}>
                  {roleLabels[userRole] || userRole}
                </span>
              )}
            </div>
          </div>
          <button onClick={onSignOut} className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs transition-colors duration-150 cursor-pointer shrink-0" style={{ color: 'var(--muted-color)' }} onMouseEnter={(e) => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.background = 'rgba(239,68,68,0.08)' }} onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--muted-color)'; e.currentTarget.style.background = 'transparent' }}>
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
  const [userNome, setUserNome] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [userRole, setUserRole] = useState<string | null>(null)
  const [empresaNome, setEmpresaNome] = useState<string | null>(null)
  const [empresaLogo, setEmpresaLogo] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data }) => {
      setUserEmail(data.user?.email ?? null)
      if (data.user) {
        const { data: usuario } = await supabase
          .from('usuarios')
          .select('nome, role, empresa:empresas(nome, logo_url)')
          .eq('auth_user_id', data.user.id)
          .single<{ nome: string; role: string; empresa: { nome: string; logo_url: string | null } | null }>()

        if (usuario) {
          setUserNome(usuario.nome)
          setUserRole(usuario.role)
          if (usuario.empresa) {
            setEmpresaNome(usuario.empresa.nome)
            setEmpresaLogo(usuario.empresa.logo_url)
          }
        }
      }
    })
  }, [])

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <>
      <aside className="fixed left-0 top-0 hidden h-screen w-60 lg:block" style={{ borderRight: '1px solid var(--border)', zIndex: 40 }}>
        <SidebarContent userNome={userNome} userEmail={userEmail} userRole={userRole} empresaNome={empresaNome} empresaLogo={empresaLogo} onSignOut={handleSignOut} />
      </aside>

      <button className="fixed left-4 top-4 z-50 flex h-9 w-9 items-center justify-center rounded-lg lg:hidden" style={{ background: 'var(--surface2)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text)' }} onClick={() => setMobileOpen(true)} aria-label="Abrir menu">
        <Menu size={18} />
      </button>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={() => setMobileOpen(false)} />
      )}

      <aside className="fixed left-0 top-0 z-50 h-screen w-60 transition-transform duration-300 lg:hidden" style={{ borderRight: '1px solid var(--border)', transform: mobileOpen ? 'translateX(0)' : 'translateX(-100%)' }}>
        <button className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-md" style={{ color: 'var(--muted-color)' }} onClick={() => setMobileOpen(false)} aria-label="Fechar menu">
          <X size={16} />
        </button>
        <SidebarContent userNome={userNome} userEmail={userEmail} userRole={userRole} empresaNome={empresaNome} empresaLogo={empresaLogo} onSignOut={handleSignOut} />
      </aside>
    </>
  )
}
