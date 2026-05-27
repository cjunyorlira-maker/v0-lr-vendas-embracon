'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import Sidebar from '@/components/Sidebar'
import Header from '@/components/Header'
import AdicionarUsuarioModal from '@/components/AdicionarUsuarioModal'
import { Plus, Users, Copy, Check } from 'lucide-react'

interface Usuario {
  id: string
  nome: string
  email: string
  role: string
  ativo: boolean
  senha_temporaria: boolean
  criado_em: string
}

interface Equipe {
  id: string
  nome: string
}

const roleLabels: Record<string, string> = {
  master: 'Master',
  representante: 'Representante',
  adm: 'Administrador',
  supervisor: 'Supervisor',
  vendedor: 'Vendedor',
}

const roleColors: Record<string, string> = {
  master: '#d4af37',
  representante: '#3b82f6',
  adm: '#8b5cf6',
  supervisor: '#22c55e',
  vendedor: '#737373',
}

export default function EquipePage() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [equipes, setEquipes] = useState<Equipe[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [empresaId, setEmpresaId] = useState<string | null>(null)
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    const supabase = createClient()
    
    // Busca dados do usuário atual
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: currentUser } = await supabase
      .from('usuarios')
      .select('empresa_id, role')
      .eq('auth_user_id', user.id)
      .single()

    if (currentUser) {
      setEmpresaId(currentUser.empresa_id)
      setCurrentUserRole(currentUser.role)
    }

    // Busca usuários da empresa
    const { data: usuariosData } = await supabase
      .from('usuarios')
      .select('*')
      .order('criado_em', { ascending: false })

    if (usuariosData) {
      setUsuarios(usuariosData)
    }

    // Busca equipes
    const { data: equipesData } = await supabase
      .from('equipes')
      .select('id, nome')
      .order('nome')

    if (equipesData) {
      setEquipes(equipesData)
    }

    setLoading(false)
  }

  function handleUsuarioCriado(novoUsuario: Usuario & { senha_temporaria_gerada?: string }) {
    setUsuarios(prev => [novoUsuario, ...prev])
  }

  async function copyToClipboard(text: string, id: string) {
    await navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const canAddUsers = ['master', 'representante', 'adm', 'supervisor'].includes(currentUserRole || '')

  return (
    <div className="relative min-h-screen font-sans">
      <Sidebar />

      <div className="relative lg:ml-60" style={{ zIndex: 1 }}>
        <Header title="Equipe" />

        <main className="mx-auto max-w-[1400px] px-6 py-8 lg:px-8">
          {/* Header da página */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div
                className="flex h-10 w-10 items-center justify-center rounded-xl"
                style={{ background: 'rgba(212,175,55,0.15)', border: '1px solid rgba(212,175,55,0.25)' }}
              >
                <Users size={18} style={{ color: 'var(--accent)' }} />
              </div>
              <div>
                <h2 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>
                  Usuários do Sistema
                </h2>
                <p className="text-xs" style={{ color: 'var(--muted-color)' }}>
                  {usuarios.length} usuário{usuarios.length !== 1 ? 's' : ''} cadastrado{usuarios.length !== 1 ? 's' : ''}
                </p>
              </div>
            </div>

            {canAddUsers && (
              <button
                onClick={() => setModalOpen(true)}
                className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all"
                style={{
                  background: 'linear-gradient(135deg, #d4af37 0%, #c9a227 50%, #b8941f 100%)',
                  color: '#0a0a0a',
                }}
              >
                <Plus size={16} />
                Adicionar Usuário
              </button>
            )}
          </div>

          {/* Tabela de usuários */}
          <div
            className="rounded-xl overflow-hidden"
            style={{
              background: 'rgba(0,0,0,0.12)',
              backdropFilter: 'blur(4px)',
              border: '1px solid var(--border)',
            }}
          >
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <p className="text-sm" style={{ color: 'var(--muted-color)' }}>Carregando...</p>
              </div>
            ) : usuarios.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2">
                <Users size={32} style={{ color: 'var(--muted-color)' }} />
                <p className="text-sm" style={{ color: 'var(--muted-color)' }}>Nenhum usuário cadastrado</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase" style={{ color: 'var(--muted-color)' }}>Nome</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase" style={{ color: 'var(--muted-color)' }}>Email</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase" style={{ color: 'var(--muted-color)' }}>Cargo</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase" style={{ color: 'var(--muted-color)' }}>Status</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase" style={{ color: 'var(--muted-color)' }}>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usuarios.map((u) => (
                      <tr key={u.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td className="px-4 py-3">
                          <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>{u.nome}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm font-mono" style={{ color: 'var(--text2)' }}>{u.email}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
                            style={{
                              background: `${roleColors[u.role]}20`,
                              color: roleColors[u.role],
                              border: `1px solid ${roleColors[u.role]}40`,
                            }}
                          >
                            {roleLabels[u.role] || u.role}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span
                              className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
                              style={{
                                background: u.ativo ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                                color: u.ativo ? '#22c55e' : '#ef4444',
                              }}
                            >
                              {u.ativo ? 'Ativo' : 'Inativo'}
                            </span>
                            {u.senha_temporaria && (
                              <span
                                className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
                                style={{
                                  background: 'rgba(245,158,11,0.15)',
                                  color: '#f59e0b',
                                }}
                              >
                                Senha temp.
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => copyToClipboard(u.email, u.id)}
                            className="flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors"
                            style={{ color: 'var(--muted-color)' }}
                            title="Copiar email"
                          >
                            {copiedId === u.id ? <Check size={14} /> : <Copy size={14} />}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Modal */}
      <AdicionarUsuarioModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        empresaId={empresaId}
        equipes={equipes}
        currentUserRole={currentUserRole}
        onSuccess={handleUsuarioCriado}
      />
    </div>
  )
}
