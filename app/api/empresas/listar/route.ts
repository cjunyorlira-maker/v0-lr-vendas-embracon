import { createClient } from "@supabase/supabase-js"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"

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

    const { data: solicitante } = await supabaseAdmin
      .from('usuarios')
      .select('role')
      .eq('auth_user_id', authUser.id)
      .single()

    // Só master lista todas as empresas
    if (!solicitante || solicitante.role !== 'master') {
      return NextResponse.json({ error: "Apenas master" }, { status: 403 })
    }

    const { data: empresas } = await supabaseAdmin
      .from('empresas')
      .select('id, nome')
      .eq('ativo', true)
      .order('nome')

    return NextResponse.json({ empresas: empresas || [] })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
