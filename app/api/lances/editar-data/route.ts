import { createClient } from "@supabase/supabase-js"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { NextRequest, NextResponse } from "next/server"

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// Corrige a data de assembleia de um lance (mensal). Só master/representante/adm.
export async function POST(req: NextRequest) {
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
      .from('usuarios').select('id, role').eq('auth_user_id', authUser.id).single()
    if (!me) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 403 })
    if (!['master', 'representante', 'adm'].includes(me.role)) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 })
    }

    const { lanceId, novaData } = await req.json()
    if (!lanceId || !novaData) return NextResponse.json({ error: "lanceId e novaData são obrigatórios" }, { status: 400 })
    // valida formato YYYY-MM-DD
    if (!/^\d{4}-\d{2}-\d{2}$/.test(novaData)) return NextResponse.json({ error: "Data inválida" }, { status: 400 })

    // 1) atualiza o lance do mês
    const { data: lance, error: upErr } = await supabaseAdmin
      .from('lances_mensais')
      .update({ data_assembleia: novaData })
      .eq('id', lanceId)
      .select('lance_config_id')
      .single()
    if (upErr || !lance) return NextResponse.json({ error: upErr?.message || 'Lance não encontrado' }, { status: 500 })

    // 2) sincroniza a venda vinculada (para os próximos ciclos herdarem a data corrigida)
    if (lance.lance_config_id) {
      const { data: cfg } = await supabaseAdmin
        .from('lances_config').select('venda_id').eq('id', lance.lance_config_id).maybeSingle()
      if (cfg?.venda_id) {
        await supabaseAdmin.from('vendas').update({ data_assembleia_entrada: novaData }).eq('id', cfg.venda_id)
      }
    }

    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erro' }, { status: 500 })
  }
}
