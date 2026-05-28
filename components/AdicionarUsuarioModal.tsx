'use client'

import { useState, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { X, Copy, Check, Eye, EyeOff, Upload, Plus } from 'lucide-react'

interface Equipe {
  id: string
  nome: string
}

interface Empresa {
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
  onEquipeCriada?: () => void
}

const TODOS_ROLES = [
  { value: 'representante', label: 'Representante' },
  { value: 'adm', label: 'Administrativo' },
  { value: 'supervisor', label: 'Supervisor' },
  { value: 'vendedor', label: 'Vendedor' },
]

export default function AdicionarUsuarioModal({
  open, onClose, empresaId, equipes, currentUserRole, onSuccess, onEquipeCriada,
}: Props) {
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('')
  const [equipeId, setEquipeId] = useState('')
  const [nomeEmpresa, setNomeEmpresa] = useState('')
  const [empresaIdAlvo, setEmpresaIdAlvo] = useState('')
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [logoBase64, setLogoBase64] = useState<string | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [senhaGerada, setSenhaGerada] = useState<string | null>(null)
  const [emailCriado, setEmailCriado] = useState<string | null>(null)
  const [copiedSenha, setCopiedSenha] = useState(false)
  const [copiedEmail, setCopiedEmail] = useState(false)
  const [showSenha, setShowSenha] = useState(true)
  const [showCriarEquipe, setShowCriarEquipe] = useState(false)
  const [nomeNovaEquipe, setNomeNovaEquipe] = useState('')
  const [criandoEquipe, setCriandoEquipe] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Master carrega lista de empresas
  useEffect(() => {
    if (open && currentUserRole === 'master') {
      fetch('/api/empresas/listar')
        .then(r => r.json())
        .then(d => { if (d.empresas) setEmpresas(d.empresas) })
        .catch(() => {})
    }
  }, [open, currentUserRole])

  const rolesPermitidos = TODOS_ROLES.filter((r) => {
    if (currentUserRole === 'master') return ['representante', 'adm', 'supervisor', 'vendedor'].includes(r.value)
    if (currentUserRole === 'representante') return ['adm', 'supervisor', 'vendedor'].includes(r.value)
    if (currentUserRole === 'adm') return ['supervisor', 'vendedor'].includes(r.value)
    if (currentUserRole === 'supervisor') return r.value === 'vendedor'
    return false
  })

  if (!role && rolesPermitidos.length > 0) {
    setRole(rolesPermitidos[0].value)
  }

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) { setError('Logo muito grande (máx 2MB)'); return }
    if (!file.type.startsWith('image/')) { setError('Arquivo deve ser uma imagem'); return }
    const reader = new FileReader()
    reader.onload = (event) => {
      const result = event.target?.result as string
      setLogoBase64(result); setLogoPreview(result); setError('')
    }
    reader.readAsDataURL(file)
  }

  function removerLogo() {
    setLogoBase64(null); setLogoPreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function criarEquipeInline() {
    const empresaParaEquipe = currentUserRole === 'master' ? empresaIdAlvo : empresaId
    if (!nomeNovaEquipe.trim() || !empresaParaEquipe) {
      setError('Selecione a empresa antes de criar equipe')
      return
    }
    setCriandoEquipe(true); setError('')
    try {
      const supabase = createClient()
      const { data, error: err } = await supabase
        .from('equipes')
        .insert({ nome: nomeNovaEquipe.trim(), empresa_id: empresaParaEquipe, ativo: true })
        .select().single()
      if (err) { setError('Erro ao criar equipe: ' + err.message); setCriandoEquipe(false); return }
      if (data) {
        setEquipeId(data.id); setShowCriarEquipe(false); setNomeNovaEquipe('')
        if (onEquipeCriada) onEquipeCriada()
      }
    } catch { setError('Erro ao criar equipe') }
    setCriandoEquipe(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')

    if (currentUserRole === 'master' && role === 'representante' && !nomeEmpresa.trim()) {
      setError('Nome da empresa é obrigatório'); setLoading(false); return
    }
    if (currentUserRole === 'master' && role !== 'representante' && !empresaIdAlvo) {
      setError('Selecione a empresa'); setLoading(false); return
    }

    try {
      const body: any = {
        nome: nome.trim(),
        email: email.trim().toLowerCase(),
        role,
        equipe_id: equipeId || null,
      }
      if (currentUserRole === 'master' && role === 'representante') {
        body.nome_empresa = nomeEmpresa.trim()
        if (logoBase64) body.logo_empresa_base64 = logoBase64
      }
      if (currentUserRole === 'master' && role !== 'representante') {
        body.empresa_id_alvo = empresaIdAlvo
      }

      const res = await fetch('/api/usuarios/criar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Erro ao criar usuário'); setLoading(false); return }
      setSenhaGerada(data.senha_temporaria)
      setEmailCriado(data.usuario.email)
      onSuccess(data.usuario)
    } catch { setError('Erro de conexão') }
    setLoading(false)
  }

  function handleClose() {
    setNome(''); setEmail(''); setRole(rolesPermitidos[0]?.value || '')
    setEquipeId(''); setNomeEmpresa(''); setEmpresaIdAlvo('')
    setLogoBase64(null); setLogoPreview(null); setError('')
    setSenhaGerada(null); setEmailCriado(null)
    setCopiedSenha(false); setCopiedEmail(false)
    setShowCriarEquipe(false); setNomeNovaEquipe('')
    onClose()
  }

  async function copyValue(value: string, tipo: 'senha' | 'email') {
    try { await navigator.clipboard.writeText(value) }
    catch {
      const ta = document.createElement('textarea')
      ta.value = value; ta.style.position = 'fixed'; ta.style.opacity = '0'
      document.body.appendChild(ta); ta.focus(); ta.select()
      try { document.execCommand('copy') } catch {}
      document.body.removeChild(ta)
    }
    if (tipo === 'senha') { setCopiedSenha(true); setTimeout(() => setCopiedSenha(false), 2000) }
    else { setCopiedEmail(true); setTimeout(() => setCopiedEmail(false), 2000) }
  }

  if (!open) return null

  const mostraEmpresaNova = currentUserRole === 'master' && role === 'representante'
  const mostraEscolheEmpresa = currentUserRole === 'master' && role !== 'representante'
  const mostraEquipe = ['supervisor', 'vendedor'].includes(role)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }} onClick={handleClose} />
      <div className="relative w-full max-w-md rounded-xl p-6 max-h-[90vh] overflow-y-auto" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>{senhaGerada ? 'Usuário Criado!' : 'Adicionar Usuário'}</h3>
          <button onClick={handleClose} className="p-1 rounded-lg" style={{ color: 'var(--muted-color)' }}><X size={18} /></button>
        </div>

        {senhaGerada ? (
          <div className="space-y-4">
            <p className="text-sm" style={{ color: 'var(--text2)' }}>Passe esses dados pro novo usuário. <strong>Não serão mostrados novamente.</strong></p>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--muted-color)' }}>Email</label>
              <div className="flex items-center justify-between rounded-lg p-3" style={{ background: 'rgba(212,175,55,0.08)', border: '1px solid rgba(212,175,55,0.2)' }}>
                <span className="font-mono text-sm" style={{ color: 'var(--text)' }}>{emailCriado}</span>
                <button onClick={() => copyValue(emailCriado!, 'email')} className="p-1.5 rounded" style={{ color: copiedEmail ? '#22c55e' : 'var(--accent)' }}>{copiedEmail ? <Check size={16} /> : <Copy size={16} />}</button>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--muted-color)' }}>Senha temporária</label>
              <div className="flex items-center justify-between rounded-lg p-3" style={{ background: 'rgba(212,175,55,0.08)', border: '1px solid rgba(212,175,55,0.2)' }}>
                <span className="font-mono text-base font-bold tracking-wider" style={{ color: 'var(--accent)' }}>{showSenha ? senhaGerada : '••••••••••••'}</span>
                <div className="flex items-center gap-1">
                  <button onClick={() => setShowSenha(!showSenha)} className="p-1.5 rounded" style={{ color: 'var(--muted-color)' }}>{showSenha ? <EyeOff size={16} /> : <Eye size={16} />}</button>
                  <button onClick={() => copyValue(senhaGerada, 'senha')} className="p-1.5 rounded" style={{ color: copiedSenha ? '#22c55e' : 'var(--accent)' }}>{copiedSenha ? <Check size={16} /> : <Copy size={16} />}</button>
                </div>
              </div>
            </div>
            <div className="rounded-lg p-3 text-xs" style={{ background: 'rgba(245,158,11,0.1)', color: '#f59e0b' }}>Anote agora. O usuário será forçado a trocar a senha no primeiro login.</div>
            <button onClick={handleClose} className="w-full rounded-lg py-2.5 text-sm font-semibold" style={{ background: 'linear-gradient(135deg, #d4af37 0%, #c9a227 50%, #b8941f 100%)', color: '#0a0a0a' }}>Fechar</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <div className="rounded-lg p-3 text-sm" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>{error}</div>}

            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--muted-color)' }}>Nome completo</label>
              <input type="text" value={nome} onChange={(e) => setNome(e.target.value)} required className="w-full rounded-lg px-3 py-2.5 text-sm outline-none" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', color: 'var(--text)' }} placeholder="Nome do usuário" />
            </div>

            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--muted-color)' }}>Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="w-full rounded-lg px-3 py-2.5 text-sm outline-none" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', color: 'var(--text)' }} placeholder="email@exemplo.com" />
            </div>

            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--muted-color)' }}>Cargo</label>
              <select value={role} onChange={(e) => setRole(e.target.value)} className="w-full rounded-lg px-3 py-2.5 text-sm outline-none" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                {rolesPermitidos.map((r) => (<option key={r.value} value={r.value} style={{ background: '#131313' }}>{r.label}</option>))}
              </select>
            </div>

            {mostraEmpresaNova && (
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--muted-color)' }}>Nome da empresa do representante <span style={{ color: '#ef4444' }}>*</span></label>
                <input type="text" value={nomeEmpresa} onChange={(e) => setNomeEmpresa(e.target.value)} required className="w-full rounded-lg px-3 py-2.5 text-sm outline-none" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', color: 'var(--text)' }} placeholder="Ex: DP6 Consultoria" />
              </div>
            )}

            {mostraEmpresaNova && (
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--muted-color)' }}>Logo da empresa <span style={{ color: 'var(--faint)' }}>(opcional)</span></label>
                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleLogoChange} className="hidden" />
                {!logoPreview ? (
                  <button type="button" onClick={() => fileInputRef.current?.click()} className="w-full rounded-lg p-4 flex flex-col items-center gap-2 cursor-pointer" style={{ background: 'rgba(255,255,255,0.02)', border: '1px dashed var(--border)', color: 'var(--muted-color)' }}>
                    <Upload size={20} /><span className="text-xs">Selecionar imagem (máx 2MB)</span>
                  </button>
                ) : (
                  <div className="rounded-lg p-3 flex items-center gap-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)' }}>
                    <img src={logoPreview || "/placeholder.svg"} alt="Preview" className="h-12 w-12 object-contain rounded" />
                    <div className="flex-1"><p className="text-xs" style={{ color: 'var(--text2)' }}>Logo carregada</p><button type="button" onClick={removerLogo} className="text-xs underline mt-1" style={{ color: '#ef4444' }}>Remover</button></div>
                  </div>
                )}
              </div>
            )}

            {mostraEscolheEmpresa && (
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--muted-color)' }}>Empresa <span style={{ color: '#ef4444' }}>*</span></label>
                <select value={empresaIdAlvo} onChange={(e) => { setEmpresaIdAlvo(e.target.value); setEquipeId('') }} required className="w-full rounded-lg px-3 py-2.5 text-sm outline-none" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                  <option value="" style={{ background: '#131313' }}>Selecione a empresa</option>
                  {empresas.map((emp) => (<option key={emp.id} value={emp.id} style={{ background: '#131313' }}>{emp.nome}</option>))}
                </select>
              </div>
            )}

            {mostraEquipe && !showCriarEquipe && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-medium" style={{ color: 'var(--muted-color)' }}>Equipe</label>
                  <button type="button" onClick={() => setShowCriarEquipe(true)} className="flex items-center gap-1 text-xs font-medium" style={{ color: 'var(--accent)' }}><Plus size={12} />Criar equipe</button>
                </div>
                {equipes.length > 0 ? (
                  <select value={equipeId} onChange={(e) => setEquipeId(e.target.value)} className="w-full rounded-lg px-3 py-2.5 text-sm outline-none" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                    <option value="" style={{ background: '#131313' }}>Sem equipe</option>
                    {equipes.map((eq) => (<option key={eq.id} value={eq.id} style={{ background: '#131313' }}>{eq.nome}</option>))}
                  </select>
                ) : (
                  <div className="rounded-lg p-3 text-xs" style={{ background: 'rgba(59,130,246,0.1)', color: '#3b82f6' }}>Nenhuma equipe cadastrada. Clique em &quot;Criar equipe&quot; acima.</div>
                )}
              </div>
            )}

            {mostraEquipe && showCriarEquipe && (
              <div className="rounded-lg p-3 space-y-2" style={{ background: 'rgba(212,175,55,0.05)', border: '1px solid rgba(212,175,55,0.2)' }}>
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-medium" style={{ color: 'var(--accent)' }}>Nova equipe</label>
                  <button type="button" onClick={() => { setShowCriarEquipe(false); setNomeNovaEquipe('') }} className="text-xs" style={{ color: 'var(--muted-color)' }}>Cancelar</button>
                </div>
                <input type="text" value={nomeNovaEquipe} onChange={(e) => setNomeNovaEquipe(e.target.value)} placeholder="Nome da equipe (ex: TDM)" className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', color: 'var(--text)' }} />
                <button type="button" onClick={criarEquipeInline} disabled={criandoEquipe || !nomeNovaEquipe.trim()} className="w-full rounded-lg py-2 text-xs font-semibold disabled:opacity-50" style={{ background: 'var(--accent)', color: '#0a0a0a' }}>{criandoEquipe ? 'Criando...' : 'Criar e usar essa equipe'}</button>
              </div>
            )}

            <button type="submit" disabled={loading} className="w-full rounded-lg py-2.5 text-sm font-semibold disabled:opacity-50" style={{ background: 'linear-gradient(135deg, #d4af37 0%, #c9a227 50%, #b8941f 100%)', color: '#0a0a0a' }}>{loading ? 'Criando...' : 'Criar Usuário'}</button>
          </form>
        )}
      </div>
    </div>
  )
}
