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

export async function POST(req: Request) {
  try {
    const cookieStore = await cookies()
    const supabaseUser = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
    )
    const { data: { user: authUser } } = await supabaseUser.auth.getUser()
    if (!authUser) return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    const { data: me } = await supabaseAdmin.from('usuarios').select('id, role, empresa_id').eq('auth_user_id', authUser.id).single()
    if (!me) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 403 })

    // só gestão pode deletar
    if (!['master', 'representante', 'adm'].includes(me.role)) {
      return NextResponse.json({ error: "Seu cargo não pode deletar cotas" }, { status: 403 })
    }

    const body = await req.json()
    const { venda_id } = body
    if (!venda_id) return NextResponse.json({ error: "venda_id obrigatório" }, { status: 400 })

    // busca a venda pra checar empresa e cliente
    const { data: venda } = await supabaseAdmin.from('vendas').select('id, cliente_id, empresa_id').eq('id', venda_id).single()
    if (!venda) return NextResponse.json({ error: "Cota não encontrada" }, { status: 404 })

    // escopo: global pode tudo; senão só da própria empresa
    const { escopoGlobal } = await getEscopo(me)
    if (!escopoGlobal && venda.empresa_id !== me.empresa_id) {
      return NextResponse.json({ error: "Sem permissão para deletar essa cota" }, { status: 403 })
    }

    // apaga todo o rastro (filhos primeiro)
    const { data: cfgs } = await supabaseAdmin.from('lances_config').select('id').eq('venda_id', venda_id)
    for (const c of (cfgs || [])) {
      await supabaseAdmin.from('lances_mensais').delete().eq('lance_config_id', c.id)
    }
    await supabaseAdmin.from('lances_config').delete().eq('venda_id', venda_id)
    await supabaseAdmin.from('boletos').delete().eq('venda_id', venda_id)
    await supabaseAdmin.from('notificacoes').delete().eq('venda_id', venda_id)
    await supabaseAdmin.from('status_log').delete().eq('venda_id', venda_id)
    await supabaseAdmin.from('vendas').delete().eq('id', venda_id)

    // se foi a última cota do cliente, apaga o cliente também
    const clienteId = venda.cliente_id
    if (clienteId) {
      const { data: outrasCotas } = await supabaseAdmin.from('vendas').select('id').eq('cliente_id', clienteId).limit(1)
      if (!outrasCotas || outrasCotas.length === 0) {
        await supabaseAdmin.from('clientes').delete().eq('id', clienteId)
      }
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
