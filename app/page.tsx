import AnimatedBackground from '@/components/ui/AnimatedBackground'
import Sidebar from '@/components/Sidebar'

export default function Home() {
  return (
    <div className="relative min-h-screen font-sans" style={{ background: 'var(--bg)' }}>
      <AnimatedBackground />

      <Sidebar />

      {/* Área principal */}
      <main
        className="relative min-h-screen lg:ml-60"
        style={{ zIndex: 1 }}
      >
        <div className="mx-auto max-w-[1400px] px-6 py-8 lg:px-8 lg:py-8">
          {/* Padding top mobile para o botão hamburguer */}
          <div className="pt-12 lg:pt-0 flex min-h-[calc(100vh-64px)] items-center justify-center">
            <div
              className="w-full max-w-lg rounded-2xl p-12 text-center shadow-2xl"
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
              }}
            >
              {/* Ícone decorativo */}
              <div
                className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl"
                style={{ background: 'var(--accent-bg2)', border: '1px solid var(--accent-bg2)' }}
              >
                <span
                  className="text-2xl font-bold"
                  style={{ color: 'var(--accent)', fontFamily: 'var(--font-jetbrains-mono)' }}
                >
                  LR
                </span>
              </div>

              <h1
                className="mb-3 text-3xl font-bold tracking-tight text-balance"
                style={{ color: 'var(--text)' }}
              >
                Em construção
              </h1>

              <p
                className="mb-4 text-base font-medium"
                style={{ color: 'var(--muted-color)' }}
              >
                Sistema LR Vendas Embracon — Setup inicial
              </p>

              <div
                className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-mono font-medium"
                style={{
                  background: 'var(--accent-bg)',
                  color: 'var(--accent)',
                  border: '1px solid var(--accent-bg2)',
                  fontFamily: 'var(--font-jetbrains-mono)',
                }}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full animate-pulse"
                  style={{ background: 'var(--accent)' }}
                />
                Etapa 0.1 — Base visual
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
