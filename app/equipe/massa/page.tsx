'use client'
import { useState } from 'react'
import Sidebar from '@/components/Sidebar'
import Header from '@/components/Header'
import { Loader2, Upload, Check, X } from 'lucide-react'

const LISTA_INICIAL = `Yuri Ryan Pereira | supervisor | Elite
Gisely Leal | supervisor | Guerreiros
Alexia Cunha | supervisor | Super Nova
Leonardo Freitas | supervisor | Samurais
Janaina Dantas | supervisor | Legado
Alex Negreiros | supervisor | Lobos
Kleinver Seabra | supervisor | TDM
Nathan Caue | supervisor | Super Nova
Emily Machado | supervisor | TDM
Willy Santana | supervisor | Energy
Brayan | vendedor | Legado
Lucas Dionisio | vendedor | Lobos
Nicolas Moraes | vendedor | Legado
Amanda Souza | vendedor | TDM
Bianca da Silva | vendedor | TDM
Rafaella Antunes | vendedor | Guerreiros
Lidiane Fonseca | vendedor | Guerreiros
Ana Beatriz | vendedor | TDM
Gabrielly Pereira | vendedor | Legado
João Victor | vendedor | Samurais
Ana Gabrielly | vendedor | Lobos
Isabelly Ribeiro | vendedor | Lobos
Vitória Fernanda | vendedor | Energy
Luiz Miguel | vendedor | Samurais
Bárbara Rossato | vendedor | Super Nova
Raiane | vendedor | Elite`

function emailDe(nome: string): string {
  const n = nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  const partes = n.split(/\s+/)
  let base: string
  if (partes.length === 1) base = partes[0]
  else {
    const primeiro = partes[0]
    let sobrenome = ''
    for (const p of partes.slice(1)) { if (!['da','de','do','dos','das','e'].includes(p)) { sobrenome = p; break } }
    base = primeiro + sobrenome
  }
  return base + '@lrmultimarcas.com'
}

export default function CadastroMassa() {
  const [texto, setTexto] = useState(LISTA_INICIAL)
  const [processando, setProcessando] = useState(false)
  const [resultado, setResultado] = useState<any>(null)

  const linhas = texto.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
    const [nome, role, equipe] = l.split('|').map(s => s.trim())
    return { nome, role: (role || 'vendedor').toLowerCase(), equipe: equipe || '', email: emailDe(nome || '') }
  })

  async function criar() {
    setProcessando(true); setResultado(null)
    try {
      const res = await fetch('/api/usuarios/massa', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usuarios: linhas }) })
      const data = await res.json()
      setResultado(data)
    } catch (e) { setResultado({ error: String(e) }) }
    setProcessando(false)
  }

  return (
    <div className="relative min-h-screen font-sans">
      <Sidebar />
      <div className="relative lg:ml-60">
        <Header title="Cadastro em Massa" />
        <main className="mx-auto max-w-3xl px-6 py-8">
          <p className="text-sm mb-2" style={{ color: 'var(--muted-color)' }}>Um por linha, no formato: <code>Nome | cargo | equipe</code> (cargo = supervisor ou vendedor). Email gerado automático (nome+sobrenome@lrmultimarcas.com). Senha padrão: <strong>Mudarlr123</strong>.</p>
          <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={14} className="w-full rounded-lg px-3 py-2 text-xs font-mono outline-none mb-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', color: 'var(--text)' }} />
          <div className="rounded-lg p-3 mb-4 text-xs" style={{ background: 'rgba(0,0,0,0.12)', border: '1px solid var(--border)', color: 'var(--muted-color)' }}>
            <strong style={{ color: 'var(--text)' }}>{linhas.length} usuários</strong> · {[...new Set(linhas.map(l => l.equipe))].length} equipes · Prévia dos emails:
            <div className="mt-2 max-h-32 overflow-y-auto">
              {linhas.map((l, i) => <div key={i}>{l.email} · {l.role} · {l.equipe}</div>)}
            </div>
          </div>
          <button onClick={criar} disabled={processando} className="flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold disabled:opacity-50" style={{ background: 'linear-gradient(135deg, #d4af37 0%, #c9a227 50%, #b8941f 100%)', color: '#0a0a0a' }}>
            {processando ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}{processando ? 'Criando...' : `Criar ${linhas.length} usuários`}
          </button>
          {resultado && (
            <div className="mt-4 rounded-lg p-4" style={{ background: 'rgba(0,0,0,0.12)', border: '1px solid var(--border)' }}>
              {resultado.error ? <p className="text-sm" style={{ color: '#ef4444' }}>Erro: {resultado.error}</p> : (
                <>
                  <p className="text-sm font-semibold mb-2" style={{ color: '#22c55e' }}><Check size={14} className="inline" /> {resultado.sucesso} de {resultado.total} criados · {resultado.equipes_criadas} equipes</p>
                  {resultado.falhas?.length > 0 && (
                    <div className="text-xs" style={{ color: '#ef4444' }}>
                      <p className="font-medium mb-1"><X size={12} className="inline" /> Falhas:</p>
                      {resultado.falhas.map((f: any, i: number) => <div key={i}>{f.nome}: {f.erro}</div>)}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
