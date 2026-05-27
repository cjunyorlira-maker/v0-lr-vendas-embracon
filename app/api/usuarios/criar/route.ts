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

const HIERARQUIA: Record<string, string[]> = {
  master: ['representante'],
  representante: ['adm', 'supervisor', 'vendedor'],
  adm: ['supervisor', 'vendedor'],
  supervisor: ['vendedor'],
  vendedor: [],
}

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies()
    const supabaseUser = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
    )
    const { data: { user: authUser } } = await supabaseUser.auth.getUser()
    if (!authUser) return NextResponse.json({ error: "Não autenticado" }, { status: 401 })

    const { data: criador } = await supabaseAdmin
      .from('usuarios')
      .select('id, role, empresa_id, equipe_id, ativo')
      .eq('auth_user_id', authUser.id)
      .single()

    if (!criador || !criador.ativo) {
      return NextResponse.json({ error: "Usuário não autorizado" }, { status: 403 })
    }

    const body = await req.json()
    let { nome, email, role, equipe_id, nome_empresa, logo_empresa_base64 } = body

    if (!nome || !email || !role) {
      return NextResponse.json({ error: "Campos obrigatórios: nome, email, role" }, { status: 400 })
    }

    nome = String(nome).trim()
    email = String(email).trim().toLowerCase()

    const rolesPermitidos = HIERARQUIA[criador.role] || []
    if (!rolesPermitidos.includes(role)) {
      return NextResponse.json({
        error: `Você (${criador.role}) não pode criar usuário com role '${role}'. Permitido: ${rolesPermitidos.join(', ') || 'nenhum'}`
      }, { status: 403 })
    }

    let empresa_id: string

    if (criador.role === 'master' && role === 'representante') {
      if (!nome_empresa || !String(nome_empresa).trim()) {
        return NextResponse.json({
          error: "Nome da empresa é obrigatório ao criar representante"
        }, { status: 400 })
      }

      let logo_url: string | null = null
      if (logo_empresa_base64) {
        try {
          const matches = String(logo_empresa_base64).match(/^data:(.+);base64,(.+)$/)
          if (matches) {
            const mimeType = matches[1]
            const base64Data = matches[2]
            const buffer = Buffer.from(base64Data, 'base64')
            const ext = mimeType.split('/')[1] || 'png'
            const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`

            const { data: upload, error: uploadError } = await supabaseAdmin.storage
              .from('logos-empresas')
              .upload(fileName, buffer, { contentType: mimeType, upsert: false })

            if (!uploadError && upload) {
              const { data: { publicUrl } } = supabaseAdmin.storage
                .from('logos-empresas')
                .getPublicUrl(fileName)
              logo_url = publicUrl
            }
          }
        } catch (e) {
          console.error('Erro upload logo:', e)
        }
      }

      const { data: empresaNova, error: empresaError } = await supabaseAdmin
        .from('empresas')
        .insert({ nome: String(nome_empresa).trim(), ativo: true, logo_url })
        .select('id')
        .single()

      if (empresaError || !empresaNova) {
        return NextResponse.json({ error: "Erro ao criar empresa: " + (empresaError?.message || '') }, { status: 500 })
      }
      empresa_id = empresaNova.id
    } else {
      if (!criador.empresa_id) {
        return NextResponse.json({ error: "Criador não tem empresa associada" }, { status: 400 })
      }
      empresa_id = criador.empresa_id
    }

    let equipe_final: string | null = equipe_id || null
    if (criador.role === 'supervisor' && role === 'vendedor') {
      equipe_final = criador.equipe_id
    }

    const senhaTemporaria = gerarSenhaTemporaria()

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: senhaTemporaria,
      email_confirm: true,
      user_metadata: { nome, role },
    })

    if (authError) {
      if (authError.message.includes('already')) {
        return NextResponse.json({ error: "Este email já está cadastrado" }, { status: 409 })
      }
      return NextResponse.json({ error: authError.message }, { status: 400 })
    }

    if (!authData.user) {
      return NextResponse.json({ error: "Erro ao criar usuário no auth" }, { status: 500 })
    }

    const { data: usuario, error: dbError } = await supabaseAdmin
      .from('usuarios')
      .insert({
        auth_user_id: authData.user.id,
        empresa_id,
        equipe_id: equipe_final,
        nome,
        email,
        role,
        ativo: true,
        senha_temporaria: true,
        criado_por: criador.id,
      })
      .select()
      .single()

    if (dbError) {
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id)
      return NextResponse.json({ error: dbError.message }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      usuario: { id: usuario.id, nome: usuario.nome, email: usuario.email, role: usuario.role },
      senha_temporaria: senhaTemporaria,
    })

  } catch (err) {
    console.error("Erro ao criar usuário:", err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
