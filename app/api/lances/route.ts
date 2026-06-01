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

function mesAtualRef(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// GET: lista lances do mês atual + gera os recorrentes que faltam
export async function GET() {
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

    const mesRef = mesAtualRef()

    // 1. GERA lances do mês pra configs recorrentes ativas que ainda não têm lance neste mês
    const { data: configsRecorrentes } = await supabaseAdmin
      .from('lances_config')
      .select('*')
      .eq('recorrente', true)
      .eq('ativo', true)
      .is('status_final', null)

    const hojeStr = new Date().toISOString().slice(0, 10)
    for (const cfg of (configsRecorrentes || [])) {
      const { data: existe } = await supabaseAdmin
        .from('lances_mensais')
        .select('id')
        .eq('lance_config_id', cfg.id)
        .eq('mes_referencia', mesRef)
        .maybeSingle()
      if (!existe) {
        // busca a assembleia do cliente
        let dataAssembleia: string | null = null
        if (cfg.venda_id) {
          const { data: venda } = await supabaseAdmin.from('vendas').select('data_assembleia_entrada').eq('id', cfg.venda_id).single()
          dataAssembleia = venda?.data_assembleia_entrada || null
        }
        // REGRA: só renova/gera o lance do novo mês se o cliente JÁ participou da assembleia
        // (se a assembleia ainda não passou, mantém o lance do mês anterior, não gera novo)
        const participou = dataAssembleia ? (dataAssembleia < hojeStr) : true
        if (!participou) continue

        // Recorrente nasce SOLICITADO (valor já definido); não-recorrente nasceria pendente
        const statusInicial = cfg.recorrente ? 'solicitado' : 'pendente'
        await supabaseAdmin.from('lances_mensais').insert({
          lance_config_id: cfg.id, empresa_id: cfg.empresa_id, cliente_id: cfg.cliente_id,
          vendedor_id: cfg.vendedor_id, equipe_id: cfg.equipe_id,
          mes_referencia: mesRef, data_assembleia: dataAssembleia, status: statusInicial,
        })
      }
    }

    // 2. LISTA os lances ATIVOS (não contemplados/cancelados), independente do mês.
    // Um lance solicitado/ofertado que ainda não foi pra assembleia continua valendo.
    let q = supabaseAdmin
      .from('lances_mensais')
      .select('*, lances_config(tipo, valor_percentual, observacao, recorrente, venda_id), clientes(nome), usuarios:vendedor_id(nome), equipes(nome)')
      .in('status', ['pendente', 'solicitado', 'ofertado'])
      .neq('contemplado', true)

    const { escopoGlobal } = await getEscopo(me)
    if (escopoGlobal) { /* master ou adm matriz: vê tudo */ }
    else if (['representante', 'adm'].includes(me.role)) q = q.eq('empresa_id', me.empresa_id)
    else if (me.role === 'supervisor') q = q.eq('equipe_id', me.equipe_id)
    else q = q.eq('vendedor_id', me.id)

    const { data: lances } = await q.order('criado_em', { ascending: false })

    // enriquece com grupo/cota/proposta da venda
    const vendaIds = (lances || []).map((l: any) => l.lances_config?.venda_id).filter(Boolean)
    let vendasMap: Record<string, any> = {}
    if (vendaIds.length > 0) {
      const { data: vendas } = await supabaseAdmin.from('vendas').select('id, grupo, cota, numero_proposta, numero_contrato').in('id', vendaIds)
      for (const v of (vendas || [])) vendasMap[v.id] = v
    }
    const lancesEnriq = (lances || []).map((l: any) => {
      const venda = l.lances_config?.venda_id ? vendasMap[l.lances_config.venda_id] : null
      return { ...l, grupo: venda?.grupo || null, cota: venda?.cota || null, numero_proposta: venda?.numero_proposta || venda?.numero_contrato || null }
    })
    // ordena por data de assembleia (mais próxima primeiro; sem data vai pro fim)
    lancesEnriq.sort((a: any, b: any) => {
      if (!a.data_assembleia) return 1
      if (!b.data_assembleia) return -1
      return new Date(a.data_assembleia).getTime() - new Date(b.data_assembleia).getTime()
    })

    // opções de filtro conforme o role
    let empresasOpc: any[] = [], equipesOpc: any[] = [], vendedoresOpc: any[] = []
    if (escopoGlobal) {
      const { data: emp } = await supabaseAdmin.from('empresas').select('id, nome').order('nome'); empresasOpc = emp || []
      const { data: eq } = await supabaseAdmin.from('equipes').select('id, nome, empresa_id').order('nome'); equipesOpc = eq || []
      const { data: vd } = await supabaseAdmin.from('usuarios').select('id, nome, empresa_id, equipe_id').in('role', ['vendedor', 'supervisor']).order('nome'); vendedoresOpc = vd || []
    } else if (['representante', 'adm'].includes(me.role)) {
      const { data: eq } = await supabaseAdmin.from('equipes').select('id, nome, empresa_id').eq('empresa_id', me.empresa_id).order('nome'); equipesOpc = eq || []
      const { data: vd } = await supabaseAdmin.from('usuarios').select('id, nome, empresa_id, equipe_id').in('role', ['vendedor', 'supervisor']).eq('empresa_id', me.empresa_id).order('nome'); vendedoresOpc = vd || []
    } else if (me.role === 'supervisor') {
      const { data: vd } = await supabaseAdmin.from('usuarios').select('id, nome, empresa_id, equipe_id').in('role', ['vendedor', 'supervisor']).eq('equipe_id', me.equipe_id).order('nome'); vendedoresOpc = vd || []
    }

    return NextResponse.json({
      mes_referencia: mesRef, lances: lancesEnriq, meu_role: me.role,
      filtros: { empresas: empresasOpc, equipes: equipesOpc, vendedores: vendedoresOpc },
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
