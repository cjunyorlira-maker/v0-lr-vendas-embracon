import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const grupo = url.searchParams.get('grupo')
    if (!grupo) return NextResponse.json({ clientes: [] })

    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
    )
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ clientes: [] })
    const { data: me } = await supabaseAdmin.from('usuarios').select('id, role, empresa_id, equipe_id').eq('auth_user_id', user.id).single()
    if (!me) return NextResponse.json({ clientes: [] })

    let q = supabaseAdmin.from('vendas')
      .select('cota, cliente_id, vendedor_id, equipe_id, empresa_id, clientes(nome, telefone), usuarios:vendedor_id(nome)')
      .eq('grupo', grupo)

    // hierarquia: master/adm matriz veem tudo; representante a empresa; supervisor a equipe; vendedor os dele
    if (me.role === 'vendedor') q = q.eq('vendedor_id', me.id)
    else if (me.role === 'supervisor') q = q.eq('equipe_id', me.equipe_id)
    else if (['representante', 'adm'].includes(me.role)) q = q.eq('empresa_id', me.empresa_id)
    // master: sem filtro (vê todos)

    const { data: vendas } = await q
    const clientes = (vendas || []).map((v: any) => ({
      nome: v.clientes?.nome || '-',
      telefone: v.clientes?.telefone || null,
      cota: v.cota,
      vendedor: v.usuarios?.nome || '-',
    }))

    return NextResponse.json({ clientes })
  } catch (e) {
    return NextResponse.json({ clientes: [] })
  }
}
