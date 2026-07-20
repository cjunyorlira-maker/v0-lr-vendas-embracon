import { createClient } from "@supabase/supabase-js"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { NextRequest, NextResponse } from "next/server"
import { getEscopo } from '@/lib/escopo'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

async function autenticar() {
  const cookieStore = await cookies()
  const supabaseUser = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  )
  const { data: { user: authUser } } = await supabaseUser.auth.getUser()
  if (!authUser) return { erro: NextResponse.json({ error: "Não autenticado" }, { status: 401 }) }
  const { data: me } = await supabaseAdmin
    .from('usuarios').select('id, role, empresa_id, equipe_id').eq('auth_user_id', authUser.id).single()
  if (!me) return { erro: NextResponse.json({ error: "Usuário não encontrado" }, { status: 403 }) }
  return { me }
}

// GET: lista avisos ativos (fixados primeiro), + flag de permissão de publicação
export async function GET() {
  try {
    const { me, erro } = await autenticar()
    if (erro) return erro
    const { escopoGlobal } = await getEscopo(me!)
    const { data: avisos } = await supabaseAdmin
      .from('avisos')
      .select('id, titulo, mensagem, tipo, fixado, criado_em')
      .eq('ativo', true)
      .order('fixado', { ascending: false })
      .order('criado_em', { ascending: false })
      .limit(30)
    return NextResponse.json({ avisos: avisos || [], pode_publicar: escopoGlobal })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// POST: criar aviso ou desativar. Só master OU adm da matriz (escopo global).
export async function POST(req: NextRequest) {
  try {
    const { me, erro } = await autenticar()
    if (erro) return erro
    const { escopoGlobal } = await getEscopo(me!)
    if (!escopoGlobal) return NextResponse.json({ error: "Sem permissão para publicar avisos" }, { status: 403 })

    const body = await req.json()
    const acao = body.acao || 'criar'

    if (acao === 'desativar') {
      if (!body.id) return NextResponse.json({ error: "ID obrigatório" }, { status: 400 })
      const { error } = await supabaseAdmin.from('avisos').update({ ativo: false }).eq('id', body.id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    // criar
    const titulo = (body.titulo || '').trim()
    const mensagem = (body.mensagem || '').trim()
    if (!titulo || !mensagem) return NextResponse.json({ error: "Título e mensagem são obrigatórios" }, { status: 400 })
    const { error } = await supabaseAdmin.from('avisos').insert({
      titulo, mensagem,
      tipo: body.tipo || 'geral',
      fixado: body.fixado === true,
      ativo: true,
      criado_por: me!.id,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
