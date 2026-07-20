'use client'

import { Medal } from 'lucide-react'

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
  badge?: string // ex.: "dom–sáb"
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

export default function CampeoesCard({ titulo, subtitulo, badge, campeoes, destaque }: Props) {
  const linhas: {
    label: string; emoji: string; nome: string; foto?: string | null;
    logo?: string | null; sub?: string | null; valor: number;
  }[] = [
    campeoes.vendedor && {
      label: 'Vendedor', emoji: '🥇', nome: campeoes.vendedor.nome, foto: campeoes.vendedor.foto,
      sub: [campeoes.vendedor.equipe, campeoes.vendedor.empresa].filter(Boolean).join(' · ') || null,
      valor: campeoes.vendedor.valor,
    },
    campeoes.equipe && {
      label: 'Equipe', emoji: '🛡️', nome: campeoes.equipe.nome, sub: campeoes.equipe.empresa || null, valor: campeoes.equipe.valor,
    },
    campeoes.representacao && {
      label: 'Representação', emoji: '🏢', nome: campeoes.representacao.nome, logo: campeoes.representacao.logo, sub: null, valor: campeoes.representacao.valor,
    },
  ].filter(Boolean) as any

  return (
    <div className="card-dark relative overflow-hidden p-5 h-full anim-fade-up">
      {/* luz dourada atravessando o card a cada ~6s */}
      <span className="shimmer-cross" aria-hidden="true" />

      <div className="relative flex items-center gap-2 mb-4">
        <Medal size={16} style={{ color: 'var(--accent)' }} />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{titulo}</h3>
            {badge && (
              <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: 'rgba(212,175,55,0.14)', border: '1px solid rgba(212,175,55,0.3)', color: 'var(--accent)' }}>
                {badge}
              </span>
            )}
          </div>
          {subtitulo && <p className="text-[11px]" style={{ color: 'var(--muted-color)' }}>{subtitulo}</p>}
        </div>
      </div>

      {linhas.length === 0 ? (
        <p className="relative text-sm py-6 text-center" style={{ color: 'var(--muted-color)' }}>Nenhuma venda no período ainda</p>
      ) : (
        <div className="relative flex flex-col gap-2.5">
          {linhas.map((l, i) => (
            <div
              key={l.label}
              className="anim-fade-up flex items-center gap-3 rounded-xl p-3"
              style={{
                animationDelay: `${i * 80}ms`,
                background: i === 0 && destaque ? 'rgba(212,175,55,0.08)' : 'rgba(255,255,255,0.02)',
                border: `1px solid ${i === 0 && destaque ? 'rgba(212,175,55,0.25)' : 'var(--border)'}`,
              }}
            >
              {/* avatar/escudo com anel dourado + glow */}
              <div className="anel-dourado relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full" style={{ background: l.logo ? 'rgba(255,255,255,0.95)' : 'rgba(212,175,55,0.12)' }}>
                {l.foto ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={l.foto || "/placeholder.svg"} alt={l.nome} className="h-full w-full object-cover" crossOrigin="anonymous" />
                ) : l.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={l.logo || "/placeholder.svg"} alt={l.nome} className="h-full w-full object-contain p-1" crossOrigin="anonymous" />
                ) : (
                  <Iniciais nome={l.nome} />
                )}
              </div>

              {/* medalha/categoria grande (22px) */}
              <span className="shrink-0 leading-none" style={{ fontSize: 22 }} role="img" aria-label={l.label}>{l.emoji}</span>

              <div className="min-w-0 flex-1">
                <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--muted-color)' }}>{l.label}</span>
                <p className="truncate text-sm font-semibold" style={{ color: 'var(--text)' }}>{l.nome}</p>
                {l.sub && <p className="truncate text-[11px]" style={{ color: 'var(--muted-color)' }}>{l.sub}</p>}
              </div>
              <span className="shrink-0 font-mono text-sm font-bold" style={{ color: 'var(--accent)' }}>{fmtMoeda(l.valor)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
