import { createClient } from "@supabase/supabase-js"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { NextRequest, NextResponse } from "next/server"

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const PODE_DESATIVAR: Record<string, string[]> = {
  master: ['representante'],
  representante: ['adm', 'supervisor', 'vendedor'],
  adm: ['supervisor', 'vendedor'],
  supervisor: ['vendedor'],
  vendedor: [],
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: alvoId } = await params

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
      .select('id, role, empresa_id, equipe_id')
      .eq('auth_user_id', authUser.id)
      .single()

    if (!solicitante) return NextResponse.json({ error: "Não autorizado" }, { status: 403 })

    if (solicitante.id === alvoId) {
      return NextResponse.json({ error: "Você não pode desativar a si mesmo" }, { status: 400 })
    }

    const { data: alvo } = await supabaseAdmin
      .from('usuarios')
      .select('id, role, empresa_id, equipe_id, ativo, nome')
      .eq('id', alvoId)
      .single()

    if (!alvo) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 })

    const rolesPermitidos = PODE_DESATIVAR[solicitante.role] || []
    if (!rolesPermitidos.includes(alvo.role)) {
      return NextResponse.json({
        error: `Você não pode desativar usuário com role '${alvo.role}'`
      }, { status: 403 })
    }

    if (solicitante.role !== 'master') {
      if (alvo.empresa_id !== solicitante.empresa_id) {
        return NextResponse.json({ error: "Usuário fora do seu escopo" }, { status: 403 })
      }
      if (solicitante.role === 'supervisor' && alvo.equipe_id !== solicitante.equipe_id) {
        return NextResponse.json({ error: "Usuário fora da sua equipe" }, { status: 403 })
      }
    }

    const novoAtivo = !alvo.ativo
    const { error: updateError } = await supabaseAdmin
      .from('usuarios')
      .update({ ativo: novoAtivo })
      .eq('id', alvoId)

    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

    return NextResponse.json({
      success: true,
      novo_status: novoAtivo,
      message: `Usuário ${alvo.nome} ${novoAtivo ? 'reativado' : 'desativado'}`
    })

  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
