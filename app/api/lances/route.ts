import { createClient } from "@supabase/supabase-js"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { NextRequest, NextResponse } from "next/server"

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

    for (const cfg of (configsRecorrentes || [])) {
      const { data: existe } = await supabaseAdmin
        .from('lances_mensais')
        .select('id')
        .eq('lance_config_id', cfg.id)
        .eq('mes_referencia', mesRef)
        .maybeSingle()
      if (!existe) {
        // busca a assembleia atual do cliente (da venda)
        let dataAssembleia: string | null = null
        if (cfg.venda_id) {
          const { data: venda } = await supabaseAdmin.from('vendas').select('data_assembleia_entrada').eq('id', cfg.venda_id).single()
          dataAssembleia = venda?.data_assembleia_entrada || null
        }
        await supabaseAdmin.from('lances_mensais').insert({
          lance_config_id: cfg.id, empresa_id: cfg.empresa_id, cliente_id: cfg.cliente_id,
          vendedor_id: cfg.vendedor_id, equipe_id: cfg.equipe_id,
          mes_referencia: mesRef, data_assembleia: dataAssembleia, status: 'pendente',
        })
      }
    }

    // 2. LISTA os lances do mês atual (com escopo)
    let q = supabaseAdmin
      .from('lances_mensais')
      .select('*, lances_config(tipo, valor_percentual, observacao, recorrente), clientes(nome), usuarios:vendedor_id(nome)')
      .eq('mes_referencia', mesRef)

    if (me.role === 'master') { /* vê tudo */ }
    else if (['representante', 'adm'].includes(me.role)) q = q.eq('empresa_id', me.empresa_id)
    else if (me.role === 'supervisor') q = q.eq('equipe_id', me.equipe_id)
    else q = q.eq('vendedor_id', me.id)

    const { data: lances } = await q.order('criado_em', { ascending: false })

    return NextResponse.json({ mes_referencia: mesRef, lances: lances || [], meu_role: me.role })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
