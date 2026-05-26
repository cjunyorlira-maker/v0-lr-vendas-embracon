import { AnimatedBackground } from '@/components/ui/AnimatedBackground'
import Sidebar from '@/components/Sidebar'
import Header from '@/components/Header'
import { TrendingUp, DollarSign, Users, Target } from 'lucide-react'

const stats = [
  {
    label: 'Vendas na Semana',
    value: '–',
    sub: 'Aguardando dados',
    icon: TrendingUp,
    color: '#22c55e',
  },
  {
    label: 'Receita Gerada',
    value: '–',
    sub: 'Aguardando dados',
    icon: DollarSign,
    color: '#d4af37',
  },
  {
    label: 'Clientes Ativos',
    value: '–',
    sub: 'Aguardando dados',
    icon: Users,
    color: '#3b82f6',
  },
  {
    label: 'Meta do Mês',
    value: '–',
    sub: 'Aguardando dados',
    icon: Target,
    color: '#f59e0b',
  },
]

function GlassCard({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={className}
      style={{
        background: 'rgba(0,0,0,0.12)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        border: '1px solid var(--border)',
        borderRadius: '0.875rem',
      }}
    >
      {children}
    </div>
  )
}

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  color,
}: {
  label: string
  value: string
  sub: string
  icon: React.ElementType
  color: string
}) {
  return (
    <GlassCard>
      <div className="flex items-start justify-between p-5">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium" style={{ color: 'var(--muted-color)' }}>
            {label}
          </span>
          <span
            className="text-2xl font-bold font-mono"
            style={{ color: 'var(--text)', fontFamily: 'var(--font-jetbrains-mono)' }}
          >
            {value}
          </span>
          <span className="text-xs" style={{ color: 'var(--faint)' }}>
            {sub}
          </span>
        </div>
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
          style={{
            background: `${color}18`,
            border: `1px solid ${color}30`,
          }}
        >
          <Icon size={16} style={{ color }} />
        </div>
      </div>
    </GlassCard>
  )
}

export default function Home() {
  return (
    <div className="relative min-h-screen font-sans" style={{ background: 'var(--bg)' }}>
      <AnimatedBackground />
      <Sidebar />

      <div className="relative lg:ml-60" style={{ zIndex: 1 }}>
        <Header title="Dashboard" />

        <main className="mx-auto max-w-[1400px] px-6 py-8 lg:px-8">
          {/* Grid de stats */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {stats.map((s) => (
              <StatCard key={s.label} {...s} />
            ))}
          </div>

          {/* Área principal vazia — próximas etapas */}
          <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
            {/* Tabela de vendas */}
            <GlassCard className="lg:col-span-2">
              <div className="p-5">
                <div className="mb-4 flex items-center justify-between">
                  <h2
                    className="text-sm font-semibold"
                    style={{ color: 'var(--text)' }}
                  >
                    Vendas Recentes
                  </h2>
                  <span
                    className="rounded-full px-2.5 py-0.5 text-[11px] font-mono font-medium"
                    style={{
                      background: 'var(--accent-bg)',
                      color: 'var(--accent)',
                      border: '1px solid var(--accent-bg2)',
                      fontFamily: 'var(--font-jetbrains-mono)',
                    }}
                  >
                    Em desenvolvimento
                  </span>
                </div>
                <div
                  className="flex h-48 items-center justify-center rounded-lg"
                  style={{ background: 'rgba(255,255,255,0.02)', border: '1px dashed var(--border2)' }}
                >
                  <span className="text-xs" style={{ color: 'var(--faint)' }}>
                    Tabela de vendas — próxima etapa
                  </span>
                </div>
              </div>
            </GlassCard>

            {/* Ranking */}
            <GlassCard>
              <div className="p-5">
                <div className="mb-4 flex items-center justify-between">
                  <h2
                    className="text-sm font-semibold"
                    style={{ color: 'var(--text)' }}
                  >
                    Ranking
                  </h2>
                  <span
                    className="rounded-full px-2.5 py-0.5 text-[11px] font-mono font-medium"
                    style={{
                      background: 'var(--accent-bg)',
                      color: 'var(--accent)',
                      border: '1px solid var(--accent-bg2)',
                      fontFamily: 'var(--font-jetbrains-mono)',
                    }}
                  >
                    Em desenvolvimento
                  </span>
                </div>
                <div
                  className="flex h-48 items-center justify-center rounded-lg"
                  style={{ background: 'rgba(255,255,255,0.02)', border: '1px dashed var(--border2)' }}
                >
                  <span className="text-xs" style={{ color: 'var(--faint)' }}>
                    Top vendedores — próxima etapa
                  </span>
                </div>
              </div>
            </GlassCard>
          </div>
        </main>
      </div>
    </div>
  )
}
