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
    const { data: me } = await supabaseAdmin.from('usuarios').select('id, role, empresa_id, equipe_id').eq('auth_user_id', authUser.id).single()
    if (!me) return NextResponse.json({ error: "Sem usuário" }, { status: 403 })

    const { escopoGlobal } = await getEscopo(me)

    let q = supabaseAdmin.from('usuarios').select('*, empresa:empresas(nome)').order('criado_em', { ascending: false })
    if (!escopoGlobal && me.empresa_id) {
      if (me.role === 'supervisor') q = q.eq('equipe_id', me.equipe_id)
      else q = q.eq('empresa_id', me.empresa_id)
    }
    const { data: usuarios } = await q

    let eq = supabaseAdmin.from('equipes').select('id, nome, empresa_id').order('nome')
    if (!escopoGlobal && me.empresa_id) eq = eq.eq('empresa_id', me.empresa_id)
    const { data: equipes } = await eq

    let empresas: any[] = []
    if (escopoGlobal) {
      const { data: emp } = await supabaseAdmin.from('empresas').select('id, nome').order('nome')
      empresas = emp || []
    }

    return NextResponse.json({ usuarios: usuarios || [], equipes: equipes || [], empresas, escopoGlobal, meuRole: me.role, meuId: me.id, minhaEquipe: me.equipe_id })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
