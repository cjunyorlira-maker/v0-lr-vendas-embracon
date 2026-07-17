import { createClient } from "@supabase/supabase-js"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { NextRequest, NextResponse } from "next/server"

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// POST: upload nova foto
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

    const { data: me } = await supabaseAdmin
      .from('usuarios')
      .select('id, role, empresa_id, foto_url')
      .eq('auth_user_id', authUser.id)
      .single()

    if (!me) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 })

    const body = await req.json()
    const { foto_base64, usuario_id } = body

    if (!foto_base64) {
      return NextResponse.json({ error: "Foto é obrigatória" }, { status: 400 })
    }

    // Alvo: por padrão o próprio usuário; se vier usuario_id, é uma foto de outro (gestor sobe pela equipe)
    let usuario = me as { id: string; foto_url: string | null }
    if (usuario_id && usuario_id !== me.id) {
      if (!['master', 'representante', 'adm'].includes(me.role)) {
        return NextResponse.json({ error: "Sem permissão para alterar a foto de outro usuário" }, { status: 403 })
      }
      const { data: alvo } = await supabaseAdmin
        .from('usuarios')
        .select('id, empresa_id, foto_url')
        .eq('id', usuario_id)
        .single()
      if (!alvo) return NextResponse.json({ error: "Usuário alvo não encontrado" }, { status: 404 })
      // representante/adm só podem alterar fotos de usuários da própria empresa
      if (me.role !== 'master' && alvo.empresa_id !== me.empresa_id) {
        return NextResponse.json({ error: "Esse usuário não é da sua empresa" }, { status: 403 })
      }
      usuario = { id: alvo.id, foto_url: alvo.foto_url }
    }

    const matches = String(foto_base64).match(/^data:(.+);base64,(.+)$/)
    if (!matches) {
      return NextResponse.json({ error: "Formato inválido" }, { status: 400 })
    }

    const mimeType = matches[1]
    const base64Data = matches[2]
    const buffer = Buffer.from(base64Data, 'base64')

    if (buffer.length > 2 * 1024 * 1024) {
      return NextResponse.json({ error: "Foto muito grande (máx 2MB)" }, { status: 400 })
    }

    const ext = mimeType.split('/')[1] || 'jpg'
    const fileName = `${usuario.id}-${Date.now()}.${ext}`

    const { error: uploadError } = await supabaseAdmin.storage
      .from('fotos-usuarios')
      .upload(fileName, buffer, { contentType: mimeType, upsert: true })

    if (uploadError) {
      return NextResponse.json({ error: "Erro upload: " + uploadError.message }, { status: 500 })
    }

    const { data: { publicUrl } } = supabaseAdmin.storage
      .from('fotos-usuarios')
      .getPublicUrl(fileName)

    // Atualiza usuario
    await supabaseAdmin
      .from('usuarios')
      .update({ foto_url: publicUrl })
      .eq('id', usuario.id)

    // Apaga foto antiga (se existir)
    if (usuario.foto_url) {
      try {
        const oldFileName = usuario.foto_url.split('/').pop()
        if (oldFileName && oldFileName !== fileName) {
          await supabaseAdmin.storage.from('fotos-usuarios').remove([oldFileName])
        }
      } catch {
        // ignora erro de cleanup
      }
    }

    return NextResponse.json({ success: true, foto_url: publicUrl })

  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// DELETE: remover foto atual
export async function DELETE() {
  try {
    const cookieStore = await cookies()
    const supabaseUser = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
    )
    const { data: { user: authUser } } = await supabaseUser.auth.getUser()
    if (!authUser) return NextResponse.json({ error: "Não autenticado" }, { status: 401 })

    const { data: usuario } = await supabaseAdmin
      .from('usuarios')
      .select('id, foto_url')
      .eq('auth_user_id', authUser.id)
      .single()

    if (!usuario) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 })

    // Apaga arquivo do storage
    if (usuario.foto_url) {
      try {
        const fileName = usuario.foto_url.split('/').pop()
        if (fileName) await supabaseAdmin.storage.from('fotos-usuarios').remove([fileName])
      } catch {}
    }

    // Limpa coluna no banco
    await supabaseAdmin
      .from('usuarios')
      .update({ foto_url: null })
      .eq('id', usuario.id)

    return NextResponse.json({ success: true })

  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
