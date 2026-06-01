import { createClient } from "@supabase/supabase-js"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { getEscopo } from '@/lib/escopo'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

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

    // Monta filtro de escopo conforme o role (adm matriz tem escopo global, igual master)
    const { escopoGlobal } = await getEscopo(me)
    function aplicarEscopo(query: any) {
      if (escopoGlobal) return query
      if (['representante', 'adm'].includes(me.role)) return query.eq('empresa_id', me.empresa_id)
      if (me.role === 'supervisor') return query.eq('equipe_id', me.equipe_id)
      return query.eq('vendedor_id', me.id)
    }

    // Boletos por status
    let bq = supabaseAdmin.from('boletos').select('status, valor_boleto, data_proxima_cobranca, criado_em')
    bq = aplicarEscopo(bq)
    const { data: boletos } = await bq

    const lista = boletos || []
    const cont = (s: string) => lista.filter((b: any) => b.status === s).length

    // Vendido no mês (vendas criadas no mês atual)
    let vq = supabaseAdmin.from('vendas').select('valor_credito, criado_em, data_venda')
    vq = aplicarEscopo(vq)
    const { data: vendas } = await vq
    const agora = new Date()
    // usa o período de produção configurado (igual ranking/comissões); se não houver, usa o mês atual
    let periodoInicio: string, periodoFim: string
    const { data: cfgProd } = await supabaseAdmin.from('config_producao').select('data_inicio, data_fim').eq('id', 1).single()
    if (cfgProd?.data_inicio && cfgProd?.data_fim) {
      periodoInicio = cfgProd.data_inicio
      periodoFim = cfgProd.data_fim
    } else {
      const ag = new Date()
      periodoInicio = new Date(ag.getFullYear(), ag.getMonth(), 1).toISOString().slice(0, 10)
      periodoFim = ag.toISOString().slice(0, 10)
    }
    // filtra por data_venda dentro do período (data_venda é a data real do fechamento)
    const dentroPeriodo = (v: any) => {
      const d = v.data_venda || (v.criado_em ? v.criado_em.slice(0, 10) : null)
      return d && d >= periodoInicio && d <= periodoFim
    }
    const vendidoMes = (vendas || [])
      .filter(dentroPeriodo)
      .reduce((s: number, v: any) => s + (v.valor_credito || 0), 0)
    const vendasMesQtd = (vendas || []).filter(dentroPeriodo).length

    // Próximas cobranças (próximos 30 dias)
    let cq = supabaseAdmin.from('boletos')
      .select('data_proxima_cobranca, valor_boleto, clientes(nome), vendas(grupo, cota)')
      .not('data_proxima_cobranca', 'is', null)
    cq = aplicarEscopo(cq)
    const { data: cobrancas } = await cq
    const em30 = new Date(); em30.setDate(em30.getDate() + 30)
    const proximasCobrancas = (cobrancas || [])
      .filter((c: any) => { const d = new Date(c.data_proxima_cobranca); return d >= agora && d <= em30 })
      .sort((a: any, b: any) => new Date(a.data_proxima_cobranca).getTime() - new Date(b.data_proxima_cobranca).getTime())
      .slice(0, 8)
      .map((c: any) => ({
        data: c.data_proxima_cobranca,
        nome: c.clientes?.nome || '-',
        grupo: c.vendas?.grupo || '',
        cota: c.vendas?.cota || '',
        valor: c.valor_boleto || 0,
      }))

    return NextResponse.json({
      pendentes: cont('pendente'),
      solicitados: cont('solicitado'),
      aguardando_pagamento: cont('aguardando_pagamento'),
      aguardando_baixa: cont('aguardando_baixa'),
      efetivados: cont('efetivado'),
      vendido_mes: vendidoMes,
      vendas_mes_qtd: vendasMesQtd,
      proximas_cobrancas: proximasCobrancas,
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
