import { createClient } from "@supabase/supabase-js"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { NextRequest, NextResponse } from "next/server"

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export async function GET() {
  const { data } = await supabaseAdmin.from('config_producao').select('*').eq('id', 1).single()
  return NextResponse.json({ data_inicio: data?.data_inicio || null, data_fim: data?.data_fim || null })
}

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

    const { data: me } = await supabaseAdmin.from('usuarios').select('role').eq('auth_user_id', authUser.id).single()
    if (!me || me.role !== 'master') return NextResponse.json({ error: "Apenas master" }, { status: 403 })

    const body = await req.json()
    if (!body.data_inicio || !body.data_fim) return NextResponse.json({ error: "Informe início e fim" }, { status: 400 })

    await supabaseAdmin.from('config_producao').upsert({
      id: 1, data_inicio: body.data_inicio, data_fim: body.data_fim, atualizado_em: new Date().toISOString()
    }, { onConflict: 'id' })
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
