import { createClient } from "@supabase/supabase-js"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { getEscopo, getEmpresasAutonomas } from '@/lib/escopo'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export async function GET(req: Request) {
  try {
    const incluirAutonomas = new URL(req.url).searchParams.get('incluir_autonomas') === '1'
    const cookieStore = await cookies()
    const supabaseUser = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
    )
    const { data: { user: authUser } } = await supabaseUser.auth.getUser()
    if (!authUser) return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    const { data: me } = await supabaseAdmin.from('usuarios').select('id, role, empresa_id, equipe_id').eq('auth_user_id', authUser.id).single()
    if (!me) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 403 })

    const { escopoGlobal } = await getEscopo(me)

    let q = supabaseAdmin
      .from('boletos')
      .select('id, qtd_parcelas, valor_boleto, status, boleto_pdf_url, data_solicitacao, data_anexo_boleto, data_pagamento, data_aguardando_ted, extrato_url, extrato_nome, extrato_baixado, extrato_baixado_por, extrato_baixado_em, criado_em, pago_via_ted, empresa_id, equipe_id, vendedor_id, clientes(nome), vendas(numero_proposta, numero_contrato, grupo, cota, valor_credito, data_venda, observacoes), empresas(nome), equipes(nome), usuarios:vendedor_id(nome)')
      .order('criado_em', { ascending: false })

    // aplica escopo: global vê tudo; senão filtra pela empresa/equipe/vendedor
    if (!escopoGlobal) {
      if (['representante', 'adm'].includes(me.role)) q = q.eq('empresa_id', me.empresa_id)
      else if (me.role === 'supervisor') q = q.eq('equipe_id', me.equipe_id)
      else if (me.role === 'vendedor') q = q.eq('vendedor_id', me.id)
    }

    const { data } = await q

    // ISOLAMENTO: para a MATRIZ (master/adm matriz), os boletos de empresas autônomas
    // saem das listas/contadores/SLA por padrão. Toggle "incluir operações autônomas" para consulta.
    // O time da própria empresa autônoma continua vendo os seus (já restrito pelo escopo acima).
    const autonomasIds = await getEmpresasAutonomas()
    const autonomasSet = new Set(autonomasIds)
    let boletos = data || []
    let ocultos_autonomas = 0
    if (escopoGlobal && !incluirAutonomas && autonomasSet.size > 0) {
      const antes = boletos.length
      boletos = boletos.filter((b: any) => !(b.empresa_id && autonomasSet.has(b.empresa_id)))
      ocultos_autonomas = antes - boletos.length
    }

    return NextResponse.json({
      boletos,
      meu_role: me.role,
      escopo_global: escopoGlobal,
      tem_autonomas: autonomasSet.size > 0,
      incluindo_autonomas: incluirAutonomas,
      ocultos_autonomas,
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
