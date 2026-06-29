'use client'

import { useState, useEffect } from 'react'
import Sidebar from '@/components/Sidebar'
import Header from '@/components/Header'
import { Trophy, Loader2, Users, Building2, User, Medal } from 'lucide-react'

interface RankItem { posicao: number; nome: string; foto?: string; valor: number; qtd: number }

const fmtMoeda = (v: number) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

export default function RankingPage() {
  const [ranking, setRanking] = useState<RankItem[]>([])
  const [loading, setLoading] = useState(true)
  const [modo, setModo] = useState<'vendedor' | 'equipe' | 'representante'>('vendedor')
  const [role, setRole] = useState('')
  const [inicio, setInicio] = useState('')
  const [fim, setFim] = useState('')
  const [fEmpresa, setFEmpresa] = useState('')
  const [empresas, setEmpresas] = useState<any[]>([])
  const [periodoAtivo, setPeriodoAtivo] = useState<'producao' | 'semana' | 'ano'>('producao')

  useEffect(() => { loadData() }, [modo, fEmpresa])
  useEffect(() => {
    fetch('/api/usuarios/listar').then(r => r.json()).then(d => { if (d.empresas) setEmpresas(d.empresas) }).catch(() => {})
  }, [])

  async function loadData(customInicio?: string, customFim?: string) {
    setLoading(true)
    let url = `/api/ranking?modo=${modo}`
    if (customInicio && customFim) url += `&inicio=${customInicio}&fim=${customFim}`
    if (fEmpresa) url += `&empresa=${fEmpresa}`
    const res = await fetch(url)
    const data = await res.json()
    if (data.ranking) {
      setRanking(data.ranking)
      setRole(data.meu_role)
      if (data.periodo && periodoAtivo === 'producao') { setInicio(data.periodo.inicio); setFim(data.periodo.fim) }
    }
    setLoading(false)
  }

  function aplicarPeriodo(tipo: 'producao' | 'semana' | 'ano') {
    setPeriodoAtivo(tipo)
    if (tipo === 'semana') {
      const hoje = new Date(); const dia = hoje.getDay()
      const dom = new Date(hoje); dom.setDate(hoje.getDate() - dia)
      const sab = new Date(dom); sab.setDate(dom.getDate() + 6)
      const iso = (d: Date) => d.toISOString().slice(0, 10)
      setInicio(iso(dom)); setFim(iso(sab)); loadData(iso(dom), iso(sab))
    } else if (tipo === 'ano') {
      const ano = new Date().getFullYear()
      loadData(`${ano}-01-01`, `${ano}-12-31`)
      setInicio(`${ano}-01-01`); setFim(`${ano}-12-31`)
    } else {
      loadData()
    }
  }

  const podio = ranking.slice(0, 5)
  const resto = ranking.slice(5)

  const abas = [
    { k: 'vendedor', l: 'Vendedores', icon: User, roles: ['master', 'representante', 'adm', 'supervisor', 'vendedor'] },
    { k: 'equipe', l: 'Equipes', icon: Users, roles: ['master', 'representante', 'adm'] },
    { k: 'representante', l: 'Representantes', icon: Building2, roles: ['master'] },
  ].filter(a => a.roles.includes(role) || role === '')

  const medalCor = (pos: number) => pos === 1 ? '#FFD700' : pos === 2 ? '#C0C0C0' : pos === 3 ? '#CD7F32' : 'var(--muted-color)'

  return (
    <div className="relative min-h-screen font-sans">
      <Sidebar />
      <div className="relative lg:ml-60" style={{ zIndex: 1 }}>
        <Header title="Ranking" />
        <main className="mx-auto max-w-[1100px] px-6 py-8 lg:px-8">
          {/* Cabeçalho + período */}
          <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: 'rgba(212,175,55,0.15)', border: '1px solid rgba(212,175,55,0.25)' }}><Trophy size={18} style={{ color: 'var(--accent)' }} /></div>
              <div>
                <h2 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>Ranking de Produção</h2>
                <p className="text-xs" style={{ color: 'var(--muted-color)' }}>Por valor vendido</p>
              </div>
            </div>
            <div className="flex items-end gap-2">
              <div><label className="block text-[10px] mb-1" style={{ color: 'var(--muted-color)' }}>De</label><input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} className="rounded-lg px-2 py-1.5 text-xs outline-none" style={{ background: 'rgba(22,23,28,0.9)', border: '1px solid var(--border)', color: 'var(--text)' }} /></div>
              <div><label className="block text-[10px] mb-1" style={{ color: 'var(--muted-color)' }}>Até</label><input type="date" value={fim} onChange={(e) => setFim(e.target.value)} className="rounded-lg px-2 py-1.5 text-xs outline-none" style={{ background: 'rgba(22,23,28,0.9)', border: '1px solid var(--border)', color: 'var(--text)' }} /></div>
              <button onClick={() => loadData(inicio, fim)} className="rounded-lg px-3 py-1.5 text-xs font-semibold" style={{ background: 'rgba(212,175,55,0.12)', color: 'var(--accent)', border: '1px solid rgba(212,175,55,0.3)' }}>Aplicar</button>
            </div>
          </div>

          {/* Controles de período + empresa */}
          <div className="flex items-center gap-2 flex-wrap mb-4">
            <button onClick={() => aplicarPeriodo('producao')} className="rounded-lg px-3 py-1.5 text-xs font-medium" style={{ background: periodoAtivo === 'producao' ? 'rgba(212,175,55,0.15)' : 'rgba(255,255,255,0.03)', border: `1px solid ${periodoAtivo === 'producao' ? 'var(--accent)' : 'var(--border)'}`, color: periodoAtivo === 'producao' ? 'var(--accent)' : 'var(--muted-color)' }}>Produção</button>
            <button onClick={() => aplicarPeriodo('semana')} className="rounded-lg px-3 py-1.5 text-xs font-medium" style={{ background: periodoAtivo === 'semana' ? 'rgba(212,175,55,0.15)' : 'rgba(255,255,255,0.03)', border: `1px solid ${periodoAtivo === 'semana' ? 'var(--accent)' : 'var(--border)'}`, color: periodoAtivo === 'semana' ? 'var(--accent)' : 'var(--muted-color)' }}>Semana</button>
            <button onClick={() => aplicarPeriodo('ano')} className="rounded-lg px-3 py-1.5 text-xs font-medium" style={{ background: periodoAtivo === 'ano' ? 'rgba(212,175,55,0.15)' : 'rgba(255,255,255,0.03)', border: `1px solid ${periodoAtivo === 'ano' ? 'var(--accent)' : 'var(--border)'}`, color: periodoAtivo === 'ano' ? 'var(--accent)' : 'var(--muted-color)' }}>Ano (acumulado)</button>
            {empresas.length > 0 && (
              <select value={fEmpresa} onChange={(e) => setFEmpresa(e.target.value)} className="rounded-lg px-3 py-1.5 text-xs outline-none" style={{ background: 'rgba(22,23,28,0.9)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                <option value="" style={{ background: '#131313' }}>Todas as empresas</option>
                {empresas.map(e => <option key={e.id} value={e.id} style={{ background: '#131313' }}>{e.nome}</option>)}
              </select>
            )}
          </div>

          {/* Abas */}
          {abas.length > 1 && (
            <div className="flex gap-2 mb-6">
              {abas.map(a => {
                const Icon = a.icon; const ativo = modo === a.k
                return <button key={a.k} onClick={() => setModo(a.k as any)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-all" style={{ background: ativo ? 'rgba(212,175,55,0.15)' : 'rgba(255,255,255,0.03)', border: `1px solid ${ativo ? 'var(--accent)' : 'var(--border)'}`, color: ativo ? 'var(--accent)' : 'var(--muted-color)' }}><Icon size={14} />{a.l}</button>
              })}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-12"><Loader2 size={20} className="animate-spin" style={{ color: 'var(--accent)' }} /></div>
          ) : ranking.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2"><Trophy size={32} style={{ color: 'var(--muted-color)' }} /><p className="text-sm" style={{ color: 'var(--muted-color)' }}>Nenhuma venda no período</p></div>
          ) : (
            <>
              {/* Pódio TOP 5 */}
              <div className="space-y-2 mb-6">
                {podio.map((r) => (
                  <div key={r.posicao} className="flex items-center gap-4 rounded-xl p-4" style={{ background: r.posicao <= 3 ? `linear-gradient(90deg, ${medalCor(r.posicao)}15 0%, rgba(0,0,0,0.12) 100%)` : 'rgba(0,0,0,0.12)', backdropFilter: 'blur(4px)', border: `1px solid ${r.posicao <= 3 ? medalCor(r.posicao) + '40' : 'var(--border)'}` }}>
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-bold text-sm" style={{ background: r.posicao <= 3 ? medalCor(r.posicao) + '25' : 'rgba(255,255,255,0.05)', color: medalCor(r.posicao) }}>
                      {r.posicao <= 3 ? <Medal size={18} style={{ color: medalCor(r.posicao) }} /> : r.posicao}
                    </div>
                    {r.foto ? <img src={r.foto || "/placeholder.svg"} alt="" className="h-9 w-9 rounded-full object-cover" /> : <div className="h-9 w-9 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: 'rgba(212,175,55,0.15)', color: 'var(--accent)' }}>{r.nome.charAt(0)}</div>}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{r.nome}</p>
                      <p className="text-xs" style={{ color: 'var(--muted-color)' }}>{r.qtd} venda{r.qtd !== 1 ? 's' : ''}</p>
                    </div>
                    <span className="text-base font-bold" style={{ color: r.posicao <= 3 ? medalCor(r.posicao) : 'var(--text)' }}>{fmtMoeda(r.valor)}</span>
                  </div>
                ))}
              </div>

              {/* Resto da lista */}
              {resto.length > 0 && (
                <div className="space-y-1">
                  {resto.map((r) => (
                    <div key={r.posicao} className="flex items-center gap-3 rounded-lg px-4 py-2.5" style={{ background: 'rgba(22,23,28,0.9)', border: '1px solid var(--border)' }}>
                      <span className="text-xs font-bold w-6" style={{ color: 'var(--muted-color)' }}>{r.posicao}º</span>
                      <span className="flex-1 text-sm truncate" style={{ color: 'var(--text2)' }}>{r.nome}</span>
                      <span className="text-xs" style={{ color: 'var(--muted-color)' }}>{r.qtd} vd</span>
                      <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{fmtMoeda(r.valor)}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  )
}
