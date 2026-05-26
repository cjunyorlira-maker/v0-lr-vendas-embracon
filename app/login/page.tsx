"use client"

import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { AnimatedBackground } from "@/components/ui/AnimatedBackground"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { useState } from "react"

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    const supabase = createClient()
    setIsLoading(true)
    setError(null)

    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
      router.push("/")
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao fazer login")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#080808] flex items-center justify-center p-6 relative overflow-hidden">
      <AnimatedBackground />
      
      <div className="relative z-10 w-full max-w-md">
        <div className="bg-gradient-to-br from-white/[0.08] to-white/[0.03] backdrop-blur-xl border border-[rgba(212,175,55,0.2)] rounded-2xl p-8 shadow-2xl shadow-black/50">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-1 bg-gradient-to-r from-transparent via-[#d4af37] to-transparent rounded-full" />
          
          <div className="flex justify-center mb-8 mt-4">
            <Image src="/images/logo-lr.png" alt="LR Multimarcas" width={200} height={80} className="h-[70px] w-auto object-contain" priority />
          </div>
          
          <div className="text-center mb-8">
            <h1 className="font-serif text-2xl font-semibold text-[#f5f0e8] mb-2">Quadro de Reunioes</h1>
            <p className="text-sm text-[#8a8070]">Acesse com suas credenciais</p>
          </div>
          
          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm text-[#a09080]">E-mail</label>
              <Input id="email" type="email" placeholder="seu@email.com" required value={email} onChange={(e) => setEmail(e.target.value)}
                className="bg-black/40 border-[rgba(212,175,55,0.25)] text-[#f5f0e8] placeholder:text-[#5a5040] focus:border-[#d4af37] focus:ring-[#d4af37]/20 h-12 backdrop-blur-sm" />
            </div>
            
            <div className="space-y-2">
              <label htmlFor="password" className="text-sm text-[#a09080]">Senha</label>
              <Input id="password" type="password" placeholder="********" required value={password} onChange={(e) => setPassword(e.target.value)}
                className="bg-black/40 border-[rgba(212,175,55,0.25)] text-[#f5f0e8] placeholder:text-[#5a5040] focus:border-[#d4af37] focus:ring-[#d4af37]/20 h-12 backdrop-blur-sm" />
            </div>
            
            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3">
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}
            
            <Button type="submit" disabled={isLoading}
              className="w-full h-12 bg-gradient-to-r from-[#b8960c] via-[#d4af37] to-[#f0d060] hover:from-[#a08509] hover:via-[#c4a030] hover:to-[#e0c050] text-black font-semibold text-base shadow-lg shadow-[rgba(212,175,55,0.2)]">
              {isLoading ? "Entrando..." : "Entrar"}
            </Button>
          </form>
        </div>
        
        <p className="text-center text-xs text-[#5a5040] mt-6">Grupo LR Multimarcas</p>
      </div>
    </div>
  )
}
