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

    if (!me?.empresa_id) return NextResponse.json({ empresa_nome: '', logo_url: null, logo_branca_url: null, marca_lr: false })

    const { data: emp } = await supabaseAdmin
      .from('empresas')
      .select('id, nome, logo_url, logo_branca_url')
      .eq('id', me.empresa_id)
      .single()

    // Grupo LR - SJC e G.L.R - Ribeirão compartilham a marca LR (logo LR nas duas telas)
    const MARCA_LR_IDS = [
      '4b4088bb-ab79-4a8f-8517-6b1fdc6b0fd1', // Grupo LR - SJC
      'f131525b-ce2b-4eb4-a282-8e5f4cc224f2', // G.L.R - Ribeirão
    ]
    const marca_lr = MARCA_LR_IDS.includes(emp?.id || '')

    return NextResponse.json({
      empresa_nome: emp?.nome || '',
      logo_url: emp?.logo_url || null,
      logo_branca_url: emp?.logo_branca_url || null,
      marca_lr,
    })
  } catch (e) {
    return NextResponse.json({ empresa_nome: '', logo_url: null, logo_branca_url: null, marca_lr: false })
  }
}
