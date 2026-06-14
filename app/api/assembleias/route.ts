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

    // info dos grupos (próxima assembleia, faixa)
    const { data: gruposInfo } = await supabaseAdmin.from('assembleias_grupos_info').select('*')
    // histórico completo (todos os meses)
    const { data: historico } = await supabaseAdmin.from('assembleias_historico').select('*').order('mes_referencia', { ascending: false })

    // vendas pra contar clientes por grupo (com escopo de visibilidade)
    let q = supabaseAdmin.from('vendas').select('grupo, cliente_id, empresa_id, empresas(nome)').not('grupo', 'is', null)
    // master/adm matriz veem tudo; os demais só a empresa deles
    if (!escopoGlobal && me.empresa_id) {
      q = q.eq('empresa_id', me.empresa_id)
    }
    const { data: vendas } = await q

    // empresas (pra nomes)
    const { data: empresas } = await supabaseAdmin.from('empresas').select('id, nome')
    const nomeEmpresa: Record<string, string> = {}
    for (const e of (empresas || [])) nomeEmpresa[e.id] = e.nome

    // agrupa clientes por grupo e por empresa
    const clientesPorGrupo: Record<string, { total: Set<string>; porEmpresa: Record<string, Set<string>> }> = {}
    for (const v of (vendas || [])) {
      const g = String(v.grupo).trim()
      if (!clientesPorGrupo[g]) clientesPorGrupo[g] = { total: new Set(), porEmpresa: {} }
      if (v.cliente_id) {
        clientesPorGrupo[g].total.add(v.cliente_id)
        const emp = v.empresa_id ? (nomeEmpresa[v.empresa_id] || 'Sem empresa') : 'Sem empresa'
        if (!clientesPorGrupo[g].porEmpresa[emp]) clientesPorGrupo[g].porEmpresa[emp] = new Set()
        clientesPorGrupo[g].porEmpresa[emp].add(v.cliente_id)
      }
    }

    // monta a lista de grupos: só os grupos onde temos cliente (após o filtro de escopo)
    const gruposComCliente = Object.keys(clientesPorGrupo)
    const infoMap: Record<string, any> = {}
    for (const gi of (gruposInfo || [])) infoMap[String(gi.grupo).trim()] = gi

    const grupos = gruposComCliente.map(g => {
      const info = infoMap[g] || {}
      const hist = (historico || []).filter(h => String(h.grupo).trim() === g)
      const cpg = clientesPorGrupo[g]
      // número da próxima assembleia: prazo_inicial - prazo_restante + 1
      let proxNum: number | null = null
      if (info.prazo_inicial != null && info.prazo_restante != null) {
        proxNum = info.prazo_inicial - info.prazo_restante + 1
      }
      const porEmpresa = Object.entries(cpg.porEmpresa).map(([nome, set]) => ({ empresa: nome, clientes: set.size })).sort((a, b) => b.clientes - a.clientes)
      return {
        grupo: g,
        bem: info.bem || hist[0]?.bem || '-',
        faixa_credito: info.faixa_credito || null,
        proxima_assembleia: info.proxima_assembleia || null,
        proxima_num_assembleia: proxNum,
        total_clientes: cpg.total.size,
        clientes_por_empresa: porEmpresa,
        tem_historico: hist.length > 0,
        historico: hist.map(h => ({
          mes_referencia: h.mes_referencia,
          mes_label: h.mes_label,
          numero_assembleia: h.numero_assembleia,
          sorteio_qt: h.sorteio_qt,
          lance_livre_qt: h.lance_livre_qt,
          lance_livre_maior: h.lance_livre_maior,
          lance_livre_menor: h.lance_livre_menor,
          lance_fixo_50_qt: h.lance_fixo_50_qt,
          lance_fixo_25_qt: h.lance_fixo_25_qt,
          total_contemplados: h.total_contemplados,
        })),
      }
    })

    return NextResponse.json({ grupos, meu_role: me.role })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
