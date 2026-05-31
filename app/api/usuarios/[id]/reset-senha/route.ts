import { createClient } from "@supabase/supabase-js"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { NextRequest, NextResponse } from "next/server"
import { gerarSenhaTemporaria } from "@/lib/gerar-senha"

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const PODE_RESETAR: Record<string, string[]> = {
  master: ['representante', 'adm', 'supervisor', 'vendedor'],
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
      return NextResponse.json({
        error: "Para resetar sua própria senha, use 'Esqueci minha senha' no login"
      }, { status: 400 })
    }

    const { data: alvo } = await supabaseAdmin
      .from('usuarios')
      .select('id, role, empresa_id, equipe_id, auth_user_id, nome, email')
      .eq('id', alvoId)
      .single()

    if (!alvo) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 })
    if (!alvo.auth_user_id) return NextResponse.json({ error: "Usuário sem auth" }, { status: 400 })

    const ehProprio = solicitante.id === alvo.id
    const rolesPermitidos = PODE_RESETAR[solicitante.role] || []
    if (!ehProprio && !rolesPermitidos.includes(alvo.role)) {
      return NextResponse.json({
        error: `Você não pode resetar senha de '${alvo.role}'`
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

    const novaSenha = gerarSenhaTemporaria()

    const { error: updateAuthError } = await supabaseAdmin.auth.admin.updateUserById(
      alvo.auth_user_id,
      { password: novaSenha }
    )

    if (updateAuthError) {
      return NextResponse.json({ error: updateAuthError.message }, { status: 500 })
    }

    await supabaseAdmin
      .from('usuarios')
      .update({ senha_temporaria: true })
      .eq('id', alvoId)

    return NextResponse.json({
      success: true,
      email: alvo.email,
      nome: alvo.nome,
      senha_temporaria: novaSenha,
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
