'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, Check, ShoppingBag, DollarSign, CheckCircle2, Info } from 'lucide-react'

interface Notif {
  id: string
  titulo: string
  mensagem: string | null
  tipo: string
  link_url: string | null
  lida: boolean
  criado_em: string
}

const ICONES: Record<string, { icon: any; cor: string }> = {
  nova_venda: { icon: ShoppingBag, cor: '#eab308' },
  cliente_pagou: { icon: DollarSign, cor: '#3b82f6' },
  efetivado: { icon: CheckCircle2, cor: '#22c55e' },
  generico: { icon: Info, cor: '#a855f7' },
}

function tempoAtras(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `${min}min`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  return `${d}d`
}

export default function SinoNotificacoes() {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [notifs, setNotifs] = useState<Notif[]>([])
  const [naoLidas, setNaoLidas] = useState(0)
  const ref = useRef<HTMLDivElement>(null)

  async function carregar() {
    try {
      const res = await fetch('/api/notificacoes')
      const data = await res.json()
      if (data.notificacoes) { setNotifs(data.notificacoes); setNaoLidas(data.nao_lidas || 0) }
    } catch {}
  }

  useEffect(() => {
    carregar()
    const intervalo = setInterval(carregar, 20000) // atualiza a cada 20s
    return () => clearInterval(intervalo)
  }, [])

  // fecha ao clicar fora
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  async function marcarTodas() {
    await fetch('/api/notificacoes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ todas: true }) })
    carregar()
  }

  async function abrirNotif(n: Notif) {
    if (!n.lida) {
      await fetch('/api/notificacoes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: n.id }) })
    }
    setAberto(false)
    if (n.link_url) router.push(n.link_url)
    carregar()
  }

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setAberto(!aberto)} className="relative flex h-8 w-8 items-center justify-center rounded-lg transition-all" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', color: aberto ? 'var(--accent)' : 'var(--muted-color)' }} aria-label="Notificações">
        <Bell size={14} />
        {naoLidas > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold" style={{ background: '#ef4444', color: '#fff' }}>
            {naoLidas > 9 ? '9+' : naoLidas}
          </span>
        )}
      </button>

      {aberto && (
        <div className="absolute right-0 mt-2 w-80 rounded-xl overflow-hidden shadow-2xl" style={{ background: 'var(--surface, #131313)', border: '1px solid var(--border)', zIndex: 50 }}>
          <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
            <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Notificações</span>
            {naoLidas > 0 && <button onClick={marcarTodas} className="flex items-center gap-1 text-xs" style={{ color: 'var(--accent)' }}><Check size={12} />Marcar lidas</button>}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {notifs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 gap-2"><Bell size={24} style={{ color: 'var(--muted-color)' }} /><p className="text-xs" style={{ color: 'var(--muted-color)' }}>Nenhuma notificação</p></div>
            ) : (
              notifs.map(n => {
                const cfg = ICONES[n.tipo] || ICONES.generico
                const Icon = cfg.icon
                return (
                  <button key={n.id} onClick={() => abrirNotif(n)} className="w-full flex items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.03]" style={{ borderBottom: '1px solid var(--border)', background: n.lida ? 'transparent' : 'rgba(212,175,55,0.04)' }}>
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ background: `${cfg.cor}20` }}><Icon size={14} style={{ color: cfg.cor }} /></div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold truncate" style={{ color: 'var(--text)' }}>{n.titulo}</p>
                        <span className="text-[10px] shrink-0" style={{ color: 'var(--muted-color)' }}>{tempoAtras(n.criado_em)}</span>
                      </div>
                      {n.mensagem && <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--muted-color)' }}>{n.mensagem}</p>}
                    </div>
                    {!n.lida && <span className="h-2 w-2 shrink-0 rounded-full mt-1" style={{ background: 'var(--accent)' }} />}
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
