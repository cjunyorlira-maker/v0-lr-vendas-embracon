import { createClient } from "@supabase/supabase-js"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// Retorna empresas/equipes/vendedores que o usuário logado pode atribuir
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
      .from('usuarios')
      .select('id, role, empresa_id, equipe_id')
      .eq('auth_user_id', authUser.id)
      .single()
    if (!me) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 403 })

    // Descobre se é "master ou adm da matriz" (empresa do master)
    let empresaMasterId: string | null = null
    const { data: masterUser } = await supabaseAdmin
      .from('usuarios')
      .select('empresa_id')
      .eq('role', 'master')
      .limit(1)
      .single()
    if (masterUser) empresaMasterId = masterUser.empresa_id

    const isMatriz = me.role === 'master' || (me.role === 'adm' && me.empresa_id === empresaMasterId)

    let empresas: any[] = []
    let equipes: any[] = []
    let vendedores: any[] = []

    if (isMatriz) {
      // vê todas as empresas
      const { data: emp } = await supabaseAdmin.from('empresas').select('id, nome').eq('ativo', true).order('nome')
      empresas = emp || []
      const { data: eq } = await supabaseAdmin.from('equipes').select('id, nome, empresa_id').order('nome')
      equipes = eq || []
      const { data: vd } = await supabaseAdmin.from('usuarios').select('id, nome, empresa_id, equipe_id, role').in('role', ['vendedor', 'supervisor']).order('nome')
      vendedores = vd || []
    } else if (['representante', 'adm'].includes(me.role)) {
      // só a empresa dele
      const { data: eq } = await supabaseAdmin.from('equipes').select('id, nome, empresa_id').eq('empresa_id', me.empresa_id).order('nome')
      equipes = eq || []
      const { data: vd } = await supabaseAdmin.from('usuarios').select('id, nome, empresa_id, equipe_id, role').in('role', ['vendedor', 'supervisor']).eq('empresa_id', me.empresa_id).order('nome')
      vendedores = vd || []
    } else if (me.role === 'supervisor') {
      // só vendedores da equipe dele
      const { data: vd } = await supabaseAdmin.from('usuarios').select('id, nome, empresa_id, equipe_id, role').in('role', ['vendedor', 'supervisor']).eq('equipe_id', me.equipe_id).order('nome')
      vendedores = vd || []
    }

    return NextResponse.json({
      meu_role: me.role,
      is_matriz: isMatriz,
      empresas,
      equipes,
      vendedores,
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
