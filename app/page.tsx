import Sidebar from '@/components/Sidebar'
import Header from '@/components/Header'
import { FileText, Clock, CheckCircle, DollarSign, Target } from 'lucide-react'

const stats = [
  {
    label: 'Vendas Pendentes',
    value: '–',
    icon: FileText,
    color: '#f59e0b',
  },
  {
    label: 'Aguardando Pagto',
    value: '–',
    icon: Clock,
    color: '#f97316',
  },
  {
    label: 'Boletos Pagos',
    value: '–',
    icon: CheckCircle,
    color: '#22c55e',
  },
  {
    label: 'Vendido Mês',
    value: 'R$ 0',
    icon: DollarSign,
    color: '#d4af37',
  },
  {
    label: 'Lances Pendentes',
    value: '–',
    icon: Target,
    color: '#ef4444',
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
  icon: Icon,
  color,
}: {
  label: string
  value: string
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
            className="text-2xl font-bold"
            style={{ color: 'var(--text)', fontFamily: 'var(--font-mono)' }}
          >
            {value}
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
      <Sidebar />

      <div className="relative lg:ml-60" style={{ zIndex: 1 }}>
        <Header title="Dashboard" />

        <main className="mx-auto max-w-[1400px] px-6 py-8 lg:px-8">
          {/* Grid de 5 stat cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {stats.map((s) => (
              <StatCard key={s.label} {...s} />
            ))}
          </div>

          {/* Card de boas-vindas */}
          <div className="mt-6">
            <GlassCard>
              <div className="flex min-h-[200px] items-center justify-center p-8 text-center">
                <p className="text-sm" style={{ color: 'var(--muted-color)' }}>
                  Bem-vindo! Próximo passo: cadastrar primeira venda em{' '}
                  <span style={{ color: 'var(--accent)' }}>Nova Venda</span>
                </p>
              </div>
            </GlassCard>
          </div>
        </main>
      </div>
    </div>
  )
}
