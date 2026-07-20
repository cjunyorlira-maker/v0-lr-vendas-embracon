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

interface Grupo {
  vendedores: Campeao[]
  equipes: Campeao[]
  representacoes: Campeao[]
}

type Modo = 'geral' | 'minha_empresa'

interface Props {
  titulo: string
  subtitulo?: string
  badge?: string // ex.: "dom–sáb"
  geral: Grupo
  minhaEmpresa?: Grupo | null
  empresaNome?: string | null // rótulo da pill "Minha representação"
  modo: Modo
  onModoChange: (m: Modo) => void
  vazioLabel?: string
}

const fmtMoeda = (v: number) =>
  (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

const MEDALHAS = ['🥇', '🥈', '🥉']

function Iniciais({ nome, size }: { nome: string; size: number }) {
  const ini = nome.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase()
  return <span className="font-bold" style={{ color: 'var(--accent)', fontSize: size }}>{ini || '?'}</span>
}

/** pódio vertical compacto de uma categoria (top 3) */
function Coluna({ titulo, emoji, itens, delayBase }: { titulo: string; emoji: string; itens: Campeao[]; delayBase: number }) {
  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-1.5 mb-2.5">
        <span className="leading-none" style={{ fontSize: 14 }} role="img" aria-label={titulo}>{emoji}</span>
        <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--muted-color)' }}>{titulo}</span>
      </div>

      {itens.length === 0 ? (
        <p className="text-[11px] py-2" style={{ color: 'var(--muted-color)' }}>—</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {itens.map((it, i) => {
            const primeiro = i === 0
            const av = primeiro ? 40 : 28
            return (
              <div
                key={i}
                className="anim-fade-up flex items-center gap-2 rounded-lg"
                style={{
                  animationDelay: `${delayBase + i * 70}ms`,
                  padding: primeiro ? '8px' : '5px 8px',
                  background: primeiro ? 'rgba(212,175,55,0.08)' : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${primeiro ? 'rgba(212,175,55,0.25)' : 'var(--border)'}`,
                }}
              >
                <span className="shrink-0 leading-none" style={{ fontSize: primeiro ? 18 : 14 }} role="img" aria-label={`${i + 1}º`}>{MEDALHAS[i]}</span>

                {/* avatar/escudo — 1º com anel dourado + glow */}
                <div
                  className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-full ${primeiro ? 'anel-dourado' : ''}`}
                  style={{ height: av, width: av, background: it.logo ? 'rgba(255,255,255,0.95)' : 'rgba(212,175,55,0.12)', border: primeiro ? undefined : '1px solid var(--border)' }}
                >
                  {it.foto ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={it.foto || "/placeholder.svg"} alt={it.nome} className="h-full w-full object-cover" crossOrigin="anonymous" />
                  ) : it.logo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={it.logo || "/placeholder.svg"} alt={it.nome} className="h-full w-full object-contain p-0.5" crossOrigin="anonymous" />
                  ) : (
                    <Iniciais nome={it.nome} size={primeiro ? 14 : 11} />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold" style={{ color: 'var(--text)', fontSize: primeiro ? 13 : 12 }}>{it.nome}</p>
                  <p className="truncate font-mono font-bold" style={{ color: 'var(--accent)', fontSize: primeiro ? 12 : 11 }}>{fmtMoeda(it.valor)}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Pill({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors"
      style={{
        background: ativo ? 'rgba(212,175,55,0.16)' : 'transparent',
        border: `1px solid ${ativo ? 'rgba(212,175,55,0.4)' : 'var(--border)'}`,
        color: ativo ? 'var(--accent)' : 'var(--muted-color)',
      }}
    >
      {children}
    </button>
  )
}

export default function CampeoesCard({ titulo, subtitulo, badge, geral, minhaEmpresa, empresaNome, modo, onModoChange, vazioLabel }: Props) {
  // o toggle só existe se houver recorte da empresa do usuário
  const temToggle = !!(minhaEmpresa && empresaNome)
  const modoEfetivo: Modo = temToggle ? modo : 'geral'
  const dados = modoEfetivo === 'minha_empresa' && minhaEmpresa ? minhaEmpresa : geral
  const mostrarRepresentacoes = modoEfetivo === 'geral' // some no modo "minha representação"

  const vazio =
    dados.vendedores.length === 0 &&
    dados.equipes.length === 0 &&
    (!mostrarRepresentacoes || dados.representacoes.length === 0)

  return (
    <div className="card-dark relative overflow-hidden p-5 h-full anim-fade-up">
      {/* luz dourada atravessando o card a cada ~6s */}
      <span className="shimmer-cross" aria-hidden="true" />

      <div className="relative mb-4 flex flex-wrap items-center gap-x-2 gap-y-2">
        <Medal size={16} style={{ color: 'var(--accent)' }} />
        <div className="flex-1 min-w-0">
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

        {/* toggle Master / Minha representação */}
        {temToggle && (
          <div className="flex items-center gap-1.5">
            <Pill ativo={modoEfetivo === 'geral'} onClick={() => onModoChange('geral')}>🌎 Master</Pill>
            <Pill ativo={modoEfetivo === 'minha_empresa'} onClick={() => onModoChange('minha_empresa')}>🏢 {empresaNome}</Pill>
          </div>
        )}
      </div>

      {vazio ? (
        <p className="relative text-sm py-6 text-center" style={{ color: 'var(--muted-color)' }}>{vazioLabel || 'Nenhuma venda no período ainda'}</p>
      ) : (
        <div className="relative flex flex-col gap-5 sm:flex-row sm:gap-4">
          <Coluna titulo="Vendedores" emoji="🥇" itens={dados.vendedores} delayBase={0} />
          <Coluna titulo="Equipes" emoji="🛡️" itens={dados.equipes} delayBase={120} />
          {mostrarRepresentacoes && (
            <Coluna titulo="Representações" emoji="🏢" itens={dados.representacoes} delayBase={240} />
          )}
        </div>
      )}
    </div>
  )
}
