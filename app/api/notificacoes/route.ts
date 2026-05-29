import { createClient } from "@supabase/supabase-js"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { NextRequest, NextResponse } from "next/server"

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// GET: lista notificações do usuário (próprias + as do role/empresa dele)
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
      .from('usuarios').select('id, role, empresa_id').eq('auth_user_id', authUser.id).single()
    if (!me) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 403 })

    // notificações direcionadas a ele (destinatario_id) OU ao role+empresa dele
    const { data: notifs } = await supabaseAdmin
      .from('notificacoes')
      .select('*')
      .or(`destinatario_id.eq.${me.id},and(destinatario_role.eq.${me.role},empresa_id.eq.${me.empresa_id})`)
      .order('criado_em', { ascending: false })
      .limit(30)

    const lista = notifs || []
    const naoLidas = lista.filter((n: any) => !n.lida).length

    return NextResponse.json({ notificacoes: lista, nao_lidas: naoLidas })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// POST: marca notificação(ões) como lida(s). body: { id } ou { todas: true }
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
      .from('usuarios').select('id, role, empresa_id').eq('auth_user_id', authUser.id).single()
    if (!me) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 403 })

    const body = await req.json().catch(() => ({}))

    if (body.todas) {
      // marca todas as do usuário como lidas
      await supabaseAdmin.from('notificacoes').update({ lida: true })
        .or(`destinatario_id.eq.${me.id},and(destinatario_role.eq.${me.role},empresa_id.eq.${me.empresa_id})`)
        .eq('lida', false)
    } else if (body.id) {
      await supabaseAdmin.from('notificacoes').update({ lida: true }).eq('id', body.id)
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
