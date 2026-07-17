import { createClient } from "@supabase/supabase-js"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { NextRequest, NextResponse } from "next/server"
import { getEscopo } from '@/lib/escopo'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const hojeISO = () => new Date().toISOString().slice(0, 10)
// segunda-feira da semana corrente (ISO week)
const inicioSemanaISO = () => {
  const d = new Date()
  const day = d.getDay() // 0=domingo .. 6=sábado
  const diff = day === 0 ? 6 : day - 1
  d.setDate(d.getDate() - diff)
  return d.toISOString().slice(0, 10)
}

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
      .from('usuarios').select('id, role, empresa_id, equipe_id').eq('auth_user_id', authUser.id).single()
    if (!me) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 403 })

    const { searchParams } = new URL(req.url)
    const modo = searchParams.get('modo') || 'vendedor' // vendedor | equipe | representante
    const filtroEmpresa = searchParams.get('empresa') || ''
    const producaoIdParam = searchParams.get('producao_id') || ''
    const periodoParam = searchParams.get('periodo') || '' // '' | 'semana' | 'ano'
    const escopoGeral = searchParams.get('escopo') === 'geral' // vê todas as empresas, ignora escopo por role

    // ── período vem da tabela producoes ──
    const { data: producoesRaw } = await supabaseAdmin
      .from('producoes')
      .select('id, nome, data_inicio, data_fim')
      .order('data_inicio', { ascending: false })
    const producoes = producoesRaw || []
    const hoje = hojeISO()

    // produção escolhida: ?producao_id, senão a que contém hoje, senão a mais recente
    let producao = producoes.find(p => p.id === producaoIdParam)
      || producoes.find(p => p.data_inicio <= hoje && p.data_fim >= hoje)
      || producoes[0]
      || null

    // período: semana/ano têm prioridade; senão a produção (ou overrides manuais)
    let inicio: string, fim: string, producaoAtiva: string | null
    if (periodoParam === 'semana') {
      inicio = inicioSemanaISO(); fim = hoje; producaoAtiva = null
    } else if (periodoParam === 'ano') {
      inicio = `${new Date().getFullYear()}-01-01`; fim = hoje; producaoAtiva = null
    } else {
      inicio = searchParams.get('inicio') || producao?.data_inicio || `${new Date().getFullYear()}-01-01`
      fim = searchParams.get('fim') || producao?.data_fim || `${new Date().getFullYear()}-12-31`
      producaoAtiva = producao?.id || null
    }

    // busca vendas no período (com escopo do usuário)
    let q = supabaseAdmin
      .from('vendas')
      .select('valor_credito, vendedor_id, equipe_id, empresa_id, data_venda, usuarios:vendedor_id(nome, foto_url, role), equipes(nome), empresas(nome, logo_url)')
      .gte('data_venda', inicio)
      .lte('data_venda', fim)

    if (escopoGeral) { /* Ranking Geral: qualquer autenticado vê todas as empresas */ }
    else if (me.role === 'master') { /* tudo */ }
    else if ((await getEscopo(me)).escopoGlobal) { /* adm matriz vê tudo */ }
    else if (['representante', 'adm'].includes(me.role)) q = q.eq('empresa_id', me.empresa_id)
    else if (me.role === 'supervisor') q = q.eq('equipe_id', me.equipe_id)
    else if (me.role === 'vendedor') q = q.eq('empresa_id', me.empresa_id)

    // filtro manual de empresa não se aplica ao Ranking Geral (é sempre agregado de todas)
    if (filtroEmpresa && !escopoGeral) q = q.eq('empresa_id', filtroEmpresa)
    const { data: vendas } = await q
    const lista = (vendas || []) as any[]

    const nomeDe = (v: any, campo: string) => { const x = Array.isArray(v[campo]) ? v[campo][0] : v[campo]; return x }

    // ── agrupamento principal conforme o modo ──
    // roles que NÃO são vendedores reais (usuários-representação: M Pereira, Ravi, Invest etc.)
    const ROLES_NAO_VENDEDOR = ['representante', 'adm', 'master']
    type Agg = { nome: string; foto?: string; valor: number; qtd: number; maior_venda: number; equipe_nome?: string; empresa_nome?: string; empresa_id?: string; logo?: string }
    const mapa = new Map<string, Agg>()
    for (const v of lista) {
      const cred = v.valor_credito || 0
      const u = nomeDe(v, 'usuarios'); const e = nomeDe(v, 'equipes'); const emp = nomeDe(v, 'empresas')
      let chave = '', nome = '', foto: string | undefined = undefined
      if (modo === 'vendedor') {
        if (u && ROLES_NAO_VENDEDOR.includes(u.role)) continue // exclui usuários-representação
        chave = v.vendedor_id || 'sem'; nome = u?.nome || 'Sem vendedor'; foto = u?.foto_url
      } else if (modo === 'equipe') {
        chave = v.equipe_id || 'sem'; nome = e?.nome || 'Sem equipe'
      } else {
        chave = v.empresa_id || 'sem'; nome = emp?.nome || 'Sem empresa'
      }
      if (!mapa.has(chave)) mapa.set(chave, { nome, foto, valor: 0, qtd: 0, maior_venda: 0, equipe_nome: e?.nome, empresa_nome: emp?.nome, empresa_id: v.empresa_id, logo: emp?.logo_url })
      const item = mapa.get(chave)!
      item.valor += cred; item.qtd += 1; item.maior_venda = Math.max(item.maior_venda, cred)
      if (!item.equipe_nome && e?.nome) item.equipe_nome = e.nome
    }

    // modo representante: troca o nome da empresa pelo nome do representante (mantém logo/empresa_id da bandeira)
    if (modo === 'representante') {
      const empresaIds = Array.from(mapa.keys()).filter(k => k !== 'sem')
      if (empresaIds.length > 0) {
        const { data: reps } = await supabaseAdmin.from('usuarios').select('nome, foto_url, empresa_id').eq('role', 'representante').in('empresa_id', empresaIds)
        for (const [chave, item] of mapa.entries()) {
          const rep = (reps || []).find((r: any) => r.empresa_id === chave)
          if (rep) { item.nome = rep.nome; item.foto = rep.foto_url }
        }
      }
    }

    const ranking = Array.from(mapa.values())
      .sort((a, b) => b.valor - a.valor)
      .map((r, i) => ({
        posicao: i + 1, nome: r.nome, foto: r.foto, valor: r.valor, qtd: r.qtd,
        ticket_medio: r.qtd > 0 ? r.valor / r.qtd : 0,
        maior_venda: r.maior_venda,
        equipe_nome: r.equipe_nome || null,
        empresa_nome: r.empresa_nome || null,
        empresa_id: r.empresa_id || null,
        logo: r.logo || null,
      }))

    // ── destaques (independentes do modo) ──
    const porEquipe = new Map<string, { nome: string; valor: number; qtd: number }>()
    const porEmpresa = new Map<string, { nome: string; valor: number; qtd: number }>()
    const porVendedor = new Map<string, { nome: string; foto?: string; valor: number; qtd: number }>()
    let maiorVendaUnica: { valor: number; vendedor: string; empresa: string } | null = null
    for (const v of lista) {
      const cred = v.valor_credito || 0
      const eq = nomeDe(v, 'equipes'); const emp = nomeDe(v, 'empresas'); const u = nomeDe(v, 'usuarios')
      if (v.equipe_id) {
        const it = porEquipe.get(v.equipe_id) || { nome: eq?.nome || 'Equipe', valor: 0, qtd: 0 }
        it.valor += cred; it.qtd += 1; porEquipe.set(v.equipe_id, it)
      }
      if (v.empresa_id) {
        const it = porEmpresa.get(v.empresa_id) || { nome: emp?.nome || 'Empresa', valor: 0, qtd: 0 }
        it.valor += cred; it.qtd += 1; porEmpresa.set(v.empresa_id, it)
      }
      if (v.vendedor_id) {
        const it = porVendedor.get(v.vendedor_id) || { nome: u?.nome || 'Vendedor', foto: u?.foto_url, valor: 0, qtd: 0 }
        it.valor += cred; it.qtd += 1; porVendedor.set(v.vendedor_id, it)
      }
      if (!maiorVendaUnica || cred > maiorVendaUnica.valor) {
        maiorVendaUnica = { valor: cred, vendedor: u?.nome || '—', empresa: emp?.nome || '—' }
      }
    }
    const topBy = <T extends { valor: number }>(m: Map<string, T>) =>
      Array.from(m.values()).sort((a, b) => b.valor - a.valor)[0] || null
    const topEquipe = topBy(porEquipe)
    const topEmpresa = topBy(porEmpresa)
    const maiorTicket = Array.from(porVendedor.values())
      .filter(v => v.qtd >= 2)
      .map(v => ({ nome: v.nome, foto: v.foto, ticket: v.valor / v.qtd, qtd: v.qtd }))
      .sort((a, b) => b.ticket - a.ticket)[0] || null

    const destaques = {
      top_equipe: topEquipe ? { nome: topEquipe.nome, valor: topEquipe.valor, qtd: topEquipe.qtd } : null,
      top_empresa: topEmpresa ? { nome: topEmpresa.nome, valor: topEmpresa.valor, qtd: topEmpresa.qtd } : null,
      maior_ticket: maiorTicket,
      maior_venda_unica: maiorVendaUnica,
    }

    return NextResponse.json({
      ranking,
      destaques,
      producoes,
      producao_ativa: producaoAtiva,
      periodo_tipo: periodoParam || null,
      periodo: { inicio, fim },
      modo,
      meu_role: me.role,
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
