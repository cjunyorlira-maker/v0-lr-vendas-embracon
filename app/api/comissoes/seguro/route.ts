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

async function getMe(authUserId: string) {
  const { data } = await supabaseAdmin.from('usuarios').select('id, role, empresa_id, equipe_id').eq('auth_user_id', authUserId).single()
  return data
}

async function autenticar() {
  const cookieStore = await cookies()
  const supabaseUser = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  )
  const { data: { user: authUser } } = await supabaseUser.auth.getUser()
  if (!authUser) return { erro: NextResponse.json({ error: "Não autenticado" }, { status: 401 }) }
  const me = await getMe(authUser.id)
  if (!me) return { erro: NextResponse.json({ error: "Usuário não encontrado" }, { status: 403 }) }
  if (!['master', 'representante'].includes(me.role)) {
    return { erro: NextResponse.json({ error: "Sem permissão" }, { status: 403 }) }
  }
  return { me }
}

// GET: lista vendas COM seguro + status de recebimento da comissão de seguro
export async function GET() {
  try {
    const { me, erro } = await autenticar()
    if (erro) return erro

    let q = supabaseAdmin
      .from('vendas')
      .select('id, valor_credito, grupo, cota, empresa_id, com_seguro, comissao_seguro_recebida, clientes(nome)')
      .eq('com_seguro', true)
      .order('criado_em', { ascending: false })

    const { escopoGlobal } = await getEscopo(me)
    if (!escopoGlobal) q = q.eq('empresa_id', me!.empresa_id)
    const { data: vendas } = await q

    const lista = (vendas || []).map((v: any) => {
      const cliente = Array.isArray(v.clientes) ? v.clientes[0] : v.clientes
      return {
        id: v.id,
        cliente_nome: cliente?.nome || null,
        grupo: v.grupo,
        cota: v.cota,
        valor_credito: v.valor_credito || 0,
        comissao_seguro_recebida: v.comissao_seguro_recebida || false,
      }
    })

    return NextResponse.json({ vendas: lista })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Erro" }, { status: 500 })
  }
}

// POST: marca/desmarca a comissão de seguro como recebida
export async function POST(req: NextRequest) {
  try {
    const { me, erro } = await autenticar()
    if (erro) return erro

    const { venda_id, recebida } = await req.json()
    if (!venda_id) return NextResponse.json({ error: "venda_id obrigatório" }, { status: 400 })

    // garante que a venda está no escopo do usuário
    const { escopoGlobal } = await getEscopo(me)
    let check = supabaseAdmin.from('vendas').select('id, empresa_id').eq('id', venda_id)
    if (!escopoGlobal) check = check.eq('empresa_id', me!.empresa_id)
    const { data: venda } = await check.single()
    if (!venda) return NextResponse.json({ error: "Venda não encontrada" }, { status: 404 })

    const { error } = await supabaseAdmin
      .from('vendas')
      .update({ comissao_seguro_recebida: !!recebida })
      .eq('id', venda_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Erro" }, { status: 500 })
  }
}
