import { createClient } from "@supabase/supabase-js"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export async function POST(req: Request) {
  try {
    const cookieStore = await cookies()
    const supabaseUser = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
    )
    const { data: { user: authUser } } = await supabaseUser.auth.getUser()
    if (!authUser) return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    const { data: me } = await supabaseAdmin.from('usuarios').select('id, role, empresa_id').eq('auth_user_id', authUser.id).single()
    if (!me || !['master', 'representante'].includes(me.role)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 })

    const body = await req.json()
    const lista: { nome: string; email: string; role: string; equipe: string }[] = body.usuarios || []
    const empresaId = body.empresa_id || me.empresa_id
    if (!empresaId) return NextResponse.json({ error: "Empresa não definida" }, { status: 400 })

    // 1. cria as equipes únicas (que ainda não existem nessa empresa)
    const equipesNomes = [...new Set(lista.map(u => u.equipe).filter(Boolean))]
    const equipeIdPorNome: Record<string, string> = {}
    for (const nomeEq of equipesNomes) {
      const { data: existe } = await supabaseAdmin.from('equipes').select('id').eq('nome', nomeEq).eq('empresa_id', empresaId).maybeSingle()
      if (existe) { equipeIdPorNome[nomeEq] = existe.id; continue }
      const { data: nova } = await supabaseAdmin.from('equipes').insert({ nome: nomeEq, empresa_id: empresaId, ativo: true }).select('id').single()
      if (nova) equipeIdPorNome[nomeEq] = nova.id
    }

    // 2. cria os usuários (auth + tabela)
    const resultados: any[] = []
    for (const u of lista) {
      try {
        const email = u.email.trim().toLowerCase()
        // cria login no auth
        const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
          email, password: 'Mudarlr123', email_confirm: true,
        })
        if (authErr || !authData?.user) { resultados.push({ nome: u.nome, ok: false, erro: authErr?.message || 'auth' }); continue }
        // cria na tabela usuarios
        const { error: insErr } = await supabaseAdmin.from('usuarios').insert({
          nome: u.nome.trim(), email, role: u.role, empresa_id: empresaId,
          equipe_id: equipeIdPorNome[u.equipe] || null,
          auth_user_id: authData.user.id, ativo: true, senha_temporaria: true,
        })
        if (insErr) { resultados.push({ nome: u.nome, ok: false, erro: insErr.message }); continue }
        resultados.push({ nome: u.nome, ok: true })
      } catch (e) {
        resultados.push({ nome: u.nome, ok: false, erro: String(e) })
      }
    }

    const sucesso = resultados.filter(r => r.ok).length
    return NextResponse.json({ total: lista.length, sucesso, falhas: resultados.filter(r => !r.ok), equipes_criadas: equipesNomes.length })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
