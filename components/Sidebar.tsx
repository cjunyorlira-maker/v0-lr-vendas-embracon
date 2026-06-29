'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  Home, Upload, Users, FileText, Target, Trophy, Users2,
  DollarSign, Settings, LogOut, Menu, X, Camera, Trash2,
  Calculator, BookOpen, CalendarCheck,
} from 'lucide-react'

interface NavItem {
  icon: React.ReactNode
  label: string
  href: string
}

const mainNav: NavItem[] = [
  { icon: <Home size={16} />, label: 'Dashboard', href: '/' },
  { icon: <Upload size={16} />, label: 'Nova Venda', href: '/nova-venda' },
  { icon: <Users size={16} />, label: 'Clientes', href: '/clientes' },
  { icon: <FileText size={16} />, label: 'Boletos', href: '/boletos' },
  { icon: <Target size={16} />, label: 'Lances', href: '/lances' },
  { icon: <Trophy size={16} />, label: 'Ranking', href: '/ranking' },
  { icon: <Calculator size={16} />, label: 'Simulador', href: '/simulador' },
  { icon: <BookOpen size={16} />, label: 'Tabelas', href: '/tabelas' },
  { icon: <CalendarCheck size={16} />, label: 'Assembleias', href: '/assembleias' },
  { icon: <Users2 size={16} />, label: 'Equipe', href: '/equipe' },
]

const adminNav: NavItem[] = [
  { icon: <DollarSign size={16} />, label: 'Comissões', href: '/comissoes' },
  { icon: <Settings size={16} />, label: 'Planos', href: '/planos' },
]

function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const isActive = item.href === '/'
    ? pathname === '/'
    : pathname === item.href || pathname.startsWith(item.href + '/')
  return (
    <a
      href={item.href}
      className="group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all duration-150 cursor-pointer"
      style={isActive ? {
        background: 'linear-gradient(135deg, rgba(212,175,55,0.25), rgba(212,175,55,0.08))',
        border: '1px solid rgba(212,175,55,0.4)',
        color: 'var(--accent)',
        fontWeight: 600,
      } : {
        background: 'transparent',
        border: '1px solid transparent',
        color: 'var(--muted-color)',
        fontWeight: 500,
      }}
      onMouseEnter={(e) => {
        if (!isActive) {
          e.currentTarget.style.background = 'rgba(212,175,55,0.08)'
          e.currentTarget.style.color = 'var(--accent)'
          e.currentTarget.style.transform = 'translateX(2px)'
        }
      }}
      onMouseLeave={(e) => {
        if (!isActive) {
          e.currentTarget.style.background = 'transparent'
          e.currentTarget.style.color = 'var(--muted-color)'
          e.currentTarget.style.transform = 'translateX(0)'
        }
      }}
    >
      <span className="shrink-0" style={{ color: isActive ? 'var(--accent)' : 'inherit' }}>{item.icon}</span>
      <span>{item.label}</span>
    </a>
  )
}

interface UserAvatarProps {
  userNome: string | null
  userEmail: string | null
  fotoUrl: string | null
  onFotoChange: (novaFotoUrl: string | null) => void
}

