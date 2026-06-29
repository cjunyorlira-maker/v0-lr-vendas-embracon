import { createClient } from "@supabase/supabase-js"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { getEscopo } from '@/lib/escopo'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export async function GET() {
  try {
    const cookieStore = await cookies()
    const supabaseUser = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
    )
    const { data: { user: authUser } } = await supabaseUser.auth.getUser()
    if (!authUser) return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    const { data: me } = await supabaseAdmin.from('usuarios').select('id, role, empresa_id, equipe_id').eq('auth_user_id', authUser.id).single()
    if (!me) return NextResponse.json({ error: "Sem usuário" }, { status: 403 })

    const { escopoGlobal } = await getEscopo(me)

    // grupos onde a LR tem cliente NO GERAL (define quais aparecem) + contagem por escopo
    const { data: vendasGlobais } = await supabaseAdmin
      .from('vendas').select('grupo').not('grupo', 'is', null).not('cliente_id', 'is', null)
    const gruposComCliente = new Set<string>()
    for (const v of (vendasGlobais || [])) { const g = String(v.grupo).trim(); if (g) gruposComCliente.add(g) }

    // contagem de clientes que ESTE usuário pode ver (respeita escopo)
    let q = supabaseAdmin.from('vendas').select('grupo, cliente_id, empresa_id, equipe_id, vendedor_id').not('grupo', 'is', null).not('cliente_id', 'is', null)
    if (escopoGlobal) { /* vê tudo */ }
    else if (me.role === 'representante' || me.role === 'adm') { if (me.empresa_id) q = q.eq('empresa_id', me.empresa_id) }
    else if (me.role === 'supervisor') { if (me.equipe_id) q = q.eq('equipe_id', me.equipe_id) }
    else if (me.role === 'vendedor') { q = q.eq('vendedor_id', me.id) }
    const { data: vendasEscopo } = await q
    const clientesPorGrupo: Record<string, Set<string>> = {}
    for (const v of (vendasEscopo || [])) {
      const g = String(v.grupo).trim()
      if (!clientesPorGrupo[g]) clientesPorGrupo[g] = new Set()
      if (v.cliente_id) clientesPorGrupo[g].add(v.cliente_id)
    }

    // info dos grupos (faixa, bem)
    const { data: gruposInfo } = await supabaseAdmin.from('assembleias_grupos_info').select('grupo, bem, faixa_credito')
    const infoDe: Record<string, any> = {}
    for (const gi of (gruposInfo || [])) infoDe[String(gi.grupo).trim()] = gi

    // calendário exato — próximas assembleias (vencimento >= hoje)
    const hoje = new Date().toISOString().slice(0, 10)
    const { data: cal } = await supabaseAdmin
      .from('calendario_grupo').select('grupo, data_assembleia, data_vencimento')
      .gte('data_vencimento', hoje).order('data_assembleia')

    // agrupa as próximas 3 de cada grupo com cliente
    const proximasPorGrupo: Record<string, { data_assembleia: string; data_vencimento: string }[]> = {}
    for (const c of (cal || [])) {
      const g = String(c.grupo).trim()
      if (!gruposComCliente.has(g)) continue
      if (!proximasPorGrupo[g]) proximasPorGrupo[g] = []
      if (proximasPorGrupo[g].length < 3) proximasPorGrupo[g].push({ data_assembleia: c.data_assembleia, data_vencimento: c.data_vencimento })
    }

    const grupos = Array.from(gruposComCliente).map(g => ({
      grupo: g,
      bem: infoDe[g]?.bem || '-',
      faixa_credito: infoDe[g]?.faixa_credito || null,
      total_clientes: (clientesPorGrupo[g]?.size || 0),
      proximas: proximasPorGrupo[g] || [],
    })).sort((a, b) => {
      const da = a.proximas[0]?.data_assembleia || '9999'
      const db = b.proximas[0]?.data_assembleia || '9999'
      return da.localeCompare(db)
    })

    return NextResponse.json({ grupos })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
