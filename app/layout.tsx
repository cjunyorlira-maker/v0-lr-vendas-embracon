import type { Metadata, Viewport } from 'next'
import { Plus_Jakarta_Sans, JetBrains_Mono } from 'next/font/google'
import { Toaster } from '@/components/ui/sonner'
import { AnimatedBackground } from '@/components/ui/AnimatedBackground'
import './globals.css'

const plusJakarta = Plus_Jakarta_Sans({ 
  subsets: ["latin"],
  variable: '--font-sans',
  weight: ['400', '500', '600', '700', '800']
})

const jetbrains = JetBrains_Mono({ 
  subsets: ["latin"],
  variable: '--font-mono'
})

export const metadata: Metadata = {
  title: 'Master LR',
  description: 'Sistema de gestão de vendas — LR Multimarcas',
  icons: {
    icon: [
      { url: '/icon32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icon16.png', sizes: '16x16', type: 'image/png' },
      { url: '/icon192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: [{ url: '/icon180.png', sizes: '180x180' }],
  },
}

export const viewport: Viewport = {
  themeColor: '#0a0a0a',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="pt-BR">
      <body className={`${plusJakarta.variable} ${jetbrains.variable} font-sans antialiased`}>
        <AnimatedBackground />
        <div className="relative z-10">
          {children}
        </div>
        <Toaster />
      </body>
    </html>
  )
}