function UserAvatar({ userNome, userEmail, fotoUrl, onFotoChange }: UserAvatarProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const initials = userNome ? userNome.charAt(0).toUpperCase() : (userEmail ? userEmail.charAt(0).toUpperCase() : 'U')

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) {
      alert('Foto muito grande (máx 2MB)')
      return
    }
    if (!file.type.startsWith('image/')) {
      alert('Arquivo deve ser uma imagem')
      return
    }
    setUploading(true)
    const reader = new FileReader()
    reader.onload = async (event) => {
      const foto_base64 = event.target?.result as string
      try {
        const res = await fetch('/api/usuarios/foto', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ foto_base64 }),
        })
        const data = await res.json()
        if (res.ok) {
          onFotoChange(data.foto_url)
        } else {
          alert(data.error || 'Erro ao salvar foto')
        }
      } catch {
        alert('Erro de conexão')
      }
      setUploading(false)
      setMenuOpen(false)
    }
    reader.readAsDataURL(file)
  }

  async function handleRemove() {
    if (!confirm('Remover foto?')) return
    setUploading(true)
    try {
      const res = await fetch('/api/usuarios/foto', { method: 'DELETE' })
      if (res.ok) {
        onFotoChange(null)
      } else {
        alert('Erro ao remover')
      }
    } catch {
      alert('Erro de conexão')
    }
    setUploading(false)
    setMenuOpen(false)
  }

  return (
    <div className="relative">
      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
      <button
        onClick={() => setMenuOpen(!menuOpen)}
        disabled={uploading}
        className="relative flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold shrink-0 overflow-hidden transition-all"
        style={{
          background: 'rgba(212,175,55,0.15)',
          color: 'var(--accent)',
          border: '1px solid rgba(212,175,55,0.25)',
        }}
        title="Trocar foto"
      >
        {fotoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={fotoUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          initials
        )}
        {uploading && (
          <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }}>
            <div className="h-3 w-3 rounded-full animate-pulse" style={{ background: 'var(--accent)' }} />
          </div>
        )}
      </button>

      {menuOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
          <div className="absolute bottom-10 left-0 z-50 w-44 rounded-lg overflow-hidden" style={{ background: 'var(--surface2)', border: '1px solid var(--border)', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 w-full px-3 py-2.5 text-xs text-left transition-colors hover:bg-white/5"
              style={{ color: 'var(--text2)' }}
            >
              <Camera size={14} style={{ color: 'var(--accent)' }} />
              <span>{fotoUrl ? 'Trocar foto' : 'Adicionar foto'}</span>
            </button>
            {fotoUrl && (
              <button
                onClick={handleRemove}
                className="flex items-center gap-2 w-full px-3 py-2.5 text-xs text-left transition-colors hover:bg-white/5"
                style={{ color: '#ef4444', borderTop: '1px solid var(--border)' }}
              >
                <Trash2 size={14} />
                <span>Remover foto</span>
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}

interface SidebarContentProps {
  userNome: string | null
  userEmail: string | null
  userRole: string | null
  empresaNome: string | null
  empresaLogo: string | null
  fotoUrl: string | null
  onFotoChange: (novaFotoUrl: string | null) => void
  onSignOut: () => void
}

function SidebarContent({ userNome, userEmail, userRole, empresaNome, empresaLogo, fotoUrl, onFotoChange, onSignOut }: SidebarContentProps) {
  const pathname = usePathname()
  let displayName = userNome || 'Usuário'
  if (userRole === 'representante' && empresaNome) {
    displayName = empresaNome
  }

  const roleLabels: Record<string, string> = {
    master: 'Master', representante: 'Representante', adm: 'Administrativo', supervisor: 'Supervisor', vendedor: 'Vendedor',
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
          {mainNav.filter((item) => {
            // Equipe: não aparece para vendedor (ele não gerencia ninguém)
            if (item.href === '/equipe') return userRole !== 'vendedor'
            return true
          }).map((item) => (<NavLink key={item.label} item={item} pathname={pathname} />))}
        </div>
        <div className="my-4 px-3" style={{ borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
          {adminNav.filter((item) => {
            // Comissões: só master e representante
            if (item.href === '/comissoes') return ['master', 'representante'].includes(userRole)
            // Planos: só master e representante
            if (item.href === '/planos') return ['master', 'representante'].includes(userRole)
            return true
          }).map((item) => (<NavLink key={item.label} item={item} pathname={pathname} />))}
        </div>
      </nav>

      <div className="border-t" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-3 px-3 py-4 min-w-0">
          <UserAvatar userNome={userNome} userEmail={userEmail} fotoUrl={fotoUrl} onFotoChange={onFotoChange} />
          <div className="flex flex-col min-w-0 gap-1">
            <span className="text-xs font-medium truncate" style={{ color: 'var(--text2)' }}>
              {displayName}
            </span>
            {userRole && (
              <span
                className="text-[10px] font-semibold px-1.5 py-0.5 rounded w-fit"
                style={{
                  background: `${roleColors[userRole] || '#64748b'}20`,
                  color: roleColors[userRole] || '#64748b',
                }}
              >
                {roleLabels[userRole] || userRole}
              </span>
            )}
          </div>
        </div>
        <button
          onClick={onSignOut}
          className="flex w-full items-center gap-3 px-3 py-2.5 text-xs font-medium transition-all hover:bg-white/5 rounded-md"
          style={{ color: 'var(--muted-color)' }}
        >
          <LogOut size={16} />
          <span>Sair</span>
        </button>
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
  const [fotoUrl, setFotoUrl] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data }) => {
      if (data.user) {
        const { data: usuario } = await supabase
          .from('usuarios')
          .select(`nome, role, foto_url, empresas(nome, logo_url)`)
          .eq('auth_user_id', data.user.id)
          .single()

        if (usuario) {
          setUserNome(usuario.nome)
          setUserEmail(data.user.email ?? null)
          setUserRole(usuario.role)
          setFotoUrl(usuario.foto_url)
          const emp = usuario.empresas as any
          if (emp) {
            setEmpresaNome(emp.nome)
            setEmpresaLogo(emp.logo_url)
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

  const handleFotoChange = (novaFotoUrl: string | null) => {
    setFotoUrl(novaFotoUrl)
  }

  return (
    <>
      {/* Mobile Menu Button */}
      <div className="fixed top-0 left-0 right-0 lg:hidden z-50 flex items-center px-4 py-3" style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
        <button onClick={() => setMobileOpen(!mobileOpen)} className="p-2">
          {mobileOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Sidebar */}
      <aside
        className={`fixed left-0 top-0 h-screen w-60 transform transition-transform duration-300 ease-in-out lg:translate-x-0 z-40 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <SidebarContent
          userNome={userNome}
          userEmail={userEmail}
          userRole={userRole}
          empresaNome={empresaNome}
          empresaLogo={empresaLogo}
          fotoUrl={fotoUrl}
          onFotoChange={handleFotoChange}
          onSignOut={handleSignOut}
        />
      </aside>

      {/* Mobile Overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 lg:hidden"
          onClick={() => setMobileOpen(false)}
          style={{ background: 'rgba(0, 0, 0, 0.5)' }}
        />
      )}
    </>
  )
}
