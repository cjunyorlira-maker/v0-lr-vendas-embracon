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
    let q = supabaseAdmin.from('vendas').select('grupo, cliente_id, empresa_id, equipe_id, vendedor_id, empresas(nome)').not('grupo', 'is', null)
    // visibilidade: master/adm matriz veem tudo; representante/adm a empresa; supervisor a equipe; vendedor as dele
    if (escopoGlobal) {
      // vê tudo
    } else if (me.role === 'representante' || me.role === 'adm') {
      if (me.empresa_id) q = q.eq('empresa_id', me.empresa_id)
    } else if (me.role === 'supervisor') {
      if (me.equipe_id) q = q.eq('equipe_id', me.equipe_id)
    } else if (me.role === 'vendedor') {
      q = q.eq('vendedor_id', me.id)
    }
    const { data: vendas } = await q

    // grupos onde a LR tem cliente no GERAL (toda a operação) — define quais
    // grupos aparecem na tela. A contagem de clientes abaixo continua por escopo.
    const { data: vendasGlobais } = await supabaseAdmin
      .from('vendas')
      .select('grupo')
      .not('grupo', 'is', null)
      .not('cliente_id', 'is', null)
    const gruposComCliente = new Set<string>()
    for (const v of (vendasGlobais || [])) {
      const g = String(v.grupo).trim()
      if (g) gruposComCliente.add(g)
    }

    // empresas (pra nomes)
    const { data: empresas } = await supabaseAdmin.from('empresas').select('id, nome')
    const nomeEmpresa: Record<string, string> = {}
    for (const e of (empresas || [])) nomeEmpresa[e.id] = e.nome

    // agrupa clientes por grupo e por empresa, e registra empresas/equipes/vendedores de cada grupo (pro filtro)
    const clientesPorGrupo: Record<string, { total: Set<string>; porEmpresa: Record<string, Set<string>>; empresaIds: Set<string>; equipeIds: Set<string>; vendedorIds: Set<string> }> = {}
    for (const v of (vendas || [])) {
      const g = String(v.grupo).trim()
      if (!clientesPorGrupo[g]) clientesPorGrupo[g] = { total: new Set(), porEmpresa: {}, empresaIds: new Set(), equipeIds: new Set(), vendedorIds: new Set() }
      if (v.cliente_id) {
        clientesPorGrupo[g].total.add(v.cliente_id)
        const emp = v.empresa_id ? (nomeEmpresa[v.empresa_id] || 'Sem empresa') : 'Sem empresa'
        if (!clientesPorGrupo[g].porEmpresa[emp]) clientesPorGrupo[g].porEmpresa[emp] = new Set()
        clientesPorGrupo[g].porEmpresa[emp].add(v.cliente_id)
      }
      if (v.empresa_id) clientesPorGrupo[g].empresaIds.add(v.empresa_id)
      if (v.equipe_id) clientesPorGrupo[g].equipeIds.add(v.equipe_id)
      if (v.vendedor_id) clientesPorGrupo[g].vendedorIds.add(v.vendedor_id)
    }

    // monta a lista: TODOS os grupos mapeados (todos veem todos), contagem respeita visibilidade
    const infoMap: Record<string, any> = {}
    for (const gi of (gruposInfo || [])) infoMap[String(gi.grupo).trim()] = gi
    // a lista é SÓ os grupos onde a LR tem cliente (global). O catálogo
    // (assembleias_grupos_info) e o histórico só ENRIQUECEM esses grupos,
    // não criam linhas novas na tela.
    const todosGrupos = gruposComCliente

    const grupos = Array.from(todosGrupos).map(g => {
      const info = infoMap[g] || {}
      const hist = (historico || []).filter(h => String(h.grupo).trim() === g)
      const cpg = clientesPorGrupo[g] || { total: new Set(), porEmpresa: {}, empresaIds: new Set(), equipeIds: new Set(), vendedorIds: new Set() }
      // número da próxima assembleia: prazo_inicial - prazo_restante + 1
      let proxNum: number | null = null
      if (info.prazo_inicial != null && info.prazo_restante != null) {
        proxNum = info.prazo_inicial - info.prazo_restante + 1
      }
      const porEmpresa = Object.entries(cpg.porEmpresa).map(([nome, set]) => ({ empresa: nome, clientes: set.size })).sort((a, b) => b.clientes - a.clientes)
      return {
        empresa_ids: Array.from(cpg.empresaIds),
        equipe_ids: Array.from(cpg.equipeIds),
        vendedor_ids: Array.from(cpg.vendedorIds),
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

    // opções de filtro conforme o role
    let empresasOpc: any[] = [], equipesOpc: any[] = [], vendedoresOpc: any[] = []
    if (escopoGlobal) {
      const { data: emp } = await supabaseAdmin.from('empresas').select('id, nome').order('nome'); empresasOpc = emp || []
      const { data: eq } = await supabaseAdmin.from('equipes').select('id, nome, empresa_id').order('nome'); equipesOpc = eq || []
      const { data: vd } = await supabaseAdmin.from('usuarios').select('id, nome, empresa_id, equipe_id, role').in('role', ['vendedor','supervisor','representante']).order('nome'); vendedoresOpc = vd || []
    } else if (['representante','adm'].includes(me.role)) {
      const { data: eq } = await supabaseAdmin.from('equipes').select('id, nome, empresa_id').eq('empresa_id', me.empresa_id).order('nome'); equipesOpc = eq || []
      const { data: vd } = await supabaseAdmin.from('usuarios').select('id, nome, empresa_id, equipe_id, role').in('role', ['vendedor','supervisor']).eq('empresa_id', me.empresa_id).order('nome'); vendedoresOpc = vd || []
    } else if (me.role === 'supervisor') {
      const { data: vd } = await supabaseAdmin.from('usuarios').select('id, nome, empresa_id, equipe_id, role').eq('equipe_id', me.equipe_id).order('nome'); vendedoresOpc = vd || []
    }

    return NextResponse.json({ grupos, meu_role: me.role, filtros: { empresas: empresasOpc, equipes: equipesOpc, vendedores: vendedoresOpc } })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
