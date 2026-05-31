'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import Sidebar from '@/components/Sidebar'
import Header from '@/components/Header'
import AdicionarUsuarioModal from '@/components/AdicionarUsuarioModal'
import ResetSenhaModal from '@/components/ResetSenhaModal'
import { Plus, Users, Users2, UserX, UserCheck, Trash2, KeyRound, AlertTriangle, AlertOctagon } from 'lucide-react'

interface Usuario {
  id: string
  nome: string
  email: string
  role: string
  ativo: boolean
  senha_temporaria: boolean
  empresa_id: string | null
  equipe_id: string | null
  criado_em: string
  empresa?: { nome: string } | null
}

interface Equipe {
  id: string
  nome: string
  empresa_id?: string | null
}

const roleLabels: Record<string, string> = {
  master: 'Master',
  representante: 'Representante',
  adm: 'Administrativo',
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

const PODE_DESATIVAR: Record<string, string[]> = {
  master: ['representante', 'adm', 'supervisor', 'vendedor'],
  representante: ['adm', 'supervisor', 'vendedor'],
  adm: ['supervisor', 'vendedor'],
  supervisor: ['vendedor'],
  vendedor: [],
}

export default function EquipePage() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [equipes, setEquipes] = useState<Equipe[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [empresaId, setEmpresaId] = useState<string | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [currentUserEquipe, setCurrentUserEquipe] = useState<string | null>(null)
  const [empresasLista, setEmpresasLista] = useState<any[]>([])
  const [filtroEmpresa, setFiltroEmpresa] = useState('')
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null)
  const [mostrarInativos, setMostrarInativos] = useState(false)
  const [confirmDesativar, setConfirmDesativar] = useState<Usuario | null>(null)
  const [confirmDeletar, setConfirmDeletar] = useState<Usuario | null>(null)
  const [textoConfirmDeletar, setTextoConfirmDeletar] = useState('')
  const [acaoLoading, setAcaoLoading] = useState(false)
  const [confirmReset, setConfirmReset] = useState<Usuario | null>(null)
  const [mudarEquipeModal, setMudarEquipeModal] = useState<any>(null)
  const [novaEquipe, setNovaEquipe] = useState('')
  const [salvandoEquipe, setSalvandoEquipe] = useState(false)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: currentUser } = await supabase
      .from('usuarios')
      .select('id, empresa_id, role, equipe_id')
      .eq('auth_user_id', user.id)
      .single()

    if (currentUser) {
      setCurrentUserId(currentUser.id)
      setEmpresaId(currentUser.empresa_id)
      setCurrentUserRole(currentUser.role)
      setCurrentUserEquipe(currentUser.equipe_id || null)
    }

    let queryUsuarios = supabase
      .from('usuarios')
      .select('*, empresa:empresas(nome)')
      .order('criado_em', { ascending: false })

    // escopo: master vê todos; demais veem só a própria empresa
    if (currentUser && currentUser.role !== 'master' && currentUser.empresa_id) {
      queryUsuarios = queryUsuarios.eq('empresa_id', currentUser.empresa_id)
    }
    const { data: usuariosData } = await queryUsuarios

    if (usuariosData) setUsuarios(usuariosData as Usuario[])

    const { data: equipesData } = await supabase
      .from('equipes')
      .select('id, nome, empresa_id')
      .order('nome')

    if (equipesData) setEquipes(equipesData)

    // empresas (pro filtro do master)
    if (currentUser?.role === 'master') {
      const { data: empData } = await supabase.from('empresas').select('id, nome').order('nome')
      if (empData) setEmpresasLista(empData)
    }
    setLoading(false)
  }

  function handleUsuarioCriado() { loadData() }

  async function toggleAtivo(usuario: Usuario) {
    setAcaoLoading(true)
    try {
      const res = await fetch(`/api/usuarios/${usuario.id}/toggle-ativo`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        alert(data.error || 'Erro ao atualizar status')
      } else {
        await loadData()
      }
    } catch {
      alert('Erro de conexão')
    }
    setAcaoLoading(false)
    setConfirmDesativar(null)
  }

  async function deletarUsuario(usuario: Usuario) {
    setAcaoLoading(true)
    try {
      const res = await fetch(`/api/usuarios/${usuario.id}/deletar`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        alert(data.error || 'Erro ao deletar usuário')
      } else {
        await loadData()
      }
    } catch {
      alert('Erro de conexão')
    }
    setAcaoLoading(false)
    setConfirmDeletar(null)
    setTextoConfirmDeletar('')
  }

  async function salvarMudarEquipe() {
    if (!mudarEquipeModal) return
    setSalvandoEquipe(true)
    const supabase = createClient()
    await supabase.from('usuarios').update({ equipe_id: novaEquipe || null }).eq('id', mudarEquipeModal.id)
    setSalvandoEquipe(false)
    setMudarEquipeModal(null)
    location.reload()
  }

  const canAddUsers = ['master', 'representante', 'adm', 'supervisor'].includes(currentUserRole || '')

  const usuariosFiltrados = (mostrarInativos ? usuarios : usuarios.filter(u => u.ativo))
    .filter(u => !filtroEmpresa || u.empresa_id === filtroEmpresa)

  function podeDesativarAlvo(alvo: Usuario): boolean {
    if (!currentUserRole) return false
    if (alvo.id === currentUserId) return false
    const rolesPermitidos = PODE_DESATIVAR[currentUserRole] || []
    return rolesPermitidos.includes(alvo.role)
  }

  return (
    <div className="relative min-h-screen font-sans">
      <Sidebar />
      <div className="relative lg:ml-60" style={{ zIndex: 1 }}>
        <Header title="Equipe" />
        <main className="mx-auto max-w-[1400px] px-6 py-8 lg:px-8">
          <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: 'rgba(212,175,55,0.15)', border: '1px solid rgba(212,175,55,0.25)' }}>
                <Users size={18} style={{ color: 'var(--accent)' }} />
              </div>
              <div>
                <h2 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>Usuários do Sistema</h2>
                <p className="text-xs" style={{ color: 'var(--muted-color)' }}>
                  {usuariosFiltrados.length} usuário{usuariosFiltrados.length !== 1 ? 's' : ''}
                  {!mostrarInativos && usuarios.some(u => !u.ativo) && (
                    <> · {usuarios.filter(u => !u.ativo).length} inativo{usuarios.filter(u => !u.ativo).length !== 1 ? 's' : ''} oculto{usuarios.filter(u => !u.ativo).length !== 1 ? 's' : ''}</>
                  )}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {currentUserRole === 'master' && empresasLista.length > 0 && (
                <select value={filtroEmpresa} onChange={(e) => setFiltroEmpresa(e.target.value)} className="rounded-lg px-3 py-2 text-sm outline-none" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                  <option value="" style={{ background: '#131313' }}>Todas as empresas</option>
                  {empresasLista.map(e => <option key={e.id} value={e.id} style={{ background: '#131313' }}>{e.nome}</option>)}
                </select>
              )}
              <label className="flex items-center gap-2 cursor-pointer text-xs" style={{ color: 'var(--muted-color)' }}>
                <input type="checkbox" checked={mostrarInativos} onChange={(e) => setMostrarInativos(e.target.checked)} className="accent-yellow-600" />
                Mostrar inativos
              </label>
              {canAddUsers && (
                <button onClick={() => setModalOpen(true)} className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold" style={{ background: 'linear-gradient(135deg, #d4af37 0%, #c9a227 50%, #b8941f 100%)', color: '#0a0a0a' }}>
                  <Plus size={16} />
                  Adicionar Usuário
                </button>
              )}
            </div>
          </div>

          <div className="rounded-xl overflow-hidden" style={{ background: 'rgba(0,0,0,0.12)', backdropFilter: 'blur(4px)', border: '1px solid var(--border)' }}>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <p className="text-sm" style={{ color: 'var(--muted-color)' }}>Carregando...</p>
              </div>
            ) : usuariosFiltrados.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2">
                <Users size={32} style={{ color: 'var(--muted-color)' }} />
                <p className="text-sm" style={{ color: 'var(--muted-color)' }}>Nenhum usuário</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase" style={{ color: 'var(--muted-color)' }}>Nome</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase" style={{ color: 'var(--muted-color)' }}>Email</th>
                      {currentUserRole === 'master' && (
                        <th className="px-4 py-3 text-left text-xs font-medium uppercase" style={{ color: 'var(--muted-color)' }}>Empresa</th>
                      )}
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase" style={{ color: 'var(--muted-color)' }}>Cargo</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase" style={{ color: 'var(--muted-color)' }}>Status</th>
                      <th className="px-4 py-3 text-right text-xs font-medium uppercase" style={{ color: 'var(--muted-color)' }}>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usuariosFiltrados.map((u) => (
                      <tr key={u.id} style={{ borderBottom: '1px solid var(--border)', opacity: u.ativo ? 1 : 0.5 }}>
                        <td className="px-4 py-3">
                          <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>{u.nome}</span>
                          {u.id === currentUserId && (
                            <span className="ml-2 text-xs" style={{ color: 'var(--accent)' }}>(você)</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm font-mono" style={{ color: 'var(--text2)' }}>{u.email}</span>
                        </td>
                        {currentUserRole === 'master' && (
                          <td className="px-4 py-3">
                            <span className="text-sm" style={{ color: 'var(--text2)' }}>{u.empresa?.nome || '-'}</span>
                          </td>
                        )}
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium" style={{ background: `${roleColors[u.role]}20`, color: roleColors[u.role], border: `1px solid ${roleColors[u.role]}40` }}>
                            {roleLabels[u.role] || u.role}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium" style={{ background: u.ativo ? 'rgba(34,197,94,0.15)' : 'rgba(115,115,115,0.15)', color: u.ativo ? '#22c55e' : '#737373' }}>
                              {u.ativo ? 'Ativo' : 'Inativo'}
                            </span>
                            {u.senha_temporaria && u.ativo && (
                              <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium" style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}>
                                Senha temp.
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            {['master','representante','adm'].includes(currentUserRole || '') && ['vendedor','supervisor'].includes(u.role) && u.id !== currentUserId && (
                              <button onClick={() => { setMudarEquipeModal(u); setNovaEquipe(u.equipe_id || '') }} className="flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors" style={{ color: '#a855f7', background: 'rgba(168,85,247,0.08)' }} title="Mudar equipe">
                                <Users2 size={14} />
                                <span className="hidden sm:inline">Equipe</span>
                              </button>
                            )}
                            {u.id === currentUserId && (
                              <button onClick={() => setConfirmReset(u)} className="flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors" style={{ color: '#f59e0b', background: 'rgba(245,158,11,0.08)' }} title="Trocar minha senha">
                                <KeyRound size={14} />
                                <span className="hidden sm:inline">Trocar senha</span>
                              </button>
                            )}
                            {podeDesativarAlvo(u) && (
                              <>
                                <button
                                  onClick={() => setConfirmReset(u)}
                                  className="flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors"
                                  style={{ color: '#3b82f6', background: 'rgba(59,130,246,0.08)' }}
                                  title="Resetar senha"
                                >
                                  <KeyRound size={14} />
                                  <span className="hidden sm:inline">Reset</span>
                                </button>
                                <button onClick={() => setConfirmDesativar(u)} className="flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors" style={{ color: u.ativo ? '#ef4444' : '#22c55e', background: u.ativo ? 'rgba(239,68,68,0.08)' : 'rgba(34,197,94,0.08)' }} title={u.ativo ? 'Desativar (preserva dados)' : 'Reativar'}>
                                  {u.ativo ? <UserX size={14} /> : <UserCheck size={14} />}
                                  <span>{u.ativo ? 'Desativar' : 'Reativar'}</span>
                                </button>
                                {!u.ativo && (
                                  <button onClick={() => setConfirmDeletar(u)} className="flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors" style={{ color: '#dc2626', background: 'rgba(220,38,38,0.08)' }} title="Deletar permanentemente">
                                    <Trash2 size={14} />
                                    <span>Deletar</span>
                                  </button>
                                )}
                              </>
                            )}
                          </div>
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

      <ResetSenhaModal
        open={!!confirmReset}
        onClose={() => setConfirmReset(null)}
        usuario={confirmReset}
        onSuccess={loadData}
      />

      <AdicionarUsuarioModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        empresaId={empresaId}
        equipes={equipes}
        currentUserRole={currentUserRole}
        currentUserEquipe={currentUserEquipe}
        onSuccess={handleUsuarioCriado}
        onEquipeCriada={loadData}
      />

      {confirmDesativar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }} onClick={() => setConfirmDesativar(null)} />
          <div className="relative w-full max-w-md rounded-xl p-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="flex items-start gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg shrink-0" style={{ background: confirmDesativar.ativo ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.15)' }}>
                <AlertTriangle size={20} style={{ color: confirmDesativar.ativo ? '#ef4444' : '#22c55e' }} />
              </div>
              <div>
                <h3 className="text-base font-semibold mb-1" style={{ color: 'var(--text)' }}>
                  {confirmDesativar.ativo ? 'Desativar' : 'Reativar'} {confirmDesativar.nome}?
                </h3>
                <p className="text-sm" style={{ color: 'var(--muted-color)' }}>
                  {confirmDesativar.ativo
                    ? 'O usuário não poderá mais fazer login. Os dados ficam preservados e você pode reativar a qualquer momento.'
                    : 'O usuário poderá voltar a fazer login normalmente.'}
                </p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmDesativar(null)} className="rounded-lg px-4 py-2 text-sm" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', color: 'var(--text2)' }}>
                Cancelar
              </button>
              <button onClick={() => toggleAtivo(confirmDesativar)} disabled={acaoLoading} className="rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ background: confirmDesativar.ativo ? '#ef4444' : '#22c55e', color: '#fff' }}>
                {acaoLoading ? '...' : confirmDesativar.ativo ? 'Desativar' : 'Reativar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDeletar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)' }} onClick={() => { setConfirmDeletar(null); setTextoConfirmDeletar('') }} />
          <div className="relative w-full max-w-md rounded-xl p-6" style={{ background: 'var(--surface)', border: '1px solid rgba(220,38,38,0.3)' }}>
            <div className="flex items-start gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg shrink-0" style={{ background: 'rgba(220,38,38,0.15)' }}>
                <AlertOctagon size={20} style={{ color: '#dc2626' }} />
              </div>
              <div>
                <h3 className="text-base font-semibold mb-1" style={{ color: 'var(--text)' }}>
                  DELETAR {confirmDeletar.nome}?
                </h3>
                <p className="text-sm" style={{ color: 'var(--muted-color)' }}>
                  Esta ação é <strong style={{ color: '#dc2626' }}>permanente e irreversível</strong>. O usuário e seus dados serão removidos do sistema.
                </p>
                <p className="text-xs mt-2" style={{ color: 'var(--muted-color)' }}>
                  Só funciona se o usuário nunca tiver feito ações (vendas, lances, etc). Se já tiver, o sistema vai recomendar desativar.
                </p>
              </div>
            </div>
            <div className="mb-4">
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--muted-color)' }}>
                Digite <strong>DELETAR</strong> pra confirmar:
              </label>
              <input
                type="text"
                value={textoConfirmDeletar}
                onChange={(e) => setTextoConfirmDeletar(e.target.value)}
                placeholder="DELETAR"
                className="w-full rounded-lg px-3 py-2.5 text-sm outline-none font-mono"
                style={{ background: 'rgba(220,38,38,0.05)', border: '1px solid rgba(220,38,38,0.3)', color: 'var(--text)' }}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => { setConfirmDeletar(null); setTextoConfirmDeletar('') }} className="rounded-lg px-4 py-2 text-sm" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', color: 'var(--text2)' }}>
                Cancelar
              </button>
              <button
                onClick={() => deletarUsuario(confirmDeletar)}
                disabled={acaoLoading || textoConfirmDeletar !== 'DELETAR'}
                className="rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-30 disabled:cursor-not-allowed"
                style={{ background: '#dc2626', color: '#fff' }}
              >
                {acaoLoading ? '...' : 'Deletar permanentemente'}
              </button>
            </div>
          </div>
        </div>
      )}

      {mudarEquipeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }} onClick={() => setMudarEquipeModal(null)} />
          <div className="relative w-full max-w-sm rounded-xl p-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <h3 className="text-base font-semibold mb-1" style={{ color: 'var(--text)' }}>Mudar equipe</h3>
            <p className="text-xs mb-4" style={{ color: 'var(--muted-color)' }}>{mudarEquipeModal.nome}</p>
            <select value={novaEquipe} onChange={(e) => setNovaEquipe(e.target.value)} className="w-full rounded-lg px-3 py-2.5 text-sm outline-none mb-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', color: 'var(--text)' }}>
              <option value="" style={{ background: '#131313' }}>Sem equipe</option>
              {equipes.map((eq) => (<option key={eq.id} value={eq.id} style={{ background: '#131313' }}>{eq.nome}</option>))}
            </select>
            <div className="flex gap-2">
              <button onClick={() => setMudarEquipeModal(null)} className="flex-1 rounded-lg py-2.5 text-sm" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', color: 'var(--text2)' }}>Cancelar</button>
              <button onClick={salvarMudarEquipe} disabled={salvandoEquipe} className="flex-1 rounded-lg py-2.5 text-sm font-semibold disabled:opacity-50" style={{ background: 'linear-gradient(135deg, #d4af37 0%, #c9a227 50%, #b8941f 100%)', color: '#0a0a0a' }}>{salvandoEquipe ? 'Salvando...' : 'Salvar'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
