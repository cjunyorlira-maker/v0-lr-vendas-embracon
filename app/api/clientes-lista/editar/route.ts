import { createClient } from "@supabase/supabase-js"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { NextRequest, NextResponse } from "next/server"

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

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
    const { data: me } = await supabaseAdmin.from('usuarios').select('id, role, empresa_id').eq('auth_user_id', authUser.id).single()
    if (!me || !['master', 'representante', 'adm', 'supervisor'].includes(me.role)) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 })
    }

    const body = await req.json()
    const { venda_id, vendedor_id, equipe_id } = body
    if (!venda_id) return NextResponse.json({ error: "venda_id obrigatório" }, { status: 400 })

    const upd: any = {}
    if (vendedor_id !== undefined) upd.vendedor_id = vendedor_id || null
    if (equipe_id !== undefined) upd.equipe_id = equipe_id || null

    const { error } = await supabaseAdmin.from('vendas').update(upd).eq('id', venda_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // também atualiza o boleto e o lance da venda (pra manter consistência nos filtros)
    if (Object.keys(upd).length > 0) {
      await supabaseAdmin.from('boletos').update(upd).eq('venda_id', venda_id)
      const { data: cfgs } = await supabaseAdmin.from('lances_config').select('id').eq('venda_id', venda_id)
      for (const c of (cfgs || [])) {
        await supabaseAdmin.from('lances_config').update(upd).eq('id', c.id)
        await supabaseAdmin.from('lances_mensais').update(upd).eq('lance_config_id', c.id)
      }
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
