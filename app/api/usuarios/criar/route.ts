import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"
import { gerarSenhaTemporaria } from "@/lib/gerar-senha"

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { nome, email, role, empresa_id, equipe_id, criado_por } = body

    // Validações básicas
    if (!nome || !email || !role || !empresa_id) {
      return NextResponse.json(
        { error: "Campos obrigatórios: nome, email, role, empresa_id" },
        { status: 400 }
      )
    }

    // Valida role permitido
    const rolesPermitidos = ['vendedor', 'supervisor', 'adm', 'representante']
    if (!rolesPermitidos.includes(role)) {
      return NextResponse.json(
        { error: `Role inválido. Permitidos: ${rolesPermitidos.join(', ')}` },
        { status: 400 }
      )
    }

    // Gera senha temporária
    const senhaTemporaria = gerarSenhaTemporaria()

    // Cria usuário no auth.users (precisa de service role key)
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: email.toUpperCase(),
      password: senhaTemporaria,
      email_confirm: true, // já confirma o email
      user_metadata: {
        nome,
        role,
      }
    })

    if (authError) {
      // Se usuário já existe no auth, retorna erro amigável
      if (authError.message.includes('already been registered')) {
        return NextResponse.json(
          { error: "Este email já está cadastrado no sistema" },
          { status: 409 }
        )
      }
      return NextResponse.json({ error: authError.message }, { status: 400 })
    }

    if (!authData.user) {
      return NextResponse.json({ error: "Erro ao criar usuário" }, { status: 500 })
    }

    // Insere na tabela usuarios
    const { data: usuario, error: dbError } = await supabaseAdmin
      .from("usuarios")
      .insert({
        auth_user_id: authData.user.id,
        empresa_id,
        equipe_id: equipe_id || null,
        nome,
        email: email.toUpperCase(),
        role,
        ativo: true,
        senha_temporaria: true,
        criado_por: criado_por || null,
      })
      .select()
      .single()

    if (dbError) {
      // Se falhou ao inserir na tabela, deleta do auth para manter consistência
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id)
      return NextResponse.json({ error: dbError.message }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      usuario: {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        role: usuario.role,
      },
      senha_temporaria: senhaTemporaria,
      message: `Usuário criado. Senha temporária: ${senhaTemporaria}`
    })

  } catch (err) {
    console.error("[v0] Erro ao criar usuário:", err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
