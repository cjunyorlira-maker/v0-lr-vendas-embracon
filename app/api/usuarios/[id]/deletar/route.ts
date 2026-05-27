import { createClient } from "@supabase/supabase-js"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { NextRequest, NextResponse } from "next/server"

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// Mesma hierarquia do toggle-ativo
const PODE_DELETAR: Record<string, string[]> = {
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

    // Não pode deletar a si mesmo
    if (solicitante.id === alvoId) {
      return NextResponse.json({ error: "Você não pode deletar a si mesmo" }, { status: 400 })
    }

    const { data: alvo } = await supabaseAdmin
      .from('usuarios')
      .select('id, role, empresa_id, equipe_id, auth_user_id, nome, ativo')
      .eq('id', alvoId)
      .single()

    if (!alvo) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 })

    // Valida hierarquia
    const rolesPermitidos = PODE_DELETAR[solicitante.role] || []
    if (!rolesPermitidos.includes(alvo.role)) {
      return NextResponse.json({
        error: `Você não pode deletar usuário com role '${alvo.role}'`
      }, { status: 403 })
    }

    // Valida escopo
    if (solicitante.role !== 'master') {
      if (alvo.empresa_id !== solicitante.empresa_id) {
        return NextResponse.json({ error: "Usuário fora do seu escopo" }, { status: 403 })
      }
      if (solicitante.role === 'supervisor' && alvo.equipe_id !== solicitante.equipe_id) {
        return NextResponse.json({ error: "Usuário fora da sua equipe" }, { status: 403 })
      }
    }

    // Recomenda desativar primeiro (se ainda estiver ativo)
    if (alvo.ativo) {
      return NextResponse.json({
        error: "Desative o usuário antes de deletar. Vá em 'Desativar' primeiro."
      }, { status: 400 })
    }

    // Checa se o usuário tem dados associados (proteção contra perda de histórico)
    const dependencias: string[] = []

    // Check vendedores
    const { count: vendedoresCount } = await supabaseAdmin
      .from('vendedores')
      .select('id', { count: 'exact', head: true })
      .eq('email', (await supabaseAdmin.from('usuarios').select('email').eq('id', alvoId).single()).data?.email || '')

    if (vendedoresCount && vendedoresCount > 0) {
      dependencias.push(`${vendedoresCount} registro(s) em vendedores`)
    }

    // Check usuários criados por ele
    const { count: criouCount } = await supabaseAdmin
      .from('usuarios')
      .select('id', { count: 'exact', head: true })
      .eq('criado_por', alvoId)

    if (criouCount && criouCount > 0) {
      dependencias.push(`${criouCount} outro(s) usuário(s) que ele criou`)
    }

    if (dependencias.length > 0) {
      return NextResponse.json({
        error: `Não é possível deletar. Esse usuário tem dados associados: ${dependencias.join(', ')}. Mantenha desativado para preservar o histórico.`
      }, { status: 400 })
    }

    // Tudo limpo, pode deletar
    // 1. Deleta da tabela usuarios
    const { error: deleteDbError } = await supabaseAdmin
      .from('usuarios')
      .delete()
      .eq('id', alvoId)

    if (deleteDbError) {
      return NextResponse.json({ error: "Erro ao deletar do banco: " + deleteDbError.message }, { status: 500 })
    }

    // 2. Deleta do auth (se tem auth_user_id)
    if (alvo.auth_user_id) {
      await supabaseAdmin.auth.admin.deleteUser(alvo.auth_user_id)
      // Se falhar o auth, não bloqueia (tabela já foi limpa)
    }

    return NextResponse.json({
      success: true,
      message: `Usuário ${alvo.nome} deletado permanentemente`
    })

  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
