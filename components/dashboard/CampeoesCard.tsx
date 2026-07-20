'use client'

import { Trophy, Users, Building2, Medal } from 'lucide-react'

interface Campeao {
  nome: string
  foto?: string | null
  equipe?: string | null
  empresa?: string | null
  logo?: string | null
  valor: number
}

interface Props {
  titulo: string
  subtitulo?: string
  icone?: 'trophy' | 'zap'
  campeoes: {
    vendedor: Campeao | null
    equipe: (Campeao & { empresa?: string | null }) | null
    representacao: (Campeao & { logo?: string | null }) | null
  }
  destaque?: boolean
}

const fmtMoeda = (v: number) =>
  (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

function Iniciais({ nome }: { nome: string }) {
  const ini = nome.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase()
  return <span className="text-sm font-bold" style={{ color: 'var(--accent)' }}>{ini || '?'}</span>
}

export default function CampeoesCard({ titulo, subtitulo, campeoes, destaque }: Props) {
  const linhas: { label: string; icon: any; nome: string; foto?: string | null; sub?: string | null; valor: number }[] = [
    campeoes.vendedor && {
      label: 'Vendedor', icon: Trophy, nome: campeoes.vendedor.nome, foto: campeoes.vendedor.foto,
      sub: [campeoes.vendedor.equipe, campeoes.vendedor.empresa].filter(Boolean).join(' · ') || null,
      valor: campeoes.vendedor.valor,
    },
    campeoes.equipe && {
      label: 'Equipe', icon: Users, nome: campeoes.equipe.nome, sub: campeoes.equipe.empresa || null, valor: campeoes.equipe.valor,
    },
    campeoes.representacao && {
      label: 'Representação', icon: Building2, nome: campeoes.representacao.nome, sub: null, valor: campeoes.representacao.valor,
    },
  ].filter(Boolean) as any

  return (
    <div className="card-dark p-5 h-full anim-fade-up">
      <div className="flex items-center gap-2 mb-4">
        <Medal size={16} style={{ color: 'var(--accent)' }} />
        <div>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{titulo}</h3>
          {subtitulo && <p className="text-[11px]" style={{ color: 'var(--muted-color)' }}>{subtitulo}</p>}
        </div>
      </div>

      {linhas.length === 0 ? (
        <p className="text-sm py-6 text-center" style={{ color: 'var(--muted-color)' }}>Nenhuma venda no período ainda</p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {linhas.map((l, i) => {
            const Icon = l.icon
            return (
              <div
                key={l.label}
                className="flex items-center gap-3 rounded-xl p-3"
                style={{
                  background: i === 0 && destaque ? 'rgba(212,175,55,0.08)' : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${i === 0 && destaque ? 'rgba(212,175,55,0.25)' : 'var(--border)'}`,
                }}
              >
                {/* avatar/ícone */}
                <div className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full" style={{ background: 'rgba(212,175,55,0.12)', border: '1px solid rgba(212,175,55,0.25)' }}>
                  {l.foto ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={l.foto || "/placeholder.svg"} alt={l.nome} className="h-full w-full object-cover" crossOrigin="anonymous" />
                  ) : (
                    <Iniciais nome={l.nome} />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <Icon size={12} style={{ color: 'var(--accent)' }} />
                    <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--muted-color)' }}>{l.label}</span>
                  </div>
                  <p className="truncate text-sm font-semibold" style={{ color: 'var(--text)' }}>{l.nome}</p>
                  {l.sub && <p className="truncate text-[11px]" style={{ color: 'var(--muted-color)' }}>{l.sub}</p>}
                </div>
                <span className="shrink-0 font-mono text-sm font-bold" style={{ color: 'var(--accent)' }}>{fmtMoeda(l.valor)}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
