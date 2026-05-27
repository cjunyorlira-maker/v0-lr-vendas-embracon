import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient()

    // Pega usuário logado
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    // Verifica permissão (apenas master/representante/adm podem)
    const { data: usuarioLogado } = await supabase
      .from('usuarios')
      .select('role')
      .eq('auth_user_id', user.id)
      .single()

    if (!usuarioLogado || !['master', 'representante', 'adm'].includes(usuarioLogado.role)) {
      return NextResponse.json({ error: 'Permissão negada' }, { status: 403 })
    }

    // Busca usuário alvo
    const { data: usuarioAlvo, error: fetchError } = await supabase
      .from('usuarios')
      .select('ativo')
      .eq('id', params.id)
      .single()

    if (fetchError || !usuarioAlvo) {
      return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 })
    }

    // Toggle ativo
    const { data, error: updateError } = await supabase
      .from('usuarios')
      .update({ ativo: !usuarioAlvo.ativo })
      .eq('id', params.id)
      .select('id, nome, email, ativo')
      .single()

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      usuario: data,
      message: `Usuário ${data.ativo ? 'ativado' : 'desativado'} com sucesso`,
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
