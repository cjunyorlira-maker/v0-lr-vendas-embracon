import { createClient } from "@supabase/supabase-js"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { NextRequest, NextResponse } from "next/server"

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// ── Regras fixas da campanha ──
const CAMPANHA_INICIO = '2026-05-22'
const CAMPANHA_FIM = '2026-07-31'

const LR = '4b4088bb-ab79-4a8f-8517-6b1fdc6b0fd1'      // LR Multimarcas — viagem: top 3 + supervisor
const MARQUES = '1be64a2b-2e15-416f-9eb9-8b0175d1c89f' // Grupo Marques — viagem: top 2 + supervisor
const GLR = 'f131525b-ce2b-4eb4-a282-8e5f4cc224f2'     // G.L.R Ribeirão — viagem: top 3 + supervisor
const EMPRESAS_CAMPANHA = [LR, MARQUES, GLR]
const TOP_VIAGEM: Record<string, number> = { [LR]: 3, [MARQUES]: 2, [GLR]: 3 }

const first = <T,>(x: T | T[] | null | undefined): T | undefined => (Array.isArray(x) ? x[0] : x || undefined)
const fmt = (v: number) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

export async function GET(req: NextRequest) {
  try {
    const cookieStore = await cookies()
    const supabaseUser = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
    )
    const { data: { user: authUser } } = await supabaseUser.auth.getUser()
    if (!authUser) return NextResponse.json({ error: "Não autenticado" }, { status: 401 })

    const { data: me } = await supabaseAdmin
      .from('usuarios').select('id, role, empresa_id').eq('auth_user_id', authUser.id).single()
    if (!me) return NextResponse.json({ error: "Não encontrado" }, { status: 404 })

    // Visibilidade: master OU usuário de empresa participante. Qualquer outro → 404 (não revela a rota).
    const podeVer = me.role === 'master' || (me.empresa_id && EMPRESAS_CAMPANHA.includes(me.empresa_id))
    if (!podeVer) return NextResponse.json({ error: "Não encontrado" }, { status: 404 })

    // Empresas participantes (nomes)
    const { data: empresasRaw } = await supabaseAdmin
      .from('empresas').select('id, nome').in('id', EMPRESAS_CAMPANHA)
    const nomeEmpresa = (id: string) => (empresasRaw || []).find((e: any) => e.id === id)?.nome || 'Empresa'

    // Equipes das empresas participantes (para supervisor da comitiva)
    const { data: equipesRaw } = await supabaseAdmin
      .from('equipes')
      .select('id, nome, empresa_id, supervisor_user_id, supervisor_nome')
      .in('empresa_id', EMPRESAS_CAMPANHA)
    const equipeInfo = new Map<string, any>((equipesRaw || []).map((e: any) => [e.id, e]))

    // Fotos dos supervisores
    const supIds = (equipesRaw || []).map((e: any) => e.supervisor_user_id).filter(Boolean)
    const { data: supsRaw } = supIds.length
      ? await supabaseAdmin.from('usuarios').select('id, nome, foto_url').in('id', supIds)
      : { data: [] as any[] }
    const supInfo = new Map<string, any>((supsRaw || []).map((s: any) => [s.id, s]))

    // Vendas do período das 3 empresas
    const { data: vendasRaw } = await supabaseAdmin
      .from('vendas')
      .select('valor_credito, vendedor_id, equipe_id, empresa_id, usuarios:vendedor_id(nome, foto_url, role), equipes(nome)')
      .in('empresa_id', EMPRESAS_CAMPANHA)
      .gte('data_venda', CAMPANHA_INICIO)
      .lte('data_venda', CAMPANHA_FIM)
    const vendas = (vendasRaw || []) as any[]

    // ── 1) MACBOOK: ranking de vendedores por empresa (exclui representações) ──
    type VAgg = { id: string; nome: string; foto?: string; valor: number; qtd: number }
    const porEmpVend = new Map<string, Map<string, VAgg>>()
    EMPRESAS_CAMPANHA.forEach(e => porEmpVend.set(e, new Map()))
    // agregações auxiliares para viagem
    const porEquipe = new Map<string, { id: string; nome: string; empresa_id: string; valor: number; qtd: number }>()

    for (const v of vendas) {
      const cred = v.valor_credito || 0
      const u = first<any>(v.usuarios)
      const ehRep = u?.role === 'representante'
      // macbook (por empresa, sem representações)
      if (v.vendedor_id && !ehRep && porEmpVend.has(v.empresa_id)) {
        const m = porEmpVend.get(v.empresa_id)!
        const it = m.get(v.vendedor_id) || { id: v.vendedor_id, nome: u?.nome || 'Vendedor', foto: u?.foto_url, valor: 0, qtd: 0 }
        it.valor += cred; it.qtd += 1; m.set(v.vendedor_id, it)
      }
      // equipes (viagem)
      if (v.equipe_id) {
        const eq = first<any>(v.equipes)
        const it = porEquipe.get(v.equipe_id) || { id: v.equipe_id, nome: eq?.nome || 'Equipe', empresa_id: v.empresa_id, valor: 0, qtd: 0 }
        it.valor += cred; it.qtd += 1; porEquipe.set(v.equipe_id, it)
      }
    }

    const macbook = EMPRESAS_CAMPANHA.map((empId) => {
      const arr = Array.from((porEmpVend.get(empId) || new Map()).values()).sort((a, b) => b.valor - a.valor)
      const lider = arr[0] || null
      const ranking = arr.slice(0, 5).map((it, i) => ({
        posicao: i + 1, nome: it.nome, foto: it.foto, valor: it.valor, qtd: it.qtd,
        dist_lider: lider ? Math.max(0, lider.valor - it.valor) : 0,
      }))
      const distMac = arr.length >= 2 ? arr[0].valor - arr[1].valor : 0 // distância do 2º ao 1º
      return { empresa_id: empId, empresa_nome: nomeEmpresa(empId), lider: lider ? { nome: lider.nome, foto: lider.foto, valor: lider.valor, qtd: lider.qtd } : null, ranking, dist_mac: distMac }
    })

    // ── 2) VIAGEM: disputa INTERNA de cada empresa — equipes brigam dentro da própria representação ──
    const viagemPorEmpresa = EMPRESAS_CAMPANHA.map((empId) => {
      // mini-ranking das equipes DESTA empresa
      const arr = Array.from(porEquipe.values())
        .filter(e => e.empresa_id === empId)
        .sort((a, b) => b.valor - a.valor)
      const lider = arr[0] || null
      const equipes = arr.map((e, i) => ({
        posicao: i + 1, id: e.id, nome: e.nome, valor: e.valor, qtd: e.qtd,
        dist_lider: lider ? Math.max(0, lider.valor - e.valor) : 0,
      }))

      // comitiva "quem embarca hoje": supervisão da equipe nº1 DA EMPRESA + top N vendedores DA EMPRESA
      const topEquipe = arr[0] || null
      const membros: any[] = []
      if (topEquipe) {
        const info = equipeInfo.get(topEquipe.id)
        if (info?.supervisor_user_id) {
          const s = supInfo.get(info.supervisor_user_id)
          membros.push({ nome: s?.nome || info.supervisor_nome || 'Supervisor', foto: s?.foto_url, papel: 'supervisor', equipe_nome: topEquipe.nome, valor: null })
        } else if (info?.supervisor_nome) {
          membros.push({ nome: info.supervisor_nome, foto: undefined, papel: 'supervisor', equipe_nome: topEquipe.nome, valor: null })
        }
      }
      const n = TOP_VIAGEM[empId] || 3
      const vends = Array.from((porEmpVend.get(empId) || new Map()).values()).sort((a, b) => b.valor - a.valor).slice(0, n)
      vends.forEach((v, i) => membros.push({ nome: v.nome, foto: v.foto, papel: 'vendedor', posicao: i + 1, valor: v.valor }))

      return {
        empresa_id: empId,
        empresa_nome: nomeEmpresa(empId),
        top_n: n,
        equipes,
        comitiva: { equipe_nome: topEquipe?.nome || null, membros },
      }
    })

    // ── 3) COUNTDOWN ──
    const hoje = new Date()
    const fimDate = new Date(CAMPANHA_FIM + 'T23:59:59')
    const diasRestantes = Math.max(0, Math.ceil((fimDate.getTime() - hoje.getTime()) / 86400000))

    // ── 4) PROVOCAÇÕES ──
    const provocacoes: string[] = []
    for (const mb of macbook) {
      if (mb.ranking.length >= 2) {
        provocacoes.push(`${mb.ranking[1].nome} está a ${fmt(mb.dist_mac)} de tomar o MacBook de ${mb.ranking[0].nome} 💻🔥`)
      }
    }
    // viagem: disputa interna de cada empresa (2ª equipe x 1ª da mesma representação)
    for (const ve of viagemPorEmpresa) {
      if (ve.equipes.length >= 2) {
        const dif = ve.equipes[0].valor - ve.equipes[1].valor
        provocacoes.push(`${ve.equipes[1].nome} precisa de ${fmt(dif)} para tomar a viagem da ${ve.equipes[0].nome} na ${ve.empresa_nome} ✈️`)
      }
    }
    provocacoes.push(`Faltam ${diasRestantes} dias. Uma venda muda tudo.`)

    return NextResponse.json({
      periodo: { inicio: CAMPANHA_INICIO, fim: CAMPANHA_FIM },
      countdown: { dias: diasRestantes, fim: fimDate.toISOString() },
      empresas: EMPRESAS_CAMPANHA.map(id => ({ id, nome: nomeEmpresa(id), top_viagem_n: TOP_VIAGEM[id] })),
      macbook,
      viagem: { empresas: viagemPorEmpresa },
      provocacoes,
      meu_role: me.role,
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
