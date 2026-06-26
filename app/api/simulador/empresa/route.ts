import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'

const supabaseAdmin = createAdmin(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ empresa_nome: '', logo_url: null })

    const { data: me } = await supabaseAdmin
      .from('usuarios')
      .select('empresa_id')
      .eq('auth_user_id', user.id)
      .single()

    if (!me?.empresa_id) return NextResponse.json({ empresa_nome: '', logo_url: null })

    const { data: emp } = await supabaseAdmin
      .from('empresas')
      .select('nome, logo_url')
      .eq('id', me.empresa_id)
      .single()

    return NextResponse.json({ empresa_nome: emp?.nome || '', logo_url: emp?.logo_url || null })
  } catch (e) {
    return NextResponse.json({ empresa_nome: '', logo_url: null })
  }
}
