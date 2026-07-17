import { createClient } from "@supabase/supabase-js"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { NextRequest, NextResponse } from "next/server"
import { getEscopo } from '@/lib/escopo'
import { calcularGamificacao, processarUltrapassagens } from '@/lib/ranking-gamificacao'

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
      .select('valor_credito, vendedor_id, equipe_id, empresa_id, data_venda, usuarios:vendedor_id(nome, foto_url, placeholder), equipes(nome), empresas(nome, logo_url)')
      .gte('data_venda', inicio)
      .lte('data_venda', fim)

    // escopo reutilizável (ranking do período + melhor da semana corrente compartilham as mesmas regras)
    const esc = await getEscopo(me)
    const aplicaEscopo = (qb: any) => {
      if (escopoGeral) return qb                                   // Ranking Geral: todas as empresas
      if (me.role === 'master') return qb                          // tudo
      if (esc.escopoGlobal) return qb                              // adm matriz vê tudo
      if (['representante', 'adm'].includes(me.role)) return qb.eq('empresa_id', me.empresa_id)
      // supervisor e vendedor veem a EMPRESA TODA em "Minha Operação" (equipe é papel dos filtros/modos, não do escopo)
      if (me.role === 'supervisor') return qb.eq('empresa_id', me.empresa_id)
      if (me.role === 'vendedor') return qb.eq('empresa_id', me.empresa_id)
      return qb
    }
    q = aplicaEscopo(q)
    // filtro manual de empresa não se aplica ao Ranking Geral (é sempre agregado de todas)
    if (filtroEmpresa && !escopoGeral) q = q.eq('empresa_id', filtroEmpresa)
    const { data: vendas } = await q
    const lista = (vendas || []) as any[]

    const nomeDe = (v: any, campo: string) => { const x = Array.isArray(v[campo]) ? v[campo][0] : v[campo]; return x }

    // ── agrupamento principal conforme o modo ──
    type Agg = { nome: string; foto?: string; valor: number; qtd: number; maior_venda: number; equipe_nome?: string; empresa_nome?: string; empresa_id?: string; logo?: string; vendedor_id?: string }
    const mapa = new Map<string, Agg>()
    // no modo equipe, vendas sem equipe_id ficam FORA do ranking (não viram uma "equipe" fantasma)
    const foraDoRanking = { vendas: 0, valor: 0 }
    for (const v of lista) {
      const cred = v.valor_credito || 0
      const u = nomeDe(v, 'usuarios'); const e = nomeDe(v, 'equipes'); const emp = nomeDe(v, 'empresas')
      let chave = '', nome = '', foto: string | undefined = undefined
      if (modo === 'vendedor') {
        if (u?.placeholder === true) continue // exclui apenas cadastros-representação (placeholder), não vendedores reais
        chave = v.vendedor_id || 'sem'; nome = u?.nome || 'Sem vendedor'; foto = u?.foto_url
      } else if (modo === 'equipe') {
        if (!v.equipe_id) { foraDoRanking.vendas += 1; foraDoRanking.valor += cred; continue } // sem equipe → não pontua
        chave = v.equipe_id; nome = e?.nome || 'Equipe'
      } else {
        chave = v.empresa_id || 'sem'; nome = emp?.nome || 'Sem empresa'
      }
      // sublinha por modo: vendedor → equipe + empresa | equipe → só empresa | empresa/representante → nada
      const subEquipe = modo === 'vendedor' ? e?.nome : undefined
      const subEmpresa = (modo === 'vendedor' || modo === 'equipe') ? emp?.nome : undefined
      if (!mapa.has(chave)) mapa.set(chave, { nome, foto, valor: 0, qtd: 0, maior_venda: 0, equipe_nome: subEquipe, empresa_nome: subEmpresa, empresa_id: v.empresa_id, logo: emp?.logo_url, vendedor_id: modo === 'vendedor' ? v.vendedor_id : undefined })
      const item = mapa.get(chave)!
      item.valor += cred; item.qtd += 1; item.maior_venda = Math.max(item.maior_venda, cred)
      if (modo === 'vendedor' && !item.equipe_nome && e?.nome) item.equipe_nome = e.nome
    }

    // modo representante: cada item é a EMPRESA (nome + logo de empresas), nunca o dono/representante

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
        vendedor_id: r.vendedor_id || null,
        rei_semana: false,
        streak_semanas: 0,
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

    // ── gamificação: rei da semana, streak, hall de recordes ──
    const game = await calcularGamificacao(supabaseAdmin, producoes)

    // ── CARDS DE DESTAQUE: melhor equipe/vendedor ACOMPANHAM o período selecionado ──
    // Mesmo intervalo (inicio/fim) já resolvido para o ranking (produção/semana/ano),
    // porém sempre sobre a OPERAÇÃO TODA (sem escopo/filtro de empresa) e excluindo placeholders.
    // O rótulo muda com o período: Mês (produção) | Semana | Ano.
    const periodoSufixo = periodoParam === 'semana' ? 'da Semana' : periodoParam === 'ano' ? 'do Ano' : 'do Mês'
    let fixos: {
      periodo_label: string
      melhor_equipe: { nome: string; empresa?: string; valor: number } | null
      melhor_representacao: { nome: string; logo?: string; valor: number } | null
      melhor_vendedor: { nome: string; foto?: string; equipe?: string; empresa?: string; valor: number } | null
      recordista: typeof game.recordes.melhor_producao_individual
    } = { periodo_label: periodoSufixo, melhor_equipe: null, melhor_representacao: null, melhor_vendedor: null, recordista: game.recordes.melhor_producao_individual }
    {
      const { data: vFix } = await supabaseAdmin
        .from('vendas')
        .select('valor_credito, vendedor_id, equipe_id, empresa_id, usuarios:vendedor_id(nome, foto_url, placeholder), equipes(nome), empresas(nome, logo_url)')
        .gte('data_venda', inicio).lte('data_venda', fim)
      const eqMap = new Map<string, { nome: string; empresa?: string; valor: number }>()
      const empMap = new Map<string, { nome: string; logo?: string; valor: number }>()
      const vendMap = new Map<string, { nome: string; foto?: string; equipe?: string; empresa?: string; valor: number }>()
      for (const v of (vFix || []) as any[]) {
        const cred = v.valor_credito || 0
        const u = nomeDe(v, 'usuarios'); const eq = nomeDe(v, 'equipes'); const emp = nomeDe(v, 'empresas')
        if (v.equipe_id) {
          const it = eqMap.get(v.equipe_id) || { nome: eq?.nome || 'Equipe', empresa: emp?.nome, valor: 0 }
          it.valor += cred; if (!it.empresa && emp?.nome) it.empresa = emp.nome; eqMap.set(v.equipe_id, it)
        }
        if (v.empresa_id) {
          const it = empMap.get(v.empresa_id) || { nome: emp?.nome || 'Representação', logo: emp?.logo_url, valor: 0 }
          it.valor += cred; if (!it.logo && emp?.logo_url) it.logo = emp.logo_url; empMap.set(v.empresa_id, it)
        }
        if (v.vendedor_id && u?.placeholder !== true) {
          const it = vendMap.get(v.vendedor_id) || { nome: u?.nome || 'Vendedor', foto: u?.foto_url, equipe: eq?.nome, empresa: emp?.nome, valor: 0 }
          it.valor += cred; if (!it.equipe && eq?.nome) it.equipe = eq.nome; vendMap.set(v.vendedor_id, it)
        }
      }
      fixos.melhor_equipe = Array.from(eqMap.values()).sort((a, b) => b.valor - a.valor)[0] || null
      fixos.melhor_representacao = Array.from(empMap.values()).sort((a, b) => b.valor - a.valor)[0] || null
      fixos.melhor_vendedor = Array.from(vendMap.values()).sort((a, b) => b.valor - a.valor)[0] || null
    }

    // marca coroa (rei geral + reis por empresa) e streak em cada item do ranking
    const reisSet = new Set(game.reis_ids)
    for (const item of ranking) {
      if (item.vendedor_id) {
        if (reisSet.has(item.vendedor_id)) item.rei_semana = true
        item.streak_semanas = game.streaks[item.vendedor_id] || 0
      }
    }

    // ── ultrapassagens: só na produção corrente (período = produção que contém hoje) ──
    const producaoCorrente = producoes.find(p => p.data_inicio <= hoje && p.data_fim >= hoje)
    const ehProducaoCorrente = !periodoParam && producao && producaoCorrente && producao.id === producaoCorrente.id
    if (ehProducaoCorrente && modo === 'vendedor') {
      const rankingParaSnap = ranking
        .filter(r => r.vendedor_id)
        .map(r => ({ vendedor_id: r.vendedor_id as string, nome: r.nome, posicao: r.posicao, valor: r.valor }))
      // não bloqueia a resposta se falhar
      try { await processarUltrapassagens(supabaseAdmin, producao!.id, rankingParaSnap) } catch {}
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
      rei_semana: game.rei_semana,
      semana_atual_lider: game.semana_atual_lider,
      // 3 cards fixos: sempre produção corrente + operação toda (independem de modo/período/escopo/filtro)
      fixos,
      // transparência (só modo equipe): total excluído por não ter equipe definida
      fora_do_ranking: foraDoRanking,
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
