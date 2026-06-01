import { createClient } from "@supabase/supabase-js"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export async function GET(req: Request) {
  try {
    const cookieStore = await cookies()
    const supabaseUser = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
    )
    const { data: { user: authUser } } = await supabaseUser.auth.getUser()
    if (!authUser) return NextResponse.json({ error: "Não autenticado" }, { status: 401 })

    const url = new URL(req.url)
    const configId = url.searchParams.get('config_id')
    if (!configId) return NextResponse.json({ error: "config_id obrigatório" }, { status: 400 })

    // todas as ofertas dessa config (ativas e encerradas), mais antiga primeiro
    const { data: ofertas } = await supabaseAdmin
      .from('lances_mensais')
      .select('id, mes_referencia, data_assembleia, status, contemplado, ciclo_encerrado, data_oferta, comprovante_url, comprovante_nome, justificativa_sem_comprovante')
      .eq('lance_config_id', configId)
      .order('data_assembleia', { ascending: true })

    return NextResponse.json({ ofertas: ofertas || [] })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
